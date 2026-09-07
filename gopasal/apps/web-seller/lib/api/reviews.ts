/**
 * Seller-side reviews: read the shop's ratings, post one public reply.
 *
 * Backed by `apps/api/src/modules/reviews/reviews.seller.controller.ts`, which is
 * `@Controller('seller/shops/:shopId/reviews')` — shop-scoped like every other
 * seller route, which is how `PermissionsGuard` resolves *which* shop's
 * membership to check. `GET` needs `reviews.view`, `POST :reviewId/reply` needs
 * `reviews.reply`; both are `SHOP` scope in the API's permission catalogue.
 *
 * What the endpoints do and do not give:
 *
 * - **The list is paged, filtered, searched and sorted by the server.** `GET` takes
 *   `?page=`/`?limit=`, `?q=`, `?answered=true|false`, `?rating=1,2` and
 *   `?sort=newest|oldest`. It used to take nothing at all and `listForShopManage`
 *   had no `take`: one review exists per delivered order, customers write them and a
 *   shop cannot delete them, so the read grew for as long as the shop kept selling —
 *   and the console then filtered and tallied that whole array in the browser.
 * - **Every page carries a `summary` about the whole shop**, deliberately unaffected
 *   by `q`/`answered`/`rating`. That is what the tally cards render: filtering to
 *   "1–2 stars" must not rewrite the shop's average rating to something between 1
 *   and 2. `averageRating` is `null`, never `0`, when the shop has no reviews.
 * - **A reply is a replace, not a thread.** `reply()` writes `sellerReply` with
 *   `prisma.review.update`, so posting again overwrites the previous text. There is
 *   one reply per review, no history, and no route that removes one — the DTO is
 *   `@IsString() @MaxLength(1000)` with no `@IsNotEmpty()`, so an empty string
 *   *would* be accepted, but it stores `""` rather than clearing the column, which
 *   is why this console requires some text instead of offering a delete.
 * - **The reply response is a bare `Review` row** — no `customer`, no `order`. As
 *   with the order transitions, callers refetch instead of merging, or the customer
 *   name and order code would blank out on a successful reply.
 * - **`Review` has no `updatedAt` and no `repliedAt`.** `createdAt` is when the
 *   *customer* wrote it. Nothing records when the shop answered, so no screen can
 *   honestly show that.
 * - A review may carry `productId` (it then also surfaces on that product's page),
 *   but the seller list does not include the product relation, so the console has
 *   an id and no name. It says "About one product" rather than guessing a title.
 * - **`?q=` searches the comment and the order code, and nothing else.** Not the
 *   customer's name: a shop console is not a customer directory.
 */

import type { Paginated } from "@gopasal/api-client";
import { authedRequest } from "./client";

/* --------------------------------------------------------------------- Types */

/**
 * One review as `listForShopManage` returns it: the `Review` row plus the two
 * relations it selects. Nullable columns arrive as `null`, never `undefined`.
 */
export type SellerReviewWire = {
  id: string;
  /** `null` for a review not tied to an order — the column is optional. */
  orderId: string | null;
  shopId: string;
  /** Set when the review is also about one product in the order. */
  productId: string | null;
  customerId: string;
  /** 1–5, enforced on write by `CreateReviewDto`. */
  rating: number;
  comment: string | null;
  sellerReply: string | null;
  /** When the customer wrote it. There is no timestamp for the reply. */
  createdAt: string;
  /** `select: { name: true }` — an OTP account may still have no name. */
  customer: { name: string | null } | null;
  /** `select: { code: true }`, and the relation itself is optional. */
  order: { code: string } | null;
};

/** `ReplyReviewDto.reply` is `@MaxLength(1000)`; the textarea enforces the same. */
export const REPLY_MAX_LENGTH = 1000;

/**
 * How deep one shop is read on the consolidated view.
 *
 * `limit` is capped at 100 by `ListShopReviewsQueryDto`, so 100 is the largest page
 * the API will answer. Five pages is the same bound the order queue uses: enough
 * that a normal shop's whole review history fits in one screen's worth of requests,
 * small enough that a shop with tens of thousands of reviews cannot make the browser
 * hold all of them. When it stops short, the screen says so.
 */
export const REVIEW_PAGE_LIMIT = 100;
export const REVIEW_MAX_PAGES = 5;

/** `?sort=` — the two orders the API implements, both on `createdAt`. */
export type ReviewSortWire = "newest" | "oldest";

/**
 * `?answered=true|false`, as the literal strings the API validates.
 *
 * Not a boolean: query strings are validated with class-transformer's implicit
 * conversion on, which coerces a boolean-typed property with `!!value` — and
 * `!!"false"` is `true`. The API therefore models this as two string literals with
 * `@IsIn`, and so does this client.
 */
export type AnsweredWire = "true" | "false";

/** Everything `GET /seller/shops/:shopId/reviews` accepts. Omit a field to not filter on it. */
export type ReviewQuery = {
  page?: number;
  limit?: number;
  /** Matches the review comment or the order code, case-insensitively. */
  q?: string;
  /** `"true"` = only answered, `"false"` = the unanswered queue, absent = both. */
  answered?: AnsweredWire;
  /** 1–5. An empty array is sent as no filter, not as "match nothing". */
  rating?: number[];
  sort?: ReviewSortWire;
};

/**
 * The counts the API returns beside every page, over **every review the shop has**.
 *
 * Deliberately unaffected by `q`, `answered` and `rating`. These are the numbers the
 * tally cards render, and they are claims about the shop: if they moved with the
 * filter, clicking "1–2 stars" would rewrite the shop's average rating to something
 * between 1 and 2.
 *
 * `averageRating` is `null` — not `0` — when the shop has no reviews. Prisma's `_avg`
 * is null over an empty set, and a shop nobody has reviewed does not have a zero-star
 * rating.
 */
export type ShopReviewSummaryWire = {
  total: number;
  /** The shop has posted a `sellerReply`. */
  answered: number;
  unanswered: number;
  /** Rated 1 or 2 — the ratings worth reading first. */
  lowRated: number;
  averageRating: number | null;
};

/** One page of a shop's reviews plus the shop-wide summary. */
export type ReviewPageWire = Paginated<SellerReviewWire> & {
  summary: ShopReviewSummaryWire;
};

/* --------------------------------------------------------------------- Reads */

function reviewQueryString(query: ReviewQuery): string {
  const params = new URLSearchParams();
  params.set("page", String(query.page ?? 1));
  params.set("limit", String(query.limit ?? REVIEW_PAGE_LIMIT));
  // An empty search box must not become `q=`: the API trims and ignores it, but
  // sending it makes the request URL differ for no reason.
  const q = query.q?.trim();
  if (q) params.set("q", q);
  if (query.answered) params.set("answered", query.answered);
  // An empty rating list is *no* rating filter. Sending `rating=` would be a 400
  // (the DTO wants integers), and `{ in: [] }` server-side would match nothing.
  if (query.rating?.length) params.set("rating", query.rating.join(","));
  if (query.sort) params.set("sort", query.sort);
  return `?${params.toString()}`;
}

/**
 * One page of a shop's reviews, filtered and sorted by the server. Needs
 * `reviews.view` **on that shop**.
 */
export function listShopReviews(
  shopId: string,
  query: ReviewQuery = {},
  signal?: AbortSignal,
): Promise<ReviewPageWire> {
  return authedRequest<ReviewPageWire>(
    `/seller/shops/${encodeURIComponent(shopId)}/reviews${reviewQueryString(query)}`,
    { signal },
  );
}

/**
 * As much of one shop's *matching* reviews as a bounded number of requests can read.
 *
 * The reviews screen is a consolidated multi-shop view and the API pages one shop at
 * a time; there is no endpoint that pages across shops, and inventing a merged cursor
 * in the browser would mean holding every shop's rows anyway. So each shop is read up
 * to {@link REVIEW_MAX_PAGES} pages deep and the results concatenated.
 *
 * `truncated` reports when it stopped short. A list drawn from a truncated read has
 * to say so, or its "nothing here" is a claim about rows nobody fetched.
 */
export async function listAllShopReviews(
  shopId: string,
  query: ReviewQuery = {},
  signal?: AbortSignal,
  maxPages = REVIEW_MAX_PAGES,
): Promise<{
  reviews: SellerReviewWire[];
  matched: number;
  truncated: boolean;
  summary: ShopReviewSummaryWire;
}> {
  const first = await listShopReviews(shopId, { ...query, page: 1 }, signal);
  const reviews = [...first.data];
  const pages = Math.min(first.meta.totalPages, maxPages);
  for (let page = 2; page <= pages; page++) {
    const next = await listShopReviews(shopId, { ...query, page }, signal);
    reviews.push(...next.data);
  }
  return {
    reviews,
    matched: first.meta.total,
    truncated: reviews.length < first.meta.total,
    summary: first.summary,
  };
}

/** An all-zero summary — what a consolidated screen shows before any shop has answered. */
export const EMPTY_REVIEW_SUMMARY: ShopReviewSummaryWire = {
  total: 0,
  answered: 0,
  unanswered: 0,
  lowRated: 0,
  averageRating: null,
};

/**
 * Add up per-shop review summaries for a consolidated view.
 *
 * The counts are sums. The average is re-derived as a **weighted** mean — each shop's
 * average times its own review count, over the combined total — because averaging the
 * averages would give a shop with three reviews the same say as one with three
 * thousand. Shops with no reviews contribute nothing and cannot drag the mean toward
 * zero; when no shop has any, the result is `null` rather than `0`.
 */
export function mergeReviewSummaries(parts: ShopReviewSummaryWire[]): ShopReviewSummaryWire {
  const counts = parts.reduce(
    (acc, s) => ({
      total: acc.total + s.total,
      answered: acc.answered + s.answered,
      unanswered: acc.unanswered + s.unanswered,
      lowRated: acc.lowRated + s.lowRated,
      /** Sum of ratings, reconstructed from each shop's own average and count. */
      ratingSum: acc.ratingSum + (s.averageRating === null ? 0 : s.averageRating * s.total),
      /** Only shops that actually have reviews may weigh on the mean. */
      rated: acc.rated + (s.averageRating === null ? 0 : s.total),
    }),
    { total: 0, answered: 0, unanswered: 0, lowRated: 0, ratingSum: 0, rated: 0 },
  );

  return {
    total: counts.total,
    answered: counts.answered,
    unanswered: counts.unanswered,
    lowRated: counts.lowRated,
    averageRating: counts.rated === 0 ? null : counts.ratingSum / counts.rated,
  };
}

/* ------------------------------------------------------------------- Actions */

/**
 * Post (or overwrite) the shop's public reply. Needs `reviews.reply`.
 *
 * 404s with `'Review not found'` when the review belongs to a different shop —
 * the service checks `review.shopId !== shopId` itself, so a cross-shop id cannot
 * be replied to even by someone who holds the permission somewhere else.
 *
 * The body is exactly `{ reply }`: the API's `ValidationPipe` runs
 * `forbidNonWhitelisted`, so one extra key would be a 400.
 */
export function replyToReview(
  shopId: string,
  reviewId: string,
  reply: string,
  signal?: AbortSignal,
): Promise<SellerReviewWire> {
  return authedRequest<SellerReviewWire>(
    `/seller/shops/${encodeURIComponent(shopId)}/reviews/${encodeURIComponent(reviewId)}/reply`,
    { method: "POST", body: { reply }, signal },
  );
}
