import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConflictException } from '@nestjs/common';
import type { RedisService } from '../redis/redis.service';
import { IdempotencyService } from './idempotency.service';

/**
 * The situation being defended against is not a double tap — it is a phone.
 * A checkout that succeeds on the server and loses its reply on the way back is
 * indistinguishable, from the app, from one that never arrived, and any sane
 * client retries a timeout. Without a key that retry is a second real order.
 */

/** Just enough of ioredis: SET with NX/EX, GET and DEL over a Map. */
function fakeRedis() {
  const store = new Map<string, string>();
  const client = {
    set: (key: string, value: string, _ex: string, _ttl: number, nx?: string) => {
      if (nx === 'NX' && store.has(key)) return Promise.resolve(null);
      store.set(key, value);
      return Promise.resolve('OK');
    },
    get: (key: string) => Promise.resolve(store.get(key) ?? null),
    del: (key: string) => {
      store.delete(key);
      return Promise.resolve(1);
    },
  };
  return { service: { client } as unknown as RedisService, store };
}

const subject = () => {
  const { service, store } = fakeRedis();
  return { idem: new IdempotencyService(service), store };
};

describe('IdempotencyService', () => {
  it('runs the work when no key is supplied', async () => {
    const { idem } = subject();
    let runs = 0;
    const work = () => {
      runs += 1;
      return Promise.resolve({ id: 'order_1', result: 'placed' });
    };
    assert.equal(await idem.once('checkout', 'u1', undefined, work, () => Promise.resolve('replayed')), 'placed');
    assert.equal(await idem.once('checkout', 'u1', undefined, work, () => Promise.resolve('replayed')), 'placed');
    // Without a key there is nothing to deduplicate against — both run, which is
    // the pre-existing behaviour the web consoles still rely on.
    assert.equal(runs, 2);
  });

  it('runs the work once and replays the same entity afterwards', async () => {
    const { idem } = subject();
    let runs = 0;
    const work = () => {
      runs += 1;
      return Promise.resolve({ id: 'order_1', result: 'placed' });
    };
    const first = await idem.once('checkout', 'u1', 'k1', work, (id) => Promise.resolve(`replay:${id}`));
    const second = await idem.once('checkout', 'u1', 'k1', work, (id) => Promise.resolve(`replay:${id}`));

    assert.equal(first, 'placed');
    assert.equal(second, 'replay:order_1');
    assert.equal(runs, 1, 'the second attempt must not place another order');
  });

  it('refuses a retry that arrives while the first attempt is still running', async () => {
    const { idem } = subject();
    // Definite-assignment: the executor runs synchronously, but TypeScript's
    // control-flow analysis cannot see that and narrows an initialised variable
    // to its initial type.
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });

    const slow = idem.once(
      'checkout',
      'u1',
      'k1',
      async () => {
        await gate;
        return { id: 'order_1', result: 'placed' };
      },
      (id) => Promise.resolve(`replay:${id}`),
    );

    await assert.rejects(
      () => idem.once('checkout', 'u1', 'k1', () => Promise.resolve({ id: 'x', result: 'nope' }), () => Promise.resolve('r')),
      ConflictException,
    );

    release();
    assert.equal(await slow, 'placed');
  });

  it('releases the key when the work fails, so a fixed retry is allowed', async () => {
    const { idem, store } = subject();
    await assert.rejects(() =>
      idem.once('checkout', 'u1', 'k1', () => Promise.reject(new Error('cart is empty')), () => Promise.resolve('r')),
    );
    assert.equal(store.size, 0, 'a failed attempt must not hold the key');

    const after = await idem.once('checkout', 'u1', 'k1', () => Promise.resolve({ id: 'order_2', result: 'placed' }), () => Promise.resolve('r'));
    assert.equal(after, 'placed');
  });

  it('keys are per user, so two customers cannot collide', async () => {
    const { idem } = subject();
    const a = await idem.once('checkout', 'u1', 'same-key', () => Promise.resolve({ id: 'o1', result: 'a' }), () => Promise.resolve('replay'));
    const b = await idem.once('checkout', 'u2', 'same-key', () => Promise.resolve({ id: 'o2', result: 'b' }), () => Promise.resolve('replay'));
    assert.equal(a, 'a');
    assert.equal(b, 'b');
  });
});
