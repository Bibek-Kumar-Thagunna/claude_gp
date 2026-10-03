import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { createOutbox } from "../../../packages/native-data/src/outbox";
import { memoryStore, type KeyValueStore } from "../../../packages/native-data/src/store";
import { ApiError, type Http } from "../../../packages/native-data/src/http";

/**
 * The queue that stands between a tap and a lost order.
 *
 * Everything here is a rule the customer feels rather than sees: a write
 * survives the app being killed, a replay does not become a second order, a
 * rejection the server meant is not retried for ever, and "add to cart" goes
 * out before "check out". Each of those is one line in `outbox.ts` and each
 * costs somebody money when it is wrong.
 *
 * The store is injected, so "survives being killed" is testable: the queue is
 * built, written to, thrown away, and built again over the same store — which
 * is what a cold start actually is.
 */

const STORAGE_KEY = "gopasal.outbox.v1";

type Call = { path: string; method?: string; idempotencyKey?: string; body?: unknown };

/**
 * An HTTP double that answers however the test needs.
 *
 * `plan` is consulted per call, so one test can fail twice and then succeed —
 * the sequence being the thing under test rather than any single response.
 */
function fakeHttp(plan: (call: Call, n: number) => unknown | Error): {
  http: Http;
  calls: Call[];
} {
  const calls: Call[] = [];
  const http = {
    origin: () => "http://localhost:4000",
    async request<T>(path: string, options?: Record<string, unknown>): Promise<T> {
      const call: Call = {
        path,
        method: options?.method as string | undefined,
        idempotencyKey: options?.idempotencyKey as string | undefined,
        body: options?.body,
      };
      calls.push(call);
      const answer = plan(call, calls.length);
      if (answer instanceof Error) throw answer;
      return answer as T;
    },
  } as unknown as Http;
  return { http, calls };
}

const ok = () => ({ ok: true });
const offline = () => new ApiError(0, "Network request failed");
const serverDown = () => new ApiError(503, "Service unavailable");
const rejected = (status = 409, message = "This coupon has already been used") =>
  new ApiError(status, message);

const addToCart = { path: "/cart/items", method: "POST" as const, label: "Add Basmati Rice" };

async function stored(store: KeyValueStore): Promise<unknown[]> {
  const raw = await store.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as unknown[]) : [];
}

describe("outbox — the happy path", () => {
  it("returns the server's answer, so a caller can await it as if there were no queue", async () => {
    const { http } = fakeHttp(() => ({ id: "cart-1" }));
    const outbox = createOutbox(http, memoryStore());

    const result = await outbox.enqueue<{ id: string }>(addToCart);
    assert.deepEqual(result, { id: "cart-1" });
  });

  it("leaves nothing behind once the write lands", async () => {
    const store = memoryStore();
    const { http } = fakeHttp(ok);
    const outbox = createOutbox(http, store);

    await outbox.enqueue(addToCart);
    assert.deepEqual(await stored(store), []);
    assert.deepEqual(outbox.snapshot().entries, []);
  });

  it("sends an idempotency key, which is what makes a replay safe", async () => {
    const { http, calls } = fakeHttp(ok);
    await createOutbox(http, memoryStore()).enqueue(addToCart);

    assert.equal(typeof calls[0]!.idempotencyKey, "string");
    assert.ok(calls[0]!.idempotencyKey!.length > 8);
  });

  it("attempts each entry once itself — the queue owns the retry schedule", async () => {
    const seen: unknown[] = [];
    const http = {
      origin: () => "",
      async request(_p: string, o?: Record<string, unknown>) {
        seen.push(o?.maxAttempts);
        return ok();
      },
    } as unknown as Http;

    await createOutbox(http, memoryStore()).enqueue(addToCart);
    assert.deepEqual(seen, [1], "the http layer retrying too would multiply the attempts");
  });
});

describe("outbox — when the network is gone", () => {
  it("resolves null rather than throwing, because the write is not lost", async () => {
    const { http } = fakeHttp(offline);
    const result = await createOutbox(http, memoryStore()).enqueue(addToCart);
    assert.equal(result, null, "the screen should say 'waiting', not 'failed'");
  });

  it("keeps the entry on disk", async () => {
    const store = memoryStore();
    const { http } = fakeHttp(offline);
    await createOutbox(http, store).enqueue(addToCart);

    const saved = (await stored(store)) as { label: string; attempts: number }[];
    assert.equal(saved.length, 1);
    assert.equal(saved[0]!.label, "Add Basmati Rice");
    assert.equal(saved[0]!.attempts, 1);
  });

  it("survives the app being killed and sends on the next launch", async () => {
    const store = memoryStore();

    const first = fakeHttp(offline);
    await createOutbox(first.http, store).enqueue(addToCart);

    // A cold start: a brand new queue, the same disk.
    const second = fakeHttp(ok);
    const revived = createOutbox(second.http, store);
    await revived.flush();

    assert.equal(second.calls.length, 1);
    assert.deepEqual(await stored(store), []);
  });

  it("replays with the key it was given the first time, not a fresh one", async () => {
    const store = memoryStore();

    const first = fakeHttp(offline);
    await createOutbox(first.http, store).enqueue(addToCart);

    const second = fakeHttp(ok);
    await createOutbox(second.http, store).flush();

    assert.equal(
      second.calls[0]!.idempotencyKey,
      first.calls[0]!.idempotencyKey,
      "a new key on replay is exactly how one order becomes two",
    );
  });

  it("gives up after enough tries rather than retrying for ever", async () => {
    const store = memoryStore();
    const { http, calls } = fakeHttp(offline);
    const outbox = createOutbox(http, store);

    await outbox.enqueue(addToCart);
    for (let i = 0; i < 12; i += 1) await outbox.flush();

    const entry = outbox.snapshot().entries[0]!;
    assert.equal(entry.parked, true);
    assert.ok(calls.length <= 8, `stopped at ${calls.length} attempts`);
  });
});

describe("outbox — when the server says no", () => {
  it("parks a rejection it meant, instead of retrying it for ever", async () => {
    const store = memoryStore();
    const { http, calls } = fakeHttp(() => rejected());
    const outbox = createOutbox(http, store);

    await outbox.enqueue(addToCart);
    await outbox.flush();
    await outbox.flush();

    const entry = outbox.snapshot().entries[0]!;
    assert.equal(entry.parked, true);
    assert.match(entry.lastError!, /already been used/);
    assert.equal(calls.length, 1, "a 409 will be a 409 again; asking twice is noise");
  });

  it("keeps retrying a 5xx, which is our problem and not the customer's", async () => {
    const { http, calls } = fakeHttp(serverDown);
    const outbox = createOutbox(http, memoryStore());

    await outbox.enqueue(addToCart);
    await outbox.flush();

    assert.equal(calls.length, 2);
    assert.notEqual(outbox.snapshot().entries[0]!.parked, true);
  });

  it("retries a timeout and a rate limit, which pass", async () => {
    for (const status of [408, 429]) {
      const { http, calls } = fakeHttp(() => new ApiError(status, `status ${status}`));
      const outbox = createOutbox(http, memoryStore());
      await outbox.enqueue(addToCart);
      await outbox.flush();
      assert.equal(calls.length, 2, `${status} should be retried`);
      assert.notEqual(outbox.snapshot().entries[0]!.parked, true);
    }
  });

  it("surfaces the server's own words, because they are the useful ones", async () => {
    const { http } = fakeHttp(() => rejected(400, "Please pin your address on the map"));
    const outbox = createOutbox(http, memoryStore());
    await outbox.enqueue(addToCart);

    assert.equal(outbox.snapshot().entries[0]!.lastError, "Please pin your address on the map");
  });
});

describe("outbox — order", () => {
  it("sends oldest first", async () => {
    const store = memoryStore();
    const down = fakeHttp(offline);
    const queue = createOutbox(down.http, store);
    await queue.enqueue({ path: "/cart/items", method: "POST", label: "Add rice" });
    await queue.enqueue({ path: "/cart/items", method: "POST", label: "Add oil" });
    await queue.enqueue({ path: "/orders", method: "POST", label: "Place the order" });

    const up = fakeHttp(ok);
    await createOutbox(up.http, store).flush();

    assert.deepEqual(
      up.calls.map((c) => c.path),
      ["/cart/items", "/cart/items", "/orders"],
      "checking out before the items are in the cart is not the same order",
    );
  });

  it("stops at the first entry that still cannot go out", async () => {
    const store = memoryStore();
    const down = fakeHttp(offline);
    const queue = createOutbox(down.http, store);
    await queue.enqueue({ path: "/a", method: "POST", label: "first" });
    await queue.enqueue({ path: "/b", method: "POST", label: "second" });

    // Still offline for the first entry on the next flush.
    const flaky = fakeHttp((_c, n) => (n === 1 ? offline() : ok()));
    await createOutbox(flaky.http, store).flush();

    assert.deepEqual(
      flaky.calls.map((c) => c.path),
      ["/a"],
      "sending /b past a stuck /a reorders the customer's intent",
    );
  });

  it("does not stampede a connection that has just come back", async () => {
    const store = memoryStore();
    const down = fakeHttp(offline);
    const queue = createOutbox(down.http, store);
    for (let i = 0; i < 5; i += 1) {
      await queue.enqueue({ path: `/p${i}`, method: "POST", label: `p${i}` });
    }

    let inFlight = 0;
    let peak = 0;
    const http = {
      origin: () => "",
      async request() {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 1));
        inFlight -= 1;
        return ok();
      },
    } as unknown as Http;

    await createOutbox(http, store).flush();
    assert.equal(peak, 1, "strictly sequential");
  });

  it("skips a parked entry instead of blocking everything behind it", async () => {
    const store = memoryStore();
    // Only /bad is refused. Rejecting both would park both, and the test
    // would pass while proving nothing about what it claims to check.
    const first = fakeHttp((call) => (call.path === "/bad" ? rejected() : offline()));
    const queue = createOutbox(first.http, store);
    await queue.enqueue({ path: "/bad", method: "POST", label: "bad" });
    await queue.enqueue({ path: "/good", method: "POST", label: "good" });

    assert.equal(
      queue.snapshot().entries.find((e) => e.path === "/bad")!.parked,
      true,
      "the 409 parked it",
    );
    assert.notEqual(
      queue.snapshot().entries.find((e) => e.path === "/good")!.parked,
      true,
      "a dropped connection is not a rejection",
    );

    const up = fakeHttp(ok);
    await createOutbox(up.http, store).flush();

    assert.deepEqual(up.calls.map((c) => c.path), ["/good"]);
  });
});

describe("outbox — the buttons a parked entry gets", () => {
  let store: KeyValueStore;
  beforeEach(() => {
    store = memoryStore();
  });

  it("discard removes it for good", async () => {
    const { http } = fakeHttp(() => rejected());
    const outbox = createOutbox(http, store);
    await outbox.enqueue(addToCart);

    const id = outbox.snapshot().entries[0]!.id;
    await outbox.discard(id);

    assert.deepEqual(outbox.snapshot().entries, []);
    assert.deepEqual(await stored(store), []);
  });

  it("revive clears the attempt count and tries again", async () => {
    let failing = true;
    const { http, calls } = fakeHttp(() => (failing ? rejected() : ok()));
    const outbox = createOutbox(http, store);
    await outbox.enqueue(addToCart);
    assert.equal(outbox.snapshot().entries[0]!.parked, true);

    failing = false;
    await outbox.revive(outbox.snapshot().entries[0]!.id);

    assert.equal(calls.length, 2);
    assert.deepEqual(outbox.snapshot().entries, []);
  });

  it("revive reuses the original key, so a retry cannot double-charge", async () => {
    let failing = true;
    const { http, calls } = fakeHttp(() => (failing ? serverDown() : ok()));
    const outbox = createOutbox(http, store);
    await outbox.enqueue({ path: "/orders", method: "POST", label: "Place the order" });

    failing = false;
    await outbox.revive(outbox.snapshot().entries[0]!.id);

    assert.equal(calls[1]!.idempotencyKey, calls[0]!.idempotencyKey);
  });
});

describe("outbox — durability under a hostile disk", () => {
  it("still works for this session when the store cannot be written", async () => {
    const broken: KeyValueStore = {
      async getItem() {
        return null;
      },
      async setItem() {
        throw new Error("QuotaExceededError");
      },
      async removeItem() {},
    };
    const { http } = fakeHttp(ok);

    // Losing durability is bad. Losing the running app while somebody is
    // checking out is worse.
    const result = await createOutbox(http, broken).enqueue(addToCart);
    assert.deepEqual(result, { ok: true });
  });

  it("starts empty rather than crashing on corrupt stored data", async () => {
    const store = memoryStore({ [STORAGE_KEY]: "{not json" });
    const { http } = fakeHttp(ok);
    const outbox = createOutbox(http, store);

    await outbox.load();
    assert.deepEqual(outbox.snapshot().entries, []);
  });

  it("ignores stored data that is the wrong shape", async () => {
    const store = memoryStore({ [STORAGE_KEY]: '{"entries":"nope"}' });
    const outbox = createOutbox(fakeHttp(ok).http, store);

    await outbox.load();
    assert.deepEqual(outbox.snapshot().entries, []);
  });
});

describe("outbox — what the screen is told", () => {
  it("tells a subscriber the state as it is now, then on every change", async () => {
    const store = memoryStore();
    const { http } = fakeHttp(offline);
    const outbox = createOutbox(http, store);

    const seen: number[] = [];
    const unsubscribe = outbox.subscribe((s) => seen.push(s.entries.length));
    await outbox.load();
    await outbox.enqueue(addToCart);

    assert.ok(seen.length >= 2, "at least the initial state and the queued write");
    assert.equal(seen.at(-1), 1);

    unsubscribe();
    const before = seen.length;
    await outbox.enqueue(addToCart);
    assert.equal(seen.length, before, "an unsubscribed screen stops hearing");
  });
});
