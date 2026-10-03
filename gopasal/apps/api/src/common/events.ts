import type { DeliveryStatus, OrderStatus } from "@prisma/client";

/**
 * Domain events emitted onto the app-wide EventEmitter2 bus. Orders/delivery
 * publish; notifications (BullMQ) and the realtime gateway subscribe. Central
 * registry so producers and consumers can't drift on the event name/shape.
 */
export const EVENTS = {
  ORDER_PLACED: "order.placed",
  ORDER_STATUS_CHANGED: "order.status_changed",
  DELIVERY_ASSIGNED: "delivery.assigned",
  DELIVERY_STATUS_CHANGED: "delivery.status_changed",
  RIDER_LOCATION: "rider.location",
  APPLICATION_SUBMITTED: "application.submitted",
  APPLICATION_CLAIMED: "application.claimed",
  APPLICATION_CHANGES_REQUESTED: "application.changes_requested",
  APPLICATION_APPROVED: "application.approved",
  APPLICATION_REJECTED: "application.rejected",
  APPLICATION_WITHDRAWN: "application.withdrawn",
  CONVERSATION_MESSAGE_CREATED: "conversation.message_created",
} as const;

export interface OrderPlacedEvent {
  orderId: string;
  code: string;
  shopId: string;
  customerId: string;
  total: number;
}

export interface OrderStatusChangedEvent {
  orderId: string;
  code: string;
  shopId: string;
  customerId: string;
  from: OrderStatus;
  to: OrderStatus;
  actorId?: string;
  note?: string;
}

export interface DeliveryAssignedEvent {
  orderId: string;
  deliveryId: string;
  riderId: string;
  shopId: string;
  customerId: string;
}

export interface DeliveryStatusChangedEvent {
  orderId: string;
  deliveryId: string;
  shopId: string;
  customerId: string;
  from: DeliveryStatus;
  to: DeliveryStatus;
  /** Who moved it — the rider on the road, or the shop from the console. */
  actor: "RIDER" | "SHOP";
  actorId?: string;
}

export interface RiderLocationEvent {
  riderId: string;
  orderId?: string;
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  accuracy?: number;
  at: string;
}

export interface ConversationMessageCreatedEvent {
  conversationId: string;
  shopId: string;
  customerId: string;
  messageId: string;
  authorId: string;
  sender: "CUSTOMER" | "SHOP" | "SYSTEM";
  body: string;
  createdAt: string;
}

/**
 * Seller-onboarding facts. The onboarding service emits these; the notification
 * listener decides who hears about them. None of them carry `reviewerNote` or
 * any other internal field — an event payload is read by a fan-out that writes
 * applicant-facing copy, so putting an internal note in one would be how it
 * leaks.
 */
export interface ApplicationSubmittedEvent {
  applicationId: string;
  reference: string;
  applicantId: string;
  shopName: string;
  area?: string;
  /** 1 on first submit, 2+ when it comes back after a change request. */
  submitCount: number;
  resubmission: boolean;
}

export interface ApplicationClaimedEvent {
  applicationId: string;
  reference: string;
  applicantId: string;
  reviewerId: string;
}

export interface ApplicationChangesRequestedEvent {
  applicationId: string;
  reference: string;
  applicantId: string;
  reviewerId: string;
  /** Shown to the applicant verbatim. */
  note: string;
  fields: string[];
}

export interface ApplicationApprovedEvent {
  applicationId: string;
  reference: string;
  applicantId: string;
  reviewerId: string;
  shopId: string;
  shopName: string;
  shopSlug: string;
  /** Applicant-visible welcome note, if the reviewer wrote one. */
  note?: string;
}

export interface ApplicationRejectedEvent {
  applicationId: string;
  reference: string;
  applicantId: string;
  reviewerId: string;
  /** Applicant-visible reason. Required on rejection. */
  note: string;
}

export interface ApplicationWithdrawnEvent {
  applicationId: string;
  reference: string;
  applicantId: string;
  /** Set when a reviewer had already picked it up, so they can be told. */
  reviewerId?: string;
  reason?: string;
}
