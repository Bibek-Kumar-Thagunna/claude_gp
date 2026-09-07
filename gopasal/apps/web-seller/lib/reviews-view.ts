/**
 * The seller console's view of its shops' reviews.
 *
 * There is very little to derive here, and that is the point. A review is a
 * rating, the customer's words, and — if the shop has answered — one reply. The
 * counts and the average come from the endpoint's `summary`, over the whole shop;
 * nothing here recomputes them from the rows on screen, and nothing invents what the
 * API does not send:
 *
 * - **The average is the shop's, not the page's.** `listForShopManage` returns a
 *   `summary` computed over every review the shop has and deliberately unaffected by
 *   `q`/`answered`/`rating`, so the number survives filtering. It is `null` rather
 *   than `0` for a shop nobody has reviewed — that shop does not have a zero-star
 *   rating.
 * - **No sentiment, no scoring, no "improving/declining".** The comment is text a
 *   customer wrote; classifying it would be this console's opinion dressed up as
 *   the shop's data.
 * - **Nothing says when the shop replied.** `model Review` has `createdAt` (the
 *   customer's) and no `updatedAt` or `repliedAt`, so the reply is shown without a
 *   time. An "answered 2h ago" would be fiction.
 *
 * The filters below are query fragments, not array predicates: each one names the
 * `?answered=`/`?rating=` the server should apply. They used to filter an array the
 * browser held, which meant a shop whose reviews outgrew one read could look for its
 * unanswered ones and be shown a subset without being told.
 */

import type { Tone } from "@/components/primitives";
import {
  REPLY_MAX_LENGTH,
  type ReviewQuery,
  type SellerReviewWire,
  type ShopReviewSummaryWire,
} from "./api/reviews";

/* --------------------------------------------------------------------- Rows */

export type SellerReview = {
  id: string;
  shopId: string;
  /** 1–5. */
  rating: number;
  /** `null` when the customer rated without writing anything. */
  comment: string | null;
  /** The shop's public reply, or `null` if it has not answered. */
  reply: string | null;
  answered: boolean;
  /** The customer's name, or a neutral stand-in when their account has none. */
  customerName: string;
  /** False when the name above is the stand-in rather than something they gave. */
  named: boolean;
  /** The order this review came from, when it has one. */
  orderCode: string | null;
  /**
   * True when the review also points at a single product. The seller endpoint
   * returns only `productId`, never the product, so the console can say *that* it
   * is about one product and cannot say which.
   */
  aboutProduct: boolean;
  /** When the customer wrote it. */
  createdAt: string;
};

function toSellerReview(w: SellerReviewWire): SellerReview {
  const name = w.customer?.name?.trim() ?? "";
  const reply = w.sellerReply?.trim() ?? "";
  const comment = w.comment?.trim() ?? "";
  return {
    id: w.id,
    shopId: w.shopId,
    rating: w.rating,
    comment: comment.length > 0 ? comment : null,
    reply: reply.length > 0 ? reply : null,
    answered: reply.length > 0,
    customerName: name.length > 0 ? name : "A GoPasal customer",
    named: name.length > 0,
    orderCode: w.order?.code ?? null,
    aboutProduct: w.productId !== null,
    createdAt: w.createdAt,
  };
}

export function toSellerReviews(wire: SellerReviewWire[]): SellerReview[] {
  return wire.map(toSellerReview);
}

/* --------------------------------------------------------------------- Stars */

/** Colour for a rating. A traffic light on a number the customer chose. */
export function ratingTone(rating: number): Tone {
  if (rating >= 4) return "green";
  if (rating === 3) return "marigold";
  return "red";
}

/** "4 out of 5" — spelt out for screen readers, which cannot read a row of glyphs. */
export function ratingLabel(rating: number): string {
  return `${rating} out of 5`;
}

/* -------------------------------------------------------------------- Filters */

/**
 * `low` is exactly "rated 1 or 2", named after the number rather than a mood. It
 * is the queue a shopkeeper actually wants: the people who were unhappy enough to
 * say so, and who may still be reachable.
 */
export type ReviewFilter = "all" | "unanswered" | "low";

export const REVIEW_FILTERS: { id: ReviewFilter; label: string; hint: string }[] = [
  { id: "all", label: "All reviews", hint: "Everything these shops have received." },
  { id: "unanswered", label: "Not answered", hint: "No public reply from the shop yet." },
  { id: "low", label: "1–2 stars", hint: "The ratings worth reading first." },
];

/**
 * The chip, as the query the server should run.
 *
 * `unanswered` is `?answered=false` — the string, because a boolean query param would
 * be read as `!!"false"` and come back as "answered". `low` is `?rating=1,2`, which is
 * the same definition the API's `lowRated` count uses, so the chip and the tally card
 * cannot disagree about what "low" means.
 */
export function reviewFilterQuery(filter: ReviewFilter): Pick<ReviewQuery, "answered" | "rating"> {
  if (filter === "unanswered") return { answered: "false" };
  if (filter === "low") return { rating: [1, 2] };
  return {};
}

/** The count for a chip, from the shop-wide summary rather than from the loaded rows. */
export function reviewFilterCount(filter: ReviewFilter, summary: ShopReviewSummaryWire): number {
  if (filter === "unanswered") return summary.unanswered;
  if (filter === "low") return summary.lowRated;
  return summary.total;
}

/** The shop's mean rating, to one decimal, or `null` when there is nothing to average. */
export function averageRatingLabel(average: number | null): string {
  return average === null ? "—" : (Math.round(average * 10) / 10).toFixed(1);
}

/* --------------------------------------------------------------------- Reply */

/**
 * Why this reply cannot be posted, or `null` if it can.
 *
 * The server would accept an empty string — `ReplyReviewDto` is `@IsString()`
 * with no `@IsNotEmpty()` — and store `""`, which reads to a customer as a reply
 * that says nothing. There is no route that clears `sellerReply`, so the console
 * refuses the empty case rather than offering a delete that does not exist.
 */
export function replyProblem(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return "Write your reply before posting it.";
  if (trimmed.length > REPLY_MAX_LENGTH) {
    return `Replies can be up to ${REPLY_MAX_LENGTH} characters — this one is ${trimmed.length}.`;
  }
  return null;
}

export { REPLY_MAX_LENGTH };
