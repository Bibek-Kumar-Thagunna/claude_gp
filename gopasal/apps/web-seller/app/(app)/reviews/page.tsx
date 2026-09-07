"use client";

import * as React from "react";
import { MessageSquare, RefreshCw, Search, Star, Store, X } from "lucide-react";
import { ApiError, SEARCH_MAX_LENGTH } from "@gopasal/api-client";
import { useAuth } from "@/components/auth-provider";
import { useShops } from "@/components/shop-provider";
import { ShopScopeState, scopeShopIds, useShopScope } from "@/components/ShopScope";
import { PageHeader, Card, Button, Badge, EmptyState } from "@/components/primitives";
import { StatCard } from "@/components/StatCard";
import { Reveal } from "@/components/Reveal";
import { PermissionGate } from "@/components/PermissionGate";
import { ErrorPanel, InlineError, InlineNotice, SkeletonRows, Spinner } from "@/components/states";
import { cn } from "@/lib/cn";
import { num, ago } from "@/lib/format";
import { useDebounced } from "@/lib/use-debounced";
import { asApiError } from "@/lib/api/client";
import {
  EMPTY_REVIEW_SUMMARY,
  listAllShopReviews,
  mergeReviewSummaries,
  replyToReview,
  type ReviewQuery,
  type ShopReviewSummaryWire,
} from "@/lib/api/reviews";
import {
  REPLY_MAX_LENGTH,
  REVIEW_FILTERS,
  averageRatingLabel,
  ratingLabel,
  ratingTone,
  replyProblem,
  reviewFilterCount,
  reviewFilterQuery,
  toSellerReviews,
  type ReviewFilter,
  type SellerReview,
} from "@/lib/reviews-view";

/**
 * What customers said, and the shop's one public answer.
 *
 * `GET /seller/shops/:shopId/reviews` (`reviews.view`) and
 * `POST .../reviews/:reviewId/reply` (`reviews.reply`) are the entire surface. Both
 * are shop-scoped, so this screen fans out over the shops the API actually granted
 * `reviews.view` on — which is not necessarily every shop in scope, and the
 * difference is stated rather than hidden.
 *
 * Three things about the endpoint shape this page.
 *
 * 1. **The server filters, searches, sorts and pages.** `?q=`, `?answered=`,
 *    `?rating=`, `?sort=` and `?page=`/`?limit=`. The chips and the search box are
 *    therefore requests. They used to be predicates over an array the browser held,
 *    and the read behind that array had no `take` at all — one review exists per
 *    delivered order, customers write them, and a shop cannot delete them, so it grew
 *    for as long as the shop kept selling.
 * 2. **The counts describe the shop, not the page.** The response carries a `summary`
 *    over every review the shop has, unaffected by the filters, so the three stat
 *    cards and the chip badges stay true while the list narrows. Without that,
 *    clicking "1–2 stars" would rewrite the shop's average rating to something
 *    between 1 and 2.
 * 3. **There is no cross-shop review endpoint, by design** — a caller holding
 *    `reviews.view` on one shop must not be able to widen the question. So the
 *    consolidated view fans out over the readable shops, concatenates, and discloses
 *    when a shop's matching set was deeper than the fan-out reads.
 *
 * What this screen deliberately does not do:
 *
 * - **No analytics.** Three numbers from the summary, and that is all. No trend, no
 *   period comparison, no "rating over time" — the endpoint returns rows and counts,
 *   and a chart drawn from them would be this console's interpretation.
 * - **No sentiment.** The "1–2 stars" chip is a number the customer chose, not a
 *   reading of their words.
 * - **No search by customer name.** `?q=` covers the comment and the order code; a
 *   shop console is not a customer directory.
 * - **No time on a reply.** `model Review` has one timestamp, `createdAt`, and it
 *   belongs to the customer. Nothing records when the shop answered.
 * - **No product name on a product review.** The seller endpoint selects the
 *   customer and the order code, never the product, so a review that points at one
 *   product is labelled as such and left there.
 *
 * A reply overwrites: the service does `review.update({ data: { sellerReply } })`,
 * so the form for an answered review is an edit box pre-filled with what is
 * currently public, and it says so.
 */
export default function ReviewsPage() {
  return (
    <PermissionGate perm="reviews.view">
      <ReviewsInner />
    </PermissionGate>
  );
}

function ReviewsInner() {
  const { canInShop } = useAuth();
  const { scopedShopIds, activeShopId, shopById } = useShops();

  /**
   * The shops this account may actually read reviews for, or why there are none.
   *
   * `useSeller().can` is not enough on a consolidated view: it answers "somewhere",
   * and a staff member can hold `reviews.view` on one shop and nothing on another.
   * {@link useShopScope} also separates a shop list that is still loading, or that
   * failed to load, from a genuinely missing grant.
   */
  const scope = useShopScope("reviews.view");
  const readableShopIds = scopeShopIds(scope);
  const idsKey = readableShopIds.join(",");

  const [reviews, setReviews] = React.useState<SellerReview[]>([]);
  const [summary, setSummary] = React.useState<ShopReviewSummaryWire>(EMPTY_REVIEW_SUMMARY);
  /** Reviews matching the current chip and search across every readable shop, per the server. */
  const [matched, setMatched] = React.useState(0);
  const [truncated, setTruncated] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<ApiError | null>(null);
  const [filter, setFilter] = React.useState<ReviewFilter>("all");
  const [q, setQ] = React.useState("");
  /** The review currently being replied to, and the id being saved. */
  const [editing, setEditing] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  // The input stays instant; only the settled value becomes a request.
  const debouncedQ = useDebounced(q.trim());

  // Serialised so the loader depends on a primitive: a fresh object each render
  // would re-fire the effect on every keystroke, debounce or not.
  const queryKey = JSON.stringify({
    q: debouncedQ || undefined,
    ...reviewFilterQuery(filter),
    sort: "newest",
  });

  const load = React.useCallback(
    async (signal?: AbortSignal) => {
      const ids = idsKey ? idsKey.split(",").filter(Boolean) : [];
      const query = JSON.parse(queryKey) as ReviewQuery;
      if (ids.length === 0) {
        setReviews([]);
        setSummary(EMPTY_REVIEW_SUMMARY);
        setMatched(0);
        setTruncated(false);
        setLoading(false);
        setError(null);
        return;
      }
      setLoading(true);
      try {
        const pages = await Promise.all(ids.map((id) => listAllShopReviews(id, query, signal)));
        if (signal?.aborted) return;
        // Each shop comes back newest-first; concatenating several shops does not
        // preserve that, so the merged list is re-sorted on the one timestamp the
        // row has.
        setReviews(
          toSellerReviews(pages.flatMap((p) => p.reviews)).sort((a, b) =>
            b.createdAt.localeCompare(a.createdAt),
          ),
        );
        setMatched(pages.reduce((a, p) => a + p.matched, 0));
        setSummary(mergeReviewSummaries(pages.map((p) => p.summary)));
        setTruncated(pages.some((p) => p.truncated));
        setError(null);
      } catch (err) {
        if (signal?.aborted) return;
        setError(asApiError(err));
        setReviews([]);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [idsKey, queryKey],
  );

  React.useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  /**
   * Posting a reply answers with a bare `Review` row — no `customer`, no `order` —
   * so merging it into the list would blank the shopper's name and the order code
   * on the card that was just answered. Refetch instead.
   */
  const submitReply = React.useCallback(
    async (r: SellerReview, text: string) => {
      setSaving(r.id);
      setActionError(null);
      try {
        await replyToReview(r.shopId, r.id, text.trim());
        setEditing(null);
        await load();
      } catch (err) {
        setActionError(
          err instanceof ApiError ? err.message : "That reply didn’t post. Please try again.",
        );
      } finally {
        setSaving(null);
      }
    },
    [load],
  );

  const filtering = debouncedQ !== "" || filter !== "all";
  const hiddenShops = scopedShopIds.length - readableShopIds.length;

  /**
   * Whether the cards below are facts yet.
   *
   * `summary` starts as `EMPTY_REVIEW_SUMMARY`, so drawing it before the first
   * answer — or after one that failed — reports zero reviews and zero unanswered
   * for a shop nobody has read yet. `averageRating` already has a `null` for "no
   * one has rated this", which is a different statement from "not known yet".
   */
  const summaryKnown = scope.kind === "ready" && !error && !(loading && reviews.length === 0);
  const stat = (value: number) => (summaryKnown ? num(value) : "—");

  return (
    <div>
      <PageHeader
        icon={<Star className="h-5 w-5" />}
        title="Reviews"
        subtitle={
          activeShopId === null
            ? "Ratings your shops received, and the replies customers can see."
            : "Ratings this shop received, and the replies customers can see."
        }
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Refresh
          </Button>
        }
      />

      {/*
        Every card below reads the server's shop-wide summary, never the rows on
        screen. An "average rating" that moved when the seller clicked "1–2 stars"
        would be a claim about the shop made from a filter.
      */}
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Reveal>
          <StatCard
            label="Reviews"
            value={stat(summary.total)}
            icon={Star}
            tone="marigold"
            hint="Every one received"
          />
        </Reveal>
        <Reveal delay={1}>
          <StatCard
            label="Not answered"
            value={stat(summary.unanswered)}
            icon={MessageSquare}
            tone="crimson"
            hint="No public reply yet"
          />
        </Reveal>
        <Reveal delay={2}>
          {/* `null`, not `0`, for a shop nobody has reviewed — so this shows an
              em dash rather than putting a zero-star rating on a new shop. It shows
              the same dash before the first answer arrives, and the hint stays
              silent rather than claiming there is nothing to average. */}
          <StatCard
            label="Average rating"
            value={summaryKnown ? averageRatingLabel(summary.averageRating) : "—"}
            icon={Star}
            tone="green"
            hint={
              !summaryKnown
                ? undefined
                : summary.total === 0
                  ? "Nothing to average yet"
                  : `Across ${num(summary.total)} reviews`
            }
          />
        </Reveal>
      </div>

      <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="gp-scroll -mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
          {REVIEW_FILTERS.map((f) => {
            const c = reviewFilterCount(f.id, summary);
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                aria-pressed={filter === f.id}
                title={f.hint}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
                  filter === f.id
                    ? "bg-crimson-50 text-crimson-700"
                    : "text-ink-500 hover:bg-ink-50",
                )}
              >
                {f.label}
                {/* From the shop-wide summary, so a chip's badge counts what
                    picking it would show — not what is currently loaded. */}
                {c > 0 && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-xs font-semibold",
                      filter === f.id ? "bg-crimson-100 text-crimson-700" : "bg-ink-100 text-ink-500",
                    )}
                  >
                    {c}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="relative shrink-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search comments or order code"
            aria-label="Search reviews by comment or order code"
            /* The server's own ceiling on `?q=`, so a long paste is stopped here
                instead of coming back as a 400 nobody can act on. */
            maxLength={SEARCH_MAX_LENGTH}
            className="h-10 w-full rounded-xl border border-ink-200 pl-9 pr-9 text-sm outline-none focus:border-crimson-300 lg:w-72"
          />
          {loading && reviews.length > 0 && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2">
              <Spinner />
            </span>
          )}
        </div>
      </div>

      {hiddenShops > 0 && (
        <InlineNotice
          className="mt-4"
          message={`${num(hiddenShops)} of the shops in scope ${hiddenShops === 1 ? "is" : "are"} not shown: your role there does not include “View reviews”.`}
        />
      )}
      {actionError && <InlineError className="mt-4" message={actionError} />}

      {/*
        The fan-out reads a bounded number of pages per shop. When a shop's matching
        set is deeper than that, say so — otherwise "nothing else here" would be a
        claim about rows nobody fetched.
      */}
      {truncated && (
        <InlineNotice
          className="mt-4"
          message={`Showing the ${num(reviews.length)} most recent of ${num(matched)} matching reviews. Search, or pick a narrower filter, to reach the rest.`}
        />
      )}

      <div className="mt-4">
        {loading && reviews.length === 0 ? (
          <SkeletonRows rows={4} />
        ) : error ? (
          <ErrorPanel
            message={error.message}
            offline={error.offline}
            onRetry={() => void load()}
          />
        ) : scope.kind !== "ready" ? (
          <ShopScopeState
            scope={scope}
            what="reviews"
            permLabel="view reviews"
            icon={<Star className="h-6 w-6" />}
          />
        ) : reviews.length === 0 ? (
          <EmptyState
            icon={<Star className="h-6 w-6" />}
            title={
              /* The shop-wide `summary`, not the chip, decides whether "none
                 match" or "none exist" is true. A shop with no reviews at all used
                 to read "Every review has an answer" whenever the Unanswered chip
                 happened to be selected. */
              summary.total === 0
                ? "No reviews yet"
                : debouncedQ !== ""
                  ? "Nothing matches that search"
                  : filter === "unanswered"
                    ? "Every review has an answer"
                    : filter === "low"
                      ? "No reviews at 1 or 2 stars"
                      : "No reviews yet"
            }
            description={
              summary.total > 0 && filtering
                ? "This was checked against every review these shops have, not just a page of them."
                : "A customer can review an order once it has been delivered, and only once. Reviews appear here as they arrive."
            }
          />
        ) : (
          <div className="space-y-3">
            {reviews.map((r) => (
              <ReviewCard
                key={r.id}
                r={r}
                shopName={activeShopId === null ? shopById(r.shopId)?.name ?? null : null}
                canReply={canInShop(r.shopId, "reviews.reply")}
                open={editing === r.id}
                saving={saving === r.id}
                onOpen={() => {
                  setActionError(null);
                  setEditing(r.id);
                }}
                onCancel={() => setEditing(null)}
                onSubmit={(text) => void submitReply(r, text)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Five glyphs and one sentence.
 *
 * The colour comes from `ratingTone`, so the row of stars carries the traffic
 * light and there is no second chip repeating the number — a screen reader gets
 * "4 out of 5" once, from the label, rather than twice.
 */
function Stars({ rating }: { rating: number }) {
  const tone = ratingTone(rating);
  const lit =
    tone === "green"
      ? "text-brand-green"
      : tone === "marigold"
        ? "text-brand-marigold"
        : "text-brand-red";
  return (
    <span role="img" aria-label={ratingLabel(rating)} className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          aria-hidden="true"
          className={cn("h-4 w-4", i <= rating ? cn(lit, "fill-current") : "text-ink-200")}
        />
      ))}
    </span>
  );
}

/**
 * One review, and the shop's answer to it.
 *
 * `canReply` is the caller's `canInShop(shopId, "reviews.reply")` — not
 * `useSeller().can`, which would answer "somewhere" and offer a form the API
 * refuses on this particular shop. Without it the card still shows the review;
 * reading and answering are separate grants.
 */
function ReviewCard({
  r,
  shopName,
  canReply,
  open,
  saving,
  onOpen,
  onCancel,
  onSubmit,
}: {
  r: SellerReview;
  /** Only set on the all-shops view, where a row needs to say which shop it is. */
  shopName: string | null;
  canReply: boolean;
  open: boolean;
  saving: boolean;
  onOpen: () => void;
  onCancel: () => void;
  onSubmit: (text: string) => void;
}) {
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Stars rating={r.rating} />
        <Badge tone={r.answered ? "green" : "crimson"}>
          {r.answered ? "Answered" : "Not answered"}
        </Badge>
        {shopName && (
          <span className="inline-flex items-center gap-1 text-xs text-ink-500">
            <Store className="h-3.5 w-3.5" /> {shopName}
          </span>
        )}
        <span className="ml-auto text-xs text-ink-400">{ago(r.createdAt)}</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-500">
        <span className={cn("font-semibold text-ink-700", !r.named && "font-normal italic")}>
          {r.customerName}
        </span>
        {r.orderCode && <span>· {r.orderCode}</span>}
        {/* The seller route selects `productId` and never the product, so this can
            say that the review is about one product and not which. */}
        {r.aboutProduct && <span>· About one product</span>}
      </div>

      {r.comment ? (
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-800">{r.comment}</p>
      ) : (
        <p className="mt-2 text-sm italic text-ink-400">Rated without writing a comment.</p>
      )}

      {r.reply && !open && (
        <div className="mt-3 rounded-lg border border-ink-100 bg-ink-50/60 p-3">
          {/* `model Review` has one timestamp and it is the customer's, so this
              block deliberately carries no "replied 2h ago". */}
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
            Your public reply
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-700">{r.reply}</p>
        </div>
      )}

      {open ? (
        <ReplyForm
          initial={r.reply ?? ""}
          answered={r.answered}
          saving={saving}
          onCancel={onCancel}
          onSubmit={onSubmit}
        />
      ) : canReply ? (
        <div className="mt-3">
          <Button variant="outline" size="sm" onClick={onOpen}>
            <MessageSquare className="h-4 w-4" /> {r.answered ? "Edit your reply" : "Reply"}
          </Button>
        </div>
      ) : (
        !r.answered && (
          <p className="mt-3 text-xs text-ink-400">
            Answering needs “Reply to reviews” on this shop, which your role does not include.
          </p>
        )
      )}
    </Card>
  );
}

/**
 * The reply box.
 *
 * A reply overwrites: the service does `review.update({ data: { sellerReply } })`,
 * so on an answered review this opens pre-filled with what is currently public and
 * says what posting will do. There is no route that clears `sellerReply` and
 * `ReplyReviewDto` would happily store `""`, so `replyProblem` refuses an empty
 * box rather than letting the shop publish a reply that says nothing.
 */
function ReplyForm({
  initial,
  answered,
  saving,
  onCancel,
  onSubmit,
}: {
  initial: string;
  answered: boolean;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (text: string) => void;
}) {
  const id = React.useId();
  const [text, setText] = React.useState(initial);
  const [touched, setTouched] = React.useState(false);
  const problem = replyProblem(text);
  const length = text.trim().length;

  return (
    <form
      className="mt-3"
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (problem) return;
        onSubmit(text);
      }}
    >
      <label htmlFor={id} className="text-xs font-semibold text-ink-600">
        {answered ? "Edit the reply customers see" : "Your public reply"}
      </label>
      <textarea
        id={id}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => setTouched(true)}
        rows={3}
        disabled={saving}
        placeholder="Answer the customer in your own words."
        className="mt-1 w-full rounded-lg border border-ink-200 bg-white p-2.5 text-sm outline-none transition-colors placeholder:text-ink-400 focus:border-crimson-300 disabled:opacity-60"
      />
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          className={cn(
            "text-[11px] tabular-nums",
            length > REPLY_MAX_LENGTH ? "font-semibold text-brand-red" : "text-ink-400",
          )}
        >
          {num(length)} / {num(REPLY_MAX_LENGTH)}
        </span>
        {answered && (
          <span className="text-[11px] text-ink-400">
            Posting replaces the reply customers can see now.
          </span>
        )}
      </div>

      {touched && problem && <InlineError className="mt-2" message={problem} />}

      <div className="mt-2 flex items-center gap-2">
        <Button type="submit" size="sm" disabled={saving || (touched && problem !== null)}>
          <MessageSquare className="h-4 w-4" />
          {saving ? "Posting…" : answered ? "Replace reply" : "Post reply"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          <X className="h-4 w-4" /> Cancel
        </Button>
      </div>
    </form>
  );
}


