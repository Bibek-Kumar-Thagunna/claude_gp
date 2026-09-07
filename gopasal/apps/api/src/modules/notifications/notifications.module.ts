import { Module } from '@nestjs/common';
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
  providers: [NotificationsService, NotificationQueue, NotificationWorker, NotificationEventsListener],
  exports: [NotificationsService, NotificationQueue],
})
export class NotificationsModule {}
