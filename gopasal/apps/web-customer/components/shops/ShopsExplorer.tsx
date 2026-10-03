"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Category, Store } from "@/lib/data";
import {
  deliveringShops,
  discoverySearch,
  listCategories,
  listShops,
  type NearbyProduct,
} from "@/lib/api/customer";
import { ShopCard } from "@/components/ShopCard";
import { ProductCard } from "@/components/ProductCard";
import { useDeliveryLocation } from "@/components/location/LocationProvider";
import { Reveal } from "@/components/Reveal";
import { useLang } from "@/components/providers";
import { cn } from "@/lib/cn";

export function ShopsExplorer({ initialCategory }: { initialCategory?: string }) {
  const { lang } = useLang();
  const deliveryLocation = useDeliveryLocation();
  const searchParams = useSearchParams();
  const search = searchParams.get("q")?.trim() ?? "";
  const [active, setActive] = React.useState<string>(initialCategory ?? "all");
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [shops, setShops] = React.useState<Store[]>([]);
  const [products, setProducts] = React.useState<NearbyProduct[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!deliveryLocation.ready) return;
    const controller = new AbortController();
    setLoading(true);
    const catalogRequest = search
      ? discoverySearch(search, deliveryLocation.location, controller.signal)
      : deliveryLocation.location
        ? deliveringShops(deliveryLocation.location, controller.signal).then((rows) => ({
            shops: rows,
            products: [] as NearbyProduct[],
          }))
        : listShops(undefined, controller.signal).then((rows) => ({
            shops: rows,
            products: [] as NearbyProduct[],
          }));
    void Promise.all([listCategories(controller.signal), catalogRequest])
      .then(([categoryRows, result]) => {
        setCategories(categoryRows);
        setShops(result.shops);
        setProducts(result.products);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!(cause instanceof DOMException && cause.name === "AbortError"))
          setError(cause instanceof Error ? cause.message : "Could not load shops");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [deliveryLocation.location, deliveryLocation.ready, search]);

  const visible = active === "all" ? shops : shops.filter((shop) => shop.category === active);
  const visibleProducts =
    active === "all" ? products : products.filter(({ store }) => store.category === active);

  return (
    <div className="gp-container py-10">
      <Reveal>
        <h1 className="text-3xl font-bold text-ink-900 md:text-4xl">Shops near you</h1>
        <p className="mt-2 text-ink-600">
          {deliveryLocation.location
            ? `Only showing shops and products that serve ${deliveryLocation.location.label}.`
            : "Choose your delivery location to see only shops that can serve you."}
        </p>
        {search && (
          <p className="mt-2 text-sm font-medium text-crimson-700">Search results for “{search}”</p>
        )}
      </Reveal>

      {!deliveryLocation.location && deliveryLocation.ready && (
        <button
          type="button"
          onClick={deliveryLocation.openPicker}
          className="mt-5 rounded-full bg-crimson-500 px-5 py-2.5 text-sm font-bold text-white shadow-crimson"
        >
          Choose delivery location
        </button>
      )}

      {/* filter chips */}
      <div className="mt-6 flex flex-wrap gap-2">
        <Chip active={active === "all"} onClick={() => setActive("all")}>
          All
        </Chip>
        {categories.map((c) => (
          <Chip key={c.slug} active={active === c.slug} onClick={() => setActive(c.slug)}>
            {lang === "np" ? c.np : c.en}
          </Chip>
        ))}
      </div>

      {loading ? (
        <p className="mt-10 text-sm text-ink-500">Finding serviceable results…</p>
      ) : error ? (
        <p className="mt-8 rounded-xl bg-crimson-50 p-4 text-sm text-crimson-700">{error}</p>
      ) : visible.length === 0 && visibleProducts.length === 0 ? (
        <div className="mt-16 text-center">
          <p className="text-lg font-semibold text-ink-800">No shops here yet</p>
          <p className="mt-2 text-ink-500">
            We’re onboarding shops in this category.{" "}
            <Link href="/sell" className="font-semibold text-crimson-600 hover:underline">
              Run one? List it →
            </Link>
          </p>
        </div>
      ) : (
        <>
          {visibleProducts.length > 0 && (
            <section className="mt-8">
              <h2 className="text-xl font-bold text-ink-900">Products</h2>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
                {visibleProducts.map(({ product, store }) => (
                  <ProductCard key={product.id} product={product} store={store} />
                ))}
              </div>
            </section>
          )}
          {visible.length > 0 && (
            <section className="mt-10">
              <h2 className="text-xl font-bold text-ink-900">
                {search ? "Matching shops" : "Shops"}
              </h2>
              <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {visible.map((store, i) => (
                  <Reveal key={store.slug} delay={i}>
                    <ShopCard store={store} />
                  </Reveal>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full border px-4 py-2 text-sm font-semibold transition",
        active
          ? "border-crimson-500 bg-crimson-500 text-white shadow-crimson"
          : "border-ink-200 bg-white text-ink-700 hover:border-crimson-300",
      )}
    >
      {children}
    </button>
  );
}

export default ShopsExplorer;
