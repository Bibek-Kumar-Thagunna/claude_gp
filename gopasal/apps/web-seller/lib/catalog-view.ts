/**
 * The catalog view model: wire rows in, screen-ready rows out, nothing invented.
 *
 * Two fixture ideas are deliberately absent, because the backend has no column
 * behind either of them:
 *
 * - **No low-stock threshold.** `Product` has `stock` and `trackStock` and
 *   nothing else, so the only stock facts derivable here are "not tracked",
 *   "none left" and "some left". A "low stock" count would be a number we chose,
 *   dressed as a number the shop set.
 * - **No single "price".** The API keeps a required `Product.price` *and*
 *   per-variant prices. Which one a customer pays is not something this file can
 *   know, so it reports the base price as the base price and the variant span
 *   separately, rather than blending them into one confident range.
 *
 * Photos used to be on that list — "no route in the API accepts a product photo"
 * — and are not any more. `Product.images` holds server-minted storage keys and
 * every read carries `imageUrls` beside them, so {@link SellerProduct} keeps both
 * in one field: `photos` is a list of `{ key, url }`, where the key is what a
 * delete or a reorder must name and the url is what a screen renders. They are
 * paired index-for-index by {@link productPhotos}, which is the only honest way to
 * hold them, since a key that no longer resolves is omitted from `imageUrls` and
 * would otherwise shift every following URL onto the wrong key.
 *
 * Searching and filtering are **not** here either, and used to be: this file once
 * carried `matchesQuery`, `catalogStats`, `usedCategories` and `inCategory`, which
 * the catalogue and inventory screens applied to whatever rows the browser happened
 * to hold. `GET /seller/shops/:shopId/products` now takes `q`, `categoryId`,
 * `status`, `stock` and `sort` and returns a shop-wide `summary`, so a filtered
 * result is a claim about the shop rather than about one bounded read. What is left
 * here are the two query translators and the chip builder that the server's summary
 * feeds.
 */

import { apiOrigin } from "@gopasal/api-client";
import type { Category } from "./api/types";
import {
  NO_CATEGORY,
  type CatalogSummaryWire,
  type ProductVariantWire,
  type ProductWire,
} from "./api/products";

/**
 * The chip id for products the shop never assigned a category to.
 *
 * A UI-side sentinel, distinct from the API's own {@link NO_CATEGORY} (`"none"`),
 * which {@link categoryQuery} translates to. Two sentinels exist because a real
 * category slug could in principle be `"none"`, and the chip row also needs an
 * `"all"` value the API has no equivalent for.
 */
export const UNCATEGORISED = "__uncategorised__";

export type SellerVariant = {
  id: string;
  name: string;
  sku: string | null;
  price: number;
  mrp: number | null;
  stock: number;
  isActive: boolean;
};

/** What "in stock" can honestly mean with only `trackStock` and `stock` to go on. */
export type StockState = "untracked" | "out" | "in";

/**
 * One photo: the key a mutation names, and the URL a screen renders.
 *
 * `url` is absolute and fetchable from this console, or `null` when the API could
 * not resolve the key or there is no API origin to resolve it against — see
 * {@link productPhotos}. A row like that is still listed, because the key is real
 * and deleting it is exactly what a seller would want to do about it.
 */
export type ProductPhoto = { key: string; url: string | null };

/**
 * Make a resolved photo URL fetchable from *this* origin.
 *
 * `StorageProvider.publicUrl` is absolute under `s3` (bucket or CDN host) but
 * relative under `local` unless `STORAGE_LOCAL_PUBLIC_BASE_URL` is set — it
 * returns `/uploads/public/…`, which is correct relative to the **API** and a 404
 * relative to this console on its own port. So a root-relative URL is joined onto
 * the API origin and an absolute one is left exactly as it came.
 *
 * `null` when there is no origin configured, which is the same state in which
 * every other request on the screen fails: better a missing thumbnail than a
 * request to `localhost:3001/uploads/…` that quietly 404s.
 */
function fetchable(url: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) return url;
  const origin = apiOrigin();
  return origin ? `${origin}${url.startsWith("/") ? "" : "/"}${url}` : null;
}

/**
 * Pair `images` with `imageUrls`.
 *
 * The API resolves the keys in order but **omits** any it could not resolve, so
 * the two arrays are usually the same length and occasionally not. When they match,
 * index-for-index is the pairing and it is exact. When they do not, one or more keys
 * dropped out and there is no way to know which from here — so rather than shifting
 * every URL onto the wrong key, this reports every photo as unresolved. A missing
 * thumbnail is a visible, correct "this photo is broken"; a mislabelled one would
 * have the seller delete the wrong picture.
 */
function productPhotos(row: { images: string[]; imageUrls: string[] }): ProductPhoto[] {
  const paired = row.images.length === row.imageUrls.length;
  return row.images.map((key, i) => {
    const url = paired ? row.imageUrls[i] : undefined;
    return { key, url: url ? fetchable(url) : null };
  });
}

export type SellerProduct = {
  id: string;
  shopId: string;
  name: string;
  nameNp: string | null;
  description: string | null;
  /** `null` when the shop never picked one — rendered as "Uncategorised". */
  categoryId: string | null;
  /** Resolved from `GET /categories`; `null` when unset or unknown to that list. */
  categoryName: string | null;
  price: number;
  mrp: number | null;
  unit: string;
  tags: string[];
  isActive: boolean;
  trackStock: boolean;
  stock: number;
  stockState: StockState;
  variants: SellerVariant[];
  /** Span across *active* variants, or `null` when there are none. */
  variantPriceRange: { min: number; max: number } | null;
  /** Keys paired with URLs, in display order; the first is the product's face. */
  photos: ProductPhoto[];
  updatedAt: string;
};

function toVariant(v: ProductVariantWire): SellerVariant {
  return {
    id: v.id,
    name: v.name,
    sku: v.sku,
    price: v.price,
    mrp: v.mrp,
    stock: v.stock,
    isActive: v.isActive,
  };
}

function stockStateOf(row: { trackStock: boolean; stock: number }): StockState {
  if (!row.trackStock) return "untracked";
  return row.stock === 0 ? "out" : "in";
}

function spanOf(variants: SellerVariant[]): { min: number; max: number } | null {
  const prices = variants.filter((v) => v.isActive).map((v) => v.price);
  const first = prices[0];
  if (first === undefined) return null;
  return {
    min: prices.reduce((a, p) => (p < a ? p : a), first),
    max: prices.reduce((a, p) => (p > a ? p : a), first),
  };
}

/** Index a category list by id so a product can name its own category. */
export function categoryIndex(categories: Category[]): Map<string, Category> {
  return new Map(categories.map((c) => [c.id, c]));
}

function toSellerProduct(
  wire: ProductWire,
  categories?: Map<string, Category>,
): SellerProduct {
  const variants = wire.variants.map(toVariant);
  return {
    id: wire.id,
    shopId: wire.shopId,
    name: wire.name,
    nameNp: wire.nameNp,
    description: wire.description,
    categoryId: wire.categoryId,
    categoryName: wire.categoryId ? (categories?.get(wire.categoryId)?.en ?? null) : null,
    price: wire.price,
    mrp: wire.mrp,
    unit: wire.unit,
    tags: wire.tags,
    isActive: wire.isActive,
    trackStock: wire.trackStock,
    stock: wire.stock,
    stockState: stockStateOf(wire),
    variants,
    variantPriceRange: spanOf(variants),
    photos: productPhotos(wire),
    updatedAt: wire.updatedAt,
  };
}

export function toSellerProducts(
  rows: ProductWire[],
  categories?: Map<string, Category>,
): SellerProduct[] {
  return rows.map((r) => toSellerProduct(r, categories));
}

/* ------------------------------------------------------- Filters, server-side */

/**
 * A chip id as the API's `categoryId` parameter.
 *
 * `"all"` is the absence of a filter, so it becomes `undefined` and the key is not
 * sent at all. {@link UNCATEGORISED} becomes the API's `NO_CATEGORY` literal.
 */
export function categoryQuery(chipId: string): string | undefined {
  if (chipId === "all") return undefined;
  if (chipId === UNCATEGORISED) return NO_CATEGORY;
  return chipId;
}

/** A visibility tab as the API's `status` parameter. */
export function statusQuery(tab: "all" | "active" | "hidden"): "active" | "hidden" | undefined {
  return tab === "all" ? undefined : tab;
}

/**
 * The category chips a shop's own catalogue justifies, built from the server's
 * shop-wide roll-up rather than from the rows on screen.
 *
 * This used to be derived from the loaded products, which was fine while the
 * browser held the whole catalogue and filtered it locally. Now that the API
 * filters, chips derived from the visible rows would collapse to the single
 * selected category the moment one was clicked — a filter row that deletes its own
 * alternatives. `summary.categories` is counted over the whole shop, so the row
 * stays put while the list narrows.
 *
 * `GET /categories` is still the only source of *names*; a category id absent from
 * it is shown as the raw id rather than hidden, because the shop has products in it
 * either way.
 */
export function summaryCategories(
  summary: Pick<CatalogSummaryWire, "categories">,
  categories: Map<string, Category>,
): { id: string; label: string; count: number }[] {
  const named: { id: string; label: string; count: number }[] = [];
  let unset = 0;
  for (const c of summary.categories) {
    if (c.categoryId === null) {
      unset += c.count;
      continue;
    }
    named.push({
      id: c.categoryId,
      label: categories.get(c.categoryId)?.en ?? c.categoryId,
      count: c.count,
    });
  }
  named.sort((a, b) => a.label.localeCompare(b.label));
  if (unset > 0) named.push({ id: UNCATEGORISED, label: "Uncategorised", count: unset });
  return named;
}
