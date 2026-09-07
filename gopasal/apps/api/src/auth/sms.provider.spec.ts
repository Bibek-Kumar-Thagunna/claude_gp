import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import type { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration';
import {
  LogSmsProvider,
  SMS_PROVIDER,
  type SmsProvider,
  SparrowSmsProvider,
  TwilioSmsProvider,
  smsProviderFactory,
  toE164Nepal,
} from './sms.provider';

/**
 * What matters about the SMS layer is not that it can format a request — it is
 * that it never resolves for a message it did not send, and that the development
 * transport is honest about not sending one. Both vendors are exercised against a
 * stubbed `fetch`, so these tests make no network call and need no credentials.
 */
interface Call {
  url: string;
  headers: Record<string, string>;
  body: URLSearchParams;
}

let restoreFetch: (() => void) | undefined;
afterEach(() => {
  restoreFetch?.();
  restoreFetch = undefined;
});

/** Replace global fetch with one that records the call and returns `reply`. */
function stubFetch(reply: { status: number; body: string } | Error): Call[] {
  const calls: Call[] = [];
  const original = globalThis.fetch;
  restoreFetch = () => {
    globalThis.fetch = original;
  };
  globalThis.fetch = ((input: string | URL, init?: RequestInit): Promise<Response> => {
    const raw = init?.body;
    // Both transports post a form-encoded string. Anything else is a real defect,
    // so it fails here rather than being coerced into '[object Object]'.
    assert.equal(typeof raw, 'string', 'SMS transports must send a string body');
    calls.push({
      url: String(input),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: new URLSearchParams(raw as string),
    });
    if (reply instanceof Error) return Promise.reject(reply);
    return Promise.resolve({
      status: reply.status,
      text: () => Promise.resolve(reply.body),
    } as unknown as Response);
  }) as typeof fetch;
  return calls;
}

const sparrow = (): SparrowSmsProvider =>
  new SparrowSmsProvider({
    token: 'sparrow-token',
    from: 'GoPasal',
    url: 'https://api.sparrowsms.com/v2/sms/',
    timeoutMs: 50,
  });

const twilio = (): TwilioSmsProvider =>
  new TwilioSmsProvider({ sid: 'AC123', token: 'auth-token', from: '+15550000000', timeoutMs: 50 });

describe('LogSmsProvider', () => {
  it('declares that it does not deliver, so callers cannot mistake it for a gateway', () => {
    const provider = new LogSmsProvider();
    assert.equal(provider.name, 'log');
    assert.equal(provider.delivers, false);
  });

  it('resolves without touching the network', async () => {
    const calls = stubFetch({ status: 200, body: '' });
    await new LogSmsProvider().send('9812345678', 'Your GoPasal code is 123456');
    assert.equal(calls.length, 0);
  });

  it('appends to the JSONL outbox only when one is configured', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gopasal-sms-'));
    const file = join(dir, 'nested', 'outbox.jsonl');
    await new LogSmsProvider(file).send('9812345678', 'code 111111');
    await new LogSmsProvider(file).send('9800000000', 'code 222222');
    const lines = (await readFile(file, 'utf8')).trim().split('\n');
    assert.equal(lines.length, 2);
    const first = JSON.parse(lines[0]) as { to: string; message: string; at: string };
    assert.equal(first.to, '9812345678');
    assert.equal(first.message, 'code 111111');
    assert.ok(!Number.isNaN(Date.parse(first.at)));
  });

  it('does not fail a login when the outbox cannot be written', async () => {
    // A directory where a file is expected: mkdir succeeds, appendFile cannot.
    const dir = await mkdtemp(join(tmpdir(), 'gopasal-sms-'));
    await assert.doesNotReject(() => new LogSmsProvider(dir).send('9812345678', 'code 333333'));
  });
});
describe('SparrowSmsProvider', () => {
  it('posts token, sender identity, local number and text, form-encoded', async () => {
    const calls = stubFetch({ status: 200, body: '{"response_code":200,"count":1}' });
    await sparrow().send('9812345678', 'Your GoPasal code is 123456');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://api.sparrowsms.com/v2/sms/');
    assert.equal(calls[0].headers['Content-Type'], 'application/x-www-form-urlencoded');
    assert.equal(calls[0].body.get('token'), 'sparrow-token');
    assert.equal(calls[0].body.get('from'), 'GoPasal');
    // Sparrow wants the local 10-digit number, not E.164.
    assert.equal(calls[0].body.get('to'), '9812345678');
    assert.equal(calls[0].body.get('text'), 'Your GoPasal code is 123456');
  });

  it('throws on a non-2xx response instead of reporting a send', async () => {
    stubFetch({ status: 401, body: 'invalid token' });
    await assert.rejects(() => sparrow().send('9812345678', 'x'), /HTTP 401/);
  });

  it('throws when the body carries a failing response_code despite HTTP 200', async () => {
    // The expensive bug this prevents: 200 OK, nothing delivered, login looks fine.
    stubFetch({ status: 200, body: '{"response_code":1607,"response":"No Credit Available"}' });
    await assert.rejects(() => sparrow().send('9812345678', 'x'), /response_code 1607/);
  });

  it('accepts a 2xx whose body it cannot judge', async () => {
    stubFetch({ status: 200, body: 'OK' });
    await assert.doesNotReject(() => sparrow().send('9812345678', 'x'));
  });

  it('reports a timeout as a timeout, with the bound that was exceeded', async () => {
    const aborted = new Error('This operation was aborted');
    aborted.name = 'AbortError';
    stubFetch(aborted);
    await assert.rejects(() => sparrow().send('9812345678', 'x'), /timed out after 50ms/);
  });

  it('keeps the failure attributable to the gateway', async () => {
    stubFetch(new Error('getaddrinfo ENOTFOUND api.sparrowsms.com'));
    await assert.rejects(() => sparrow().send('9812345678', 'x'), /Sparrow SMS request failed: getaddrinfo/);
  });

  it('truncates a hostile or huge error body rather than logging all of it', async () => {
    stubFetch({ status: 500, body: 'e'.repeat(5000) });
    await assert.rejects(
      () => sparrow().send('9812345678', 'x'),
      (err: Error) => {
        assert.ok(err.message.length < 300, `message was ${err.message.length} chars`);
        return true;
      },
    );
  });
});
describe('TwilioSmsProvider', () => {
  it('uses the account SID in the path, Basic auth, and an E.164 destination', async () => {
    const calls = stubFetch({ status: 201, body: '{"sid":"SM1","status":"queued"}' });
    await twilio().send('9812345678', 'Your GoPasal code is 123456');
    assert.equal(calls[0].url, 'https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json');
    assert.equal(
      calls[0].headers.Authorization,
      `Basic ${Buffer.from('AC123:auth-token').toString('base64')}`,
    );
    assert.equal(calls[0].body.get('To'), '+9779812345678');
    assert.equal(calls[0].body.get('From'), '+15550000000');
    assert.equal(calls[0].body.get('Body'), 'Your GoPasal code is 123456');
  });

  it('throws on a rejected request', async () => {
    stubFetch({ status: 400, body: '{"code":21608,"message":"unverified number"}' });
    await assert.rejects(() => twilio().send('9812345678', 'x'), /Twilio rejected the request \(HTTP 400\)/);
  });

  it('reports a timeout without leaking the auth header into the message', async () => {
    const aborted = new Error('aborted');
    aborted.name = 'AbortError';
    stubFetch(aborted);
    await assert.rejects(
      () => twilio().send('9812345678', 'x'),
      (err: Error) => {
        assert.match(err.message, /Twilio request failed: timed out after 50ms/);
        assert.ok(!err.message.includes('auth-token'));
        return true;
      },
    );
  });
});

describe('toE164Nepal', () => {
  it('adds the country code to a local 10-digit number', () => {
    assert.equal(toE164Nepal('9812345678'), '+9779812345678');
  });

  it('does not double the country code, however the number was typed', () => {
    assert.equal(toE164Nepal('9779812345678'), '+9779812345678');
    assert.equal(toE164Nepal('+977 98-1234 5678'), '+9779812345678');
    assert.equal(toE164Nepal('981 234 5678'), '+9779812345678');
  });
});
// MARKER-SMS-SPEC

/** ConfigService stand-in: the factory only ever reads the `sms` section. */
const configWith = (sms: AppConfig['sms']): ConfigService<AppConfig, true> =>
  ({ get: () => sms }) as unknown as ConfigService<AppConfig, true>;

const smsConfig = (over: Partial<AppConfig['sms']> = {}): AppConfig['sms'] => ({
  provider: 'log',
  sparrow: { url: 'https://api.sparrowsms.com/v2/sms/' },
  twilio: {},
  timeoutMs: 10000,
  ...over,
});

const build = (over: Partial<AppConfig['sms']> = {}): SmsProvider =>
  smsProviderFactory.useFactory(configWith(smsConfig(over)));

describe('smsProviderFactory', () => {
  it('binds one token, which is what makes sign-in, onboarding and invitations share a gateway', () => {
    assert.equal(smsProviderFactory.provide, SMS_PROVIDER);
  });

  it('selects the development transport by default', () => {
    const provider = build();
    assert.ok(provider instanceof LogSmsProvider);
    assert.equal(provider.delivers, false);
  });

  it('selects Sparrow when configured', () => {
    const provider = build({ provider: 'sparrow', sparrow: { token: 't', from: 'GoPasal', url: 'https://x/' } });
    assert.ok(provider instanceof SparrowSmsProvider);
    assert.equal(provider.delivers, true);
  });

  it('selects Twilio when configured', () => {
    const provider = build({ provider: 'twilio', twilio: { sid: 'AC1', token: 'k', from: '+1555' } });
    assert.ok(provider instanceof TwilioSmsProvider);
  });

  it('refuses to construct a vendor provider with a missing credential', () => {
    assert.throws(
      () => build({ provider: 'sparrow', sparrow: { from: 'GoPasal', url: 'https://x/' } }),
      /SPARROW_SMS_TOKEN is required/,
    );
    assert.throws(
      () => build({ provider: 'sparrow', sparrow: { token: 't', url: 'https://x/' } }),
      /SPARROW_SMS_FROM is required/,
    );
    assert.throws(() => build({ provider: 'twilio', twilio: { token: 'k', from: '+1' } }), /TWILIO_ACCOUNT_SID/);
    assert.throws(() => build({ provider: 'twilio', twilio: { sid: 'AC1', from: '+1' } }), /TWILIO_AUTH_TOKEN/);
    assert.throws(() => build({ provider: 'twilio', twilio: { sid: 'AC1', token: 'k' } }), /TWILIO_FROM/);
  });

  it('throws on an unimplemented name rather than quietly falling back to the log transport', () => {
    // The failure mode being prevented: a typo in production that "works",
    // printing one-time codes into a server log nobody is reading.
    const typo = 'sparow' as AppConfig['sms']['provider'];
    assert.throws(() => build({ provider: typo }), /SMS_PROVIDER="sparow" is not implemented/);
  });
});
