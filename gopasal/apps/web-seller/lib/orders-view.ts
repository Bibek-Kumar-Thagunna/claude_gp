/**
 * The seller console's own view of an order.
 *
 * The API hands back Prisma rows: nullable columns everywhere, money as whole
 * rupees, and two parallel state machines (order status and delivery status)
 * that the screens have to reason about together. This module does that
 * reasoning once, so a page never has to work out from
 * `status === "PACKED" && delivery?.riderId` whether a Dispatch button belongs on
 * screen.
 *
 * What it deliberately does **not** do is invent anything. There is no SLA
 * deadline in the schema, no promised delivery window and no ETA on any seller
 * route, so there is no field for one here — a countdown drawn from a made-up
 * deadline would be a promise GoPasal never made to the customer. Distance is
 * carried only when the API actually computed it (`Delivery.distanceMeters`,
 * nullable), and the rider is only ever named from the real roster.
 */

import type {
  DeliveryStatusWire,
  DeliveryWire,
  OrderEventWire,
  OrderItemWire,
  OrderQueueSummaryWire,
  OrderStatusWire,
  SellerOrderDetailWire,
  SellerOrderListItemWire,
  ShopRiderWire,
} from "./api/orders";

/* ------------------------------------------------------------------- Labels */

const ORDER_STATUS_LABELS: Record<OrderStatusWire, string> = {
  PLACED: "New",
  ACCEPTED: "Accepted",
  PACKED: "Packed",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  REJECTED: "Rejected",
};

export function orderStatusLabel(status: OrderStatusWire): string {
  return ORDER_STATUS_LABELS[status];
}

const DELIVERY_STATUS_LABELS: Record<DeliveryStatusWire, string> = {
  UNASSIGNED: "No rider yet",
  ASSIGNED: "Rider assigned",
  PICKED_UP: "Picked up",
  EN_ROUTE: "On the way",
  DELIVERED: "Handed over",
  FAILED: "Delivery failed",
};

export function deliveryStatusLabel(status: DeliveryStatusWire): string {
  return DELIVERY_STATUS_LABELS[status];
}

const PAYMENT_LABELS = { COD: "Cash on delivery", ESEWA: "eSewa", KHALTI: "Khalti" } as const;

/**
 * The order lifecycle as a stepper, straight from the API's state machine
 * (`apps/api/src/modules/orders/order-state.ts`). Rejected and cancelled orders
 * leave this line rather than advancing along it, so they are not steps.
 */
export const ORDER_STEPS: { status: OrderStatusWire; label: string }[] = [
  { status: "PLACED", label: "Placed" },
  { status: "ACCEPTED", label: "Accepted" },
  { status: "PACKED", label: "Packed" },
  { status: "OUT_FOR_DELIVERY", label: "Out for delivery" },
  { status: "DELIVERED", label: "Delivered" },
];

/** How far along `ORDER_STEPS` an order is; `-1` for a rejected/cancelled order. */
export function orderStepIndex(status: OrderStatusWire): number {
  return ORDER_STEPS.findIndex((s) => s.status === status);
}

function isTerminalOrderStatus(status: OrderStatusWire): boolean {
  return status === "DELIVERED" || status === "CANCELLED" || status === "REJECTED";
}

/* -------------------------------------------------------------- View models */

/** A rider as the console shows them. Names come from the roster, never invented. */
export type OrderRider = {
  id: string;
  /** The rider's own name, or their phone number when the account has no name yet. */
  name: string;
  phone: string;
  vehicleType: string;
};

export type OrderLine = {
  id: string;
  name: string;
  /** e.g. "1 kg", "500 ml" — the unit snapshot, when checkout recorded one. */
  unit: string | null;
  qty: number;
  unitPrice: number;
  lineTotal: number;
};

/**
 * What both the queue and the detail screen read.
 *
 * `actions` is the important part: it is computed from the API's two state
 * machines, so a button is on screen only when the endpoint behind it would
 * actually accept the call. Permission is layered on top of this by the page —
 * this object says what the *order* allows, not what the *user* may do.
 */
export type SellerOrder = {
  id: string;
  code: string;
  shopId: string;
  status: OrderStatusWire;
  statusLabel: string;

  /** Snapshot taken at checkout — not a live link to the customer's profile. */
  recipientName: string;
  recipientPhone: string;
  area: string;
  landmark: string | null;
  fullAddress: string;

  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;

  paymentMethod: "COD" | "ESEWA" | "KHALTI";
  paymentMethodLabel: string;
  paymentStatus: string;
  isCod: boolean;

  note: string | null;
  /** Set by the API when the order was rejected or cancelled. */
  cancelReason: string | null;

  placedAt: string;
  acceptedAt: string | null;
  packedAt: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;

  lines: OrderLine[];
  itemCount: number;

  deliveryStatus: DeliveryStatusWire | null;
  deliveryStatusLabel: string | null;
  rider: OrderRider | null;
  /** Only when the API computed it at checkout. `null` means unknown, not zero. */
  distanceMeters: number | null;
  codCollected: boolean;

  actions: OrderActions;
};

/** Which endpoints this order's current state would accept. */
export type OrderActions = {
  accept: boolean;
  reject: boolean;
  pack: boolean;
  /** Needs a rider assigned first — the API 400s otherwise. */
  dispatch: boolean;
  cancel: boolean;
  assignRider: boolean;
  unassignRider: boolean;
  /** The next delivery step, if the leg can move. */
  nextDeliveryStatus: DeliveryStatusWire | null;
  markFailed: boolean;
};

function riderFrom(delivery: DeliveryWire | null): OrderRider | null {
  const r = delivery?.rider;
  if (!r) return null;
  return {
    id: r.id,
    // A rider account can exist before the person set a name; show the phone
    // rather than an empty chip or an invented placeholder.
    name: r.user.name ?? r.user.phone,
    phone: r.user.phone,
    vehicleType: r.vehicleType,
  };
}

function linesFrom(items: OrderItemWire[]): OrderLine[] {
  return items.map((i) => ({
    id: i.id,
    name: i.nameSnapshot,
    unit: i.unitSnapshot,
    qty: i.qty,
    unitPrice: i.price,
    lineTotal: i.price * i.qty,
  }));
}

/**
 * The delivery leg's next legal step, mirroring
 * `apps/api/src/modules/delivery/delivery-state.ts`.
 *
 * `UNASSIGNED → ASSIGNED` is missing on purpose: that move happens through
 * `POST .../assign` with a rider id, not through the status PATCH.
 */
function nextDeliveryStatus(
  orderStatus: OrderStatusWire,
  delivery: DeliveryWire | null,
): DeliveryStatusWire | null {
  if (!delivery?.riderId) return null;
  switch (delivery.status) {
    case "ASSIGNED":
      return "PICKED_UP";
    case "PICKED_UP":
      // EN_ROUTE cascades the order to OUT_FOR_DELIVERY with actor SYSTEM, which
      // the order machine only permits from OUT_FOR_DELIVERY onwards — so this
      // step is offered only once the order has actually been dispatched.
      return orderStatus === "OUT_FOR_DELIVERY" ? "EN_ROUTE" : null;
    case "EN_ROUTE":
      return "DELIVERED";
    default:
      return null;
  }
}

function actionsFor(status: OrderStatusWire, delivery: DeliveryWire | null): OrderActions {
  const hasRider = Boolean(delivery?.riderId);
  const legInProgress =
    delivery?.status === "PICKED_UP" || delivery?.status === "EN_ROUTE";
  return {
    accept: status === "PLACED",
    reject: status === "PLACED",
    pack: status === "ACCEPTED",
    dispatch: status === "PACKED" && hasRider,
    // The API allows cancel from PLACED, ACCEPTED and PACKED only — never once
    // the order is out with a rider.
    cancel: status === "PLACED" || status === "ACCEPTED" || status === "PACKED",
    assignRider:
      !isTerminalOrderStatus(status) &&
      (delivery?.status === "UNASSIGNED" || delivery?.status === "ASSIGNED"),
    unassignRider: delivery?.status === "ASSIGNED",
    nextDeliveryStatus: nextDeliveryStatus(status, delivery),
    markFailed: legInProgress || delivery?.status === "ASSIGNED",
  };
}

function base(wire: SellerOrderListItemWire | SellerOrderDetailWire): SellerOrder {
  const delivery = wire.delivery;
  const lines = linesFrom(wire.items);
  return {
    id: wire.id,
    code: wire.code,
    shopId: wire.shopId,
    status: wire.status,
    statusLabel: orderStatusLabel(wire.status),

    recipientName: wire.recipientName,
    recipientPhone: wire.recipientPhone,
    area: wire.area,
    landmark: wire.landmark,
    fullAddress: wire.fullAddress,

    subtotal: wire.subtotal,
    deliveryFee: wire.deliveryFee,
    discount: wire.discount,
    total: wire.total,

    paymentMethod: wire.paymentMethod,
    paymentMethodLabel: PAYMENT_LABELS[wire.paymentMethod],
    paymentStatus: wire.paymentStatus,
    isCod: wire.paymentMethod === "COD",

    note: wire.note,
    cancelReason: wire.cancelReason,

    placedAt: wire.placedAt,
    acceptedAt: wire.acceptedAt,
    packedAt: wire.packedAt,
    dispatchedAt: wire.dispatchedAt,
    deliveredAt: wire.deliveredAt,

    lines,
    itemCount: lines.reduce((n, l) => n + l.qty, 0),

    deliveryStatus: delivery?.status ?? null,
    deliveryStatusLabel: delivery ? deliveryStatusLabel(delivery.status) : null,
    rider: riderFrom(delivery),
    distanceMeters: delivery?.distanceMeters ?? null,
    codCollected: delivery?.codCollected ?? false,

    actions: actionsFor(wire.status, delivery),
  };
}

function toSellerOrder(wire: SellerOrderListItemWire): SellerOrder {
  return base(wire);
}

/**
 * The queue, in the order the API returned it (`placedAt`, newest first unless
 * `sort=oldest` was asked for).
 *
 * When several shops are being shown at once the caller concatenates pages, so
 * re-sort by `placedAt` to interleave them rather than showing one shop's whole
 * queue before the next.
 */
export function toSellerOrders(wire: SellerOrderListItemWire[]): SellerOrder[] {
  return wire.map(toSellerOrder);
}

/** One entry of the order's real, append-only history. */
export type OrderTimelineEntry = {
  id: string;
  status: OrderStatusWire;
  label: string;
  note: string | null;
  at: string;
};

export type SellerOrderDetail = SellerOrder & {
  shopName: string;
  shopPhone: string | null;
  /** `OrderEvent` rows, oldest first — the API's own record of who moved what. */
  timeline: OrderTimelineEntry[];
  coupon: { code: string; type: "PERCENT" | "FLAT"; value: number } | null;
  /**
   * The rider's last known position, only while the order is out for delivery.
   * `stale` when the last ping is over 30 seconds old. A live reading, never an
   * estimate of arrival.
   */
  riderPosition: {
    lat: number;
    lng: number;
    heading: number | null;
    lastPingAt: string | null;
    stale: boolean;
  } | null;
  destination: { lat: number; lng: number } | null;
  origin: { lat: number; lng: number } | null;
  podNote: string | null;
  failReason: string | null;
};

function timelineFrom(events: OrderEventWire[]): OrderTimelineEntry[] {
  return events.map((e) => ({
    id: e.id,
    status: e.status,
    label: orderStatusLabel(e.status),
    note: e.note,
    at: e.createdAt,
  }));
}

export function toSellerOrderDetail(wire: SellerOrderDetailWire): SellerOrderDetail {
  const t = wire.tracking;
  return {
    ...base(wire),
    shopName: wire.shop.name,
    shopPhone: wire.shop.phone,
    timeline: timelineFrom(wire.events),
    coupon: wire.coupon,
    riderPosition: t.rider
      ? {
          lat: t.rider.lat,
          lng: t.rider.lng,
          heading: t.rider.heading,
          lastPingAt: t.rider.lastPingAt,
          stale: t.rider.stale,
        }
      : null,
    destination: t.destination,
    origin: t.origin,
    podNote: wire.delivery?.podNote ?? null,
    failReason: wire.delivery?.failReason ?? null,
  };
}

/* -------------------------------------------------------------------- Riders */

export type ShopRider = OrderRider & {
  /** OFFLINE / ONLINE / ON_DELIVERY, as the rider's own app last reported. */
  status: string;
  /** Deliveries currently assigned, picked up or en route. */
  activeDeliveries: number;
  hasPosition: boolean;
};

export function toShopRiders(wire: ShopRiderWire[]): ShopRider[] {
  return wire.map((r) => ({
    id: r.id,
    name: r.user.name ?? r.user.phone,
    phone: r.user.phone,
    vehicleType: r.vehicleType,
    status: r.status,
    activeDeliveries: r.activeDeliveries,
    hasPosition: r.location !== null,
  }));
}

/* -------------------------------------------------------- Queue tabs (server) */

/**
 * The queue's tabs, as *status groups the server filters on*.
 *
 * These used to be predicates — `needsAction(o)` and `isLive(o)` — that the queue
 * screen ran over whatever rows the browser happened to hold. `GET
 * /seller/shops/:shopId/orders` now takes `?status=ACCEPTED,PACKED` and validates
 * each value against the `OrderStatus` enum, so a tab is a filter Postgres applies.
 * Keeping the predicates alongside would have invited a screen to disagree with the
 * server about what "in progress" means.
 *
 * `statuses: null` is the "All" tab: the absence of a filter, which sends no `status`
 * key rather than an exhaustive list. Every group's count comes from the shop-wide
 * `summary`, not from the rows on screen — see {@link queueTabCount}.
 */
export type QueueTabId = "needs_action" | "live" | "delivered" | "closed" | "all";

export const QUEUE_TABS: {
  id: QueueTabId;
  label: string;
  /** What to send as `?status=`; `null` means send nothing. */
  statuses: OrderStatusWire[] | null;
}[] = [
  { id: "needs_action", label: "Needs action", statuses: ["PLACED"] },
  { id: "live", label: "In progress", statuses: ["ACCEPTED", "PACKED", "OUT_FOR_DELIVERY"] },
  { id: "delivered", label: "Delivered", statuses: ["DELIVERED"] },
  { id: "closed", label: "Rejected & cancelled", statuses: ["REJECTED", "CANCELLED"] },
  { id: "all", label: "All", statuses: null },
];

export function queueTabStatuses(id: QueueTabId): OrderStatusWire[] | undefined {
  return QUEUE_TABS.find((t) => t.id === id)?.statuses ?? undefined;
}

/**
 * A tab's badge, read off the server's queue summary.
 *
 * The summary's five numbers were chosen to line up with these groups exactly, so
 * this is a lookup rather than arithmetic — the one exception being "All", which is
 * the summary's own `total`.
 */
export function queueTabCount(id: QueueTabId, summary: OrderQueueSummaryWire): number {
  switch (id) {
    case "needs_action":
      return summary.needsAction;
    case "live":
      return summary.inProgress;
    case "delivered":
      return summary.delivered;
    case "closed":
      return summary.closed;
    case "all":
      return summary.total;
  }
}

/**
 * The statuses the delivery board can show a lane for, i.e. everything except
 * `PLACED` (not accepted yet — the queue's job), `CANCELLED` and `REJECTED` (never
 * had a leg to run). Sent as the board's `?status=` so the browser is not handed
 * rows it would immediately discard.
 *
 * `DELIVERED` is *not* in here: it grows without bound and would crowd out live work
 * in a bounded read. The board asks for it separately, as a short newest-first page.
 */
export const BOARD_OPEN_STATUSES: OrderStatusWire[] = [
  "ACCEPTED",
  "PACKED",
  "OUT_FOR_DELIVERY",
];

