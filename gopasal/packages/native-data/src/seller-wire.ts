/**
 * The seller surface's arithmetic and cache addressing, with no React in it.
 *
 * ## Why this is a file of its own
 *
 * `seller.ts` imports `react-native` on its second line (for `AppState`), so
 * nothing in it can be loaded outside a phone — including the parts that are
 * plain functions of their arguments and are exactly where a quiet, expensive
 * mistake would live:
 *
 *  - **The query keys.** Every shop-scoped key carries its `shopId`, and if two
 *    shops could ever produce the same key the cache would hand one branch's
 *    order queue to another branch's counter. That is not a bug that shows up
 *    as a crash; it shows up as a shopkeeper packing somebody else's order.
 *  - **The stock delta.** `POST …/stock` takes a signed delta, not a total, so
 *    a flipped subtraction does not fail — it adds six to a shelf the
 *    shopkeeper was emptying, and the shelf stays wrong until somebody counts
 *    it again.
 *  - **The transition body.** `reason` is required on reject and cancel and an
 *    unexpected key is a 400 under `forbidNonWhitelisted`, so the shape of this
 *    object is the difference between an order moving and a red strip.
 *
 * These were extracted here unchanged and `seller.ts` imports them; the types
 * they speak in still live there and are imported back as types only, which
 * costs nothing at runtime.
 */
import type {
  AnalyticsPeriod,
  OrderQuery,
  ProductQuery,
  ReviewQuery,
  TransitionInput,
} from "./seller";

/* ── query keys ───────────────────────────────────────────────────────────── */

/** A page's worth of queue on a phone. The server's own default; 100 is its cap. */
const ORDER_PAGE_LIMIT = 20;
const PRODUCT_PAGE_LIMIT = 30;
const REVIEW_PAGE_LIMIT = 20;

export function orderQueryKey(query: OrderQuery) {
  return {
    page: query.page ?? 1,
    limit: query.limit ?? ORDER_PAGE_LIMIT,
    q: query.q?.trim() || null,
    // Sorted so that two tabs listing the same statuses in a different order
    // share one cache entry rather than fetching the same page twice.
    status: query.status?.length ? [...query.status].sort() : null,
    sort: query.sort ?? "newest",
  };
}

export function orderQueryString(query: OrderQuery): string {
  const key = orderQueryKey(query);
  const params = new URLSearchParams();
  params.set("page", String(key.page));
  params.set("limit", String(key.limit));
  // An empty search box must not become `q=`: the API trims and ignores it, but
  // sending it makes the request — and the cache key — differ for no reason.
  if (key.q) params.set("q", key.q);
  if (key.status) params.set("status", key.status.join(","));
  params.set("sort", key.sort);
  return `?${params.toString()}`;
}

export function productQueryKey(query: ProductQuery) {
  return {
    page: query.page ?? 1,
    limit: query.limit ?? PRODUCT_PAGE_LIMIT,
    q: query.q?.trim() || null,
    categoryId: query.categoryId ?? null,
    status: query.status ?? null,
    stock: query.stock ?? null,
    sort: query.sort ?? "recent",
  };
}

export function productQueryString(query: ProductQuery): string {
  const key = productQueryKey(query);
  const params = new URLSearchParams();
  params.set("page", String(key.page));
  params.set("limit", String(key.limit));
  if (key.q) params.set("q", key.q);
  if (key.categoryId) params.set("categoryId", key.categoryId);
  if (key.status) params.set("status", key.status);
  if (key.stock) params.set("stock", key.stock);
  params.set("sort", key.sort);
  return `?${params.toString()}`;
}

export function reviewQueryKey(query: ReviewQuery) {
  return {
    page: query.page ?? 1,
    limit: query.limit ?? REVIEW_PAGE_LIMIT,
    q: query.q?.trim() || null,
    answered: query.answered ?? null,
    rating: query.rating?.length ? [...query.rating].sort() : null,
    sort: query.sort ?? "newest",
  };
}

export function reviewQueryString(query: ReviewQuery): string {
  const key = reviewQueryKey(query);
  const params = new URLSearchParams();
  params.set("page", String(key.page));
  params.set("limit", String(key.limit));
  if (key.q) params.set("q", key.q);
  if (key.answered) params.set("answered", key.answered);
  // An empty rating list is *no* filter: `rating=` would be a 400 (the DTO wants
  // integers) and an empty `in` clause server-side would match nothing.
  if (key.rating) params.set("rating", key.rating.join(","));
  params.set("sort", key.sort);
  return `?${params.toString()}`;
}

/**
 * Every seller key starts with `"seller"`, which is not decoration.
 *
 * The customer surface owns bare keys (`["orders"]`, `["cart"]`) and both files
 * can be loaded in the same process — the seller app's own tests do it. The
 * prefix keeps the two caches from ever answering each other's questions, and it
 * gives `isShopScopedKey` one predicate to work with when the counter switches
 * shop.
 *
 * Shop-scoped keys carry the `shopId` in third position so that everything about
 * one shop can be matched by prefix.
 */
export const qk = {
  all: () => ["seller"] as const,
  shops: () => ["seller", "shops"] as const,

  ordersRoot: (shopId: string) => ["seller", "orders", shopId] as const,
  orders: (shopId: string, query: OrderQuery = {}) =>
    ["seller", "orders", shopId, orderQueryKey(query)] as const,
  order: (shopId: string, orderId: string) => ["seller", "order", shopId, orderId] as const,

  productsRoot: (shopId: string) => ["seller", "products", shopId] as const,
  products: (shopId: string, query: ProductQuery = {}) =>
    ["seller", "products", shopId, productQueryKey(query)] as const,

  conversations: (shopId: string) => ["seller", "conversations", shopId] as const,
  conversation: (shopId: string, conversationId: string) =>
    ["seller", "conversation", shopId, conversationId] as const,

  finance: (shopId: string) => ["seller", "finance", shopId] as const,
  analytics: (shopId: string, period: AnalyticsPeriod) =>
    ["seller", "analytics", shopId, period] as const,

  riders: (shopId: string) => ["seller", "riders", shopId] as const,

  reviewsRoot: (shopId: string) => ["seller", "reviews", shopId] as const,
  reviews: (shopId: string, query: ReviewQuery = {}) =>
    ["seller", "reviews", shopId, reviewQueryKey(query)] as const,
};

/**
 * Is this cache entry an answer *about a shop*?
 *
 * The predicate behind the invalidation that follows a shop switch. The shop
 * *list* is spared: it is a question about the signed-in seller, it is what the
 * switcher itself renders, and refetching it would blank the menu the
 * shopkeeper is looking at mid-tap.
 */
export function isShopScopedKey(key: readonly unknown[]): boolean {
  return key[0] === "seller" && key[1] !== "shops";
}

/* ── writes ───────────────────────────────────────────────────────────────── */

/**
 * What `POST …/products/:id/stock` is given.
 *
 * `AdjustStockDto.delta` is signed and relative, so this is the whole of the
 * arithmetic: `from` is the number the shopkeeper was looking at when they
 * decided, `to` is what they want it to be. Two people counting the same shelf
 * produce two deltas that both apply, which is the honest outcome — the
 * alternative, a total computed against whatever the last refetch put in the
 * cache, silently discards one of them.
 */
export function stockDelta(from: number, to: number): number {
  return to - from;
}

/**
 * The body of an order transition.
 *
 * `{}` rather than `{ note: undefined }` for a transition with no note:
 * `whitelist` strips an undefined key from JSON before it is sent anyway, but
 * building the object this way keeps the request honest about the three shapes
 * the DTOs actually accept.
 *
 * Narrowed on the key rather than on `action`: a discriminant that is itself a
 * union of literals ("accept" | "pack" | "dispatch") does not eliminate the
 * other member of the union when it is tested, so `"reason" in input` is the
 * check that actually types this.
 */
export function transitionBody(input: TransitionInput): Record<string, string> {
  const body: Record<string, string> = {};
  if ("reason" in input) body.reason = input.reason;
  else if (input.note) body.note = input.note;
  return body;
}
