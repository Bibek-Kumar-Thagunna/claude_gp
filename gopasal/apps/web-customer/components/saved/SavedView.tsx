"use client";

import * as React from "react";
import Link from "next/link";
import { Heart, PackageSearch, Store as StoreIcon, Trash2 } from "lucide-react";
import { ProductCard } from "@/components/ProductCard";
import { ShopCard } from "@/components/ShopCard";
import { Button, Container } from "@/components/primitives";
import { useAuth, useSaved } from "@/components/providers";
import { customerApi, type SavedProduct, type SavedShop } from "@/lib/api/customer";

export function SavedView() {
  const auth = useAuth();
  const saved = useSaved();
  const [shops, setShops] = React.useState<SavedShop[]>([]);
  const [products, setProducts] = React.useState<SavedProduct[]>([]);
  const [shopPages, setShopPages] = React.useState(1);
  const [productPages, setProductPages] = React.useState(1);
  const [shopPage, setShopPage] = React.useState(1);
  const [productPage, setProductPage] = React.useState(1);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [shopResult, productResult] = await Promise.all([
        customerApi.savedShops(),
        customerApi.savedProducts(),
      ]);
      setShops(shopResult.data);
      setProducts(productResult.data);
      setShopPages(shopResult.meta.totalPages);
      setProductPages(productResult.meta.totalPages);
      setShopPage(1);
      setProductPage(1);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load saved items");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (auth.status === "authenticated") void load();
    else if (auth.status === "anonymous") setLoading(false);
  }, [auth.status, load]);

  React.useEffect(() => {
    const changed = (event: Event) => {
      const detail = (
        event as CustomEvent<{ kind: "shop" | "product"; id: string; saved: boolean }>
      ).detail;
      if (!detail || detail.saved) return;
      if (detail.kind === "shop")
        setShops((rows) => rows.filter((row) => row.store.id !== detail.id));
      else setProducts((rows) => rows.filter((row) => row.product.id !== detail.id));
    };
    window.addEventListener("gopasal:saved-changed", changed);
    return () => window.removeEventListener("gopasal:saved-changed", changed);
  }, []);

  const loadMoreShops = async () => {
    const next = shopPage + 1;
    setLoadingMore(true);
    try {
      const result = await customerApi.savedShops(next);
      setShops((current) => [...current, ...result.data]);
      setShopPage(next);
    } finally {
      setLoadingMore(false);
    }
  };
  const loadMoreProducts = async () => {
    const next = productPage + 1;
    setLoadingMore(true);
    try {
      const result = await customerApi.savedProducts(next);
      setProducts((current) => [...current, ...result.data]);
      setProductPage(next);
    } finally {
      setLoadingMore(false);
    }
  };

  if (auth.status === "loading" || loading) {
    return <Container className="py-16 text-ink-500">Loading your saved items…</Container>;
  }
  if (auth.status !== "authenticated") {
    return (
      <Container className="py-16 text-center">
        <Heart className="mx-auto h-11 w-11 text-crimson-500" />
        <h1 className="mt-4 text-3xl font-extrabold text-ink-900">Keep favourites close</h1>
        <p className="mx-auto mt-2 max-w-md text-ink-600">
          Sign in to save shops and products, then find them on any device.
        </p>
        <Button href="/login?next=/saved" className="mt-6">
          Sign in to view saved items
        </Button>
      </Container>
    );
  }

  return (
    <main className="min-h-[70vh] bg-gradient-to-b from-paper/60 to-white py-8 sm:py-12">
      <Container>
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-crimson-50 text-crimson-600">
            <Heart className="h-6 w-6 fill-current" />
          </span>
          <div>
            <h1 className="text-3xl font-extrabold text-ink-900">Saved for later</h1>
            <p className="mt-1 text-sm text-ink-600">
              Your shortlist stays with your account. Prices, stock and delivery availability may
              change.
            </p>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-6 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700"
          >
            {error}{" "}
            <button type="button" onClick={() => void load()} className="font-bold underline">
              Retry
            </button>
          </div>
        )}

        <section className="mt-10">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 text-2xl font-bold text-ink-900">
                <StoreIcon className="h-5 w-5 text-crimson-500" /> Shops
              </h2>
              <p className="mt-1 text-sm text-ink-500">
                Open a shop to browse its current catalogue.
              </p>
            </div>
            <span className="text-sm font-semibold text-ink-500">{shops.length} saved</span>
          </div>
          {shops.length === 0 ? (
            <EmptyState
              icon={StoreIcon}
              title="No saved shops yet"
              href="/shops"
              action="Explore nearby shops"
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {shops.map((item) =>
                item.available ? (
                  <ShopCard key={item.id} store={item.store} />
                ) : (
                  <article
                    key={item.id}
                    className="rounded-2xl border border-ink-200 bg-white p-5 shadow-soft"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-4xl" aria-hidden>
                        {item.store.emoji}
                      </span>
                      <span className="rounded-full bg-ink-100 px-2.5 py-1 text-xs font-bold text-ink-600">
                        Unavailable
                      </span>
                    </div>
                    <h3 className="mt-4 text-lg font-bold text-ink-900">{item.store.name}</h3>
                    <p className="mt-1 text-sm text-ink-500">
                      This shop is not accepting discoverable orders right now.
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        void saved
                          .toggleShop(item.store.id)
                          .then(() => setShops((rows) => rows.filter((row) => row.id !== item.id)))
                          .catch(() => undefined)
                      }
                      className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-crimson-600"
                    >
                      <Trash2 className="h-4 w-4" /> Remove
                    </button>
                  </article>
                ),
              )}
            </div>
          )}
          {shopPage < shopPages && (
            <Button
              variant="outline"
              disabled={loadingMore}
              onClick={() => void loadMoreShops()}
              className="mt-5"
            >
              Load more shops
            </Button>
          )}
        </section>

        <section className="mt-12">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 text-2xl font-bold text-ink-900">
                <PackageSearch className="h-5 w-5 text-crimson-500" /> Products
              </h2>
              <p className="mt-1 text-sm text-ink-500">
                Quantities and prices are checked again before checkout.
              </p>
            </div>
            <span className="text-sm font-semibold text-ink-500">{products.length} saved</span>
          </div>
          {products.length === 0 ? (
            <EmptyState
              icon={PackageSearch}
              title="No saved products yet"
              href="/shops"
              action="Browse products nearby"
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
              {products.map((item) => (
                <div key={item.id}>
                  <ProductCard
                    product={item.product}
                    store={item.store}
                    unavailableReason={item.available ? undefined : "Currently unavailable"}
                  />
                  <Link
                    href={`/store/${item.store.slug}`}
                    className="mt-2 block truncate px-1 text-xs font-semibold text-ink-500 hover:text-crimson-600"
                  >
                    From {item.store.name}
                  </Link>
                </div>
              ))}
            </div>
          )}
          {productPage < productPages && (
            <Button
              variant="outline"
              disabled={loadingMore}
              onClick={() => void loadMoreProducts()}
              className="mt-5"
            >
              Load more products
            </Button>
          )}
        </section>
      </Container>
    </main>
  );
}

function EmptyState({
  icon: Icon,
  title,
  href,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  href: string;
  action: string;
}) {
  return (
    <div className="rounded-3xl border border-dashed border-ink-200 bg-white p-8 text-center sm:p-10">
      <Icon className="mx-auto h-9 w-9 text-ink-300" />
      <h3 className="mt-3 text-lg font-bold text-ink-900">{title}</h3>
      <Link
        href={href}
        className="mt-4 inline-flex rounded-full bg-crimson-500 px-5 py-2.5 text-sm font-bold text-white shadow-crimson"
      >
        {action}
      </Link>
    </div>
  );
}
