/**
 * Which shop this phone is standing in.
 *
 * Almost every seller route is `/seller/shops/:shopId/...` — the API resolves the
 * tenant from that path segment and checks the caller's membership against it —
 * so a seller screen cannot ask a question without first knowing which shop it
 * is asking about. A seller may be an active member of several (an owner with
 * two branches, a manager helping out next door), so the answer is a choice, and
 * a choice made on a counter phone has to survive the app being killed: the
 * shopkeeper picked a shop once, in the back room, and should never be asked
 * again while restocking a shelf.
 *
 * The chosen id is a convenience, not a secret — it grants nothing, since every
 * request is still authorised server-side against the membership — so it lives
 * in ordinary key/value storage rather than the keystore.
 *
 * **The store is injected, not imported.** `outbox.ts` took the same turn for the
 * same reason: this module decides what happens when storage is empty, corrupt
 * or unreadable, and none of those branches can be exercised against a store that
 * only exists inside a running React Native app. `asyncStorageStore` is still the
 * real implementation on a phone; it is simply passed in.
 *
 * What is deliberately *not* here: the cache invalidation that must follow a
 * switch. That needs React Query, and this module is plain state so it can be
 * tested without one — `useSelectedShop` in `seller.ts` is where the two are
 * joined.
 */
import * as React from "react";
import { asyncStorageStore } from "./async-storage-store";
import type { KeyValueStore } from "./store";

const KEY = "gopasal.seller.selected-shop.v1";

export type SelectedShopState = {
  /** The shop the counter is working, or null before one has been chosen. */
  shopId: string | null;
  /** False until storage has been read. Distinguishes "none" from "not yet". */
  hydrated: boolean;
};

export type SelectedShopStore = {
  get(): string | null;
  set(shopId: string): Promise<void>;
  clear(): Promise<void>;
  hydrate(): Promise<void>;
  subscribe(listener: () => void): () => void;
  snapshot(): SelectedShopState;
};

export function createSelectedShopStore(store: KeyValueStore): SelectedShopStore {
  let shopId: string | null = null;
  let hydrated = false;
  let hydrating: Promise<void> | null = null;
  const listeners = new Set<() => void>();

  // `useSyncExternalStore` compares snapshots by identity, so the snapshot is a
  // stable object that is replaced only when the value actually changes.
  let snapshot: SelectedShopState = { shopId, hydrated };

  function emit() {
    // A write that changes nothing is not a change. Rebuilding the snapshot
    // unconditionally handed `useSyncExternalStore` a fresh object every time
    // `set` was called with the shop that was already selected, which is a
    // re-render of the whole shop-scoped tree for no news — and, in any caller
    // that reacts to the store by writing to it, a loop.
    if (snapshot.shopId === shopId && snapshot.hydrated === hydrated) return;
    snapshot = { shopId, hydrated };
    for (const listener of listeners) listener();
  }

  function hydrate(): Promise<void> {
    if (hydrated) return Promise.resolve();
    if (hydrating) return hydrating;
    hydrating = (async () => {
      try {
        const raw = await store.getItem(KEY);
        // A stored id is only ever a hint. It is checked against the membership
        // list before it is used, because a seller can be removed from a shop
        // between launches and the phone would otherwise keep asking about a
        // shop it is no longer allowed to see.
        //
        // `hydrated` is re-read rather than trusted from the entry check: a
        // `set` or `clear` that landed while this read was in flight has already
        // decided the answer, and adopting the stored id on top of it would
        // silently undo a shop the seller had just picked.
        if (!hydrated && typeof raw === "string" && raw.length > 0) shopId = raw;
      } catch {
        // An unreadable entry is not worth failing a launch over; the app asks
        // which shop instead, which is the same question it asks a new seller.
      }
      hydrated = true;
      emit();
    })();
    return hydrating;
  }

  return {
    get: () => shopId,
    snapshot: () => snapshot,

    async set(next: string) {
      shopId = next;
      hydrated = true;
      emit();
      try {
        await store.setItem(KEY, next);
      } catch {
        // The switch has already happened in memory; only its persistence is
        // best-effort, and the worst case is being asked again after a restart.
      }
    },

    async clear() {
      shopId = null;
      hydrated = true;
      emit();
      try {
        await store.removeItem(KEY);
      } catch {
        /* best effort — see above */
      }
    },

    hydrate,

    subscribe(listener: () => void) {
      listeners.add(listener);
      void hydrate();
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** The instance the app uses. Tests build their own on `memoryStore()`. */
export const selectedShopStore = createSelectedShopStore(asyncStorageStore);

/**
 * The stored choice as React state.
 *
 * Raw: it reports the id on disk and nothing about whether that shop is still
 * one the seller runs. `useSelectedShop` in `seller.ts` is the hook screens
 * want — it reconciles this against `GET /seller/shops` and invalidates the
 * shop-scoped cache on a switch.
 */
export function useSelectedShopId(): SelectedShopState {
  return React.useSyncExternalStore(
    selectedShopStore.subscribe,
    selectedShopStore.snapshot,
    selectedShopStore.snapshot,
  );
}
