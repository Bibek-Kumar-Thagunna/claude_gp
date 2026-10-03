/**
 * The whole product lifecycle on a phone: create, edit, delete, photograph,
 * and options.
 *
 * `./seller` covers what somebody standing behind a counter does to a product
 * they already have — hide it, count it, correct a price — and says at its
 * `ProductQuickEdit` that photographs and the rest belong to the console. That
 * division was right for a counter and wrong for one thing in particular: **the
 * camera is on this device**. A shopkeeper who has just unpacked a carton can
 * photograph it, price it and put it on the shelf in the thirty seconds it is
 * still on the counter, and no amount of console polish beats that. So this
 * module exists, and it covers the catalogue pages of the console —
 * `catalog`, `catalog/new` and `inventory` — rather than a subset of them.
 *
 * Reached as `@gopasal/native-data/seller-catalog`, and deliberately **not**
 * re-exported from `./index`: the customer app imports the same package and a
 * barrel that pulled this in would ship the seller's write surface to shoppers
 * who can never call any of it.
 *
 * ## Writes go straight to `http`
 *
 * The reasoning is `./seller`'s, at length, and holds here without amendment. The
 * outbox exists so a shopper never loses a tap, by putting a write on disk first
 * and replaying it when the signal returns. A replayed *catalogue* write is not
 * the same write: a price edit queued at 12:04 and sent at 12:14 overwrites a
 * correction somebody else made at 12:09, and a queued delete removes a product
 * that was re-stocked in between. Worse, `IdempotencyService` is wired to
 * checkout alone — no seller route reads an `Idempotency-Key` — so a replay lands
 * as a second real request and the queue's whole safety argument is gone. A
 * failure the shopkeeper can see and retry knowingly is the better failure.
 *
 * Photo uploads have a second, harder reason: the bytes are a local file URI that
 * the OS may have reclaimed by the time a queue drains. A replay would post
 * nothing.
 *
 * ## Which caches a write disturbs
 *
 * Everything here changes the shelf, so every write invalidates
 * `qk.productsRoot(shopId)` — `./seller`'s own key, imported rather than
 * redeclared, because the shelf screen is already subscribed to it and a parallel
 * key would leave that screen showing a product this module had just deleted. A
 * write also invalidates this module's own `catalogQk.product` entry, and
 * anything that changes whether a product is sellable — creating one, hiding one,
 * deleting one, emptying a variant — invalidates `qk.shops()`, because
 * `SellerShop.storefront.blockers` carries `DELIVERABLE_PRODUCT` and
 * `deliverableProductCount`, which is the answer to "why can nobody see my
 * shop?".
 *
 * Shapes mirror `apps/web-seller/lib/api/products.ts` field for field, so the
 * phone and the browser cannot disagree about one wire.
 */
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { appendFilePart } from "./file-part";
import { ApiError, type Http } from "./http";
import type { SessionStore } from "./session";
import { useGopasal } from "./GopasalProvider";
import { SELLER_STALE, type ProductPage, type ProductRow, type ProductVariant } from "./seller";
import { productQueryString, qk } from "./seller-wire";
import {
  CATALOG_SCAN_MAX_PAGES,
  CATALOG_SCAN_PAGE_LIMIT,
  IMAGE_FIELD_NAME,
  catalogQk,
  imageUploadName,
  productFromPages,
  resolveImageMime,
  type AcceptedImageMime,
  type PickedImage,
  type ProductLookup,
} from "./seller-catalog-wire";

/**
 * The pure half of this module is re-exported wholesale, so a screen has one
 * import and does not have to know which of the two files a bound or a predicate
 * happens to live in. `./seller-catalog-wire` stays importable on its own, which is
 * what lets `apps/mobile-seller/tests` reach it without pulling in `react-native`.
 */

export {
  ACCEPTED_IMAGE_MIME_TYPES,
  CATALOG_SCAN_MAX_PAGES,
  CATALOG_SCAN_PAGE_LIMIT,
  IMAGE_FIELD_NAME,
  MAX_IMAGE_BYTES,
  MULTIPART_HARD_LIMIT_BYTES,
  PRODUCT_IMAGE_LIMIT,
  PRODUCT_LIMITS,
  catalogQk,
  imageUploadIssue,
  imageUploadName,
  movePhoto,
  productDraftIssues,
  reorderIssue,
  resolveImageMime,
  variantDraftIssues,
} from "./seller-catalog-wire";
export type {
  AcceptedImageMime,
  ImageIssue,
  PickedImage,
  ProductDraft,
  ProductIssue,
  ProductLookup,
  VariantDraft,
  VariantIssue,
} from "./seller-catalog-wire";

/* ── categories ───────────────────────────────────────────────────────────── */

/** `model Category`. The platform's list, identical for every shop. */
export type Category = {
  id: string;
  slug: string;
  en: string;
  np: string;
  /** A lucide icon name. Meaningless on a phone, carried because the API sends it. */
  icon: string;
  /** A Tailwind hue helper for the customer web UI. Same. */
  hue: string;
  sortOrder: number;
};

/**
 * The category list a product form picks from.
 *
 * `GET /categories` is public and unauthenticated, which is why this is the one
 * read in the module with no `shopId` and no permission behind it. It is still
 * gated on `user`: a signed-out seller app has no product form to fill in, and a
 * request made before sign-in would be a cache entry nobody asked for.
 *
 * `STALE.catalog`'s ten minutes would be defensible, but `SELLER_STALE.money`'s
 * five is used instead for a plainer reason: the platform's category list changes
 * when GoPasal seeds a new one, which is roughly never, and five minutes is
 * already far longer than a form is open.
 */
export function useCategories() {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: catalogQk.categories(),
    staleTime: SELLER_STALE.money,
    enabled: Boolean(user),
    queryFn: () => http.request<Category[]>("/categories"),
  });
}

/* ── one product ──────────────────────────────────────────────────────────── */

/**
 * One product by id — read by scanning the shelf, because the API has no route
 * for it.
 *
 * **There is no `GET /seller/shops/:shopId/products/:productId`.** The seller
 * surface has `listProducts`, the three image routes, the two variant routes and
 * the writes, and that is all of `CatalogSellerController`. The nearest thing is
 * the public `GET /products/:id`, and it is not a substitute: `ProductsService.get`
 * filters on `DELIVERABLE_PRODUCT_WHERE` and `STOREFRONT_SHOP_WHERE`, so a hidden
 * product, an out-of-stock product, or any product belonging to a shop that is
 * not currently discoverable answers 404. Those are precisely the products a
 * seller opens a detail screen to fix. Using it would make the app work for
 * healthy rows and fail for the ones that need attention.
 *
 * So this is a bounded scan, and it is honest about being one:
 *
 *  - **Arriving from the shelf costs nothing.** `placeholderData` finds the row
 *    among the shelf pages already cached, which is the normal path — a tap on a
 *    list row — and renders immediately with `source: "cache"`.
 *  - **A cold deep link reads pages.** Up to {@link CATALOG_SCAN_MAX_PAGES} of
 *    {@link CATALOG_SCAN_PAGE_LIMIT}, stopping at the page the product is on.
 *  - **`product: null` and `truncated: true` are different answers.** The first
 *    means the shop does not have it; the second means the scan gave up. A screen
 *    must not render "deleted" for the second, which is why the shape carries
 *    both rather than just the row.
 *
 * Sorted by name rather than by the server's `recent` default. `recent` is
 * `updatedAt desc`, and every save moves a row to the front of it — so a scan
 * across pages while a colleague is editing can walk past the row it is looking
 * for. `name` moves only when somebody renames the product.
 *
 * If a single-product seller route is ever added, this hook keeps its signature
 * and its key and the body becomes one request.
 */
export function useShopProduct(
  shopId: string | null | undefined,
  productId: string | null | undefined,
  options?: { maxPages?: number },
) {
  const { http, user } = useGopasal();
  const qc = useQueryClient();
  const maxPages = options?.maxPages ?? CATALOG_SCAN_MAX_PAGES;

  const fromShelf = React.useCallback((): ProductLookup | undefined => {
    if (!shopId || !productId) return undefined;
    const pages = qc
      .getQueriesData<ProductPage>({ queryKey: qk.productsRoot(shopId) })
      .map(([, page]) => page);
    const product = productFromPages(pages, productId);
    return product
      ? { product, source: "cache", scannedPages: 0, totalPages: 0, truncated: false }
      : undefined;
  }, [qc, shopId, productId]);

  return useQuery({
    queryKey: catalogQk.product(shopId ?? "", productId ?? ""),
    staleTime: SELLER_STALE.counter,
    enabled: Boolean(shopId) && Boolean(productId) && Boolean(user),
    placeholderData: fromShelf,
    queryFn: async (): Promise<ProductLookup> => {
      let totalPages = 1;
      let scannedPages = 0;
      for (let page = 1; page <= Math.min(totalPages, maxPages); page += 1) {
        const result = await http.request<ProductPage>(
          `/seller/shops/${encodeURIComponent(shopId!)}/products${productQueryString({
            page,
            limit: CATALOG_SCAN_PAGE_LIMIT,
            sort: "name",
          })}`,
        );
        scannedPages = page;
        totalPages = result.meta.totalPages;
        const hit = result.data.find((row) => row.id === productId);
        if (hit) {
          return { product: hit, source: "scan", scannedPages, totalPages, truncated: false };
        }
      }
      return {
        product: null,
        source: "scan",
        scannedPages,
        totalPages,
        truncated: scannedPages < totalPages,
      };
    },
  });
}

/* ── product writes ───────────────────────────────────────────────────────── */

/**
 * `CreateProductDto` — the whole body, and nothing else.
 *
 * `forbidNonWhitelisted` means a key the DTO does not declare is a 400 naming it,
 * so this type is a contract rather than documentation. Two absences are
 * deliberate and permanent:
 *
 *  - **No `images`.** The field was removed from the DTO because it let a client
 *    write arbitrary strings into a column the storefront renders as image
 *    sources. Photos arrive as bytes, after the row exists — see
 *    {@link useProductImages}.
 *  - **No `isActive`.** A new product is visible (the column's Prisma default);
 *    hiding one is a follow-up PATCH, which needs `catalog.edit` rather than
 *    `catalog.create`.
 *
 * Omit an optional key rather than sending `null`. The service coalesces a `null`
 * on a non-nullable column away, so it is not an error — it is just a request
 * that says something it does not mean.
 */
export type ProductCreateInput = {
  name: string;
  nameNp?: string;
  description?: string;
  categoryId?: string;
  /** Whole NPR rupees. `@IsInt()` with no implicit conversion, so `"120"` is a 400. */
  price: number;
  mrp?: number;
  /** Defaults to `"1 pc"` server-side when omitted. */
  unit?: string;
  tags?: string[];
  trackStock?: boolean;
  stock?: number;
};

/**
 * `UpdateProductDto` — every field of the create body optional, plus `isActive`,
 * plus `null` on exactly the four nullable columns.
 *
 * The `| null` unions are the API's real contract and not a hopeful guess.
 * `UpdateProductDto` keeps `@IsOptional()` rather than `@OptionalField()`, so a
 * JSON `null` reaches the service unvalidated, and `productData()` is written for
 * that: the non-nullable columns go through `keep(v) = v ?? undefined` ("leave it
 * alone"), while `nameNp`, `description`, `categoryId` and `mrp` deliberately do
 * not, because `Product` declares those four nullable and for them `null` is how
 * a value is cleared.
 *
 * So sending `{ name: null }` is silently ignored rather than honoured, which is
 * not something a form should be able to ask for — hence no union there. This
 * differs from `UpdateShopDto`, where `null` is a 400 on every field; the two
 * bodies genuinely disagree, and a product's category can be emptied while a
 * shop's cannot.
 */
export type ProductPatch = {
  name?: string;
  nameNp?: string | null;
  description?: string | null;
  categoryId?: string | null;
  price?: number;
  mrp?: number | null;
  unit?: string;
  tags?: string[];
  trackStock?: boolean;
  /** Absolute, unlike `POST …/stock`, which is a signed delta. See the note below. */
  stock?: number;
  isActive?: boolean;
};

/**
 * Create, edit and delete a product.
 *
 * Nothing here is optimistic. `./seller`'s quick edits are, for two controls that
 * have to move under a thumb — an availability switch and a stock sheet — and the
 * technique is right there and wrong here: creating a product returns an id the
 * screen needs in order to upload a photo to it, a full edit can be refused field
 * by field, and a delete that appeared to succeed and then came back would be the
 * cruellest possible rollback.
 *
 * Every write answers with a bare `ProductRow` — `prisma.product.create` and
 * `.update` run without an `include`, so there are no `variants` — which is why
 * none of these merge into the shelf. Merging would blank the options already on
 * screen, which reads as data loss. The shelf is refetched instead.
 */
export function useProductWrites(shopId: string | null | undefined) {
  const { http } = useGopasal();
  const qc = useQueryClient();

  const settle = React.useCallback(
    (productId?: string) => {
      void qc.invalidateQueries({ queryKey: qk.productsRoot(shopId ?? "") });
      if (productId) {
        void qc.invalidateQueries({ queryKey: catalogQk.product(shopId ?? "", productId) });
      }
      // The shop list carries `storefront.blockers` and `deliverableProductCount`,
      // which are computed from this shop's sellable products. A new product can
      // clear `DELIVERABLE_PRODUCT`; a delete or a hide can reinstate it. Leaving
      // it stale means the dashboard keeps saying nobody can see the shop after
      // the seller has fixed exactly that.
      void qc.invalidateQueries({ queryKey: qk.shops() });
    },
    [qc, shopId],
  );

  return {
    /**
     * `catalog.create`. Answers with the new row, **with no photos and no
     * variants** — `ProductsService.create` never writes `images` and the column
     * starts at its `@default([])`. The id in the response is what the upload and
     * variant routes below are addressed with, so a create-then-photograph screen
     * has to wait for it.
     */
    create: useMutation({
      mutationFn: (input: ProductCreateInput) =>
        http.request<ProductRow>(`/seller/shops/${encodeURIComponent(shopId!)}/products`, {
          method: "POST",
          body: input,
        }),
      onSuccess: (row) => settle(row.id),
    }),

    /**
     * `catalog.edit`. A true partial PATCH: an omitted key leaves its column
     * untouched, so send a diff rather than a snapshot — a snapshot rewrites every
     * column, including ones a colleague changed while the form was open.
     *
     * `stock` is accepted here and is an **absolute** value, because
     * `productData()` passes it straight through. `POST …/products/:id/stock` is
     * the signed-delta route and is the one a counting screen wants: it is
     * `inventory.adjust` rather than `catalog.edit`, it clamps at zero, and it
     * refuses a product with `trackStock: false`. `./seller`'s `setStock` covers
     * that route and takes `{ from, to }` so the sign cannot be got wrong. Use
     * this key only when a seller is *stating* a count rather than adjusting one.
     */
    edit: useMutation({
      mutationFn: (input: { productId: string; patch: ProductPatch }) =>
        http.request<ProductRow>(
          `/seller/shops/${encodeURIComponent(shopId!)}/products/${encodeURIComponent(input.productId)}`,
          { method: "PATCH", body: input.patch },
        ),
      onSuccess: (_row, input) => settle(input.productId),
    }),

    /**
     * `catalog.delete`.
     *
     * **This is a hard delete and it cannot be undone.** `ProductsService.remove`
     * runs `prisma.product.delete` and then removes every stored photo behind it;
     * there is no `deletedAt` column, no restore route, and the bytes are gone
     * from storage too. `ProductVariant` cascades with the row. Only the order
     * lines survive, because they snapshot the name, unit and price at checkout —
     * so history stays readable while the product does not.
     *
     * The reversible thing a seller usually means is `isActive: false`, which is
     * {@link useProductWrites.edit} or `./seller`'s `setAvailability`. A
     * confirmation for *this* has to say "permanently", because that is true.
     */
    remove: useMutation({
      mutationFn: (productId: string) =>
        http.request<{ deleted: boolean }>(
          `/seller/shops/${encodeURIComponent(shopId!)}/products/${encodeURIComponent(productId)}`,
          { method: "DELETE" },
        ),
      onSuccess: (_result, productId) => {
        // Removed rather than invalidated: refetching a key whose row no longer
        // exists is a request whose only possible answer is an empty scan.
        qc.removeQueries({ queryKey: catalogQk.product(shopId ?? "", productId) });
        settle();
      },
    }),
  };
}

/* ── photographs ──────────────────────────────────────────────────────────── */

/** Refresh this far ahead of expiry, exactly as `http.ts` does on its own hot path. */
const REFRESH_SKEW_MS = 30_000;

/**
 * A photo may take far longer than a JSON call.
 *
 * `http.request` abandons an attempt after 15 seconds, which is right for a
 * request whose body is a few hundred bytes and wrong for five megabytes over a
 * 3G uplink in a shop with one bar. Sixty seconds is roughly the worst realistic
 * case for a compressed phone photo; past that, something is broken rather than
 * slow and the shopkeeper is better told so.
 */
const UPLOAD_TIMEOUT_MS = 60_000;

/**
 * The bearer token for a multipart request, refreshed if it is about to expire.
 *
 * `http.request` does this internally and cannot be used here: it stringifies
 * every body as JSON and sets `content-type: application/json`, so there is no
 * way to hand it a `FormData`. Rather than widen the transport for one route, the
 * upload borrows the two pieces it needs — `http.root()` for the base and
 * `http.refreshSession()` for the single shared in-flight refresh. Using that
 * shared promise rather than a second refresh path is the load-bearing part: the
 * server rotates the refresh token on every use and treats a replay as theft,
 * revoking the whole session.
 */
async function uploadToken(http: Http, session: SessionStore): Promise<string | null> {
  const current = session.get();
  if (!current) return null;
  if (current.accessExpiresAt - REFRESH_SKEW_MS > Date.now()) return current.accessToken;
  const refreshed = await http.refreshSession();
  return (refreshed ?? session.get())?.accessToken ?? null;
}

/**
 * Post one photo as `multipart/form-data`.
 *
 * Three details are not optional:
 *
 *  - **`content-type` is not set.** The runtime has to add the boundary, and a
 *    hand-written header overwrites it with one that has none, which arrives as
 *    an empty body and a 400 about a missing file.
 *  - **The file part is `{ uri, name, type }`, cast to `Blob`.** React Native's
 *    `FormData` recognises that object and streams the local file; the DOM's
 *    `FormData.append` signature does not admit it, hence the cast. There is no
 *    `Blob` to be had — reading the photo into memory to make one would double
 *    the peak footprint on the cheapest phone in the range.
 *  - **The field name is `file` and there is exactly one part.** The route's
 *    `FileInterceptor('file', { limits: { files: 1 } })` accepts nothing else,
 *    and no other form field is read.
 *
 * Errors are normalised into the same `ApiError` the rest of the app throws, so a
 * screen has one error type to render and `ApiError.retryable` keeps meaning what
 * it means elsewhere.
 */
async function postImage(
  http: Http,
  session: SessionStore,
  path: string,
  image: PickedImage,
  mime: AcceptedImageMime,
): Promise<ProductRow> {
  const token = await uploadToken(http, session);
  const form = new FormData();
  await appendFilePart(form, IMAGE_FIELD_NAME, {
    uri: image.uri,
    name: imageUploadName(image, mime),
    type: mime,
  });

  let response: Response;
  try {
    response = await fetch(`${http.root()}${path}`, {
      method: "POST",
      headers: {
        accept: "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: form,
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });
  } catch (cause) {
    const aborted = cause instanceof Error && cause.name === "AbortError";
    throw new ApiError(
      0,
      aborted
        ? "That photo took too long to send. Check your connection and try again."
        : "Couldn’t reach GoPasal.",
    );
  }

  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const envelope = (parsed ?? {}) as Record<string, unknown>;
    const raw = envelope.message;
    const message = Array.isArray(raw)
      ? raw.filter((m): m is string => typeof m === "string").join("\n")
      : typeof raw === "string"
        ? raw
        : `Upload failed (${response.status})`;
    throw new ApiError(response.status, message, parsed);
  }

  return parsed as ProductRow;
}

/**
 * A product's photographs: add, remove, reorder.
 *
 * This is the module's reason for existing. `Product.images` holds **storage keys
 * the API minted** under `public/`, in display order, and `imageUrls` is the same
 * list resolved for rendering — the same list, in the same order, but possibly
 * *shorter* when a key no longer resolves, so never index one by the other's
 * position. No request body may name a key the product does not already hold, and
 * no request may choose where an object lands.
 *
 * The limits a screen must know before it opens a camera, all mirrored in
 * `./seller-catalog-wire` and stated here because a refusal after the upload is a
 * minute of a seller's data:
 *
 *  - **8 photos per product** (`PRODUCT_IMAGE_LIMIT`). The ninth is refused
 *    before any bytes are stored, with "This product already has 8 photos.
 *    Remove one first."
 *  - **5 MiB per photo** (`UPLOAD_MAX_IMAGE_BYTES`'s default). It is deployment
 *    configuration, not a published constant, so a lowered limit will refuse a
 *    smaller file and the 400 is the answer that counts.
 *  - **32 MiB is multer's hard ceiling** on the route. A body above it is cut off
 *    mid-request rather than answered, so the failure is a truncated upload.
 *  - **JPEG, PNG or WebP only**, decided by reading the magic bytes — and the
 *    declared type and the filename extension must agree with them. HEIC is not
 *    accepted, which matters here: an iPhone camera roll is HEIC by default.
 *
 * Call {@link imageUploadIssue} with the picker's asset and the product's current
 * photo count before calling `upload`, and refuse locally when it answers.
 */
export function useProductImages(shopId: string | null | undefined) {
  const { http, session } = useGopasal();
  const qc = useQueryClient();

  const settle = React.useCallback(
    (productId: string) => {
      void qc.invalidateQueries({ queryKey: qk.productsRoot(shopId ?? "") });
      void qc.invalidateQueries({ queryKey: catalogQk.product(shopId ?? "", productId) });
      // A photo does not change deliverability, so `qk.shops()` is left alone
      // here — `DELIVERABLE_PRODUCT_WHERE` looks at `isActive` and stock, not at
      // `images`. Invalidating it anyway would be a request per photo for an
      // answer that cannot have changed.
    },
    [qc, shopId],
  );

  return {
    /**
     * `catalog.edit`. Appends one photo and answers with the whole updated
     * product row — which is the only way to learn the new key, since the server
     * mints it.
     *
     * The new photo goes **last**. The first key in `images` is the product's
     * face everywhere it is shown, so making a fresh photo the face is a
     * follow-up `reorder`, not a flag on the upload.
     */
    upload: useMutation({
      mutationFn: (input: { productId: string; image: PickedImage }) => {
        const mime = resolveImageMime(input.image);
        if (!mime) {
          // Refused locally rather than sent. The server would answer
          // `UNSUPPORTED_TYPE` or `CONTENT_MISMATCH` after receiving the whole
          // file, and the seller would have paid for those bytes.
          return Promise.reject(
            new ApiError(400, "Photos must be JPEG, PNG or WebP.", null),
          );
        }
        return postImage(
          http,
          session,
          `/seller/shops/${encodeURIComponent(shopId!)}/products/${encodeURIComponent(input.productId)}/images`,
          input.image,
          mime,
        );
      },
      onSuccess: (_row, input) => settle(input.productId),
    }),

    /**
     * `catalog.edit`.
     *
     * **A hard delete of the stored object as well as the key.** The array is
     * rewritten first and `UploadsService.remove` follows, best-effort; there is
     * no restore and no recycle bin, so a confirmation has to say the photo is
     * gone rather than hidden.
     *
     * `key` must be a value that came out of this product's own `images` array —
     * anything else is 400 "That is not one of this product’s photos", whatever
     * it names, which is what makes the route unable to reach another shop's
     * objects. It travels in the query string because a storage key contains
     * slashes and a path parameter would need encoding a client must not get
     * wrong.
     */
    remove: useMutation({
      mutationFn: (input: { productId: string; key: string }) =>
        http.request<ProductRow>(
          `/seller/shops/${encodeURIComponent(shopId!)}/products/${encodeURIComponent(input.productId)}/images?key=${encodeURIComponent(input.key)}`,
          { method: "DELETE" },
        ),
      onSuccess: (_row, input) => settle(input.productId),
    }),

    /**
     * `catalog.edit`. A `PUT`, and a **permutation**: every key the product
     * currently holds, exactly once, in the new order.
     *
     * A short list is refused rather than treated as a delete — that would drop a
     * key and leave its bytes in storage forever — so use `remove` to take one
     * out. {@link reorderIssue} answers the same question locally, and
     * {@link movePhoto} produces a valid permutation from a drag.
     */
    reorder: useMutation({
      mutationFn: (input: { productId: string; keys: string[] }) =>
        http.request<ProductRow>(
          `/seller/shops/${encodeURIComponent(shopId!)}/products/${encodeURIComponent(input.productId)}/images/order`,
          { method: "PUT", body: { keys: input.keys } },
        ),
      onSuccess: (_row, input) => settle(input.productId),
    }),
  };
}

/* ── variants ─────────────────────────────────────────────────────────────── */

/** `VariantDto`. `name` and `price` are required; the rest default server-side. */
export type VariantCreateInput = {
  name: string;
  sku?: string;
  /** Whole NPR rupees. */
  price: number;
  mrp?: number;
  /** Absolute count. Defaults to 0. */
  stock?: number;
};

/**
 * `UpdateVariantDto` — the create body with everything optional, plus `isActive`.
 *
 * **`stock` is deliberately absent from this type.** The column is patchable on
 * this route and the omission is the point; see {@link useVariantWrites.setStock}.
 */
export type VariantPatch = {
  name?: string;
  sku?: string | null;
  price?: number;
  mrp?: number | null;
  isActive?: boolean;
};

/**
 * A product's options: create, edit, count, delete.
 *
 * ## The one asymmetry worth being loud about
 *
 * A **product's** stock is changed with a signed delta — `POST
 * …/products/:id/stock`, `AdjustStockDto.delta`, permission `inventory.adjust`,
 * clamped at zero, refused when `trackStock` is false.
 *
 * A **variant's** stock is changed with an absolute value — `PATCH
 * …/variants/:variantId`, `UpdateVariantDto.stock`, permission `catalog.edit`,
 * not clamped, and `trackStock` does not apply because `ProductVariant` has no
 * such column: a variant always counts.
 *
 * Different route, different verb, different permission, opposite meaning of the
 * same word. Sending `-3` where an absolute was wanted is a 400 (`@Min(0)`);
 * sending `3` where a delta was wanted is silent and wrong, and that is the
 * direction this has already gone once.
 *
 * So the two are made unconfusable at the call site rather than merely documented:
 *
 *  - `stock` is **not** a key on {@link VariantPatch}, so `patch` cannot carry it
 *    at all — a screen that tries gets a type error, not a wrong shelf.
 *  - The only way to set it is `setStock`, whose argument is named `absolute`.
 *  - The delta route stays where it was, in `./seller`'s `useProductActions`,
 *    taking `{ from, to }` so its sign is computed rather than typed.
 */
export function useVariantWrites(shopId: string | null | undefined) {
  const { http } = useGopasal();
  const qc = useQueryClient();

  const settle = React.useCallback(
    (productId?: string) => {
      void qc.invalidateQueries({ queryKey: qk.productsRoot(shopId ?? "") });
      if (productId) {
        void qc.invalidateQueries({ queryKey: catalogQk.product(shopId ?? "", productId) });
      }
      // Variants decide deliverability for a variant product:
      // `DELIVERABLE_PRODUCT_WHERE` accepts a product with at least one active
      // variant in stock, so emptying or deactivating the last one can take the
      // shop's storefront down — and the shop list is where that is reported.
      void qc.invalidateQueries({ queryKey: qk.shops() });
    },
    [qc, shopId],
  );

  return {
    /**
     * `catalog.edit`. Addressed by product, because a variant is created under
     * one: `POST …/products/:productId/variants`.
     */
    create: useMutation({
      mutationFn: (input: { productId: string; variant: VariantCreateInput }) =>
        http.request<ProductVariant>(
          `/seller/shops/${encodeURIComponent(shopId!)}/products/${encodeURIComponent(input.productId)}/variants`,
          { method: "POST", body: input.variant },
        ),
      onSuccess: (_variant, input) => settle(input.productId),
    }),

    /**
     * `catalog.edit`. Addressed by **variant**, not by product:
     * `PATCH …/variants/:variantId`. `productId` is asked for anyway, and is not
     * sent — it is what the cache invalidation needs in order to refresh the
     * screen the seller is actually looking at.
     *
     * Cannot carry `stock`. That is `setStock` below, and the reason is in this
     * hook's own comment.
     */
    patch: useMutation({
      mutationFn: (input: { productId: string; variantId: string; patch: VariantPatch }) =>
        http.request<ProductVariant>(
          `/seller/shops/${encodeURIComponent(shopId!)}/variants/${encodeURIComponent(input.variantId)}`,
          { method: "PATCH", body: input.patch },
        ),
      onSuccess: (_variant, input) => settle(input.productId),
    }),

    /**
     * Set a variant's count to a number.
     *
     * `absolute` is the whole name of the argument and the whole contract: this is
     * the count the shelf now holds, not a change to it. `@IsInt() @Min(0)`, so a
     * negative is a 400 and a non-integer is a 400 — body validation runs without
     * implicit conversion, which is why a keypad's string has to be parsed first.
     *
     * Not optimistic. A count is a claim about the world, and a number that
     * appeared instantly and then moved would leave the shopkeeper unsure which
     * figure the shop now carries.
     */
    setStock: useMutation({
      mutationFn: (input: { productId: string; variantId: string; absolute: number }) =>
        http.request<ProductVariant>(
          `/seller/shops/${encodeURIComponent(shopId!)}/variants/${encodeURIComponent(input.variantId)}`,
          { method: "PATCH", body: { stock: input.absolute } },
        ),
      onSuccess: (_variant, input) => settle(input.productId),
    }),

    /**
     * `catalog.edit` — note that deleting a variant does **not** need
     * `catalog.delete`, unlike deleting the product.
     *
     * **A hard delete.** `prisma.productVariant.delete`, no `deletedAt`, no
     * restore. Order lines that sold this variant keep their `nameSnapshot` and
     * `price`, so receipts stay readable, but the option itself is gone.
     *
     * The reversible alternative is `patch` with `isActive: false`: an inactive
     * variant stays on the row, is excluded from the storefront and from the
     * price span, and can be switched back on. A confirmation should offer that
     * first.
     */
    remove: useMutation({
      mutationFn: (input: { productId: string; variantId: string }) =>
        http.request<{ deleted: boolean }>(
          `/seller/shops/${encodeURIComponent(shopId!)}/variants/${encodeURIComponent(input.variantId)}`,
          { method: "DELETE" },
        ),
      onSuccess: (_result, input) => settle(input.productId),
    }),
  };
}

/* ── what is not here ─────────────────────────────────────────────────────── */

/**
 * CSV import and export are left out, and not as a gap to fill later.
 *
 * `GET …/products/export`, `GET …/products/import-template` and
 * `POST …/products/import` exist and work. All three are spreadsheet routes: the
 * export is one row per variant for editing in Excel, the import is a dry run
 * whose report has to be read carefully before `mode=apply` is sent, and one bad
 * row fails the whole file because a half-rewritten catalogue is a state nobody
 * can reason their way back out of.
 *
 * None of that is a phone job. There is no spreadsheet editor here, the report is
 * a table that does not fit, and the decision it asks for is one to make sitting
 * down. A seller who needs these is already at a desk, and the console has them.
 *
 * `GET /seller/shops/:shopId` (`dashboard.view`) is also not here: it is the shop
 * record rather than the catalogue, and it belongs to — and is covered by —
 * `./seller-settings`.
 */
