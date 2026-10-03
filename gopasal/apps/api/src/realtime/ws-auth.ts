import type { Socket } from 'socket.io';

/**
 * Pull a bearer token out of a Socket.IO handshake. Clients may send it as
 * `auth.token` (preferred) or an `Authorization: Bearer` header. Query strings
 * are deliberately excluded because they are routinely retained in proxy logs.
 */
export function extractSocketToken(client: Socket): string | null {
  const auth = client.handshake.auth as { token?: string } | undefined;
  if (auth?.token) return stripBearer(auth.token);

  const header = client.handshake.headers?.authorization;
  if (header) return stripBearer(header);

  return null;
}

function stripBearer(v: string): string {
  return v.startsWith('Bearer ') ? v.slice(7) : v;
}

export interface SocketUser {
  id: string;
  phone: string;
  isPlatformStaff: boolean;
}

/** Room name a customer/rider/shop joins to watch a single order's delivery. */
export function orderRoom(orderId: string): string {
  return `order:${orderId}`;
}

/**
 * Room a shop's own staff join to watch the queue.
 *
 * The seller app is a phone standing on a counter, and the question it exists
 * to answer is "has an order come in". A push notification answers that when
 * the app is closed; this answers it when the shopkeeper is looking at the
 * screen, where waiting up to thirty seconds for a poll is the difference
 * between a warm samosa and a cold one.
 *
 * Scoped to the shop rather than to the user, because a shop can have several
 * people on the counter and all of them need the same queue.
 */
export function shopRoom(shopId: string): string {
  return `shop:${shopId}`;
}

/** Private room for one customer↔shop conversation. */
export function conversationRoom(conversationId: string): string {
  return `conversation:${conversationId}`;
}

let allowedOrigins = new Set<string>();

/** Set once during bootstrap from the same validated allowlist used by HTTP. */
export function configureRealtimeOrigins(origins: readonly string[]): void {
  allowedOrigins = new Set(origins);
}

export function realtimeOriginAllowed(origin: string | undefined): boolean {
  // Native clients do not send Origin. Browser clients must be explicitly named.
  return origin === undefined || allowedOrigins.has(origin);
}

export function realtimeCorsOrigin(
  origin: string | undefined,
  callback: (error: Error | null, allowed?: boolean) => void,
): void {
  const allowed = realtimeOriginAllowed(origin);
  callback(allowed ? null : new Error('Origin not allowed'), allowed);
}
