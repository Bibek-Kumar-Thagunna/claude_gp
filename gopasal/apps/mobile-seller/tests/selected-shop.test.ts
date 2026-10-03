import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSelectedShopStore } from "../../../packages/native-data/src/seller-shop";
import { memoryStore, type KeyValueStore } from "../../../packages/native-data/src/store";

/**
 * Which shop this phone believes it is standing in.
 *
 * Every seller request is `/seller/shops/:shopId/...`, so this one string
 * decides whose queue, whose shelf and whose money the counter is looking at.
 * The failures are not crashes. They are a shopkeeper accepting the other
 * branch's order, or being asked which shop they run every time the app is
 * reopened, or a shop-picker that will not go away because the screen and the
 * store disagree about whether storage has been read yet.
 *
 * The store is injected, so all of that is reachable: a cold start is a new
 * store object over the same disk, and a broken phone is a `KeyValueStore` that
 * throws.
 */

const KEY = "gopasal.seller.selected-shop.v1";

/** A disk that fails every way a real one can. */
function brokenStore(how: "read" | "write" | "both"): KeyValueStore {
  return {
    async getItem() {
      if (how === "read" || how === "both") throw new Error("SQLITE_CORRUPT");
      return null;
    },
    async setItem() {
      if (how === "write" || how === "both") throw new Error("QuotaExceededError");
    },
    async removeItem() {
      if (how === "write" || how === "both") throw new Error("QuotaExceededError");
    },
  };
}

describe("selected shop — reading what was chosen last time", () => {
  it("reports nothing chosen when the phone has never been used", async () => {
    const store = createSelectedShopStore(memoryStore());
    await store.hydrate();

    assert.equal(store.get(), null);
    assert.equal(store.snapshot().shopId, null);
  });

  it("comes back to the shop the seller picked before the app was killed", async () => {
    const store = createSelectedShopStore(memoryStore({ [KEY]: "shop-kirana-01" }));
    await store.hydrate();

    assert.equal(store.get(), "shop-kirana-01");
  });

  it("starts un-hydrated, which is not the same as 'no shop chosen'", async () => {
    // This is the whole reason the flag exists. `shopId === null` before the
    // read has finished looks exactly like "this seller has never picked one",
    // and a screen that cannot tell them apart throws up the shop picker on
    // every cold start — over the shop the seller already chose.
    const store = createSelectedShopStore(memoryStore({ [KEY]: "shop-kirana-01" }));

    assert.deepEqual(store.snapshot(), { shopId: null, hydrated: false });
    await store.hydrate();
    assert.deepEqual(store.snapshot(), { shopId: "shop-kirana-01", hydrated: true });
  });

  it("is hydrated-with-nothing when storage is empty, so the picker does show", async () => {
    const store = createSelectedShopStore(memoryStore());
    await store.hydrate();

    assert.deepEqual(store.snapshot(), { shopId: null, hydrated: true });
  });

  it("treats a blank stored value as no choice rather than as a shop id", async () => {
    // `/seller/shops//orders` is a different route, and a 404 on the queue is a
    // worse answer than the picker.
    const store = createSelectedShopStore(memoryStore({ [KEY]: "" }));
    await store.hydrate();

    assert.equal(store.get(), null);
    assert.equal(store.snapshot().hydrated, true);
  });

  it("reads storage once however many times it is asked", async () => {
    let reads = 0;
    const store = createSelectedShopStore({
      async getItem() {
        reads += 1;
        return "shop-1";
      },
      async setItem() {},
      async removeItem() {},
    });

    await Promise.all([store.hydrate(), store.hydrate(), store.hydrate()]);
    await store.hydrate();

    assert.equal(reads, 1, "every screen calls this on mount; they must share one read");
  });
});

describe("selected shop — choosing and clearing", () => {
  it("answers with the new shop immediately, before the write has landed", async () => {
    // The switch is the tap. Waiting for storage to confirm it would leave the
    // queue showing the old shop's orders for as long as the disk takes.
    const store = createSelectedShopStore(memoryStore());
    const pending = store.set("shop-2");

    assert.equal(store.get(), "shop-2");
    await pending;
  });

  it("writes the choice where the next launch will find it", async () => {
    const disk = memoryStore();
    await createSelectedShopStore(disk).set("shop-2");

    assert.equal(await disk.getItem(KEY), "shop-2");

    // A cold start: a new store over the same disk.
    const relaunched = createSelectedShopStore(disk);
    await relaunched.hydrate();
    assert.equal(relaunched.get(), "shop-2");
  });

  it("forgets the shop on clear, on disk as well as in memory", async () => {
    const disk = memoryStore({ [KEY]: "shop-2" });
    const store = createSelectedShopStore(disk);
    await store.hydrate();
    await store.clear();

    assert.equal(store.get(), null);
    assert.equal(await disk.getItem(KEY), null);
  });

  it("counts a choice as hydrated, even if it was made before storage was read", async () => {
    // A seller who picks a shop from the switcher has answered the question the
    // read was asking. Leaving `hydrated` false would put the picker back up.
    const store = createSelectedShopStore(memoryStore());
    await store.set("shop-3");

    assert.equal(store.snapshot().hydrated, true);
  });

  it("does not let a slow read undo a shop the seller has just picked", async () => {
    // The read is in flight when the choice is made — a cold start on a busy
    // phone. Adopting the stored id when it lands would silently move the
    // counter back to the branch the seller had just switched away from.
    let release: (value: string | null) => void = () => {};
    const slow: KeyValueStore = {
      getItem: () =>
        new Promise<string | null>((resolve) => {
          release = resolve;
        }),
      async setItem() {},
      async removeItem() {},
    };

    const store = createSelectedShopStore(slow);
    const hydrating = store.hydrate();
    await store.set("shop-new");
    release("shop-old");
    await hydrating;

    assert.equal(store.get(), "shop-new");
  });
});

describe("selected shop — what the screens are told", () => {
  it("wakes subscribers when the read finishes, or the first paint never updates", async () => {
    const store = createSelectedShopStore(memoryStore({ [KEY]: "shop-1" }));
    let woken = 0;
    store.subscribe(() => (woken += 1));

    await store.hydrate();
    assert.equal(woken, 1);
    assert.equal(store.snapshot().shopId, "shop-1");
  });

  it("wakes subscribers on a switch and on a clear", async () => {
    const store = createSelectedShopStore(memoryStore());
    await store.hydrate();

    const seen: (string | null)[] = [];
    store.subscribe(() => seen.push(store.snapshot().shopId));

    await store.set("shop-1");
    await store.set("shop-2");
    await store.clear();

    assert.deepEqual(seen, ["shop-1", "shop-2", null]);
  });

  it("stops talking to a screen that has unsubscribed", async () => {
    const store = createSelectedShopStore(memoryStore());
    await store.hydrate();

    let woken = 0;
    const unsubscribe = store.subscribe(() => (woken += 1));
    await store.set("shop-1");
    unsubscribe();
    await store.set("shop-2");

    assert.equal(woken, 1);
  });

  it("starts the read itself when a screen subscribes", async () => {
    // Nothing else calls `hydrate`. If subscribing did not trigger it, the very
    // first screen would render against a store that never reads the disk.
    const store = createSelectedShopStore(memoryStore({ [KEY]: "shop-1" }));
    await new Promise<void>((resolve) => {
      store.subscribe(resolve);
    });

    assert.equal(store.snapshot().shopId, "shop-1");
  });

  it("hands back the same snapshot object until the value really changes", async () => {
    // `useSyncExternalStore` compares snapshots by identity. A new object for
    // the same state is a re-render of every shop-scoped screen for no news —
    // and in any caller that writes to the store in response to reading it,
    // that re-render writes again. This is the case that used to allocate.
    const store = createSelectedShopStore(memoryStore());
    await store.hydrate();
    await store.set("shop-1");

    const before = store.snapshot();
    await store.set("shop-1");
    assert.equal(store.snapshot(), before, "setting the shop that is already set is not a change");

    await store.set("shop-2");
    assert.notEqual(store.snapshot(), before, "an actual switch must be a new snapshot");
  });

  it("does not wake anybody for a write that changes nothing", async () => {
    const store = createSelectedShopStore(memoryStore());
    await store.hydrate();
    await store.set("shop-1");

    let woken = 0;
    store.subscribe(() => (woken += 1));
    await store.set("shop-1");
    await store.clear();
    await store.clear();

    assert.equal(woken, 1, "only the clear was news");
  });

  it("keeps the snapshot in step with get(), which is what select() guards on", async () => {
    const store = createSelectedShopStore(memoryStore());
    await store.hydrate();
    await store.set("shop-9");

    assert.equal(store.snapshot().shopId, store.get());
  });
});

describe("selected shop — a phone whose storage is broken", () => {
  it("opens the picker instead of failing the launch when the read throws", async () => {
    const store = createSelectedShopStore(brokenStore("read"));
    await store.hydrate();

    assert.deepEqual(
      store.snapshot(),
      { shopId: null, hydrated: true },
      "an unreadable entry asks the same question a new seller is asked",
    );
  });

  it("still switches shop for this session when the write throws", async () => {
    // Losing the choice on the next launch is an inconvenience. Refusing to
    // switch shop is a counter that cannot serve its own customers.
    const store = createSelectedShopStore(brokenStore("write"));
    await store.set("shop-4");

    assert.equal(store.get(), "shop-4");
  });

  it("still clears for this session when the removal throws", async () => {
    const store = createSelectedShopStore(brokenStore("both"));
    await store.set("shop-4");
    await store.clear();

    assert.equal(store.get(), null);
  });

  it("does not reject from set or clear, which are called without await", async () => {
    // `useSelectedShop` calls both as `void store.set(...)` from an effect. An
    // unhandled rejection there is a red box in development and a crash report
    // in production, for a disk write nobody was waiting on.
    const store = createSelectedShopStore(brokenStore("both"));
    await assert.doesNotReject(() => store.set("shop-5"));
    await assert.doesNotReject(() => store.clear());
    await assert.doesNotReject(() => store.hydrate());
  });
});
