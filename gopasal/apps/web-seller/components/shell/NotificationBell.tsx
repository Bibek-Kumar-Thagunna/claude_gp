"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, Check, CheckCheck, Inbox, RefreshCw, X } from "lucide-react";
import { ApiError } from "@gopasal/api-client";
import { useAuth } from "@/components/auth-provider";
import { useShops } from "@/components/shop-provider";
import { Badge, Button } from "@/components/primitives";
import { InlineError, InlineNotice, SkeletonRows } from "@/components/states";
import { cn } from "@/lib/cn";
import { ago } from "@/lib/format";
import {
  fetchUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/api/notifications";
import {
  atListLimit,
  notificationHref,
  toSellerNotifications,
  type NotificationFilter,
  type SellerNotification,
} from "@/lib/notifications-view";

/**
 * The notification centre: the bell in the topbar, its unread count, and the panel.
 *
 * This is the one screen in the console with **no permission gate**, and that is
 * the API's design rather than an omission. `NotificationsController` carries no
 * `@RequirePermissions` on any route and keys every handler on
 * `@CurrentUser('id')`, so the rows are the signed-in account's own; a
 * `PermissionGate` here would hide a list the server is happy to return. It sits
 * inside the `(app)` group, so `RequireAuth` has already established that there is
 * a session.
 *
 * Three behaviours are worth knowing about:
 *
 * - **The count is polled; the list is not.** A closed bell asks
 *   `GET /notifications/unread-count` once a minute — and only while the tab is
 *   visible — because that route returns one integer. The hundred-row list is
 *   fetched when the panel opens, and `GET /notifications` returns `unread` with
 *   it, so an open panel needs no separate count request.
 * - **Actions refetch, they do not merge.** `read-all` returns `{ updated }` — a
 *   number, not rows — so there is nothing to merge; and merging the single row
 *   that `:id/read` returns would leave the `unread` total stale. Both reload.
 * - **A background poll never shows an error.** A failed count request leaves the
 *   last known number alone and tries again next minute; a shopkeeper does not need
 *   a red panel in the topbar because one poll timed out. Errors are shown for the
 *   things the seller actually asked for: opening the panel, and marking read.
 */

/** Slow on purpose: this is a count, not a live feed, and every seller pays for it. */
const POLL_MS = 60_000;

export function NotificationBell() {
  const { status, canInShop } = useAuth();
  const { shopById } = useShops();
  const [open, setOpen] = React.useState(false);
  const [filter, setFilter] = React.useState<NotificationFilter>("all");
  const [items, setItems] = React.useState<SellerNotification[]>([]);
  const [unread, setUnread] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  /** The row being marked, or `"all"`. Keeps two clicks from racing. */
  const [busy, setBusy] = React.useState<string | null>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);

  const authed = status === "authenticated";

  /* ----------------------------------------------------------- unread polling */

  const refreshCount = React.useCallback(
    async (signal?: AbortSignal) => {
      if (!authed) return;
      try {
        const { unread: n } = await fetchUnreadCount(signal);
        if (!signal?.aborted) setUnread(n);
      } catch {
        // Deliberately silent — see the note at the top of this file.
      }
    },
    [authed],
  );

  React.useEffect(() => {
    if (!authed) return;
    const ctrl = new AbortController();
    void refreshCount(ctrl.signal);
    const id = window.setInterval(() => {
      // A hidden tab is a tab nobody is reading. Skipping the poll there is the
      // difference between one request a minute per seller and one per open tab.
      if (document.visibilityState === "visible") void refreshCount();
    }, POLL_MS);
    return () => {
      ctrl.abort();
      window.clearInterval(id);
    };
  }, [authed, refreshCount]);

  /* --------------------------------------------------------------- list load */

  const load = React.useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      try {
        const res = await listNotifications({ unreadOnly: filter === "unread" }, signal);
        if (signal?.aborted) return;
        setItems(toSellerNotifications(res.items));
        setUnread(res.unread);
        setError(null);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof ApiError ? err.message : "Could not load your notifications.");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [filter],
  );

  React.useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [open, load]);

  /* ------------------------------------------------------- dismiss behaviour */

  React.useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  /* ----------------------------------------------------------------- actions */

  const markOne = React.useCallback(
    async (id: string) => {
      setBusy(id);
      setError(null);
      try {
        await markNotificationRead(id);
        await load();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not mark that as read.");
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  const markAll = React.useCallback(async () => {
    setBusy("all");
    setError(null);
    try {
      await markAllNotificationsRead();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not mark them all as read.");
    } finally {
      setBusy(null);
    }
  }, [load]);

  /* ------------------------------------------------------------------ render */

  const countLabel = unread > 99 ? "99+" : String(unread);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg text-ink-600 hover:bg-ink-100"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-crimson-500 px-1 text-[10px] font-bold leading-none text-white">
            {countLabel}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 z-40 mt-2 flex max-h-[75vh] w-[21rem] flex-col rounded-xl border border-ink-200 bg-white shadow-xl sm:w-96"
        >
          <div className="flex items-center gap-2 border-b border-ink-100 px-3 py-2.5">
            <p className="text-sm font-bold text-ink-900">Notifications</p>
            {unread > 0 && <Badge tone="crimson">{countLabel} unread</Badge>}
            <button
              type="button"
              onClick={() => void load()}
              className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100"
              aria-label="Reload notifications"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100"
              aria-label="Close notifications"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-1.5 border-b border-ink-100 px-3 py-2">
            {(["all", "unread"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                // Which filter is on was conveyed by background colour alone, so a
                // screen reader heard two plain buttons and no answer. Every other
                // segmented control in the console (orders tabs, reviews, catalog,
                // inventory, promotions, analytics) already says it this way.
                aria-pressed={filter === f}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors",
                  filter === f
                    ? "bg-crimson-50 text-crimson-700"
                    : "text-ink-500 hover:bg-ink-50",
                )}
              >
                {f === "all" ? "All" : "Unread"}
              </button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={() => void markAll()}
              disabled={unread === 0 || busy !== null}
            >
              <CheckCheck className="h-4 w-4" /> Mark all read
            </Button>
          </div>

          <div className="gp-scroll min-h-0 flex-1 overflow-y-auto">
            {error && (
              <div className="p-3">
                <InlineError message={error} />
              </div>
            )}
            {loading && items.length === 0 ? (
              <div className="p-3">
                <SkeletonRows rows={4} />
              </div>
            ) : items.length === 0 && !error ? (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                <Inbox className="h-6 w-6 text-ink-300" />
                <p className="text-sm font-semibold text-ink-700">
                  {filter === "unread" ? "Nothing unread" : "No notifications yet"}
                </p>
                <p className="text-xs text-ink-500">
                  {filter === "unread"
                    ? "You have read everything here."
                    : "Orders, delivery updates and news from GoPasal arrive here."}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-ink-100">
                {items.map((n) => (
                  <NotificationRow
                    key={n.id}
                    n={n}
                    href={notificationHref(n, (shopId) => canInShop(shopId, "orders.view"))}
                    shopName={n.payload.shopId ? shopById(n.payload.shopId)?.name ?? null : null}
                    busy={busy === n.id}
                    disabled={busy !== null}
                    onMarkRead={() => void markOne(n.id)}
                    onNavigate={() => setOpen(false)}
                  />
                ))}
              </ul>
            )}
          </div>

          {atListLimit(items) && (
            <div className="border-t border-ink-100 p-3">
              <InlineNotice message="Showing the newest 100. Older notifications are kept, but there is no way to page back to them yet." />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * One row. The title and body are the API's own words, printed as they arrived.
 *
 * `href` is computed by the caller because it needs a permission check; when it is
 * `null` on a row that clearly refers to an order, the row says why rather than
 * looking broken — that combination means the notification is the seller's *own*
 * consumer order, which this console has no screen for.
 */
function NotificationRow({
  n,
  href,
  shopName,
  busy,
  disabled,
  onMarkRead,
  onNavigate,
}: {
  n: SellerNotification;
  href: string | null;
  shopName: string | null;
  busy: boolean;
  disabled: boolean;
  onMarkRead: () => void;
  onNavigate: () => void;
}) {
  const ownOrder = href === null && n.payload.orderId !== null;
  return (
    <li className={cn("px-3 py-2.5", !n.read && "bg-crimson-50/50")}>
      <div className="flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={n.tone}>{n.typeLabel}</Badge>
            {shopName && <span className="truncate text-[11px] text-ink-500">{shopName}</span>}
            {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-crimson-500" />}
          </div>
          <p className="mt-1.5 text-sm font-semibold text-ink-900">{n.title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-600">{n.body}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11px] text-ink-400">
            <span>{ago(n.createdAt)}</span>
            {n.payload.code && <span>· {n.payload.code}</span>}
            {n.payload.reference && <span>· {n.payload.reference}</span>}
          </div>
          {href && (
            <Link
              href={href}
              onClick={() => {
                if (!n.read) onMarkRead();
                onNavigate();
              }}
              className="mt-1.5 inline-flex text-xs font-semibold text-crimson-600 hover:underline"
            >
              Open it
            </Link>
          )}
          {ownOrder && (
            <p className="mt-1.5 text-[11px] text-ink-400">
              This is one of your own orders as a shopper — it opens in the GoPasal app, not here.
            </p>
          )}
        </div>
        {!n.read && (
          <button
            type="button"
            onClick={onMarkRead}
            disabled={disabled}
            className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100 disabled:opacity-40"
            aria-label="Mark as read"
            title="Mark as read"
          >
            <Check className={cn("h-4 w-4", busy && "animate-pulse")} />
          </button>
        )}
      </div>
    </li>
  );
}
