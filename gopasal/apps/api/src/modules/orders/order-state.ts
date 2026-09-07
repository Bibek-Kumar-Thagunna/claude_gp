import { OrderStatus } from '@prisma/client';

/**
 * Order lifecycle state machine. Single source of truth for which transitions
 * are legal and who is allowed to make them. Keeping this pure (no DB) makes it
 * trivial to unit-test and impossible for a controller to invent a bad move.
 *
 *   PLACED ──accept──▶ ACCEPTED ──pack──▶ PACKED ──dispatch──▶ OUT_FOR_DELIVERY ──deliver──▶ DELIVERED
 *      │                   │
 *      ├── reject ─▶ REJECTED (terminal)
 *      └── cancel ─▶ CANCELLED (terminal, customer or shop, pre-dispatch only)
 */

export type Actor = 'CUSTOMER' | 'SHOP' | 'SYSTEM';

export interface TransitionRule {
  to: OrderStatus;
  actors: Actor[];
  /** Human label for the action that causes this transition. */
  action: string;
}

const TRANSITIONS: Record<OrderStatus, TransitionRule[]> = {
  PLACED: [
    { to: OrderStatus.ACCEPTED, actors: ['SHOP'], action: 'accept' },
    { to: OrderStatus.REJECTED, actors: ['SHOP'], action: 'reject' },
    { to: OrderStatus.CANCELLED, actors: ['CUSTOMER', 'SHOP'], action: 'cancel' },
  ],
  ACCEPTED: [
    { to: OrderStatus.PACKED, actors: ['SHOP'], action: 'pack' },
    { to: OrderStatus.CANCELLED, actors: ['CUSTOMER', 'SHOP'], action: 'cancel' },
  ],
  PACKED: [
    { to: OrderStatus.OUT_FOR_DELIVERY, actors: ['SHOP'], action: 'dispatch' },
    { to: OrderStatus.CANCELLED, actors: ['SHOP'], action: 'cancel' },
  ],
  OUT_FOR_DELIVERY: [{ to: OrderStatus.DELIVERED, actors: ['SHOP', 'SYSTEM'], action: 'deliver' }],
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
  ACCEPTED: 'acceptedAt',
  PACKED: 'packedAt',
  OUT_FOR_DELIVERY: 'dispatchedAt',
  DELIVERED: 'deliveredAt',
  CANCELLED: 'cancelledAt',
};
