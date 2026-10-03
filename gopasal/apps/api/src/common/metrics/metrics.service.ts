import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from '@prometheus-io/client';
import { createServer, type Server } from 'node:http';
import type { AppConfig } from '../../config/configuration';
import { NotificationQueue } from '../../modules/notifications/notification.queue';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const SNAPSHOT_TTL_MS = 15_000;
const SNAPSHOT_TIMEOUT_MS = 3_000;

function bounded<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`metrics dependency check exceeded ${timeoutMs}ms`)), timeoutMs);
    timer.unref();
  });
  return Promise.race([work, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Process-local request metrics plus a short-lived operational snapshot.
 *
 * The listener has its own port and is never mounted under the public Nest API.
 * Kubernetes exposes it only to the monitoring namespace. Labels are deliberately
 * bounded: route templates and enum states are safe; user IDs, shop IDs, order
 * codes, phones and URLs are never metric labels.
 */
@Injectable()
export class MetricsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MetricsService.name);
  private readonly registry = new Registry();
  private readonly settings: AppConfig['metrics'];
  private server?: Server;
  private snapshotAt = 0;
  private snapshot?: Promise<void>;
  private lastWarningAt = 0;

  private readonly requests = new Counter({
    name: 'gopasal_http_requests_total',
    help: 'Completed API HTTP requests.',
    labelNames: ['method', 'route', 'status_code'] as const,
    registers: [this.registry],
  });
  private readonly duration = new Histogram({
    name: 'gopasal_http_request_duration_seconds',
    help: 'API HTTP request duration in seconds.',
    labelNames: ['method', 'route', 'status_code'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
    registers: [this.registry],
  });
  private readonly inFlight = new Gauge({
    name: 'gopasal_http_requests_in_flight',
    help: 'API HTTP requests currently being processed.',
    labelNames: ['method'] as const,
    registers: [this.registry],
  });
  private readonly dependencyUp = new Gauge({
    name: 'gopasal_dependency_up',
    help: 'Whether a required API dependency answered its operational check.',
    labelNames: ['dependency'] as const,
    registers: [this.registry],
  });
  private readonly businessState = new Gauge({
    name: 'gopasal_business_records',
    help: 'Current persisted record count by bounded business entity and state.',
    labelNames: ['entity', 'state'] as const,
    registers: [this.registry],
  });
  private readonly queueJobs = new Gauge({
    name: 'gopasal_queue_jobs',
    help: 'Current notification queue jobs by bounded state.',
    labelNames: ['queue', 'state'] as const,
    registers: [this.registry],
  });

  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly notifications: NotificationQueue,
  ) {
    this.settings = config.get('metrics', { infer: true });
    this.registry.setDefaultLabels({ service: 'api', environment: config.get('env', { infer: true }) });
    collectDefaultMetrics({ register: this.registry, prefix: 'gopasal_node_' });
    new Gauge({
      name: 'gopasal_build_info',
      help: 'Static API runtime build information.',
      labelNames: ['node_version'] as const,
      registers: [this.registry],
    }).set({ node_version: process.version }, 1);
  }

  async onModuleInit(): Promise<void> {
    if (!this.settings.enabled) return;
    this.server = createServer((req, res) => void this.serve(req.method, req.url, res));
    this.server.requestTimeout = 5_000;
    this.server.headersTimeout = 6_000;
    this.server.keepAliveTimeout = 5_000;
    await new Promise<void>((resolve, reject) => {
      this.server?.once('error', reject);
      this.server?.listen(this.settings.port, this.settings.host, () => {
        this.server?.off('error', reject);
        resolve();
      });
    });
    this.logger.log(`Internal metrics ready on ${this.settings.host}:${this.settings.port}/metrics`);
  }

  requestStarted(method: string): () => void {
    const safeMethod = method.toUpperCase().slice(0, 12) || 'UNKNOWN';
    this.inFlight.inc({ method: safeMethod });
    let finished = false;
    return () => {
      if (finished) return;
      finished = true;
      this.inFlight.dec({ method: safeMethod });
    };
  }

  recordCompleted(method: string, route: string, statusCode: number, seconds: number): void {
    const labels = {
      method: method.toUpperCase().slice(0, 12) || 'UNKNOWN',
      route: route.slice(0, 180) || 'unmatched',
      status_code: String(statusCode >= 100 && statusCode <= 599 ? statusCode : 0),
    };
    this.requests.inc(labels);
    this.duration.observe(labels, seconds);
  }

  private async serve(method: string | undefined, url: string | undefined, res: import('node:http').ServerResponse): Promise<void> {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    if (method !== 'GET' || url !== '/metrics') {
      res.statusCode = 404;
      res.end('Not found\n');
      return;
    }
    try {
      await this.refreshSnapshot();
      const body = await this.registry.metrics();
      res.statusCode = 200;
      res.setHeader('Content-Type', this.registry.contentType);
      res.end(body);
    } catch (error) {
      this.warn(`Metrics render failed: ${(error as Error).message}`);
      res.statusCode = 503;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Metrics temporarily unavailable\n');
    }
  }

  /** Exposed for focused tests and future authenticated diagnostics. */
  async render(): Promise<string> {
    await this.refreshSnapshot();
    return this.registry.metrics();
  }

  private async refreshSnapshot(): Promise<void> {
    if (Date.now() - this.snapshotAt < SNAPSHOT_TTL_MS) return;
    if (!this.snapshot) {
      this.snapshot = this.collectSnapshot().finally(() => {
        this.snapshot = undefined;
      });
    }
    await this.snapshot;
  }

  private async collectSnapshot(): Promise<void> {
    const redis = bounded(this.redis.client.ping(), SNAPSHOT_TIMEOUT_MS)
      .then(() => true)
      .catch(() => false);
    const queue = bounded(this.notifications.counts(), SNAPSHOT_TIMEOUT_MS).catch(() => null);
    const database = bounded(
      Promise.all([
        this.prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
        this.prisma.paymentIntent.groupBy({ by: ['status'], _count: { _all: true } }),
        this.prisma.refund.groupBy({ by: ['status'], _count: { _all: true } }),
        this.prisma.dispute.groupBy({ by: ['status'], _count: { _all: true } }),
        this.prisma.settlement.groupBy({ by: ['status'], _count: { _all: true } }),
        this.prisma.shopApplication.groupBy({ by: ['status'], _count: { _all: true } }),
      ]),
      SNAPSHOT_TIMEOUT_MS,
    ).catch((error) => {
      this.warn(`Business metric snapshot failed: ${(error as Error).message}`);
      return null;
    });

    const [redisUp, queueCounts, grouped] = await Promise.all([redis, queue, database]);
    this.dependencyUp.set({ dependency: 'redis' }, redisUp ? 1 : 0);
    this.dependencyUp.set({ dependency: 'notification_queue' }, queueCounts ? 1 : 0);
    this.dependencyUp.set({ dependency: 'postgres' }, grouped ? 1 : 0);

    this.queueJobs.reset();
    if (queueCounts) {
      for (const [state, count] of Object.entries(queueCounts)) {
        this.queueJobs.set({ queue: 'notifications', state }, count);
      }
    }

    this.businessState.reset();
    if (grouped) {
      const entities = ['order', 'payment_intent', 'refund', 'dispute', 'settlement', 'shop_application'];
      grouped.forEach((rows, index) => {
        for (const row of rows) {
          this.businessState.set(
            { entity: entities[index], state: String(row.status).toLowerCase() },
            row._count._all,
          );
        }
      });
    }
    this.snapshotAt = Date.now();
  }

  private warn(message: string): void {
    const now = Date.now();
    if (now - this.lastWarningAt < 60_000) return;
    this.lastWarningAt = now;
    this.logger.warn(message);
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.server) return;
    this.server.closeIdleConnections?.();
    this.server.closeAllConnections?.();
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
    this.server = undefined;
  }
}
