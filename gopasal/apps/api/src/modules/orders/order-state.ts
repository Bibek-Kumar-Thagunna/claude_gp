import { OrderStatus } from "@prisma/client";

/**
 * Order lifecycle state machine. Single source of truth for which transitions
 * are legal and who is allowed to make them. Keeping this pure (no DB) makes it
 * trivial to unit-test and impossible for a controller to invent a bad move.
 *
 *   PLACED ──accept──▶ ACCEPTED ──pack──▶ PACKED ──dispatch──▶ OUT_FOR_DELIVERY ──deliver──▶ DELIVERED
 *      │                   │
 *      ├── reject ─▶ REJECTED (terminal)
 *      └── cancel ─▶ CANCELLED (terminal; after dispatch only once the parcel is back at the shop)
 */

export type Actor = "CUSTOMER" | "SHOP" | "SYSTEM";

export interface TransitionRule {
  to: OrderStatus;
  actors: Actor[];
  /** Human label for the action that causes this transition. */
  action: string;
}

const TRANSITIONS: Record<OrderStatus, TransitionRule[]> = {
  PLACED: [
    { to: OrderStatus.ACCEPTED, actors: ["SHOP"], action: "accept" },
    { to: OrderStatus.REJECTED, actors: ["SHOP"], action: "reject" },
    { to: OrderStatus.CANCELLED, actors: ["CUSTOMER", "SHOP"], action: "cancel" },
  ],
  ACCEPTED: [
    { to: OrderStatus.PACKED, actors: ["SHOP"], action: "pack" },
    { to: OrderStatus.CANCELLED, actors: ["CUSTOMER", "SHOP"], action: "cancel" },
  ],
  PACKED: [
    // "SYSTEM" is here because the shop pressing Dispatch and the rider marking
    // themselves en route are two recordings of the same physical event: the
    // parcel leaving the shop. Only "SHOP" was listed, so a rider who went en
    // route before the shop pressed Dispatch drove `syncOrderStatus` into a
    // ForbiddenException — after the delivery row had already been committed.
    // The delivery said EN_ROUTE, the order stayed PACKED, and every retry hit
    // the same wall, so the order could never reach the customer.
    { to: OrderStatus.OUT_FOR_DELIVERY, actors: ["SHOP", "SYSTEM"], action: "dispatch" },
    { to: OrderStatus.CANCELLED, actors: ["SHOP"], action: "cancel" },
  ],
  OUT_FOR_DELIVERY: [
    { to: OrderStatus.DELIVERED, actors: ["SHOP", "SYSTEM"], action: "deliver" },
    // The transition choke-point additionally requires the physical parcel to
    // have been confirmed back at the shop. This is not a mid-route cancel.
    { to: OrderStatus.CANCELLED, actors: ["CUSTOMER", "SHOP"], action: "cancel_after_return" },
  ],
  DELIVERED: [],
  CANCELLED: [],
  REJECTED: [],
};

export function allowedTransitions(from: OrderStatus): TransitionRule[] {
  return TRANSITIONS[from] ?? [];
}

export function canTransition(from: OrderStatus, to: OrderStatus, actor: Actor): boolean {
  return allowedTransitions(from).some((r) => r.to === to && r.actors.includes(actor));
}

export function isTerminal(status: OrderStatus): boolean {
  return allowedTransitions(status).length === 0;
}

/** Maps a target status to the Order timestamp column it should stamp. */
export const STATUS_TIMESTAMP: Partial<Record<OrderStatus, string>> = {
  ACCEPTED: "acceptedAt",
  PACKED: "packedAt",
  OUT_FOR_DELIVERY: "dispatchedAt",
  DELIVERED: "deliveredAt",
  CANCELLED: "cancelledAt",
};
