/**
 * Seller catalog + inventory endpoints.
 *
 * Backed by `apps/api/src/modules/catalog/catalog.seller.controller.ts` (every
 * route under `/seller/shops/:shopId/...`, so the API's `PermissionsGuard` can
 * resolve the shop from the route) plus the one public read, `GET /categories`,
 * which `CatalogPublicController` serves without a token.
 *
 * Five properties of this API shape every caller in the console:
 *
 * 1. **Writes answer with a bare `Product` row — no `variants`.** `create`,
 *    `update` and `adjustStock` all return `prisma.product.{create,update}`
 *    without an `include`, so merging the response into a loaded list would
 *    silently drop the variants already on screen. Every write helper below is
 *    typed `ProductRowWire` (no `variants` key) and callers must refetch.
 * 2. **The list searches, filters and sorts on the server.** `q`, `categoryId`,
 *    `status`, `stock` and `sort` are all applied in SQL — see
 *    `ListShopProductsQueryDto`. It also returns a `summary` counted over the
 *    **whole shop**, deliberately unaffected by those filters, which is what a
 *    stat card must render: a count that shrank because someone typed in the
 *    search box would read as a fact about the shop.
 * 3. **Stock is a signed delta on the product, and only when tracking is on.**
 *    `POST …/products/:id/stock` clamps at zero (`Math.max(0, stock + delta)`)
 *    and 400s with "Stock tracking is off for this product" when `trackStock` is
 *    false. Variant stock is *not* reachable from this route at all — the only
 *    way to change it is `PATCH …/variants/:variantId`, which is `catalog.edit`,
 *    not `inventory.adjust`, and sets an absolute value rather than a delta.
 * 4. **Delete needs `catalog.delete`.** It is a hard `prisma.product.delete`,
 *    not a soft flag — hiding a product from customers is `isActive: false` via
 *    {@link updateProduct}, which is the reversible thing a seller usually
 *    means.
 *
 * 5. **Photos are bytes, and the storage key is the API's to choose.** There are
 *    three image routes — {@link uploadProductImage}, {@link deleteProductImage},
 *    {@link reorderProductImages} — and none of them accepts a path or a URL.
 *    `Product.images` holds keys the server minted under `public/`, and a mutation
 *    may only name a key the product already has; `CreateProductDto` deliberately
 *    has no `images` field, so sending one is a 400 under `forbidNonWhitelisted`.
 *    Every product read and write answers with both `images` (the keys, for the
 *    next mutation) and `imageUrls` (the same list resolved, in the same order,
 *    for rendering).
 *
 * There is still no bulk/CSV import route, and no low-stock threshold column on
 * `Product` — so `stock` has `out`, `in` and `untracked` and no `low`. Nothing
 * here invents them.
 *
 * Fields are typed exactly as Prisma serialises them — `null` for an unset
 * nullable column, never `undefined`.
 */

import { rawRequest, type Paginated } from "@gopasal/api-client";
import { authedRequest } from "./client";
import type { Category } from "./types";

/* ------------------------------------------------------------------ Wire rows */

/** `ProductVariant` in `prisma/schema.prisma`. No `trackStock` of its own. */
export type ProductVariantWire = {
  id: string;
  productId: string;
  name: string;
  sku: string | null;
  price: number;
  mrp: number | null;
  stock: number;
  isActive: boolean;
};

/**
 * A bare `Product` row: what every write answers with, and the scalar half of
 * the list.
 *
 * `price` is the product's own price in paisa-free rupees (the API stores
 * integers). `stock`/`trackStock` are product-level; variants carry separate
 * counts that this row says nothing about.
 *
 * `images` and `imageUrls` are the same photos twice, in the same order.
 * `images` holds the **storage keys** the API minted — that is what a delete or a
 * reorder has to name — and `imageUrls` holds them resolved by whichever storage
 * provider is live, which is what an `<Image>` renders. Neither is writable
 * through a JSON body; see {@link uploadProductImage}. `imageUrls` can be
 * *shorter* than `images` if a key no longer resolves, so never index one by the
 * other's position.
 */
export type ProductRowWire = {
  id: string;
  shopId: string;
  name: string;
  nameNp: string | null;
  description: string | null;
  categoryId: string | null;
  price: number;
  mrp: number | null;
  unit: string;
  /** Storage keys under `public/`, in display order. Server-minted, never URLs. */
  images: string[];
  /** The same keys resolved to fetchable URLs, in the same order. */
  imageUrls: string[];
  tags: string[];
  isActive: boolean;
  trackStock: boolean;
  stock: number;
  createdAt: string;
  updatedAt: string;
};

/** What the seller list returns: the row plus every variant, active or not. */
export type ProductWire = ProductRowWire & { variants: ProductVariantWire[] };

/* -------------------------------------------------------------------- Bodies */

/**
 * `CreateProductDto`. The pipe runs `whitelist: true, forbidNonWhitelisted:
 * true`, so one unknown key is a 400 — these are all of them, and there is no
 * `isActive` here: a new product is always visible (Prisma default). Hiding it
 * takes a follow-up {@link updateProduct}, which needs `catalog.edit`.
 *
 * **There is no `images` here, and adding one back would be a 400.** It used to
 * be declared as `images?: string[]`, mirroring a DTO field that let a client
 * write arbitrary strings into a column the storefront renders as image sources.
 * The API removed the field; photos arrive as bytes on
 * {@link uploadProductImage}, after the product row exists.
 */
export type ProductCreateBody = {
  name: string;
  nameNp?: string;
  description?: string;
  categoryId?: string;
  price: number;
  mrp?: number;
  unit?: string;
  tags?: string[];
  trackStock?: boolean;
  stock?: number;
};

/**
 * `UpdateProductDto` — `CreateProductDto` with everything optional, plus `isActive`,
 * and `null` where a column is nullable.
 *
 * **`null` clears a nullable column, and only a nullable one.** This is not the
 * `@IsOptional()` accident it looks like. `UpdateProductDto` decorates every field
 * with `@IsOptional()`, which class-validator treats as "skip every validator when
 * the value is empty", so a JSON `null` reaches the service unvalidated — and
 * `products.service.ts` is written for exactly that: `productData()` routes the
 * non-nullable columns (`name`, `price`, `unit`, `tags`, `trackStock`, `stock`,
 * `isActive`) through a `keep()` helper that turns `null` back into `undefined`
 * ("leave the column alone"), and deliberately does *not* route `nameNp`,
 * `description`, `categoryId` or `mrp` through it, because `Product` declares those
 * four `String?`/`Int?` and for them `null` is the documented way to clear a value.
 *
 * So the four unions below are the API's real contract, not a hopeful guess, and the
 * absence of a union on the rest is deliberate: sending `{"name": null}` is silently
 * ignored rather than honoured, which is not something a form should ask for.
 *
 * This differs from `UpdateShopDto`, where every field is `@OptionalField()` and
 * `null` is a 400 — see `apps/api/src/common/dto/optional-field.decorator.ts`. The
 * two bodies genuinely disagree, and a shop's category therefore cannot be cleared
 * while a product's can.
 */
export type ProductUpdateBody = Omit<
  Partial<ProductCreateBody>,
  "nameNp" | "description" | "categoryId" | "mrp"
> & {
  nameNp?: string | null;
  description?: string | null;
  categoryId?: string | null;
  mrp?: number | null;
  isActive?: boolean;
};

/** `VariantDto`. `name` and `price` are required on create. */
export type VariantCreateBody = {
  name: string;
  sku?: string;
  price: number;
  mrp?: number;
  stock?: number;
};

/**
 * The PATCH body for a variant.
 *
 * `UpdateVariantDto` is a real class on the API side, so `whitelist` and
 * `forbidNonWhitelisted` apply and an unknown key is a 400. It was briefly typed
 * `Partial<VariantDto>` there — a mapped type, which TypeScript emits as `Object`,
 * so `ValidationPipe` skipped the body entirely and whatever was sent flowed into
 * `prisma.productVariant.update({ data })`. Keeping this shape exact is what makes
 * the console's requests survive the whitelist.
 *
 * `isActive` is kept even though no screen sends it. It is not a guess: the DTO
 * carries `@IsOptional() @IsBoolean() isActive?`, and that route is the only writer
 * of the column anywhere in the API. The console *reads* the flag — /inventory and
 * the variant editor both mark a switched-off variant, and `spanOf` in
 * `catalog-view.ts` leaves inactive variants out of a product's price span — so
 * dropping the key would make this type narrower than the route it describes and
 * would turn the day someone adds the toggle into an edit of two files. What does
 * not exist is a control, and both screens say so rather than implying one.
 */
export type VariantUpdateBody = Partial<VariantCreateBody> & { isActive?: boolean };

/* --------------------------------------------------------------------- Reads */

/** Public, unauthenticated category list. The API's one source of category names. */
export function fetchCategories(signal?: AbortSignal): Promise<Category[]> {
  return rawRequest<Category[]>("/categories", { signal });
}

/** `PaginationDto` caps `limit` at 100, so that is the largest page we can ask for. */
export const PRODUCT_PAGE_LIMIT = 100;

/** How many pages {@link listAllShopProducts} will read before giving up. */
export const PRODUCT_MAX_PAGES = 5;

/**
 * The `categoryId` value that means "the shop never assigned one".
 *
 * A real id cannot express it and `categoryId=` empty would be indistinguishable from
 * omitting the filter, so the API takes this literal. Mirrors `NO_CATEGORY` in
 * `apps/api/src/modules/catalog/dto/catalog.dto.ts`.
 */
export const NO_CATEGORY = "none";

/** `PRODUCT_STATUS_FILTERS` in the API DTO. */
export type ProductStatusFilter = "active" | "hidden";

/**
 * `PRODUCT_STOCK_FILTERS`. There is no `low`: `Product` has `stock` and
 * `trackStock` and no threshold, so a "low" tier would be a line the console drew
 * and then attributed to the shop. `untracked` is the shop declining to count,
 * which is not the same as having none.
 */
export type ProductStockFilter = "in" | "out" | "untracked";

/** `PRODUCT_SORTS`. `recent` is `updatedAt desc` and the server's default. */
export type ProductSort = "recent" | "name" | "price_asc" | "price_desc" | "stock_asc";

/** Everything `GET …/products` accepts. Omitted keys are not sent. */
export type ProductQuery = {
  page?: number;
  limit?: number;
  q?: string;
  /** A category id, or {@link NO_CATEGORY}. */
  categoryId?: string;
  status?: ProductStatusFilter;
  stock?: ProductStockFilter;
  sort?: ProductSort;
};

/**
 * The counts the API returns beside every page, over the **whole shop**.
 *
 * These ignore `q`, `status`, `stock` and `categoryId` by design, so a stat card
 * built on them keeps saying something true while the list below it is filtered.
 * `hidden` is `total - active`, computed server-side, so the two cannot disagree.
 */
export type CatalogSummaryWire = {
  total: number;
  active: number;
  hidden: number;
  /** Tracked and at or below zero. */
  outOfStock: number;
  /** `trackStock: false`. */
  untracked: number;
  /**
   * The categories this shop's catalogue actually uses, with a row count each.
   * `categoryId: null` is the uncategorised bucket.
   *
   * Shop-wide, like the counts, and for a sharper reason: the console renders these
   * as filter chips. Chips derived from the *filtered* page would collapse to the one
   * selected category the moment a seller clicked one — a filter UI that deletes its
   * own alternatives. The platform-wide `GET /categories` list is not a substitute
   * either, since most of it matches nothing in any given shop.
   */
  categories: { categoryId: string | null; count: number }[];
};

/** One page of products plus the shop-wide summary. */
export type ProductPageWire = Paginated<ProductWire> & { summary: CatalogSummaryWire };

function productQueryString(query: ProductQuery): string {
  const params = new URLSearchParams();
  params.set("page", String(query.page ?? 1));
  params.set("limit", String(query.limit ?? PRODUCT_PAGE_LIMIT));
  // A blank search box must not become `q=`: the API trims and ignores it, but
  // sending it makes the request URL — and therefore the cache key — differ for no
  // reason.
  const q = query.q?.trim();
  if (q) params.set("q", q);
  if (query.categoryId) params.set("categoryId", query.categoryId);
  if (query.status) params.set("status", query.status);
  if (query.stock) params.set("stock", query.stock);
  if (query.sort) params.set("sort", query.sort);
  return `?${params.toString()}`;
}

/** One page of a shop's products, filtered and sorted by the server. */
export function listShopProducts(
  shopId: string,
  query: ProductQuery = {},
  signal?: AbortSignal,
): Promise<ProductPageWire> {
  return authedRequest<ProductPageWire>(
    `/seller/shops/${encodeURIComponent(shopId)}/products${productQueryString(query)}`,
    { signal },
  );
}

/**
 * As much of one shop's *matching* products as a bounded number of requests can read.
 *
 * The screens above this are consolidated multi-shop views, and the API pages one shop
 * at a time — there is no endpoint that pages across shops, and inventing a merged
 * cursor in the browser would mean holding every shop's rows anyway. So each shop is
 * read up to {@link PRODUCT_MAX_PAGES} pages deep and the results concatenated.
 *
 * The filters go to the server, so this reads the matching set rather than the whole
 * catalogue, which is what makes the bound reasonable. `truncated` still reports when
 * it stopped short: a filtered list drawn from a truncated read must say so, or its
 * "no matches" is a claim about rows nobody looked at.
 */
export async function listAllShopProducts(
  shopId: string,
  query: ProductQuery = {},
  signal?: AbortSignal,
  maxPages = PRODUCT_MAX_PAGES,
): Promise<{
  products: ProductWire[];
  matched: number;
  truncated: boolean;
  summary: CatalogSummaryWire;
}> {
  const first = await listShopProducts(shopId, { ...query, page: 1 }, signal);
  const products = [...first.data];
  const pages = Math.min(first.meta.totalPages, maxPages);
  for (let page = 2; page <= pages; page++) {
    const next = await listShopProducts(shopId, { ...query, page }, signal);
    products.push(...next.data);
  }
  return {
    products,
    matched: first.meta.total,
    truncated: products.length < first.meta.total,
    summary: first.summary,
  };
}

/**
 * Add up per-shop summaries for a consolidated view.
 *
 * The counts add. `categories` is a union keyed by `categoryId`, with counts summed
 * where two shops both stock a category — the chip row on a consolidated screen is
 * "categories in scope", and a category one shop uses is in scope whether or not the
 * other does. `null` (uncategorised) merges like any other key.
 */
export function mergeCatalogSummaries(parts: CatalogSummaryWire[]): CatalogSummaryWire {
  const byCategory = new Map<string | null, number>();
  for (const part of parts) {
    for (const c of part.categories) {
      byCategory.set(c.categoryId, (byCategory.get(c.categoryId) ?? 0) + c.count);
    }
  }
  return parts.reduce<CatalogSummaryWire>(
    (acc, s) => ({
      total: acc.total + s.total,
      active: acc.active + s.active,
      hidden: acc.hidden + s.hidden,
      outOfStock: acc.outOfStock + s.outOfStock,
      untracked: acc.untracked + s.untracked,
      categories: acc.categories,
    }),
    {
      total: 0,
      active: 0,
      hidden: 0,
      outOfStock: 0,
      untracked: 0,
      categories: [...byCategory.entries()]
        .map(([categoryId, count]) => ({ categoryId, count }))
        // Deterministic, so the chip row does not reshuffle between reads. The screen
        // sorts by label; this only has to be stable.
        .sort((a, b) => (a.categoryId ?? "").localeCompare(b.categoryId ?? "")),
    },
  );
}

/** An all-zero summary — what a consolidated screen shows before any shop has answered. */
export const EMPTY_CATALOG_SUMMARY: CatalogSummaryWire = {
  total: 0,
  active: 0,
  hidden: 0,
  outOfStock: 0,
  untracked: 0,
  categories: [],
};

/* ------------------------------------------------------------------- Product */

/** `catalog.create`. Returns the new row **without** variants — add those next. */
export function createProduct(
  shopId: string,
  body: ProductCreateBody,
  signal?: AbortSignal,
): Promise<ProductRowWire> {
  return authedRequest<ProductRowWire>(`/seller/shops/${encodeURIComponent(shopId)}/products`, {
    method: "POST",
    body,
    signal,
  });
}

/** `catalog.edit`. Also the only way to hide a product (`isActive: false`). */
export function updateProduct(
  shopId: string,
  productId: string,
  body: ProductUpdateBody,
  signal?: AbortSignal,
): Promise<ProductRowWire> {
  return authedRequest<ProductRowWire>(
    `/seller/shops/${encodeURIComponent(shopId)}/products/${encodeURIComponent(productId)}`,
    { method: "PATCH", body, signal },
  );
}

/** `catalog.delete` — a real row delete, not a flag. Not undoable. */
export function deleteProduct(
  shopId: string,
  productId: string,
  signal?: AbortSignal,
): Promise<{ deleted: boolean }> {
  return authedRequest<{ deleted: boolean }>(
    `/seller/shops/${encodeURIComponent(shopId)}/products/${encodeURIComponent(productId)}`,
    { method: "DELETE", signal },
  );
}

/**
 * `inventory.adjust`. `delta` is signed; the server clamps the result at zero
 * and 400s when the product has `trackStock: false`.
 */
export function adjustProductStock(
  shopId: string,
  productId: string,
  delta: number,
  signal?: AbortSignal,
): Promise<ProductRowWire> {
  return authedRequest<ProductRowWire>(
    `/seller/shops/${encodeURIComponent(shopId)}/products/${encodeURIComponent(productId)}/stock`,
    { method: "POST", body: { delta }, signal },
  );
}

/* -------------------------------------------------------------------- Photos */

/**
 * `PRODUCT_IMAGE_LIMIT` in `apps/api/src/modules/catalog/product-images.ts`.
 *
 * The server refuses photo number nine *before* it stores any bytes, so this
 * mirror exists only so the picker can be disabled with an explanation instead of
 * offered and then rejected. It is not the enforcement.
 */
export const PRODUCT_IMAGE_LIMIT = 8;

/**
 * The picker filter, mirroring `IMAGE_MIME_TYPES` in `upload-rules.ts`.
 *
 * The server decides the type by reading the file's magic bytes and refuses a
 * mismatch between those, the declared `Content-Type` and the filename extension.
 * A file dialog filter is a convenience; it proves nothing.
 */
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const IMAGE_ACCEPT_ATTRIBUTE = ".jpg,.jpeg,.png,.webp";

/**
 * `UPLOAD_MAX_IMAGE_BYTES` default — 5 MiB.
 *
 * The real ceiling is server configuration and is not exposed on any endpoint, so
 * this is the documented default and nothing more. A file under it can still be
 * refused by a deployment that lowered the limit; the 400 is the answer that
 * counts, and callers must surface it rather than assume this number held.
 */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * `catalog.edit`. Adds one photo, appended last, and answers with the whole
 * updated product row.
 *
 * The request is `multipart/form-data` with a single part named `file`. No other
 * field is accepted and, in particular, **the storage key is not the client's to
 * choose** — the API mints it from the shop and product ids plus 128 random bits,
 * and takes the extension from the bytes rather than from `file.name`. That is why
 * there is no path or URL parameter here and why the response is the row: after an
 * upload the caller's copy of `images`/`imageUrls` is stale, and the new key is
 * only knowable from the server's answer.
 */
export function uploadProductImage(
  shopId: string,
  productId: string,
  file: File,
  signal?: AbortSignal,
): Promise<ProductRowWire> {
  const form = new FormData();
  form.append("file", file, file.name);
  return authedRequest<ProductRowWire>(
    `/seller/shops/${encodeURIComponent(shopId)}/products/${encodeURIComponent(productId)}/images`,
    { method: "POST", form, signal },
  );
}

/**
 * `catalog.edit`. Removes one photo and the stored object behind it.
 *
 * `key` must be a value that came out of this product's `images` array — anything
 * else is a 400, whatever it names, so this cannot be used to reach another
 * shop's objects. It travels in the query string because a storage key contains
 * slashes.
 */
export function deleteProductImage(
  shopId: string,
  productId: string,
  key: string,
  signal?: AbortSignal,
): Promise<ProductRowWire> {
  const query = `?key=${encodeURIComponent(key)}`;
  return authedRequest<ProductRowWire>(
    `/seller/shops/${encodeURIComponent(shopId)}/products/${encodeURIComponent(productId)}/images${query}`,
    { method: "DELETE", signal },
  );
}

/**
 * `catalog.edit`. Rearranges the photos; the first one is the product's face.
 *
 * `keys` must be a permutation of the product's current `images`: every key,
 * exactly once. A short list is refused rather than read as a delete — that would
 * drop a key while leaving its bytes in storage forever — so use
 * {@link deleteProductImage} to remove one.
 */
export function reorderProductImages(
  shopId: string,
  productId: string,
  keys: string[],
  signal?: AbortSignal,
): Promise<ProductRowWire> {
  return authedRequest<ProductRowWire>(
    `/seller/shops/${encodeURIComponent(shopId)}/products/${encodeURIComponent(productId)}/images/order`,
    { method: "PUT", body: { keys }, signal },
  );
}

/* ------------------------------------------------------------------ Variants */

/** `catalog.edit`. */
export function addVariant(
  shopId: string,
  productId: string,
  body: VariantCreateBody,
  signal?: AbortSignal,
): Promise<ProductVariantWire> {
  return authedRequest<ProductVariantWire>(
    `/seller/shops/${encodeURIComponent(shopId)}/products/${encodeURIComponent(productId)}/variants`,
    { method: "POST", body, signal },
  );
}

/** `catalog.edit`. Note `stock` here is absolute, not a delta. */
export function updateVariant(
  shopId: string,
  variantId: string,
  body: VariantUpdateBody,
  signal?: AbortSignal,
): Promise<ProductVariantWire> {
  return authedRequest<ProductVariantWire>(
    `/seller/shops/${encodeURIComponent(shopId)}/variants/${encodeURIComponent(variantId)}`,
    { method: "PATCH", body, signal },
  );
}

/** `catalog.edit` — deleting a variant does **not** need `catalog.delete`. */
export function deleteVariant(
  shopId: string,
  variantId: string,
  signal?: AbortSignal,
): Promise<{ deleted: boolean }> {
  return authedRequest<{ deleted: boolean }>(
    `/seller/shops/${encodeURIComponent(shopId)}/variants/${encodeURIComponent(variantId)}`,
    { method: "DELETE", signal },
  );
}
