"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Heart, ImageIcon, Minus, Plus, ShoppingBag } from "lucide-react";
import { motion } from "framer-motion";
import type { Product, Store } from "@/lib/data";
import { rs } from "@/lib/format";
import { useAuth, useCart, useSaved } from "@/components/providers";
import { useDeliveryLocation } from "@/components/location/LocationProvider";
import { Badge } from "@/components/primitives";

export function ProductCard({
  product,
  store,
  unavailableReason,
}: {
  product: Product;
  store: Store;
  unavailableReason?: string;
}) {
  const { add, lines, quantityFor, setQuantity } = useCart();
  const auth = useAuth();
  const saved = useSaved();
  const deliveryLocation = useDeliveryLocation();
  const router = useRouter();
  const [variantId, setVariantId] = React.useState(product.variants[0]?.id ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const addButtonRef = React.useRef<HTMLButtonElement>(null);
  const selectedVariantId = variantId || null;
  const selectedVariant = product.variants.find((variant) => variant.id === selectedVariantId);
  const displayPrice = selectedVariant?.price ?? product.price;
  const displayMrp = selectedVariant?.mrp ?? product.mrp;
  const quantity = quantityFor(product.id, selectedVariantId);
  const cartLine = lines.find(
    (line) => line.product.id === product.id && line.variantId === selectedVariantId,
  );

  const onAdd = async () => {
    if (unavailableReason) return;
    if (!deliveryLocation.location) {
      deliveryLocation.openPicker();
      return;
    }
    if (auth.status !== "authenticated") {
      router.push(`/login?next=${encodeURIComponent(`/store/${store.slug}`)}`);
      return;
    }
    try {
      await add(product, store, variantId || null);
      setError(null);
      const rect = addButtonRef.current?.getBoundingClientRect();
      window.dispatchEvent(
        new CustomEvent("gopasal:cart-added", {
          detail: {
            name: product.name,
            x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
            y: rect ? rect.top + rect.height / 2 : window.innerHeight / 2,
          },
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add item");
    }
  };

  const off = displayMrp ? Math.round(((displayMrp - displayPrice) / displayMrp) * 100) : 0;
  const productSaved = saved.isProductSaved(product.id);

  const onSave = async () => {
    if (auth.status !== "authenticated") {
      router.push(`/login?next=${encodeURIComponent(`/store/${store.slug}`)}`);
      return;
    }
    try {
      await saved.toggleProduct(product.id);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update saved items");
    }
  };

  return (
    <div className="gp-card group flex flex-col p-3">
      <div className="relative mb-3 flex h-24 items-center justify-center overflow-hidden rounded-md bg-ink-50">
        {product.image ? (
          <Image
            src={product.image}
            alt={product.name}
            fill
            unoptimized
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 240px"
            className="object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-crimson-400 shadow-sm">
            <ImageIcon className="h-6 w-6" />
          </span>
        )}
        {product.tag && (
          <div className="absolute left-2 top-2">
            <Badge tone="marigold">{product.tag}</Badge>
          </div>
        )}
        {off > 0 && (
          <div className="absolute right-2 top-2 rounded-full bg-crimson-500 px-2 py-0.5 text-xs font-bold text-white">
            -{off}%
          </div>
        )}
        <button
          type="button"
          onClick={() => void onSave()}
          aria-label={
            productSaved ? `Remove ${product.name} from saved items` : `Save ${product.name}`
          }
          aria-pressed={productSaved}
          className={`absolute bottom-2 right-2 grid h-9 w-9 place-items-center rounded-full border bg-white/95 shadow-sm transition hover:scale-105 ${
            productSaved
              ? "border-crimson-200 text-crimson-600"
              : "border-white text-ink-600 hover:text-crimson-600"
          }`}
        >
          <Heart className={`h-4.5 w-4.5 ${productSaved ? "fill-current" : ""}`} />
        </button>
      </div>

      <h4 className="line-clamp-2 text-sm font-semibold leading-snug text-ink-900">
        {product.name}
      </h4>
      <p className="mt-0.5 text-xs text-ink-400">{product.unit}</p>
      {product.variants.length > 1 && (
        <select
          aria-label={`${product.name} option`}
          value={variantId}
          onChange={(event) => setVariantId(event.target.value)}
          className="mt-2 w-full rounded-lg border border-ink-200 bg-white px-2 py-1 text-xs"
        >
          {product.variants.map((variant) => (
            <option key={variant.id} value={variant.id}>
              {variant.name} · {rs(variant.price)}
            </option>
          ))}
        </select>
      )}
      {error && <p className="mt-2 text-xs text-crimson-600">{error}</p>}

      <div className="mt-auto flex items-end justify-between pt-3">
        <div>
          <div className="font-display text-base font-bold text-ink-900">{rs(displayPrice)}</div>
          {displayMrp && <div className="text-xs text-ink-400 line-through">{rs(displayMrp)}</div>}
        </div>
        {quantity > 0 && cartLine ? (
          <div
            className="flex h-10 items-center overflow-hidden rounded-full border border-crimson-200 bg-crimson-50 shadow-sm"
            aria-label={`${quantity} ${product.name} in cart`}
          >
            <button
              type="button"
              onClick={() => void setQuantity(cartLine.id, quantity - 1)}
              className="grid h-10 w-9 place-items-center text-crimson-700 transition hover:bg-crimson-100"
              aria-label={`Remove one ${product.name}`}
            >
              <Minus className="h-4 w-4" />
            </button>
            <span
              className="min-w-7 text-center text-sm font-extrabold text-crimson-700"
              aria-live="polite"
            >
              {quantity}
            </span>
            <motion.button
              ref={addButtonRef}
              type="button"
              disabled={Boolean(unavailableReason)}
              onClick={() => void onAdd()}
              whileTap={{ scale: 0.88 }}
              className="grid h-10 w-9 place-items-center bg-crimson-500 text-white transition hover:bg-crimson-600"
              aria-label={`Add another ${product.name}`}
            >
              <Plus className="h-4 w-4" />
            </motion.button>
          </div>
        ) : (
          <motion.button
            ref={addButtonRef}
            type="button"
            disabled={Boolean(unavailableReason)}
            onClick={() => void onAdd()}
            whileTap={{ scale: 0.88 }}
            aria-label={`Add ${product.name} to cart`}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-crimson-200 bg-crimson-50 px-3 text-sm font-bold text-crimson-700 transition hover:bg-crimson-500 hover:text-white disabled:cursor-not-allowed disabled:border-ink-200 disabled:bg-ink-100 disabled:text-ink-400"
          >
            <ShoppingBag className="h-4 w-4" />
            <span className="hidden sm:inline">Add</span>
            <Plus className="h-3.5 w-3.5" />
          </motion.button>
        )}
      </div>
      {unavailableReason && (
        <p className="mt-2 text-xs font-semibold text-ink-500">{unavailableReason}</p>
      )}
    </div>
  );
}

export default ProductCard;
