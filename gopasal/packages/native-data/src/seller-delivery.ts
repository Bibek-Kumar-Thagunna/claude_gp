/**
 * The shop's own delivery: who rides for it, where it will ride to, and how a leg
 * is walked forward.
 *
 * Backed by `apps/api/src/modules/delivery/delivery.seller.controller.ts`,
 * `@Controller('seller/shops/:shopId')`. **Every route is shop-scoped**, including
 * the ones that read as global elsewhere: removing a rider is
 * `DELETE /seller/shops/:shopId/riders/:riderId`, not `DELETE /riders/:riderId`.
 * That prefix is how `PermissionsGuard` finds the shop whose membership it must
 * check, so there is no unscoped rider route a seller could widen.
 *
 * Permissions are **not uniform**, and the split decides what a screen may offer:
 * reads are `delivery.view`; register, remove, assign and unassign are
 * `delivery.assign`; the delivery-status patch is `delivery.update`; and **zone
 * writes are `settings.manage`** — so a delivery teammate can see the zones and
 * never edit them, and a screen that renders one control for both will hand
 * somebody a 403.
 *
 * Reached as `@gopasal/native-data/seller-delivery`, and deliberately not
 * re-exported from `./index`.
 *
 * ## What is re-exported rather than redeclared
 *
 * The rider roster and rider assignment already live in `./seller`, because the
 * queue screen needed them first and assignment is order-addressed
 * (`…/orders/:orderId/assign`). They are re-exported below rather than moved, so a
 * delivery screen has one import surface and the shipped queue screen is not
 * disturbed — exactly the arrangement `apps/web-seller/lib/api/delivery.ts` made
 * for the same reason.
 *
 * That also settles the cache question. `qk.riders(shopId)` is `seller-wire.ts`'s
 * key, and this module *uses* it rather than declaring a second one: a
 * registration here has to refresh the picker the queue screen renders, and two
 * keys for one roster would mean a rider who exists on one screen and not the
 * other. Sharing a key across modules is the opposite of colliding, and the only
 * new key here is `deliveryQk.zones`.
 *
 * ## Writes go straight to `http`
 *
 * `./seller`'s reasoning, unchanged. A replayed delivery write is not the same
 * write: a queued `FAILED` sent ten minutes later marks a delivery failed that the
 * rider completed in the meantime, and the service's own optimistic check
 * (`updateMany` on the status it read) answers 409 rather than doing it — which
 * is the right outcome and is also proof that a silent replay was never wanted.
 * No seller route reads an `Idempotency-Key`.
 */
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGopasal } from "./GopasalProvider";
import {
  SELLER_STALE,
  type Delivery,
  type OrderStatus,
  type PaymentMethod,
  type VehicleType,
} from "./seller";
import { qk } from "./seller-wire";
import {
  deliveryQk,
  deliveryTransitionBody,
  type DeliveryTransition,
  type LatLng,
} from "./seller-delivery-wire";

/* ── one import surface ───────────────────────────────────────────────────── */

export {
  useRiderAssignment,
  useShopRiders,
} from "./seller";
export type {
  Delivery,
  DeliveryRider,
  DeliveryStatus,
  RiderStatus,
  ShopRider,
  VehicleType,
} from "./seller";

export {
  DELIVERY_NOTE_MAX_LENGTH,
  DELIVERY_NOTE_MIN_LENGTH,
  RIDER_NAME_MIN_LENGTH,
  ZONE_LIMITS,
  deliverabilityAt,
  deliveryQk,
  deliveryTransitionBody,
  deliveryTransitionIssue,
  distinctVertexCount,
  haversineMeters,
  nextDeliveryStates,
  nextLegStep,
  orderActions,
  parseZonePolygon,
  pointInZone,
  riderDraftIssues,
  riderPhoneIssue,
  zoneDraftIssues,
  zoneForPoint,
} from "./seller-delivery-wire";
export type {
  DeliveryTransition,
  LatLng,
  OrderActions,
  RiderIssue,
  ZoneDraft,
  ZoneIssue,
} from "./seller-delivery-wire";

/* ── riders ───────────────────────────────────────────────────────────────── */

/**
 * `RegisterRiderDto` — exactly three keys; `forbidNonWhitelisted` makes a fourth
 * a 400.
 *
 * `name` is `@MinLength(2)`. `vehicleType` defaults to `MOTORBIKE` server-side
 * when omitted.
 */
export type RegisterRiderInput = {
  /** Normalised by `normalizeNepalPhone` on arrival. See the warning below. */
  phone: string;
  name: string;
  vehicleType?: VehicleType;
};

/**
 * What `POST riders` answers with — deliberately **not** a `ShopRider`.
 *
 * `DeliveryService.registerRider` returns the `Rider` row with
 * `include: { user: { select: { name, phone } } }`, so there is no `avatarUrl`, no
 * `activeDeliveries`, no `_count` and no `location`. Typing it as the roster row
 * would invite a caller to splice this into a loaded list and blank those four
 * fields, which is why the roster is refetched instead.
 */
export type RegisteredRider = {
  id: string;
  userId: string;
  shopId: string | null;
  vehicleType: VehicleType;
  status: "OFFLINE" | "ONLINE" | "ON_DELIVERY";
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
 * Adding somebody to the shop's rider roster, and taking them off.
 *
 * ## Registering a rider creates or rewrites a person's GoPasal account
 *
 * This is the one write on the whole seller phone surface that reaches outside the
 * shop, and a screen must not send it without an explicit confirmation naming the
 * consequence.
 *
 * `DeliveryService.registerRider` normalises the phone number and then:
 *
 * ```ts
 * prisma.user.upsert({ where: { phone }, create: { phone, name }, update: { name } })
 * ```
 *
 * So for a number GoPasal has never seen, **an account is created** — a real
 * `User` row, reachable by OTP on that number, that the person did not ask for.
 * And for a number it *has* seen — a customer who orders from this very shop, a
 * rider at another shop, the seller's own spouse — **their name is overwritten**
 * with whatever was typed into this form. There is no confirmation step on the
 * server, no notification to the person, and no seller route that can put the old
 * name back: `update: { name }` runs unconditionally, and nothing on this surface
 * reads the previous value to show what it replaced.
 *
 * One digit wrong is therefore not a failed registration. It is a stranger's
 * account, renamed, with a rider attached to it.
 *
 * `./seller` left this out for exactly this reason and said so. It is here because
 * a shop taking on a delivery boy on a Saturday morning should not need a laptop
 * — but the confirmation is the price of it, and {@link riderPhoneIssue} exists so
 * an obvious typo is caught before the sheet is even shown. A screen should
 * display the normalised number back to the seller and ask them to read it aloud
 * against the rider's handset.
 *
 * The one case the API does refuse: a number already attached as a rider to a
 * *different* shop, 400 `'This person is already a rider for another shop'` —
 * self-delivery means one rider, one shop. Re-registering this shop's own rider is
 * an update, not an error, and it still overwrites the name.
 */
export function useRiderRoster(shopId: string | null | undefined) {
  const { http } = useGopasal();
  const qc = useQueryClient();

  const settle = React.useCallback(() => {
    void qc.invalidateQueries({ queryKey: qk.riders(shopId ?? "") });
  }, [qc, shopId]);

  return {
    /**
     * `delivery.assign`. **Upserts a `User`** — read this hook's comment before
     * wiring a button to it. Not undoable by the shop.
     */
    register: useMutation({
      mutationFn: (input: RegisterRiderInput) =>
        http.request<RegisteredRider>(`/seller/shops/${encodeURIComponent(shopId!)}/riders`, {
          method: "POST",
          body: input,
        }),
      onSuccess: settle,
    }),

    /**
     * `delivery.assign`. Take a rider off the roster.
     *
     * **A hard delete of the `Rider` row — and only of the `Rider` row.** There is
     * no `deletedAt`, no restore, and no way to undo it except by registering the
     * same number again, which upserts the `User` all over again. The person's
     * account survives untouched: `prisma.rider.delete` removes the roster
     * attachment, not the human. That distinction is the whole of the honest
     * confirmation copy — "remove from your riders", never "delete this person".
     *
     * Delivery history survives too, which is why the precondition exists: the
     * service refuses with 400 `'Rider still has active deliveries'` while any leg
     * of theirs is `ASSIGNED`, `PICKED_UP`, `EN_ROUTE`, `RETURNING_TO_SHOP`, or
     * `FAILED` after a pickup. The roster row's `activeDeliveries` is exactly that
     * count, so a screen that hides the button at `activeDeliveries > 0` and says
     * why will never surprise anyone.
     */
    remove: useMutation({
      mutationFn: (riderId: string) =>
        http.request<{ removed: true }>(
          `/seller/shops/${encodeURIComponent(shopId!)}/riders/${encodeURIComponent(riderId)}`,
          { method: "DELETE" },
        ),
      onSuccess: settle,
    }),
  };
}

/* ── the delivery leg ─────────────────────────────────────────────────────── */

/**
 * What the delivery-status PATCH answers with — and it is **not** `./seller`'s
 * `Delivery`.
 *
 * `DeliveryService` loads the leg with `DELIVERY_INCLUDE`, which includes the
 * order's `shopId`, `customerId`, `code`, `status`, `paymentMethod` and `total` and
 * **no rider relation at all**, then passes it through `toSafeDeliveryView`, which
 * strips `podImageUrl` and replaces it with `hasProofPhoto`.
 *
 * So the response has an `order` the nested-in-an-order shape does not, and lacks
 * the `rider` that shape does. `./seller`'s `Delivery` describes the leg as it
 * appears *inside* `GET …/orders/:orderId`, where the rider is included — and its
 * `useRiderAssignment` types this same family of responses as that, which
 * overstates them: a caller reading `.rider` off an assign or patch result finds
 * `undefined` where the type promised a rider or an explicit `null`. Rather than
 * inherit that, this module says what the route sends. Neither hook's *behaviour*
 * depends on it — both refetch rather than merge, which is why the inaccuracy has
 * never bitten.
 *
 * `order.status` is worth reading: the patch cascades it, so this is where a screen
 * learns that the order has just moved to `OUT_FOR_DELIVERY` or `DELIVERED`.
 */
export type DeliveryLeg = Omit<Delivery, "rider"> & {
  order: {
    shopId: string;
    customerId: string;
    code: string;
    status: OrderStatus;
    paymentMethod: PaymentMethod;
    total: number;
  };
};

/**
 * Walk a delivery forward: picked up, on the way, delivered — or failed, and back.
 *
 * `delivery.update`, which is a different permission from assignment. The machine
 * is in `./seller-delivery-wire`'s {@link nextDeliveryStates}; the body shapes are
 * {@link DeliveryTransition}, written as a union because the service requires a
 * different field for each target and the DTO's decorators do not say so.
 *
 * Two ordering constraints will otherwise be discovered the hard way:
 *
 *  - **A rider must be assigned first.** Every transition 400s with
 *    `'No rider assigned'` otherwise, and assignment is `useRiderAssignment`.
 *  - **`dispatch` the order before patching to `EN_ROUTE`.** The delivery patch
 *    cascades the *order* status with actor `SYSTEM`, and `PACKED →
 *    OUT_FOR_DELIVERY` admits only actor `SHOP` — so patching a delivery to
 *    `EN_ROUTE` while the order is still `PACKED` writes the delivery row and
 *    *then* throws 403, leaving the two out of step. `./seller`'s
 *    `useOrderTransitions` with `dispatch` comes first.
 *
 * A 409 `'Delivery status changed; refresh before taking the next step'` is the
 * service's optimistic check firing: somebody else moved the leg between this
 * screen's read and its write. It is not retryable — refetch and show the seller
 * where the leg actually is.
 *
 * Answers with a {@link DeliveryLeg}, which carries no rider relation, so the
 * order is refetched rather than patched: the rider's name and phone are not in
 * this response, and the order's own status may have cascaded underneath it.
 */
export function useDeliveryStatus(shopId: string | null | undefined) {
  const { http } = useGopasal();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: { orderId: string; transition: DeliveryTransition }) =>
      http.request<DeliveryLeg>(
        `/seller/shops/${encodeURIComponent(shopId!)}/orders/${encodeURIComponent(input.orderId)}/delivery`,
        { method: "PATCH", body: deliveryTransitionBody(input.transition) },
      ),
    onSettled: (_data, _error, input) => {
      void qc.invalidateQueries({ queryKey: qk.order(shopId ?? "", input.orderId) });
      // The queue, because the order status cascades: EN_ROUTE moves the order to
      // OUT_FOR_DELIVERY and DELIVERED moves it to DELIVERED, so the card is in a
      // different tab than it was a moment ago.
      void qc.invalidateQueries({ queryKey: qk.ordersRoot(shopId ?? "") });
      // The roster, because a completed or failed leg releases the rider back to
      // ONLINE and changes `activeDeliveries` — which is what decides whether they
      // may be given the next job, and whether they can be removed at all.
      void qc.invalidateQueries({ queryKey: qk.riders(shopId ?? "") });
      // The money, because a COD delivery stamps `codCollected` and `codAmount`,
      // and `codOutstanding` on the queue summary and the finance block are both
      // computed from delivered COD orders.
      void qc.invalidateQueries({ queryKey: qk.finance(shopId ?? "") });
    },
  });
}

/* ── zones ────────────────────────────────────────────────────────────────── */

/**
 * A `DeliveryZone` row.
 *
 * `polygon` is typed `unknown` on purpose, and it is not laziness. The column is
 * `Json`; the API validates the *write* (`@ValidateNested` over `LatLngDto`, 3–50
 * points) and nothing re-validates the *read*, and rows written by a seed or a
 * migration were never covered by that DTO at all. Narrowing it here would be a
 * claim this module cannot make — {@link parseZonePolygon} makes the claim
 * defensibly instead, and returns null for a row it cannot read.
 *
 * `feeOverride` is whole NPR rupees and `null` means "use the platform's distance
 * formula", not zero. Zero is a real and different value: free delivery inside
 * this zone.
 */
export type DeliveryZone = {
  id: string;
  shopId: string;
  name: string;
  polygon: unknown;
  feeOverride: number | null;
  createdAt: string;
};

/**
 * The shop's zones, oldest first. `delivery.view`.
 *
 * A bare array — no pagination, no summary. Oldest-first is not decoration: it is
 * the order `OrdersService.serviceability` iterates when two zones overlap, so it
 * is the order that decides which `feeOverride` a checkout applies.
 *
 * `SELLER_STALE.counter` because zones are a settings-shaped thing that two people
 * can nonetheless edit at once, and a minute is short enough that a map screen and
 * a colleague's laptop do not disagree for long.
 */
export function useShopZones(shopId: string | null | undefined) {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: deliveryQk.zones(shopId ?? ""),
    staleTime: SELLER_STALE.counter,
    enabled: Boolean(shopId) && Boolean(user),
    queryFn: () =>
      http.request<DeliveryZone[]>(`/seller/shops/${encodeURIComponent(shopId!)}/zones`),
  });
}

/**
 * `UpsertZoneDto` — the body for both create and update, which is the important
 * part.
 *
 * `PATCH` takes the same DTO as `POST`, so it is a **replace, not a merge**: send
 * the whole polygon every time, and **omitting `feeOverride` clears it**, because
 * the service writes `feeOverride ?? null` on both paths. A screen that patched
 * only a name would silently drop the zone's fee, which is money.
 */
export type ZoneInput = {
  /** `@MinLength(2) @MaxLength(80)`. */
  name: string;
  /** 3–50 vertices. Fewer is 400 `'A zone needs at least 3 points'`. */
  polygon: LatLng[];
  /** Whole rupees, 0–100,000. Omit to clear — see above. */
  feeOverride?: number;
};

/**
 * Draw, redraw and delete the shop's delivery zones.
 *
 * `settings.manage`, **not** a delivery permission: a teammate who can see and
 * assign deliveries cannot touch these. Worth checking before rendering the
 * controls, because the 403 arrives after the seller has drawn a polygon.
 *
 * ## What a zone actually does
 *
 * Only one thing, and only in one circumstance. At checkout,
 * `OrdersService.serviceability` measures the destination against the shop's
 * `deliveryRadiusKm`; **inside the radius the order is deliverable and no zone is
 * consulted**. Outside it, the first zone containing the destination makes the
 * order deliverable and its `feeOverride` becomes the delivery fee. Everywhere
 * else the platform's distance formula applies.
 *
 * So a zone drawn over the shop's own street changes nothing at all, and a zone is
 * the tool for reaching *past* the radius — an apartment block across the river, a
 * college the shop delivers to for a flat forty rupees. {@link deliverabilityAt}
 * answers the combined question, and a screen that shows only the polygons will
 * mislead a seller about both halves of it.
 *
 * Adding or redrawing a zone changes where the shop delivers, so the zone list is
 * invalidated — and the shop list is *not*. `storefront.blockers` is about
 * approval, a verified pin and at least one deliverable product; a zone is none of
 * those, and refetching the shop list on every vertex drag would be requests for
 * an answer that cannot have moved.
 */
export function useZoneActions(shopId: string | null | undefined) {
  const { http } = useGopasal();
  const qc = useQueryClient();

  const settle = React.useCallback(() => {
    void qc.invalidateQueries({ queryKey: deliveryQk.zones(shopId ?? "") });
  }, [qc, shopId]);

  return {
    /** `settings.manage`. Answers with the created row. */
    create: useMutation({
      mutationFn: (input: ZoneInput) =>
        http.request<DeliveryZone>(`/seller/shops/${encodeURIComponent(shopId!)}/zones`, {
          method: "POST",
          body: input,
        }),
      onSuccess: settle,
    }),

    /**
     * `settings.manage`. A **replace**: the whole polygon, every time, and an
     * omitted `feeOverride` clears the stored one. 404s on another shop's zone.
     */
    update: useMutation({
      mutationFn: (input: { zoneId: string; zone: ZoneInput }) =>
        http.request<DeliveryZone>(
          `/seller/shops/${encodeURIComponent(shopId!)}/zones/${encodeURIComponent(input.zoneId)}`,
          { method: "PATCH", body: input.zone },
        ),
      onSuccess: settle,
    }),

    /**
     * `settings.manage`.
     *
     * **A hard delete.** `prisma.deliveryZone.delete`, no soft flag, no restore,
     * and the polygon is not recoverable — a seller who drew fifty points around a
     * neighbourhood draws them again. Orders already placed are unaffected: the
     * fee was resolved at checkout and stored on the order.
     *
     * The consequence to put in the confirmation is not "a zone is gone" but its
     * effect: addresses outside the shop's radius that only this zone covered stop
     * being deliverable at all.
     */
    remove: useMutation({
      mutationFn: (zoneId: string) =>
        http.request<{ removed: true }>(
          `/seller/shops/${encodeURIComponent(shopId!)}/zones/${encodeURIComponent(zoneId)}`,
          { method: "DELETE" },
        ),
      onSuccess: settle,
    }),
  };
}

/* ── what is not here ─────────────────────────────────────────────────────── */

/**
 * Three things a phone-first seller will look for and the API cannot answer.
 *
 *  - **A rider's ONLINE/OFFLINE state is not the shop's to set.** `RiderStatus` is
 *    written by the rider's own `PATCH /rider/status` and by the assign and
 *    complete transactions, and there is no seller route for it. On this surface
 *    it is display-only, and `ShopRider.status` says so. A shop whose rider forgot
 *    to go online cannot fix it from here — `assignRider` refuses with
 *    `'Rider must be online and available'` and the rider has to open their own
 *    app.
 *  - **There is no ETA anywhere.** `Delivery.distanceMeters` is the only distance
 *    the API stores and it is nullable; `estimateDurationSeconds` exists in the
 *    API's geo helpers and no seller route returns it. A screen must not compute
 *    one and present it as the platform's.
 *  - **Proof-of-delivery photos are read-only here, and not through this module.**
 *    `Delivery.hasProofPhoto` says whether one exists; the bytes come from the
 *    authenticated endpoints in `delivery-proof.controller.ts`, which audit every
 *    read because the photograph is of a customer's doorstep. `DeliveryStatusDto`
 *    deliberately has no `podImageUrl` — proof supplied by the party being
 *    questioned is not proof — so this module cannot attach one and must not
 *    pretend to.
 */
