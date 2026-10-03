"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Search,
  ShoppingCart,
  MessageCircle,
  PackageCheck,
  Store as StoreIcon,
  Smartphone,
  ShieldCheck,
  MapPin,
} from "lucide-react";
import { Hero } from "@/components/Hero";
import { CategoryStrip } from "@/components/CategoryStrip";
import { ShopCard } from "@/components/ShopCard";
import { ProductCard } from "@/components/ProductCard";
import { useDeliveryLocation } from "@/components/location/LocationProvider";
import { Reveal } from "@/components/Reveal";
import { Button } from "@/components/primitives";
import { discoveryHome, listShops, type DiscoveryHome } from "@/lib/api/customer";
import type { Store } from "@/lib/data";
import { useLang } from "@/components/providers";
import { t } from "@/lib/i18n";

function SectionHead({ title, href, cta }: { title: string; href?: string; cta?: string }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <h2 className="text-3xl font-bold text-ink-900 md:text-4xl">{title}</h2>
      {href && cta && (
        <Link
          href={href}
          className="inline-flex items-center gap-1 text-sm font-semibold text-crimson-600 hover:gap-2 transition-all"
        >
          {cta} <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}

const STEPS = [
  {
    icon: Search,
    title: "Find a shop near you",
    body: "Browse active neighbourhood shops, then check each shop's delivery area before ordering.",
  },
  {
    icon: ShoppingCart,
    title: "Order what you need",
    body: "Add items to your cart from a single shop and place your order. Cash on delivery is always available.",
  },
  {
    icon: MessageCircle,
    title: "Contact the shopkeeper",
    body: "Use the shop's published contact number when you need to confirm stock, coverage or timing.",
  },
  {
    icon: PackageCheck,
    title: "Receive & pay",
    body: "The shop delivers within its own area. Confirm delivery and pay — simple and transparent.",
  },
];

export function HomeContent() {
  const { lang } = useLang();
  const deliveryLocation = useDeliveryLocation();
  const [shops, setShops] = React.useState<Store[]>([]);
  const [discovery, setDiscovery] = React.useState<DiscoveryHome | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [catalogError, setCatalogError] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!deliveryLocation.ready) return;
    const controller = new AbortController();
    setLoading(true);
    const request = deliveryLocation.location
      ? discoveryHome(deliveryLocation.location, controller.signal)
      : listShops(undefined, controller.signal);
    void request
      .then((result) => {
        if (Array.isArray(result)) {
          setShops(result);
          setDiscovery(null);
        } else {
          setDiscovery(result);
          setShops(result.shops);
        }
        setCatalogError(null);
      })
      .catch((cause: unknown) => {
        if (!(cause instanceof DOMException && cause.name === "AbortError")) {
          setCatalogError(cause instanceof Error ? cause.message : "Could not load shops");
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [deliveryLocation.location, deliveryLocation.ready]);

  return (
    <>
      <Hero />

      {/* Categories */}
      <section className="gp-container py-10 md:py-14">
        <Reveal>
          <h2 className="mb-6 text-2xl font-bold text-ink-900 md:text-3xl">
            {t("browseCategories", lang)}
          </h2>
        </Reveal>
        <CategoryStrip />
      </section>

      {!deliveryLocation.location && deliveryLocation.ready && (
        <section className="gp-container pb-4">
          <button
            type="button"
            onClick={deliveryLocation.openPicker}
            className="flex w-full items-center gap-4 rounded-3xl border border-crimson-100 bg-gradient-to-r from-crimson-50 to-white p-5 text-left transition hover:border-crimson-300 hover:shadow-soft"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-crimson-500 text-white shadow-crimson">
              <MapPin className="h-6 w-6" />
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block text-lg text-ink-900">What should deliver to you?</strong>
              <span className="mt-1 block text-sm text-ink-600">
                Choose a delivery location to see only serviceable shops, accurate distance and
                category-wise products.
              </span>
            </span>
            <span className="hidden items-center gap-1 font-bold text-crimson-700 sm:inline-flex">
              Choose location <ArrowRight className="h-4 w-4" />
            </span>
          </button>
        </section>
      )}

      {/* Shops near you */}
      <section className="gp-container py-6 md:py-10">
        <Reveal>
          <SectionHead
            title={
              deliveryLocation.location
                ? `Delivering to ${deliveryLocation.location.label}`
                : t("shopsNearYou", lang)
            }
            href="/shops"
            cta="See all shops"
          />
        </Reveal>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shops.map((store, i) => (
            <Reveal key={store.slug} delay={i}>
              <ShopCard store={store} />
            </Reveal>
          ))}
        </div>
        {catalogError && (
          <p className="mt-5 rounded-xl bg-crimson-50 p-4 text-sm text-crimson-700">
            {catalogError}
          </p>
        )}
        {!catalogError && loading && (
          <p className="text-sm text-ink-500">Finding serviceable shops…</p>
        )}
        {!catalogError && !loading && shops.length === 0 && (
          <div className="rounded-2xl border border-ink-100 bg-white p-6 text-center">
            <p className="font-semibold text-ink-900">No shops deliver to this location yet.</p>
            <button
              type="button"
              onClick={deliveryLocation.openPicker}
              className="mt-2 text-sm font-bold text-crimson-600 hover:underline"
            >
              Try another location
            </button>
          </div>
        )}
      </section>

      {discovery?.shelves.map((shelf) => (
        <section key={shelf.category.id} className="gp-container py-7 md:py-10">
          <SectionHead
            title={lang === "np" ? shelf.category.np : shelf.category.en}
            href={`/category/${shelf.category.slug}`}
            cta="See all"
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
            {shelf.products.map(({ product, store }) => (
              <ProductCard key={product.id} product={product} store={store} />
            ))}
          </div>
        </section>
      ))}

      {/* How it works */}
      <section className="relative mt-8 overflow-hidden bg-white py-16 md:py-20">
        <div className="gp-dot-grid pointer-events-none absolute inset-0 opacity-40" />
        <div className="gp-container relative">
          <Reveal>
            <div className="mx-auto mb-12 max-w-2xl text-center">
              <h2 className="text-3xl font-bold text-ink-900 md:text-4xl">
                {t("howItWorks", lang)}
              </h2>
              <p className="mt-3 text-ink-600">
                Buy from the shops you already trust — with the convenience of ordering online and
                paying on delivery.
              </p>
            </div>
          </Reveal>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <Reveal key={s.title} delay={i}>
                <div className="relative h-full rounded-2xl border border-ink-100 bg-paper p-6">
                  <span className="absolute right-5 top-5 font-display text-4xl font-extrabold text-crimson-100">
                    {i + 1}
                  </span>
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-crimson-50 text-crimson-600">
                    <s.icon className="h-6 w-6" />
                  </span>
                  <h3 className="mt-4 text-lg font-bold text-ink-900">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-600">{s.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Trust / no-fast-delivery framing */}
      <section className="gp-container py-14">
        <Reveal>
          <div className="grid gap-4 rounded-3xl border border-ink-100 bg-white p-6 sm:grid-cols-3 md:p-8">
            {[
              {
                icon: ShieldCheck,
                ttl: "Verified neighbourhood shops",
                body: "Every seller is reviewed before going live.",
              },
              {
                icon: MessageCircle,
                ttl: "Talk to the shopkeeper",
                body: "Reach the owner or their staff directly — no middleman.",
              },
              {
                icon: PackageCheck,
                ttl: "Delivered by the shop",
                body: "Each shop delivers in its own area, on its own schedule.",
              },
            ].map((f) => (
              <div key={f.ttl} className="flex gap-3">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-crimson-50 text-crimson-600">
                  <f.icon className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-bold text-ink-900">{f.ttl}</h3>
                  <p className="mt-1 text-sm text-ink-600">{f.body}</p>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* Sell + App CTAs */}
      <section className="gp-container grid gap-6 py-6 pb-16 lg:grid-cols-2">
        <Reveal>
          <div className="relative flex h-full flex-col justify-between overflow-hidden rounded-3xl bg-gradient-to-br from-crimson-500 to-crimson-700 p-8 text-white shadow-crimson">
            <div className="gp-dot-grid absolute inset-0 opacity-20" />
            <div className="relative">
              <StoreIcon className="h-8 w-8" />
              <h3 className="mt-4 text-2xl font-bold md:text-3xl">Run a shop? Sell on GoPasal.</h3>
              <p className="mt-2 max-w-sm text-white/85">
                List your products, manage orders and your own staff, and deliver to your
                neighbourhood — all from one dashboard.
              </p>
            </div>
            <div className="relative mt-6">
              <Button href="/sell" variant="outline" className="bg-white text-crimson-700">
                {t("becomeSeller", lang)} <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Reveal>

        <Reveal delay={1}>
          <div className="relative flex h-full flex-col justify-between overflow-hidden rounded-3xl border border-ink-100 bg-white p-8">
            <div>
              <Smartphone className="h-8 w-8 text-crimson-600" />
              <h3 className="mt-4 text-2xl font-bold text-ink-900 md:text-3xl">
                Shop on the GoPasal web app
              </h3>
              <p className="mt-2 max-w-sm text-ink-600">
                Browse, order, pay, track deliveries, receive notifications, and contact support in
                this live web experience.
              </p>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button href="/shops" variant="outline">
                Browse live shops <ArrowRight className="h-4 w-4" />
              </Button>
              <span className="self-center text-xs text-ink-500">
                Native mobile apps are not published yet.
              </span>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  );
}

export default HomeContent;
