"use client";

import * as React from "react";
import Image from "next/image";
import { ArrowLeft, ArrowRight, ImageOff, ImagePlus, Star, Trash2 } from "lucide-react";
import { ApiError } from "@gopasal/api-client";
import { Button } from "@/components/primitives";
import { InlineError, Spinner } from "@/components/states";
import {
  ACCEPTED_IMAGE_TYPES,
  IMAGE_ACCEPT_ATTRIBUTE,
  MAX_IMAGE_BYTES,
  PRODUCT_IMAGE_LIMIT,
  deleteProductImage,
  reorderProductImages,
  uploadProductImage,
} from "@/lib/api/products";
import { formatBytes } from "@/lib/onboarding-view";
import type { ProductPhoto } from "@/lib/catalog-view";

/**
 * A product's photos: add, remove, reorder.
 *
 * All three routes are `catalog.edit`, and the caller only renders this when the
 * seller holds that permission **on the owning shop** — not ambiently.
 *
 * The rule this component exists to respect is that **a client never names a
 * storage path.** So there is no URL field and no filename box: a photo is a file,
 * posted as `multipart/form-data`, and the API decides where the bytes land and
 * what the key is. Everything here that *does* carry a key —
 * {@link deleteProductImage} and {@link reorderProductImages} — is echoing back a
 * key that came out of a read, which the server then re-checks against the
 * product's own array.
 *
 * Two consequences shape the interaction:
 *
 * - **Reorder is a permutation, never a subset.** Moving a photo sends every key
 *   in the new order. That is not politeness towards the DTO; a short list would
 *   drop a key while its bytes stayed in storage forever, so the API refuses one.
 *   Removing a photo is therefore always the delete route, which unlinks the
 *   object too.
 * - **Writes answer with the product row but no variants,** like every other
 *   write in this console, so the response is discarded and the caller refetches
 *   through `onChanged`.
 *
 * The size and type checks below are a courtesy, not a control. The server reads
 * the file's magic bytes, cross-checks the declared type and the extension, and
 * applies its own configured ceiling — which may be lower than
 * {@link MAX_IMAGE_BYTES}, the documented default. A refusal from the API is
 * shown as it came rather than being second-guessed here.
 */

/** `keys` with the item at `from` moved to `to`. Same members, so still a permutation. */
function moved(keys: string[], from: number, to: number): string[] {
  const next = [...keys];
  const [item] = next.splice(from, 1);
  if (item === undefined) return keys;
  next.splice(to, 0, item);
  return next;
}

export function PhotoManager({
  shopId,
  productId,
  productName,
  photos,
  onChanged,
}: {
  shopId: string;
  productId: string;
  productName: string;
  photos: ProductPhoto[];
  onChanged: () => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const keys = photos.map((p) => p.key);
  const full = photos.length >= PRODUCT_IMAGE_LIMIT;

  const run = React.useCallback(
    async (token: string, fn: () => Promise<unknown>) => {
      setBusy(token);
      setError(null);
      try {
        await fn();
        onChanged();
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : "That didn’t go through. Please try again.",
        );
      } finally {
        setBusy(null);
      }
    },
    [onChanged],
  );

  const pick = (file: File | undefined) => {
    if (!file) return;
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setError("Photos have to be JPEG, PNG or WebP.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError(
        `That photo is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_IMAGE_BYTES)} — take it again at a smaller size.`,
      );
      return;
    }
    void run("upload", () => uploadProductImage(shopId, productId, file));
  };

  return (
    <div className="rounded-xl bg-ink-50 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">
          <ImagePlus className="h-3.5 w-3.5" /> Photos
          <span className="font-normal normal-case tracking-normal text-ink-400">
            {photos.length} of {PRODUCT_IMAGE_LIMIT}
          </span>
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={full || busy !== null}
          onClick={() => inputRef.current?.click()}
        >
          {busy === "upload" ? <Spinner /> : <ImagePlus className="h-4 w-4" />} Add photo
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={IMAGE_ACCEPT_ATTRIBUTE}
          className="hidden"
          aria-label={`Add a photo of ${productName}`}
          onChange={(e) => {
            pick(e.target.files?.[0]);
            // Clear it, or choosing the same file twice in a row fires no change event.
            e.target.value = "";
          }}
        />
      </div>

      {error && <InlineError message={error} className="mb-2" />}

      {photos.length === 0 ? (
        <p className="text-xs leading-relaxed text-ink-500">
          No photos yet. The first one you add becomes the picture customers see in search and on
          the shop page, and you can reorder them afterwards.
        </p>
      ) : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((photo, i) => {
            const rowBusy = busy === photo.key;
            return (
              <li
                key={photo.key}
                className="overflow-hidden rounded-lg bg-white ring-1 ring-ink-100"
              >
                <div className="relative aspect-square bg-ink-100">
                  {photo.url ? (
                    <Image
                      src={photo.url}
                      alt={`${productName} — photo ${i + 1}`}
                      fill
                      sizes="(min-width: 640px) 12rem, 30vw"
                      className="object-cover"
                    />
                  ) : (
                    <span
                      className="flex h-full w-full flex-col items-center justify-center gap-1 text-ink-400"
                      title="This photo could not be loaded. Removing it is safe."
                    >
                      <ImageOff className="h-5 w-5" />
                      <span className="text-[10px] font-medium">Not loading</span>
                    </span>
                  )}
                  {i === 0 && (
                    <span className="absolute left-1 top-1 inline-flex items-center gap-1 rounded-md bg-ink-900/80 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      <Star className="h-2.5 w-2.5" /> Cover
                    </span>
                  )}
                  {rowBusy && (
                    <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-ink-600">
                      <Spinner />
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between px-1 py-1">
                  <button
                    type="button"
                    disabled={i === 0 || busy !== null}
                    onClick={() =>
                      void run(photo.key, () =>
                        reorderProductImages(shopId, productId, moved(keys, i, i - 1)),
                      )
                    }
                    aria-label={`Move photo ${i + 1} of ${productName} earlier`}
                    className={iconButton}
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={i === photos.length - 1 || busy !== null}
                    onClick={() =>
                      void run(photo.key, () =>
                        reorderProductImages(shopId, productId, moved(keys, i, i + 1)),
                      )
                    }
                    aria-label={`Move photo ${i + 1} of ${productName} later`}
                    className={iconButton}
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() =>
                      void run(photo.key, () => deleteProductImage(shopId, productId, photo.key))
                    }
                    aria-label={`Delete photo ${i + 1} of ${productName}`}
                    className="flex items-center justify-center rounded-md p-1.5 text-ink-400 hover:bg-red-50 hover:text-[#c02636] disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
        JPEG, PNG or WebP, up to {formatBytes(MAX_IMAGE_BYTES)} each. The first photo is the cover.
        Deleting one removes the file for good.
      </p>
    </div>
  );
}

const iconButton =
  "flex items-center justify-center rounded-md p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-800 disabled:opacity-40";
