"use client";

import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin,
  Clock,
  BadgeCheck,
  Truck,
  Wallet,
  MessageCircle,
  Phone,
  X,
  ChevronRight,
} from "lucide-react";
import type { Store } from "@/lib/data";
import { ProductCard } from "@/components/ProductCard";
import { Reveal } from "@/components/Reveal";
import { Rating, Badge, Button } from "@/components/primitives";
import { cn } from "@/lib/cn";

export function StoreView({ store }: { store: Store }) {
  const [contactOpen, setContactOpen] = React.useState(false);

  return (
    <>
      {/* breadcrumb */}
      <div className="gp-container pt-6">
        <nav className="flex items-center gap-1 text-sm text-ink-500">
          <Link href="/" className="hover:text-crimson-600">Home</Link>
          <ChevronRight className="h-4 w-4" />
          <Link href="/shops" className="hover:text-crimson-600">Shops</Link>
          <ChevronRight className="h-4 w-4" />
          <span className="text-ink-800">{store.name}</span>
        </nav>
      </div>

      {/* cover */}
      <div className="gp-container pt-4">
        <div className={cn("relative h-48 overflow-hidden rounded-3xl bg-gradient-to-br md:h-60", store.cover)}>
          <div className="gp-dot-grid absolute inset-0 opacity-30" />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-7xl md:text-8xl">
            {store.emoji}
          </span>
        </div>
      </div>

      {/* header card */}
      <div className="gp-container">
        <div className="relative -mt-10 rounded-3xl border border-ink-100 bg-white p-6 shadow-card md:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl font-extrabold text-ink-900 md:text-3xl">
                  {store.name}
                </h1>
                {store.verified && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-crimson-50 px-2 py-0.5 text-xs font-semibold text-crimson-700">
                    <BadgeCheck className="h-3.5 w-3.5" /> Verified
                  </span>
                )}
              </div>
              <p className="deva mt-0.5 text-ink-500">{store.np}</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-600">
                <Rating value={store.rating} reviews={store.reviews} />
                <span className="flex items-center gap-1">
                  <MapPin className="h-4 w-4 text-crimson-500" /> {store.area} · {store.distanceKm.toFixed(1)} km
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4 text-crimson-500" /> {store.hours}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge tone={store.isOpen ? "green" : "ink"}>{store.isOpen ? "● Open now" : "● Closed"}</Badge>
                <Badge tone="crimson"><Truck className="h-3 w-3" /> Delivered by the shop</Badge>
                <Badge tone="marigold"><Wallet className="h-3 w-3" /> Cash on delivery</Badge>
                {store.minOrder > 0 && <Badge tone="ink">Min. order रु {store.minOrder}</Badge>}
              </div>
            </div>

            <div className="flex shrink-0 gap-3">
              <Button variant="outline" onClick={() => setContactOpen(true)}>
                <MessageCircle className="h-4 w-4" /> Contact shopkeeper
              </Button>
            </div>
          </div>

          {/* delivery-timing honesty note */}
          <p className="mt-5 rounded-xl bg-paper px-4 py-3 text-sm text-ink-600">
            <span className="font-semibold text-ink-800">Delivery is handled by {store.name}.</span>{" "}
            Timing depends on the shop and your area — message the shopkeeper to confirm before you order.
          </p>
        </div>
      </div>

      {/* products */}
      <section className="gp-container py-10">
        <h2 className="mb-6 text-2xl font-bold text-ink-900">Products</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {store.products.map((p, i) => (
            <Reveal key={p.id} delay={i}>
              <ProductCard product={p} store={store} />
            </Reveal>
          ))}
        </div>
      </section>

      {/* contact sheet */}
      <AnimatePresence>
        {contactOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-[90] bg-ink-900/40 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setContactOpen(false)}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              className="fixed inset-x-0 bottom-0 z-[95] mx-auto max-w-lg rounded-t-3xl bg-white p-6 shadow-float sm:inset-x-auto sm:right-6 sm:top-24 sm:bottom-auto sm:rounded-3xl"
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-ink-900">Contact {store.name}</h3>
                <button
                  onClick={() => setContactOpen(false)}
                  aria-label="Close"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-ink-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="mt-1 text-sm text-ink-600">
                Reach the owner or a staff member directly to ask about stock, delivery area or timing.
              </p>
              <div className="mt-5 space-y-3">
                <ContactRow icon={Phone} title="Call the shop" sub="+977 98•• ••• •••" href="tel:+977980000000" />
                <ContactRow icon={MessageCircle} title="Chat on GoPasal" sub="Usually replies during shop hours" href="#" />
              </div>
              <p className="mt-4 text-xs text-ink-400">
                Your phone number stays private — calls and chats are routed through GoPasal.
              </p>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function ContactRow({
  icon: Icon,
  title,
  sub,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  sub: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="flex items-center gap-3 rounded-2xl border border-ink-200 p-4 transition hover:border-crimson-300 hover:bg-crimson-50"
    >
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-crimson-50 text-crimson-600">
        <Icon className="h-5 w-5" />
      </span>
      <span>
        <span className="block font-semibold text-ink-900">{title}</span>
        <span className="block text-sm text-ink-500">{sub}</span>
      </span>
    </a>
  );
}

export default StoreView;
