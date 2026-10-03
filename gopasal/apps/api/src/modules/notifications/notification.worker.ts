import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import { RedisService } from '../../common/redis/redis.service';
import { PUSH_PROVIDER, PushProvider } from '../../providers/push.provider';
import { DeviceTokensService } from './device-tokens.service';
import type { JsonObject } from '../../common/types/json';
import { NotificationsService } from './notifications.service';
import { NOTIFICATIONS_QUEUE, NotificationJob } from './notification.queue';

/**
 * Flatten a JSON payload into the string→string map device push transports
 * (FCM/APNs) accept. Non-strings are serialised; null/absent entries are dropped
 * rather than shipped as the literal text "null".
 */
function toPushData(payload?: JsonObject): Record<string, string> {
  const out: Record<string, string> = {};
  if (!payload) return out;
  for (const [key, value] of Object.entries(payload)) {
    if (value === null || value === undefined) continue;
    out[key] = typeof value === 'string' ? value : JSON.stringify(value);
  }
  return out;
}

/**
 * Consumes the notifications queue: writes the in-app row, then (best-effort)
 * pushes to the user's devices via the swappable PushProvider. Runs in-process
 * for local/dev; in production this same class can run in a separate worker
 * dyno pointed at the same Redis. A failed push does NOT fail the job once the
 * row is written — the in-app centre is the source of truth.
 *
 * The worker owns its Redis connections: it is constructed with connection
 * *options* so BullMQ creates them, and `close()` interrupts the blocking read the
 * worker parks on and disposes of them. That blocking read is precisely what an
 * outside `quit()` cannot get past, so ownership has to sit here.
 */
@Injectable()
export class NotificationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationWorker.name);
  private worker?: Worker<NotificationJob>;

  constructor(
    private readonly redis: RedisService,
    private readonly notifications: NotificationsService,
    @Inject(PUSH_PROVIDER) private readonly push: PushProvider,
    private readonly devices: DeviceTokensService,
  ) {}

  onModuleInit(): void {
    // The provider reports tokens the push service has rejected as gone; the
    // registry is the only thing that can act on that, and the provider must
    // not know about the database. This is the join.
    this.push.onInvalidTokens = (tokens) => this.devices.disable(tokens);
    try {
      this.worker = new Worker<NotificationJob>(
        NOTIFICATIONS_QUEUE,
        async (job) => this.handle(job.data),
        {
          connection: { ...this.redis.connectionOptions(), maxRetriesPerRequest: null },
          concurrency: 8,
        },
      );
      this.worker.on('failed', (job, err) =>
        this.logger.warn(`Job ${job?.id} (${job?.name}) failed: ${err.message}`),
      );
      this.logger.log('Notification worker ready');
    } catch (err) {
      this.logger.error(`Could not start notification worker: ${(err as Error).message}`);
    }
  }

  private async handle(data: NotificationJob): Promise<void> {
    await this.notifications.create({
      userId: data.userId,
      type: data.type,
      title: data.title,
      body: data.body,
      data: data.data,
      channel: 'inapp',
    });

    if (data.push) {
      /*
        Real device tokens, or nothing.

        This used to address `user:<id>` — a placeholder from before the
        registry existed, which every provider could only log. Now it is the
        tokens the customer's phones actually registered, and a user with no
        phone registered is simply not pushed to: the in-app row has already
        landed and is the source of truth.

        Failures are swallowed on purpose. A push that did not go out must not
        fail the job and re-run the whole notification, because the row would
        then be written twice.
      */
      try {
        const tokens = await this.devices.liveTokensFor(data.userId);
        if (tokens.length > 0) {
          await this.push.send(tokens, {
            title: data.title,
            body: data.body,
            data: { type: data.type, ...toPushData(data.data) },
          });
        }
      } catch (err) {
        this.logger.warn(`Push failed for ${data.userId}: ${(err as Error).message}`);
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
