/**
 * Delivery addressing, zone geometry and the transition bodies, with no React in
 * it.
 *
 * Three kinds of quiet mistake live in this file, which is why it is separate from
 * the hooks and therefore testable:
 *
 *  - **Zone geometry.** `DeliveryZone.polygon` is a `Json` column. The API
 *    validates what goes *in* (`@ValidateNested` over `LatLngDto`, 3–50 points)
 *    and nothing re-validates what comes *out* — a row written by a seed, a
 *    migration or an older DTO is not covered. Reading it as though it were
 *    certainly `{lat,lng}[]` is how a map screen crashes on one bad row, so it is
 *    parsed defensively here instead.
 *  - **The delivery transition body.** `DeliveryService.applyStatus` requires a
 *    different field for each target state and throws a 400 naming it: a handover
 *    note on `DELIVERED`, a reason on `FAILED`, a condition note on
 *    `RETURNED_TO_SHOP`, and an explicit `codCollected: true` on a COD delivery.
 *    None of that is in the DTO's decorators — `podNote` is `@IsOptional()` there
 *    — so a screen that trusts the DTO sends a request the service refuses.
 *  - **A zone drawn by a finger.** A polygon whose first and last points are the
 *    same, or which has fewer than three distinct vertices, is accepted by the
 *    validators and describes no area at all, so nothing is ever inside it.
 *
 * Nothing here enforces anything; the API is the enforcing copy. These exist so a
 * screen can say what is wrong, and draw a map, without a round trip.
 */
import type { DeliveryStatus } from "./seller";

/* ── query keys ───────────────────────────────────────────────────────────── */

/**
 * The keys this module adds.
 *
 * **The rider roster is not here on purpose.** `seller-wire.ts` already owns
 * `qk.riders(shopId)`, `./seller`'s `useShopRiders` reads it and its
 * `useRiderAssignment` invalidates it, and a second key for the same list would
 * mean a register or a remove in this module left the counter's rider picker
 * showing a roster that no longer exists. So `./seller-delivery` imports that key
 * rather than declaring one — shared deliberately, which is the opposite of
 * collided.
 *
 * `"zones"` is new and used by nothing else. Shop-scoped with `shopId` third, like
 * every other key in the seller namespace, so a shop switch drops it.
 */
export const deliveryQk = {
  zones: (shopId: string) => ["seller", "zones", shopId] as const,
};

/* ── the delivery transition ──────────────────────────────────────────────── */

/**
 * `DELIVERY_TRANSITIONS` in `apps/api/src/modules/delivery/delivery-state.ts`,
 * mirrored so a screen can offer the steps that exist rather than discover them
 * from 400s.
 *
 * The machine, in words: a leg is `UNASSIGNED` until a rider is given it, then
 * `ASSIGNED → PICKED_UP → EN_ROUTE → DELIVERED`, with `FAILED` reachable from the
 * three middle states. A failed leg that was already picked up can come back:
 * `FAILED → RETURNING_TO_SHOP → RETURNED_TO_SHOP`. `DELIVERED` and
 * `RETURNED_TO_SHOP` are terminal.
 *
 * Two constraints are not expressible in this table and matter as much:
 *
 *  - **`UNASSIGNED → ASSIGNED` is not this route's to make.** Assignment is
 *    `POST …/orders/:orderId/assign`, which claims the rider atomically.
 *  - **`RETURNED_TO_SHOP` may only be written by the shop**, never by a rider:
 *    the service refuses any other actor with "The shop must confirm that it
 *    physically received the parcel". On this surface that is always satisfied,
 *    and it is the reason the step exists.
 */
const DELIVERY_NEXT: Record<DeliveryStatus, readonly DeliveryStatus[]> = {
  UNASSIGNED: ["ASSIGNED"],
  ASSIGNED: ["PICKED_UP", "FAILED"],
  PICKED_UP: ["EN_ROUTE", "FAILED"],
  EN_ROUTE: ["DELIVERED", "FAILED"],
  DELIVERED: [],
  FAILED: ["RETURNING_TO_SHOP"],
  RETURNING_TO_SHOP: ["RETURNED_TO_SHOP"],
  RETURNED_TO_SHOP: [],
};

/**
 * Which steps this leg can take next, as the API will allow them.
 *
 * `UNASSIGNED`'s only successor is `ASSIGNED`, and the delivery-status route cannot
 * produce it — see the note above — so a screen building buttons from this must
 * drop that one and offer the rider picker instead.
 */
export function nextDeliveryStates(from: DeliveryStatus): readonly DeliveryStatus[] {
  return DELIVERY_NEXT[from] ?? [];
}

/**
 * What can be done to an order right now, from its status and its delivery leg.
 *
 * The same rules the web seller console applies (`apps/web-seller/lib/orders-view.ts`),
 * which mirror the API's two state machines — the order's, in `OrdersService`, and
 * the leg's, in `delivery-state.ts`. Kept as one pure function so the phone and
 * the console cannot drift into offering different buttons for the same order.
 *
 * The part that is easy to get wrong is after dispatch. Dispatching does not move
 * the leg: an order can be `OUT_FOR_DELIVERY` with its leg still `ASSIGNED`, and
 * the leg then walks `PICKED_UP → EN_ROUTE → DELIVERED` on its own. A shop that
 * delivers itself walks it from here; one with a GoPasal rider usually watches the
 * rider do it, but may step in.
 *
 *  - `EN_ROUTE` is offered only once the order is `OUT_FOR_DELIVERY`: the leg
 *    cascades the order with actor `SYSTEM`, which `PACKED` does not admit.
 *  - A failure before pickup frees the order for another rider straight away;
 *    one after pickup means a parcel is out there, so it has to come back —
 *    `RETURNING_TO_SHOP`, then the shop confirms `RETURNED_TO_SHOP` with the
 *    parcel's condition — before it can be redelivered or cancelled.
 */
export type OrderActions = {
  accept: boolean;
  reject: boolean;
  pack: boolean;
  dispatch: boolean;
  cancel: boolean;
  /** Choose (or re-choose, for a redelivery) the rider. */
  assignRider: boolean;
  unassignRider: boolean;
  /** The one forward step the leg can take, if any. */
  nextLeg: DeliveryStatus | null;
  /** Record that the delivery did not happen. */
  markFailed: boolean;
};

type OrderStatusLike =
  "PLACED" | "ACCEPTED" | "PACKED" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED" | "REJECTED";

type LegLike = { status: DeliveryStatus; riderId: string | null; pickedUpAt: string | null } | null;

const TERMINAL_ORDER: readonly OrderStatusLike[] = ["DELIVERED", "CANCELLED", "REJECTED"];

export function nextLegStep(orderStatus: OrderStatusLike, leg: LegLike): DeliveryStatus | null {
  if (!leg?.riderId) return null;
  switch (leg.status) {
    case "ASSIGNED":
      return "PICKED_UP";
    case "PICKED_UP":
      return orderStatus === "OUT_FOR_DELIVERY" ? "EN_ROUTE" : null;
    case "EN_ROUTE":
      return "DELIVERED";
    case "FAILED":
      return leg.pickedUpAt ? "RETURNING_TO_SHOP" : null;
    case "RETURNING_TO_SHOP":
      return "RETURNED_TO_SHOP";
    default:
      return null;
  }
}

export function orderActions(status: OrderStatusLike, leg: LegLike): OrderActions {
  const terminal = TERMINAL_ORDER.includes(status);
  const legMoving = leg?.status === "PICKED_UP" || leg?.status === "EN_ROUTE";
  return {
    accept: status === "PLACED",
    reject: status === "PLACED",
    pack: status === "ACCEPTED",
    dispatch: status === "PACKED" && Boolean(leg?.riderId),
    cancel:
      status === "PLACED" ||
      status === "ACCEPTED" ||
      status === "PACKED" ||
      (status === "OUT_FOR_DELIVERY" && leg?.status === "RETURNED_TO_SHOP"),
    assignRider:
      !terminal &&
      (leg?.status === "UNASSIGNED" ||
        leg?.status === "ASSIGNED" ||
        (leg?.status === "FAILED" && !leg.pickedUpAt) ||
        leg?.status === "RETURNED_TO_SHOP"),
    unassignRider: !terminal && leg?.status === "ASSIGNED",
    nextLeg: terminal ? null : nextLegStep(status, leg),
    markFailed: !terminal && (legMoving || leg?.status === "ASSIGNED"),
  };
}

/** `POD_NOTE_MAX_LENGTH` and `FAIL_REASON_MAX_LENGTH` in the delivery DTO. */
export const DELIVERY_NOTE_MIN_LENGTH = 3;
export const DELIVERY_NOTE_MAX_LENGTH = 500;

/**
 * What a delivery-status patch is given, as a discriminated union on the target
 * state.
 *
 * Written as a union rather than as `DeliveryStatusDto`'s flat four optional keys,
 * because the DTO and the service disagree about what is required and the service
 * wins. `DeliveryStatusDto` marks `podNote`, `codCollected`, `failReason` and
 * `returnNote` all `@IsOptional()`; `applyStatus` then throws:
 *
 *  - `"A factual handover note is required"` on `DELIVERED` without a `podNote` of
 *    at least three characters after trimming.
 *  - `"Explicit COD collection confirmation is required"` on `DELIVERED` for a COD
 *    order unless `codCollected` is exactly `true`. The API stamps `codAmount`
 *    from the order total itself, so no amount is ever sent.
 *  - `"A specific delivery failure reason is required"` on `FAILED` without a
 *    `failReason`.
 *  - `"Record the condition of the parcel received by the shop"` on
 *    `RETURNED_TO_SHOP` without a `returnNote`.
 *
 * A flat optional shape lets a screen compile a request the service will refuse.
 * This shape does not.
 *
 * `codCollected` is asked for on every `DELIVERED` rather than only on COD,
 * because whether the order is COD is a fact about the order that the caller has
 * and this body does not — and a `false` on a prepaid order is read and ignored,
 * which is harmless, while a missing `true` on a COD order is a 400.
 */
export type DeliveryTransition =
  | { status: "PICKED_UP" | "EN_ROUTE" }
  | { status: "DELIVERED"; podNote: string; codCollected: boolean }
  | { status: "FAILED"; failReason: string }
  | { status: "RETURNING_TO_SHOP" }
  | { status: "RETURNED_TO_SHOP"; returnNote: string };

/**
 * The JSON body for one transition.
 *
 * Narrowed on the key rather than on `status`, for the reason `transitionBody` in
 * `seller-wire.ts` sets out: a discriminant that is itself a union of literals does
 * not eliminate the other members when it is tested, so `"podNote" in input` is the
 * check that actually types this.
 *
 * Only the keys the target state needs are sent. `forbidNonWhitelisted` would
 * accept the others — they are declared on the DTO — but sending a `failReason`
 * alongside a `DELIVERED` would put a stored failure reason on a successful
 * delivery, because `applyStatus` only *reads* per state and does not clear.
 */
export function deliveryTransitionBody(input: DeliveryTransition): Record<string, unknown> {
  const body: Record<string, unknown> = { status: input.status };
  if ("podNote" in input) {
    body.podNote = input.podNote;
    body.codCollected = input.codCollected;
  } else if ("failReason" in input) {
    body.failReason = input.failReason;
  } else if ("returnNote" in input) {
    body.returnNote = input.returnNote;
  }
  return body;
}

/** Why this transition would be refused, or null. */
export function deliveryTransitionIssue(input: DeliveryTransition): string | null {
  const note =
    "podNote" in input
      ? input.podNote
      : "failReason" in input
        ? input.failReason
        : "returnNote" in input
          ? input.returnNote
          : null;
  if (note === null) return null;
  const trimmed = note.trim();
  if (trimmed.length < DELIVERY_NOTE_MIN_LENGTH) {
    return input.status === "FAILED"
      ? "Say what went wrong, in a few words."
      : input.status === "RETURNED_TO_SHOP"
        ? "Record what came back and in what condition."
        : "Record who took the parcel, in a few words.";
  }
  if (trimmed.length > DELIVERY_NOTE_MAX_LENGTH) {
    return `That is longer than ${DELIVERY_NOTE_MAX_LENGTH} characters.`;
  }
  return null;
}

/* ── zones ────────────────────────────────────────────────────────────────── */

/** One vertex. `@IsLatitude` / `@IsLongitude` on the way in. */
export type LatLng = { lat: number; lng: number };

/** `UpsertZoneDto`'s bounds. */
export const ZONE_LIMITS = {
  nameMin: 2,
  nameMax: 80,
  pointsMin: 3,
  pointsMax: 50,
  feeMin: 0,
  feeMax: 100_000,
} as const;

/**
 * Read a stored polygon without trusting it.
 *
 * The column is `Json`, the write path validates and the read path does not, and
 * rows predating the current DTO exist. So this returns `null` for anything it
 * cannot make sense of, and a partially-valid array is rejected whole rather than
 * silently shortened: a zone missing one vertex is a *different* zone, and drawing
 * it would tell a seller they deliver somewhere they do not.
 *
 * Coordinates are range-checked as well as type-checked, because a swapped
 * `lat`/`lng` pair — the classic mapping bug — puts a Kathmandu shop's zone in the
 * Indian Ocean, and latitude 85 does not exist.
 */
export function parseZonePolygon(value: unknown): LatLng[] | null {
  if (!Array.isArray(value) || value.length < ZONE_LIMITS.pointsMin) return null;
  const points: LatLng[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return null;
    const point = raw as Record<string, unknown>;
    const { lat, lng } = point;
    if (typeof lat !== "number" || typeof lng !== "number") return null;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    points.push({ lat, lng });
  }
  return points;
}

export type ZoneIssue = { field: "name" | "polygon" | "feeOverride"; message: string };

export type ZoneDraft = {
  name?: string;
  polygon?: LatLng[];
  feeOverride?: number;
};

/** Two points are the same place to within about a metre. */
function samePlace(a: LatLng, b: LatLng): boolean {
  return Math.abs(a.lat - b.lat) < 1e-5 && Math.abs(a.lng - b.lng) < 1e-5;
}

/** How many genuinely distinct vertices a ring has, ignoring a repeated closing point. */
export function distinctVertexCount(polygon: readonly LatLng[]): number {
  const kept: LatLng[] = [];
  for (const point of polygon) {
    if (!kept.some((seen) => samePlace(seen, point))) kept.push(point);
  }
  return kept.length;
}

/**
 * Everything wrong with a zone draft.
 *
 * The first three checks are the API's (`@MinLength(2)`, `@MaxLength(80)`, 3–50
 * points validated twice — by the decorator and again by the service with "A zone
 * needs at least 3 points" — and `feeOverride` `@Min(0) @Max(100_000)`).
 *
 * The fourth is not, and is the one worth having here: a ring whose points are not
 * three *distinct* places encloses no area, so nothing is ever inside it. A finger
 * that tapped the same spot three times, or a shape closed by repeating its first
 * point, both pass every server validator and produce a zone that silently never
 * matches an address. The API cannot reasonably catch it — a degenerate polygon is
 * still a polygon — and a seller would have no way to tell.
 */
export function zoneDraftIssues(draft: ZoneDraft): ZoneIssue[] {
  const issues: ZoneIssue[] = [];

  const name = draft.name?.trim();
  if (!name || name.length < ZONE_LIMITS.nameMin) {
    issues.push({
      field: "name",
      message: `Give the zone a name of at least ${ZONE_LIMITS.nameMin} characters.`,
    });
  } else if (name.length > ZONE_LIMITS.nameMax) {
    issues.push({
      field: "name",
      message: `A zone name can be at most ${ZONE_LIMITS.nameMax} characters.`,
    });
  }

  const polygon = draft.polygon ?? [];
  if (polygon.length < ZONE_LIMITS.pointsMin) {
    issues.push({ field: "polygon", message: "A zone needs at least 3 points." });
  } else if (polygon.length > ZONE_LIMITS.pointsMax) {
    issues.push({
      field: "polygon",
      message: `A zone can have at most ${ZONE_LIMITS.pointsMax} points.`,
    });
  } else if (distinctVertexCount(polygon) < ZONE_LIMITS.pointsMin) {
    issues.push({
      field: "polygon",
      message: "Those points are all in the same place, so the zone covers nothing.",
    });
  } else if (
    polygon.some(
      (point) =>
        point.lat < -90 ||
        point.lat > 90 ||
        point.lng < -180 ||
        point.lng > 180 ||
        !Number.isFinite(point.lat) ||
        !Number.isFinite(point.lng),
    )
  ) {
    issues.push({ field: "polygon", message: "One of those points is not a real place." });
  }

  if (draft.feeOverride !== undefined) {
    if (
      !Number.isInteger(draft.feeOverride) ||
      draft.feeOverride < ZONE_LIMITS.feeMin ||
      draft.feeOverride > ZONE_LIMITS.feeMax
    ) {
      issues.push({
        field: "feeOverride",
        message: "A zone fee is a whole number of rupees, or leave it unset.",
      });
    }
  }

  return issues;
}

/**
 * Is this point inside this zone?
 *
 * **A transliteration of `pointInPolygon` in `apps/api/src/providers/geo.ts`**, and
 * that is the whole specification: the same ray direction, the same strict
 * comparisons, the same vertex pairing. It is not written as "a ray-casting test"
 * because there are two of those — casting along latitude and casting along
 * longitude — and they disagree for a point exactly on an edge. The server's
 * version casts along `lng` and compares `lat`, and this one has to answer the way
 * checkout will, not the way a textbook would.
 *
 * Two properties inherited from that function rather than chosen here:
 *
 *  - **Degrees are treated as a plane.** Over a delivery zone, at Nepal's
 *    latitudes, the distortion is far below the accuracy of the coordinates
 *    themselves. It would be wrong at continental scale and there is nothing at
 *    continental scale on this surface.
 *  - **The antimeridian is not handled.** A polygon spanning ±180° reads as its
 *    complement. Nepal is nowhere near it.
 *
 * A point on an edge is not guaranteed either answer; floating point decides, and
 * it decides the same way on both sides, which is what matters.
 *
 * ## This is a preview, and it is not the whole rule
 *
 * `OrdersService.serviceability` reads these polygons at checkout, so a zone is a
 * real thing — but it is consulted **only for a destination outside the shop's
 * `deliveryRadiusKm`**. Inside the radius the order is deliverable and the zones
 * are never looked at, so a zone drawn over the shop's own neighbourhood changes
 * nothing, including its `feeOverride`. A screen that answers "do we deliver here?"
 * has to check the radius first; {@link deliverabilityAt} does.
 */
export function pointInZone(point: LatLng, polygon: readonly LatLng[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    if (!a || !b) continue;
    const intersect =
      a.lng > point.lng !== b.lng > point.lng &&
      point.lat < ((b.lat - a.lat) * (point.lng - a.lng)) / (b.lng - a.lng) + a.lat;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Which of the shop's zones contains this point, first match wins.
 *
 * "First" is the array's order, and a screen should pass the zones as `listZones`
 * returned them — `createdAt asc` — because that is the order
 * `OrdersService.serviceability` iterates and therefore which `feeOverride` a
 * checkout would actually use when two zones overlap. There is no precedence rule
 * beyond that, on either side; overlapping zones are resolved by age and nothing
 * else, which is worth showing a seller rather than hiding.
 */
export function zoneForPoint<T extends { polygon: unknown }>(
  zones: readonly T[],
  point: LatLng,
): T | null {
  for (const zone of zones) {
    const polygon = parseZonePolygon(zone.polygon);
    if (polygon && pointInZone(point, polygon)) return zone;
  }
  return null;
}

/** Great-circle metres, `haversineMeters` in `apps/api/src/providers/geo.ts`. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat));
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/**
 * Whether this shop would deliver to a point, and what the zone would charge.
 *
 * `OrdersService.serviceability`, mirrored in full, because the half of it that
 * gets forgotten is the half that decides most answers:
 *
 *  1. Inside `deliveryRadiusKm` of the shop pin, the order is deliverable and
 *     **no zone is consulted** — so `feeOverride` is null even when a zone covers
 *     the point.
 *  2. Outside the radius, the first zone containing the point makes it
 *     deliverable and hands over its `feeOverride`.
 *  3. Otherwise it is not deliverable at all.
 *
 * `feeOverride: null` does not mean "free" and does not mean "no fee". It means
 * the platform's distance formula applies — `computeDeliveryFee`, base 40, first
 * 2 km included, Rs 15/km after, capped at 250 — which this module does not
 * reimplement, because those four numbers are server defaults that a screen
 * quoting them would be pinning. A zone fee of `0` *is* a real value and a
 * different one: free delivery inside that zone.
 *
 * Returns null for `origin` when the shop has no pin. A shop with no `lat`/`lng`
 * cannot be asked this question — and it is also blocked from the storefront by
 * `VERIFIED_LOCATION`, so the honest answer is "set the shop location first".
 */
export function deliverabilityAt<T extends { polygon: unknown; feeOverride: number | null }>(
  shop: { lat: number | null; lng: number | null; deliveryRadiusKm: number },
  zones: readonly T[],
  point: LatLng,
): {
  deliverable: boolean;
  withinRadius: boolean;
  zone: T | null;
  feeOverride: number | null;
} | null {
  if (shop.lat === null || shop.lng === null) return null;
  const distance = haversineMeters({ lat: shop.lat, lng: shop.lng }, point);
  if (distance <= shop.deliveryRadiusKm * 1000) {
    return { deliverable: true, withinRadius: true, zone: null, feeOverride: null };
  }
  const zone = zoneForPoint(zones, point);
  return {
    deliverable: zone !== null,
    withinRadius: false,
    zone,
    feeOverride: zone?.feeOverride ?? null,
  };
}

/* ── riders ───────────────────────────────────────────────────────────────── */

/** `RegisterRiderDto.name` is `@MinLength(2)`. `phone` has no length bound in the DTO. */
export const RIDER_NAME_MIN_LENGTH = 2;

export type RiderIssue = { field: "phone" | "name"; message: string };

/**
 * Nepal mobile numbers as `normalizeNepalPhone` accepts them, mirrored so a form
 * can refuse a typo before it creates an account for it.
 *
 * This is the check that matters most in the whole delivery module, and not
 * because of validation: registering a rider **upserts a `User` by phone number**.
 * A mistyped digit therefore creates a real account for a stranger's number, or —
 * worse — finds an existing GoPasal customer and overwrites their name with the
 * rider's. Neither is undoable by the shop. See the mutation's comment in
 * `./seller-delivery`.
 *
 * The pattern is deliberately narrow: ten digits beginning `97`, `98` or `96`,
 * optionally with a `+977` or `977` country prefix and any spacing or dashes. It
 * is a *client* check — the server normalises and is the authority — so it is
 * allowed to be stricter about presentation and must never be looser about which
 * numbers are real.
 */
export function riderPhoneIssue(phone: string): RiderIssue | null {
  const digits = phone.replace(/[\s-]/g, "");
  const local = digits.replace(/^(?:\+?977)/, "");
  if (!/^9[678]\d{8}$/.test(local)) {
    return { field: "phone", message: "Enter a ten-digit Nepali mobile number." };
  }
  return null;
}

/** Everything wrong with a rider registration. */
export function riderDraftIssues(draft: { phone?: string; name?: string }): RiderIssue[] {
  const issues: RiderIssue[] = [];
  const phoneIssue = draft.phone ? riderPhoneIssue(draft.phone) : null;
  if (!draft.phone) issues.push({ field: "phone", message: "Enter the rider's mobile number." });
  else if (phoneIssue) issues.push(phoneIssue);

  const name = draft.name?.trim();
  if (!name || name.length < RIDER_NAME_MIN_LENGTH) {
    issues.push({ field: "name", message: "Enter the rider's name." });
  }
  return issues;
}
