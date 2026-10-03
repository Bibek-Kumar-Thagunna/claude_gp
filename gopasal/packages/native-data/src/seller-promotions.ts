/**
 * The shop's coupons — list, create, edit, turn off, turn back on.
 *
 * Backed by `apps/api/src/modules/coupons/coupons.seller.controller.ts`,
 * `@Controller('seller/shops/:shopId/coupons')`. Four routes and no more: `GET`
 * needs `promotions.view`, the three writes need `promotions.manage`, and both
 * keys are `SHOP`-scoped so `PermissionsGuard` resolves the tenant from the
 * `:shopId` in the path. That is the whole of "Promotions" that the API has.
 *
 * Reached as `@gopasal/native-data/seller-promotions`, and deliberately not
 * re-exported from `./index` — the customer app imports the same package and has
 * no business carrying the seller's write surface.
 *
 * ## Coupons are money, and the mistakes are quiet
 *
 * Almost everything else a seller can get wrong on a phone is refused. A coupon
 * that says the wrong thing is *accepted*: `FLAT 50` where `PERCENT 50` was meant
 * is a valid row, the storefront advertises it, and the only symptom is smaller
 * baskets until somebody notices. And it cannot be corrected — `UpdateCouponDto`
 * whitelists four columns and `type` and `value` are not among them, so the remedy
 * is to deactivate the code and write another one, after the money has gone.
 *
 * That is why the shape rules are in `./seller-promotions-wire` as pure predicates
 * rather than as validation buried in a mutation: a form can run them on every
 * keystroke, a confirmation sheet can quote the arithmetic back in rupees
 * ({@link previewDiscount}), and both can be tested without a phone.
 *
 * ## Writes go straight to `http`
 *
 * `./seller` sets out the reasoning and it holds here. The outbox replays a queued
 * write when the signal returns, which is right for *add to cart* and wrong for a
 * promotion: a deactivation queued at 12:04 and sent at 12:14 switches off a code
 * the shopkeeper reactivated at 12:09, and no seller route reads an
 * `Idempotency-Key`, so a replay lands as a second real request. A failure the
 * seller can see is the better failure.
 *
 * ## What this module does not disturb
 *
 * A coupon write touches `promotionQk.couponsRoot(shopId)` and nothing else. It is
 * worth stating as a decision rather than as an omission: coupons and the
 * catalogue are independent, so a code going live must not invalidate the shelf,
 * and `qk.shops()` is untouched because `storefront.blockers` is about approval,
 * location and deliverable products — never about promotions. Nothing in
 * `./seller`, `./seller-catalog`, `./seller-delivery` or `./seller-settings` needs
 * to know a coupon changed, and nothing here needs to know they did.
 *
 * Shapes mirror `apps/web-seller/lib/api/promotions.ts` field for field.
 */
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Paginated } from "@gopasal/api-client/types";
import { useGopasal } from "./GopasalProvider";
import { SELLER_STALE } from "./seller";
import { usePaged } from "./paged";
import {
  couponQueryString,
  normaliseCouponCode,
  promotionQk,
  type CouponType,
} from "./seller-promotions-wire";

/**
 * The pure half is re-exported wholesale so a screen has one import, while
 * `./seller-promotions-wire` stays importable on its own — which is what lets the
 * money arithmetic be tested without a phone.
 */
export {
  COUPON_LIMITS,
  couponAppliesTo,
  couponDraftIssues,
  couponPatchIssues,
  couponRunningAt,
  couponState,
  normaliseCouponCode,
  previewDiscount,
  promotionQk,
} from "./seller-promotions-wire";
export type { CouponDraft, CouponIssue, CouponState, CouponType } from "./seller-promotions-wire";

/* ── the row ──────────────────────────────────────────────────────────────── */

/**
 * One `Coupon` row as the seller list returns it.
 *
 * No relations are included, so there is no shop name and no redemption detail —
 * only these columns. Nullable columns arrive as `null`, never `undefined`,
 * exactly as Prisma serialises them.
 *
 * `usedCount` is the only usage number that exists anywhere on this surface. It is
 * the integer the checkout transaction increments (and `releaseForOrder`
 * decrements on a cancellation), and there is no revenue attributed to a coupon,
 * no redemption timeline and no per-coupon order list. `CouponRedemption` rows do
 * carry an `amount`, and no route exposes them to a seller — so a screen must not
 * present "Rs saved" or "orders from this code", because nothing can answer either.
 */
export type Coupon = {
  id: string;
  /** Stored trimmed and upper-cased by the service. */
  code: string;
  /** Always this shop for rows from this route; `null` would mean a platform coupon. */
  shopId: string | null;
  type: CouponType;
  /** Percent 1–100 for `PERCENT`, whole rupees for `FLAT`. */
  value: number;
  /** Subtotal floor in rupees. `0` means no floor. */
  minOrder: number;
  /** Cap in rupees for a percent coupon; `null` means uncapped. */
  maxDiscount: number | null;
  /** Total redemptions allowed across everyone; `null` means unlimited. */
  usageLimit: number | null;
  /** Redemptions allowed per customer. Defaults to 1. */
  perUserLimit: number;
  /** The one real usage figure. Incremented inside the order transaction. */
  usedCount: number;
  /** Defaults to the moment of creation, so a coupon is live immediately. */
  validFrom: string;
  /** `null` means no expiry — and it can never be set back to `null`. */
  validTo: string | null;
  isActive: boolean;
  createdAt: string;
};

/** `?sort=` — the two orders the API implements, both on `createdAt`. */
export type CouponSort = "newest" | "oldest";

/**
 * `?status=` — the two buckets the API offers, as the literal strings it validates.
 *
 * `running` is **not** the `isActive` column: it is the checkout ladder in SQL —
 * active, started, not expired, not used up — the same one `CouponsService.quote`
 * walks. `idle` is its exact complement, because from a shopper's side off,
 * not-started, expired and used-up are one thing: the code does not work.
 *
 * Deliberately not a boolean `?active=`. Query strings are validated with implicit
 * conversion on, which coerces a boolean-typed property with `!!value`, and
 * `!!"false"` is `true`.
 */
export type CouponStatusFilter = "running" | "idle";

/** Everything `ListShopCouponsQueryDto` accepts. Omit a field to not filter on it. */
export type CouponQuery = {
  page?: number;
  /** Capped at 100 by the DTO. */
  limit?: number;
  /** Matches the code, case-insensitively. `Coupon` has no other text column. */
  q?: string;
  status?: CouponStatusFilter;
  sort?: CouponSort;
};

/**
 * The counts the API returns beside every page, over **every coupon the shop has**.
 *
 * Deliberately unaffected by `q` and `status`, like the order and catalogue
 * summaries: these are claims about the shop, so tapping "Not running" cannot
 * rewrite "Running now" to zero.
 *
 * `asOf` is the load-bearing field. It is the instant the server evaluated the
 * running/idle ladder, and it is what a row's label must be computed against —
 * pass it to {@link couponState}, not the phone's clock. A handset a minute behind
 * would otherwise print "Expired" on a row the server counted as running, and a
 * seller reading that goes and creates a duplicate code, which the API refuses
 * because codes are globally unique.
 *
 * `redemptions` is `0` rather than `null` for a shop with no coupons: a sum of
 * nothing genuinely is nothing redeemed, unlike an average of nothing, which is
 * not a rating.
 */
export type ShopCouponSummary = {
  total: number;
  running: number;
  /** `total - running`, subtracted server-side so the two buckets always add up. */
  idle: number;
  /** Sum of `usedCount` across the shop's codes. */
  redemptions: number;
  /** ISO instant the server evaluated the ladder at. */
  asOf: string;
};

export type CouponPage = Paginated<Coupon> & { summary: ShopCouponSummary };

/**
 * One page of this shop's coupons, filtered and sorted by the server.
 *
 * `SELLER_STALE.counter` rather than `money`: a coupon list is not analytics. Two
 * people can hold `promotions.manage` on one shop, and a code somebody switched
 * off in the office has to show as off on the counter's phone within the minute —
 * otherwise a shopkeeper reads a code out to a customer that checkout then
 * refuses.
 *
 * Platform-wide coupons (`shopId: null`) are not included: the service filters on
 * the path shop, so a seller never sees GoPasal's own campaigns here even though
 * checkout will apply them to this shop's orders. Nothing on the seller surface
 * lists them, which is worth knowing before a screen implies this is every code a
 * customer could use.
 */
export function useShopCoupons(shopId: string | null | undefined, query: CouponQuery = {}) {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: promotionQk.coupons(shopId ?? "", query),
    staleTime: SELLER_STALE.counter,
    enabled: Boolean(shopId) && Boolean(user),
    queryFn: () =>
      http.request<CouponPage>(
        `/seller/shops/${encodeURIComponent(shopId!)}/coupons${couponQueryString(query)}`,
      ),
  });
}

/** {@link useShopCoupons}, readable to the end — see `./paged`. */
export function useShopCouponPages(shopId: string | null | undefined, query: CouponQuery = {}) {
  const { http, user } = useGopasal();
  return usePaged<Coupon, CouponPage>({
    enabled: Boolean(shopId) && Boolean(user),
    staleTime: SELLER_STALE.counter,
    key: (page) => promotionQk.coupons(shopId ?? "", { ...query, page }),
    fetch: (page) =>
      http.request<CouponPage>(
        `/seller/shops/${encodeURIComponent(shopId!)}/coupons${couponQueryString({ ...query, page })}`,
      ),
    resetOn: `${shopId}|${JSON.stringify(query)}`,
  });
}

/* ── writes ───────────────────────────────────────────────────────────────── */

/**
 * `CreateCouponDto`, key for key. `forbidNonWhitelisted` makes an extra key a 400.
 *
 * Every optional key is **omitted** rather than sent as `null`: the validators are
 * `@IsOptional() @IsInt()`, so an explicit `null` skips validation, reaches the
 * service, and goes into `prisma.coupon.create` as a null on a column that may not
 * take one.
 *
 * `validFrom` and `validTo` are ISO date-time strings (`@IsDateString()`); the
 * controller converts them to `Date` on the way in. Omitting `validFrom` means
 * "live now" — the column defaults to `now()`.
 *
 * Six of these can never be changed afterwards: `code`, `type`, `value`,
 * `maxDiscount`, `perUserLimit` and `validFrom`. Getting them right is the whole
 * job of the form, which is why {@link couponDraftIssues} warns rather than only
 * refusing.
 */
export type CouponCreateInput = {
  /** `@MinLength(3)`. Globally unique — see the mutation's note. */
  code: string;
  type: CouponType;
  /** `@IsInt() @Min(1)`; the service additionally caps `PERCENT` at 100. */
  value: number;
  minOrder?: number;
  /** Only meaningful for `PERCENT`. `@Min(1)`. */
  maxDiscount?: number;
  usageLimit?: number;
  /** `@Min(1) @Max(100)`. Defaults to 1. */
  perUserLimit?: number;
  validFrom?: string;
  validTo?: string;
};

/**
 * `UpdateCouponDto` — the four columns that can be changed, and no others.
 *
 * A fifth key is a 400 naming it rather than a silent no-op, which is the correct
 * strictness and is why this type is written out rather than derived from
 * {@link CouponCreateInput}.
 *
 * **`validTo` cannot be cleared.** The controller does
 * `validTo: dto.validTo ? new Date(dto.validTo) : undefined`, so an omitted or
 * empty value leaves the stored expiry untouched. An expiry can be moved, never
 * removed — and `usageLimit` is the same: neither is typed `| null`, because
 * typing it so would be the first half of pretending the platform can do something
 * it cannot.
 */
export type CouponPatch = {
  isActive?: boolean;
  minOrder?: number;
  usageLimit?: number;
  validTo?: string;
};

/**
 * Create a coupon, change one of its four mutable columns, switch it off, switch
 * it back on.
 *
 * Nothing here is optimistic, and that is a decision rather than an oversight.
 * `./seller` makes two writes optimistic — an availability switch and an order
 * transition — because both are taps that must move under a thumb with a customer
 * waiting. A coupon is the opposite kind of act: it is written once, carefully,
 * and the two failures that matter arrive *from the server* and cannot be
 * predicted locally — a code another shop already took, and a percent value the
 * service refuses. Showing a row that then vanished would be worse than a second's
 * wait.
 *
 * Every write answers with the whole `Coupon` row, so the response could in
 * principle be spliced into the cached page. It is not: the page carries a
 * shop-wide `summary` whose `running`, `idle` and `asOf` would then be stale beside
 * a row that had just changed bucket, and re-deriving those four numbers here is a
 * second implementation of the server's ladder waiting to disagree with the first.
 * One invalidation gets a consistent page.
 */
export function useCouponActions(shopId: string | null | undefined) {
  const { http } = useGopasal();
  const qc = useQueryClient();

  const settle = React.useCallback(() => {
    void qc.invalidateQueries({ queryKey: promotionQk.couponsRoot(shopId ?? "") });
  }, [qc, shopId]);

  return {
    /**
     * `promotions.manage`.
     *
     * The code is normalised on the way out, because the server trims and
     * upper-cases before its uniqueness check: a seller who typed `diwali10`
     * should be told that `DIWALI10` is taken, in the form the customer will type.
     *
     * Two 400s are worth surfacing verbatim and cannot be predicted locally:
     *
     *  - `'Coupon code already exists'`. Codes are unique **across the platform**,
     *    not per shop — `findUnique({ where: { code } })` — and the API
     *    deliberately does not say which shop holds it, so a rival's campaign
     *    cannot be enumerated. A seller has to pick another word.
     *  - `'Percent value must be 1–100'`, and `'Coupon expiry must be after its
     *    start'`. {@link couponDraftIssues} catches both before sending; the
     *    server's answer is still the one to display if it arrives.
     */
    create: useMutation({
      mutationFn: (input: CouponCreateInput) =>
        http.request<Coupon>(`/seller/shops/${encodeURIComponent(shopId!)}/coupons`, {
          method: "POST",
          body: { ...input, code: normaliseCouponCode(input.code) },
        }),
      onSuccess: settle,
    }),

    /**
     * `promotions.manage`. Patch one of the four mutable columns.
     *
     * 404s `'Coupon not found'` both for an id that does not exist and for a real
     * id belonging to another shop: `mustOwn` compares `coupon.shopId` to the path
     * shop, and holding `promotions.manage` elsewhere is not enough. The API does
     * not distinguish the two cases on purpose — coupon codes are guessable in a
     * way product ids are not, and the difference would confirm a rival's row.
     */
    update: useMutation({
      mutationFn: (input: { couponId: string; patch: CouponPatch }) =>
        http.request<Coupon>(
          `/seller/shops/${encodeURIComponent(shopId!)}/coupons/${encodeURIComponent(input.couponId)}`,
          { method: "PATCH", body: input.patch },
        ),
      onSuccess: settle,
    }),

    /**
     * Turn a coupon off. `promotions.manage`.
     *
     * **`DELETE` does not delete.** The route is a `DELETE` and the service writes
     * `isActive: false` and returns the row; nothing in the API removes a coupon,
     * ever, and `usedCount` and the `CouponRedemption` rows behind it survive
     * because they are order history. So this is a **soft** operation and a
     * confirmation must not say "permanently" or "cannot be undone" — it is
     * reversible with {@link useCouponActions.reactivate}, which is why it is named
     * for what it does.
     *
     * Deactivating is also the only remedy for a coupon whose `type` or `value` is
     * wrong, since neither can be patched. A screen correcting a mistake does this
     * and then creates a new code under a different word — the old one is taken
     * forever.
     */
    deactivate: useMutation({
      mutationFn: (couponId: string) =>
        http.request<Coupon>(
          `/seller/shops/${encodeURIComponent(shopId!)}/coupons/${encodeURIComponent(couponId)}`,
          { method: "DELETE" },
        ),
      onSuccess: settle,
    }),

    /**
     * Put a deactivated coupon back. `promotions.manage`.
     *
     * The same route as `update` with `{ isActive: true }`, given its own name
     * because it is the other half of a pair a screen offers together, and because
     * "reactivate" is what the seller is doing rather than "patch a column".
     *
     * It does not necessarily make the code work. `isActive` is one rung of four:
     * a reactivated coupon that has passed its `validTo` or exhausted its
     * `usageLimit` is still idle, and {@link couponState} is what says which.
     */
    reactivate: useMutation({
      mutationFn: (couponId: string) =>
        http.request<Coupon>(
          `/seller/shops/${encodeURIComponent(shopId!)}/coupons/${encodeURIComponent(couponId)}`,
          { method: "PATCH", body: { isActive: true } },
        ),
      onSuccess: settle,
    }),
  };
}

/* ── what is not here ─────────────────────────────────────────────────────── */

/**
 * Sponsored listings do not exist, and neither does coupon analytics.
 *
 * `model SponsoredListing` is in `prisma/schema.prisma` and **nothing in
 * `apps/api/src` reads or writes it** — no controller, no service, no admin route.
 * The only other place the word appears is the permission label, "Manage coupons &
 * sponsored". A promotions screen with a sponsored-listing section would be a
 * control wired to nothing, so there is none here.
 *
 * Coupon performance is the same kind of absence, and a sharper one because it is
 * the first thing a seller asks. The row carries `usedCount` and that is the whole
 * of it. There is no revenue attributed to a code, no redemption timeline, and no
 * list of the orders that used it; `CouponRedemption` rows hold an `amount` and no
 * seller route exposes them. A screen that showed "Rs 4,200 given away" would be
 * computing it from nothing.
 */
