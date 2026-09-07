/**
 * Live delivery tracking — shared types, demo data and the local simulator.
 *
 * The customer's map is fed from one of three sources, in order of preference:
 *   1. the API's `/realtime` socket (`rider:location`),
 *   2. polling `GET /orders/:id` (which carries the same `tracking` payload),
 *   3. this file's simulator, so the screen is alive locally with no backend
 *      and no map key at all.
 *
 * Shapes mirror `apps/api/src/modules/orders/orders.service.ts#withTracking`
 * and `apps/api/src/modules/delivery/rider-location.service.ts`, so swapping
 * the mock for the real API is a data-source change, not a UI change.
 */

import { bearingDegrees, haversineMeters, lerpLatLng, pointAlong, type LatLng } from "./geo";

export type OrderStatus =
  | "PLACED"
  | "ACCEPTED"
  | "PACKED"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED"
  | "REJECTED";

export type DeliveryStatus =
  | "UNASSIGNED"
  | "ASSIGNED"
  | "PICKED_UP"
  | "EN_ROUTE"
  | "DELIVERED"
  | "FAILED";

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

export type TrackedOrder = {
  id: string;
  code: string;
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
  origin: LatLng;
  /** The customer's saved address pin — where it is going. */
  destination: LatLng;
  destinationLabel: string;
  /** The road the runner is expected to take, when the API returns geometry. */
  route?: LatLng[];
  runner?: Runner;
  payment: "COD" | "ESEWA" | "KHALTI";
  lines: OrderLine[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  note?: string;
};

/** What the map component consumes. */
export type TrackingFeed = {
  order: TrackedOrder;
  rider: RiderSnapshot | null;
  /** Where the data is actually coming from right now. */
  source: "socket" | "poll" | "demo";
  connected: boolean;
  /** Metres left along the drawn route (not a promise about time). */
  metersRemaining: number | null;
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

/* ── map configuration (env only, never a hardcoded key) ──────────────────── */

export type MapConfig = {
  /** `mapbox` needs a public token; `osm` needs nothing; `none` draws our own. */
  provider: "mapbox" | "osm" | "none";
  token: string | null;
  /** True when real tiles can be requested at all. */
  tiles: boolean;
};

export function mapConfig(): MapConfig {
  const raw = (process.env.NEXT_PUBLIC_MAP_PROVIDER ?? "osm").toLowerCase();
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim() || null;
  if (raw === "mapbox" && token && !token.startsWith("__")) {
    return { provider: "mapbox", token, tiles: true };
  }
  if (raw === "none") return { provider: "none", token: null, tiles: false };
  // OSM raster tiles need no credential, so the map is real out of the box.
  return { provider: "osm", token: null, tiles: true };
}

/** Base URL of the GoPasal API, when one is configured. */
export function apiBase(): string | null {
  const url = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!url || url.startsWith("__")) return null;
  return url.replace(/\/+$/, "");
}

/* ── deterministic pseudo-randomness ──────────────────────────────────────── */

/** Tiny seeded PRNG — identical output on server and client, so no hydration gap. */
export function seeded(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A believable street-ish route between two pins: the straight line, bent by a
 * few deterministic dog-legs so it reads as roads rather than a ruler line.
 * Replaced by real geometry the moment the API's routing provider returns it.
 */
export function buildRoute(origin: LatLng, destination: LatLng, seed: string): LatLng[] {
  const rand = seeded(seed);
  const legs = 6;
  const spread = haversineMeters(origin, destination) / 111_320; // metres → ~degrees
  const out: LatLng[] = [origin];
  for (let i = 1; i < legs; i += 1) {
    const t = i / legs;
    const mid = lerpLatLng(origin, destination, t);
    // sideways offset that grows in the middle and vanishes at both pins
    const bulge = Math.sin(t * Math.PI) * spread * 0.22;
    const jitter = (rand() - 0.5) * spread * 0.12;
    out.push({
      lat: mid.lat + bulge * (i % 2 === 0 ? 1 : -1) * 0.5 + jitter * 0.5,
      lng: mid.lng + bulge * (i % 2 === 0 ? -1 : 1) + jitter,
    });
  }
  out.push(destination);
  return out;
}

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

/**
 * Demo rider motion. Advances a fraction along the route per tick and derives
 * heading from the segment, which is exactly what a real GPS stream gives us.
 */
export function simulateRider(route: LatLng[], progress: number, now: Date): RiderSnapshot {
  const { at, heading } = pointAlong(route, progress);
  const next = pointAlong(route, Math.min(1, progress + 0.02));
  return {
    lat: at.lat,
    lng: at.lng,
    heading: progress >= 1 ? heading : bearingDegrees(at, next.at),
    speed: 4.2,
    accuracy: 12,
    at: now.toISOString(),
    stale: false,
    offline: false,
  };
}
