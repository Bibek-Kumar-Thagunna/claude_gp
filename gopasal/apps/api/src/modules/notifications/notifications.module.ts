import { Module } from '@nestjs/common';
import { DeviceTokensService } from './device-tokens.service';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationQueue } from './notification.queue';
import { NotificationWorker } from './notification.worker';
import { NotificationEventsListener } from './notification-events.listener';

/**
 * Notification fan-out. Domain events → listener → BullMQ queue → worker →
 * Notification rows + device push. PushProvider, Prisma and Redis are global.
 */
@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    DeviceTokensService,
    NotificationQueue,
    NotificationWorker,
    NotificationEventsListener,
  ],
  exports: [NotificationsService, NotificationQueue, DeviceTokensService],
})
export class NotificationsModule {}
