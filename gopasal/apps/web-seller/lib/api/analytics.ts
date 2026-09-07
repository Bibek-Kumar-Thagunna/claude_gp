/**
 * Seller analytics: the numbers behind the dashboard and the analytics page.
 *
 * Backed by `apps/api/src/modules/analytics/analytics.seller.controller.ts`. Two
 * routes, same response shape, different authorisation:
 *
 * - `GET /seller/shops/:shopId/analytics/overview` — gated on `analytics.view` for
 *   that shop, so the caller must hold it **there**, not merely somewhere.
 * - `GET /seller/analytics/overview` — the consolidated "All shops" view. It is not
 *   permission-gated at the route (a SHOP-scoped key with no `:shopId` is an
 *   unconditional deny in the guard), so the API filters internally to the shops the
 *   caller may read and reports which ones in `shopIds`. It returns 403 only when the
 *   caller belongs to shops but holds `analytics.view` in none of them.
 *
 * `?period=` is `7d | 30d | 90d` and nothing else. `forbidNonWhitelisted` is on, so a
 * fourth value or a second parameter is a 400 rather than a silent fallback.
 *
 * **What every number here means**, because most of the honesty in this feature is in
 * the definitions rather than the arithmetic:
 *
 * - **A day is a Nepal day.** The API computes boundaries from a fixed UTC+05:45, so
 *   an order placed at 9pm in Kathmandu lands on that evening's bar and not on
 *   tomorrow's. `timezone` and `window` come back in the payload so the console can
 *   state the boundary rather than imply one.
 * - **An order belongs to the day it was placed**, not delivered. So a recent day's
 *   sales figure can still rise as today's orders complete.
 * - **`summary.sales` is delivered money only** — the sum of `Order.total` over
 *   DELIVERED orders. That is what the customer paid: goods, less any coupon, plus the
 *   shop's own delivery fee. It is **not** take-home: there is no commission, fee or
 *   settlement column anywhere in the schema, so net earnings are not a number this
 *   API can produce and the console must not imply one.
 * - **`averageOrderValue` and every `…ChangePercent` are `null`, never 0**, when the
 *   question does not apply (nothing delivered; nothing in the previous window to
 *   compare against). Render nothing, not a zero.
 * - **`topProducts[].revenue` does not add up to `summary.sales`.** It is `price × qty`
 *   on delivered order lines at the price snapshotted at sale, which excludes the
 *   delivery fee and precedes any order-level coupon discount — a coupon applies to
 *   the order and cannot honestly be split across lines.
 * - **`payments.codCollected` is cash *due* on delivered COD orders.** Nothing in the
 *   schema records a shopkeeper counting the money: `Delivery.codAmount` is written by
 *   the rider path only (`OrdersService.transition` marks a delivery DELIVERED without
 *   it, so a sum would under-report), and `Order.paymentStatus` flips to PAID merely by
 *   delivering. So this is not a settlement, not a payout, and must never be labelled
 *   as one. Settlement and payouts do not exist in the API at all.
 * - **`openOrders` ignores the period.** Work waiting right now is waiting regardless
 *   of which window is on screen, and an order placed before the window opened is no
 *   less urgent for it.
 * - **`inventory` has no `lowStock`, deliberately.** `Product` carries `trackStock` and
 *   `stock` and no threshold of any kind, so "running low" would be a number this
 *   platform invented and then presented as the seller's data. Out-of-stock needs no
 *   threshold — checkout genuinely refuses those lines — and `untrackedProducts` is the
 *   honest counterweight: for those products GoPasal holds no stock opinion at all.
 * - **`byShop` is present only on the consolidated route.** It comes out of the same
 *   single fetch, which is why "All shops" costs one request rather than one per shop.
 *
 * There is no forecast, no target, no uplift, no conversion rate, no traffic or
 * views count, no repeat-customer figure and no per-coupon attribution anywhere in
 * this payload, because none of those exist in the database.
 */

import { authedRequest } from "./client";

/* -------------------------------------------------------------------- Periods */

/** The only three windows the API accepts. */
export const ANALYTICS_PERIODS = ["7d", "30d", "90d"] as const;
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number];

export const PERIOD_LABELS: Record<AnalyticsPeriod, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
};

/*
 * There is deliberately no `isAnalyticsPeriod` guard. Nothing needed to widen a
 * `string` back into the union: the period is chosen from `ANALYTICS_PERIODS` by
 * the segmented control on /analytics and never arrives from a URL, a form or
 * storage, so it is already `AnalyticsPeriod` at every call site.
 */

/* ---------------------------------------------------------------------- Types */

/** Sums over the window. `averageOrderValue` is null when nothing was delivered. */
export type AnalyticsSummaryWire = {
  /** Delivered money, in rupees. */
  sales: number;
  ordersPlaced: number;
  ordersDelivered: number;
  /** CANCELLED + REJECTED. */
  ordersCancelled: number;
  /** Placed, not yet delivered, not written off. */
  ordersInProgress: number;
  averageOrderValue: number | null;
};

/** Movement against the equal-length window before this one. Null = no basis. */
export type AnalyticsComparisonWire = {
  salesChangePercent: number | null;
  ordersChangePercent: number | null;
  averageOrderValueChangePercent: number | null;
};

/** One Nepal day. Zeros are facts: the shop took no orders that day. */
export type SalesPointWire = { date: string; sales: number; orders: number };

export type TopProductWire = {
  /** Null once the product row is gone; `name` is then the snapshot it sold as. */
  productId: string | null;
  name: string;
  unitsSold: number;
  /** Line value at snapshotted prices. Not a share of `summary.sales`. */
  revenue: number;
};

export type PaymentSplitWire = {
  codOrders: number;
  /** Value of *delivered* COD orders — cash due, not cash counted. */
  codCollected: number;
  onlineOrders: number;
  onlineDelivered: number;
};

/** Period-independent snapshot of work in hand. */
export type OpenOrdersWire = {
  total: number;
  awaitingAcceptance: number;
  preparing: number;
  outForDelivery: number;
};

/** No `lowStock` — see the note at the top of this file. */
export type InventoryHealthWire = {
  activeProducts: number;
  outOfStockProducts: number;
  outOfStockVariants: number;
  untrackedProducts: number;
};

export type ShopSliceWire = {
  shopId: string;
  summary: AnalyticsSummaryWire;
  payments: PaymentSplitWire;
};

export type AnalyticsOverviewWire = {
  period: AnalyticsPeriod;
  days: number;
  /** IANA name the API used for day boundaries: `Asia/Kathmandu`. */
  timezone: string;
  /** ISO instants. `previousTo === from` exactly, so the windows abut. */
  window: { from: string; to: string; previousFrom: string; previousTo: string };
  /** The shops actually included — on "All shops", the permitted subset. */
  shopIds: string[];
  summary: AnalyticsSummaryWire;
  comparison: AnalyticsComparisonWire;
  salesSeries: SalesPointWire[];
  topProducts: TopProductWire[];
  payments: PaymentSplitWire;
  openOrders: OpenOrdersWire;
  inventory: InventoryHealthWire;
  /** Consolidated route only. */
  byShop?: ShopSliceWire[];
};

/* ---------------------------------------------------------------------- Reads */

/** One shop. Needs `analytics.view` on that shop; use `canInShop`, never `can`. */
export function fetchShopAnalytics(
  shopId: string,
  period: AnalyticsPeriod,
  signal?: AbortSignal,
): Promise<AnalyticsOverviewWire> {
  return authedRequest<AnalyticsOverviewWire>(
    `/seller/shops/${encodeURIComponent(shopId)}/analytics/overview?period=${period}`,
    { signal },
  );
}

/**
 * Every shop the caller may read, consolidated by the API in one query.
 *
 * Do not emulate this by calling {@link fetchShopAnalytics} per shop: a failed leg
 * would silently understate the total, and the per-shop split in `byShop` already
 * comes back from this one request.
 */
export function fetchSellerAnalytics(
  period: AnalyticsPeriod,
  signal?: AbortSignal,
): Promise<AnalyticsOverviewWire> {
  return authedRequest<AnalyticsOverviewWire>(`/seller/analytics/overview?period=${period}`, {
    signal,
  });
}
