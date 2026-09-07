import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Thin wrapper around PrismaClient with lifecycle hooks and a couple of geo
 * helpers. Radius / distance queries use PostGIS via $queryRaw so we get real
 * spherical distances (metres) rather than naive lat/lng math.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to PostgreSQL');
  }

  /**
   * Release the connection pool when the application closes.
   *
   * This replaces an earlier `beforeExit` listener that called `app.close()`:
   * scheduling asynchronous work from `beforeExit` keeps the event loop alive
   * until it settles, so a hook meant to help the process exit was one of the
   * reasons it did not. Shutdown is now driven from `main.ts` in one direction —
   * signal → `app.close()` → this hook — and never the other way round.
   */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Great-circle distance in metres between two points, computed in Postgres
   * with PostGIS (ST_DistanceSphere).
   */
  async distanceMeters(
    a: { lat: number; lng: number },
    b: { lat: number; lng: number },
  ): Promise<number> {
    const rows = await this.$queryRaw<{ d: number }[]>`
      SELECT ST_DistanceSphere(
        ST_MakePoint(${a.lng}, ${a.lat}),
        ST_MakePoint(${b.lng}, ${b.lat})
      ) AS d`;
    return Math.round(rows[0]?.d ?? 0);
  }

  /**
   * IDs of ACTIVE shops whose delivery radius covers the given point, nearest
   * first. Uses ST_DistanceSphere against each shop's location.
   */
  async shopsCovering(point: { lat: number; lng: number }): Promise<
    { id: string; distance: number }[]
  > {
    return this.$queryRaw<{ id: string; distance: number }[]>`
      SELECT id,
             ST_DistanceSphere(ST_MakePoint(lng, lat), ST_MakePoint(${point.lng}, ${point.lat})) AS distance
      FROM "Shop"
      WHERE status = 'ACTIVE'
        AND lat IS NOT NULL AND lng IS NOT NULL
        AND ST_DistanceSphere(ST_MakePoint(lng, lat), ST_MakePoint(${point.lng}, ${point.lat}))
            <= ("deliveryRadiusKm" * 1000)
      ORDER BY distance ASC`;
  }

  /**
   * IDs of ACTIVE shops within `meters` of the point (ignores each shop's own
   * radius) — used for "explore shops near me", nearest first.
   */
  async shopsWithinMeters(
    point: { lat: number; lng: number },
    meters: number,
    limit = 60,
  ): Promise<{ id: string; distance: number }[]> {
    return this.$queryRaw<{ id: string; distance: number }[]>`
      SELECT id,
             ST_DistanceSphere(ST_MakePoint(lng, lat), ST_MakePoint(${point.lng}, ${point.lat})) AS distance
      FROM "Shop"
      WHERE status = 'ACTIVE'
        AND lat IS NOT NULL AND lng IS NOT NULL
        AND ST_DistanceSphere(ST_MakePoint(lng, lat), ST_MakePoint(${point.lng}, ${point.lat})) <= ${meters}
      ORDER BY distance ASC
      LIMIT ${limit}`;
  }
}
