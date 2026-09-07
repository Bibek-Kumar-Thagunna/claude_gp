/**
 * The signed-in account's notifications.
 *
 * Backed by `apps/api/src/modules/notifications/notifications.controller.ts`,
 * which is `@Controller('notifications')` and — uniquely among the routes this
 * console calls — carries **no `@RequirePermissions` decorator on any handler**.
 * Every method is keyed on `@CurrentUser('id')`, so the bearer token *is* the
 * authorization: you get your own rows and nobody else's. There is nothing for a
 * `PermissionGate` to check here, and adding one would hide a list the API is
 * willing to serve.
 *
 * Four facts shape every caller:
 *
 * 1. **There is no shop dimension at all.** `model Notification` is
 *    `userId, type, title, body, data, channel, readAt, createdAt` with a single
 *    `@@index([userId, readAt])` — no `shopId` column, no shop relation, no shop
 *    query parameter. A shop filter cannot be asked of the server. Some payloads
 *    happen to carry a shop id inside `data` (the shop-owner "new order" ping
 *    writes `data.shopId`), and `lib/notifications-view.ts` reads that to *label*
 *    and deep-link a row. It never filters on it: a row without the key is not a
 *    row from another shop, it is a row about something that has no shop.
 * 2. **`GET /notifications` already returns the unread count.** The response is
 *    `{ unread, items }`, not a bare array. `GET /notifications/unread-count`
 *    exists for the case where only the number is wanted — a poll behind a closed
 *    panel — and is not needed alongside a list that was just fetched.
 * 3. **The list is capped at `take: 100` with no pagination.** No cursor, no
 *    page, no `before`. The hundredth-newest notification is the horizon, and the
 *    console says so rather than implying it has everything. That cap is a decision
 *    the API documents on `NotificationsService.listMine`, not an unfinished
 *    endpoint: a notification's worth is the deep link it carries, and the thing it
 *    links to lives on a screen that *is* paged and searchable. Do not add a "load
 *    older" control here — there is nothing behind it to call.
 * 4. **`type` is a free-form `String` column**, not an enum, written by
 *    `notification-events.listener.ts`. Any label map has to fall back to the raw
 *    key or a new server-side event would render as blank copy.
 *
 * `channel` is deliberately not surfaced. The column defaults to `"inapp"` and
 * `notification.worker.ts` hardcodes `channel: 'inapp'` on the only write path, so
 * every row in this list has the same value. A channel badge would draw a
 * distinction the data does not contain.
 */

import { authedRequest } from "./client";

/* --------------------------------------------------------------------- Types */

/**
 * One row, exactly as Prisma serialises it.
 *
 * `data` is `Json?`, so it is `unknown` here and narrowed in the view model —
 * every payload key below came from a specific listener branch, and a row written
 * by a future branch may carry none of them.
 */
export type NotificationWire = {
  id: string;
  userId: string;
  /** e.g. `order.incoming`, `application.approved`. Free-form, not an enum. */
  type: string;
  title: string;
  body: string;
  /** Deep-link payload. `null` when the emitting listener sent none. */
  data: unknown;
  /** Always `"inapp"` in practice — see the note above. */
  channel: string;
  /** ISO timestamp, or `null` while unread. */
  readAt: string | null;
  createdAt: string;
};

/** `NotificationsService.listMine` — the count is of *all* unread, not of `items`. */
export type NotificationListWire = {
  unread: number;
  items: NotificationWire[];
};

/* --------------------------------------------------------------------- Reads */

/**
 * The account's newest 100 notifications, plus the total unread count.
 *
 * `unreadOnly` maps to `?unread=true`, which the controller accepts as `'true'`
 * or `'1'`. With the filter on, `items` is unread-only but `unread` is still the
 * full count, so the two agree by construction.
 */
export function listNotifications(
  opts?: { unreadOnly?: boolean },
  signal?: AbortSignal,
): Promise<NotificationListWire> {
  const qs = opts?.unreadOnly ? "?unread=true" : "";
  return authedRequest<NotificationListWire>(`/notifications${qs}`, { signal });
}

/** Just the number, for polling without pulling a hundred rows down with it. */
export function fetchUnreadCount(signal?: AbortSignal): Promise<{ unread: number }> {
  return authedRequest<{ unread: number }>("/notifications/unread-count", { signal });
}

/* ------------------------------------------------------------------- Actions */

/**
 * Mark one as read. Returns the updated row.
 *
 * 404s (`'Notification not found'`) when the id belongs to another account, and
 * is a no-op on a row that was already read — so a double click is harmless and
 * needs no client-side guard.
 */
export function markNotificationRead(
  id: string,
  signal?: AbortSignal,
): Promise<NotificationWire> {
  return authedRequest<NotificationWire>(
    `/notifications/${encodeURIComponent(id)}/read`,
    { method: "PATCH", signal },
  );
}

/**
 * Mark every unread row read. Returns `{ updated }` — a count, not the rows — so
 * the caller has to refetch rather than merge a response into its list.
 */
export function markAllNotificationsRead(signal?: AbortSignal): Promise<{ updated: number }> {
  return authedRequest<{ updated: number }>("/notifications/read-all", {
    method: "PATCH",
    signal,
  });
}
