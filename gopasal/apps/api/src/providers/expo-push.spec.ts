import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ExpoPushProvider } from './push.provider';

/**
 * The push transport, where the failure modes are all silent ones.
 *
 * Nothing here checks that a notification "was sent" — that is the service's
 * business. What is pinned is the four ways this code could quietly stop
 * working: sending to a token the service cannot use, exceeding the batch limit
 * so the whole request is rejected, failing to notice a dead token and carrying
 * it forever, and throwing on a network blip so the notification job retries
 * and writes the in-app row twice.
 */

type Call = { body: unknown[]; headers: Record<string, string> };

function fakeFetch(tickets: (index: number) => Record<string, unknown>, calls: Call[]) {
  const fetcher: typeof fetch = (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(typeof init?.body === 'string' ? init.body : '[]') as unknown[];
    calls.push({ body, headers: Object.fromEntries(new Headers(init?.headers).entries()) });
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: body.map((_, i) => tickets(i)) }),
    } as Response);
  };
  return fetcher;
}

const ok = () => ({ status: 'ok', id: 'ticket' });
const token = (n: number) => `ExponentPushToken[${String(n).padStart(4, '0')}]`;

describe('Expo push transport', () => {
  it('sends one message per token, with the payload the app reads', async () => {
    const calls: Call[] = [];
    const push = new ExpoPushProvider(undefined, 'https://exp.test/send', fakeFetch(ok, calls));

    await push.send([token(1), token(2)], {
      title: 'Order accepted',
      body: 'Namaste Kirana is packing your order.',
      data: { type: 'order.accepted', orderId: 'ord_1' },
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.length, 2);
    const first = calls[0].body[0] as Record<string, unknown>;
    assert.equal(first.to, token(1));
    assert.equal(first.title, 'Order accepted');
    assert.deepEqual(first.data, { type: 'order.accepted', orderId: 'ord_1' });
    assert.equal(first.channelId, 'orders', 'Android needs the channel to show it');
  });

  it('drops a token the service could not have issued rather than posting it', async () => {
    const calls: Call[] = [];
    const push = new ExpoPushProvider(undefined, 'https://exp.test/send', fakeFetch(ok, calls));

    // `user:<id>` is what the worker used to address before the registry
    // existed. A raw FCM token would be equally wrong for this endpoint.
    await push.send(['user:cus_1', 'fcm-raw-token'], { title: 'x', body: 'y' });

    assert.equal(calls.length, 0, 'nothing worth sending means no request at all');
  });

  it('splits at the batch limit the service documents', async () => {
    const calls: Call[] = [];
    const push = new ExpoPushProvider(undefined, 'https://exp.test/send', fakeFetch(ok, calls));

    await push.send(
      Array.from({ length: 250 }, (_, i) => token(i)),
      { title: 'x', body: 'y' },
    );

    assert.deepEqual(
      calls.map((c) => c.body.length),
      [100, 100, 50],
    );
  });

  it('reports the tokens the service says are gone, and only those', async () => {
    const calls: Call[] = [];
    const push = new ExpoPushProvider(
      undefined,
      'https://exp.test/send',
      fakeFetch(
        (i) =>
          i === 1
            ? { status: 'error', details: { error: 'DeviceNotRegistered' } }
            : i === 2
              ? { status: 'error', details: { error: 'MessageTooBig' } }
              : ok(),
        calls,
      ),
    );

    const disabled: string[][] = [];
    push.onInvalidTokens = (t) => {
      disabled.push(t);
      return Promise.resolve();
    };

    await push.send([token(1), token(2), token(3)], { title: 'x', body: 'y' });

    assert.deepEqual(disabled, [[token(2)]], 'only the unregistered one; a big message is our bug');
  });

  it('carries the access token only when the project needs one', async () => {
    const withKey: Call[] = [];
    await new ExpoPushProvider('secret', 'https://exp.test/send', fakeFetch(ok, withKey)).send(
      [token(1)],
      { title: 'x', body: 'y' },
    );
    assert.equal(withKey[0].headers.authorization, 'Bearer secret');

    const without: Call[] = [];
    await new ExpoPushProvider(undefined, 'https://exp.test/send', fakeFetch(ok, without)).send(
      [token(1)],
      { title: 'x', body: 'y' },
    );
    assert.equal('authorization' in without[0].headers, false);
  });

  it('swallows a network failure — the in-app notification already landed', async () => {
    const networkFailure: typeof fetch = () => Promise.reject(new Error('ECONNRESET'));
    const push = new ExpoPushProvider(undefined, 'https://exp.test/send', networkFailure);

    await assert.doesNotReject(() => push.send([token(1)], { title: 'x', body: 'y' }));
  });

  it('swallows a rejected batch too, and does not call it a dead token', async () => {
    const disabled: string[][] = [];
    const rejectedBatch: typeof fetch = () => Promise.resolve({
      ok: false,
      status: 502,
      json: () => Promise.resolve({}),
    } as Response);
    const push = new ExpoPushProvider(undefined, 'https://exp.test/send', rejectedBatch);
    push.onInvalidTokens = (t) => {
      disabled.push(t);
      return Promise.resolve();
    };

    await assert.doesNotReject(() => push.send([token(1)], { title: 'x', body: 'y' }));
    assert.deepEqual(disabled, [], 'a 502 is our problem, not the phone’s');
  });
});
