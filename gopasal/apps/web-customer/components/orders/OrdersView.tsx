"use client";

/**
 * Orders list.
 *
 * Anything currently out for delivery gets a small live map right here, so the
 * customer sees the runner moving without opening the order first. Everything
 * else gets its stage in words. No card anywhere claims an arrival time.
 */

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowRight,
  Bike,
  CheckCircle2,
  ChevronRight,
  Package,
  PackageOpen,
  Receipt,
  RotateCcw,
  Store,
  Truck,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { rs, stampNp } from "@/lib/format";
import { humanDistance } from "@/lib/geo";
import { isPastOrder, orderView } from "@/lib/orders";
import { customerApi } from "@/lib/api/customer";
import { useAuth } from "@/components/providers";
import { STAGES, stageIndex, type TrackedOrder } from "@/lib/tracking";
import { useOrderTracking } from "@/lib/useOrderTracking";
import { Badge, Button } from "@/components/primitives";

const LiveRiderMap = dynamic(
  () => import("./LiveRiderMap").then((module) => module.LiveRiderMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-[300px] animate-pulse rounded-3xl border border-ink-100 bg-ink-50" />
    ),
  },
);

function ActiveOrderCard({ order: initial }: { order: TrackedOrder }) {
  const { order, rider, source, metersRemaining } = useOrderTracking(initial);
  const live = order.status === "OUT_FOR_DELIVERY";
  const mapPins =
    order.origin && order.destination
      ? { origin: order.origin, destination: order.destination }
      : null;
  const idx = stageIndex(order.status);

  return (
    <article className="overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-card">
      <div className={cn("grid", live && mapPins && "lg:grid-cols-[1fr_1.1fr]")}>
        <div className="p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-ink-500">
                #{order.code} · {stampNp(order.placedAt)}
              </p>
              <h3 className="mt-1 font-display text-xl font-bold text-ink-900">
                {order.emoji} {order.storeName}
              </h3>
              <p className="font-deva text-sm text-ink-500">{order.storeNp}</p>
            </div>
            <Badge tone={live ? "marigold" : "crimson"}>
              {live ? <Truck className="h-3.5 w-3.5" /> : <Package className="h-3.5 w-3.5" />}
              {STAGES[idx]!.label}
            </Badge>
          </div>

          {/* five dots, one per stage — position without a promise */}
          <div className="mt-5 flex items-center gap-1.5" aria-hidden>
            {STAGES.map((s, i) => (
              <span
                key={s.status}
                className={cn(
                  "h-1.5 flex-1 rounded-full",
                  i <= idx ? "bg-crimson-500" : "bg-ink-100",
                )}
              />
            ))}
          </div>
          <p className="mt-2 text-sm text-ink-600">
            {live && metersRemaining != null
              ? order.routeDegraded
                ? `About ${humanDistance(metersRemaining)} away in a straight line.`
                : `About ${humanDistance(metersRemaining)} of route left to your door.`
              : "The shop is getting your order ready."}
          </p>

          {order.runner ? (
            <p className="mt-4 flex items-center gap-2 text-sm text-ink-700">
              <Bike className="h-4 w-4 shrink-0 text-crimson-600" />
              <span>
                <span className="font-semibold">{order.runner.name}</span>
                {order.runner.isOwner ? " (the shopkeeper)" : ""} is bringing it.
              </span>
            </p>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-4">
            <p className="text-sm text-ink-600">
              {order.lines.length} item{order.lines.length === 1 ? "" : "s"} ·{" "}
              <span className="font-display text-base font-bold text-ink-900">
                {rs(order.total)}
              </span>
            </p>
            <Link href={`/orders/${order.id}`} className="gp-btn gp-btn-primary px-4 py-2 text-sm">
              {live ? "Track on the map" : "View order"} <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {live && mapPins ? (
          <div className="p-2 lg:py-3 lg:pr-3">
            <LiveRiderMap
              origin={mapPins.origin}
              destination={mapPins.destination}
              rider={rider}
              route={order.route}
              metersRemaining={metersRemaining}
              source={source}
              vehicle={order.runner?.vehicle}
              height={300}
              className="w-full"
            />
          </div>
        ) : live ? (
          <div className="m-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-ink-700">
            Live map unavailable because this order is missing a verified shop or delivery pin.
          </div>
        ) : null}
      </div>
    </article>
  );
}

function PastOrderRow({ order }: { order: TrackedOrder }) {
  const delivered = order.status === "DELIVERED";
  return (
    <li className="flex flex-wrap items-center gap-4 rounded-2xl border border-ink-100 bg-white p-4">
      <span
        className={cn(
          "grid h-11 w-11 shrink-0 place-items-center rounded-xl text-xl",
          delivered ? "bg-[#EAF7EF]" : "bg-ink-50",
        )}
      >
        {order.emoji}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-ink-900">{order.storeName}</p>
        <p className="text-xs text-ink-500">
          #{order.code} · {stampNp(order.placedAt)} · {rs(order.total)}
        </p>
      </div>
      <span
        className={cn(
          "inline-flex items-center gap-1 text-xs font-semibold",
          delivered ? "text-[#0B7E58]" : "text-ink-500",
        )}
      >
        {delivered ? <CheckCircle2 className="h-4 w-4" /> : <Receipt className="h-4 w-4" />}
        {delivered ? "Delivered" : "Closed"}
      </span>
      <div className="flex gap-2">
        <Link
          href={`/store/${order.storeSlug}`}
          className="gp-btn border border-ink-200 bg-white px-3 py-1.5 text-xs text-ink-800 hover:bg-ink-50"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Order again
        </Link>
        <Link
          href={`/orders/${order.id}`}
          className="gp-btn border border-ink-200 bg-white px-3 py-1.5 text-xs text-ink-800 hover:bg-ink-50"
        >
          <Store className="h-3.5 w-3.5" /> Details
        </Link>
      </div>
    </li>
  );
}

export function OrdersView() {
  const auth = useAuth();
  const [orders, setOrders] = React.useState<TrackedOrder[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (auth.status === "anonymous") {
      setLoading(false);
      return;
    }
    if (auth.status !== "authenticated") return;
    void customerApi
      .orders()
      .then((rows) => {
        setOrders(rows.map(orderView));
        setError(null);
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : "Could not load orders"),
      )
      .finally(() => setLoading(false));
  }, [auth.status]);
  const active = orders.filter((order) => !isPastOrder(order));
  const past = orders.filter(isPastOrder);

  if (auth.status === "anonymous")
    return (
      <div className="gp-container py-16 text-center">
        <h1 className="text-2xl font-bold">Sign in to view your orders</h1>
        <Button href="/login?next=/orders" className="mt-5">
          Sign in
        </Button>
      </div>
    );
  if (loading)
    return <div className="gp-container py-16 text-ink-500">Loading persisted orders…</div>;

  return (
    <div className="gp-container py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink-900">Your orders</h1>
          <p className="mt-1 text-ink-600">
            Follow what is on its way and reorder from shops you already trust.
          </p>
        </div>
        <Button href="/shops" variant="outline" size="sm">
          Browse shops <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      {error && (
        <p className="mt-6 rounded-xl bg-crimson-50 p-4 text-sm text-crimson-700">{error}</p>
      )}

      {active.length > 0 ? (
        <section className="mt-8" aria-labelledby="orders-active">
          <h2 id="orders-active" className="mb-4 font-display text-lg font-bold text-ink-900">
            In progress
          </h2>
          <div className="space-y-5">
            {active.map((o) => (
              <ActiveOrderCard key={o.id} order={o} />
            ))}
          </div>
        </section>
      ) : (
        <section className="mt-8 rounded-3xl border border-dashed border-ink-200 bg-white p-10 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-crimson-50 text-crimson-600">
            <PackageOpen className="h-7 w-7" />
          </span>
          <h2 className="mt-4 font-display text-xl font-bold text-ink-900">
            Nothing on the way right now
          </h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-600">
            When a shop near you is packing an order, this is where you will watch it move.
          </p>
          <Button href="/shops" className="mt-5">
            Find a shop nearby
          </Button>
        </section>
      )}

      {past.length > 0 ? (
        <section className="mt-10" aria-labelledby="orders-past">
          <h2 id="orders-past" className="mb-4 font-display text-lg font-bold text-ink-900">
            Earlier orders
          </h2>
          <ul className="space-y-3">
            {past.map((o) => (
              <PastOrderRow key={o.id} order={o} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export default OrdersView;
