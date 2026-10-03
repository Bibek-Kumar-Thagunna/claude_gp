import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { PrismaService } from "../../common/prisma/prisma.service";
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
  ConversationMessageCreatedEvent,
} from "../../common/events";
import { NotificationQueue } from "./notification.queue";
import { RbacService } from "../../rbac/rbac.service";

/** Human-friendly copy for each order status the customer should hear about. */
const ORDER_STATUS_COPY: Record<string, { title: string; body: (code: string) => string }> = {
  ACCEPTED: {
    title: "Order accepted",
    body: (c) => `The shop accepted order ${c} and is preparing it.`,
  },
  PACKED: { title: "Order packed", body: (c) => `Order ${c} is packed and ready to go.` },
  OUT_FOR_DELIVERY: {
    title: "Out for delivery",
    body: (c) => `Order ${c} is on its way — track your rider live.`,
  },
  DELIVERED: {
    title: "Delivered",
    body: (c) => `Order ${c} was delivered. Enjoy! Tap to leave a review.`,
  },
  REJECTED: {
    title: "Order rejected",
    body: (c) => `Sorry — the shop could not accept order ${c}.`,
  },
  CANCELLED: { title: "Order cancelled", body: (c) => `Order ${c} was cancelled.` },
};

const DELIVERY_STATUS_COPY: Record<string, { title: string; body: (code: string) => string }> = {
  PICKED_UP: {
    title: "Rider picked up your order",
    body: (c) => `Your rider has order ${c} and is heading out.`,
  },
  EN_ROUTE: {
    title: "Rider en route",
    body: (c) => `Your rider is on the way with order ${c}. Track live.`,
  },
  FAILED: {
    title: "Delivery issue",
    body: (c) => `Order ${c} could not be handed over. The shop is reviewing the next step.`,
  },
  RETURNING_TO_SHOP: {
    title: "Order returning to shop",
    body: (c) => `Order ${c} is being taken safely back to the shop.`,
  },
  RETURNED_TO_SHOP: {
    title: "Order back at the shop",
    body: (c) =>
      `Order ${c} is back at the shop. You can wait for redelivery or cancel for a refund.`,
  },
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
    private readonly rbac: RbacService,
  ) {}

  @OnEvent(EVENTS.ORDER_PLACED, { async: true })
  async onOrderPlaced(e: OrderPlacedEvent): Promise<void> {
    // Customer acknowledgement
    await this.queue.enqueue({
      userId: e.customerId,
      type: "order.placed",
      title: "Order placed",
      body: `We sent order ${e.code} to the shop. You'll hear the moment they accept.`,
      data: { orderId: e.orderId, code: e.code },
      push: true,
    });
    /*
      Everyone on the counter, not just the owner.

      This used to notify `shop.ownerId` alone, which is right for a one-person
      shop and wrong for every other kind: the assistant standing at the counter
      is the person who will accept the order, and the owner may be asleep. The
      question "who should hear about an order at this shop" has an exact
      answer already — whoever holds `orders.view` there — so it is asked
      rather than approximated.

      The owner is included by their own membership; they do not need a special
      case, and adding one would double-notify them.
    */
    const recipients = await this.rbac.usersWithShopPermission(e.shopId, "orders.view");
    await Promise.all(
      recipients.map((userId) =>
        this.queue.enqueue({
          userId,
          type: "order.incoming",
          title: "New order",
          body: `New order ${e.code} just came in. Accept it to start preparing.`,
          data: { orderId: e.orderId, code: e.code, shopId: e.shopId },
          push: true,
        }),
      ),
    );
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
      type: "delivery.assigned",
      title: "Rider assigned",
      body: "A rider has been assigned to your order.",
      data: { orderId: e.orderId, deliveryId: e.deliveryId },
      push: false,
    });
    /*
      And the rider. Until this was added the assignment reached everybody
      except the one person who has to act on it: a rider standing outside the
      shop learnt they had a job only by opening the app and waiting for its
      poll. The push carries the order id, so tapping it opens that job, and
      says where it goes and whether there is cash to collect — the two things a
      rider decides on before they start the bike.
    */
    const [rider, order] = await Promise.all([
      this.prisma.rider.findUnique({ where: { id: e.riderId }, select: { userId: true } }),
      this.prisma.order.findUnique({
        where: { id: e.orderId },
        select: { code: true, area: true, total: true, paymentMethod: true, shop: { select: { name: true } } },
      }),
    ]);
    if (!rider || !order) return;
    const cash = order.paymentMethod === "COD" ? ` · collect Rs ${Math.round(Number(order.total))}` : "";
    await this.queue.enqueue({
      userId: rider.userId,
      type: "rider.job.assigned",
      title: `New job · ${order.shop.name}`,
      body: `Order ${order.code} to ${order.area}${cash}.`,
      data: { orderId: e.orderId, deliveryId: e.deliveryId, code: order.code, shopId: e.shopId },
      push: true,
    });
  }

  @OnEvent(EVENTS.DELIVERY_STATUS_CHANGED, { async: true })
  async onDeliveryStatus(e: DeliveryStatusChangedEvent): Promise<void> {
    const copy = DELIVERY_STATUS_COPY[e.to];
    if (!copy) return;
    const order = await this.prisma.order.findUnique({
      where: { id: e.orderId },
      select: { code: true },
    });
    await this.queue.enqueue({
      userId: e.customerId,
      type: `delivery.${e.to.toLowerCase()}`,
      title: copy.title,
      body: copy.body(order?.code ?? ""),
      data: { orderId: e.orderId, deliveryId: e.deliveryId, status: e.to },
      push: true,
    });
  }

  @OnEvent(EVENTS.CONVERSATION_MESSAGE_CREATED, { async: true })
  async onConversationMessage(e: ConversationMessageCreatedEvent): Promise<void> {
    if (e.sender === "SHOP") {
      await this.queue.enqueue({
        userId: e.customerId,
        type: "conversation.message",
        title: "New message from a shop",
        body: e.body,
        data: { conversationId: e.conversationId, shopId: e.shopId },
        push: true,
      });
      return;
    }

    if (e.sender !== "CUSTOMER") return;
    const memberships = await this.prisma.shopMembership.findMany({
      where: {
        shopId: e.shopId,
        status: "ACTIVE",
        user: { status: "ACTIVE", id: { not: e.authorId } },
        role: {
          OR: [
            { isPrivileged: true },
            { permissions: { some: { permissionKey: "messages.view" } } },
          ],
        },
      },
      select: { userId: true, shop: { select: { name: true } } },
    });
    await this.queue.enqueueMany(
      memberships.map((membership) => ({
        userId: membership.userId,
        type: "conversation.incoming",
        title: `New customer message · ${membership.shop.name}`,
        body: e.body,
        data: { conversationId: e.conversationId, shopId: e.shopId },
        push: true,
      })),
    );
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
      type: "application.submitted",
      title: e.resubmission ? "Application resubmitted" : "Application received",
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
        type: "application.queued",
        title: e.resubmission ? "Application resubmitted" : "New seller application",
        body: `${e.shopName}${e.area ? ` — ${e.area}` : ""} (${e.reference}) is waiting for review.`,
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
      type: "application.under_review",
      title: "Application under review",
      body: `A GoPasal reviewer is going through application ${e.reference} now.`,
      data: { applicationId: e.applicationId, reference: e.reference },
      push: false,
    });
  }

  @OnEvent(EVENTS.APPLICATION_CHANGES_REQUESTED, { async: true })
  async onApplicationChangesRequested(e: ApplicationChangesRequestedEvent): Promise<void> {
    await this.queue.enqueue({
      userId: e.applicantId,
      type: "application.changes_requested",
      title: "We need a few changes",
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
      type: "application.approved",
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
      type: "application.rejected",
      title: "Application not approved",
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
      type: "application.withdrawn",
      title: "Application withdrawn",
      body: `Application ${e.reference} was withdrawn by the applicant${e.reason ? `: ${e.reason}` : ""}.`,
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
        user: { status: "ACTIVE" },
        role: {
          OR: [
            { isPrivileged: true },
            { permissions: { some: { permissionKey: "shops.approve" } } },
          ],
        },
      },
      select: { userId: true },
    });
    return memberships.map((m) => m.userId);
  }
}
