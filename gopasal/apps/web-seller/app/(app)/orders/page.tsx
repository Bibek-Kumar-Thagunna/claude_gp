"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ShoppingBag,
  Truck,
  CheckCircle2,
  Wallet,
  Search,
  Check,
  X,
  MapPin,
  ChevronRight,
  Store,
  PackageCheck,
  Bike,
  RefreshCw,
} from "lucide-react";
import { ApiError, SEARCH_MAX_LENGTH } from "@gopasal/api-client";
import { useAuth } from "@/components/auth-provider";
import { useShops } from "@/components/shop-provider";
import { PageHeader, Card, Button, Badge, EmptyState } from "@/components/primitives";
import { StatCard } from "@/components/StatCard";
import { Reveal } from "@/components/Reveal";
import { PermissionGate } from "@/components/PermissionGate";
import { ErrorPanel, InlineError, InlineNotice, SkeletonRows, Spinner } from "@/components/states";
import { OrderStatusBadge } from "@/components/orders/OrderBits";
import { cn } from "@/lib/cn";
import { rs, num, ago } from "@/lib/format";
import { useDebounced } from "@/lib/use-debounced";
import { asApiError } from "@/lib/api/client";
import {
  acceptOrder,
  dispatchOrder,
  packOrder,
  listAllShopOrders,
  mergeOrderSummaries,
  rejectOrder,
  type OrderQuery,
  type OrderQueueSummaryWire,
} from "@/lib/api/orders";
import {
  QUEUE_TABS,
  queueTabCount,
  queueTabStatuses,
  toSellerOrders,
  type QueueTabId,
  type SellerOrder,
} from "@/lib/orders-view";

/**
 * The seller order queue, read from the API.
 *
 * Three things about the endpoint shape this page.
 *
 * 1. **The server filters, searches and pages.** `GET /seller/shops/:shopId/orders`
 *    takes `?status=`(comma-separated), `?q=`, `?sort=` and `?page=`/`?limit=`. The
 *    tabs and the search box below are therefore requests, not array predicates. They
 *    used to be predicates over whatever rows the browser held, which meant a seller
 *    whose queue outgrew one read could search for an order they owned and be told it
 *    was not there.
 * 2. **The counts describe the shop, not the page.** The response carries a `summary`
 *    computed over the whole queue and deliberately unaffected by `status`/`q`, so the
 *    four stat cards and the tab badges keep saying something true while the list
 *    below them narrows.
 * 3. **There is no cross-shop order endpoint, by design** — a caller holding
 *    `orders.view` on one shop must not be able to widen the question. So the
 *    consolidated view fans out over the readable shops, concatenates, and discloses
 *    when a shop's matching set was deeper than the fan-out reads.
 *
 * There is no accept-by countdown on this screen. The API has no SLA deadline
 * column on an order, an event or a delivery, so a countdown here would be
 * counting down to a time no customer was ever told.
 */

/**
 * Reject reasons the shop can pick in one tap. `RejectOrderDto.reason` is
 * required and is stored on the order, so whatever is chosen here is what the
 * customer reads — these are suggestions, and the free-text box is always there
 * for a reason that isn't listed.
 */
const REJECT_REASONS = ["Out of stock", "Shop is closed", "Can’t deliver to this area"];

export default function OrdersPage() {
  return (
    <PermissionGate perm="orders.view">
      <OrdersInner />
    </PermissionGate>
  );
}

function OrdersInner() {
  const { canInShop } = useAuth();
  const { activeShopId, scopedShopIds, shopById, loading: shopsLoading } = useShops();
  const router = useRouter();

  const [orders, setOrders] = React.useState<SellerOrder[]>([]);
  /**
   * The queue-wide summary, or `null` for "the server has not told us yet".
   *
   * It is deliberately not seeded with zeros. "Needs action: 0" and "COD to collect:
   * Rs 0" are strong statements about a shop's day, and neither is true of a request
   * that is still in flight, one that failed, or one that was never sent because the
   * account holds `orders.view` nowhere in scope. The cards render "—" until a real
   * summary lands.
   */
  const [summary, setSummary] = React.useState<OrderQueueSummaryWire | null>(null);
  /** Rows matching the current tab and search across every readable shop, per the server. */
  const [matched, setMatched] = React.useState(0);
  const [truncated, setTruncated] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<ApiError | null>(null);
  const [tab, setTab] = React.useState<QueueTabId>("needs_action");
  const [q, setQ] = React.useState("");
  const [rejecting, setRejecting] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState("");
  const [acting, setActing] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  /**
   * Only ask about shops this account may actually read orders for. A request we
   * know would 403 is not worth firing: it would turn one shop's missing grant
   * into a page-wide error banner.
   */
  const readableShopIds = React.useMemo(
    () => scopedShopIds.filter((id) => canInShop(id, "orders.view")),
    [scopedShopIds, canInShop],
  );
  const idsKey = readableShopIds.join(",");

  // The input stays instant; only the settled value becomes a request.
  const debouncedQ = useDebounced(q.trim());

  // Serialised so the loader depends on a primitive: a fresh object each render
  // would re-fire the effect on every keystroke, debounce or not.
  const queryKey = JSON.stringify({
    q: debouncedQ || undefined,
    status: queueTabStatuses(tab),
  });

  const load = React.useCallback(
    async (signal?: AbortSignal) => {
      const ids = idsKey ? idsKey.split(",") : [];
      const query = JSON.parse(queryKey) as OrderQuery;
      if (ids.length === 0) {
        setOrders([]);
        setSummary(null);
        setMatched(0);
        setTruncated(false);
        setLoading(false);
        setError(null);
        return;
      }
      setLoading(true);
      try {
        const pages = await Promise.all(ids.map((id) => listAllShopOrders(id, query, signal)));
        if (signal?.aborted) return;
        // Each shop's page arrives newest-first on its own; re-sort so several
        // shops interleave by time instead of stacking one queue after another.
        setOrders(
          toSellerOrders(pages.flatMap((p) => p.orders)).sort((a, b) =>
            a.placedAt < b.placedAt ? 1 : -1,
          ),
        );
        setMatched(pages.reduce((a, p) => a + p.matched, 0));
        setSummary(mergeOrderSummaries(pages.map((p) => p.summary)));
        setTruncated(pages.some((p) => p.truncated));
        setError(null);
      } catch (err) {
        if (signal?.aborted) return;
        setError(asApiError(err));
        setOrders([]);
        // A failed read has no counts. Leaving the previous summary up would keep
        // asserting figures next to an error panel that says they could not be read.
        setSummary(null);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [idsKey, queryKey],
  );

  React.useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  /**
   * Every transition answers with a bare `Order` row — no items, no delivery, no
   * rider — so merging it into a loaded list would blank fields that are already
   * on screen. Re-read instead.
   */
  const runAction = React.useCallback(
    async (id: string, fn: () => Promise<unknown>) => {
      setActing(id);
      setActionError(null);
      try {
        await fn();
        await load();
      } catch (err) {
        setActionError(
          err instanceof ApiError ? err.message : "That didn’t go through. Please try again.",
        );
      } finally {
        setActing(null);
      }
    },
    [load],
  );

  const filtering = debouncedQ !== "" || tab !== "all";

  /**
   * A summary figure, or an em dash when there is no summary to read from.
   *
   * The same shape as `delivery/page.tsx`'s `stat()`, for the same reason: the cards
   * must be able to say "not known" as distinct from "measured, and it is zero".
   */
  const stat = (value: number | undefined) => (value === undefined ? "—" : num(value));

  return (
    <div>
      <PageHeader
        icon={<ShoppingBag className="h-5 w-5" />}
        title="Orders"
        subtitle={
          activeShopId === null
            ? "Live queue across all your shops. Accept within your window — delivery timing is always yours to set."
            : "Live order queue. Accept within your window, then pack and hand off for delivery."
        }
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? <Spinner /> : <RefreshCw className="h-4 w-4" />} Refresh
          </Button>
        }
      />

      {/*
        Every card below reads the server's queue-wide summary, never the rows on
        screen. A "needs action" count that fell to zero because someone opened the
        Delivered tab would be a lie about work still waiting — and so would a zero
        shown before the server has answered, which is why each reads through `stat()`.
      */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <Reveal delay={0}>
          <StatCard
            label="Needs action"
            value={stat(summary?.needsAction)}
            icon={ShoppingBag}
            tone="marigold"
            hint="Awaiting accept"
          />
        </Reveal>
        <Reveal delay={1}>
          <StatCard
            label="In progress"
            value={stat(summary?.inProgress)}
            icon={Truck}
            tone="crimson"
            hint="Accepted to out for delivery"
          />
        </Reveal>
        <Reveal delay={2}>
          {/* A lifetime count, not a daily one: the summary has no date window, so
              "today" would be a claim we cannot stand behind. */}
          <StatCard
            label="Delivered"
            value={stat(summary?.delivered)}
            icon={CheckCircle2}
            tone="green"
            hint="All time"
          />
        </Reveal>
        <Reveal delay={3}>
          {/* Summed by the API from the order totals of open COD orders. Cash still to
              come in — deliberately not a settlement or payout figure. */}
          <StatCard
            label="COD to collect"
            value={summary ? rs(summary.codOutstanding) : "—"}
            icon={Wallet}
            tone="blue"
            hint="Across open orders"
          />
        </Reveal>
      </div>

      <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="gp-scroll -mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
          {QUEUE_TABS.map((t) => {
            // No summary yet means no badge — not a zero badge, and not a stale one.
            const c = summary ? queueTabCount(t.id, summary) : 0;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-pressed={tab === t.id}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                  tab === t.id
                    ? "bg-ink-900 text-white"
                    : "bg-white text-ink-600 ring-1 ring-ink-200 hover:bg-ink-50",
                )}
              >
                {t.label}
                {c > 0 && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-xs font-semibold",
                      tab === t.id ? "bg-white/20 text-white" : "bg-ink-100 text-ink-500",
                    )}
                  >
                    {c}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="relative shrink-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search code, recipient, area"
            aria-label="Search orders"
            /* The server's own ceiling on `?q=`, so a long paste is stopped here
                instead of coming back as a 400 nobody can act on. */
            maxLength={SEARCH_MAX_LENGTH}
            className="h-10 w-full rounded-xl border border-ink-200 pl-9 pr-9 text-sm outline-none focus:border-crimson-300 lg:w-72"
          />
          {loading && orders.length > 0 && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2">
              <Spinner />
            </span>
          )}
        </div>
      </div>

      {actionError && <InlineError message={actionError} className="mt-4" />}

      {/*
        The fan-out reads a bounded number of pages per shop. When a shop's matching
        set is deeper than that, say so — otherwise "nothing else here" would be a
        claim about rows nobody fetched.
      */}
      {truncated && (
        <InlineNotice
          className="mt-4"
          message={`Showing the ${num(orders.length)} most recent of ${num(matched)} matching orders. Search, or pick a narrower tab, to reach the rest.`}
        />
      )}

      <div className="mt-4 space-y-3">
        {loading && orders.length === 0 ? (
          <SkeletonRows rows={4} />
        ) : error ? (
          <ErrorPanel
            title="Couldn’t load your orders"
            message={error.message}
            offline={error.offline}
            onRetry={() => void load()}
          />
        ) : readableShopIds.length === 0 ? (
          <Card className="p-0">
            <EmptyState
              icon={<PackageCheck className="h-6 w-6" />}
              title={shopsLoading ? "Loading your shops" : "No shop to show orders for"}
              description={
                shopsLoading
                  ? "One moment — reading the shops on your account."
                  : "You don’t have permission to view orders on the shop in scope. Ask an owner for the “view orders” permission."
              }
            />
          </Card>
        ) : orders.length === 0 ? (
          <Card className="p-0">
            <EmptyState
              icon={<PackageCheck className="h-6 w-6" />}
              title={filtering ? "Nothing in this view" : "No orders yet"}
              description={
                filtering
                  ? "No orders match this tab or search. This was checked against the whole queue, not just a page of it."
                  : "New orders land here the moment a customer checks out."
              }
            />
          </Card>
        ) : (
          orders.map((o) => (
            <OrderRow
              key={o.id}
              order={o}
              showShop={activeShopId === null}
              shopName={shopById(o.shopId)?.name}
              busy={acting === o.id}
              canAccept={canInShop(o.shopId, "orders.accept")}
              canReject={canInShop(o.shopId, "orders.reject")}
              canPack={canInShop(o.shopId, "orders.pack")}
              canDispatch={canInShop(o.shopId, "orders.dispatch")}
              rejecting={rejecting === o.id}
              reason={reason}
              // The detail endpoint is shop-scoped, so the link carries the shop
              // it belongs to — otherwise the detail page would have to guess
              // which of several shops owns the order.
              onOpen={() => router.push(`/orders/${o.id}?shop=${encodeURIComponent(o.shopId)}`)}
              onReasonChange={setReason}
              onStartReject={() => {
                setRejecting(o.id);
                setReason("");
              }}
              onCancelReject={() => setRejecting(null)}
              onAccept={() => void runAction(o.id, () => acceptOrder(o.shopId, o.id))}
              onPack={() => void runAction(o.id, () => packOrder(o.shopId, o.id))}
              onDispatch={() => void runAction(o.id, () => dispatchOrder(o.shopId, o.id))}
              onReject={(r) =>
                void runAction(o.id, async () => {
                  await rejectOrder(o.shopId, o.id, r);
                  setRejecting(null);
                })
              }
            />
          ))
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ One row */

type OrderRowProps = {
  order: SellerOrder;
  showShop: boolean;
  shopName: string | undefined;
  busy: boolean;
  canAccept: boolean;
  canReject: boolean;
  canPack: boolean;
  canDispatch: boolean;
  rejecting: boolean;
  reason: string;
  onOpen: () => void;
  onReasonChange: (v: string) => void;
  onStartReject: () => void;
  onCancelReject: () => void;
  onAccept: () => void;
  onPack: () => void;
  onDispatch: () => void;
  onReject: (reason: string) => void;
};

/**
 * One order in the queue.
 *
 * Accept and Reject are gated per order with `canInShop(order.shopId, …)`, not
 * with the page-level `can`. In the consolidated view the ambient check falls
 * back to "can this seller do it *anywhere*", which would offer Accept on an
 * order belonging to a shop where the grant does not exist — the API would
 * refuse it, and the button would have lied.
 */
function OrderRow({
  order: o,
  showShop,
  shopName,
  busy,
  canAccept,
  canReject,
  canPack,
  canDispatch,
  rejecting,
  reason,
  onOpen,
  onReasonChange,
  onStartReject,
  onCancelReject,
  onAccept,
  onPack,
  onDispatch,
  onReject,
}: OrderRowProps) {
  const actionable = o.status === "PLACED" && (canAccept || canReject);
  /*
    The rest of the queue's work, in the queue.

    Accept was the only thing this list could do, so a shop that had accepted
    ten orders had to open each one to say it was packed — ten navigations to
    press one button ten times. Pack and dispatch are single, unambiguous
    transitions with no body, which is exactly what belongs on a row.

    Dispatch needs a rider: the API 400s with "Assign a rider before
    dispatching", and assigning one is a choice from a list, which does not
    belong on a row. So the button only appears once a rider is on the order,
    and the row says to open it otherwise.

    Cancel stays on the detail page on purpose. It needs a typed reason, it is
    the one transition that cannot be walked back, and a scrolling queue is the
    worst place to put it within a thumb's reach of Accept.
  */
  const canMarkPacked = o.status === "ACCEPTED" && canPack;
  const canHandOff = o.status === "PACKED" && canDispatch && Boolean(o.rider);
  const needsRider = o.status === "PACKED" && canDispatch && !o.rider;

  return (
    <Card
      className={cn(
        "overflow-hidden p-0 transition-shadow hover:shadow-md",
        actionable && "border-l-4 border-l-[#c02636]",
      )}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          /*
            Only a key pressed on the row itself opens the order.

            The Accept and Reject buttons sit *inside* this row, so their keydown
            bubbled up here: pressing Enter on Reject used to reject the order and
            navigate away from the queue in the same keystroke. The mouse path was
            already guarded — the action strip below calls `stopPropagation` on
            click — and the keyboard path was not.

            Space is here because a `role="button"` is expected to answer it as well
            as Enter, and because the default action for Space on a focused div is to
            scroll the queue out from under the seller.
          */
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
        className="flex cursor-pointer flex-col gap-4 p-4 transition-colors hover:bg-ink-50/60 sm:p-5 lg:flex-row lg:items-center"
      >
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span
            className={cn(
              "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
              actionable ? "bg-crimson-600 text-white shadow-sm" : "bg-crimson-50 text-crimson-600",
            )}
          >
            <ShoppingBag className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-ink-900">{o.code}</span>
              <OrderStatusBadge status={o.status} />
              {o.rider && (
                <Badge tone="ink">
                  <Bike className="h-3 w-3" /> {o.rider.name}
                </Badge>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-600">
              <span className="font-medium text-ink-800">{o.recipientName}</span>
              <span>
                {o.itemCount} item{o.itemCount === 1 ? "" : "s"}
              </span>
              <strong className="text-ink-900">{rs(o.total)}</strong>
              <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs font-semibold text-ink-600">
                {o.isCod ? "Cash on delivery" : o.paymentMethodLabel}
              </span>
            </div>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-400">
              {showShop && shopName && (
                <span className="inline-flex items-center gap-1">
                  <Store className="h-3 w-3" /> {shopName}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {o.area}
                {/* Distance only when the API computed one at checkout. */}
                {o.distanceMeters != null && ` · ${(o.distanceMeters / 1000).toFixed(1)} km`}
              </span>
              <span>{ago(o.placedAt)}</span>
            </p>
          </div>
        </div>

        <div
          className="flex w-full shrink-0 items-center gap-2 lg:w-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {canMarkPacked ? (
            <Button className="flex-1 lg:flex-none" size="sm" onClick={onPack} disabled={busy}>
              {busy ? <Spinner /> : <PackageCheck className="h-4 w-4" />} Mark packed
            </Button>
          ) : canHandOff ? (
            <Button className="flex-1 lg:flex-none" size="sm" onClick={onDispatch} disabled={busy}>
              {busy ? <Spinner /> : <Bike className="h-4 w-4" />} Hand to {o.rider?.name}
            </Button>
          ) : needsRider ? (
            <Button className="flex-1 lg:flex-none" variant="outline" size="sm" onClick={onOpen}>
              <Bike className="h-4 w-4" /> Assign a rider
            </Button>
          ) : actionable && !rejecting ? (
            <>
              {canReject && (
                <Button
                  className="flex-1 lg:flex-none"
                  variant="outline"
                  size="sm"
                  onClick={onStartReject}
                  disabled={busy}
                >
                  <X className="h-4 w-4" /> Reject
                </Button>
              )}
              {canAccept && (
                <Button
                  className="flex-1 lg:flex-none"
                  size="sm"
                  onClick={onAccept}
                  disabled={busy}
                >
                  {busy ? <Spinner /> : <Check className="h-4 w-4" />} Accept
                </Button>
              )}
            </>
          ) : (
            <ChevronRight className="h-5 w-5 text-ink-300" />
          )}
        </div>
      </div>

      {/*
        Rejecting needs a reason: `RejectOrderDto.reason` is required, and it is
        written to the order and shown to the customer. So there is no one-tap
        reject — a preset or a typed reason, then confirm.
      */}
      {rejecting && (
        <div className="border-t border-ink-100 bg-ink-50/60 p-4">
          <p className="text-sm font-medium text-ink-700">
            Why are you rejecting {o.code}? The customer will see this.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {REJECT_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onReasonChange(r)}
                // A chosen preset reason was filled crimson and nothing else. This is
                // the last thing a seller checks before rejecting someone's order, so
                // it is the worst place for the selection to be invisible.
                aria-pressed={reason === r}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-medium ring-1 transition-colors",
                  reason === r
                    ? "bg-[#c02636] text-white ring-[#c02636]"
                    : "bg-white text-ink-700 ring-ink-200 hover:bg-red-50 hover:text-[#c02636]",
                )}
              >
                {r}
              </button>
            ))}
          </div>
          <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
            <input
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              maxLength={280}
              placeholder="Or type the reason"
              className="h-10 flex-1 rounded-xl border border-ink-200 px-3 text-sm outline-none focus:border-crimson-300"
            />
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={onCancelReject} disabled={busy}>
                Keep order
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={busy || reason.trim().length === 0}
                onClick={() => onReject(reason.trim())}
              >
                {busy ? <Spinner /> : <X className="h-4 w-4" />} Confirm reject
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
