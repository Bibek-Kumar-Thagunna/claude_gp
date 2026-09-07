import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { JsonObject } from '../../common/types/json';

export interface NotificationInput {
  userId: string;
  type: string;
  title: string;
  body: string;
  /** Deep-link payload for the client (order id, code, …). JSON-typed so it can
   *  go into the `data` Json column without a cast. */
  data?: JsonObject;
  channel?: 'inapp' | 'push' | 'sms';
}

/**
 * Persistence + read APIs for the in-app notification centre. The actual
 * fan-out from domain events runs through the BullMQ queue/worker; this service
 * is the storage layer both the worker and the customer controller share.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  create(input: NotificationInput) {
    return this.prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        data: input.data ?? undefined,
        channel: input.channel ?? 'inapp',
      },
    });
  }

  /**
   * The newest 100 notifications for one user, plus the unread badge.
   *
   * **Capped, not paged, on purpose.** Unlike orders, reviews and coupons — which
   * were given `?page&limit&q&status&sort` because a seller genuinely needs to reach
   * an old row and act on it — a notification is a *transient prompt*. Its value is
   * the deep link it carries to the order or dispute it is about, and that thing is
   * reachable from its own screen, which is paged and searchable. Nobody needs page
   * 4 of last quarter's "order accepted" messages; if they want that order, they
   * search the order queue.
   *
   * So `take: 100` is the contract: a bounded read that answers the only two
   * questions the bell asks — what happened recently, and how much of it is
   * unread. Adding pagination here would let a client walk an unbounded, unpruned
   * table for no product reason, which is a bigger risk than the one it removes.
   *
   * `unread` is deliberately counted over **all** of the user's notifications and is
   * unaffected by `unreadOnly` and by the 100-row cap, so the badge stays true when
   * the list is filtered or clipped — the same shop-wide-summary rule the seller
   * lists follow.
   *
   * The ordering is index-backed: see `@@index([userId, createdAt])` on
   * `model Notification` and migration `*_notification_user_created_index`.
   * Without it this read top-N sorted the user's entire history.
   */
  async listMine(userId: string, unreadOnly = false) {
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { unread, items };
  }

  unreadCount(userId: string) {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(userId: string, id: string) {
    const note = await this.prisma.notification.findUnique({ where: { id } });
    if (!note || note.userId !== userId) throw new NotFoundException('Notification not found');
    if (note.readAt) return note;
    return this.prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
  }

  async markAllRead(userId: string) {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: count };
  }
}
