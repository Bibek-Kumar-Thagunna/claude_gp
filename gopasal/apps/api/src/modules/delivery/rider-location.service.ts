import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { EVENTS, type RiderLocationEvent } from '../../common/events';
import type { AppConfig } from '../../config/configuration';

export interface RiderPing {
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  accuracy?: number;
}

export interface RiderLocationSnapshot extends RiderPing {
  riderId: string;
  orderId?: string;
  at: string;
  ageMs: number;
  stale: boolean;
  offline: boolean;
}

/**
 * Single write-path for rider GPS. Called by both the WebSocket gateway (normal
 * case) and the HTTP ping endpoint (degraded / no-socket fallback), so the two
 * can never diverge.
 *
 * Design notes:
 *  - Latest position lives in Redis (hot reads, and its TTL doubles as an
 *    "offline" signal — no key ⇒ rider stopped pinging).
 *  - Postgres is written at most once per `riderPingMinIntervalMs` to avoid
 *    hammering the DB with high-frequency GPS; Redis always has the freshest.
 *  - We resolve the rider's active order (cached) so the gateway can fan the
 *    ping out to exactly the customers watching that order — never wider.
 */
@Injectable()
export class RiderLocationService {
  private readonly logger = new Logger(RiderLocationService.name);
  private readonly pingMinIntervalMs: number;
  private readonly staleMs: number;
  private readonly offlineMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly events: EventEmitter2,
    config: ConfigService<AppConfig, true>,
  ) {
    const rt = config.get('realtime', { infer: true });
    this.pingMinIntervalMs = rt.riderPingMinIntervalMs;
    this.staleMs = rt.riderLocationStaleMs;
    this.offlineMs = rt.riderOfflineMs;
  }

  private locKey(riderId: string) {
    return `rider:loc:${riderId}`;
  }
  private dbGateKey(riderId: string) {
    return `rider:dbgate:${riderId}`;
  }
  private orderKey(riderId: string) {
    return `rider:order:${riderId}`;
  }

  /** Record a GPS ping. Returns the accepted snapshot (incl. resolved orderId). */
  async recordPing(riderId: string, ping: RiderPing): Promise<RiderLocationSnapshot> {
    const at = new Date();
    const orderId = await this.activeOrderId(riderId);

    // 1) always refresh the hot copy in Redis (TTL = offline threshold)
    const payload = { ...ping, at: at.toISOString(), orderId: orderId ?? undefined };
    await this.redis.client.set(this.locKey(riderId), JSON.stringify(payload), 'PX', this.offlineMs);

    // 2) throttle the durable write — first pinger in the window wins the gate
    const gate = await this.redis.client.set(this.dbGateKey(riderId), '1', 'PX', this.pingMinIntervalMs, 'NX');
    if (gate === 'OK') {
      await this.prisma.rider
        .update({
          where: { id: riderId },
          data: {
            lat: ping.lat,
            lng: ping.lng,
            heading: ping.heading ?? null,
            speed: ping.speed ?? null,
            accuracy: ping.accuracy ?? null,
            lastPingAt: at,
          },
        })
        // Typed as `unknown` rather than left implicit: a rejected Prisma call
        // can hand back anything, and losing the ping's durable copy is not
        // worth failing the request over — Redis still has the fresh position.
        .catch((e: unknown) => {
          const reason = e instanceof Error ? e.message : 'unknown error';
          this.logger.warn(`Rider ${riderId} DB location write skipped: ${reason}`);
        });
    }

    // 3) publish for the gateway + anyone else interested
    this.events.emit(EVENTS.RIDER_LOCATION, {
      riderId,
      orderId: orderId ?? undefined,
      lat: ping.lat,
      lng: ping.lng,
      heading: ping.heading,
      speed: ping.speed,
      accuracy: ping.accuracy,
      at: at.toISOString(),
    } satisfies RiderLocationEvent);

    return { riderId, orderId: orderId ?? undefined, ...ping, at: at.toISOString(), ageMs: 0, stale: false, offline: false };
  }

  /** Latest known position for a rider (Redis first, DB fallback). */
  async latest(riderId: string): Promise<RiderLocationSnapshot | null> {
    const cached = await this.redis.client.get(this.locKey(riderId));
    if (cached) {
      const p = JSON.parse(cached) as RiderPing & { at: string; orderId?: string };
      return this.snapshot(riderId, p, p.at, p.orderId);
    }
    const rider = await this.prisma.rider.findUnique({
      where: { id: riderId },
      select: { lat: true, lng: true, heading: true, speed: true, accuracy: true, lastPingAt: true },
    });
    if (!rider?.lat || !rider.lng || !rider.lastPingAt) return null;
    return this.snapshot(
      riderId,
      { lat: rider.lat, lng: rider.lng, heading: rider.heading ?? undefined, speed: rider.speed ?? undefined, accuracy: rider.accuracy ?? undefined },
      rider.lastPingAt.toISOString(),
    );
  }

  /**
   * Latest rider position for a specific order — what the customer tracking
   * screen polls (or receives over WS). Only returns while the order is actually
   * out for delivery; otherwise the rider's whereabouts are private.
   */
  async latestForOrder(orderId: string): Promise<RiderLocationSnapshot | null> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { status: true, delivery: { select: { riderId: true } } },
    });
    if (!order || order.status !== 'OUT_FOR_DELIVERY' || !order.delivery?.riderId) return null;
    return this.latest(order.delivery.riderId);
  }

  /** Cache + return the rider's current active order id (delivery in flight). */
  async activeOrderId(riderId: string): Promise<string | null> {
    const cached = await this.redis.client.get(this.orderKey(riderId));
    if (cached) return cached === '-' ? null : cached;
    const delivery = await this.prisma.delivery.findFirst({
      where: { riderId, status: { in: ['ASSIGNED', 'PICKED_UP', 'EN_ROUTE'] } },
      select: { orderId: true },
      orderBy: { assignedAt: 'desc' },
    });
    const value = delivery?.orderId ?? null;
    await this.redis.client.set(this.orderKey(riderId), value ?? '-', 'EX', 30);
    return value;
  }

  /** Invalidate the rider→order cache (call on assign / status change). */
  async clearOrderCache(riderId: string): Promise<void> {
    await this.redis.client.del(this.orderKey(riderId));
  }

  private snapshot(riderId: string, p: RiderPing, atIso: string, orderId?: string): RiderLocationSnapshot {
    const ageMs = Date.now() - new Date(atIso).getTime();
    return {
      riderId,
      orderId,
      lat: p.lat,
      lng: p.lng,
      heading: p.heading,
      speed: p.speed,
      accuracy: p.accuracy,
      at: atIso,
      ageMs,
      stale: ageMs > this.staleMs,
      offline: ageMs > this.offlineMs,
    };
  }
}
