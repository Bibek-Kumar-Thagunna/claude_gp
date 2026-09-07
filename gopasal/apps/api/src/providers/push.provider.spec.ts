import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration';
import { LogPushProvider, PUSH_PROVIDER, type PushProvider, pushProviderFactory } from './push.provider';

/**
 * Push has one implementation on purpose, so the only things worth pinning are
 * that it admits it does not deliver, and that asking for FCM is refused with the
 * reason rather than accepted and ignored.
 */
const build = (push: AppConfig['push']): PushProvider =>
  pushProviderFactory.useFactory(({ get: () => push }) as unknown as ConfigService<AppConfig, true>);

describe('LogPushProvider', () => {
  it('declares that nothing leaves the machine', () => {
    const provider = new LogPushProvider();
    assert.equal(provider.name, 'log');
    assert.equal(provider.delivers, false);
  });

  it('resolves for any recipient list, including an empty one', async () => {
    const provider = new LogPushProvider();
    await assert.doesNotReject(() => provider.send([], { title: 'Order placed', body: 'GoPasal' }));
    await assert.doesNotReject(() =>
      provider.send(['tok-a', 'tok-b'], { title: 'Order placed', body: 'GoPasal', data: { orderId: '1' } }),
    );
  });
});

describe('pushProviderFactory', () => {
  it('binds the token the notification service resolves', () => {
    assert.equal(pushProviderFactory.provide, PUSH_PROVIDER);
  });

  it('selects the log transport, which is the only implementation there is', () => {
    assert.ok(build({ provider: 'log' }) instanceof LogPushProvider);
  });

  it('refuses PUSH_PROVIDER=fcm and explains what is missing', () => {
    const fcm = 'fcm' as AppConfig['push']['provider'];
    assert.throws(() => build({ provider: fcm }), (err: Error) => {
      assert.match(err.message, /PUSH_PROVIDER="fcm" is not implemented/);
      assert.match(err.message, /device-token registry/);
      // In-app notifications are a database row and must not be implicated.
      assert.match(err.message, /in-app notifications are unaffected/);
      return true;
    });
  });
});
