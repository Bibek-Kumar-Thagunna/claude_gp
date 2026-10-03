/**
 * The arithmetic behind seller analytics, with no database in it.
 *
 * Everything in this file is a pure function over plain rows, for two reasons.
 * The first is that it can be tested exactly — a seller's "last 7 days" is a
 * statement about Nepal's calendar, and a boundary that is one day out is the kind
 * of bug that never shows up in a smoke test. The second is that the service can
 * then be a thin shop-scoped query layer, so the two halves fail for different,
 * obvious reasons.
 *
 * Two decisions are worth stating up front because every number below depends on
 * them:
 *
 * - **A day is a Nepal day.** Postgres stores these timestamps in UTC, and
 *   `date_trunc('day', …)` would therefore cut the day at 05:45 Kathmandu time —
 *   so a shop's evening trade would land on tomorrow's bar. Nepal Time is a fixed
 *   UTC+05:45 with no daylight saving, ever, so the offset is a constant rather
 *   than a timezone database lookup.
 * - **An order belongs to the day it was placed.** Not the day it was delivered.
 *   That is what a shopkeeper means by "Tuesday's orders", and `placedAt` is the
 *   only timestamp every order has. The consequence is stated honestly in the
 *   response: money from an order placed today and delivered tomorrow appears
 *   against today, so a recent day's sales figure can still rise.
 */

import type { OrderStatus, PaymentMethod } from '@prisma/client';

/** Nepal Time is UTC+05:45 and has never observed daylight saving. */
export const NEPAL_OFFSET_MINUTES = 345;
export const NEPAL_TIMEZONE = 'Asia/Kathmandu';

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

/** The periods the API accepts, and how many Nepal days each one covers. */
export const PERIOD_DAYS = { '7d': 7, '30d': 30, '90d': 90 } as const;
export type AnalyticsPeriod = keyof typeof PERIOD_DAYS;
export const ANALYTICS_PERIODS = Object.keys(PERIOD_DAYS) as AnalyticsPeriod[];

export function isAnalyticsPeriod(value: string): value is AnalyticsPeriod {
  return Object.prototype.hasOwnProperty.call(PERIOD_DAYS, value);
}

/* ------------------------------------------------------------------ Nepal days */

/** How many whole Nepal days have elapsed since the epoch at this instant. */
export function nepalDayIndex(at: Date): number {
  return Math.floor((at.getTime() + NEPAL_OFFSET_MINUTES * MS_PER_MINUTE) / MS_PER_DAY);
}

/** The UTC instant at which that Nepal day begins (its local midnight). */
export function nepalDayStart(dayIndex: number): Date {
  return new Date(dayIndex * MS_PER_DAY - NEPAL_OFFSET_MINUTES * MS_PER_MINUTE);
}

/** `YYYY-MM-DD` as written on a Nepali wall calendar (Gregorian, local date). */
export function nepalDayKey(dayIndex: number): string {
  const d = new Date(dayIndex * MS_PER_DAY);
  const month = `${d.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${d.getUTCDate()}`.padStart(2, '0');
  return `${d.getUTCFullYear()}-${month}-${day}`;
}

/** The Nepal calendar date an instant falls on. */
export function nepalDayKeyOf(at: Date): string {
  return nepalDayKey(nepalDayIndex(at));
}

/* --------------------------------------------------------------------- Window */

/**
 * The two half-open instant ranges a request covers.
 *
 * `[from, to)` is the requested period, counted in Nepal days and *including
 * today* — "7 days" means today plus the six before it, which is what a seller
 * asking "how was my week?" means. `[previousFrom, previousTo)` is the equal-length
 * stretch immediately before it, and `previousTo === from` exactly, so no order can
 * fall in both windows or between them.
 *
 * Today is still in progress, and the window before it is complete, so a
 * comparison made this morning is a part-day measured against a whole one. That
 * asymmetry is inherent to comparing "so far" with "all of", and it is disclosed by
 * returning the window instants themselves rather than hidden behind a single
 * percentage.
 */
export interface AnalyticsWindow {
  period: AnalyticsPeriod;
  days: number;
  from: Date;
  to: Date;
  previousFrom: Date;
  previousTo: Date;
  /** Every Nepal date in `[from, to)`, oldest first — the x-axis of the chart. */
  dayKeys: string[];
}

export function analyticsWindow(period: AnalyticsPeriod, now: Date): AnalyticsWindow {
  const days = PERIOD_DAYS[period];
  const today = nepalDayIndex(now);
  const firstDay = today - (days - 1);
  const dayKeys: string[] = [];
  for (let i = 0; i < days; i++) dayKeys.push(nepalDayKey(firstDay + i));
  return {
    period,
    days,
    from: nepalDayStart(firstDay),
    to: nepalDayStart(today + 1),
    previousFrom: nepalDayStart(firstDay - days),
    previousTo: nepalDayStart(firstDay),
    dayKeys,
  };
}

/* ---------------------------------------------------------------------- Facts */

/**
 * The only columns of an order these numbers need. Selecting exactly this much is
 * deliberate: an analytics screen has no business loading recipient names and
 * addresses, and a narrow `select` is also what keeps a 90-day window cheap.
 */
export interface OrderFact {
  placedAt: Date;
  total: number;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  refundAmount?: number;
}

/** One line of one order. `productId` is null once the product row is gone. */
export interface OrderItemFact {
  productId: string | null;
  nameSnapshot: string;
  price: number;
  qty: number;
}

/**
 * Money counts when the goods arrive.
 *
 * A placed-but-undelivered order is not revenue, a rejected one never was, and a
 * cancelled one stopped being. `DELIVERED` is the only status in the schema that
 * means the customer has the goods, so it is the only one that contributes to
 * sales. Order *counts* are reported separately for every status, so nothing is
 * hidden by this choice.
 */
export function isEarned(status: OrderStatus): boolean {
  return status === 'DELIVERED';
}

function isWriteOff(status: OrderStatus): boolean {
  return status === 'CANCELLED' || status === 'REJECTED';
}

/* -------------------------------------------------------------------- Summary */

/**
 * `sales` is the sum of `Order.total` over delivered orders, which is what the
 * customer paid: goods, minus any coupon, plus the shop's own delivery fee. It is
 * **not** the shop's net earnings — there is no commission, fee or settlement
 * column anywhere in the schema, so net take-home is not a number this API can
 * produce, and it does not pretend to.
 *
 * `averageOrderValue` is null rather than 0 when nothing was delivered: the average
 * of no orders does not exist, and printing "रु 0" would read as "your orders are
 * worthless" instead of "there weren't any".
 */
export interface AnalyticsSummary {
  sales: number;
  grossSales: number;
  refunds: number;
  netSales: number;
  ordersPlaced: number;
  ordersDelivered: number;
  ordersCancelled: number;
  ordersInProgress: number;
  averageOrderValue: number | null;
}

/** Summarising needs a status and an amount; it has no interest in the rest. */
export type SummarisableOrder = Pick<OrderFact, 'status' | 'total' | 'refundAmount'>;

export function summarise(orders: SummarisableOrder[]): AnalyticsSummary {
  let sales = 0;
  let refunds = 0;
  let delivered = 0;
  let cancelled = 0;
  for (const o of orders) {
    if (isEarned(o.status)) {
      sales += o.total;
      refunds += o.refundAmount ?? 0;
      delivered += 1;
    } else if (isWriteOff(o.status)) {
      cancelled += 1;
    }
  }
  return {
    sales,
    grossSales: sales,
    refunds,
    netSales: sales - refunds,
    ordersPlaced: orders.length,
    ordersDelivered: delivered,
    ordersCancelled: cancelled,
    ordersInProgress: orders.length - delivered - cancelled,
    averageOrderValue: delivered === 0 ? null : Math.round(sales / delivered),
  };
}

/**
 * The same summary, built from a `groupBy(['status'])` result instead of rows.
 *
 * The previous window exists only to be compared against, so pulling every one of
 * its orders across the wire to add them up would be wasteful — a 90-day comparison
 * would double the rows fetched for three numbers. Postgres can group and sum it in
 * place, and this function turns that result back into the identical shape, so the
 * comparison arithmetic has exactly one implementation.
 *
 * `_sum.total` is null for a status with no rows, which cannot occur in a group that
 * exists, but the type admits it and `?? 0` is cheaper than an assertion.
 *
 * A spec asserts that this and {@link summarise} agree on the same orders; if they
 * ever drift, the delta chips would disagree with the figure above them.
 */
export interface StatusGroup {
  status: OrderStatus;
  _count: { _all: number };
  _sum: { total: number | null };
}

export function summariseGroups(groups: StatusGroup[]): AnalyticsSummary {
  let sales = 0;
  let placed = 0;
  let delivered = 0;
  let cancelled = 0;
  for (const g of groups) {
    const count = g._count._all;
    placed += count;
    if (isEarned(g.status)) {
      sales += g._sum.total ?? 0;
      delivered += count;
    } else if (isWriteOff(g.status)) {
      cancelled += count;
    }
  }
  return {
    sales,
    grossSales: sales,
    refunds: 0,
    netSales: sales,
    ordersPlaced: placed,
    ordersDelivered: delivered,
    ordersCancelled: cancelled,
    ordersInProgress: placed - delivered - cancelled,
    averageOrderValue: delivered === 0 ? null : Math.round(sales / delivered),
  };
}

/* ----------------------------------------------------------------- Comparison */
/**
 * Percentage movement against the previous window, or `null` when there is nothing
 * to compare with.
 *
 * A shop's first week has no "before". Reporting 0% there would claim the business
 * is flat when the truth is that the question does not apply, and reporting 100%
 * would be arithmetic on a divisor of zero. `null` is the honest answer, and the
 * console shows no delta chip at all when it sees one.
 */
export function changePercent(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export interface AnalyticsComparison {
  salesChangePercent: number | null;
  ordersChangePercent: number | null;
  averageOrderValueChangePercent: number | null;
}

export function compare(current: AnalyticsSummary, previous: AnalyticsSummary): AnalyticsComparison {
  return {
    salesChangePercent: changePercent(current.sales, previous.sales),
    ordersChangePercent: changePercent(current.ordersPlaced, previous.ordersPlaced),
    averageOrderValueChangePercent:
      current.averageOrderValue === null || previous.averageOrderValue === null
        ? null
        : changePercent(current.averageOrderValue, previous.averageOrderValue),
  };
}

/* --------------------------------------------------------------------- Series */

export interface SalesPoint {
  /** Nepal calendar date, `YYYY-MM-DD`. */
  date: string;
  sales: number;
  gross: number;
  refunds: number;
  net: number;
  orders: number;
}

/**
 * One point per Nepal day in the window, including the days nothing happened —
 * a chart with gaps closed up would silently compress a quiet week into a busy
 * shape. Zero here means "no orders that day", which is a fact, not a placeholder.
 */
export function buildSeries(orders: OrderFact[], dayKeys: string[]): SalesPoint[] {
  const byDay = new Map<string, SalesPoint>();
  for (const date of dayKeys) byDay.set(date, { date, sales: 0, gross: 0, refunds: 0, net: 0, orders: 0 });
  for (const o of orders) {
    const point = byDay.get(nepalDayKeyOf(o.placedAt));
    // An order outside the window cannot happen — the query is bounded by the same
    // instants — but if it ever did, dropping it is better than inventing a bucket.
    if (!point) continue;
    point.orders += 1;
    if (isEarned(o.status)) {
      point.sales += o.total;
      point.gross += o.total;
      point.refunds += o.refundAmount ?? 0;
      point.net = point.gross - point.refunds;
    }
  }
  return dayKeys.map((date) => byDay.get(date) ?? { date, sales: 0, gross: 0, refunds: 0, net: 0, orders: 0 });
}

/* ------------------------------------------------------------------- Payments */

/**
 * How the window's orders were meant to be paid for, and how much of that reached
 * a delivered order.
 *
 * `codCollected` is the value of **delivered** COD orders. It is deliberately not
 * read from `Delivery.codCollected` / `Delivery.codAmount`, even though those
 * columns exist, because only one of the two code paths that can complete a
 * delivery writes them: `DeliveryService.applyStatus` sets them when a rider
 * finishes a run, while `OrdersService.transition` marks the delivery row DELIVERED
 * with an `updateMany` that touches neither. Summing `codAmount` would therefore
 * report less cash than the shop actually took, which is worse than not reporting
 * it at that grain at all.
 *
 * It is equally not read from `Order.paymentStatus`: that column is set to PAID for
 * a COD order by the mere act of delivering it, so it carries no information beyond
 * the status already in hand. Nothing in the schema records a shopkeeper counting
 * the money, so this figure is cash *due on delivered orders* — not a settlement,
 * not a payout, and labelled that way in the console.
 */
export interface PaymentSplit {
  codOrders: number;
  codCollected: number;
  onlineOrders: number;
  onlineDelivered: number;
}

export function paymentSplit(orders: OrderFact[]): PaymentSplit {
  let codOrders = 0;
  let codCollected = 0;
  let onlineOrders = 0;
  let onlineDelivered = 0;
  for (const o of orders) {
    if (o.paymentMethod === 'COD') {
      codOrders += 1;
      if (isEarned(o.status)) codCollected += o.total;
    } else {
      onlineOrders += 1;
      if (isEarned(o.status)) onlineDelivered += o.total;
    }
  }
  return { codOrders, codCollected, onlineOrders, onlineDelivered };
}

/* --------------------------------------------------------------- Top products */

export interface TopProduct {
  /** Null when the product row has since been deleted; the name still stands. */
  productId: string | null;
  name: string;
  unitsSold: number;
  /** Line value: `price × qty` summed. See the note below on why it is not sales. */
  revenue: number;
}

/**
 * The best-selling lines of the window, from delivered orders only.
 *
 * `revenue` is the sum of `price × qty` on the order lines, using the price
 * snapshotted at the time of sale. It excludes the delivery fee and it is taken
 * before any order-level coupon discount, because a coupon applies to the order and
 * there is no honest way to divide it across lines. So the top-products column does
 * **not** add up to `summary.sales`, and the console never presents the two as if it
 * should.
 *
 * Lines are grouped by product, not by variant: a shopkeeper asking what sells wants
 * "Basmati rice", not "Basmati rice — 5 kg" three times. The display name comes from
 * the product row when it still exists (`names`), because `nameSnapshot` carries the
 * variant suffix and would otherwise label the whole product with one variant's name.
 * When the product is gone, the snapshot is all that is left and is used as-is.
 */
export function topProducts(
  items: OrderItemFact[],
  names: Map<string, string>,
  limit: number,
): TopProduct[] {
  const byKey = new Map<string, TopProduct>();
  for (const it of items) {
    const key = it.productId ?? `deleted:${it.nameSnapshot}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.unitsSold += it.qty;
      existing.revenue += it.price * it.qty;
      continue;
    }
    byKey.set(key, {
      productId: it.productId,
      name: (it.productId !== null ? names.get(it.productId) : undefined) ?? it.nameSnapshot,
      unitsSold: it.qty,
      revenue: it.price * it.qty,
    });
  }
  return [...byKey.values()]
    .sort((a, b) => b.revenue - a.revenue || b.unitsSold - a.unitsSold || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** How many rows `topProducts` returns; the console shows all of them. */
export const TOP_PRODUCTS_LIMIT = 8;

/* ------------------------------------------------------------------- By shop */

/**
 * The same order, plus the shop it belongs to. Only the consolidated route needs
 * this; a single-shop request already knows the answer.
 */
export interface ShopOrderFact extends OrderFact {
  shopId: string;
}

/**
 * One shop's slice of a consolidated window.
 *
 * This is what replaces the seller console's per-shop cards, which until now were
 * fixtures. It is computed from the rows already fetched for the totals — one query,
 * not one per shop — which is also why the brief's "do not fan out" instruction costs
 * nothing here.
 *
 * A shop with no orders in the window still gets a row, with zeros and a null average.
 * That is a fact about a quiet fortnight, not a missing measurement, and omitting the
 * shop would make it look as though the seller does not own it.
 */
export interface ShopSlice {
  shopId: string;
  summary: AnalyticsSummary;
  payments: PaymentSplit;
}

export function summariseByShop(orders: ShopOrderFact[], shopIds: string[]): ShopSlice[] {
  const buckets = new Map<string, ShopOrderFact[]>();
  for (const id of shopIds) buckets.set(id, []);
  for (const o of orders) {
    // A shop outside the permitted set cannot appear — the query is bounded by the
    // same ids — but if it ever did, it must not be summarised into the response.
    buckets.get(o.shopId)?.push(o);
  }
  return shopIds.map((shopId) => {
    const rows = buckets.get(shopId) ?? [];
    return { shopId, summary: summarise(rows), payments: paymentSplit(rows) };
  });
}
