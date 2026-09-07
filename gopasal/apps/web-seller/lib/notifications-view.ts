/**
 * The seller console's view of the signed-in account's notifications.
 *
 * The API's `Notification` row is deliberately thin — `type`, `title`, `body` and
 * a free-form `data` blob — and the copy in `title`/`body` is written server-side
 * by `notification-events.listener.ts`. This module does not rewrite that copy: it
 * is the same text the customer app and the push payload use, and a second
 * translation of it in the browser would eventually disagree. What it adds is the
 * three things the row cannot answer for itself: which family the `type` belongs
 * to, whether there is somewhere in *this* console to go, and what to call the
 * shop a row is about.
 *
 * Two decisions worth stating plainly, because both are visible on screen:
 *
 * 1. **Customer-side rows are shown, not hidden.** A shopkeeper who also buys on
 *    GoPasal gets `order.accepted`, `delivery.en_route` and so on from *their own*
 *    orders, addressed to the same account. `GET /notifications` has no way to
 *    exclude them and they are genuinely that account's notifications, so they
 *    appear — but with no link, because the order behind them is not one the seller
 *    console can open. Dropping rows the API returned would be worse: a count that
 *    disagrees with `unread`, and mail quietly disappearing.
 * 2. **Only a row that names its shop gets an order link.** Exactly one type does:
 *    `order.incoming`, the shop-owner ping, which writes `data.shopId`. Everything
 *    else with an `orderId` is the buyer's copy. Linking those to
 *    `/orders/:id` would send a shopkeeper to a "not found" screen for an order
 *    they placed themselves.
 */

import type { Tone } from "@/components/primitives";
import type { NotificationWire } from "./api/notifications";

/* -------------------------------------------------------------------- Payload */

/**
 * The useful keys out of `data`, which is a `Json?` column and therefore genuinely
 * unknown at the type level. Every field below is written by a specific branch of
 * `notification-events.listener.ts`; a row from a branch added later will simply
 * have all of them `null`, which is the correct answer rather than a parse error.
 */
export type NotificationPayload = {
  orderId: string | null;
  /** The human order code, e.g. `GP-24815`. */
  code: string | null;
  shopId: string | null;
  applicationId: string | null;
  /** The onboarding application's reference, e.g. `GP-APP-0007`. */
  reference: string | null;
};

const EMPTY_PAYLOAD: NotificationPayload = {
  orderId: null,
  code: null,
  shopId: null,
  applicationId: null,
  reference: null,
};

/** A non-empty string at `key`, or `null`. Anything else in the slot is ignored. */
function str(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

function parseNotificationData(raw: unknown): NotificationPayload {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return EMPTY_PAYLOAD;
  const o = raw as Record<string, unknown>;
  return {
    orderId: str(o, "orderId"),
    code: str(o, "code"),
    shopId: str(o, "shopId"),
    applicationId: str(o, "applicationId"),
    reference: str(o, "reference"),
  };
}

/* ------------------------------------------------------------------- Families */

/**
 * The coarse group a `type` belongs to, taken from the part before the first dot.
 * `type` is a free-form `String` column, so anything unrecognised is `other`.
 *
 * Internal, and doing less than it once did. Every row also carried a
 * `familyLabel` — "Orders", "Delivery", "Your application", "GoPasal" — and no
 * screen ever rendered it: the panel is one reverse-chronological list with an
 * all/unread filter, and it names a row by its exact `type` ("Rider collected it")
 * because that is the more useful of the two labels. The group itself stays,
 * because two things still decide on it: the tone a `delivery.*` event falls back
 * to, and `notificationHref` sending an `application.*` row to /onboarding.
 */
type NotificationFamily = "order" | "delivery" | "application" | "other";

function notificationFamily(type: string): NotificationFamily {
  const head = type.split(".")[0];
  if (head === "order") return "order";
  if (head === "delivery") return "delivery";
  if (head === "application") return "application";
  return "other";
}

/**
 * Short labels for every `type` the API currently emits, read off
 * `notification-events.listener.ts`.
 *
 * This is a *label*, not the message — `title` and `body` are server-owned and
 * shown verbatim. The label is the small line above them that says what kind of
 * thing this is. An unknown key falls through to the raw `type` string, which is
 * ugly on purpose: a new server event should look unfinished here, not invisible.
 */
const TYPE_LABELS: Record<string, string> = {
  // Sent to the shop's owner.
  "order.incoming": "New order",
  // Sent to the buyer. A seller sees these for their own shopping.
  "order.placed": "Order placed",
  "order.accepted": "Order accepted",
  "order.packed": "Order packed",
  "order.out_for_delivery": "Out for delivery",
  "order.delivered": "Delivered",
  "order.rejected": "Order rejected",
  "order.cancelled": "Order cancelled",
  "delivery.assigned": "Rider assigned",
  "delivery.picked_up": "Rider collected it",
  "delivery.en_route": "Rider on the way",
  "delivery.failed": "Delivery problem",
  // Seller onboarding.
  "application.submitted": "Application sent",
  "application.queued": "Application in the queue",
  "application.under_review": "Being reviewed",
  "application.changes_requested": "Changes needed",
  "application.approved": "Approved",
  "application.rejected": "Not approved",
  "application.withdrawn": "Withdrawn",
};

function notificationTypeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

/** Colour by consequence: something to act on, something that went wrong, or news. */
const TYPE_TONES: Record<string, Tone> = {
  "order.incoming": "crimson",
  "order.rejected": "red",
  "order.cancelled": "ink",
  "delivery.failed": "red",
  "order.delivered": "green",
  "application.approved": "green",
  "application.changes_requested": "marigold",
  "application.rejected": "red",
};

/* --------------------------------------------------------------------- Rows */

export type SellerNotification = {
  id: string;
  type: string;
  typeLabel: string;
  /** Which coarse group this belongs to. Read by `notificationHref`, not rendered. */
  family: NotificationFamily;
  /** Server-written copy, shown as-is. */
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  payload: NotificationPayload;
  tone: Tone;
};

function toSellerNotification(w: NotificationWire): SellerNotification {
  const family = notificationFamily(w.type);
  return {
    id: w.id,
    type: w.type,
    typeLabel: notificationTypeLabel(w.type),
    family,
    title: w.title,
    body: w.body,
    read: w.readAt !== null,
    createdAt: w.createdAt,
    payload: parseNotificationData(w.data),
    tone: TYPE_TONES[w.type] ?? (family === "delivery" ? "blue" : "ink"),
  };
}

export function toSellerNotifications(wire: NotificationWire[]): SellerNotification[] {
  return wire.map(toSellerNotification);
}

/* --------------------------------------------------------------------- Links */

/**
 * Where this notification goes in the seller console, or `null` for one that has
 * nowhere to go.
 *
 * `canOpenOrder` is the caller's own `orders.view` check for a given shop, passed
 * in rather than read here so this module stays free of React context. It matters:
 * a staff member with `delivery.view` but not `orders.view` on the shop would be
 * offered a screen the API will refuse.
 *
 * The `?shop=` hint is what `app/(app)/orders/[id]/page.tsx` uses to skip probing
 * every shop for the order.
 */
export function notificationHref(
  n: SellerNotification,
  canOpenOrder: (shopId: string) => boolean,
): string | null {
  if (n.family === "application") return "/onboarding";
  const { orderId, shopId } = n.payload;
  if (orderId && shopId && canOpenOrder(shopId)) {
    return `/orders/${encodeURIComponent(orderId)}?shop=${encodeURIComponent(shopId)}`;
  }
  return null;
}

/* -------------------------------------------------------------------- Filters */

/**
 * The two views the endpoint supports. `unread` is a real server-side filter
 * (`?unread=true`); there is nothing else to offer — no type filter, no date
 * range, no per-shop tab, because the row has no shop column to group by.
 */
export type NotificationFilter = "all" | "unread";

/** True once the account has hit the endpoint's `take: 100` horizon. */
export const NOTIFICATION_PAGE_LIMIT = 100;

export function atListLimit(items: unknown[]): boolean {
  return items.length >= NOTIFICATION_PAGE_LIMIT;
}
