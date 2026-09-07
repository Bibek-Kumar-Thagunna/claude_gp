"use client";

/**
 * Which shops this seller has, and which one they are looking at.
 *
 * This is the console's shop identity, and it is now the API's: the list comes
 * from `GET /seller/shops` and is merged with `GET /auth/me`'s `access.shops[]`
 * for the lifecycle restrictions. Nothing here is sample data, and there is no
 * fallback shop — a seller with no shops sees zero shops, because a console that
 * shows a shop the account does not have teaches the wrong thing about every
 * screen after it.
 *
 * `activeShopId === null` is the consolidated "All shops" view, not an absence:
 * a Master Merchant (SRS Phase 13) works across shops and the switcher offers
 * that as a first-class choice. It is deliberately `null` rather than the string
 * `"all"` so it can never be mistaken for a shop id and passed to an API call.
 *
 * Ordering with the rest of the tree matters: this provider reads `useAuth()`,
 * so it must be mounted inside `AuthProvider`; `SellerProvider` reads this one,
 * so it must be mounted inside this. See `app/layout.tsx`.
 */

import * as React from "react";
import { ApiError } from "@gopasal/api-client";
import { useAuth } from "@/components/auth-provider";
import { asApiError } from "@/lib/api/client";
import { listMyShops, type SellerShopWire } from "@/lib/api/shops";
import { toSellerShops, type SellerShop } from "@/lib/shop-view";

/** Where the chosen shop is remembered between visits. */
const STORAGE_KEY = "gp-seller-active-shop";
/** The value stored for the consolidated view — a word no cuid can collide with. */
const ALL_SHOPS = "all";

type ShopCtx = {
  /** Every shop this account is an active member of, live ones first. */
  shops: SellerShop[];
  /** The shop in scope, or null for the consolidated view. */
  activeShop: SellerShop | null;
  /** Its id, or null for the consolidated view. A real shop id — safe to send. */
  activeShopId: string | null;
  /** Shop ids the current scope covers: one, or all of them. */
  scopedShopIds: string[];
  /** Choose a shop, or null for consolidated. Ignores ids that are not ours. */
  switchShop: (shopId: string | null) => void;
  /** True while the first list is in flight. Never true again after a reload. */
  loading: boolean;
  /** Non-null when the list could not be read. The console says so; it invents nothing. */
  error: ApiError | null;
  /** Re-read the list, e.g. after a shop is approved. */
  reload: () => Promise<void>;
  shopById: (shopId: string) => SellerShop | undefined;
};

const ShopContext = React.createContext<ShopCtx | null>(null);

export function useShops(): ShopCtx {
  const ctx = React.useContext(ShopContext);
  if (!ctx) throw new Error("useShops must be used within ShopProvider");
  return ctx;
}

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(value: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* private mode, or storage full — the choice just will not survive a reload */
  }
}

export function ShopProvider({ children }: { children: React.ReactNode }) {
  const { status, shops: access } = useAuth();

  // The wire rows are held as fetched, and the view model is derived. Keeping
  // them apart means a fresh `/auth/me` — a re-login, a refreshed token — folds
  // new restrictions into the existing list without re-fetching it.
  const [rows, setRows] = React.useState<SellerShopWire[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<ApiError | null>(null);
  // `undefined` = nothing chosen yet, so a default is still allowed to apply.
  // `null` = the seller chose the consolidated view, and we must not override it.
  const [selected, setSelected] = React.useState<string | null | undefined>(undefined);

  const shops = React.useMemo(() => toSellerShops(rows, access), [rows, access]);

  // Restore the previous choice once, on the client only: reading storage during
  // render would make the server and client disagree and break hydration. It is
  // validated against the loaded list further down, so a stale id is harmless.
  React.useEffect(() => {
    const stored = readStored();
    if (stored === ALL_SHOPS) setSelected(null);
    else if (stored) setSelected(stored);
  }, []);

  const load = React.useCallback(async (signal?: AbortSignal): Promise<void> => {
    try {
      const wire = await listMyShops(signal);
      if (signal?.aborted) return;
      setRows(wire);
      setError(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      // A 401 is not ours to handle: `authedRequest` has already tried the
      // refresh token, and `AuthProvider` owns signing the seller out.
      setError(asApiError(err));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (status === "loading") return;
    if (status === "anonymous") {
      setRows([]);
      setError(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    void load(controller.signal);
    return () => controller.abort();
  }, [status, load]);

  /**
   * The chosen shop, but only if it is still one of ours.
   *
   * A stored id can outlive the membership that justified it — staff removed
   * from a shop, a shop rejected. Resolving through the list means a scope can
   * never name a shop the API would refuse, which is exactly the mistake the
   * fixture ids used to make possible.
   */
  const activeShopId = React.useMemo<string | null>(() => {
    if (selected === null) return null;
    if (selected && shops.some((s) => s.id === selected)) return selected;
    // One shop is not a portfolio: open it rather than a consolidated view of it.
    if (shops.length === 1) return shops[0]?.id ?? null;
    return null;
  }, [selected, shops]);

  const activeShop = React.useMemo(
    () => shops.find((s) => s.id === activeShopId) ?? null,
    [shops, activeShopId],
  );

  const scopedShopIds = React.useMemo(
    () => (activeShopId ? [activeShopId] : shops.map((s) => s.id)),
    [activeShopId, shops],
  );

  /**
   * Record the choice. It is not validated here on purpose — `activeShopId`
   * resolves every id against the loaded list, so an id we do not have simply
   * never becomes the active shop, and there is one place that decides rather
   * than two that could disagree.
   */
  const switchShop = React.useCallback((shopId: string | null) => {
    setSelected(shopId);
    writeStored(shopId ?? ALL_SHOPS);
  }, []);

  const shopById = React.useCallback(
    (shopId: string) => shops.find((s) => s.id === shopId),
    [shops],
  );

  const value = React.useMemo<ShopCtx>(
    () => ({
      shops,
      activeShop,
      activeShopId,
      scopedShopIds,
      switchShop,
      loading,
      error,
      reload: () => load(),
      shopById,
    }),
    [shops, activeShop, activeShopId, scopedShopIds, switchShop, loading, error, load, shopById],
  );

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}
