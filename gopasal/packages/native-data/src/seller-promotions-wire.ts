/**
 * Coupon addressing, bounds, and the rules a screen has to be able to state
 * before it spends a request — with no React in it.
 *
 * ## Why coupons get more pure code than anything else in this layer
 *
 * A coupon is money leaving the shop, and the failure mode is silent. Every other
 * write in the seller surface is refused when it is wrong: a bad transition is a
 * 400, a bad polygon is a 400, a bad photo is a 400. A coupon that says `FLAT 50`
 * where the shopkeeper meant `PERCENT 50` is **valid** — the API accepts it, the
 * storefront advertises it, and the difference only surfaces as half the value of
 * every basket for as long as the code runs. `UpdateCouponDto` cannot fix it
 * either: `type` and `value` are fixed at creation, so the only remedy is to
 * deactivate the code and make another one, after the money has gone.
 *
 * So the shape rules live here, as predicates a form can run on every keystroke
 * and a confirmation sheet can quote back, and they are testable because this file
 * imports nothing but types:
 *
 *  - {@link couponDraftIssues} — everything the API would refuse, plus the two
 *    things it accepts that are almost certainly not meant.
 *  - {@link previewDiscount} — `CouponsService.computeDiscount`, reimplemented
 *    exactly, so a sheet can say "Rs 240 off a Rs 1,200 basket" in the seller's
 *    own arithmetic rather than in a promise nobody checked.
 *  - {@link couponRunningAt} — the checkout ladder, so a list can label a row
 *    the same way the server filtered it.
 */
import type { Coupon, CouponQuery } from "./seller-promotions";

/* ── query keys ───────────────────────────────────────────────────────────── */

/** A page's worth of codes on a phone. The API caps `limit` at 100. */
const COUPON_PAGE_LIMIT = 20;

export function couponQueryKey(query: CouponQuery) {
  return {
    page: query.page ?? 1,
    limit: query.limit ?? COUPON_PAGE_LIMIT,
    q: query.q?.trim() || null,
    status: query.status ?? null,
    sort: query.sort ?? "newest",
  };
}

export function couponQueryString(query: CouponQuery): string {
  const key = couponQueryKey(query);
  const params = new URLSearchParams();
  params.set("page", String(key.page));
  params.set("limit", String(key.limit));
  // An empty search box must not become `q=`: the API trims and ignores it, but
  // sending it makes the request — and the cache key — differ for no reason.
  if (key.q) params.set("q", key.q);
  if (key.status) params.set("status", key.status);
  params.set("sort", key.sort);
  return `?${params.toString()}`;
}

/**
 * The keys this module adds, in `seller-wire.ts`'s shape: `"seller"` first so the
 * customer surface's bare keys can never answer one of these, `shopId` third so
 * everything about one shop matches by prefix and is dropped together when the
 * counter switches shop.
 *
 * `"coupons"` is a second segment nothing in `./seller` uses, so there is no
 * collision with the order queue, the shelf or the rider roster — and no
 * accidental *sharing* either, which matters as much: a coupon write must not
 * invalidate the shelf, and a product write must not blank the promotions screen.
 */
export const promotionQk = {
  couponsRoot: (shopId: string) => ["seller", "coupons", shopId] as const,
  coupons: (shopId: string, query: CouponQuery = {}) =>
    ["seller", "coupons", shopId, couponQueryKey(query)] as const,
};

/* ── bounds ───────────────────────────────────────────────────────────────── */

/**
 * What `CreateCouponDto` and `CreateCouponBody` actually allow.
 *
 * `codeMin` is the DTO's `@MinLength(3)`; there is no maximum, because
 * `Coupon.code` is an unbounded `text` — a limit is imposed here anyway, at 32,
 * and it is the one number in this file that is *not* the server's. A code is
 * typed by a customer at checkout, so a 400-character one is unusable whatever
 * the column permits, and that is a claim about coupons rather than about
 * Postgres. It is stated rather than hidden: a screen that wants the server's
 * exact latitude should not use it.
 */
export const COUPON_LIMITS = {
  codeMin: 3,
  /** This module's, not the API's — see the note above. */
  codeMaxAdvisory: 32,
  percentMin: 1,
  percentMax: 100,
  flatMin: 1,
  minOrderMin: 0,
  usageLimitMin: 1,
  perUserLimitMin: 1,
  perUserLimitMax: 100,
} as const;

export type CouponType = "PERCENT" | "FLAT";

/** What a form holds while a coupon is being written. */
export type CouponDraft = {
  code?: string;
  type?: CouponType;
  value?: number;
  minOrder?: number;
  maxDiscount?: number;
  usageLimit?: number;
  perUserLimit?: number;
  /** ISO instant. Omitted means "live now" — the column defaults to `now()`. */
  validFrom?: string;
  validTo?: string;
};

/**
 * Why a coupon cannot be created, or is probably not what was meant.
 *
 * `severity` exists because two of these are not errors. The API will happily
 * store a `PERCENT 100` coupon (everything free) and a `FLAT` coupon with a
 * `maxDiscount` (a cap that can only ever lower a fixed amount, which is either
 * a mistake or a misunderstanding of the field). Refusing them here would be this
 * module inventing pricing policy; saying nothing would be letting a shop give
 * its stock away because a form was quiet. So they are warnings a confirmation
 * sheet must show and a seller may override.
 */
export type CouponIssue = {
  field:
    | "code"
    | "type"
    | "value"
    | "minOrder"
    | "maxDiscount"
    | "usageLimit"
    | "perUserLimit"
    | "validFrom"
    | "validTo";
  severity: "error" | "warning";
  message: string;
};

const isWholeNumber = (value: number): boolean => Number.isInteger(value) && Number.isFinite(value);

/** A parsed ISO instant, or null. `@IsDateString()` is what the API checks. */
function instant(value: string | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Everything wrong with a coupon draft, in one pass, in the order a form should
 * show it.
 *
 * `now` is an argument rather than a call to `Date.now()` so this is a pure
 * function of its inputs and a test can pin the clock. Pass the phone's clock; the
 * server compares against its own, which is why a `validTo` a second in the
 * future is a warning here and may still be refused there.
 *
 * Every `error` mirrors a rule the API enforces:
 *
 *  - `code` `@MinLength(3)`, and **globally unique** — not unique per shop. A code
 *    another shop already uses comes back as 400 `'Coupon code already exists'`
 *    and the API deliberately does not say which shop took it, so that answer can
 *    only come from trying.
 *  - `value` `@IsInt() @Min(1)`, and `CouponsService.create` additionally refuses
 *    a `PERCENT` outside 1–100 with `'Percent value must be 1–100'`.
 *  - `validTo` must be strictly after `validFrom` (or after now, when `validFrom`
 *    is omitted): `'Coupon expiry must be after its start'`.
 *  - `usageLimit` and `perUserLimit` must be positive: `'Coupon limits must be
 *    positive'`. `perUserLimit` is additionally `@Max(100)`.
 */
export function couponDraftIssues(draft: CouponDraft, now: number = Date.now()): CouponIssue[] {
  const issues: CouponIssue[] = [];

  const code = draft.code?.trim();
  if (!code || code.length < COUPON_LIMITS.codeMin) {
    issues.push({
      field: "code",
      severity: "error",
      message: `A code needs at least ${COUPON_LIMITS.codeMin} characters.`,
    });
  } else if (code.length > COUPON_LIMITS.codeMaxAdvisory) {
    issues.push({
      field: "code",
      severity: "warning",
      message: "That code is long for something a customer has to type.",
    });
  }

  if (draft.type !== "PERCENT" && draft.type !== "FLAT") {
    issues.push({
      field: "type",
      severity: "error",
      message: "Choose a percentage off or a fixed amount off.",
    });
  }

  const value = draft.value;
  if (value === undefined || !isWholeNumber(value)) {
    issues.push({ field: "value", severity: "error", message: "Enter a whole number." });
  } else if (draft.type === "PERCENT") {
    if (value < COUPON_LIMITS.percentMin || value > COUPON_LIMITS.percentMax) {
      issues.push({
        field: "value",
        severity: "error",
        message: `A percentage must be between ${COUPON_LIMITS.percentMin} and ${COUPON_LIMITS.percentMax}.`,
      });
    } else if (value === COUPON_LIMITS.percentMax) {
      // Legal, and almost never meant: 100% off makes every qualifying basket
      // free up to `maxDiscount`, and there may be no `maxDiscount`.
      issues.push({
        field: "value",
        severity: "warning",
        message: "100% off makes the whole order free. Is that right?",
      });
    }
  } else if (draft.type === "FLAT" && value < COUPON_LIMITS.flatMin) {
    issues.push({
      field: "value",
      severity: "error",
      message: "A fixed amount must be at least Rs 1.",
    });
  }

  if (draft.minOrder !== undefined && (!isWholeNumber(draft.minOrder) || draft.minOrder < 0)) {
    issues.push({
      field: "minOrder",
      severity: "error",
      message: "A minimum basket is a whole number of rupees, or nothing.",
    });
  }

  if (draft.maxDiscount !== undefined) {
    if (!isWholeNumber(draft.maxDiscount) || draft.maxDiscount < 1) {
      issues.push({
        field: "maxDiscount",
        severity: "error",
        message: "A cap must be at least Rs 1, or leave it empty.",
      });
    } else if (draft.type === "FLAT") {
      // A cap on a fixed amount can only ever reduce it, which means the coupon
      // is worth `min(value, maxDiscount)` and one of the two numbers is a lie.
      issues.push({
        field: "maxDiscount",
        severity: "warning",
        message: "A cap only applies to percentage coupons. It will just lower the fixed amount.",
      });
    }
  }

  if (draft.usageLimit !== undefined) {
    if (!isWholeNumber(draft.usageLimit) || draft.usageLimit < COUPON_LIMITS.usageLimitMin) {
      issues.push({
        field: "usageLimit",
        severity: "error",
        message: "A total limit must be at least 1, or leave it empty for unlimited.",
      });
    }
  }

  if (draft.perUserLimit !== undefined) {
    if (
      !isWholeNumber(draft.perUserLimit) ||
      draft.perUserLimit < COUPON_LIMITS.perUserLimitMin ||
      draft.perUserLimit > COUPON_LIMITS.perUserLimitMax
    ) {
      issues.push({
        field: "perUserLimit",
        severity: "error",
        message: `Per-customer uses must be between ${COUPON_LIMITS.perUserLimitMin} and ${COUPON_LIMITS.perUserLimitMax}.`,
      });
    }
  }

  const from = instant(draft.validFrom);
  const to = instant(draft.validTo);
  if (draft.validFrom !== undefined && from === null) {
    issues.push({ field: "validFrom", severity: "error", message: "That start date is not a date." });
  }
  if (draft.validTo !== undefined && to === null) {
    issues.push({ field: "validTo", severity: "error", message: "That end date is not a date." });
  }
  if (to !== null && to <= (from ?? now)) {
    issues.push({
      field: "validTo",
      severity: "error",
      message: "The end has to be after the start.",
    });
  }
  if (to !== null && from === null && to <= now) {
    issues.push({
      field: "validTo",
      severity: "error",
      message: "That end date has already passed.",
    });
  }

  return issues;
}

/**
 * Why this patch cannot be sent.
 *
 * A much smaller surface than create, because almost nothing about a coupon is
 * editable: `UpdateCouponDto` whitelists `isActive`, `minOrder`, `usageLimit` and
 * `validTo`, and `forbidNonWhitelisted` makes a fifth key a 400 rather than an
 * ignored field. So `code`, `type`, `value`, `maxDiscount`, `perUserLimit` and
 * `validFrom` are fixed for the life of the row.
 *
 * `coupon` is the row being patched, and it earns two checks the API does not
 * make. Lowering `usageLimit` below `usedCount` is accepted and immediately makes
 * the code unusable — which is a legitimate way to stop a runaway campaign, and
 * is not what a seller adjusting a number thinks they are doing. Moving `validTo`
 * into the past is the same shape.
 */
export function couponPatchIssues(
  patch: { isActive?: boolean; minOrder?: number; usageLimit?: number; validTo?: string },
  coupon: Pick<Coupon, "usedCount" | "validFrom">,
  now: number = Date.now(),
): CouponIssue[] {
  const issues: CouponIssue[] = [];

  if (patch.minOrder !== undefined && (!isWholeNumber(patch.minOrder) || patch.minOrder < 0)) {
    issues.push({
      field: "minOrder",
      severity: "error",
      message: "A minimum basket is a whole number of rupees.",
    });
  }

  if (patch.usageLimit !== undefined) {
    if (!isWholeNumber(patch.usageLimit) || patch.usageLimit < COUPON_LIMITS.usageLimitMin) {
      issues.push({
        field: "usageLimit",
        severity: "error",
        message: "A total limit must be at least 1.",
      });
    } else if (patch.usageLimit <= coupon.usedCount) {
      issues.push({
        field: "usageLimit",
        severity: "warning",
        message: `This code has already been used ${coupon.usedCount} times, so that limit stops it working.`,
      });
    }
  }

  if (patch.validTo !== undefined) {
    const to = instant(patch.validTo);
    const from = Date.parse(coupon.validFrom);
    if (to === null) {
      issues.push({ field: "validTo", severity: "error", message: "That end date is not a date." });
    } else if (Number.isFinite(from) && to <= from) {
      issues.push({
        field: "validTo",
        severity: "error",
        message: "The end has to be after the start.",
      });
    } else if (to <= now) {
      issues.push({
        field: "validTo",
        severity: "warning",
        message: "That date is in the past, so the code stops working immediately.",
      });
    }
  }

  return issues;
}

/* ── reading a stored coupon ──────────────────────────────────────────────── */

/**
 * "Will checkout accept this code right now?"
 *
 * The same ladder `CouponsService.quote` walks and `runningCouponFilter` expresses
 * in SQL, in the same order and with the same null handling: no `validTo` means no
 * expiry, and no `usageLimit` means uncapped. Reimplemented rather than inferred
 * from `isActive`, because `isActive` is one rung of four and a row can be
 * switched on and still be scheduled, expired or used up.
 *
 * `at` is an argument, and a screen should pass the server's `summary.asOf` rather
 * than the phone's clock: a handset a minute behind would otherwise print
 * "Expired" on a row the server returned as running, and a seller reading that
 * goes and creates a duplicate code.
 *
 * This is display logic only. It cannot make a coupon work or stop working; the
 * server decides at checkout, against its own clock and its own counters.
 */
export function couponRunningAt(
  coupon: Pick<Coupon, "isActive" | "validFrom" | "validTo" | "usageLimit" | "usedCount">,
  at: number,
): boolean {
  if (!coupon.isActive) return false;
  const from = Date.parse(coupon.validFrom);
  if (Number.isFinite(from) && from > at) return false;
  if (coupon.validTo) {
    const to = Date.parse(coupon.validTo);
    if (Number.isFinite(to) && to < at) return false;
  }
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) return false;
  return true;
}

/** Which rung of the ladder a non-running coupon failed on, for the row's label. */
export type CouponState = "RUNNING" | "OFF" | "SCHEDULED" | "EXPIRED" | "USED_UP";

/**
 * The one word a row should carry.
 *
 * Ordered the way the server's `idleCouponFilter` spells out the complement — off,
 * not started, ended, used up — so a label and the `?status=idle` bucket can never
 * disagree about why a code is not working.
 */
export function couponState(
  coupon: Pick<Coupon, "isActive" | "validFrom" | "validTo" | "usageLimit" | "usedCount">,
  at: number,
): CouponState {
  if (!coupon.isActive) return "OFF";
  const from = Date.parse(coupon.validFrom);
  if (Number.isFinite(from) && from > at) return "SCHEDULED";
  if (coupon.validTo) {
    const to = Date.parse(coupon.validTo);
    if (Number.isFinite(to) && to < at) return "EXPIRED";
  }
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) return "USED_UP";
  return "RUNNING";
}

/**
 * What this coupon would take off a basket of `subtotal` rupees.
 *
 * `CouponsService.computeDiscount`, line for line, including both clamps:
 * `Math.round` on the percentage (the API rounds, it does not floor), `maxDiscount`
 * applied only when set, and finally never more than the order value. Money is
 * whole NPR rupees throughout — there is no paisa anywhere in this platform.
 *
 * Returns the discount, **not** whether the coupon applies. `minOrder`, the date
 * window, the usage caps and the per-customer count are separate gates; `quote`
 * checks them all before reaching this arithmetic, and it refuses a coupon whose
 * discount computes to zero with `'Coupon gives no discount on this order'`. So a
 * sheet that wants to say "this code does nothing on a small basket" has to check
 * {@link couponAppliesTo} as well.
 */
export function previewDiscount(
  coupon: Pick<Coupon, "type" | "value" | "maxDiscount">,
  subtotal: number,
): number {
  let discount =
    coupon.type === "PERCENT" ? Math.round((subtotal * coupon.value) / 100) : coupon.value;
  if (coupon.maxDiscount != null) discount = Math.min(discount, coupon.maxDiscount);
  return Math.min(discount, subtotal);
}

/**
 * Whether checkout would apply this code to a basket of `subtotal`, ignoring the
 * one thing a seller's phone cannot know.
 *
 * The gates checked here are the coupon's own: it is running, the basket clears
 * `minOrder`, and the discount is more than zero. The gate deliberately **not**
 * checked is `perUserLimit`, which depends on how many times *this customer* has
 * already redeemed the code — a `couponRedemption` count the seller surface has no
 * route to. So this answers "would the code work for someone who has never used
 * it", which is the question a seller is actually asking when they write one, and
 * a screen must not present it as a promise about a particular shopper.
 */
export function couponAppliesTo(
  coupon: Pick<
    Coupon,
    "isActive" | "validFrom" | "validTo" | "usageLimit" | "usedCount" | "type" | "value" | "maxDiscount" | "minOrder"
  >,
  subtotal: number,
  at: number,
): boolean {
  if (!couponRunningAt(coupon, at)) return false;
  if (subtotal < coupon.minOrder) return false;
  return previewDiscount(coupon, subtotal) > 0;
}

/**
 * The code as the server will store it: trimmed and upper-cased.
 *
 * `CouponsService.create` does this before its uniqueness check, so a form that
 * shows the seller something else is showing them a code that will not be the one
 * customers type. Applied on the way in as well, so the duplicate check the server
 * runs is against the string the seller saw.
 */
export function normaliseCouponCode(code: string): string {
  return code.trim().toUpperCase();
}
