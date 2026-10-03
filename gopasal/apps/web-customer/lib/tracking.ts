/**
 * Live delivery tracking presentation types and route geometry.
 *
 * Shapes mirror `apps/api/src/modules/orders/orders.service.ts#withTracking`.
 */

import { haversineMeters, type LatLng } from "./geo";

export type OrderStatus =
  "PLACED" | "ACCEPTED" | "PACKED" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED" | "REJECTED";

export type DeliveryStatus =
  | "UNASSIGNED"
  | "ASSIGNED"
  | "PICKED_UP"
  | "EN_ROUTE"
  | "DELIVERED"
  | "FAILED"
  | "RETURNING_TO_SHOP"
  | "RETURNED_TO_SHOP";

/** A rider position exactly as the socket delivers it. */
export type RiderSnapshot = {
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  accuracy?: number;
  /** ISO timestamp of the ping. */
  at: string;
  /** No fresh ping for a while — show the position as last-known. */
  stale?: boolean;
  /** Long enough that we treat the rider's phone as offline. */
  offline?: boolean;
};

export type Runner = {
  name: string;
  phone: string;
  vehicle: "BICYCLE" | "MOTORBIKE" | "SCOOTER" | "WALK";
  /** Whether this is the shopkeeper themselves (very common for small shops). */
  isOwner: boolean;
};

export type OrderLine = { name: string; qty: number; price: number; unit?: string };
export type OrderRefund = {
  id: string;
  code: string;
  amount: number;
  reason: string;
  method: "ORIGINAL_SOURCE" | "MANUAL_TRANSFER" | "STORE_CREDIT";
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  failureReason?: string;
  completedAt?: string;
  createdAt: string;
};

export type TrackedOrder = {
  id: string;
  code: string;
  storeId: string;
  storeSlug: string;
  storeName: string;
  storeNp: string;
  storePhone: string;
  storeArea: string;
  emoji: string;
  status: OrderStatus;
  deliveryStatus: DeliveryStatus;
  placedAt: string;
  /** Shop pin — where the parcel starts. */
  origin: LatLng | null;
  /** The customer's saved address pin — where it is going. */
  destination: LatLng | null;
  destinationLabel: string;
  /** The road the runner is expected to take, when the API returns geometry. */
  route?: LatLng[];
  /** True when no road-network route was available and distance is direct-line only. */
  routeDegraded: boolean;
  runner?: Runner;
  payment: "COD" | "ESEWA" | "KHALTI";
  paymentStatus: "PENDING" | "PAID" | "FAILED" | "PARTIALLY_REFUNDED" | "REFUNDED";
  lines: OrderLine[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  note?: string;
  closeReason?: string;
  refunds: OrderRefund[];
  hasProofPhoto: boolean;
  proofNote?: string;
  deliveryFailureReason?: string;
  pickedUpAt?: string;
  returnStartedAt?: string;
  returnedAt?: string;
  returnNote?: string;
};

/** What the map component consumes. */
export type TrackingFeed = {
  order: TrackedOrder;
  rider: RiderSnapshot | null;
  /** Where the data is actually coming from right now. */
  source: "socket" | "poll" | "unavailable";
  connected: boolean;
  /** Metres left along the drawn route (not a promise about time). */
  metersRemaining: number | null;
  /** Immediately refresh after a customer action instead of waiting for polling. */
  refresh: () => Promise<void>;
};

/* ── stages ───────────────────────────────────────────────────────────────── */

export const STAGES = [
  { status: "PLACED", label: "Order placed", np: "अर्डर गरियो" },
  { status: "ACCEPTED", label: "Shop accepted", np: "पसलले स्वीकार गर्यो" },
  { status: "PACKED", label: "Packed and ready", np: "प्याक भयो" },
  { status: "OUT_FOR_DELIVERY", label: "On the way to you", np: "बाटोमा छ" },
  { status: "DELIVERED", label: "Delivered", np: "पुग्यो" },
] as const;

export type Stage = (typeof STAGES)[number];

export function stageIndex(status: OrderStatus): number {
  const i = STAGES.findIndex((s) => s.status === status);
  return i === -1 ? 0 : i;
}

export const isLive = (o: TrackedOrder) => o.status === "OUT_FOR_DELIVERY";
export const isOpen = (o: TrackedOrder) =>
  o.status !== "DELIVERED" && o.status !== "CANCELLED" && o.status !== "REJECTED";

/** Metres left from a live position to the end of the route. */
export function remainingMeters(route: LatLng[], from: LatLng): number {
  if (route.length < 2) return 0;
  // find the closest vertex, then sum the rest of the polyline
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < route.length; i += 1) {
    const d = haversineMeters(route[i]!, from);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  let total = haversineMeters(from, route[Math.min(best + 1, route.length - 1)]!);
  for (let i = best + 1; i < route.length - 1; i += 1) {
    total += haversineMeters(route[i]!, route[i + 1]!);
  }
  return total;
}
