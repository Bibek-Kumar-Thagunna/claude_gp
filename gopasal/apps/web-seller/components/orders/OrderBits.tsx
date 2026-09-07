"use client";

import { Badge, type Tone } from "@/components/primitives";
import type { DeliveryStatusWire, OrderStatusWire } from "@/lib/api/orders";
import { deliveryStatusLabel, orderStatusLabel } from "@/lib/orders-view";

/**
 * Tones for the API's own `OrderStatus` enum. The labels come from
 * `lib/orders-view.ts` so a status is worded identically here, in a tab and in
 * the detail timeline; only the colour is decided in this file.
 */
const STATUS_TONES: Record<OrderStatusWire, Tone> = {
  PLACED: "marigold",
  ACCEPTED: "blue",
  PACKED: "blue",
  OUT_FOR_DELIVERY: "crimson",
  DELIVERED: "green",
  CANCELLED: "ink",
  REJECTED: "red",
};

export function OrderStatusBadge({ status }: { status: OrderStatusWire }) {
  return (
    <Badge tone={STATUS_TONES[status]} dot>
      {orderStatusLabel(status)}
    </Badge>
  );
}

const DELIVERY_TONES: Record<DeliveryStatusWire, Tone> = {
  UNASSIGNED: "ink",
  ASSIGNED: "blue",
  PICKED_UP: "blue",
  EN_ROUTE: "crimson",
  DELIVERED: "green",
  FAILED: "red",
};

/** The delivery leg's own state, which runs in parallel with the order's. */
export function DeliveryStatusBadge({ status }: { status: DeliveryStatusWire }) {
  return <Badge tone={DELIVERY_TONES[status]}>{deliveryStatusLabel(status)}</Badge>;
}

/*
  A `SlaCountdown` used to live here — an accept-by timer, and the last thing in this
  file that read a fixture. It is gone with the fixtures, and should not come back
  unless the backend grows a deadline: no order row, order event or delivery row records
  an accept-by time, so any countdown would be a promise the customer never received.
  GoPasal also makes no delivery-speed claims by design, which is the other reason.
*/
