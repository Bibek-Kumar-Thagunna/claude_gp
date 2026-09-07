import { DeliveryStatus } from '@prisma/client';

/**
 * Delivery lifecycle. Runs in parallel with the order lifecycle but tracks the
 * rider's physical progress:
 *
 *   UNASSIGNED ─assign─▶ ASSIGNED ─pickup─▶ PICKED_UP ─start─▶ EN_ROUTE ─deliver─▶ DELIVERED
 *                                    │            │              │
 *                                    └────────────┴──────────────┴── fail ─▶ FAILED
 */
const DELIVERY_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  UNASSIGNED: [DeliveryStatus.ASSIGNED],
  ASSIGNED: [DeliveryStatus.PICKED_UP, DeliveryStatus.FAILED],
  PICKED_UP: [DeliveryStatus.EN_ROUTE, DeliveryStatus.FAILED],
  EN_ROUTE: [DeliveryStatus.DELIVERED, DeliveryStatus.FAILED],
  DELIVERED: [],
  FAILED: [],
};

export function canDeliveryTransition(from: DeliveryStatus, to: DeliveryStatus): boolean {
  return (DELIVERY_TRANSITIONS[from] ?? []).includes(to);
}

export function deliveryNextStates(from: DeliveryStatus): DeliveryStatus[] {
  return DELIVERY_TRANSITIONS[from] ?? [];
}

/** The order status implied by a delivery reaching a given state, if any. */
export const DELIVERY_TO_ORDER_STATUS: Partial<Record<DeliveryStatus, 'OUT_FOR_DELIVERY' | 'DELIVERED'>> = {
  EN_ROUTE: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
};
