/**
 * Seller order + delivery endpoints.
 *
 * Two controllers back this file:
 * - `apps/api/src/modules/orders/orders.seller.controller.ts` — the queue, one
 *   order, and the five lifecycle transitions (accept / reject / pack /
 *   dispatch / cancel).
 * - `apps/api/src/modules/delivery/delivery.seller.controller.ts` — the shop's
 *   rider roster, rider assignment, and the delivery-status PATCH.
 *
 * Both live under `/seller/shops/:shopId/...`, which is what lets the API's
 * `PermissionsGuard` resolve the shop from the route and check the caller's
 * membership. There is no cross-shop order endpoint, by design: a caller holding
 * `orders.view` on one shop must not be able to widen the question.
 *
 * Three properties of this API shape the callers:
 *
 * 1. **Every transition returns a bare `Order` row — no `items`, no `delivery`,
 *    no `events`, no `tracking`.** Merging that response into a loaded detail
 *    view would silently blank the lines and the rider. So each action helper
 *    returns `OrderRowWire` and callers must refetch instead of merging.
 * 2. **Dispatch needs a rider first.** `OrdersService.dispatch` 400s with
 *    `'Assign a rider before dispatching'` unless `delivery.riderId` is set, so
 *    the UI must offer assignment before dispatch, not after.
 * 3. **The delivery PATCH is the only seller path to `DELIVERED`.** It also
 *    cascades the order status (`EN_ROUTE` → `OUT_FOR_DELIVERY`, `DELIVERED` →
 *    `DELIVERED`) with actor `SYSTEM`. `PACKED → OUT_FOR_DELIVERY` admits only
 *    actor `SHOP`, so patching a delivery to `EN_ROUTE` while the order is still
 *    `PACKED` writes the delivery row and *then* throws 403. Always
 *    `dispatchOrder` first; `patchDelivery` is for the steps after that.
 *
 * The queue itself pages, searches and filters **on the server** — see
 * {@link listShopOrders} — and returns a `summary` counted over the whole shop
 * queue, which is what a stat card must render. A count that shrank because a
 * seller switched tabs would read as a fact about the shop.
 *
 * Fields below are typed exactly as Prisma serialises them — `null` for an unset
 * nullable column, never `undefined` — so a missing value is a real absence
 * rather than a mapping bug downstream.
 */

import type { Paginated } from "@gopasal/api-client";
import { authedRequest } from "./client";

/* -------------------------------------------------------------- Enumerations */

/** `OrderStatus` in `prisma/schema.prisma`. Terminal: DELIVERED/CANCELLED/REJECTED. */
export type OrderStatusWire =
  | "PLACED"
  | "ACCEPTED"
  | "PACKED"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED"
  | "REJECTED";

export type PaymentMethodWire = "COD" | "ESEWA" | "KHALTI";
export type PaymentStatusWire = "PENDING" | "PAID" | "FAILED" | "REFUNDED";

export type DeliveryStatusWire =
  | "UNASSIGNED"
  | "ASSIGNED"
  | "PICKED_UP"
  | "EN_ROUTE"
  | "DELIVERED"
  | "FAILED";

export type RiderStatusWire = "OFFLINE" | "ONLINE" | "ON_DELIVERY";
export type VehicleTypeWire = "BICYCLE" | "MOTORBIKE" | "SCOOTER" | "WALK" | "VAN";

/* ------------------------------------------------------------------ Wire rows */

/**
 * A bare `Order` row: what every transition POST answers with, and the scalar
 * half of both the list and the detail.
 *
 * Note what is *not* here. There is no customer relation and no address
 * relation — the seller sees the snapshot columns (`recipientName`,
 * `recipientPhone`, `area`, `landmark`, `fullAddress`) and nothing more, so an
 * address edit after checkout cannot rewrite an order. There is also no SLA
 * deadline and no promised delivery time: the schema has neither.
 */
export type OrderRowWire = {
  id: string;
  /** Human-facing code, e.g. `GP-482913`. */
  code: string;
  customerId: string;
  shopId: string;
  status: OrderStatusWire;

  addressId: string | null;
  recipientName: string;
  recipientPhone: string;
  area: string;
  landmark: string | null;
  fullAddress: string;
  lat: number | null;
  lng: number | null;

  /** Money is whole NPR rupees, not paisa. */
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;

  paymentMethod: PaymentMethodWire;
  paymentStatus: PaymentStatusWire;

  couponId: string | null;
  note: string | null;

  placedAt: string;
  acceptedAt: string | null;
  packedAt: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;

  createdAt: string;
  updatedAt: string;
  groupOrderId: string | null;
};

/** One line of an order. Names and units are snapshots, so renames don't rewrite history. */
export type OrderItemWire = {
  id: string;
  orderId: string;
  productId: string | null;
  variantId: string | null;
  nameSnapshot: string;
  unitSnapshot: string | null;
  /** Unit price at the time of checkout, whole NPR. */
  price: number;
  qty: number;
};

/** Append-only status history. `note` carries the reject/cancel reason. */
export type OrderEventWire = {
  id: string;
  orderId: string;
  status: OrderStatusWire;
  note: string | null;
  actorId: string | null;
  createdAt: string;
};

/** The rider as it appears nested inside a `Delivery`. */
export type DeliveryRiderWire = {
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
 * The delivery leg. Created at checkout, so in practice always present — but
 * typed nullable because it is an optional relation and a null here must read as
 * "no leg", not as a bug.
 *
 * `distanceMeters` is the only distance the API has, and it is nullable. There is
 * no ETA field anywhere on the seller side.
 */
export type DeliveryWire = {
  id: string;
  orderId: string;
  riderId: string | null;
  status: DeliveryStatusWire;
  destLat: number | null;
  destLng: number | null;
  distanceMeters: number | null;
  assignedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  failReason: string | null;
  podNote: string | null;
  podImageUrl: string | null;
  codCollected: boolean;
  codAmount: number;
  createdAt: string;
  updatedAt: string;
  rider: DeliveryRiderWire | null;
};

/** One row of `GET /seller/shops/:shopId/orders` (`OrdersService.listForShop`). */
export type SellerOrderListItemWire = OrderRowWire & {
  items: OrderItemWire[];
  delivery: DeliveryWire | null;
};

/**
 * `GET /seller/shops/:shopId/orders/:orderId` (`ORDER_DETAIL_INCLUDE` plus the
 * `tracking` object `withTracking` attaches).
 *
 * `tracking.rider` is non-null only while the order is `OUT_FOR_DELIVERY` *and*
 * the rider has a persisted position; `stale` is true when the last ping is over
 * 30 seconds old. It is a live-position feed, not an estimate.
 */
export type SellerOrderDetailWire = OrderRowWire & {
  shop: {
    id: string;
    name: string;
    slug: string;
    phone: string | null;
    area: string | null;
    lat: number | null;
    lng: number | null;
  };
  items: OrderItemWire[];
  events: OrderEventWire[];
  coupon: { code: string; type: "PERCENT" | "FLAT"; value: number } | null;
  delivery: DeliveryWire | null;
  tracking: {
    status: OrderStatusWire;
    deliveryStatus: DeliveryStatusWire | null;
    destination: { lat: number; lng: number } | null;
    origin: { lat: number; lng: number } | null;
    rider: {
      name: string;
      phone: string;
      vehicleType: VehicleTypeWire;
      lat: number;
      lng: number;
      heading: number | null;
      speed: number | null;
      lastPingAt: string | null;
      stale: boolean;
    } | null;
  };
};

/** One row of `GET /seller/shops/:shopId/riders` (`DeliveryService.listRiders`). */
export type ShopRiderWire = {
  id: string;
  userId: string;
  shopId: string | null;
  vehicleType: VehicleTypeWire;
  status: RiderStatusWire;
  lat: number | null;
  lng: number | null;
  lastPingAt: string | null;
  createdAt: string;
  updatedAt: string;
  user: { name: string | null; phone: string; avatarUrl: string | null };
  /** Deliveries currently ASSIGNED, PICKED_UP or EN_ROUTE. */
  activeDeliveries: number;
  _count: { deliveries: number };
  /** Latest cached ping, or null if the rider has never reported a position. */
  location: {
    lat: number;
    lng: number;
    heading?: number | null;
    speed?: number | null;
    accuracy?: number | null;
    at?: string | null;
  } | null;
};

/* --------------------------------------------------------------------- Reads */

/** `PaginationDto`-style cap: `limit` above 100 is a 400. */
export const ORDER_PAGE_LIMIT = 100;

/** How many pages {@link listAllShopOrders} will read for one shop before stopping. */
export const ORDER_MAX_PAGES = 5;

/** `ORDER_SORTS` in `apps/api/src/modules/orders/dto/orders.dto.ts`. */
export type OrderSortWire = "newest" | "oldest";

/**
 * Everything `GET /seller/shops/:shopId/orders` accepts.
 *
 * `status` is a *list*, because the console's tabs are status groups rather than
 * single statuses — "In progress" is `ACCEPTED`, `PACKED` and `OUT_FOR_DELIVERY`
 * together. The API takes them comma-separated and validates each against the
 * `OrderStatus` enum, so an unknown value is a 400 rather than a silent empty page.
 */
export type OrderQuery = {
  page?: number;
  limit?: number;
  /** Matches order code, recipient name or delivery area, case-insensitively. */
  q?: string;
  status?: OrderStatusWire[];
  sort?: OrderSortWire;
};

/**
 * The counts the API returns beside every page, over the **whole shop queue**.
 *
 * Deliberately unaffected by `status` and `q`: the console's stat cards are claims
 * about the shop, and a "needs action" count that fell to zero because someone
 * filtered to Delivered would be a lie about work still waiting.
 *
 * `codOutstanding` is rupees of cash-on-delivery across orders that have not reached
 * a terminal state, summed from the order totals themselves. There is no ledger or
 * settlement table behind it, so it must never be presented as a payout figure.
 */
export type OrderQueueSummaryWire = {
  total: number;
  /** `PLACED` — waiting for the shop to accept or reject. */
  needsAction: number;
  /** `ACCEPTED`, `PACKED` or `OUT_FOR_DELIVERY`. */
  inProgress: number;
  delivered: number;
  /** `REJECTED` or `CANCELLED`. */
  closed: number;
  codOutstanding: number;
};

/** One page of the queue plus the shop-wide summary. */
export type OrderPageWire = Paginated<SellerOrderListItemWire> & {
  summary: OrderQueueSummaryWire;
};

function orderQueryString(query: OrderQuery): string {
  const params = new URLSearchParams();
  params.set("page", String(query.page ?? 1));
  params.set("limit", String(query.limit ?? ORDER_PAGE_LIMIT));
  // An empty search box must not become `q=`: the API trims and ignores it, but
  // sending it makes the request URL differ for no reason.
  const q = query.q?.trim();
  if (q) params.set("q", q);
  if (query.status?.length) params.set("status", query.status.join(","));
  if (query.sort) params.set("sort", query.sort);
  return `?${params.toString()}`;
}

/**
 * One page of a shop's order queue, filtered, searched and sorted by the server.
 *
 * This used to return a bare array of the shop's entire history, with items,
 * delivery, rider and rider's user eagerly included and no `take` — fine for forty
 * orders, a slowly growing outage for forty thousand. The console filtered that array
 * in the browser, which also meant a seller could search for an order they owned and
 * be told it was not there once the queue outgrew what one read could carry.
 */
export function listShopOrders(
  shopId: string,
  query: OrderQuery = {},
  signal?: AbortSignal,
): Promise<OrderPageWire> {
  return authedRequest<OrderPageWire>(
    `/seller/shops/${encodeURIComponent(shopId)}/orders${orderQueryString(query)}`,
    { signal },
  );
}

/**
 * As much of one shop's *matching* queue as a bounded number of requests can read.
 *
 * The order screens are consolidated multi-shop views and the API pages one shop at a
 * time; there is no endpoint that pages across shops, and inventing a merged cursor in
 * the browser would mean holding every shop's rows anyway. So each shop is read up to
 * {@link ORDER_MAX_PAGES} pages deep and the results concatenated.
 *
 * `truncated` reports when it stopped short. A filtered list drawn from a truncated
 * read has to say so, or its "nothing here" is a claim about rows nobody fetched.
 */
export async function listAllShopOrders(
  shopId: string,
  query: OrderQuery = {},
  signal?: AbortSignal,
  maxPages = ORDER_MAX_PAGES,
): Promise<{
  orders: SellerOrderListItemWire[];
  matched: number;
  truncated: boolean;
  summary: OrderQueueSummaryWire;
}> {
  const first = await listShopOrders(shopId, { ...query, page: 1 }, signal);
  const orders = [...first.data];
  const pages = Math.min(first.meta.totalPages, maxPages);
  for (let page = 2; page <= pages; page++) {
    const next = await listShopOrders(shopId, { ...query, page }, signal);
    orders.push(...next.data);
  }
  return {
    orders,
    matched: first.meta.total,
    truncated: orders.length < first.meta.total,
    summary: first.summary,
  };
}

/**
 * The identity element for `mergeOrderSummaries` — a seed, not a display value.
 *
 * It used to be exported, and the orders page used it as the initial state, which
 * meant every card asserted `0` before the first request had answered and again
 * after one failed. A screen has no business showing an all-zero summary it was
 * never given: that is the difference between "no orders need action" and "we do
 * not know yet". The page now holds `OrderQueueSummaryWire | null` and renders "—".
 */
const EMPTY_ORDER_SUMMARY: OrderQueueSummaryWire = {
  total: 0,
  needsAction: 0,
  inProgress: 0,
  delivered: 0,
  closed: 0,
  codOutstanding: 0,
};

/** Add up per-shop queue summaries for a consolidated view. Every field is a count or a sum. */
export function mergeOrderSummaries(parts: OrderQueueSummaryWire[]): OrderQueueSummaryWire {
  return parts.reduce<OrderQueueSummaryWire>(
    (acc, s) => ({
      total: acc.total + s.total,
      needsAction: acc.needsAction + s.needsAction,
      inProgress: acc.inProgress + s.inProgress,
      delivered: acc.delivered + s.delivered,
      closed: acc.closed + s.closed,
      codOutstanding: acc.codOutstanding + s.codOutstanding,
    }),
    EMPTY_ORDER_SUMMARY,
  );
}


/** One order in full. 404s if the order belongs to a different shop. */
export function fetchShopOrder(
  shopId: string,
  orderId: string,
  signal?: AbortSignal,
): Promise<SellerOrderDetailWire> {
  return authedRequest<SellerOrderDetailWire>(
    `/seller/shops/${encodeURIComponent(shopId)}/orders/${encodeURIComponent(orderId)}`,
    { signal },
  );
}

/** The shop's own rider roster (`delivery.view`). Self-delivery, so these are the shop's people. */
export function listShopRiders(shopId: string, signal?: AbortSignal): Promise<ShopRiderWire[]> {
  return authedRequest<ShopRiderWire[]>(
    `/seller/shops/${encodeURIComponent(shopId)}/riders`,
    { signal },
  );
}

/* ------------------------------------------------------------------- Actions */

/**
 * The five order transitions.
 *
 * Each answers 201 with a bare `OrderRowWire`. The API's `ValidationPipe` runs
 * `whitelist + forbidNonWhitelisted`, so one unexpected body key is a 400: send
 * `{ note }` only, and only when there is a note.
 */
function transition(
  shopId: string,
  orderId: string,
  action: "accept" | "pack" | "dispatch" | "cancel",
  note?: string,
  signal?: AbortSignal,
): Promise<OrderRowWire> {
  return authedRequest<OrderRowWire>(
    `/seller/shops/${encodeURIComponent(shopId)}/orders/${encodeURIComponent(orderId)}/${action}`,
    { method: "POST", body: note ? { note } : {}, signal },
  );
}

/** `orders.accept`. Legal from `PLACED` only. */
export function acceptOrder(shopId: string, orderId: string, note?: string, signal?: AbortSignal) {
  return transition(shopId, orderId, "accept", note, signal);
}

/**
 * `orders.reject`. Legal from `PLACED` only, and the reason is **required** —
 * `RejectOrderDto.reason` is `@IsString()` with no `@IsOptional()`, so an empty
 * body is a 400. It is stored on `Order.cancelReason` and on the event, i.e. the
 * customer reads it.
 */
export function rejectOrder(
  shopId: string,
  orderId: string,
  reason: string,
  signal?: AbortSignal,
): Promise<OrderRowWire> {
  return authedRequest<OrderRowWire>(
    `/seller/shops/${encodeURIComponent(shopId)}/orders/${encodeURIComponent(orderId)}/reject`,
    { method: "POST", body: { reason }, signal },
  );
}

/** `orders.pack`. Legal from `ACCEPTED` only. */
export function packOrder(shopId: string, orderId: string, note?: string, signal?: AbortSignal) {
  return transition(shopId, orderId, "pack", note, signal);
}

/**
 * `orders.dispatch`. Legal from `PACKED` only, and 400s with
 * `'Assign a rider before dispatching'` when the delivery has no rider.
 */
export function dispatchOrder(shopId: string, orderId: string, note?: string, signal?: AbortSignal) {
  return transition(shopId, orderId, "dispatch", note, signal);
}

/**
 * `orders.cancel`. Legal from `PLACED`, `ACCEPTED` or `PACKED` — never after
 * dispatch, so the button must disappear once the order is out.
 */
export function cancelOrder(shopId: string, orderId: string, note?: string, signal?: AbortSignal) {
  return transition(shopId, orderId, "cancel", note, signal);
}

/**
 * `delivery.assign`. Assigns one of the shop's riders and moves the delivery to
 * `ASSIGNED`. Rejects a rider belonging to another shop (404), an order already
 * delivered or cancelled, and a delivery past `ASSIGNED`.
 *
 * Answers with the bare `Delivery` row — again no relations, so refetch.
 */
export function assignRider(
  shopId: string,
  orderId: string,
  riderId: string,
  signal?: AbortSignal,
): Promise<DeliveryWire> {
  return authedRequest<DeliveryWire>(
    `/seller/shops/${encodeURIComponent(shopId)}/orders/${encodeURIComponent(orderId)}/assign`,
    { method: "POST", body: { riderId }, signal },
  );
}

/** `delivery.assign`. Only legal while the delivery is still `ASSIGNED` (before pickup). */
export function unassignRider(
  shopId: string,
  orderId: string,
  signal?: AbortSignal,
): Promise<{ unassigned: true }> {
  return authedRequest<{ unassigned: true }>(
    `/seller/shops/${encodeURIComponent(shopId)}/orders/${encodeURIComponent(orderId)}/unassign`,
    { method: "POST", body: {}, signal },
  );
}

/**
 * `delivery.update` — walk the delivery leg forward.
 *
 * Machine: `ASSIGNED → PICKED_UP → EN_ROUTE → DELIVERED`, with `FAILED`
 * reachable from any of the three. A rider must be assigned or this 400s.
 *
 * `codCollected` is only read on `DELIVERED`, and only for a COD order; the API
 * then stamps `codAmount` from the order total itself, so the console never
 * sends an amount. `failReason` is only read on `FAILED`.
 *
 * These four keys are the whole body. `DeliveryStatusDto` runs under
 * `forbidNonWhitelisted`, so a fifth key is a 400, not an ignored field — which is
 * why there is no `podImageUrl` here even though the *response* carries one. That
 * column exists for a rider app that can upload; this console has no delivery upload
 * route to give it a value, and a string field would only invite one to be typed.
 */
export type DeliveryPatchBody = {
  status: DeliveryStatusWire;
  podNote?: string;
  codCollected?: boolean;
  failReason?: string;
};

export function patchDelivery(
  shopId: string,
  orderId: string,
  body: DeliveryPatchBody,
  signal?: AbortSignal,
): Promise<DeliveryWire> {
  return authedRequest<DeliveryWire>(
    `/seller/shops/${encodeURIComponent(shopId)}/orders/${encodeURIComponent(orderId)}/delivery`,
    { method: "PATCH", body, signal },
  );
}
