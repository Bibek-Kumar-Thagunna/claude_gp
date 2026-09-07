/**
 * The seller console's view of its own analytics.
 *
 * The API already returns honest, fully-formed numbers, so there is very little
 * arithmetic here — this file exists to do the two things a view model should: turn
 * wire values into the exact strings the screen prints, and refuse to print anything
 * the wire did not contain.
 *
 * The rules it enforces:
 *
 * - **A null is a silence, not a zero.** `averageOrderValue` and the three change
 *   percentages come back `null` when the question does not apply. Every helper here
 *   returns `undefined` in that case so the component renders no chip and no figure,
 *   rather than "रु 0" or "0%".
 * - **A date label is a Nepal date.** `salesSeries[].date` is `YYYY-MM-DD` on Nepal's
 *   calendar. It is formatted by splitting the string, never by `new Date(date)`, which
 *   would parse as UTC midnight and then print the previous day for any viewer west of
 *   Greenwich.
 * - **No label the backend cannot justify.** There is no "settlement", no "payout", no
 *   "net earnings" and no "low stock" wording anywhere in here, because there is no
 *   column behind any of them.
 */

import type {
  AnalyticsOverviewWire,
  AnalyticsPeriod,
  InventoryHealthWire,
  SalesPointWire,
} from "./api/analytics";
import { PERIOD_LABELS } from "./api/analytics";
import { num, rs } from "./format";

/* ---------------------------------------------------------------------- Dates */

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * `2026-08-24` → `24 Aug`, by string surgery.
 *
 * Deliberately not `new Date(date).toLocaleDateString()`: that parses a bare date as
 * UTC midnight, so a browser in, say, New York would render the day before. The value
 * is already a Nepal calendar date and needs no timezone maths at all.
 */
export function dayLabel(date: string): string {
  const [y, m, d] = date.split("-");
  const monthIndex = Number(m) - 1;
  const month = MONTHS[monthIndex];
  if (y === undefined || d === undefined || month === undefined) return date;
  return `${Number(d)} ${month}`;
}

/** `2026-08-24` → `24 Aug 2026`, for the window disclosure line. */
export function fullDayLabel(date: string): string {
  const year = date.split("-")[0];
  return year === undefined ? date : `${dayLabel(date)} ${year}`;
}

/**
 * How many x-axis labels to draw, so 90 bars do not turn into 90 unreadable strings.
 *
 * The bars themselves are always all there — thinning the *labels* hides no data,
 * whereas aggregating 90 days into 13 weekly bars would change what is on screen.
 */
export function labelStride(count: number): number {
  if (count <= 10) return 1;
  if (count <= 31) return 5;
  return 10;
}

/**
 * The Nepal dates the window covers, as one sentence. Derived from the series rather
 * than from `window.from`, which is a UTC instant and would need converting back.
 */
function windowLabel(series: SalesPointWire[]): string | undefined {
  const first = series.at(0)?.date;
  const last = series.at(-1)?.date;
  if (first === undefined || last === undefined) return undefined;
  return `${fullDayLabel(first)} – ${fullDayLabel(last)}`;
}

/* --------------------------------------------------------------------- Deltas */

/**
 * A change percentage as a chip, or `undefined` when there is nothing to compare
 * against.
 *
 * `StatCard` takes `delta?: number` and draws a ± chip from it, so returning
 * `undefined` is what makes the chip disappear entirely. That is the whole point: the
 * first week a shop trades has no "before", and a 0% chip would claim it was flat.
 */
export function delta(value: number | null): number | undefined {
  return value === null ? undefined : value;
}

/** Money, or an em dash when the average does not exist. */
export function moneyOrDash(value: number | null): string {
  return value === null ? "—" : rs(value);
}

/* ------------------------------------------------------------------ Inventory */

export type InventoryWarning = {
  id: string;
  label: string;
  count: number;
  tone: "red" | "marigold" | "ink";
  hint: string;
};

/**
 * The inventory facts worth surfacing, and only those.
 *
 * Each row is a count the database can defend. There is no "low stock" row: `Product`
 * has no threshold column, so any such number would be one this console chose. A shop
 * with nothing out of stock gets an empty list and the component says so.
 */
export function inventoryWarnings(inv: InventoryHealthWire): InventoryWarning[] {
  const rows: InventoryWarning[] = [];
  if (inv.outOfStockProducts > 0) {
    rows.push({
      id: "products",
      label: inv.outOfStockProducts === 1 ? "Product out of stock" : "Products out of stock",
      count: inv.outOfStockProducts,
      tone: "red",
      hint: "Stock-tracked products sitting at zero. Customers cannot order these.",
    });
  }
  if (inv.outOfStockVariants > 0) {
    rows.push({
      id: "variants",
      label: inv.outOfStockVariants === 1 ? "Variant out of stock" : "Variants out of stock",
      count: inv.outOfStockVariants,
      tone: "marigold",
      hint: "Individual sizes or packs at zero, on products that are otherwise live.",
    });
  }
  if (inv.untrackedProducts > 0) {
    rows.push({
      id: "untracked",
      label: inv.untrackedProducts === 1 ? "Product without stock tracking" : "Products without stock tracking",
      count: inv.untrackedProducts,
      tone: "ink",
      hint: "GoPasal does not track stock for these, so it cannot warn you about them.",
    });
  }
  return rows;
}

/* --------------------------------------------------------------------- Shapes */

/** A per-shop row for the consolidated view, with the shop's real name attached. */
export type ShopRow = {
  shopId: string;
  name: string;
  sales: number;
  ordersPlaced: number;
  ordersDelivered: number;
  averageOrderValue: number | null;
  codCollected: number;
  /** Share of the consolidated delivered total, 0–100. Null when nothing sold. */
  sharePercent: number | null;
};

/**
 * The `byShop` split, joined to shop names and ordered by sales.
 *
 * `nameOf` comes from `useShops()`; a shop the switcher does not know about keeps its
 * id rather than being dropped, because the money is real either way.
 */
export function shopRows(
  overview: AnalyticsOverviewWire,
  nameOf: (shopId: string) => string | undefined,
): ShopRow[] {
  const slices = overview.byShop ?? [];
  const total = overview.summary.sales;
  return slices
    .map((s) => ({
      shopId: s.shopId,
      name: nameOf(s.shopId) ?? s.shopId,
      sales: s.summary.sales,
      ordersPlaced: s.summary.ordersPlaced,
      ordersDelivered: s.summary.ordersDelivered,
      averageOrderValue: s.summary.averageOrderValue,
      codCollected: s.payments.codCollected,
      sharePercent: total === 0 ? null : Math.round((s.summary.sales / total) * 1000) / 10,
    }))
    .sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name));
}

/* ---------------------------------------------------------------------- Prose */

/**
 * The zone the API says it computed day boundaries in, said the way a shopkeeper
 * would say it.
 *
 * The phrase is derived from `overview.timezone` rather than written out, because
 * "Nepal time" was previously a constant in this file: if the API ever computed in
 * another zone, the console would have gone on claiming Nepal and the seller would
 * have had no way to tell. An unrecognised zone is printed verbatim — worse copy
 * than "Nepal time", and the correct answer, because it is what the server said.
 */
const NEPAL_TIMEZONE = "Asia/Kathmandu";
function timezoneLabel(timezone: string): string {
  return timezone === NEPAL_TIMEZONE ? "Nepal time" : timezone;
}

/** "7 days · 20 Aug 2026 – 26 Aug 2026 · Nepal time" — what was actually measured. */
export function measuredLabel(overview: AnalyticsOverviewWire): string {
  const span = windowLabel(overview.salesSeries);
  const period = PERIOD_LABELS[overview.period];
  const zone = timezoneLabel(overview.timezone);
  return span === undefined ? `${period} · ${zone}` : `${period} · ${span} · ${zone}`;
}

/** How many shops a consolidated figure covers, said plainly. */
export function coverageLabel(overview: AnalyticsOverviewWire): string {
  const n = overview.shopIds.length;
  if (n === 0) return "No shops";
  if (n === 1) return "1 shop";
  return `${num(n)} shops`;
}

export type { AnalyticsPeriod };
