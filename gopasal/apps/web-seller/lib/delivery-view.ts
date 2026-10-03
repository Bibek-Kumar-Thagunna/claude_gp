/**
 * The seller console's own view of the delivery board.
 *
 * `lib/orders-view.ts` already turns an order plus its delivery leg into a
 * `SellerOrder` with a legal-actions object. This module is the layer above that:
 * it decides which lane of a delivery board an order belongs in, describes the
 * shop's riders, and parses zone polygons. Order fields are not re-derived here —
 * a second copy of `actionsFor` would eventually disagree with the first.
 *
 * Three things are deliberately absent, because the API has nothing behind them:
 *
 * 1. **No ETA and no promised window.** There is no such column, and GoPasal
 *    makes no delivery-speed promise, so there is no field to render one from.
 * 2. **No rider shift, roster window or availability.** `RiderStatus` is written
 *    only by the rider's own app (`PATCH /rider/status`, which itself refuses
 *    `ON_DELIVERY`) and by the assign/complete transactions. A seller cannot set
 *    it, so it is reported, never edited.
 * 3. **No live map here.** A rider's last position exists only as "has ever
 *    reported one" on the roster row; the per-order feed lives on the order
 *    detail and is null unless the order is out for delivery.
 */

import type { Tone } from "@/components/primitives";
import type {
  DeliveryStatusWire,
  RiderStatusWire,
  ShopRiderWire,
  VehicleTypeWire,
} from "./api/orders";
import type { DeliveryZoneWire, LatLngWire } from "./api/delivery";
import type { SellerOrder } from "./orders-view";

/* ------------------------------------------------------------------ Vehicles */

const VEHICLE_LABELS: Record<VehicleTypeWire, string> = {
  BICYCLE: "Bicycle",
  MOTORBIKE: "Motorbike",
  SCOOTER: "Scooter",
  WALK: "On foot",
  VAN: "Van",
};

/** Every `VehicleType` the API has, in the order the schema declares them. */
export const VEHICLE_OPTIONS: { value: VehicleTypeWire; label: string }[] = (
  ["BICYCLE", "MOTORBIKE", "SCOOTER", "WALK", "VAN"] as const
).map((value) => ({ value, label: VEHICLE_LABELS[value] }));

/** Falls back to the raw key so an enum value added server-side stays visible. */
export function vehicleLabel(v: string): string {
  return VEHICLE_LABELS[v as VehicleTypeWire] ?? v;
}

/* -------------------------------------------------------------------- Riders */

const RIDER_STATUS: Record<RiderStatusWire, { label: string; tone: Tone }> = {
  // "Available" rather than "Online": the shopkeeper cares whether they can be
  // given an order, not whether an app is in the foreground.
  ONLINE: { label: "Available", tone: "green" },
  ON_DELIVERY: { label: "On a delivery", tone: "blue" },
  OFFLINE: { label: "Offline", tone: "ink" },
};

/**
 * Falls back to the raw key, for the same reason `vehicleLabel` does: a status
 * added server-side should still be readable rather than render as nothing.
 *
 * Takes `string` because not every caller has the narrow type — `ShopRider.status`
 * in `orders-view.ts` is a plain string — and the order detail used to keep its own
 * copy of this table purely to get that looser signature. One table, one wording.
 */
export function riderStatusLabel(status: string): string {
  return RIDER_STATUS[status as RiderStatusWire]?.label ?? status;
}

function riderStatusTone(status: RiderStatusWire): Tone {
  return RIDER_STATUS[status].tone;
}

/** A rider on the roster, as the board shows them. */
export type DeliveryRider = {
  id: string;
  /** Their own name, or their phone when the account has no name yet. */
  name: string;
  phone: string;
  vehicleType: VehicleTypeWire;
  vehicleLabel: string;
  /** Reported by the rider's app. Read-only here — no seller route writes it. */
  status: RiderStatusWire;
  statusLabel: string;
  statusTone: Tone;
  /** Deliveries currently ASSIGNED, PICKED_UP or EN_ROUTE. */
  activeDeliveries: number;
  busy: boolean;
  /** Whether a position has ever been recorded. Not a location, and not a claim. */
  hasPosition: boolean;
  lastPingAt: string | null;
  /**
   * `DELETE riders/:riderId` 400s with `'Rider still has active deliveries'`, so
   * this is the endpoint's own precondition rather than a UI opinion.
   */
  canRemove: boolean;
};

export function toDeliveryRiders(wire: ShopRiderWire[]): DeliveryRider[] {
  return wire.map((r) => ({
    id: r.id,
    name: r.user.name ?? r.user.phone,
    phone: r.user.phone,
    vehicleType: r.vehicleType,
    vehicleLabel: vehicleLabel(r.vehicleType),
    status: r.status,
    statusLabel: riderStatusLabel(r.status),
    statusTone: riderStatusTone(r.status),
    activeDeliveries: r.activeDeliveries,
    busy: r.activeDeliveries > 0,
    hasPosition: r.location !== null,
    lastPingAt: r.lastPingAt,
    canRemove: r.activeDeliveries === 0,
  }));
}

/* --------------------------------------------------------------------- Lanes */

/**
 * Where an order sits on the delivery board.
 *
 * The lanes are cut by *what the shop does next*, which is why they are not the
 * order statuses: an `ACCEPTED` and a `PACKED` order both need someone to carry
 * them, and both accept `POST .../assign`, so they share a lane until a rider
 * takes them.
 */
export type DeliveryLane = "ready" | "with_rider" | "on_the_way" | "returns" | "closed";

export const DELIVERY_LANES: {
  id: DeliveryLane;
  label: string;
  hint: string;
  tone: Tone;
}[] = [
  {
    id: "ready",
    label: "Needs a rider",
    hint: "Ready for assignment, including delivery reattempts.",
    tone: "marigold",
  },
  {
    id: "with_rider",
    label: "With a rider",
    hint: "Assigned or picked up — dispatch it to send it out.",
    tone: "blue",
  },
  {
    id: "on_the_way",
    label: "Out for delivery",
    hint: "On its way to the buyer.",
    tone: "crimson",
  },
  {
    id: "returns",
    label: "Returning",
    hint: "Failed after pickup; recover the parcel before any next attempt.",
    tone: "marigold",
  },
  {
    id: "closed",
    label: "Recently finished",
    hint: "Successfully handed over. The newest few, not a full history.",
    tone: "green",
  },
];

/**
 * The lane, or `null` for an order the board has no business showing.
 *
 * `PLACED` is excluded because it has not been accepted yet — that is the order
 * queue's job, and a delivery board that shows it invites someone to hand out an
 * order the shop has not agreed to fulfil. `CANCELLED` and `REJECTED` never had a
 * leg to run.
 */
function deliveryLane(o: SellerOrder): DeliveryLane | null {
  if (o.status === "PLACED" || o.status === "CANCELLED" || o.status === "REJECTED") return null;
  if (o.status === "DELIVERED") return "closed";
  if ((o.deliveryStatus === "FAILED" && o.pickedUpAt) || o.deliveryStatus === "RETURNING_TO_SHOP")
    return "returns";
  if (o.deliveryStatus === "FAILED" || o.deliveryStatus === "RETURNED_TO_SHOP") return "ready";
  if (o.deliveryStatus === "DELIVERED") return "closed";
  if (o.deliveryStatus === "EN_ROUTE" || (o.status === "OUT_FOR_DELIVERY" && !o.deliveryStatus))
    return "on_the_way";
  if (o.deliveryStatus === "ASSIGNED" || o.deliveryStatus === "PICKED_UP") return "with_rider";
  return o.rider ? "with_rider" : "ready";
}

export type DeliveryBoard = Record<DeliveryLane, SellerOrder[]>;

/**
 * Split the orders into lanes, keeping each lane in the order it arrived.
 *
 * The caller controls that order: the API returns one shop's orders newest-first by
 * `placedAt`, and the consolidated view concatenates shops, so re-sort by `placedAt`
 * before calling this if several shops are on screen at once.
 *
 * The caller also controls *which* orders are here. `DELIVERED` is unbounded and
 * would crowd live work out of a bounded read, so the board asks the server for
 * `BOARD_OPEN_STATUSES` and for a short newest-first page of delivered orders
 * separately — which is why the `closed` lane is honestly labelled as the newest
 * few rather than as everything finished.
 */
export function toDeliveryBoard(orders: SellerOrder[]): DeliveryBoard {
  const board: DeliveryBoard = {
    ready: [],
    with_rider: [],
    on_the_way: [],
    returns: [],
    closed: [],
  };
  for (const o of orders) {
    const lane = deliveryLane(o);
    if (lane) board[lane].push(o);
  }
  return board;
}

/* --------------------------------------------------------- Delivery status UI */

/*
 * Colour for a `DeliveryStatus` is not decided here — `DeliveryStatusBadge` in
 * `components/orders/OrderBits.tsx` already owns that mapping and is used on the
 * order detail, so a second table would let the same leg be blue on one screen and
 * amber on another. What this file adds is the *verb*: the words on the button
 * that moves a leg forward, which the badge has no business knowing.
 */

const STEP_LABELS: Record<DeliveryStatusWire, string> = {
  UNASSIGNED: "Clear the rider",
  ASSIGNED: "Assign a rider",
  PICKED_UP: "Rider has it",
  EN_ROUTE: "On the way",
  DELIVERED: "Handed over",
  FAILED: "Could not deliver",
  RETURNING_TO_SHOP: "Start return",
  RETURNED_TO_SHOP: "Confirm parcel returned",
};

/** The button text for moving a leg to `to`. */
export function deliveryStepLabel(to: DeliveryStatusWire): string {
  return STEP_LABELS[to];
}

/* ----------------------------------------------------------------------- COD */

/**
 * Cash that has to come back with the rider.
 *
 * `collected` is the API's own `Delivery.codCollected`, which it writes only when
 * the leg is marked `DELIVERED` on a `COD` order — and it stamps `codAmount` from
 * the order total itself, so the console never sends or guesses a figure.
 */
export type CodState = "not_cod" | "pending" | "collected";

export function codState(o: SellerOrder): CodState {
  if (!o.isCod) return "not_cod";
  return o.codCollected ? "collected" : "pending";
}

/** Total COD still uncollected across the given orders, in whole rupees. */
export function codOutstanding(orders: SellerOrder[]): number {
  return orders.reduce((sum, o) => (codState(o) === "pending" ? sum + o.total : sum), 0);
}

/* --------------------------------------------------------------------- Zones */

/**
 * A delivery zone, with its polygon actually parsed.
 *
 * `DeliveryZone.polygon` is a `Json` column. The API validates it on the way in
 * (at least three `{lat, lng}` points) but never on the way out, and rows written
 * by a seed or an older migration were never subject to that DTO — so the shape
 * coming back is genuinely unknown and is checked here rather than trusted.
 *
 * `editable` is the consequence: `PATCH zones/:zoneId` takes the same DTO as
 * `POST`, so saving a rename means sending the whole polygon back. If we could not
 * read the stored polygon we cannot round-trip it, and the honest answer is to
 * refuse the edit instead of quietly replacing the shop's boundary with something
 * we invented.
 */
export type DeliveryZone = {
  id: string;
  name: string;
  points: LatLngWire[];
  pointCount: number;
  /** `null` = the shop's normal delivery fee. `0` = free inside this zone. */
  feeOverride: number | null;
  createdAt: string;
  editable: boolean;
};

function isLatLng(v: unknown): v is LatLngWire {
  if (typeof v !== "object" || v === null) return false;
  const p = v as { lat?: unknown; lng?: unknown };
  return (
    typeof p.lat === "number" &&
    Number.isFinite(p.lat) &&
    p.lat >= -90 &&
    p.lat <= 90 &&
    typeof p.lng === "number" &&
    Number.isFinite(p.lng) &&
    p.lng >= -180 &&
    p.lng <= 180
  );
}

/** Every point that is really a point. A partly-unreadable polygon yields fewer. */
function parseStoredPolygon(raw: unknown): LatLngWire[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isLatLng).map((p) => ({ lat: p.lat, lng: p.lng }));
}

function toDeliveryZone(wire: DeliveryZoneWire): DeliveryZone {
  const points = parseStoredPolygon(wire.polygon);
  const stored = Array.isArray(wire.polygon) ? wire.polygon.length : 0;
  return {
    id: wire.id,
    name: wire.name,
    points,
    pointCount: points.length,
    feeOverride: wire.feeOverride,
    createdAt: wire.createdAt,
    // Both conditions matter: three readable points are the API's minimum, and a
    // count mismatch means we would drop vertices on the way back.
    editable: points.length >= 3 && points.length === stored,
  };
}

export function toDeliveryZones(wire: DeliveryZoneWire[]): DeliveryZone[] {
  return wire.map(toDeliveryZone);
}

/**
 * Read a polygon out of typed text, one `lat, lng` pair per line.
 *
 * This exists because the console has no map. Drawing a boundary needs a real map
 * surface with the platform's map provider behind it, and until that lands the
 * choice is between a coordinate list — which is exactly what the endpoint takes —
 * and no way to create a zone at all. It is the plain, unglamorous option, and it
 * is honest: every number here came from the shopkeeper, and nothing is inferred.
 *
 * Errors name the offending line so a long paste is fixable without counting.
 */
export type PolygonParse = { points: LatLngWire[]; error: string | null };

export function parsePolygonText(text: string): PolygonParse {
  const points: LatLngWire[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = (lines[i] ?? "").trim();
    if (!raw) continue;
    const parts = raw
      .split(/[,\s]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length !== 2) {
      return { points: [], error: `Line ${i + 1}: write one point per line, as "lat, lng".` };
    }
    const lat = Number(parts[0]);
    const lng = Number(parts[1]);
    if (!isLatLng({ lat, lng })) {
      return {
        points: [],
        error: `Line ${i + 1}: "${raw}" is not a valid latitude and longitude.`,
      };
    }
    points.push({ lat, lng });
  }
  if (points.length > 50) {
    return { points, error: "A zone can have at most 50 points. Remove unnecessary corners." };
  }
  if (points.length < 3) {
    return { points, error: "A zone needs at least 3 points to enclose an area." };
  }
  return { points, error: null };
}

/** The inverse, so an existing zone can be edited in the same box it was typed in. */
export function polygonToText(points: LatLngWire[]): string {
  return points.map((p) => `${p.lat}, ${p.lng}`).join("\n");
}
