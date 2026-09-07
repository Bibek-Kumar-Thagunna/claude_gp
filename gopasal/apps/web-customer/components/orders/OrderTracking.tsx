"use client";

/**
 * Order tracking — the screen the customer actually watches.
 *
 * The live map is the centrepiece for an order that is out for delivery, fed by
 * `useOrderTracking` (socket → polling → sample movement). Everything on this
 * page states facts: which stage the order is at, who is bringing it, how much
 * route is left. There is no estimated arrival time anywhere, because GoPasal
 * does not make delivery-time promises on a shopkeeper's behalf.
 */

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Bike,
  CheckCircle2,
  Circle,
  Footprints,
  HelpCircle,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  Receipt,
  ShieldCheck,
  Store,
  Truck,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { rs, stampNp, timeNp } from "@/lib/format";
import { humanDistance } from "@/lib/geo";
import { useOrderTracking } from "@/lib/useOrderTracking";
import { STAGES, stageIndex, type TrackedOrder } from "@/lib/tracking";
import { Badge } from "@/components/primitives";
import { LiveRiderMap } from "./LiveRiderMap";

const STAGE_ICONS = [Receipt, CheckCircle2, Package, Truck, MapPin] as const;

/** What each stage actually means. Facts about the shop's progress, not timings. */
const STAGE_NOTE = [
  "The shop has your list and is checking it now.",
  "The shop confirmed it can fulfil everything you asked for.",
  "Your items are bagged and waiting for the runner to pick up.",
  "Follow the map above — the runner is moving towards your address.",
  "Handed over at your door. Thank you for shopping local.",
] as const;

const VEHICLE_LABEL: Record<NonNullable<TrackedOrder["runner"]>["vehicle"], string> = {
  BICYCLE: "on a bicycle",
  MOTORBIKE: "on a motorbike",
  SCOOTER: "on a scooter",
  WALK: "on foot",
};

const PAYMENT_LABEL: Record<TrackedOrder["payment"], string> = {
  COD: "Cash on delivery",
  ESEWA: "Paid with eSewa",
  KHALTI: "Paid with Khalti",
};

function statusTone(status: TrackedOrder["status"]): {
  tone: "crimson" | "green" | "marigold" | "ink";
  label: string;
} {
  if (status === "OUT_FOR_DELIVERY") return { tone: "marigold", label: "On the way to you" };
  if (status === "DELIVERED") return { tone: "green", label: "Delivered" };
  if (status === "CANCELLED" || status === "REJECTED") return { tone: "ink", label: "Closed" };
  return { tone: "crimson", label: "With the shop" };
}

export function OrderTracking({ order: initial }: { order: TrackedOrder }) {
  const { order, rider, source, connected, metersRemaining } = useOrderTracking(initial);
  const current = stageIndex(order.status);
  const live = order.status === "OUT_FOR_DELIVERY";
  const closed = order.status === "CANCELLED" || order.status === "REJECTED";
  const badge = statusTone(order.status);

  return (
    <div className="gp-container py-8 md:py-10">
      <Link
        href="/orders"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-600 transition hover:text-crimson-600"
      >
        <ArrowLeft className="h-4 w-4" /> All orders
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-ink-500">Order #{order.code}</p>
          <h1 className="mt-0.5 font-display text-2xl font-bold text-ink-900 md:text-3xl">
            {order.storeName}
          </h1>
          <p className="mt-1 font-deva text-sm text-ink-600">
            {order.storeNp} · <span className="font-body">{order.storeArea}</span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge tone={badge.tone} className="px-3 py-1.5 text-sm">
            {live ? <Truck className="h-4 w-4" /> : null}
            {badge.label}
          </Badge>
          <p className="text-xs text-ink-500">Placed {stampNp(order.placedAt)}</p>
        </div>
      </div>

      <div className="mt-7 grid gap-6 lg:grid-cols-[1.6fr_1fr] lg:gap-8">
        <div className="space-y-6">
          {closed ? (
            <section className="rounded-3xl border border-ink-100 bg-white p-6 shadow-card">
              <h2 className="font-display text-lg font-bold text-ink-900">This order is closed</h2>
              <p className="mt-1 text-sm text-ink-600">
                Nothing is on its way, so there is no map to show. The items and charges are listed
                beside this, and support can still look it up by the order number.
              </p>
            </section>
          ) : (
            <section aria-labelledby="track-map-h" className="rounded-3xl border border-ink-100 bg-white p-2 shadow-card">
              <h2 id="track-map-h" className="sr-only">
                Live delivery map
              </h2>
              <LiveRiderMap
                origin={order.origin}
                destination={order.destination}
                rider={rider}
                route={order.route}
                metersRemaining={metersRemaining}
                source={source}
                vehicle={order.runner?.vehicle}
                height={430}
                className="w-full"
              />
              <div className="flex flex-wrap items-center justify-between gap-3 px-3 pb-1 pt-3">
                <ul className="flex flex-wrap items-center gap-4 text-xs text-ink-600">
                  <li className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-ink-900" /> Shop
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-crimson-500" /> Runner
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#0B7E58]" /> Your address
                  </li>
                </ul>
                <p className="text-xs text-ink-500">
                  {connected
                    ? "Connected to live updates"
                    : source === "poll"
                      ? "Refreshing every few seconds"
                      : "Sample movement until the API is connected"}
                </p>
              </div>
            </section>
          )}

          {order.runner && !closed ? (
            <section className="rounded-3xl border border-ink-100 bg-white p-5 shadow-card">
              <div className="flex flex-wrap items-center gap-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-crimson-50 text-crimson-600">
                  {order.runner.vehicle === "WALK" ? (
                    <Footprints className="h-6 w-6" />
                  ) : (
                    <Bike className="h-6 w-6" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink-900">
                    {order.runner.name}{" "}
                    <span className="font-normal text-ink-500">
                      {VEHICLE_LABEL[order.runner.vehicle]}
                    </span>
                  </p>
                  <p className="text-sm text-ink-600">
                    {order.runner.isOwner
                      ? "The shopkeeper is bringing this over themselves."
                      : `Delivering for ${order.storeName}.`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={`tel:${order.runner.phone}`}
                    className="gp-btn border border-ink-200 bg-white px-4 py-2 text-sm text-ink-800 hover:bg-ink-50"
                  >
                    <Phone className="h-4 w-4" /> Call runner
                  </a>
                  <a
                    href={`sms:${order.runner.phone}`}
                    className="gp-btn border border-ink-200 bg-white px-4 py-2 text-sm text-ink-800 hover:bg-ink-50"
                  >
                    <MessageCircle className="h-4 w-4" /> Message
                  </a>
                </div>
              </div>
              <p className="mt-4 rounded-2xl bg-paper px-4 py-3 text-xs text-ink-600">
                The runner&apos;s number works only while this order is open, and their location is
                shared with you only until it is delivered.
              </p>
            </section>
          ) : null}

          <section className="rounded-3xl border border-ink-100 bg-white p-6 shadow-card">
            <h2 className="font-display text-lg font-bold text-ink-900">Progress</h2>
            <ol className="mt-6">
              {STAGES.map((stage, i) => {
                const done = !closed && i <= current;
                const active = !closed && i === current;
                const Icon = done ? STAGE_ICONS[i]! : Circle;
                const last = i === STAGES.length - 1;
                return (
                  <li key={stage.status} className={cn("relative flex gap-4", last ? "pb-0" : "pb-7")}>
                    {!last ? (
                      <span
                        aria-hidden
                        className={cn(
                          "absolute left-[19px] top-10 h-[calc(100%-2.5rem)] w-0.5",
                          i < current && !closed ? "bg-crimson-500" : "bg-ink-100",
                        )}
                      />
                    ) : null}
                    <motion.span
                      initial={false}
                      animate={active ? { scale: [1, 1.1, 1] } : { scale: 1 }}
                      transition={{ repeat: active ? Infinity : 0, duration: 1.9 }}
                      className={cn(
                        "relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full",
                        done ? "bg-crimson-500 text-white" : "bg-ink-100 text-ink-400",
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </motion.span>
                    <div className="pt-1">
                      <p className={cn("font-semibold", done ? "text-ink-900" : "text-ink-400")}>
                        {stage.label}{" "}
                        <span className="font-deva text-sm font-normal text-ink-500">
                          · {stage.np}
                        </span>
                      </p>
                      {active ? (
                        <p className="mt-0.5 text-sm text-ink-600">{STAGE_NOTE[i]}</p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
            <p className="mt-5 rounded-2xl bg-paper px-4 py-3 text-xs text-ink-600">
              GoPasal shows you where your order is, never a countdown. Small shops deliver around
              their own day, and we would rather be honest than fast on paper.
            </p>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-3xl border border-ink-100 bg-white p-5 shadow-card">
            <h2 className="font-display text-lg font-bold text-ink-900">Delivering to</h2>
            <div className="mt-3 flex gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#EAF7EF] text-[#0B7E58]">
                <MapPin className="h-4 w-4" />
              </span>
              <p className="text-sm text-ink-700">{order.destinationLabel}</p>
            </div>
            {order.note ? (
              <p className="mt-3 rounded-2xl bg-paper px-4 py-3 text-xs text-ink-600">
                <span className="font-semibold text-ink-800">Your note: </span>
                {order.note}
              </p>
            ) : null}
            <div className="mt-4 flex gap-3 border-t border-ink-100 pt-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink-50 text-ink-700">
                <Store className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/store/${order.storeSlug}`}
                  className="text-sm font-semibold text-ink-900 hover:text-crimson-600"
                >
                  {order.storeName}
                </Link>
                <p className="text-xs text-ink-500">{order.storeArea}</p>
              </div>
              <a
                href={`tel:${order.storePhone}`}
                className="gp-btn shrink-0 border border-ink-200 bg-white px-3 py-1.5 text-xs text-ink-800 hover:bg-ink-50"
              >
                <Phone className="h-3.5 w-3.5" /> Call shop
              </a>
            </div>
          </section>

          <section className="rounded-3xl border border-ink-100 bg-white p-5 shadow-card">
            <h2 className="font-display text-lg font-bold text-ink-900">
              {order.emoji} What&apos;s in this order
            </h2>
            <ul className="mt-4 space-y-3">
              {order.lines.map((l) => (
                <li key={l.name} className="flex items-start justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium text-ink-900">{l.name}</span>
                    <span className="block text-xs text-ink-500">
                      {l.qty} × {rs(l.price)}
                      {l.unit ? ` · ${l.unit}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold text-ink-900">{rs(l.qty * l.price)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-5 space-y-2 border-t border-ink-100 pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-600">Items</dt>
                <dd className="font-medium text-ink-900">{rs(order.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-600">Delivery by the shop</dt>
                <dd className="font-medium text-ink-900">
                  {order.deliveryFee === 0 ? "Free" : rs(order.deliveryFee)}
                </dd>
              </div>
              {order.discount > 0 ? (
                <div className="flex justify-between">
                  <dt className="text-ink-600">Discount</dt>
                  <dd className="font-medium text-[#0B7E58]">− {rs(order.discount)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between border-t border-ink-100 pt-3">
                <dt className="font-display font-bold text-ink-900">Total</dt>
                <dd className="font-display text-lg font-bold text-ink-900">{rs(order.total)}</dd>
              </div>
            </dl>
            <p className="mt-4 flex items-center gap-2 rounded-2xl bg-paper px-4 py-3 text-xs text-ink-700">
              <Wallet className="h-4 w-4 shrink-0 text-crimson-600" />
              {PAYMENT_LABEL[order.payment]}
              {order.payment === "COD" ? " — please have the amount ready." : ""}
            </p>
          </section>

          {rider && !closed ? (
            <section className="rounded-3xl border border-crimson-100 bg-crimson-50/60 p-5">
              <h2 className="font-display text-base font-bold text-ink-900">Live snapshot</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-600">Route left</dt>
                  <dd className="font-semibold text-ink-900">
                    {metersRemaining != null ? humanDistance(metersRemaining) : "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-600">Position updated</dt>
                  <dd className="font-semibold text-ink-900">{timeNp(rider.at)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-600">Feed</dt>
                  <dd className="font-semibold text-ink-900">
                    {source === "socket" ? "Live socket" : source === "poll" ? "Polling" : "Sample"}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-ink-600">
                We show distance, not a countdown. If the dot stops moving for a while the runner is
                probably parked or out of signal — call them if you need to.
              </p>
            </section>
          ) : null}

          <section className="rounded-3xl border border-ink-100 bg-white p-5 shadow-card">
            <h2 className="font-display text-base font-bold text-ink-900">Need a hand?</h2>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link
                  href="/support"
                  className="flex items-center gap-2 text-ink-700 hover:text-crimson-600"
                >
                  <HelpCircle className="h-4 w-4" /> Raise an issue with this order
                </Link>
              </li>
              <li>
                <Link
                  href="/legal/delivery"
                  className="flex items-center gap-2 text-ink-700 hover:text-crimson-600"
                >
                  <ShieldCheck className="h-4 w-4" /> How delivery works on GoPasal
                </Link>
              </li>
              <li>
                <Link
                  href="/legal/refund"
                  className="flex items-center gap-2 text-ink-700 hover:text-crimson-600"
                >
                  <Receipt className="h-4 w-4" /> Returns and refunds
                </Link>
              </li>
            </ul>
            <p className="mt-4 text-xs text-ink-500">
              Quote order #{order.code} when you contact support.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

export default OrderTracking;
