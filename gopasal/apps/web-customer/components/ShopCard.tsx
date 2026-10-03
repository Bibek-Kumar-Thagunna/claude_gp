"use client";

import * as React from "react";
import Link from "next/link";
import { MapPin, BadgeCheck, Truck, Wallet, Heart } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Store } from "@/lib/data";
import { Rating, Badge } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { useAuth, useSaved } from "@/components/providers";

export function ShopCard({ store }: { store: Store }) {
  const auth = useAuth();
  const saved = useSaved();
  const router = useRouter();
  const isSaved = saved.isShopSaved(store.id);

  const onSave = async () => {
    if (auth.status !== "authenticated") {
      router.push(`/login?next=${encodeURIComponent(`/store/${store.slug}`)}`);
      return;
    }
    await saved.toggleShop(store.id);
  };

  return (
    <article className="gp-card group relative overflow-hidden">
      <Link
        href={`/store/${store.slug}`}
        className="block focus-visible:ring-4 focus-visible:ring-crimson-50"
      >
        <div className={cn("relative h-32 bg-gradient-to-br", store.cover)}>
          <div className="gp-dot-grid absolute inset-0 opacity-40" />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-5xl drop-shadow-sm transition-transform duration-300 group-hover:scale-110">
            {store.emoji}
          </span>
          <div className="absolute left-3 top-3">
            {store.isOpen ? (
              <Badge tone="green">● Open now</Badge>
            ) : (
              <Badge tone="ink">● Closed</Badge>
            )}
          </div>
          {store.verified && (
            <div className="absolute right-14 top-3 rounded-full bg-white/95 p-1 text-crimson-600 shadow-soft">
              <BadgeCheck className="h-4 w-4" />
            </div>
          )}
        </div>

        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-display text-lg font-bold leading-tight text-ink-900 group-hover:text-crimson-600">
              {store.name}
            </h3>
          </div>
          <p className="mt-0.5 flex items-center gap-1 text-sm text-ink-500">
            <MapPin className="h-3.5 w-3.5" /> {store.area}
            {store.distanceMeters != null && (
              <span className="font-semibold text-ink-700">
                · {(store.distanceMeters / 1000).toFixed(1)} km away
              </span>
            )}
          </p>
          <div className="mt-2">
            <Rating value={store.rating} reviews={store.reviews} />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge tone="crimson">
              <Truck className="h-3 w-3" />
              {store.distanceMeters != null ? "Delivers here" : "Shop delivers"}
            </Badge>
            <Badge tone="marigold">
              <Wallet className="h-3 w-3" /> Cash on delivery
            </Badge>
          </div>
        </div>
      </Link>
      <button
        type="button"
        onClick={() => void onSave().catch(() => undefined)}
        aria-label={isSaved ? `Remove ${store.name} from saved shops` : `Save ${store.name}`}
        aria-pressed={isSaved}
        className={`absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full border bg-white/95 shadow-soft transition hover:scale-105 ${
          isSaved
            ? "border-crimson-200 text-crimson-600"
            : "border-white text-ink-600 hover:text-crimson-600"
        }`}
      >
        <Heart className={`h-4.5 w-4.5 ${isSaved ? "fill-current" : ""}`} />
      </button>
    </article>
  );
}

export default ShopCard;
