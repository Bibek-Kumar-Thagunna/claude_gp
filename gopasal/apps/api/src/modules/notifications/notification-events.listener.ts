import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  ApplicationApprovedEvent,
  ApplicationChangesRequestedEvent,
  ApplicationClaimedEvent,
  ApplicationRejectedEvent,
  ApplicationSubmittedEvent,
  ApplicationWithdrawnEvent,
  DeliveryAssignedEvent,
  DeliveryStatusChangedEvent,
  EVENTS,
  OrderPlacedEvent,
  OrderStatusChangedEvent,
} from '../../common/events';
import { NotificationQueue } from './notification.queue';

/** Human-friendly copy for each order status the customer should hear about. */
const ORDER_STATUS_COPY: Record<string, { title: string; body: (code: string) => string }> = {
  ACCEPTED: { title: 'Order accepted', body: (c) => `The shop accepted order ${c} and is preparing it.` },
  PACKED: { title: 'Order packed', body: (c) => `Order ${c} is packed and ready to go.` },
  OUT_FOR_DELIVERY: { title: 'Out for delivery', body: (c) => `Order ${c} is on its way — track your rider live.` },
  DELIVERED: { title: 'Delivered', body: (c) => `Order ${c} was delivered. Enjoy! Tap to leave a review.` },
  REJECTED: { title: 'Order rejected', body: (c) => `Sorry — the shop could not accept order ${c}.` },
  CANCELLED: { title: 'Order cancelled', body: (c) => `Order ${c} was cancelled.` },
};

const DELIVERY_STATUS_COPY: Record<string, { title: string; body: (code: string) => string }> = {
  PICKED_UP: { title: 'Rider picked up your order', body: (c) => `Your rider has order ${c} and is heading out.` },
  EN_ROUTE: { title: 'Rider en route', body: (c) => `Your rider is on the way with order ${c}. Track live.` },
  FAILED: { title: 'Delivery issue', body: (c) => `We hit a problem delivering order ${c}. Support will reach out.` },
};

/**
 * Translates domain events into queued notifications. This is the ONLY place
 * that decides "who hears what" — services just emit facts. Listeners are async
 * and isolated (a notification failure can never roll back an order).
 */
@Injectable()
export class NotificationEventsListener {
  private readonly logger = new Logger(NotificationEventsListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: NotificationQueue,
  ) {}

  @OnEvent(EVENTS.ORDER_PLACED, { async: true })
  async onOrderPlaced(e: OrderPlacedEvent): Promise<void> {
    // Customer acknowledgement
    await this.queue.enqueue({
      userId: e.customerId,
      type: 'order.placed',
      title: 'Order placed',
      body: `We sent order ${e.code} to the shop. You'll hear the moment they accept.`,
      data: { orderId: e.orderId, code: e.code },
      push: true,
    });
    // Shop owner gets the incoming-order ping
    const shop = await this.prisma.shop.findUnique({ where: { id: e.shopId }, select: { ownerId: true, name: true } });
    if (shop) {
      await this.queue.enqueue({
        userId: shop.ownerId,
        type: 'order.incoming',
        title: 'New order',
        body: `New order ${e.code} just came in. Accept it to start preparing.`,
        data: { orderId: e.orderId, code: e.code, shopId: e.shopId },
        push: true,
      });
    }
  }

  @OnEvent(EVENTS.ORDER_STATUS_CHANGED, { async: true })
  async onOrderStatus(e: OrderStatusChangedEvent): Promise<void> {
    const copy = ORDER_STATUS_COPY[e.to];
    if (!copy) return;
    await this.queue.enqueue({
      userId: e.customerId,
      type: `order.${e.to.toLowerCase()}`,
      title: copy.title,
      body: copy.body(e.code),
      data: { orderId: e.orderId, code: e.code, status: e.to },
      push: true,
    });
  }

  @OnEvent(EVENTS.DELIVERY_ASSIGNED, { async: true })
  async onDeliveryAssigned(e: DeliveryAssignedEvent): Promise<void> {
    await this.queue.enqueue({
      userId: e.customerId,
      type: 'delivery.assigned',
      title: 'Rider assigned',
      body: 'A rider has been assigned to your order.',
      data: { orderId: e.orderId, deliveryId: e.deliveryId },
      push: false,
    });
  }

  @OnEvent(EVENTS.DELIVERY_STATUS_CHANGED, { async: true })
  async onDeliveryStatus(e: DeliveryStatusChangedEvent): Promise<void> {
    const copy = DELIVERY_STATUS_COPY[e.to];
    if (!copy) return;
    const order = await this.prisma.order.findUnique({ where: { id: e.orderId }, select: { code: true } });
    await this.queue.enqueue({
      userId: e.customerId,
      type: `delivery.${e.to.toLowerCase()}`,
      title: copy.title,
      body: copy.body(order?.code ?? ''),
      data: { orderId: e.orderId, deliveryId: e.deliveryId, status: e.to },
      push: true,
    });
  }

  // ── seller onboarding ──────────────────────────────────────────────────────
  //
  // Two audiences, and the split matters: the applicant hears about their own
  // application in plain language, and the people who can act on it hear that
  // there is work in the queue. Nothing here reads `reviewerNote` — internal
  // notes are not in the event payloads at all, which is what stops one being
  // texted to an applicant by accident.

  @OnEvent(EVENTS.APPLICATION_SUBMITTED, { async: true })
  async onApplicationSubmitted(e: ApplicationSubmittedEvent): Promise<void> {
    await this.queue.enqueue({
      userId: e.applicantId,
      type: 'application.submitted',
      title: e.resubmission ? 'Application resubmitted' : 'Application received',
      body: e.resubmission
        ? `Thank you — we have your updated details for ${e.shopName} (${e.reference}) and will take another look.`
        : `We have your application for ${e.shopName} (${e.reference}). GoPasal will review it and get back to you.`,
      data: { applicationId: e.applicationId, reference: e.reference },
      push: true,
    });

    const reviewers = await this.reviewerRecipients();
    await this.queue.enqueueMany(
      reviewers.map((userId) => ({
        userId,
        type: 'application.queued',
        title: e.resubmission ? 'Application resubmitted' : 'New seller application',
        body: `${e.shopName}${e.area ? ` — ${e.area}` : ''} (${e.reference}) is waiting for review.`,
        data: { applicationId: e.applicationId, reference: e.reference },
        push: false,
      })),
    );
  }

  @OnEvent(EVENTS.APPLICATION_CLAIMED, { async: true })
  async onApplicationClaimed(e: ApplicationClaimedEvent): Promise<void> {
    // Deliberately no reviewer name: the applicant is told GoPasal is looking at
    // their application, not which member of staff has it open.
    await this.queue.enqueue({
      userId: e.applicantId,
      type: 'application.under_review',
      title: 'Application under review',
      body: `A GoPasal reviewer is going through application ${e.reference} now.`,
      data: { applicationId: e.applicationId, reference: e.reference },
      push: false,
    });
  }

  @OnEvent(EVENTS.APPLICATION_CHANGES_REQUESTED, { async: true })
  async onApplicationChangesRequested(e: ApplicationChangesRequestedEvent): Promise<void> {
    await this.queue.enqueue({
      userId: e.applicantId,
      type: 'application.changes_requested',
      title: 'We need a few changes',
      // `note` is the reviewer's applicant-facing message, written to be read by
      // them, so it is passed through rather than summarised.
      body: e.note,
      data: { applicationId: e.applicationId, reference: e.reference, fields: e.fields },
      push: true,
    });
  }

  @OnEvent(EVENTS.APPLICATION_APPROVED, { async: true })
  async onApplicationApproved(e: ApplicationApprovedEvent): Promise<void> {
    await this.queue.enqueue({
      userId: e.applicantId,
      type: 'application.approved',
      title: `${e.shopName} is on GoPasal`,
      body:
        e.note ??
        `Your application was approved. ${e.shopName} is live — open the seller console to add your products.`,
      data: {
        applicationId: e.applicationId,
        reference: e.reference,
        shopId: e.shopId,
        shopSlug: e.shopSlug,
      },
      push: true,
    });
  }

  @OnEvent(EVENTS.APPLICATION_REJECTED, { async: true })
  async onApplicationRejected(e: ApplicationRejectedEvent): Promise<void> {
    await this.queue.enqueue({
      userId: e.applicantId,
      type: 'application.rejected',
      title: 'Application not approved',
      body: e.note,
      data: { applicationId: e.applicationId, reference: e.reference },
      push: true,
    });
  }

  @OnEvent(EVENTS.APPLICATION_WITHDRAWN, { async: true })
  async onApplicationWithdrawn(e: ApplicationWithdrawnEvent): Promise<void> {
    // Only the reviewer who had it open is told, and only if there was one. The
    // applicant performed this action themselves, so telling them is noise.
    if (!e.reviewerId) return;
    await this.queue.enqueue({
      userId: e.reviewerId,
      type: 'application.withdrawn',
      title: 'Application withdrawn',
      body: `Application ${e.reference} was withdrawn by the applicant${e.reason ? `: ${e.reason}` : ''}.`,
      data: { applicationId: e.applicationId, reference: e.reference },
      push: false,
    });
  }

  /**
   * Who should hear that there is an application waiting: active platform staff
   * whose role either bypasses granular checks or actually carries
   * `shops.approve`. Asking RBAC the same question the guard asks keeps the ping
   * and the permission from drifting apart — nobody is notified about work they
   * would be refused.
   */
  private async reviewerRecipients(): Promise<string[]> {
    const memberships = await this.prisma.platformMembership.findMany({
      where: {
        user: { status: 'ACTIVE' },
        role: {
          OR: [
            { isPrivileged: true },
            { permissions: { some: { permissionKey: 'shops.approve' } } },
          ],
        },
      },
      select: { userId: true },
    });
    return memberships.map((m) => m.userId);
  }
}
