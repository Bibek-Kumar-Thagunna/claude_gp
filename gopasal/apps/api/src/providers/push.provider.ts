import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration';

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
}

/**
 * Device-push transport — distinct from the in-app Notification row, which is
 * written first and is the source of truth. Push is an extra nudge to a phone.
 *
 * Two implementations: `log`, which prints and delivers nothing, and `expo`,
 * which posts to Expo's push service and does.
 *
 * Expo rather than FCM directly, because the customer app is an Expo app and
 * Expo's service is the one that already holds its credentials: it needs no key
 * of ours in development and, in production, only the FCM server key uploaded
 * to the Expo project — not something this process has to carry. Sending
 * straight to FCM would also mean implementing APNs separately and doing our
 * own token-format detection, for a platform GoPasal does not ship yet.
 *
 * What the transport must get right, and what the tests pin:
 *
 *  - **A dead token is reported back.** Expo answers per message; a ticket with
 *    `DeviceNotRegistered` names a token nobody will ever receive again, and it
 *    has to be disabled or every future send carries it. `onInvalidTokens` is
 *    how the registry hears about that.
 *  - **Batches of 100.** The service documents that limit; a longer body is
 *    rejected whole, which would silently drop everybody after the hundredth.
 *  - **Failure is not an error.** The in-app notification row is already
 *    written and is the source of truth. A push that does not go out is worth a
 *    warning in the log, never a failed job that retries the whole
 *    notification.
 */
export interface PushProvider {
  readonly name: string;
  /** False when nothing leaves this machine. */
  readonly delivers: boolean;
  send(deviceTokens: string[], message: PushMessage): Promise<void>;
  /**
   * Called with the tokens the service says are gone, so the caller can stop
   * addressing them. Set by the registry at wiring time; the provider itself
   * knows nothing about the database.
   */
  onInvalidTokens?: (tokens: string[]) => Promise<void>;
}

export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER');

@Injectable()
export class LogPushProvider implements PushProvider {
  readonly name = 'log';
  readonly delivers = false;
  private readonly logger = new Logger('Push:log');

  // Logging is synchronous; the promise belongs to the interface, not to this
  // implementation, so resolve rather than pretending to await something.
  send(deviceTokens: string[], message: PushMessage): Promise<void> {
    this.logger.log(
      `(not delivered — development transport) ${deviceTokens.length} recipient(s): ` +
        `${message.title} — ${message.body}`,
    );
    return Promise.resolve();
  }
}

/** Expo's documented ceiling for one request. */
const EXPO_BATCH = 100;
const EXPO_TIMEOUT_MS = 8_000;

/**
 * Expo's push service.
 *
 * `accessToken` is optional and is only needed when the Expo project has
 * "enhanced security" turned on; without it the endpoint accepts a send for any
 * token it issued, which is why development needs no credentials at all.
 */
export class ExpoPushProvider implements PushProvider {
  readonly name = 'expo';
  readonly delivers = true;
  onInvalidTokens?: (tokens: string[]) => Promise<void>;
  private readonly logger = new Logger('Push:expo');

  constructor(
    private readonly accessToken?: string,
    private readonly endpoint = 'https://exp.host/--/api/v2/push/send',
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(deviceTokens: string[], message: PushMessage): Promise<void> {
    const tokens = deviceTokens.filter((t) => t.startsWith('ExponentPushToken['));
    if (tokens.length === 0) return;

    const dead: string[] = [];
    for (let i = 0; i < tokens.length; i += EXPO_BATCH) {
      const batch = tokens.slice(i, i + EXPO_BATCH);
      const body = batch.map((to) => ({
        to,
        title: message.title,
        body: message.body,
        data: message.data,
        sound: 'default',
        // GoPasal only ever pushes about something the customer is waiting for,
        // so the phone may show it while the app is in front.
        priority: 'high',
        channelId: 'orders',
      }));

      let response: Response;
      try {
        response = await this.fetchImpl(this.endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
            ...(this.accessToken ? { authorization: `Bearer ${this.accessToken}` } : {}),
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(EXPO_TIMEOUT_MS),
        });
      } catch (cause) {
        this.logger.warn(`push batch failed: ${(cause as Error).message}`);
        continue;
      }

      if (!response.ok) {
        this.logger.warn(`push batch rejected: ${response.status}`);
        continue;
      }

      // `data` is one ticket per message, in the order they were sent.
      const payload = (await response.json().catch(() => null)) as
        | { data?: { status?: string; details?: { error?: string } }[] }
        | null;
      payload?.data?.forEach((ticket, index) => {
        if (ticket?.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
          dead.push(batch[index]);
        }
      });
    }

    if (dead.length > 0 && this.onInvalidTokens) {
      await this.onInvalidTokens(dead).catch((cause: unknown) =>
        this.logger.warn(`could not disable dead tokens: ${(cause as Error).message}`),
      );
    }
  }
}

export const pushProviderFactory = {
  provide: PUSH_PROVIDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService<AppConfig, true>): PushProvider => {
    const push = config.get('push', { infer: true });
    if (push.provider === 'log') return new LogPushProvider();
    if (push.provider === 'expo') return new ExpoPushProvider(push.expoAccessToken);
    const name: string = push.provider;
    throw new Error(
      `PUSH_PROVIDER="${name}" is not implemented. Choose "expo" (the customer app is an ` +
        'Expo app and its push service needs no key here) or "log"; in-app notifications are ' +
        'unaffected either way.',
    );
  },
};
