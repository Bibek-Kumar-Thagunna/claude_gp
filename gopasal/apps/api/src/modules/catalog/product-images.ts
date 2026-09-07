import { BadRequestException } from '@nestjs/common';
import { type StorageProvider, isPublicKey } from '../../providers/storage.provider';

/**
 * What `Product.images` contains, and why it is not a list of URLs.
 *
 * The column is `String[]` and it holds **storage keys** under `public/`, in
 * display order — never a URL, and never anything a client sent. Three
 * consequences follow, and they are the reason the decision is written down here
 * rather than left to be inferred:
 *
 * 1. **A key survives configuration.** The same object is reachable at a
 *    different URL under `STORAGE_PROVIDER=local` than under `s3`, and again
 *    behind a CDN. A URL in the database would mean a data migration every time
 *    the bucket, the domain or the provider changed; a key means the URL is
 *    computed at read time by whichever provider is live.
 * 2. **A key is deletable.** Replacing or removing a photo has to remove the
 *    object too, or `public/` grows without bound. Going from a stored URL back
 *    to a key means parsing the URL against the current base — which is exactly
 *    the operation that breaks when the base changes.
 * 3. **A key can be checked for membership.** Every mutating route takes keys
 *    the client got from a previous read and requires each to already be in this
 *    product's array. That is what makes "never allow client-supplied storage
 *    paths" hold for delete and reorder as well as for upload: an arbitrary
 *    string is not rejected because it looks wrong, it is rejected because it is
 *    not one of this product's keys.
 *
 * Responses therefore carry both: `images` (the keys, for the next mutation) and
 * `imageUrls` (the same list resolved, in the same order, for rendering).
 */

/**
 * How many photos one product may hold.
 *
 * A ceiling has to exist somewhere: the column is unbounded, each object costs
 * storage, and every read resolves every key. Eight is the number a shopkeeper
 * photographing a product from a few angles reaches and stops at, and it is small
 * enough that the resolved list is never a payload of its own.
 */
export const PRODUCT_IMAGE_LIMIT = 8;

/**
 * The path a product's photos live under, built from ids the application already
 * holds. Nothing here comes from the request body or from the uploaded file's
 * name — `buildPublicKey` re-checks each segment against `ID_PATTERN` and adds
 * 128 random bits for the filename itself.
 */
export function productImageSegments(shopId: string, productId: string): string[] {
  return ['shops', shopId, 'products', productId];
}

/**
 * Resolve stored keys to fetchable URLs, preserving order.
 *
 * A key that is somehow not public is skipped rather than thrown on: this runs on
 * the read path of the public storefront, and one bad row must not take a
 * catalogue page down with it. `publicUrl` would refuse it anyway — this decides
 * *how* it is refused, and "the photo is missing" beats "the page is 400".
 */
export function resolveImageUrls(storage: StorageProvider, keys: string[]): string[] {
  const urls: string[] = [];
  for (const key of keys) {
    if (!isPublicKey(key)) continue;
    try {
      urls.push(storage.publicUrl(key));
    } catch {
      continue;
    }
  }
  return urls;
}

/** A product row with its photos resolved for rendering, keys left intact. */
export type WithImageUrls<T extends { images: string[] }> = T & { imageUrls: string[] };

export function withImageUrls<T extends { images: string[] }>(
  storage: StorageProvider,
  row: T,
): WithImageUrls<T> {
  return { ...row, imageUrls: resolveImageUrls(storage, row.images) };
}

export function withImageUrlsAll<T extends { images: string[] }>(
  storage: StorageProvider,
  rows: T[],
): WithImageUrls<T>[] {
  return rows.map((row) => withImageUrls(storage, row));
}

/**
 * The key a mutation named, proved to be one of this product's own.
 *
 * The message says "not one of this product's photos" rather than "invalid key",
 * because both cases are the same case from the caller's side and the difference
 * would tell them whether some other product owns it.
 */
export function assertOwnedImage(images: string[], key: string): void {
  if (!images.includes(key)) {
    throw new BadRequestException('That is not one of this product’s photos');
  }
}

/**
 * A reorder is a permutation, not an assignment.
 *
 * The body has to contain every key the product currently has, exactly once, and
 * nothing else. That is a stricter test than "each key is owned": it also refuses
 * a body that would silently *drop* a photo, which is a delete wearing a
 * reorder's clothes — deleting has its own route, and that route removes the
 * object from storage. A partial list here would leave orphaned bytes behind.
 */
export function assertPermutation(images: string[], next: string[]): void {
  if (next.length !== images.length) {
    throw new BadRequestException(
      `Send all ${images.length} photo key${images.length === 1 ? '' : 's'} in the new order; ` +
        'use DELETE to remove one.',
    );
  }
  const seen = new Set<string>();
  for (const key of next) {
    if (seen.has(key)) throw new BadRequestException('The same photo key was sent twice');
    assertOwnedImage(images, key);
    seen.add(key);
  }
}
