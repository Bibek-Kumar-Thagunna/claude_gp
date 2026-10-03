import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration';
import { LogPushProvider, PUSH_PROVIDER, type PushProvider, pushProviderFactory } from './push.provider';

/**
 * Two implementations now — the log transport and Expo's push service — so what
 * is worth pinning is that each is selected by name, that the log one admits it
 * does not deliver, and that asking for a transport nobody wrote is refused
 * with the reason rather than accepted and silently ignored.
 *
 * The refusal is checked for the *alternatives it offers*, not for its exact
 * wording. It used to say there was no device-token registry to send to, which
 * was true until one was built; a test that pins prose outlives the prose.
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

  it('selects the log transport by name', () => {
    assert.ok(build({ provider: 'log' }) instanceof LogPushProvider);
  });

  it('selects the Expo transport, which needs no key of its own', () => {
    const provider = build({ provider: 'expo' });
    assert.equal(provider.name, 'expo');
    assert.equal(provider.delivers, true);
  });

  it('refuses PUSH_PROVIDER=fcm and explains what is missing', () => {
    const fcm = 'fcm' as AppConfig['push']['provider'];
    assert.throws(() => build({ provider: fcm }), (err: Error) => {
      assert.match(err.message, /PUSH_PROVIDER="fcm" is not implemented/);
      // Names the transport that does work, so the reader's next move is obvious.
      assert.match(err.message, /"expo"/);
      // In-app notifications are a database row and must not be implicated.
      assert.match(err.message, /in-app notifications are unaffected/);
      return true;
    });
  });
});
