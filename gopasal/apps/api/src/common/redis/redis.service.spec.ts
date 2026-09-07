import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type Redis from 'ioredis';
import { closeQuietly } from './redis.service';

/**
 * Shutdown has to finish. The uploads E2E harness found that it did not: the API
 * ignored SIGINT and had to be SIGKILLed, which throws away whatever the
 * lifecycle hooks were still doing. One of the reasons was here — `quit()` queues
 * QUIT behind the command already in flight, so a connection parked in a blocking
 * read (or pointed at a server that has gone away) can leave the promise
 * unsettled forever, and `onModuleDestroy` waits on it.
 *
 * What is asserted is therefore the guarantee rather than the mechanism: whatever
 * `quit()` does, this settles, and the socket ends up closed either way.
 */

interface FakeConn extends Pick<Redis, 'quit' | 'disconnect'> {
  disconnected: number;
}

/** `quit` behaves as told; `disconnect` is counted. */
function conn(quit: () => Promise<'OK'>): FakeConn {
  const fake: FakeConn = {
    disconnected: 0,
    quit,
    disconnect: () => {
      fake.disconnected += 1;
    },
  };
  return fake;
}

const never = (): Promise<'OK'> => new Promise<'OK'>(() => undefined);

describe('closeQuietly · a close that cannot hang', () => {
  it('returns as soon as QUIT is answered, and leaves the socket alone', async () => {
    const c = conn(() => Promise.resolve('OK'));
    await closeQuietly(c, 5_000);
    assert.equal(c.disconnected, 0, 'a polite close needs no disconnect');
  });

  it('settles even when QUIT never answers, and forces the socket down', async () => {
    const c = conn(never);
    let warned = 0;
    // The forced-close timer is deliberately `unref()`ed in production — it must
    // never be the handle that keeps a shutting-down process alive. Inside the
    // test runner that means an unanswered `quit()` would leave the loop with
    // nothing referenced at all, and node:test cancels a pending test when the
    // loop drains. So the *test* holds a referenced timer; the code under test
    // still holds none.
    const holdLoopOpen = setTimeout(() => undefined, 1_000);

    // The real timeout is 2s; the guarantee is what matters, not the number.
    await closeQuietly(c, 10, () => {
      warned += 1;
    });
    clearTimeout(holdLoopOpen);

    assert.equal(c.disconnected, 1, 'an unanswered QUIT must end in disconnect()');
    assert.equal(warned, 1, 'a forced close must say so');
  });

  it('does not wait for the timeout when QUIT rejects', async () => {
    const c = conn(() => Promise.reject(new Error('Connection is closed.')));
    let warned = 0;
    const started = Date.now();

    await closeQuietly(c, 5_000, () => {
      warned += 1;
    });

    assert.equal(c.disconnected, 1);
    assert.equal(warned, 0, 'a rejection is not a timeout');
    assert.ok(Date.now() - started < 1_000, 'a rejected QUIT should return immediately');
  });

  it('treats a synchronous throw from quit() as a failed close, not a crash', async () => {
    const c = conn(() => {
      throw new Error('Stream isn’t writeable');
    });

    await assert.doesNotReject(() => closeQuietly(c, 10));
    assert.equal(c.disconnected, 1);
  });

  it('holds nothing that could keep the process alive after it resolves', async () => {
    // A referenced timer left behind by the timeout race would be exactly the
    // kind of handle that makes a process refuse to exit — the bug this guards.
    const before = process.getActiveResourcesInfo().filter((r) => r === 'Timeout').length;
    await closeQuietly(conn(() => Promise.resolve('OK')), 60_000);
    const after = process.getActiveResourcesInfo().filter((r) => r === 'Timeout').length;

    assert.ok(after <= before, `left ${after - before} extra timer(s) behind`);
  });
});
