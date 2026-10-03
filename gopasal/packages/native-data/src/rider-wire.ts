/**
 * The rider's side of a delivery — types and the pure rules the rider app
 * builds its screens from. No React, no network: this file is what the tests
 * import.
 *
 * The shapes are the API's own (`GET /rider/me`, `GET /rider/deliveries`,
 * `GET /rider/deliveries/history`), which are also what the web rider console
 * reads. The rules mirror `delivery.service.ts`'s `applyStatus` for the RIDER
 * actor:
 *
 *  - ASSIGNED → PICKED_UP → EN_ROUTE → DELIVERED, with FAILED possible at any of
 *    the three. EN_ROUTE also moves the order to "on the way" if the shop has
 *    not pressed "Hand to rider" — the rider starting the ride is the handover.
 *  - DELIVERED needs a handover note of three characters or more, and on a
 *    cash order an explicit "I collected the cash".
 *  - A failure after pickup means the parcel is still with the rider: they
 *    start the return (RETURNING_TO_SHOP), and only the shop can confirm it
 *    arrived (RETURNED_TO_SHOP). A failure before pickup ends the job at once.
 *  - A proof photo can be attached between pickup and handover, not after.
 */
import type { DeliveryStatus } from "./seller";

export type { DeliveryStatus };

export type RiderStatus = "OFFLINE" | "ONLINE" | "ON_DELIVERY";
export type VehicleType = "BICYCLE" | "MOTORBIKE" | "SCOOTER" | "WALK" | "VAN";

export type RiderProfile = {
  id: string;
  vehicleType: VehicleType;
  status: RiderStatus;
  shop: { id: string; name: string } | null;
  user: { name: string | null; phone: string };
  location: {
    lat: number;
    lng: number;
    accuracy?: number;
    at: string;
    stale: boolean;
    offline: boolean;
  } | null;
};

export type RiderDelivery = {
  id: string;
  orderId: string;
  status: DeliveryStatus;
  destLat: number | null;
  destLng: number | null;
  distanceMeters: number | null;
  assignedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  returnStartedAt: string | null;
  returnedAt: string | null;
  failReason: string | null;
  returnNote: string | null;
  podNote: string | null;
  hasProofPhoto: boolean;
  codCollected: boolean;
  codAmount: number;
  updatedAt: string;
  order: {
    code: string;
    status: string;
    recipientName: string;
    recipientPhone: string;
    area: string;
    landmark: string | null;
    fullAddress: string;
    lat: number | null;
    lng: number | null;
    subtotal: number;
    deliveryFee: number;
    discount: number;
    loyaltyDiscount: number;
    total: number;
    paymentMethod: "COD" | "ESEWA" | "KHALTI" | string;
    paymentStatus: string;
    note: string | null;
    placedAt: string;
    shop: {
      id: string;
      name: string;
      area: string | null;
      fullAddress: string | null;
      lat: number | null;
      lng: number | null;
      phone: string | null;
    };
    items: { id: string; nameSnapshot: string; unitSnapshot: string | null; price: number; qty: number }[];
  };
};

/** What a rider may send. RETURNED_TO_SHOP is the shop's to confirm, never the rider's. */
export type RiderTransition =
  | { status: "PICKED_UP" | "EN_ROUTE" | "RETURNING_TO_SHOP" }
  | { status: "DELIVERED"; podNote: string; codCollected: boolean }
  | { status: "FAILED"; failReason: string };

export const NOTE_MIN = 3;
export const NOTE_MAX = 500;

export function riderTransitionBody(input: RiderTransition): Record<string, unknown> {
  if ("podNote" in input) {
    return { status: input.status, podNote: input.podNote.trim(), codCollected: input.codCollected };
  }
  if ("failReason" in input) return { status: input.status, failReason: input.failReason.trim() };
  return { status: input.status };
}

/**
 * The one thing the rider should do next, and what else is on offer.
 *
 * `primary` drives the big button at the bottom of the job; `canFail` shows
 * "Report a problem"; `canAttachProof` shows the camera. `stage` is the plain
 * phase the screen describes: going to the shop, going to the customer,
 * bringing it back, or waiting for the shop to take it in.
 */
export type RiderStep = {
  stage: "toShop" | "toCustomer" | "returning" | "mustReturn" | "done";
  primary: "pickUp" | "start" | "handover" | "startReturn" | null;
  canFail: boolean;
  canAttachProof: boolean;
};

export function riderStep(d: Pick<RiderDelivery, "status" | "pickedUpAt">): RiderStep {
  switch (d.status) {
    case "ASSIGNED":
      return { stage: "toShop", primary: "pickUp", canFail: true, canAttachProof: false };
    case "PICKED_UP":
      return { stage: "toCustomer", primary: "start", canFail: true, canAttachProof: true };
    case "EN_ROUTE":
      return { stage: "toCustomer", primary: "handover", canFail: true, canAttachProof: true };
    case "FAILED":
      return d.pickedUpAt
        ? { stage: "mustReturn", primary: "startReturn", canFail: false, canAttachProof: false }
        : { stage: "done", primary: null, canFail: false, canAttachProof: false };
    case "RETURNING_TO_SHOP":
      return { stage: "returning", primary: null, canFail: false, canAttachProof: false };
    default:
      return { stage: "done", primary: null, canFail: false, canAttachProof: false };
  }
}

/** Where the rider is headed right now: the shop, or the customer. */
export function destination(d: RiderDelivery): {
  kind: "shop" | "customer";
  lat: number | null;
  lng: number | null;
  address: string;
} {
  const step = riderStep(d);
  if (step.stage === "toShop" || step.stage === "returning" || step.stage === "mustReturn") {
    const s = d.order.shop;
    return {
      kind: "shop",
      lat: s.lat,
      lng: s.lng,
      address: [s.fullAddress, s.area].filter(Boolean).join(", ") || s.name,
    };
  }
  return {
    kind: "customer",
    lat: d.order.lat ?? d.destLat,
    lng: d.order.lng ?? d.destLng,
    address: [d.order.fullAddress, d.order.landmark, d.order.area].filter(Boolean).join(", "),
  };
}

/**
 * A turn-by-turn link for the phone's own maps app.
 *
 * The pin wins over the text when there is one: a Kathmandu address written by
 * a customer ("near the temple, blue gate") is for a person at the gate, not
 * for a geocoder. The universal Google Maps URL opens Google Maps where it is
 * installed and a browser where it is not.
 */
export function directionsUrl(to: { lat: number | null; lng: number | null; address: string }): string {
  const target =
    to.lat != null && to.lng != null ? `${to.lat},${to.lng}` : encodeURIComponent(to.address);
  return `https://www.google.com/maps/dir/?api=1&destination=${target}&travelmode=two-wheeler`;
}

/** The cash this job hands back to the shop, or 0 on a prepaid order. */
export function cashToCollect(d: RiderDelivery): number {
  if (d.order.paymentMethod !== "COD") return 0;
  return d.codAmount || d.order.total;
}

export function isCod(d: RiderDelivery): boolean {
  return d.order.paymentMethod === "COD";
}

/** "1.2 km" / "850 m", or null when the API has no distance. */
export function distanceLabel(meters: number | null | undefined): string | null {
  if (meters == null || !Number.isFinite(meters)) return null;
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  return `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`;
}

/** A day's totals from delivered history rows: jobs and cash handed back. */
export function dayTotals(rows: RiderDelivery[], day: Date): { delivered: number; cash: number } {
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = start.getTime() + 24 * 60 * 60 * 1000;
  let delivered = 0;
  let cash = 0;
  for (const r of rows) {
    if (r.status !== "DELIVERED" || !r.deliveredAt) continue;
    const at = Date.parse(r.deliveredAt);
    if (at < start.getTime() || at >= end) continue;
    delivered += 1;
    if (r.codCollected) cash += r.codAmount || 0;
  }
  return { delivered, cash };
}

/** Whether a new GPS fix is worth sending: moved enough, or long enough since the last. */
export function shouldPing(
  last: { lat: number; lng: number; at: number } | null,
  next: { lat: number; lng: number; at: number },
  opts = { minMeters: 25, maxSilenceMs: 30_000, minIntervalMs: 5_000 },
): boolean {
  if (!last) return true;
  const dt = next.at - last.at;
  if (dt < opts.minIntervalMs) return false;
  if (dt >= opts.maxSilenceMs) return true;
  return metersBetween(last, next) >= opts.minMeters;
}

export function metersBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const riderQk = {
  me: () => ["rider", "me"] as const,
  active: () => ["rider", "active"] as const,
  history: (page: number) => ["rider", "history", page] as const,
  historyRoot: () => ["rider", "history"] as const,
};
