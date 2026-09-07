/**
 * The seller console's view of its shops' coupons.
 *
 * Everything here is derived from columns the API returns. In particular the
 * status a coupon is shown with is not a stored field — `Coupon` has only
 * `isActive` — it is the same ladder of checks `CouponsService.quote` runs when a
 * customer types the code at checkout, in the same order:
 *
 *   `!isActive` → off · `validFrom > now` → scheduled · `validTo < now` → expired ·
 *   `usedCount >= usageLimit` → used up · otherwise running.
 *
 * Mirroring `quote` is the point: a coupon this screen calls "Running" is one the
 * checkout will accept, and a coupon it calls "Used up" is one the checkout will
 * refuse with "Coupon usage limit reached". Any prettier grouping would eventually
 * disagree with the code that actually decides.
 *
 * What is deliberately absent:
 *
 * - **No analytics.** `usedCount` is a real integer written by the order
 *   transaction, so it is shown. Revenue attributed to a coupon, redemptions over
 *   time, average discount, uplift versus no coupon: none of that is returned by any
 *   seller route, and none of it is computed here.
 * - **No forecasting.** The console never estimates what a coupon "will" cost or
 *   earn. It can say what the discount is and what it is capped at, because those
 *   are stored numbers.
 * - **No sponsored placement.** There is no endpoint. See the note in
 *   `lib/api/promotions.ts`.
 */

import type { Tone } from "@/components/primitives";
import { rs } from "./format";
import {
  COUPON_CODE_MIN_LENGTH,
  PER_USER_LIMIT_MAX,
  type CouponQuery,
  type CouponTypeWire,
  type CouponWire,
  type CreateCouponBody,
  type ShopCouponSummaryWire,
  type UpdateCouponBody,
} from "./api/promotions";

/* -------------------------------------------------------------------- Status */

/**
 * Why a coupon is or is not usable right now.
 *
 * `off` is the seller's own switch; the other three are the world moving on
 * without them.
 */
export type CouponStatus = "running" | "scheduled" | "expired" | "used-up" | "off";

export const STATUS_LABELS: Record<CouponStatus, string> = {
  running: "Running",
  scheduled: "Starts later",
  expired: "Expired",
  "used-up": "Used up",
  off: "Off",
};

export const STATUS_TONES: Record<CouponStatus, Tone> = {
  running: "green",
  scheduled: "blue",
  expired: "ink",
  "used-up": "marigold",
  off: "ink",
};

/**
 * The checkout's own ladder, in the checkout's own order. `now` is injected so a
 * list rendered once does not disagree with itself row to row.
 */
function couponStatus(w: CouponWire, now: number): CouponStatus {
  if (!w.isActive) return "off";
  if (Date.parse(w.validFrom) > now) return "scheduled";
  if (w.validTo !== null && Date.parse(w.validTo) < now) return "expired";
  if (w.usageLimit !== null && w.usedCount >= w.usageLimit) return "used-up";
  return "running";
}

/* --------------------------------------------------------------------- Rows */

export type SellerCoupon = {
  id: string;
  shopId: string;
  code: string;
  type: CouponTypeWire;
  value: number;
  minOrder: number;
  maxDiscount: number | null;
  usageLimit: number | null;
  perUserLimit: number;
  usedCount: number;
  validFrom: string;
  validTo: string | null;
  isActive: boolean;
  createdAt: string;
  status: CouponStatus;
  /** "10% off, up to रु200" / "रु100 off" — stored numbers, no estimates. */
  discountLabel: string;
  /** "38 of 200 used" or "38 used" when the coupon has no ceiling. */
  usageLabel: string;
};

function toSellerCoupon(w: CouponWire, now: number): SellerCoupon {
  const discountLabel =
    w.type === "PERCENT"
      ? w.maxDiscount === null
        ? `${w.value}% off`
        : `${w.value}% off, up to ${rs(w.maxDiscount)}`
      : `${rs(w.value)} off`;
  return {
    id: w.id,
    // A row from this route always has one; the column is nullable only because
    // platform coupons share the table.
    shopId: w.shopId ?? "",
    code: w.code,
    type: w.type,
    value: w.value,
    minOrder: w.minOrder,
    maxDiscount: w.maxDiscount,
    usageLimit: w.usageLimit,
    perUserLimit: w.perUserLimit,
    usedCount: w.usedCount,
    validFrom: w.validFrom,
    validTo: w.validTo,
    isActive: w.isActive,
    createdAt: w.createdAt,
    status: couponStatus(w, now),
    discountLabel,
    usageLabel:
      w.usageLimit === null
        ? `${w.usedCount} used`
        : `${w.usedCount} of ${w.usageLimit} used`,
  };
}

export function toSellerCoupons(wire: CouponWire[], now: number): SellerCoupon[] {
  return wire.map((w) => toSellerCoupon(w, now));
}

/* -------------------------------------------------------------------- Filters */

/**
 * The three buckets the chip row offers, each of which is a **server** query.
 *
 * `GET /seller/shops/:shopId/coupons?status=running|idle` evaluates the same ladder as
 * `couponStatus` below, in SQL, so a chip is not a re-reading of rows the browser
 * happens to hold: switching chips refetches. "Not running" is one bucket on purpose —
 * from a shopper's point of view off, expired, used up and not-started-yet are the same
 * thing, and the API's `idle` is exactly that union.
 */
export type CouponFilter = "all" | "running" | "idle";

export const COUPON_FILTERS: { id: CouponFilter; label: string; hint: string }[] = [
  { id: "all", label: "All coupons", hint: "Everything these shops have created." },
  { id: "running", label: "Running now", hint: "Codes the checkout will accept right now." },
  { id: "idle", label: "Not running", hint: "Off, not started yet, expired or used up." },
];

/**
 * The chip, as the query parameter the API wants. `all` is the absence of `?status=`,
 * not a third value — the DTO's `@IsIn(['running','idle'])` would reject "all".
 */
export function couponFilterQuery(filter: CouponFilter): Pick<CouponQuery, "status"> {
  if (filter === "running") return { status: "running" };
  if (filter === "idle") return { status: "idle" };
  return {};
}

/**
 * The badge on a chip, taken from the shop-wide summary rather than from loaded rows.
 *
 * A count derived from the current page would be a count of what is on screen, which is
 * the one number a filter chip must not show: the point of the badge is to say how many
 * rows the *other* chip would reveal.
 */
export function couponFilterCount(filter: CouponFilter, summary: ShopCouponSummaryWire): number {
  if (filter === "running") return summary.running;
  if (filter === "idle") return summary.idle;
  return summary.total;
}

/* --------------------------------------------------------------------- Draft */

/**
 * The create form's state. Every numeric field is a string because that is what an
 * `<input>` holds, and "" has to stay distinguishable from 0 — an empty
 * `usageLimit` means "no ceiling", not "zero redemptions".
 */
export type CouponDraft = {
  code: string;
  type: CouponTypeWire;
  value: string;
  minOrder: string;
  maxDiscount: string;
  usageLimit: string;
  perUserLimit: string;
  /** `<input type="date">` values, i.e. `YYYY-MM-DD`, or "". */
  validFrom: string;
  validTo: string;
};

export const EMPTY_DRAFT: CouponDraft = {
  code: "",
  type: "PERCENT",
  value: "",
  minOrder: "",
  maxDiscount: "",
  usageLimit: "",
  perUserLimit: "",
  validFrom: "",
  validTo: "",
};

/** A whole number, or `null` for blank/negative/fractional/not-a-number. */
function whole(input: string): number | null {
  const t = input.trim();
  if (t.length === 0) return null;
  const n = Number(t);
  return Number.isInteger(n) ? n : null;
}

/** Local midnight (or the last second of the day) as an ISO instant. */
function dayStart(date: string): string | null {
  const ms = Date.parse(`${date}T00:00:00`);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}
function dayEnd(date: string): string | null {
  const ms = Date.parse(`${date}T23:59:59`);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/**
 * Why this draft cannot be sent, or `null` if it can.
 *
 * Each rule below is one the API enforces, restated in the seller's language so a
 * mistake costs a keystroke rather than a round trip. It cannot pre-empt the one
 * check that needs the database — `code` is unique **across the whole platform**,
 * so a code another shop already uses comes back as a 400 and is shown as one.
 */
export function draftProblem(d: CouponDraft): string | null {
  const code = d.code.trim();
  if (code.length < COUPON_CODE_MIN_LENGTH) {
    return `A code needs at least ${COUPON_CODE_MIN_LENGTH} characters.`;
  }
  if (/\s/.test(code)) return "A code cannot contain spaces.";

  const value = whole(d.value);
  if (value === null || value < 1) {
    return d.type === "PERCENT"
      ? "Enter the percentage to take off, as a whole number."
      : "Enter the amount to take off, in whole rupees.";
  }
  if (d.type === "PERCENT" && value > 100) return "A percentage cannot be above 100.";

  if (d.minOrder.trim().length > 0) {
    const min = whole(d.minOrder);
    if (min === null || min < 0) return "Minimum order must be a whole number of rupees.";
  }
  if (d.type === "PERCENT" && d.maxDiscount.trim().length > 0) {
    const cap = whole(d.maxDiscount);
    if (cap === null || cap < 1) return "The cap must be at least रु1, or leave it empty.";
  }
  if (d.usageLimit.trim().length > 0) {
    const limit = whole(d.usageLimit);
    if (limit === null || limit < 1) return "Total redemptions must be 1 or more, or leave it empty.";
  }
  if (d.perUserLimit.trim().length > 0) {
    const per = whole(d.perUserLimit);
    if (per === null || per < 1 || per > PER_USER_LIMIT_MAX) {
      return `Per-customer uses must be between 1 and ${PER_USER_LIMIT_MAX}.`;
    }
  }

  if (d.validFrom.length > 0 && dayStart(d.validFrom) === null) return "That start date is not a date.";
  if (d.validTo.length > 0) {
    const end = dayEnd(d.validTo);
    if (end === null) return "That end date is not a date.";
    const start = d.validFrom.length > 0 ? dayStart(d.validFrom) : null;
    if (start !== null && Date.parse(end) <= Date.parse(start)) {
      return "The end date has to come after the start date.";
    }
  }
  return null;
}

/**
 * The draft as a `CreateCouponDto` body. Returns `null` if `draftProblem` would
 * refuse it, so callers cannot post an invalid draft by mistake.
 *
 * Optional keys are **omitted, never `null`** — the DTO validates with
 * `@IsOptional() @IsInt()`, so an explicit `null` is a 400, and `ValidationPipe`
 * runs `forbidNonWhitelisted`, so an unknown key is one too.
 *
 * `maxDiscount` is sent only for a percent coupon. The service applies it to flat
 * coupons as well — `computeDiscount` does `Math.min(discount, maxDiscount)`
 * regardless of type — which on a flat coupon would quietly shrink the discount the
 * seller typed. A field that changes the number above it is not offered.
 */
export function draftBody(d: CouponDraft): CreateCouponBody | null {
  if (draftProblem(d) !== null) return null;
  const value = whole(d.value);
  if (value === null) return null;

  const body: CreateCouponBody = { code: d.code.trim().toUpperCase(), type: d.type, value };

  const min = whole(d.minOrder);
  if (min !== null) body.minOrder = min;
  if (d.type === "PERCENT") {
    const cap = whole(d.maxDiscount);
    if (cap !== null) body.maxDiscount = cap;
  }
  const limit = whole(d.usageLimit);
  if (limit !== null) body.usageLimit = limit;
  const per = whole(d.perUserLimit);
  if (per !== null) body.perUserLimit = per;

  if (d.validFrom.length > 0) {
    const from = dayStart(d.validFrom);
    if (from !== null) body.validFrom = from;
  }
  if (d.validTo.length > 0) {
    const to = dayEnd(d.validTo);
    if (to !== null) body.validTo = to;
  }
  return body;
}

/* ---------------------------------------------------------------- Editability */

/*
 * `UpdateCouponDto` accepts four columns — `isActive`, `minOrder`, `usageLimit`
 * and `validTo` — and everything else about a coupon is fixed at creation.
 *
 * That used to be stated here as an `EDITABLE_FIELDS` array as well, which nothing
 * read. The list is not documentation the code needs, because it is already
 * enforced twice over and in a way a screen cannot get around: `UpdateCouponBody`
 * has exactly those keys, so a fifth one will not compile, and `patchChanges`
 * below can only ever produce them. A parallel array of names could drift from
 * both.
 */

/** `YYYY-MM-DD` for an `<input type="date">`, from an ISO instant. */
function dateInputValue(iso: string | null): string {
  if (iso === null) return "";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const d = new Date(ms);
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/** An end-of-day ISO instant for a patch, or `null` when the box is empty. */
function endOfDayIso(date: string): string | null {
  return date.length > 0 ? dayEnd(date) : null;
}

/**
 * The three patchable values a form can hold as text. `isActive` is not here — it
 * is a button, not a field.
 */
export type CouponPatch = {
  minOrder: string;
  usageLimit: string;
  /** `YYYY-MM-DD` or "". Empty means *leave the stored expiry alone*, not "clear it". */
  validTo: string;
};

export function patchFrom(c: SellerCoupon): CouponPatch {
  return {
    minOrder: `${c.minOrder}`,
    usageLimit: c.usageLimit === null ? "" : `${c.usageLimit}`,
    validTo: dateInputValue(c.validTo),
  };
}

/**
 * Only the keys that actually differ from the stored row.
 *
 * A patch that resends an unchanged value is not wrong, but sending nothing at all
 * is how the form knows there is nothing to save — and it keeps `usageLimit` out of
 * the body when the box was emptied, because emptying it cannot mean "no ceiling":
 * `@IsOptional() @IsInt() @Min(1)` has no way to express `null`.
 */
function patchChanges(c: SellerCoupon, p: CouponPatch): UpdateCouponBody {
  const body: UpdateCouponBody = {};
  const min = whole(p.minOrder);
  if (min !== null && min >= 0 && min !== c.minOrder) body.minOrder = min;
  const limit = whole(p.usageLimit);
  if (limit !== null && limit >= 1 && limit !== c.usageLimit) body.usageLimit = limit;
  if (p.validTo.length > 0 && p.validTo !== dateInputValue(c.validTo)) {
    const iso = endOfDayIso(p.validTo);
    if (iso !== null) body.validTo = iso;
  }
  return body;
}

/** Why this patch cannot be sent — including "you have not changed anything". */
export function patchProblem(c: SellerCoupon, p: CouponPatch): string | null {
  const min = whole(p.minOrder);
  if (min === null || min < 0) {
    return "Minimum order must be a whole number of rupees. Use 0 for no minimum.";
  }
  if (p.usageLimit.trim().length > 0) {
    const limit = whole(p.usageLimit);
    if (limit === null || limit < 1) {
      return "Total redemptions must be 1 or more. Clearing the box leaves the current limit as it is.";
    }
  }
  if (p.validTo.length > 0) {
    const iso = endOfDayIso(p.validTo);
    if (iso === null) return "That end date is not a date.";
    if (Date.parse(iso) <= Date.parse(c.validFrom)) {
      return "The end date has to come after the day the coupon started.";
    }
  }
  if (Object.keys(patchChanges(c, p)).length === 0) return "Nothing has changed yet.";
  return null;
}

/** The patch body, or `null` when `patchProblem` would refuse it. */
export function patchBody(c: SellerCoupon, p: CouponPatch): UpdateCouponBody | null {
  if (patchProblem(c, p) !== null) return null;
  return patchChanges(c, p);
}

/**
 * True when the limit being typed is at or below what has already been redeemed —
 * i.e. saving it stops the coupon working immediately, because `quote` refuses on
 * `usedCount >= usageLimit`. Worth saying out loud; not worth refusing.
 */
export function limitAlreadyReached(c: SellerCoupon, usageLimit: string): boolean {
  const limit = whole(usageLimit);
  return limit !== null && limit >= 1 && c.usedCount >= limit;
}

/*
 * `COUPON_CODE_MIN_LENGTH` and `PER_USER_LIMIT_MAX` were re-exported from here as
 * well. /promotions imports them straight from `lib/api/promotions`, where the
 * server's bounds are declared, so the second door was never opened — and a bound
 * reachable by two import paths is one that can be read from the stale path.
 */






