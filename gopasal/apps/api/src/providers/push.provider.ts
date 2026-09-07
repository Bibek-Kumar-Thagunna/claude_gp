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
 * There is exactly one implementation today (`log`), and that is honest rather
 * than lazy: device push needs a device-token registry (a table of tokens per
 * user, refreshed by the mobile app on every launch, pruned when FCM reports a
 * token as unregistered) and GoPasal has no mobile app yet. Until that exists
 * there is nothing to send to, so an "FCM provider" could only ever log — and a
 * class named FcmPushProvider that logs is a lie waiting to reach production.
 *
 * `validateConfig` therefore rejects PUSH_PROVIDER=fcm with that explanation
 * instead of accepting it and quietly doing nothing.
 */
export interface PushProvider {
  readonly name: string;
  /** False when nothing leaves this machine. */
  readonly delivers: boolean;
  send(deviceTokens: string[], message: PushMessage): Promise<void>;
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

export const pushProviderFactory = {
  provide: PUSH_PROVIDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService<AppConfig, true>): PushProvider => {
    const push = config.get('push', { infer: true });
    if (push.provider === 'log') return new LogPushProvider();
    const name: string = push.provider;
    throw new Error(
      `PUSH_PROVIDER="${name}" is not implemented. Device push requires a device-token ` +
        'registry, which arrives with the mobile apps; in-app notifications are unaffected.',
    );
  },
};
