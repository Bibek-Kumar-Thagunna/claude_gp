import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { createAdapter } from '@socket.io/redis-adapter';
import type { DefaultEventsMap, Server, Socket } from 'socket.io';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { RbacService } from '../rbac/rbac.service';
import {
  EVENTS,
  type DeliveryStatusChangedEvent,
  type OrderStatusChangedEvent,
  type RiderLocationEvent,
} from '../common/events';
import type { AppConfig } from '../config/configuration';
import { RiderLocationService } from '../modules/delivery/rider-location.service';
import { extractSocketToken, orderRoom, type SocketUser } from './ws-auth';

/**
 * Everything this gateway stashes on a socket, declared so `client.data` is a
 * real object instead of Socket.IO's untyped bag. Both fields are optional: a
 * socket exists before it has authenticated, and `lastPingAt` only appears once
 * a rider has actually sent a ping.
 *
 *   user        — set in `handleConnection` after the JWT verifies.
 *   lastPingAt  — epoch ms of the previous `rider:ping`, for flood protection.
 */
interface RealtimeSocketData {
  user?: SocketUser;
  lastPingAt?: number;
}

/**
 * A `Socket` whose `data` is `RealtimeSocketData`. Socket.IO's generics are
 * positional, so the three event maps have to be restated as their defaults to
 * reach the fourth.
 */
type RealtimeSocket = Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, RealtimeSocketData>;

/**
 * Realtime hub for live delivery tracking.
 *
 *  - Customers `order:subscribe` to an order they own and receive `rider:location`
 *    updates on the shop→door leg, plus `order:status` / `delivery:status` pushes.
 *  - Riders stream `rider:ping`; each ping is throttled + persisted by
 *    RiderLocationService and fanned out only to the room watching that order.
 *  - A Redis adapter makes `server.to(room).emit()` cross every API instance, so
 *    it doesn't matter which node the rider and the customer are connected to.
 *  - If Redis pub/sub can't be set up we fall back to the in-memory adapter and
 *    log loudly — single-node still works (graceful degradation).
 */
@WebSocketGateway({
  namespace: '/realtime',
  cors: { origin: true, credentials: true },
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly pingFloorMs: number;

  @WebSocketServer() server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly redis: RedisService,
    private readonly location: RiderLocationService,
  ) {
    // a soft per-socket floor purely to shrug off a flooding client; the real
    // DB-write throttle lives in RiderLocationService.
    this.pingFloorMs = Math.min(500, this.config.get('realtime', { infer: true }).riderPingMinIntervalMs);
  }

  afterInit(server: Server): void {
    try {
      const pub = this.redis.duplicate();
      const sub = this.redis.duplicate();
      server.adapter(createAdapter(pub, sub));
      this.logger.log('Socket.IO Redis adapter attached (multi-node broadcast enabled)');
    } catch (e) {
      this.logger.warn(`Redis adapter unavailable, using in-memory adapter: ${(e as Error).message}`);
    }
  }

  // ── connection lifecycle ─────────────────────────────────────────────────

  async handleConnection(client: RealtimeSocket): Promise<void> {
    const token = extractSocketToken(client);
    if (!token) return this.reject(client, 'No auth token');
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; phone: string; staff?: boolean }>(token, {
        secret: this.config.get('jwt.accessSecret', { infer: true }),
      });
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || user.status !== 'ACTIVE') return this.reject(client, 'Invalid user');
      const su: SocketUser = { id: user.id, phone: user.phone, isPlatformStaff: user.isPlatformStaff };
      client.data.user = su;
      client.emit('ready', { userId: su.id });
    } catch {
      return this.reject(client, 'Bad token');
    }
  }

  private reject(client: RealtimeSocket, reason: string): void {
    client.emit('unauthorized', { reason });
    client.disconnect(true);
  }

  private user(client: RealtimeSocket): SocketUser | null {
    return client.data.user ?? null;
  }

  // ── customer / shop / rider: watch an order ──────────────────────────────

  @SubscribeMessage('order:subscribe')
  async subscribe(@ConnectedSocket() client: RealtimeSocket, @MessageBody() body: { orderId?: string }) {
    const user = this.user(client);
    if (!user) return { ok: false, error: 'unauthenticated' };
    const orderId = body?.orderId;
    if (!orderId) return { ok: false, error: 'orderId required' };

    if (!(await this.canWatch(user, orderId))) return { ok: false, error: 'forbidden' };

    await client.join(orderRoom(orderId));
    // push the last known rider position immediately so the map isn't blank
    const snap = await this.location.latestForOrder(orderId);
    if (snap) client.emit('rider:location', { orderId, ...snap });
    return { ok: true };
  }

  @SubscribeMessage('order:unsubscribe')
  async unsubscribe(@ConnectedSocket() client: RealtimeSocket, @MessageBody() body: { orderId?: string }) {
    if (body?.orderId) await client.leave(orderRoom(body.orderId));
    return { ok: true };
  }

  // ── rider: stream GPS ────────────────────────────────────────────────────

  @SubscribeMessage('rider:ping')
  async ping(
    @ConnectedSocket() client: RealtimeSocket,
    @MessageBody() body: { lat: number; lng: number; heading?: number; speed?: number; accuracy?: number },
  ) {
    const user = this.user(client);
    if (!user) return { ok: false, error: 'unauthenticated' };
    if (typeof body?.lat !== 'number' || typeof body?.lng !== 'number') return { ok: false, error: 'lat/lng required' };

    // flood protection
    const now = Date.now();
    const last = client.data.lastPingAt ?? 0;
    if (now - last < this.pingFloorMs) return { ok: true, throttled: true };
    client.data.lastPingAt = now;

    const rider = await this.prisma.rider.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!rider) return { ok: false, error: 'not a rider' };

    const snap = await this.location.recordPing(rider.id, {
      lat: body.lat,
      lng: body.lng,
      heading: body.heading,
      speed: body.speed,
      accuracy: body.accuracy,
    });
    return { ok: true, orderId: snap.orderId ?? null };
  }

  // ══════════════════════════ domain-event fan-out ═════════════════════════
  // These fire in-process (EventEmitter2). The emit below goes through the
  // Redis adapter, reaching whichever node holds the customer's socket.

  @OnEvent(EVENTS.RIDER_LOCATION)
  broadcastRiderLocation(e: RiderLocationEvent): void {
    if (!e.orderId) return; // only meaningful while tied to an active order
    this.server.to(orderRoom(e.orderId)).emit('rider:location', {
      orderId: e.orderId,
      riderId: e.riderId,
      lat: e.lat,
      lng: e.lng,
      heading: e.heading,
      speed: e.speed,
      accuracy: e.accuracy,
      at: e.at,
    });
  }

  @OnEvent(EVENTS.ORDER_STATUS_CHANGED)
  broadcastOrderStatus(e: OrderStatusChangedEvent): void {
    this.server.to(orderRoom(e.orderId)).emit('order:status', {
      orderId: e.orderId,
      code: e.code,
      from: e.from,
      to: e.to,
      at: new Date().toISOString(),
    });
  }

  @OnEvent(EVENTS.DELIVERY_STATUS_CHANGED)
  broadcastDeliveryStatus(e: DeliveryStatusChangedEvent): void {
    this.server.to(orderRoom(e.orderId)).emit('delivery:status', {
      orderId: e.orderId,
      from: e.from,
      to: e.to,
      at: new Date().toISOString(),
    });
  }

  // ── authorization: who may watch an order ────────────────────────────────

  private async canWatch(user: SocketUser, orderId: string): Promise<boolean> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { customerId: true, shopId: true, delivery: { select: { rider: { select: { userId: true } } } } },
    });
    if (!order) return false;
    if (order.customerId === user.id) return true; // the buyer
    if (order.delivery?.rider?.userId === user.id) return true; // the assigned rider
    return this.rbac.can(user.id, 'orders.view', order.shopId); // shop staff
  }
}
