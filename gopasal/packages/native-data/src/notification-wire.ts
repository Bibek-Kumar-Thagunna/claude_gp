/** Notification rows, as the inbox screens of both apps read them. Pure, so it is testable. */
export type AppNotification = {
  id: string;
  title: string;
  body?: string | null;
  type?: string | null;
  /** Lifted out of `data` — see {@link notificationRows}. */
  orderId?: string | null;
  /** What the event carried: `orderId`, `code`, `conversationId`, `shopId`… */
  data?: Record<string, unknown> | null;
  readAt?: string | null;
  createdAt: string;
};

/**
 * `GET /notifications` answers `{ unread, items }` — not an array, and not the
 * `{ data }` page the other lists use. Reading it as either gave an inbox that
 * was always empty however many notifications the account had. And the order a
 * notification is about lives in its `data` JSON, not on the row, so it is
 * lifted to `orderId` here for the screens that open it.
 */
export function notificationRows(result: unknown): AppNotification[] {
  const raw = Array.isArray(result)
    ? result
    : result && typeof result === "object"
      ? ((result as { items?: unknown; data?: unknown }).items ??
        (result as { data?: unknown }).data ??
        [])
      : [];
  if (!Array.isArray(raw)) return [];
  return (raw as AppNotification[]).map((n) => {
    const data = n.data && typeof n.data === "object" ? n.data : null;
    const lifted = typeof data?.orderId === "string" ? data.orderId : null;
    return { ...n, data, orderId: n.orderId ?? lifted };
  });
}
