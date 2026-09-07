"use client";

import * as React from "react";
import { ApiError } from "@gopasal/api-client";
import { useAuth } from "@/components/auth-provider";
import { useShops } from "@/components/shop-provider";
import { asApiError } from "@/lib/api/client";
import {
  fetchSellerAnalytics,
  fetchShopAnalytics,
  type AnalyticsOverviewWire,
  type AnalyticsPeriod,
} from "@/lib/api/analytics";

/**
 * The one place either analytics screen fetches from.
 *
 * Three decisions live here rather than in the pages, because getting any of them
 * wrong is a security or honesty bug rather than a layout bug:
 *
 * 1. **Which route.** With a shop in scope it reads that shop's route; on "All shops"
 *    it reads the consolidated route, which the API answers in a single query over the
 *    shops the caller may see. It never fans out one request per shop — a failed leg
 *    would silently understate the total, and `byShop` already comes back from the one
 *    request.
 * 2. **Whether to ask at all.** `analytics.view` is a SHOP-scoped key held by Owner and
 *    Manager only, so `useSeller().can` — which degrades to "anywhere" on the
 *    consolidated view — is the wrong question. This hook asks `canInShop` per shop and,
 *    when the answer is no everywhere in scope, reports `denied` without issuing a
 *    request. That turns a 403 the seller cannot act on into a sentence they can read.
 * 3. **Refetching on the period.** `period` is part of the dependency list, so the
 *    7/30/90 switch is a real refetch and not a client-side reslice of seven days.
 *
 * `denied` and `data === null` are different states and the pages render them
 * differently: the first means "not yours to see", the second means "still loading, or
 * it failed". Neither ever falls back to zeros.
 */
export type AnalyticsState = {
  data: AnalyticsOverviewWire | null;
  loading: boolean;
  error: ApiError | null;
  /** True when no shop in scope grants `analytics.view`. No request was made. */
  denied: boolean;
  /** Shops in scope the caller may read analytics for. */
  readableShopIds: string[];
  reload: () => void;
};

export function useAnalytics(period: AnalyticsPeriod): AnalyticsState {
  const { canInShop } = useAuth();
  const { activeShopId, scopedShopIds } = useShops();

  const readableShopIds = React.useMemo(
    () => scopedShopIds.filter((id) => canInShop(id, "analytics.view")),
    [scopedShopIds, canInShop],
  );
  const readableKey = readableShopIds.join(",");

  const [data, setData] = React.useState<AnalyticsOverviewWire | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<ApiError | null>(null);
  const [nonce, setNonce] = React.useState(0);

  const denied = readableKey === "" || (activeShopId !== null && !readableShopIds.includes(activeShopId));

  React.useEffect(() => {
    if (denied) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const request =
      activeShopId === null
        ? fetchSellerAnalytics(period, ctrl.signal)
        : fetchShopAnalytics(activeShopId, period, ctrl.signal);
    request
      .then((overview) => {
        if (ctrl.signal.aborted) return;
        setData(overview);
        setError(null);
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setError(asApiError(err));
        setData(null);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
    // `readableKey` is in the list so that a permission change re-asks; it is a string
    // rather than the array so an identical set does not retrigger every render.
  }, [activeShopId, period, denied, readableKey, nonce]);

  const reload = React.useCallback(() => setNonce((n) => n + 1), []);

  return { data, loading, error, denied, readableShopIds, reload };
}
