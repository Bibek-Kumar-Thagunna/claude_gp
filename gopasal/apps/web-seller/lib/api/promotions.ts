/**
 * Seller-side coupons — the whole of "Promotions" that the API actually has.
 *
 * Backed by `apps/api/src/modules/coupons/coupons.seller.controller.ts`,
 * `@Controller('seller/shops/:shopId/coupons')`. Four routes, no more: list,
 * create, patch, deactivate. `GET` needs `promotions.view`; the three writes need
 * `promotions.manage`. Both keys are `SHOP` scope, resolved by `PermissionsGuard`
 * from the `:shopId` in the path.
 *
 * Things that shape every screen built on this:
 *
 * - **There is no sponsored-listing endpoint.** `model SponsoredListing` exists in
 *   the schema and nothing in `apps/api/src` reads or writes it — no controller, no
 *   service, no admin route. The permission label says "Manage coupons & sponsored",
 *   which is the only place the word appears outside the schema. A toggle for it
 *   would be a switch wired to nothing.
 * - **No analytics of any kind.** The row carries `usedCount`, an integer the
 *   order transaction increments. That is a real number and it is the only one:
 *   there is no revenue attributed to a coupon, no redemption timeline, no
 *   per-coupon order list. `CouponRedemption` rows exist (with `amount`) but no
 *   route exposes them to a seller.
 * - **The list is paged, searched and filtered by the server.**
 *   `GET` takes `?page&limit&q&status&sort` and returns
 *   `{ data, meta: { page, limit, total, totalPages, pages }, summary }`. `?q=` matches
 *   the code (the row has no other text). `?status=running|idle` is evaluated as the
 *   *checkout ladder* in SQL, not as the `isActive` column, so a row the server calls
 *   running is a code checkout will accept. Nothing prunes this table — `deactivate`
 *   writes `isActive: false` and no route deletes a row — so the read has to be bounded.
 * - **`summary` is counted over the whole shop**, unaffected by `q` and `status`, and
 *   carries `asOf`: the instant the server evaluated the ladder. Label rows with that
 *   instant rather than the browser's clock, or a browser a minute behind will print
 *   "Expired" on a row the server returned as running.
 * - **`code` is globally unique**, not unique per shop: `findUnique({ where: { code } })`
 *   before create. So a code another shop is already using comes back as
 *   400 `'Coupon code already exists'`, and the console cannot tell the seller which
 *   shop took it. The service uppercases and trims before storing.
 * - **Almost nothing is editable.** `UpdateCouponDto` whitelists exactly
 *   `isActive`, `minOrder`, `usageLimit` and `validTo`. `code`, `type`, `value`,
 *   `maxDiscount`, `perUserLimit` and `validFrom` are fixed at creation — and since
 *   `ValidationPipe` runs `forbidNonWhitelisted`, sending one of them is a 400
 *   rather than a silent no-op.
 * - **`DELETE` does not delete.** `deactivate` sets `isActive: false` and returns
 *   the row. Nothing removes a coupon, ever. Reactivating is `PATCH { isActive: true }`,
 *   which is why this console offers both and calls the destructive-looking one
 *   "Deactivate".
 * - **An expiry cannot be cleared.** The controller does
 *   `validTo: dto.validTo ? new Date(dto.validTo) : undefined`, so an omitted or
 *   empty `validTo` leaves the stored value untouched. `validTo` can be moved, never
 *   removed.
 */

import type { Paginated } from "@gopasal/api-client";
import { authedRequest } from "./client";

/* --------------------------------------------------------------------- Types */

/** `enum CouponType` in `schema.prisma`. Sent and received verbatim. */
export type CouponTypeWire = "PERCENT" | "FLAT";

/**
 * One `Coupon` row as the seller list returns it. No relations are included, so
 * there is no shop name and no redemption detail — only the columns below.
 */
export type CouponWire = {
  id: string;
  /** Stored uppercased and trimmed by the service. */
  code: string;
  /** Always the shop for rows from this route; `null` means a platform coupon. */
  shopId: string | null;
  type: CouponTypeWire;
  /** Percent (1–100) for `PERCENT`, whole rupees for `FLAT`. */
  value: number;
  /** Subtotal floor in rupees. `0` = no floor. */
  minOrder: number;
  /** Cap in rupees for a percent coupon; `null` = uncapped. */
  maxDiscount: number | null;
  /** Total redemptions allowed across everyone; `null` = unlimited. */
  usageLimit: number | null;
  /** Redemptions allowed per customer. Defaults to 1. */
  perUserLimit: number;
  /** Incremented inside the order transaction. The one real usage number. */
  usedCount: number;
  /** Defaults to the moment of creation, so a coupon is live immediately. */
  validFrom: string;
  /** `null` = no expiry. Cannot be set back to `null` once set. */
  validTo: string | null;
  isActive: boolean;
  createdAt: string;
};

/**
 * The create body, matching `CreateCouponDto` key for key.
 *
 * Every optional key is omitted rather than sent as `null`: the DTO's validators
 * are `@IsOptional()` + `@IsInt()`, so an explicit `null` fails validation.
 */
export type CreateCouponBody = {
  /** `@MinLength(3)`. Uppercased server-side; send it uppercased anyway. */
  code: string;
  type: CouponTypeWire;
  /** `@IsInt() @Min(1)`; the service additionally caps `PERCENT` at 100. */
  value: number;
  minOrder?: number;
  maxDiscount?: number;
  usageLimit?: number;
  perUserLimit?: number;
  /** ISO date-time. Omit for "live now". */
  validFrom?: string;
  validTo?: string;
};

/** The patch body — the four columns `UpdateCouponDto` accepts, and no others. */
export type UpdateCouponBody = {
  isActive?: boolean;
  minOrder?: number;
  usageLimit?: number;
  validTo?: string;
};

/** `CreateCouponDto.code` is `@MinLength(3)`. */
export const COUPON_CODE_MIN_LENGTH = 3;
/** `perUserLimit` is `@Min(1) @Max(100)`. */
export const PER_USER_LIMIT_MAX = 100;

/* ------------------------------------------------------------- Query contract */

/**
 * How deep this console reads one shop's coupons.
 *
 * `limit` is capped at 100 by `ListShopCouponsQueryDto`. Five pages is the same bound
 * the order and review queues use. A shop that runs a code per festival accumulates
 * them for as long as it trades, so the read is bounded even though the table is not
 * one that explodes; when it stops short, the screen says so.
 */
export const COUPON_PAGE_LIMIT = 100;
export const COUPON_MAX_PAGES = 5;

/** `?sort=` — the two orders the API implements, both on `createdAt`. */
export type CouponSortWire = "newest" | "oldest";

/**
 * `?status=` — the two buckets the API offers, as the literal strings it validates.
 *
 * `running` is not the `isActive` column: it is `isActive AND validFrom <= now AND
 * (validTo IS NULL OR validTo >= now) AND (usageLimit IS NULL OR usedCount <
 * usageLimit)` — the same ladder `CouponsService.quote` walks. `idle` is its exact
 * complement: off, scheduled, expired or used up.
 *
 * Deliberately not a boolean `?active=`: query strings are validated with implicit
 * conversion on, which coerces a boolean-typed property with `!!value`, and
 * `!!"false"` is `true`.
 */
export type CouponStatusWire = "running" | "idle";

/** Everything `GET /seller/shops/:shopId/coupons` accepts. Omit a field to not filter on it. */
export type CouponQuery = {
  page?: number;
  limit?: number;
  /** Matches the coupon code, case-insensitively. The row has no other text column. */
  q?: string;
  status?: CouponStatusWire;
  sort?: CouponSortWire;
};

/**
 * The counts the API returns beside every page, over **every coupon the shop has**.
 *
 * Deliberately unaffected by `q` and `status`: these are claims about the shop, so
 * clicking "Not running" cannot rewrite "Running now" to zero.
 *
 * `redemptions` is `0` — not `null` — for a shop with no coupons. A sum of nothing
 * genuinely is nothing redeemed, unlike an average of nothing, which is not a rating.
 */
export type ShopCouponSummaryWire = {
  total: number;
  running: number;
  /** `total - running`, subtracted server-side so the two buckets always add up. */
  idle: number;
  /** Sum of `usedCount`, the column the order transaction increments. */
  redemptions: number;
  /** ISO instant the server evaluated the running/idle ladder at. */
  asOf: string;
};

/** One page of a shop's coupons plus the shop-wide summary. */
export type CouponPageWire = Paginated<CouponWire> & {
  summary: ShopCouponSummaryWire;
};

/* --------------------------------------------------------------------- Reads */

function couponQueryString(query: CouponQuery): string {
  const params = new URLSearchParams();
  params.set("page", String(query.page ?? 1));
  params.set("limit", String(query.limit ?? COUPON_PAGE_LIMIT));
  // An empty search box must not become `q=`: the API trims and ignores it, but
  // sending it makes the request URL differ for no reason.
  const q = query.q?.trim();
  if (q) params.set("q", q);
  if (query.status) params.set("status", query.status);
  if (query.sort) params.set("sort", query.sort);
  return `?${params.toString()}`;
}

/**
 * One page of a shop's coupons, filtered and sorted by the server. Needs
 * `promotions.view` **on that shop**. Platform-wide coupons (`shopId: null`) are not
 * included — the service filters on the path shop, so a seller never sees them here.
 */
export function listShopCoupons(
  shopId: string,
  query: CouponQuery = {},
  signal?: AbortSignal,
): Promise<CouponPageWire> {
  return authedRequest<CouponPageWire>(
    `/seller/shops/${encodeURIComponent(shopId)}/coupons${couponQueryString(query)}`,
    { signal },
  );
}

/**
 * As much of one shop's *matching* coupons as a bounded number of requests can read.
 *
 * Promotions is a consolidated multi-shop screen and the API pages one shop at a time;
 * there is no endpoint that pages across shops. So each shop is read up to
 * {@link COUPON_MAX_PAGES} pages deep and the results concatenated.
 *
 * `truncated` reports when it stopped short. A list drawn from a truncated read has to
 * say so, or its "nothing here" is a claim about rows nobody fetched.
 */
export async function listAllShopCoupons(
  shopId: string,
  query: CouponQuery = {},
  signal?: AbortSignal,
  maxPages = COUPON_MAX_PAGES,
): Promise<{
  coupons: CouponWire[];
  matched: number;
  truncated: boolean;
  summary: ShopCouponSummaryWire;
}> {
  const first = await listShopCoupons(shopId, { ...query, page: 1 }, signal);
  const coupons = [...first.data];
  const pages = Math.min(first.meta.totalPages, maxPages);
  for (let page = 2; page <= pages; page++) {
    const next = await listShopCoupons(shopId, { ...query, page }, signal);
    coupons.push(...next.data);
  }
  return {
    coupons,
    matched: first.meta.total,
    truncated: coupons.length < first.meta.total,
    summary: first.summary,
  };
}

/**
 * An all-zero summary — what a consolidated screen shows before any shop has answered.
 *
 * `asOf` is the empty string rather than a fabricated timestamp: there is no instant at
 * which nothing was evaluated. Callers must treat an unparseable `asOf` as "no server
 * clock yet" and not label rows with it — there are no rows to label.
 */
export const EMPTY_COUPON_SUMMARY: ShopCouponSummaryWire = {
  total: 0,
  running: 0,
  idle: 0,
  redemptions: 0,
  asOf: "",
};

/**
 * Add up per-shop coupon summaries for a consolidated view.
 *
 * The counts are sums; `idle` is summed rather than re-derived, because each shop's own
 * `idle` is already `total - running` and summing preserves that.
 *
 * `asOf` is the **earliest** instant any shop's server reported. The shops are read
 * concurrently, so the spread is milliseconds of round-trip, but the direction matters:
 * labelling with the earliest instant means the console can lag a server's view, never
 * lead it. Lagging shows a just-expired code as running for a moment; leading would
 * print "Expired" on a code a server counted as running, which is the worse lie — a
 * seller might go and create a duplicate.
 */
export function mergeCouponSummaries(parts: ShopCouponSummaryWire[]): ShopCouponSummaryWire {
  const stamps = parts
    .map((s) => Date.parse(s.asOf))
    .filter((ms) => Number.isFinite(ms))
    .sort((a, b) => a - b);
  const earliest = stamps[0];

  return {
    total: parts.reduce((n, s) => n + s.total, 0),
    running: parts.reduce((n, s) => n + s.running, 0),
    idle: parts.reduce((n, s) => n + s.idle, 0),
    redemptions: parts.reduce((n, s) => n + s.redemptions, 0),
    asOf: earliest === undefined ? "" : new Date(earliest).toISOString(),
  };
}

/* ------------------------------------------------------------------- Actions */

/**
 * Create a coupon on one shop. Needs `promotions.manage`.
 *
 * Known 400s, all worth surfacing verbatim: `'Coupon code already exists'`
 * (global uniqueness) and `'Percent value must be 1–100'`.
 */
export function createShopCoupon(
  shopId: string,
  body: CreateCouponBody,
  signal?: AbortSignal,
): Promise<CouponWire> {
  return authedRequest<CouponWire>(`/seller/shops/${encodeURIComponent(shopId)}/coupons`, {
    method: "POST",
    body,
    signal,
  });
}

/**
 * Patch one of the four mutable columns. Needs `promotions.manage`.
 *
 * 404s `'Coupon not found'` both when the id does not exist and when it is real but
 * lives in another shop — `mustOwn` compares `coupon.shopId` to the path shop, so
 * holding the permission on another shop is not enough, and the API deliberately does
 * not distinguish the two cases.
 */
export function updateShopCoupon(
  shopId: string,
  couponId: string,
  body: UpdateCouponBody,
  signal?: AbortSignal,
): Promise<CouponWire> {
  return authedRequest<CouponWire>(
    `/seller/shops/${encodeURIComponent(shopId)}/coupons/${encodeURIComponent(couponId)}`,
    { method: "PATCH", body, signal },
  );
}

/**
 * Turn a coupon off. Needs `promotions.manage`.
 *
 * Named for what it does: the route is `DELETE` but the service writes
 * `isActive: false` and returns the row. There is no destructive delete, so
 * nothing here needs a "this cannot be undone" warning — `updateShopCoupon` with
 * `{ isActive: true }` puts it back.
 */
export function deactivateShopCoupon(
  shopId: string,
  couponId: string,
  signal?: AbortSignal,
): Promise<CouponWire> {
  return authedRequest<CouponWire>(
    `/seller/shops/${encodeURIComponent(shopId)}/coupons/${encodeURIComponent(couponId)}`,
    { method: "DELETE", signal },
  );
}
