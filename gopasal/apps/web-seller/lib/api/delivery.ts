/**
 * Seller delivery endpoints: the rider roster and the shop's delivery zones.
 *
 * One controller backs all of it —
 * `apps/api/src/modules/delivery/delivery.seller.controller.ts`, mounted at
 * `@Controller('seller/shops/:shopId')`. **Every route here is shop-scoped**,
 * including the ones that read as global elsewhere: removing a rider is
 * `DELETE /seller/shops/:shopId/riders/:riderId`, not `DELETE /riders/:riderId`.
 * That prefix is not cosmetic — it is how `PermissionsGuard` finds the shop whose
 * membership it must check, so there is no unscoped rider route for a seller to
 * call and no way to widen the question to another shop.
 *
 * Rider *assignment* and the delivery-status PATCH already live in
 * `./orders`, because the order-detail screen needed them first and they are
 * order-addressed (`…/orders/:orderId/assign`). They are re-exported below so a
 * delivery screen has one import surface, rather than moved, so that the
 * already-shipped screen is not disturbed.
 *
 * Permissions are not uniform across this file, and the split matters when
 * building UI: reads are `delivery.view`, rider register/remove and assignment
 * are `delivery.assign`, the delivery PATCH is `delivery.update`, and **zone
 * writes are `settings.manage`** — a delivery teammate can therefore see the
 * zones and never edit them.
 *
 * What the API does not have, so neither does this file: no ETA, no rider shift or
 * availability window, no proof-of-delivery photo upload — `DeliveryStatusDto` accepts
 * `status`, `podNote`, `codCollected` and `failReason` and 400s anything else, and the
 * uploads module has onboarding and product routes only — and no seller-side write for
 * a rider's ONLINE/OFFLINE status: `RiderStatus` is set by the rider's own
 * `PATCH /rider/status` and by the assign/complete transactions, so on a seller
 * screen it is display-only.
 */

import { authedRequest } from "./client";
import type { RiderStatusWire, VehicleTypeWire } from "./orders";

/*
 * Re-exported from `./orders` so the delivery screen has one import surface for the
 * routes it calls: rider assignment and the delivery-status PATCH are declared there
 * because the order-detail screen needed them first, and they are order-addressed
 * (`…/orders/:orderId/assign`), so moving them would have disturbed a shipped screen.
 *
 * Only the two types the delivery screen actually reads through this path are
 * re-exported with them. Five more once were — `DeliveryPatchBody`,
 * `DeliveryRiderWire`, `DeliveryWire`, `RiderStatusWire`, `ShopRiderWire` — and
 * nothing imported them from here: `lib/delivery-view.ts` and `lib/orders-view.ts`
 * both take them from `./api/orders`, where they are declared. A wire type is worth
 * one name and one path; a second path is a thing to keep in step for no reader.
 */
export type { DeliveryStatusWire, VehicleTypeWire } from "./orders";
export { assignRider, listShopRiders, patchDelivery, unassignRider } from "./orders";

/* -------------------------------------------------------------------- Riders */

/**
 * Body for `POST /seller/shops/:shopId/riders` (`RegisterRiderDto`).
 *
 * `name` is `@MinLength(2)`; `vehicleType` defaults to `MOTORBIKE` server-side
 * when omitted. The pipe runs `whitelist + forbidNonWhitelisted`, so an extra key
 * is a 400 — send exactly these three.
 *
 * Registering a rider is not a lightweight write. `DeliveryService.registerRider`
 * normalises the phone and **upserts a `User`**: an unknown number gets an
 * account created, and a known one gets its `name` overwritten with what is typed
 * here. The screen must say so before it submits, because there is no undo.
 */
export type RegisterRiderBody = {
  phone: string;
  name: string;
  vehicleType?: VehicleTypeWire;
};

/**
 * What `POST riders` answers with — deliberately *not* a `ShopRiderWire`.
 *
 * The service returns the `Rider` row with `include: { user: { select: { name,
 * phone } } }`, so there is no `avatarUrl`, no `activeDeliveries`, no `_count`
 * and no `location`. Typing it as the roster row would invite a caller to splice
 * this into a loaded list and blank those fields; refetch the roster instead.
 */
export type RegisteredRiderWire = {
  id: string;
  userId: string;
  shopId: string | null;
  vehicleType: VehicleTypeWire;
  status: RiderStatusWire;
  lat: number | null;
  lng: number | null;
  heading: number | null;
  speed: number | null;
  accuracy: number | null;
  lastPingAt: string | null;
  createdAt: string;
  updatedAt: string;
  user: { name: string | null; phone: string };
};

/**
 * `delivery.assign`. Adds someone to the shop's rider roster by phone number.
 *
 * 400s with `'This person is already a rider for another shop'` when the number
 * belongs to a rider attached elsewhere — self-delivery means one rider, one
 * shop. Re-registering the shop's own rider is an update, not an error.
 */
export function registerRider(
  shopId: string,
  body: RegisterRiderBody,
  signal?: AbortSignal,
): Promise<RegisteredRiderWire> {
  return authedRequest<RegisteredRiderWire>(`/seller/shops/${encodeURIComponent(shopId)}/riders`, {
    method: "POST",
    body,
    signal,
  });
}

/**
 * `delivery.assign`. Takes a rider off the roster.
 *
 * Refused with 400 `'Rider still has active deliveries'` while any delivery of
 * theirs is `ASSIGNED`, `PICKED_UP` or `EN_ROUTE`, so the roster's
 * `activeDeliveries` count is exactly the precondition — a UI that hides the
 * button at `activeDeliveries > 0` and explains why will never surprise anyone.
 * Note this deletes the `Rider`, not the `User`: the person keeps their account.
 */
export function removeRider(
  shopId: string,
  riderId: string,
  signal?: AbortSignal,
): Promise<{ removed: true }> {
  return authedRequest<{ removed: true }>(
    `/seller/shops/${encodeURIComponent(shopId)}/riders/${encodeURIComponent(riderId)}`,
    { method: "DELETE", signal },
  );
}

/* --------------------------------------------------------------------- Zones */

/** One vertex of a zone polygon. `@IsLatitude` / `@IsLongitude` on the way in. */
export type LatLngWire = { lat: number; lng: number };

/**
 * A `DeliveryZone` row.
 *
 * `polygon` is typed `unknown` on purpose. In the schema it is a `Json` column,
 * and Prisma will hand back whatever is stored — the API validates the *write*
 * (`@ValidateNested` over `LatLngDto`, at least 3 points) but nothing re-validates
 * the read, and rows written by a seed or a migration are not covered by that DTO
 * at all. Narrowing it here would be a claim this file cannot make; the view
 * model parses it defensively instead.
 *
 * `feeOverride` is whole NPR rupees and `null` means "use the shop's normal fee",
 * not zero. Zero is a real, different value: free delivery inside this zone.
 */
export type DeliveryZoneWire = {
  id: string;
  shopId: string;
  name: string;
  polygon: unknown;
  feeOverride: number | null;
  createdAt: string;
};

/**
 * Body for `POST zones` and `PATCH zones/:zoneId` (`UpsertZoneDto`).
 *
 * PATCH takes the same DTO as POST, so it is a **replace, not a merge**: send the
 * whole polygon every time, and omitting `feeOverride` clears it (the service
 * writes `feeOverride ?? null`). `name` is `@MinLength(2)`; fewer than 3 points
 * is 400 `'A zone needs at least 3 points'`.
 */
export type UpsertZoneBody = {
  name: string;
  polygon: LatLngWire[];
  feeOverride?: number;
};

/** `delivery.view`. The shop's zones, oldest first. No pagination. */
export function listShopZones(
  shopId: string,
  signal?: AbortSignal,
): Promise<DeliveryZoneWire[]> {
  return authedRequest<DeliveryZoneWire[]>(`/seller/shops/${encodeURIComponent(shopId)}/zones`, {
    signal,
  });
}

/** `settings.manage` — note: *not* a delivery permission. */
export function createShopZone(
  shopId: string,
  body: UpsertZoneBody,
  signal?: AbortSignal,
): Promise<DeliveryZoneWire> {
  return authedRequest<DeliveryZoneWire>(`/seller/shops/${encodeURIComponent(shopId)}/zones`, {
    method: "POST",
    body,
    signal,
  });
}

/** `settings.manage`. Replaces the zone wholesale; 404s on another shop's zone. */
export function updateShopZone(
  shopId: string,
  zoneId: string,
  body: UpsertZoneBody,
  signal?: AbortSignal,
): Promise<DeliveryZoneWire> {
  return authedRequest<DeliveryZoneWire>(
    `/seller/shops/${encodeURIComponent(shopId)}/zones/${encodeURIComponent(zoneId)}`,
    { method: "PATCH", body, signal },
  );
}

/** `settings.manage`. Hard delete — there is no soft-delete or restore. */
export function deleteShopZone(
  shopId: string,
  zoneId: string,
  signal?: AbortSignal,
): Promise<{ removed: true }> {
  return authedRequest<{ removed: true }>(
    `/seller/shops/${encodeURIComponent(shopId)}/zones/${encodeURIComponent(zoneId)}`,
    { method: "DELETE", signal },
  );
}
