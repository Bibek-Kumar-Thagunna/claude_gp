import * as React from "react";
import { cn } from "@/lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("gp-skeleton", className)} />;
}

export function ShopCardSkeleton() {
  return (
    <div className="gp-card overflow-hidden">
      <Skeleton className="h-32 w-full rounded-none" />
      <div className="space-y-3 p-4">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="gp-card p-3">
      <Skeleton className="mb-3 h-24 w-full" />
      <Skeleton className="mb-2 h-3 w-4/5" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}

export function ShopGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <ShopCardSkeleton key={i} />
      ))}
    </div>
  );
}
