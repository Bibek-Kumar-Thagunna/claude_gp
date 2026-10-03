import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * Where `prisma/migrations` lives, relative to wherever the process was started.
 *
 * The API runs three ways — `nest start --watch` from `apps/api`, `node
 * dist/main.js` from the same directory, and `turbo run dev` from the repo root
 * — so neither `process.cwd()` nor `__dirname` alone finds the folder in every
 * case. Each candidate is tried in turn and the first that exists wins; if none
 * do, the caller skips the check rather than guessing.
 */
function locateMigrationsDir(): string | null {
  const candidates = [
    join(process.cwd(), "prisma", "migrations"),
    join(process.cwd(), "apps", "api", "prisma", "migrations"),
  ];
  // Walk up from the compiled/interpreted file: dist/common/prisma → apps/api.
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    candidates.push(join(dir, "prisma", "migrations"));
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return candidates.find((c) => existsSync(c)) ?? null;
}

/** One row of Prisma's own bookkeeping table. */
type MigrationRow = {
  migration_name: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
};

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
    this.logger.log("Connected to PostgreSQL");
    await this.checkMigrations();
  }

  /**
   * Compare `prisma/migrations` on disk against what the database says it has
   * applied, and say so at boot.
   *
   * A migration that exists as a file but was never run does not stop the API
   * from starting, and it does not stop most requests either: it breaks exactly
   * the queries that touch the new column. Prisma reports that as `P2022`, the
   * exception filter turns every `P2022` into a flat 400 `"Database request
   * error."`, and the customer, seller, admin and rider apps all render that one
   * sentence. Nothing anywhere named the missing column — a single unapplied
   * migration read as four broken products.
   *
   * The condition is knowable the moment the connection opens, so it is checked
   * there. Deployed environments refuse to start, because serving a schema the
   * code does not match is worse than being down and is not something an
   * operator should have to infer from user reports. Locally it is a loud log
   * line: a developer mid-migration should not be locked out of their own API.
   */
  private async checkMigrations(): Promise<void> {
    const dir = locateMigrationsDir();
    if (!dir) return;

    const onDisk = readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && existsSync(resolve(dir, e.name, "migration.sql")))
      .map((e) => e.name)
      .sort();
    if (onDisk.length === 0) return;

    let rows: MigrationRow[];
    try {
      rows = await this.$queryRaw<MigrationRow[]>`
        SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"`;
    } catch {
      // No bookkeeping table at all: an empty database that has never been
      // migrated. Worth saying once, but there is nothing to compare.
      this.logger.error(
        `No "_prisma_migrations" table — this database has never been migrated. ` +
          `Run: pnpm --filter @gopasal/api exec prisma migrate deploy`,
      );
      return;
    }

    const applied = new Set(
      rows.filter((r) => r.finished_at && !r.rolled_back_at).map((r) => r.migration_name),
    );
    // Started and never finished. Prisma refuses to move past one of these, so
    // it is named separately from the ones that were simply never run.
    const failed = rows
      .filter((r) => !r.finished_at && !r.rolled_back_at)
      .map((r) => r.migration_name);
    const pending = onDisk.filter((name) => !applied.has(name));

    if (pending.length === 0 && failed.length === 0) return;

    const lines = [
      `Database schema is behind the code.`,
      ...(pending.length ? [`  not applied: ${pending.join(", ")}`] : []),
      ...(failed.length ? [`  failed mid-run: ${failed.join(", ")}`] : []),
      `  fix with: pnpm --filter @gopasal/api exec prisma migrate deploy`,
      `  Until then, any request touching a column from these migrations fails`,
      `  with Prisma P2022 and reaches the apps as "Database request error."`,
    ];
    const report = lines.join("\n");

    const env = process.env.APP_ENV;
    if (env === "production" || env === "staging") throw new Error(report);
    this.logger.error(report);
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
  async shopsCovering(point: {
    lat: number;
    lng: number;
  }): Promise<{ id: string; distance: number }[]> {
    return this.$queryRaw<{ id: string; distance: number }[]>`
      SELECT id,
             ST_Distance(
               ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
               ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography
             ) AS distance
      FROM "Shop"
      WHERE status = 'ACTIVE'
        AND lat IS NOT NULL AND lng IS NOT NULL
        -- 20 km is the validated maximum seller radius. The fixed ST_DWithin
        -- prefilter lets PostgreSQL use Shop_location_geography_idx before the
        -- per-shop radius comparison below.
        AND ST_DWithin(
          ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
          ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography,
          20000
        )
        AND ST_Distance(
          ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
          ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography
        ) <= ("deliveryRadiusKm" * 1000)
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
             ST_Distance(
               ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
               ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography
             ) AS distance
      FROM "Shop"
      WHERE status = 'ACTIVE'
        AND lat IS NOT NULL AND lng IS NOT NULL
        AND ST_DWithin(
          ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
          ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography,
          ${meters}
        )
      ORDER BY distance ASC
      LIMIT ${limit}`;
  }
}
