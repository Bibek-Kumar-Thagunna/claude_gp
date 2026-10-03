import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { RedisService } from '../../common/redis/redis.service';
import type { JsonObject } from '../../common/types/json';

export const NOTIFICATIONS_QUEUE = 'notifications';

/** One notification destined for one user. Enqueued by the event listener,
 *  consumed by the worker (persist to DB + push to device). */
export interface NotificationJob {
  userId: string;
  type: string;
  title: string;
  body: string;
  /** Deep-link payload. JSON-typed because it is persisted verbatim into the
   *  notification's `data` column, and BullMQ serialises the job anyway. */
  data?: JsonObject;
  /** also attempt a device push, not just the in-app row */
  push?: boolean;
}

/**
 * Thin producer around the BullMQ notifications queue. Enqueue never throws into
 * the request path — a dead queue must not break checkout — so failures are
 * logged and swallowed.
 *
 * BullMQ is handed connection *options*, not a connection: given options it
 * creates the socket itself and `close()` disposes of it. Handing it
 * `RedisService.duplicate()` instead made ownership ambiguous — BullMQ would not
 * close a connection it did not create, and RedisService would try to `quit()` a
 * connection BullMQ was still using, which is how a clean shutdown becomes a hang.
 * `maxRetriesPerRequest: null` is BullMQ's requirement and is passed explicitly
 * rather than inherited.
 */
@Injectable()
export class NotificationQueue implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationQueue.name);
  private queue?: Queue<NotificationJob>;

  constructor(private readonly redis: RedisService) {}

  onModuleInit(): void {
    try {
      this.queue = new Queue<NotificationJob>(NOTIFICATIONS_QUEUE, {
        connection: { ...this.redis.connectionOptions(), maxRetriesPerRequest: null },
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      });
      this.logger.log('Notification queue ready');
    } catch (err) {
      this.logger.error(`Could not start notification queue: ${(err as Error).message}`);
    }
  }

  async enqueue(job: NotificationJob): Promise<void> {
    if (!this.queue) return;
    try {
      await this.queue.add(job.type, job);
    } catch (err) {
      this.logger.error(`Enqueue failed (${job.type}): ${(err as Error).message}`);
    }
  }

  async enqueueMany(jobs: NotificationJob[]): Promise<void> {
    await Promise.all(jobs.map((j) => this.enqueue(j)));
  }

  /** Bounded label set used by the internal Prometheus collector. */
  async counts(): Promise<Record<'waiting' | 'active' | 'delayed' | 'failed', number> | null> {
    if (!this.queue) return null;
    const counts = await this.queue.getJobCounts('waiting', 'active', 'delayed', 'failed');
    return {
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      delayed: counts.delayed ?? 0,
      failed: counts.failed ?? 0,
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }
}
