"use client";

import * as React from "react";
import Link from "next/link";
import { getShop } from "@/lib/api/customer";
import type { Store } from "@/lib/data";
import { StoreView } from "./StoreView";

export function StoreScreen({ slug }: { slug: string }) {
  const [store, setStore] = React.useState<Store | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    const controller = new AbortController();
    void getShop(slug, controller.signal).then(setStore).catch((cause: unknown) => {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) setError(cause instanceof Error ? cause.message : "Could not load this shop");
    });
    return () => controller.abort();
  }, [slug]);
  if (error) return <div className="gp-container py-16"><h1 className="text-2xl font-bold">Shop unavailable</h1><p className="mt-2 text-ink-600">{error}</p><Link className="mt-5 inline-block font-semibold text-crimson-600" href="/shops">Back to shops</Link></div>;
  if (!store) return <div className="gp-container py-16 text-ink-500">Loading live catalogue…</div>;
  return <StoreView store={store} />;
}
