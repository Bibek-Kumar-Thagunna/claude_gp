"use client";

/**
 * Order tracking — the screen the customer actually watches.
 *
 * The live map is the centrepiece for an order that is out for delivery, fed by
 * `useOrderTracking` (authenticated API polling). Everything on this
 * page states facts: which stage the order is at, who is bringing it, how much
 * route is left. There is no estimated arrival time anywhere, because GoPasal
 * does not make delivery-time promises on a shopkeeper's behalf.
 */

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  AlertTriangle,
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
  Star,
  Truck,
  Wallet,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { rs, stampNp, timeNp } from "@/lib/format";
import { humanDistance } from "@/lib/geo";
import { useOrderTracking } from "@/lib/useOrderTracking";
import { STAGES, stageIndex, type TrackedOrder } from "@/lib/tracking";
import { Badge } from "@/components/primitives";
import { DeliveryProofPhoto } from "./DeliveryProofPhoto";
import { customerApi, type ReviewWire } from "@/lib/api/customer";

const LiveRiderMap = dynamic(
  () => import("./LiveRiderMap").then((module) => module.LiveRiderMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-[420px] animate-pulse rounded-3xl border border-ink-100 bg-ink-50" />
    ),
  },
);

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
  const { order, rider, source, connected, metersRemaining, refresh } = useOrderTracking(initial);
  const current = stageIndex(order.status);
  const deliveryFailed = order.deliveryStatus === "FAILED";
  const returnRequired = deliveryFailed && Boolean(order.pickedUpAt);
  const returning = order.deliveryStatus === "RETURNING_TO_SHOP";
  const returned = order.deliveryStatus === "RETURNED_TO_SHOP";
  const live = order.status === "OUT_FOR_DELIVERY" && order.deliveryStatus === "EN_ROUTE";
  const closed = order.status === "CANCELLED" || order.status === "REJECTED";
  const mapPins =
    order.origin && order.destination
      ? { origin: order.origin, destination: order.destination }
      : null;
  const badge = returning
    ? { tone: "marigold" as const, label: "Returning safely to shop" }
    : returned
      ? { tone: "ink" as const, label: "Returned to shop" }
      : deliveryFailed
        ? {
            tone: "marigold" as const,
            label: returnRequired ? "Return required" : "Delivery needs a reattempt",
          }
        : statusTone(order.status);
  const [review, setReview] = React.useState<ReviewWire | null>(null);
  const [rating, setRating] = React.useState(5);
  const [comment, setComment] = React.useState("");
  const [reviewBusy, setReviewBusy] = React.useState(false);
  const [reviewError, setReviewError] = React.useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [cancelReason, setCancelReason] = React.useState("Plans changed");
  const [cancelBusy, setCancelBusy] = React.useState(false);
  const [cancelError, setCancelError] = React.useState<string | null>(null);
  const canCancel =
    order.status === "PLACED" ||
    order.status === "ACCEPTED" ||
    (order.status === "OUT_FOR_DELIVERY" && returned);

  const exceptionTitle = returned
    ? "Your parcel is back at the shop"
    : returning
      ? "Your parcel is returning safely to the shop"
      : returnRequired
        ? "The delivery could not be completed"
        : deliveryFailed
          ? "The shop can arrange another attempt"
          : null;
  const exceptionDetail = returned
    ? "The shop has confirmed receipt. You may contact the shop about redelivery or cancel now for an automatic stock, coupon and GoCoins reversal. Paid orders enter the refund queue."
    : returning
      ? "The rider is taking the parcel back to the shop. Redelivery or cancellation becomes available after the shop checks and confirms the returned parcel."
      : returnRequired
        ? (order.deliveryFailureReason ??
          "The rider still has the parcel and must return it to the shop before the next step.")
        : deliveryFailed
          ? (order.deliveryFailureReason ??
            "No parcel was handed over. The shop can assign an available rider for another attempt.")
          : null;

  const cancelOrder = async () => {
    if (cancelReason.trim().length < 3) return;
    setCancelBusy(true);
    setCancelError(null);
    try {
      await customerApi.cancelOrder(order.id, cancelReason.trim());
      await refresh();
      setCancelOpen(false);
    } catch (cause) {
      setCancelError(cause instanceof Error ? cause.message : "Could not cancel this order");
    } finally {
      setCancelBusy(false);
    }
  };

  React.useEffect(() => {
    if (order.status !== "DELIVERED") return;
    void customerApi
      .myReviews()
      .then((rows) => setReview(rows.find((row) => row.orderId === order.id) ?? null))
      .catch(() => undefined);
  }, [order.id, order.status]);

  const submitReview = async (event: React.FormEvent) => {
    event.preventDefault();
    setReviewBusy(true);
    setReviewError(null);
    try {
      setReview(
        await customerApi.createReview(order.id, { rating, comment: comment.trim() || undefined }),
      );
    } catch (cause) {
      setReviewError(cause instanceof Error ? cause.message : "Could not submit review");
    } finally {
      setReviewBusy(false);
    }
  };

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
            {live ? (
              <Truck className="h-4 w-4" />
            ) : deliveryFailed || returning || returned ? (
              <HelpCircle className="h-4 w-4" />
            ) : null}
            {badge.label}
          </Badge>
          <p className="text-xs text-ink-500">Placed {stampNp(order.placedAt)}</p>
        </div>
      </div>

      <section
        className={cn(
          "mt-6 overflow-hidden rounded-3xl border shadow-card",
          closed
            ? "border-ink-200 bg-ink-50"
            : live
              ? "border-marigold-200 bg-gradient-to-r from-[#FFF7E5] via-white to-white"
              : "border-crimson-100 bg-gradient-to-r from-crimson-50 via-white to-white",
        )}
      >
        <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center">
          <span
            className={cn(
              "grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-white shadow-sm",
              closed
                ? "bg-ink-600"
                : live
                  ? "bg-marigold-500"
                  : order.status === "DELIVERED"
                    ? "bg-[#0B7E58]"
                    : "bg-crimson-500",
            )}
          >
            {closed ? (
              <Circle className="h-6 w-6" />
            ) : (
              React.createElement(STAGE_ICONS[current]!, { className: "h-6 w-6" })
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-black uppercase tracking-[.16em] text-ink-400">
              Current status · Step {closed ? "—" : current + 1} of {STAGES.length}
            </p>
            <h2 className="mt-1 text-xl font-extrabold text-ink-900">
              {closed
                ? "This order is closed"
                : exceptionTitle
                  ? exceptionTitle
                  : STAGES[current]!.label}
            </h2>
            <p className="mt-1 text-sm leading-6 text-ink-600">
              {closed
                ? (order.closeReason ??
                  "No delivery is active. Support can still look up the order using its reference.")
                : exceptionDetail
                  ? exceptionDetail
                  : STAGE_NOTE[current]}
            </p>
          </div>
          {live && (
            <div className="rounded-2xl border border-marigold-200 bg-white px-4 py-3 text-sm lg:min-w-48">
              <span className="block text-xs font-semibold text-ink-500">
                {order.routeDegraded ? "Direct distance remaining" : "Route remaining"}
              </span>
              <strong className="mt-0.5 block text-lg text-ink-900">
                {metersRemaining != null ? humanDistance(metersRemaining) : "Updating…"}
              </strong>
              <span className="mt-1 flex items-center gap-1.5 text-xs text-[#0B7E58]">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#0B7E58]" />
                {connected ? "Live updates connected" : "Refreshing location"}
              </span>
            </div>
          )}
        </div>
        {!closed && (
          <ol
            className="gp-scroll flex min-w-[620px] overflow-x-auto border-t border-ink-100 bg-white/75 px-5 py-4"
            aria-label="Order journey"
          >
            {STAGES.map((stage, index) => {
              const done = index <= current;
              return (
                <React.Fragment key={stage.status}>
                  <li className="flex min-w-24 flex-1 items-center gap-2">
                    <span
                      className={cn(
                        "grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-black",
                        done ? "bg-crimson-500 text-white" : "bg-ink-100 text-ink-400",
                      )}
                    >
                      {index < current ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                    </span>
                    <span
                      className={cn("text-xs font-bold", done ? "text-ink-800" : "text-ink-400")}
                    >
                      {stage.label}
                    </span>
                  </li>
                  {index < STAGES.length - 1 && (
                    <span
                      className={cn(
                        "mx-2 mt-3 h-0.5 min-w-6 flex-1",
                        index < current ? "bg-crimson-400" : "bg-ink-100",
                      )}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </ol>
        )}
      </section>

      <div className="mt-7 grid gap-6 lg:grid-cols-[1.6fr_1fr] lg:gap-8">
        <div className="space-y-6">
          {canCancel && (
            <section className="rounded-3xl border border-ink-100 bg-white p-5 shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-base font-bold text-ink-900">Need to cancel?</h2>
                  <p className="mt-1 text-sm text-ink-600">
                    {returned
                      ? "The parcel is safely back at the shop. Cancelling restores reserved stock, coupon use and GoCoins; a paid online order enters the refund queue."
                      : "You can cancel before packing begins. Reserved stock, coupon use and GoCoins are returned automatically; a paid online order enters the refund queue."}
                  </p>
                </div>
                {!cancelOpen && (
                  <button
                    type="button"
                    onClick={() => setCancelOpen(true)}
                    className="inline-flex items-center gap-2 rounded-xl border border-ink-200 px-4 py-2.5 text-sm font-bold text-ink-700 transition hover:border-crimson-300 hover:text-crimson-700"
                  >
                    <XCircle className="h-4 w-4" /> Cancel order
                  </button>
                )}
              </div>
              {cancelOpen && (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                  <p className="flex items-start gap-2 text-sm text-amber-900">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    Cancellation is final. The shop will immediately see the reason.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {["Plans changed", "Ordered by mistake", "Delivery address changed"].map(
                      (reason) => (
                        <button
                          key={reason}
                          type="button"
                          onClick={() => setCancelReason(reason)}
                          className={cn(
                            "rounded-full border px-3 py-1.5 text-xs font-bold",
                            cancelReason === reason
                              ? "border-crimson-500 bg-crimson-500 text-white"
                              : "border-ink-200 bg-white text-ink-700",
                          )}
                        >
                          {reason}
                        </button>
                      ),
                    )}
                  </div>
                  <textarea
                    rows={2}
                    maxLength={280}
                    value={cancelReason}
                    onChange={(event) => setCancelReason(event.target.value)}
                    className="mt-3 w-full rounded-xl border border-ink-200 bg-white p-3 text-sm outline-none focus:border-crimson-400"
                    aria-label="Cancellation reason"
                  />
                  {cancelError && (
                    <p role="alert" className="mt-2 text-sm text-red-700">
                      {cancelError}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={cancelBusy || cancelReason.trim().length < 3}
                      onClick={() => void cancelOrder()}
                      className="rounded-xl bg-crimson-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                    >
                      {cancelBusy ? "Cancelling…" : "Confirm cancellation"}
                    </button>
                    <button
                      type="button"
                      disabled={cancelBusy}
                      onClick={() => {
                        setCancelOpen(false);
                        setCancelError(null);
                      }}
                      className="rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm font-bold text-ink-700"
                    >
                      Keep order
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}
          {closed ? (
            <section className="rounded-3xl border border-ink-100 bg-white p-6 shadow-card">
              <h2 className="font-display text-lg font-bold text-ink-900">This order is closed</h2>
              <p className="mt-1 text-sm text-ink-600">
                Nothing is on its way, so there is no map to show. The items and charges are listed
                beside this, and support can still look it up by the order number.
              </p>
            </section>
          ) : deliveryFailed || returning || returned ? (
            <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-card">
              <h2 className="font-display text-lg font-bold text-ink-900">Delivery route paused</h2>
              <p className="mt-1 text-sm leading-6 text-ink-600">
                {exceptionDetail} The customer map is hidden because the rider is no longer
                travelling towards your address.
              </p>
              <Link
                href={`/messages?shopId=${encodeURIComponent(order.storeId)}&orderId=${encodeURIComponent(order.id)}`}
                className="gp-btn mt-4 inline-flex border border-amber-300 bg-white px-4 py-2 text-sm text-amber-900"
              >
                <MessageCircle className="h-4 w-4" /> Message shop
              </Link>
            </section>
          ) : !mapPins ? (
            <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-card">
              <h2 className="font-display text-lg font-bold text-ink-900">Map is unavailable</h2>
              <p className="mt-1 text-sm text-ink-600">
                This order does not have both verified delivery pins. GoPasal will not invent a
                location or route; contact support if the written address is not enough.
              </p>
            </section>
          ) : (
            <section
              aria-labelledby="track-map-h"
              className="rounded-3xl border border-ink-100 bg-white p-2 shadow-card"
            >
              <h2 id="track-map-h" className="sr-only">
                Live delivery map
              </h2>
              <LiveRiderMap
                origin={mapPins.origin}
                destination={mapPins.destination}
                rider={rider}
                route={order.route}
                metersRemaining={metersRemaining}
                source={source}
                vehicle={order.runner?.vehicle}
                height={360}
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
                      : "Waiting for the API tracking feed"}
                </p>
              </div>
            </section>
          )}

          {order.runner && live ? (
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
                  <Link
                    href={`/messages?shopId=${encodeURIComponent(order.storeId)}&orderId=${encodeURIComponent(order.id)}`}
                    className="gp-btn border border-ink-200 bg-white px-4 py-2 text-sm text-ink-800 hover:bg-ink-50"
                  >
                    <MessageCircle className="h-4 w-4" /> Message shop
                  </Link>
                </div>
              </div>
              <p className="mt-4 rounded-2xl bg-paper px-4 py-3 text-xs text-ink-600">
                The runner&apos;s number works only while this order is open, and their location is
                shared with you only until it is delivered.
              </p>
            </section>
          ) : null}

          <section className="rounded-3xl border border-ink-100 bg-white p-6 shadow-card lg:hidden">
            <h2 className="font-display text-lg font-bold text-ink-900">Order journey</h2>
            <ol className="mt-6">
              {STAGES.map((stage, i) => {
                const done = !closed && i <= current;
                const active = !closed && i === current;
                const Icon = done ? STAGE_ICONS[i]! : Circle;
                const last = i === STAGES.length - 1;
                return (
                  <li
                    key={stage.status}
                    className={cn("relative flex gap-4", last ? "pb-0" : "pb-7")}
                  >
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
          {order.status === "DELIVERED" && order.hasProofPhoto ? (
            <DeliveryProofPhoto orderId={order.id} />
          ) : null}

          {order.status === "DELIVERED" && order.proofNote ? (
            <section className="rounded-3xl border border-ink-100 bg-white p-5 shadow-card">
              <h2 className="font-display text-base font-bold text-ink-900">Handover note</h2>
              <p className="mt-2 text-sm leading-6 text-ink-600">{order.proofNote}</p>
            </section>
          ) : null}

          {(deliveryFailed || returning || returned) && (
            <section className="rounded-3xl border border-amber-200 bg-amber-50/70 p-5">
              <h2 className="font-display text-base font-bold text-ink-900">Delivery exception</h2>
              {order.deliveryFailureReason && (
                <p className="mt-2 text-sm leading-6 text-ink-700">
                  <strong>Reported issue:</strong> {order.deliveryFailureReason}
                </p>
              )}
              {order.returnNote && (
                <p className="mt-2 text-sm leading-6 text-ink-700">
                  <strong>Shop return check:</strong> {order.returnNote}
                </p>
              )}
              <p className="mt-3 text-xs leading-5 text-ink-600">{exceptionDetail}</p>
            </section>
          )}

          {order.status === "DELIVERED" ? (
            <section className="rounded-3xl border border-crimson-100 bg-white p-5 shadow-card">
              <h2 className="font-display text-lg font-bold text-ink-900">Rate this order</h2>
              {review ? (
                <div className="mt-3">
                  <p
                    className="flex gap-1 text-marigold-500"
                    aria-label={`${review.rating} out of 5 stars`}
                  >
                    {Array.from({ length: review.rating }, (_, index) => (
                      <Star key={index} className="h-5 w-5 fill-current" />
                    ))}
                  </p>
                  <p className="mt-2 text-sm text-ink-700">
                    {review.comment || "Rating submitted."}
                  </p>
                  {review.sellerReply && (
                    <p className="mt-3 rounded-xl bg-paper p-3 text-sm text-ink-700">
                      <strong>Shop reply:</strong> {review.sellerReply}
                    </p>
                  )}
                </div>
              ) : (
                <form onSubmit={submitReview} className="mt-4">
                  <div className="flex gap-1" aria-label="Choose rating">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button
                        key={value}
                        type="button"
                        aria-label={`${value} stars`}
                        onClick={() => setRating(value)}
                        className="p-1 text-marigold-500"
                      >
                        <Star className={cn("h-6 w-6", value <= rating && "fill-current")} />
                      </button>
                    ))}
                  </div>
                  <textarea
                    maxLength={1000}
                    rows={3}
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    placeholder="Tell the shop what went well"
                    className="mt-3 w-full rounded-xl border border-ink-200 p-3 text-sm outline-none focus:border-crimson-400"
                  />
                  {reviewError && <p className="mt-2 text-sm text-crimson-700">{reviewError}</p>}
                  <button
                    disabled={reviewBusy}
                    className="mt-3 rounded-full bg-crimson-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {reviewBusy ? "Submitting…" : "Submit review"}
                  </button>
                </form>
              )}
            </section>
          ) : null}

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
            {order.refunds.length > 0 && (
              <div className="mt-3 space-y-2">
                {order.refunds.map((refund) => (
                  <div
                    key={refund.id}
                    className="rounded-2xl border border-ink-100 bg-white p-3 text-xs"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <strong className="text-ink-900">Refund {refund.code}</strong>
                      <Badge
                        tone={
                          refund.status === "COMPLETED"
                            ? "green"
                            : refund.status === "FAILED"
                              ? "crimson"
                              : "marigold"
                        }
                      >
                        {refund.status === "COMPLETED"
                          ? "Returned"
                          : refund.status === "FAILED"
                            ? "Needs attention"
                            : "In progress"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-ink-600">
                      {rs(refund.amount)} ·{" "}
                      {refund.method === "ORIGINAL_SOURCE"
                        ? "to the original payment source"
                        : "manual transfer"}
                    </p>
                    {refund.failureReason && (
                      <p className="mt-1 text-red-700">{refund.failureReason}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {rider && live ? (
            <section className="rounded-3xl border border-crimson-100 bg-crimson-50/60 p-5">
              <h2 className="font-display text-base font-bold text-ink-900">Live snapshot</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-600">
                    {order.routeDegraded ? "Direct distance left" : "Route left"}
                  </dt>
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
                    {source === "socket"
                      ? "Live socket"
                      : source === "poll"
                        ? "Polling"
                        : "Unavailable"}
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
