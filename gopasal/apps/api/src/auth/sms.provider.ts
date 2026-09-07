import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { appendFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { mkdir } from 'node:fs/promises';
import type { AppConfig } from '../config/configuration';

/**
 * Swappable SMS transport. The concrete provider is chosen by `SMS_PROVIDER` and
 * resolved behind this token, so OTP code, staff invitations and onboarding
 * notifications never know which vendor is live.
 *
 * `send` either delivers or throws. There is deliberately no "best effort"
 * middle ground: a one-time code that was never sent must not be reported as
 * sent, or the customer sits waiting for a message while the API logged success.
 * Callers that can tolerate a failure (invitations, which also show a copyable
 * code in the console) catch it themselves and record the failure.
 */
export interface SmsProvider {
  /** Provider name as configured — used in logs and in the health payload. */
  readonly name: string;
  /** True when messages leave this machine. False for the development provider. */
  readonly delivers: boolean;
  send(to: string, message: string): Promise<void>;
}

export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

/** Nepal 10-digit local number → E.164, for gateways that require it. */
export function toE164Nepal(local: string): string {
  const digits = local.replace(/\D/g, '');
  return digits.startsWith('977') ? `+${digits}` : `+977${digits}`;
}

/**
 * Development transport. It does not pretend to deliver anything: `delivers` is
 * false, and the message — including the one-time code — is written to the API
 * log where the developer running `pnpm dev:api` can read it. That is the whole
 * mechanism. The code itself is still generated, hashed, expiring and
 * rate-limited exactly as in production, and it is still verified through the
 * same endpoint; nothing about the authentication flow is short-circuited.
 *
 * `validateConfig` refuses to start production with this provider selected.
 */
@Injectable()
export class LogSmsProvider implements SmsProvider {
  readonly name = 'log';
  readonly delivers = false;
  private readonly logger = new Logger('SMS:log');

  constructor(private readonly outboxFile?: string) {}

  async send(to: string, message: string): Promise<void> {
    // Boxed and on its own lines: an OTP buried in a one-line log entry between
    // Prisma queries is the thing developers waste minutes hunting for.
    this.logger.log(
      `\n  ┌─ SMS (development transport — NOT delivered) ────────────────\n` +
        `  │ to:   +977 ${to}\n` +
        `  │ text: ${message}\n` +
        `  └──────────────────────────────────────────────────────────────`,
    );
    if (this.outboxFile) await this.appendToOutbox(to, message);
  }

  /**
   * Optional JSONL outbox, off unless SMS_DEV_OUTBOX_FILE is set. It exists so an
   * end-to-end script can complete a login without a human reading the console.
   * Production configuration with this set is refused at boot — a file of live
   * one-time codes is exactly the thing not to keep.
   */
  private async appendToOutbox(to: string, message: string): Promise<void> {
    const file = this.outboxFile;
    if (!file) return;
    try {
      await mkdir(dirname(file), { recursive: true });
      await appendFile(file, `${JSON.stringify({ at: new Date().toISOString(), to, message })}\n`, 'utf8');
    } catch (err) {
      // The console already has the message; losing the copy is not worth
      // failing a login over, but it should not pass silently either.
      this.logger.warn(`could not write dev outbox ${file}: ${(err as Error).message}`);
    }
  }
}

/** Shared HTTP plumbing: a bounded request that reports its own failures. */
async function post(
  url: string,
  init: { headers: Record<string, string>; body: string },
  timeoutMs: number,
  label: string,
): Promise<{ status: number; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: init.headers,
      body: init.body,
      signal: controller.signal,
    });
    return { status: res.status, text: await res.text() };
  } catch (err) {
    const reason = err instanceof Error && err.name === 'AbortError' ? `timed out after ${timeoutMs}ms` : (err as Error).message;
    throw new ServiceUnavailableException(`${label}: ${reason}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sparrow SMS (Nepal) — the intended production gateway. Form-encoded POST to
 * /v2/sms/ with the account token, the approved sender identity, the local
 * 10-digit number and the text.
 *
 * Sparrow answers 200 with a JSON body that carries its own status, so a
 * successful HTTP call is not by itself a successful send; `response_code` is
 * checked as well. Anything unexpected throws — never a resolved promise.
 */
@Injectable()
export class SparrowSmsProvider implements SmsProvider {
  readonly name = 'sparrow';
  readonly delivers = true;
  private readonly logger = new Logger('SMS:sparrow');

  constructor(
    private readonly cfg: { token: string; from: string; url: string; timeoutMs: number },
  ) {}

  async send(to: string, message: string): Promise<void> {
    const body = new URLSearchParams({
      token: this.cfg.token,
      from: this.cfg.from,
      to,
      text: message,
    }).toString();

    const { status, text } = await post(
      this.cfg.url,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body },
      this.cfg.timeoutMs,
      'Sparrow SMS request failed',
    );

    if (status < 200 || status >= 300) {
      throw new ServiceUnavailableException(`Sparrow SMS rejected the request (HTTP ${status}): ${trim(text)}`);
    }
    const code = readResponseCode(text);
    if (code !== null && code !== 200) {
      throw new ServiceUnavailableException(`Sparrow SMS rejected the request (response_code ${code}): ${trim(text)}`);
    }
    this.logger.log(`delivered to ${mask(to)}`);
  }
}

/**
 * Twilio — the fallback gateway for numbers Sparrow will not carry, and the one
 * to use if a Nepali sender-ID approval is still pending. Standard Messages API:
 * Basic auth with the account SID and auth token, form-encoded To/From/Body.
 */
@Injectable()
export class TwilioSmsProvider implements SmsProvider {
  readonly name = 'twilio';
  readonly delivers = true;
  private readonly logger = new Logger('SMS:twilio');

  constructor(private readonly cfg: { sid: string; token: string; from: string; timeoutMs: number }) {}

  async send(to: string, message: string): Promise<void> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(this.cfg.sid)}/Messages.json`;
    const body = new URLSearchParams({
      To: toE164Nepal(to),
      From: this.cfg.from,
      Body: message,
    }).toString();
    const auth = Buffer.from(`${this.cfg.sid}:${this.cfg.token}`).toString('base64');

    const { status, text } = await post(
      url,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${auth}`,
        },
        body,
      },
      this.cfg.timeoutMs,
      'Twilio request failed',
    );

    if (status < 200 || status >= 300) {
      throw new ServiceUnavailableException(`Twilio rejected the request (HTTP ${status}): ${trim(text)}`);
    }
    this.logger.log(`queued for ${mask(to)}`);
  }
}

/** Sparrow returns `{"response_code":200,...}`; absent field ⇒ do not judge. */
function readResponseCode(text: string): number | null {
  try {
    const body = JSON.parse(text) as { response_code?: unknown };
    return typeof body.response_code === 'number' ? body.response_code : null;
  } catch {
    return null;
  }
}
/** Provider errors are logged and returned upward; never include the whole body. */
const trim = (s: string): string => s.replace(/\s+/g, ' ').slice(0, 200);
/** Never write a full subscriber number into a log line. */
const mask = (phone: string): string => `${phone.slice(0, 3)}xxxxx${phone.slice(-2)}`;

/**
 * Factory bound to SMS_PROVIDER. Credentials are asserted by `validateConfig`
 * at boot, so by the time this runs the selected provider's configuration is
 * complete; the assertions here exist because a DI factory that silently
 * substitutes a different provider is precisely the failure mode to avoid.
 */
export const smsProviderFactory = {
  provide: SMS_PROVIDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService<AppConfig, true>): SmsProvider => {
    const sms = config.get('sms', { infer: true });
    switch (sms.provider) {
      case 'sparrow':
        return new SparrowSmsProvider({
          token: required(sms.sparrow.token, 'SPARROW_SMS_TOKEN'),
          from: required(sms.sparrow.from, 'SPARROW_SMS_FROM'),
          url: sms.sparrow.url,
          timeoutMs: sms.timeoutMs,
        });
      case 'twilio':
        return new TwilioSmsProvider({
          sid: required(sms.twilio.sid, 'TWILIO_ACCOUNT_SID'),
          token: required(sms.twilio.token, 'TWILIO_AUTH_TOKEN'),
          from: required(sms.twilio.from, 'TWILIO_FROM'),
          timeoutMs: sms.timeoutMs,
        });
      case 'log':
        return new LogSmsProvider(sms.devOutboxFile);
      default: {
        // Unreachable via validateConfig; still explicit rather than defaulting
        // to the log provider, which would hide a typo behind working software.
        const name: string = sms.provider;
        throw new Error(`SMS_PROVIDER="${name}" is not implemented`);
      }
    }
  },
};

function required(value: string | undefined, variable: string): string {
  if (!value) throw new Error(`${variable} is required for the selected SMS_PROVIDER`);
  return value;
}
