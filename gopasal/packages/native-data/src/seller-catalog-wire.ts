/**
 * The catalogue module's addressing, bounds and pre-flight checks, with no React
 * in it.
 *
 * Split out for the reason `seller-wire.ts` sets out at length: `seller-catalog.ts`
 * reaches `react-native` transitively (through `./seller`, which imports
 * `AppState`) and therefore cannot be loaded by a test runner, while the pieces
 * most worth testing here are plain functions of their arguments:
 *
 *  - **The photo pre-flight.** The upload route refuses a bad photo *after* the
 *    phone has spent the bytes sending it, which on a prepaid plan in a shop with
 *    one bar is a minute of a shopkeeper's life for a red strip. Every rule the
 *    server applies that can be known locally is mirrored here so the picker can
 *    refuse first, and the mirroring is only trustworthy if it is tested.
 *  - **The filename.** The server compares three separate facts about an upload —
 *    declared Content-Type, filename extension, magic bytes — and refuses any
 *    disagreement. An Android picker that hands back `image` with no extension and
 *    an iOS one that hands back `IMG_0004.HEIC` are both ordinary, and one of them
 *    is a 400 if the name is forwarded unexamined.
 *  - **The reorder permutation.** `PUT …/images/order` requires every key the
 *    product holds, exactly once. A partial list is refused rather than read as a
 *    delete, so a drag-and-drop screen that drops a key gets a 400 it cannot
 *    explain unless it checked.
 *
 * Nothing here enforces anything. The API is the enforcing copy in every case;
 * these exist so a screen can say what is wrong before spending a request on
 * finding out.
 */
import type { ProductPage, ShopProduct } from "./seller";

/* ── query keys ───────────────────────────────────────────────────────────── */

/**
 * The keys this module adds, in the shape `seller-wire.ts`'s `qk` established:
 * `"seller"` first so the customer surface's bare keys can never be answered by
 * one of these, and `shopId` third so everything about one shop matches by prefix
 * and is dropped together when the counter switches shop.
 *
 * `product` is a new second segment and deliberately singular: `qk.products` is
 * the paged shelf and `qk.productsRoot` is its prefix, so a single-product entry
 * under `"products"` would be matched — and wiped — by every shelf invalidation,
 * and would also be *hashed* as a shelf page by React Query's prefix matching.
 * The same relationship as `qk.orders` to `qk.order`.
 *
 * `categories` is not shop-scoped: it is the platform's category list, served
 * unauthenticated, and it is identical for every shop. It still starts with
 * `"seller"`, which means `isShopScopedKey` will drop it when the shop changes.
 * That is a wasted refetch of a small public list and never a wrong answer, and
 * it is the cheaper of the two mistakes — the alternative is a bare `["categories"]`
 * key in the namespace the customer surface owns.
 */
export const catalogQk = {
  product: (shopId: string, productId: string) =>
    ["seller", "product", shopId, productId] as const,
  categories: () => ["seller", "categories"] as const,
};

/* ── the single-product read ──────────────────────────────────────────────── */

/**
 * How the shelf is walked when one product has to be found by id.
 *
 * There is no `GET /seller/shops/:shopId/products/:productId`. The seller surface
 * has the paged list and nothing else, so a deep link into one product is
 * answered by reading pages until the row appears. 100 is the largest page
 * `PaginationDto` allows; five of them is the same bound the console's
 * `listAllShopProducts` uses, and it is a bound rather than "all of them" because
 * a catalogue has no ceiling and a phone must not promise to read one.
 */
export const CATALOG_SCAN_PAGE_LIMIT = 100;
export const CATALOG_SCAN_MAX_PAGES = 5;

/**
 * The answer to "show me this product", including how hard it looked.
 *
 * `product: null` with `truncated: true` is **not** "no such product" — it is
 * "not in the first five hundred rows of this shop's shelf". A screen that
 * rendered the two the same way would tell a shopkeeper their product had been
 * deleted. The fields are separate so it cannot.
 */
export type ProductLookup = {
  product: ShopProduct | null;
  /**
   * `"cache"` means the row came out of a shelf page this app already held, so
   * it is as fresh as that page and no request was made. `"scan"` means the
   * shelf was read for it. Exposed because a screen showing a cached row while
   * the scan runs behind it is the right behaviour, and it can only say so if it
   * knows which it has.
   */
  source: "cache" | "scan";
  /** How many pages were actually read. Zero for a cache hit. */
  scannedPages: number;
  /** How many the server says exist. Zero when nothing was asked. */
  totalPages: number;
  /** True when the scan gave up before the last page. */
  truncated: boolean;
};

/**
 * Find one product among pages already in hand.
 *
 * Used twice: once inside the scan, and once against whatever the shelf left in
 * the cache, so arriving from a shelf row costs no request at all. Pages arrive
 * possibly-undefined because that is what `getQueriesData` hands back for an
 * entry that has been evicted.
 */
export function productFromPages(
  pages: ReadonlyArray<ProductPage | undefined>,
  productId: string,
): ShopProduct | null {
  for (const page of pages) {
    if (!page) continue;
    const hit = page.data.find((row) => row.id === productId);
    if (hit) return hit;
  }
  return null;
}

/* ── product bounds ───────────────────────────────────────────────────────── */

/**
 * The bounds `CreateProductDto` and `UpdateProductDto` enforce, mirrored so a
 * form can stop a seller at the input rather than at a 400.
 *
 * These are the API's numbers, from `apps/api/src/modules/catalog/dto/catalog.dto.ts`.
 * They are not this module's policy and must not be tightened here: a screen that
 * refused a 100-character name the server accepts would be inventing a rule and
 * attributing it to GoPasal.
 */
export const PRODUCT_LIMITS = {
  nameMin: 1,
  nameMax: 120,
  descriptionMax: 1000,
  unitMax: 40,
  categoryIdMax: 60,
  tagCount: 20,
  tagMax: 30,
  variantNameMax: 120,
  variantSkuMax: 60,
} as const;

/** Why a draft cannot be sent, named by the field a form has to highlight. */
export type ProductIssue = {
  field:
    | "name"
    | "nameNp"
    | "description"
    | "categoryId"
    | "price"
    | "mrp"
    | "unit"
    | "tags"
    | "stock";
  message: string;
};

/** What a form holds while a product is being typed. Every field is optional. */
export type ProductDraft = {
  name?: string;
  nameNp?: string | null;
  description?: string | null;
  categoryId?: string | null;
  price?: number;
  mrp?: number | null;
  unit?: string;
  tags?: string[];
  trackStock?: boolean;
  stock?: number;
};

const isWholeNumber = (value: number): boolean => Number.isInteger(value) && Number.isFinite(value);

/**
 * Everything wrong with a product draft, in one pass.
 *
 * `mode` matters because the two routes disagree about what is required, not
 * about what is legal: `CreateProductDto` demands `name` and `price`, while
 * `UpdateProductDto` re-declares both `@IsOptional()` and a PATCH that mentions
 * neither is a legal no-op. So the same bounds run either way and only the
 * presence checks differ.
 *
 * Money is checked for integrality rather than merely for sign. Body validation
 * runs **without** implicit conversion, so `@IsInt()` sees `19.5` and `"19"` as
 * they are and answers 400 for both — and a price typed into a phone keypad is a
 * string until somebody parses it. `mrp < price` is deliberately *not* an error:
 * the API permits it, shops do use it during a price rise, and refusing it here
 * would be this module inventing retail policy.
 */
export function productDraftIssues(
  draft: ProductDraft,
  mode: "create" | "patch",
): ProductIssue[] {
  const issues: ProductIssue[] = [];

  const name = draft.name?.trim();
  if (mode === "create" || draft.name !== undefined) {
    if (!name) issues.push({ field: "name", message: "Give the product a name." });
    else if (name.length > PRODUCT_LIMITS.nameMax) {
      issues.push({
        field: "name",
        message: `A name can be at most ${PRODUCT_LIMITS.nameMax} characters.`,
      });
    }
  }

  if (draft.nameNp != null && draft.nameNp.length > PRODUCT_LIMITS.nameMax) {
    issues.push({
      field: "nameNp",
      message: `The Nepali name can be at most ${PRODUCT_LIMITS.nameMax} characters.`,
    });
  }
  if (draft.description != null && draft.description.length > PRODUCT_LIMITS.descriptionMax) {
    issues.push({
      field: "description",
      message: `The description can be at most ${PRODUCT_LIMITS.descriptionMax} characters.`,
    });
  }
  if (draft.categoryId != null && draft.categoryId.length > PRODUCT_LIMITS.categoryIdMax) {
    issues.push({ field: "categoryId", message: "That category id is not a real one." });
  }

  if (mode === "create" || draft.price !== undefined) {
    const price = draft.price;
    if (price === undefined || !isWholeNumber(price) || price < 0) {
      issues.push({ field: "price", message: "Enter the price in whole rupees." });
    }
  }
  if (draft.mrp != null && (!isWholeNumber(draft.mrp) || draft.mrp < 0)) {
    issues.push({ field: "mrp", message: "Enter the MRP in whole rupees, or leave it empty." });
  }

  const unit = draft.unit?.trim();
  if (draft.unit !== undefined) {
    if (!unit) {
      // Not an error on create — the service defaults an absent `unit` to "1 pc"
      // — but an explicit empty string is a value, and it would be stored.
      issues.push({ field: "unit", message: `Say what one of these is, e.g. "1 kg".` });
    } else if (unit.length > PRODUCT_LIMITS.unitMax) {
      issues.push({
        field: "unit",
        message: `A unit can be at most ${PRODUCT_LIMITS.unitMax} characters.`,
      });
    }
  }

  if (draft.tags) {
    if (draft.tags.length > PRODUCT_LIMITS.tagCount) {
      issues.push({
        field: "tags",
        message: `At most ${PRODUCT_LIMITS.tagCount} tags.`,
      });
    }
    if (draft.tags.some((tag) => tag.length > PRODUCT_LIMITS.tagMax)) {
      issues.push({
        field: "tags",
        message: `Each tag can be at most ${PRODUCT_LIMITS.tagMax} characters.`,
      });
    }
  }

  if (draft.stock !== undefined && (!isWholeNumber(draft.stock) || draft.stock < 0)) {
    issues.push({ field: "stock", message: "A count is a whole number, zero or more." });
  }

  return issues;
}

/** Why a variant draft cannot be sent. */
export type VariantIssue = {
  field: "name" | "sku" | "price" | "mrp" | "stock";
  message: string;
};

export type VariantDraft = {
  name?: string;
  sku?: string | null;
  price?: number;
  mrp?: number | null;
  stock?: number;
};

/**
 * Everything wrong with a variant draft.
 *
 * `stock` here is an **absolute count**, unlike the product-level figure, which
 * reaches the server as a signed delta. That asymmetry is the whole reason this
 * function exists separately from {@link productDraftIssues} rather than sharing
 * its `stock` branch: the two numbers mean different things and a shared
 * validator would be the first step towards a shared call site.
 */
export function variantDraftIssues(
  draft: VariantDraft,
  mode: "create" | "patch",
): VariantIssue[] {
  const issues: VariantIssue[] = [];

  const name = draft.name?.trim();
  if (mode === "create" || draft.name !== undefined) {
    if (!name) issues.push({ field: "name", message: `Name the option, e.g. "1 kg".` });
    else if (name.length > PRODUCT_LIMITS.variantNameMax) {
      issues.push({
        field: "name",
        message: `An option name can be at most ${PRODUCT_LIMITS.variantNameMax} characters.`,
      });
    }
  }

  if (draft.sku != null && draft.sku.length > PRODUCT_LIMITS.variantSkuMax) {
    issues.push({
      field: "sku",
      message: `An SKU can be at most ${PRODUCT_LIMITS.variantSkuMax} characters.`,
    });
  }

  if (mode === "create" || draft.price !== undefined) {
    const price = draft.price;
    if (price === undefined || !isWholeNumber(price) || price < 0) {
      issues.push({ field: "price", message: "Enter the price in whole rupees." });
    }
  }
  if (draft.mrp != null && (!isWholeNumber(draft.mrp) || draft.mrp < 0)) {
    issues.push({ field: "mrp", message: "Enter the MRP in whole rupees, or leave it empty." });
  }
  if (draft.stock !== undefined && (!isWholeNumber(draft.stock) || draft.stock < 0)) {
    issues.push({ field: "stock", message: "A count is a whole number, zero or more." });
  }

  return issues;
}

/* ── photographs ──────────────────────────────────────────────────────────── */

/**
 * How many photos one product may hold. `PRODUCT_IMAGE_LIMIT` in
 * `apps/api/src/modules/catalog/product-images.ts`.
 *
 * The server refuses photo number nine before it stores any bytes, with
 * "This product already has 8 photos. Remove one first." This mirror exists so a
 * camera button can be disabled with an explanation instead of offered and then
 * refused. It is not the enforcement.
 */
export const PRODUCT_IMAGE_LIMIT = 8;

/**
 * What a photo may be. `IMAGE_MIME_TYPES` in
 * `apps/api/src/modules/uploads/upload-rules.ts`.
 *
 * HEIC/HEIF is **not** on this list, which matters on this surface more than it
 * does in a browser: an iPhone's camera roll is HEIC by default, and a picker
 * configured to hand the original through produces a file the API refuses as an
 * unsupported type. A picker must be asked for JPEG (expo-image-picker converts
 * when `mediaTypes` is images and no `preferredAssetRepresentationMode` override
 * is set), and this list is what a screen checks the result against.
 */
export const ACCEPTED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AcceptedImageMime = (typeof ACCEPTED_IMAGE_MIME_TYPES)[number];

/**
 * The image size ceiling, and why there are two numbers rather than one.
 *
 * `MAX_IMAGE_BYTES` is `UPLOAD_MAX_IMAGE_BYTES`'s default — 5 MiB — and it is the
 * limit that actually rejects a photo, inside `UploadsService`. It is deployment
 * configuration and is not exposed on any endpoint, so this is the documented
 * default and nothing more: a lowered deployment limit will refuse a file under
 * this number, and the 400 is the answer that counts.
 *
 * `MULTIPART_HARD_LIMIT_BYTES` is multer's ceiling on the route — 32 MiB, a
 * constant in `apps/api/src/config/configuration.ts` — and it is a different kind
 * of limit: a request above it is **cut off mid-body**, so the failure is a
 * truncated upload rather than a message naming the file. `validateConfig`
 * guarantees the image limit never exceeds it.
 *
 * A phone camera at full resolution produces 3–8 MB routinely, so this ceiling is
 * one a shopkeeper will hit. A screen should compress before uploading rather than
 * rely on either number.
 */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MULTIPART_HARD_LIMIT_BYTES = 32 * 1024 * 1024;

/** The multipart field name the route's `FileInterceptor` reads, and the only part it accepts. */
export const IMAGE_FIELD_NAME = "file";

/**
 * What a React Native image picker produces, in the shape this module needs.
 *
 * Structurally compatible with `ImagePickerAsset` from expo-image-picker and with
 * `Asset` from react-native-image-picker, so a screen passes the picker's own
 * object through without mapping it. `uri` is a local `file://` or `content://`
 * path — never a remote URL, which `fetch` would happily upload the HTML of.
 */
export type PickedImage = {
  uri: string;
  /** The picker's reported type. Absent on some Android providers. */
  mimeType?: string | null;
  /** The picker's reported name. Absent on some Android providers. */
  fileName?: string | null;
  /** Bytes, when the picker counted them. Absent is not zero. */
  fileSize?: number | null;
};

const EXTENSION_MEANS: Record<string, AcceptedImageMime> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jpe: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const EXTENSION_FOR: Record<AcceptedImageMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Spellings phones and browsers produce for a type the API accepts. */
const MIME_ALIASES: Record<string, AcceptedImageMime> = {
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "image/x-png": "image/png",
};

/** Normalise a picker's type the way `normaliseMime` does server-side. */
export function normaliseImageMime(declared: string | null | undefined): string {
  const bare = (declared ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  return MIME_ALIASES[bare] ?? bare;
}

/** The extension a name claims, lower-cased and without the dot, or null. */
export function imageExtension(fileName: string | null | undefined): string | null {
  const base = (fileName ?? "").split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return null;
  return base.slice(dot + 1).toLowerCase();
}

/**
 * The type this photo will be declared as, or null when it cannot be established.
 *
 * Falls back to the filename's extension because several Android content
 * providers report no `mimeType` at all, and a `Content-Type` the server cannot
 * read is an `UNSUPPORTED_TYPE` rejection rather than a lenient guess.
 */
export function resolveImageMime(image: PickedImage): AcceptedImageMime | null {
  const declared = normaliseImageMime(image.mimeType);
  if ((ACCEPTED_IMAGE_MIME_TYPES as readonly string[]).includes(declared)) {
    return declared as AcceptedImageMime;
  }
  if (declared !== "") return null;
  const fromName = imageExtension(image.fileName);
  return fromName ? (EXTENSION_MEANS[fromName] ?? null) : null;
}

/**
 * The filename to send, built so that name and declared type cannot disagree.
 *
 * `checkUpload` compares three facts — declared Content-Type, filename extension
 * and magic bytes — and refuses any disagreement. The extension check runs *only
 * when there is an extension*, which makes two ordinary picker outputs into 400s
 * if forwarded unexamined: `IMG_0004.HEIC` alongside `image/jpeg` (the picker
 * converted the bytes and kept the original name) and `photo.png` alongside
 * `image/jpeg`. So the picker's name is kept only when its extension already
 * means the resolved type; otherwise a plain `photo.<ext>` is sent, which agrees
 * with the type by construction.
 *
 * The name decides nothing about where the object lands — the storage key is
 * minted server-side from the shop and product ids plus 128 random bits — so
 * replacing it costs the seller nothing.
 */
export function imageUploadName(image: PickedImage, mime: AcceptedImageMime): string {
  const claimed = imageExtension(image.fileName);
  if (claimed && EXTENSION_MEANS[claimed] === mime) {
    const base = (image.fileName ?? "").split(/[\\/]/).pop();
    if (base) return base;
  }
  return `photo.${EXTENSION_FOR[mime]}`;
}

export type ImageIssue = {
  reason: "COUNT" | "TYPE" | "TOO_LARGE" | "NO_URI";
  message: string;
};

const humanBytes = (n: number): string =>
  n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

/**
 * Why this photo must not be uploaded, or null to go ahead.
 *
 * Ordered so the message names the one thing the shopkeeper can do about it, and
 * cheapest-first for the same reason the server's own gate is: the count and the
 * type are known before a byte moves.
 *
 * `fileSize` absent is not treated as an error. Several pickers do not report it,
 * and refusing an upload because the phone was vague about its own file would
 * block a legitimate photo — the server still weighs the bytes, and its message
 * is the honest one when that is the problem.
 */
export function imageUploadIssue(image: PickedImage, currentCount: number): ImageIssue | null {
  if (currentCount >= PRODUCT_IMAGE_LIMIT) {
    return {
      reason: "COUNT",
      message: `This product already has ${PRODUCT_IMAGE_LIMIT} photos. Remove one first.`,
    };
  }
  if (!image.uri) {
    return { reason: "NO_URI", message: "That photo could not be read. Choose it again." };
  }
  if (resolveImageMime(image) === null) {
    return {
      reason: "TYPE",
      message: "Photos must be JPEG, PNG or WebP.",
    };
  }
  if (typeof image.fileSize === "number" && image.fileSize > MAX_IMAGE_BYTES) {
    return {
      reason: "TOO_LARGE",
      message: `That photo is ${humanBytes(image.fileSize)}; the limit is ${humanBytes(MAX_IMAGE_BYTES)}.`,
    };
  }
  return null;
}

/**
 * Why this new photo order would be refused, or null.
 *
 * Mirrors `assertPermutation`: every key the product currently holds, exactly
 * once, and nothing else. The server is strict here on purpose — a short list is
 * a delete wearing a reorder's clothes, and the delete route is the one that also
 * removes the stored object — so a drag-and-drop screen that lost a key would
 * otherwise send a request it cannot explain the failure of.
 */
export function reorderIssue(current: readonly string[], next: readonly string[]): string | null {
  if (next.length !== current.length) {
    return `Send all ${current.length} photo${current.length === 1 ? "" : "s"} in the new order.`;
  }
  const seen = new Set<string>();
  for (const key of next) {
    if (seen.has(key)) return "The same photo was listed twice.";
    if (!current.includes(key)) return "That is not one of this product’s photos.";
    seen.add(key);
  }
  return null;
}

/**
 * Move one photo within the order, as a permutation.
 *
 * Here rather than in a screen because an off-by-one in a splice pair is exactly
 * the mistake that produces a list the server calls invalid, and because "which
 * photo is the product's face" is the first element of this array everywhere the
 * product is shown. Out-of-range indices return the list unchanged rather than
 * throwing: a gesture that ended off the edge of a list is not an error.
 */
export function movePhoto(keys: readonly string[], from: number, to: number): string[] {
  const next = [...keys];
  if (from < 0 || from >= next.length || to < 0 || to >= next.length || from === to) return next;
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return [...keys];
  next.splice(to, 0, moved);
  return next;
}
