import type { Socket } from 'socket.io';

/**
 * Pull a bearer token out of a Socket.IO handshake. Clients may send it as
 * `auth.token` (preferred), an `Authorization: Bearer` header, or a `?token=`
 * query param — we accept all three so web and native clients can each use
 * whatever their socket library makes easy.
 */
export function extractSocketToken(client: Socket): string | null {
  const auth = client.handshake.auth as { token?: string } | undefined;
  if (auth?.token) return stripBearer(auth.token);

  const header = client.handshake.headers?.authorization;
  if (header) return stripBearer(header);

  const q = client.handshake.query?.token;
  if (typeof q === 'string') return stripBearer(q);

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
