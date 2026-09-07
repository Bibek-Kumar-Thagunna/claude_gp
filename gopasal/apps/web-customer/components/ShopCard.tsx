import * as React from "react";
import Link from "next/link";
import { MapPin, BadgeCheck, Truck, Wallet } from "lucide-react";
import type { Store } from "@/lib/data";
import { Rating, Badge } from "@/components/primitives";
import { cn } from "@/lib/cn";

export function ShopCard({ store }: { store: Store }) {
  return (
    <Link
      href={`/store/${store.slug}`}
      className="gp-card group block overflow-hidden focus-visible:ring-4 focus-visible:ring-crimson-50"
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
          <div className="absolute right-3 top-3 rounded-full bg-white/95 p-1 text-crimson-600 shadow-soft">
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
          <MapPin className="h-3.5 w-3.5" /> {store.area} · {store.distanceKm.toFixed(1)} km
        </p>
        <div className="mt-2">
          <Rating value={store.rating} reviews={store.reviews} />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge tone="crimson">
            <Truck className="h-3 w-3" /> Shop delivers
          </Badge>
          <Badge tone="marigold">
            <Wallet className="h-3 w-3" /> Cash on delivery
          </Badge>
        </div>
      </div>
    </Link>
  );
}

export default ShopCard;
