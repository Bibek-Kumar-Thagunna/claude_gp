"use client";

import * as React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Phone,
  MessageCircle,
  MapPin,
  Store,
  Wallet,
  Check,
  X,
  PackageCheck,
  Truck,
  ShieldCheck,
  User,
  Info,
  Bike,
  Ban,
  UserMinus,
  Route,
} from "lucide-react";
import { ApiError } from "@gopasal/api-client";
import { useAuth } from "@/components/auth-provider";
import { useShops } from "@/components/shop-provider";
import { PageHeader, Card, Button, Badge, EmptyState } from "@/components/primitives";
import { PermissionGate } from "@/components/PermissionGate";
import { ErrorPanel, InlineError, InlineNotice, LoadingPanel, Spinner } from "@/components/states";
import { DeliveryStatusBadge, OrderStatusBadge } from "@/components/orders/OrderBits";
import { cn } from "@/lib/cn";
import { rs, clockTime, dayMonth, ago } from "@/lib/format";
import { asApiError } from "@/lib/api/client";
import {
  acceptOrder,
  assignRider,
  cancelOrder,
  dispatchOrder,
  fetchShopOrder,
  listShopRiders,
  packOrder,
  patchDelivery,
  rejectOrder,
  unassignRider,
  type OrderStatusWire,
} from "@/lib/api/orders";
import {
  ORDER_STEPS,
  orderStepIndex,
  toSellerOrderDetail,
  toShopRiders,
  type SellerOrderDetail,
  type ShopRider,
} from "@/lib/orders-view";
import { deliveryStepLabel, riderStatusLabel, vehicleLabel } from "@/lib/delivery-view";
import { DeliveryProofPhoto } from "@/components/delivery/DeliveryProofPhoto";

/**
 * One order, read from `GET /seller/shops/:shopId/orders/:orderId`.
 *
 * The endpoint is shop-scoped but the route is not, so the shop is resolved in
 * this order: the `?shop=` the queue link carries, then the shop currently in
 * scope, then — for a bare deep link in the consolidated view — each shop this
 * account may read orders for, until one owns the order. A shop that doesn't own
 * it answers 404, which is a cheap and honest "not mine".
 *
 * Nothing on this screen is invented. There is no accept-by countdown (the API
 * has no deadline column), no delivery estimate (no seller route returns one),
 * and the rider is named from the shop's real roster. The customer's name and
 * phone are the snapshot columns the API actually exposes to a seller — there is
 * no customer relation on a seller order — so the call and message buttons are
 * real links, not decoration.
 */
export default function OrderDetailPage() {
  return (
    <PermissionGate perm="orders.view">
      {/* `useSearchParams` needs a boundary to prerender under. */}
      <React.Suspense fallback={<LoadingPanel label="Opening order…" />}>
        <OrderDetailInner />
      </React.Suspense>
    </PermissionGate>
  );
}

/** Try each candidate shop until one owns the order. */
async function findOrder(shopIds: string[], orderId: string, signal?: AbortSignal) {
  let lastError: ApiError | null = null;
  for (const shopId of shopIds) {
    try {
      return { shopId, wire: await fetchShopOrder(shopId, orderId, signal) };
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 403)) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }
  if (lastError) throw lastError;
  return null;
}

function OrderDetailInner() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { canInShop } = useAuth();
  const { activeShopId, scopedShopIds, shopById } = useShops();

  const [order, setOrder] = React.useState<SellerOrderDetail | null>(null);
  const [shopId, setShopId] = React.useState<string | null>(null);
  const [riders, setRiders] = React.useState<ShopRider[]>([]);
  /**
   * Non-null when the roster could not be read.
   *
   * Without it an empty `riders` meant three different things at once — no riders on
   * this shop, no permission to look, and "that request failed" — and the assign
   * panel spoke for all three with "No riders on this shop's roster yet. Add one
   * under Delivery", which is advice to duplicate riders the shop may already have.
   */
  const [ridersError, setRidersError] = React.useState<ApiError | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<ApiError | null>(null);
  const [notFound, setNotFound] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const hinted = search.get("shop");
  const readableShopIds = React.useMemo(
    () => scopedShopIds.filter((s) => canInShop(s, "orders.view")),
    [scopedShopIds, canInShop],
  );

  /** Candidates, best guess first. */
  const candidatesKey = React.useMemo(() => {
    if (hinted && readableShopIds.includes(hinted)) return hinted;
    if (activeShopId && readableShopIds.includes(activeShopId)) return activeShopId;
    return readableShopIds.join(",");
  }, [hinted, activeShopId, readableShopIds]);

  const load = React.useCallback(
    async (signal?: AbortSignal) => {
      const candidates = candidatesKey ? candidatesKey.split(",") : [];
      if (candidates.length === 0) {
        setLoading(false);
        setNotFound(true);
        return;
      }
      setLoading(true);
      try {
        const found = await findOrder(candidates, id, signal);
        if (signal?.aborted) return;
        if (!found) {
          setNotFound(true);
          setOrder(null);
        } else {
          setOrder(toSellerOrderDetail(found.wire));
          setShopId(found.shopId);
          setNotFound(false);
        }
        setError(null);
      } catch (err) {
        if (signal?.aborted) return;
        if (err instanceof ApiError && (err.status === 404 || err.status === 403)) {
          setNotFound(true);
          setOrder(null);
        } else {
          setError(asApiError(err));
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [candidatesKey, id],
  );

  React.useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  /**
   * The roster, for assignment. Read only when this shop grants `delivery.view`
   * — without it the endpoint would 403, and the assign control is hidden anyway.
   */
  React.useEffect(() => {
    if (!shopId || !canInShop(shopId, "delivery.view")) {
      setRiders([]);
      setRidersError(null);
      return;
    }
    const ctrl = new AbortController();
    listShopRiders(shopId, ctrl.signal)
      .then((wire) => {
        if (ctrl.signal.aborted) return;
        setRiders(toShopRiders(wire));
        setRidersError(null);
      })
      // A failed roster read must not blank the order — the rest of this screen came
      // from a different request and is still true. The assign panel says the list
      // could not be read, which is not the same as the shop having no riders.
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setRiders([]);
        setRidersError(asApiError(err));
      });
    return () => ctrl.abort();
  }, [shopId, canInShop]);

  /**
   * Every transition answers with a bare `Order` row — no items, no events, no
   * delivery — so the screen re-reads rather than merging a response that would
   * blank half of what is already shown.
   */
  const run = React.useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true);
      setActionError(null);
      try {
        await fn();
        await load();
      } catch (err) {
        setActionError(
          err instanceof ApiError ? err.message : "That didn’t go through. Please try again.",
        );
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  if (loading && !order) return <LoadingPanel label="Opening order…" />;

  if (error) {
    return (
      <ErrorPanel
        title="Couldn’t load this order"
        message={error.message}
        offline={error.offline}
        onRetry={() => void load()}
      />
    );
  }

  if (!order || !shopId) {
    return (
      <Card className="p-0">
        <EmptyState
          icon={<Info className="h-6 w-6" />}
          title="Order not found"
          description={
            notFound
              ? "No shop on your account has an order with this reference. It may have been removed, or the link may belong to another account."
              : "This order could not be read."
          }
          action={<Button href="/orders">Back to orders</Button>}
        />
      </Card>
    );
  }

  return (
    <OrderDetailView
      order={order}
      shopId={shopId}
      shopName={shopById(shopId)?.name ?? order.shopName}
      riders={riders}
      ridersError={ridersError}
      busy={busy}
      actionError={actionError}
      canInShop={canInShop}
      onBack={() => router.push("/orders")}
      onRun={run}
    />
  );
}
/* ----------------------------------------------------------------- The view */

type ViewProps = {
  order: SellerOrderDetail;
  shopId: string;
  shopName: string;
  riders: ShopRider[];
  /** Non-null when the roster read failed; `riders` is then empty for that reason. */
  ridersError: ApiError | null;
  busy: boolean;
  actionError: string | null;
  canInShop: (shopId: string, key: string) => boolean;
  onBack: () => void;
  onRun: (fn: () => Promise<unknown>) => Promise<void>;
};

/**
 * Every control below is gated twice: by `order.actions`, which mirrors the
 * API's two state machines, and by `canInShop(shopId, …)`, which is this
 * account's real grant on *this* shop. A button that survives both is a call the
 * API will accept.
 *
 * Note which permission ends the order: reaching `DELIVERED` is only possible
 * through `PATCH …/delivery`, which the API gates on `delivery.update`. The
 * seeded `orders.complete` key is not required by any route, so it is not
 * checked here — checking it would hide a working button from a user who is
 * genuinely allowed to press it.
 */
function OrderDetailView({
  order: o,
  shopId,
  shopName,
  riders,
  ridersError,
  busy,
  actionError,
  canInShop,
  onBack,
  onRun,
}: ViewProps) {
  const [rejecting, setRejecting] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);
  const [failing, setFailing] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [riderId, setRiderId] = React.useState("");
  /**
   * Pre-ticked, because the API's own default is `true`.
   *
   * `delivery.service.ts` writes `input.codCollected ?? true` when a COD delivery
   * reaches `DELIVERED`, and the delivery board's handover switch has always started
   * on. This screen started off, so the same order closed from here recorded the cash
   * as *not* taken and closed from the board recorded it as taken — one action, two
   * different answers about money, decided by which screen the seller happened to be
   * looking at. Aligned on the server's answer; unticking is still a deliberate act.
   */
  const [codCollected, setCodCollected] = React.useState(true);
  const [podNote, setPodNote] = React.useState("");
  const [returnNote, setReturnNote] = React.useState("");
  const selectedRider = riders.find((r) => r.id === riderId);
  const selectedRiderAvailable =
    selectedRider?.status === "ONLINE" && selectedRider.activeDeliveries === 0;

  const a = o.actions;
  const may = (key: string) => canInShop(shopId, key);
  const step = orderStepIndex(o.status);
  const closed = step === -1;
  const canAccept = a.accept && may("orders.accept");
  const canReject = a.reject && may("orders.reject");
  const canPack = a.pack && may("orders.pack");
  const canDispatch = a.dispatch && may("orders.dispatch");
  const canCancel = a.cancel && may("orders.cancel");
  const canAssign = a.assignRider && may("delivery.assign");
  const canUnassign = a.unassignRider && may("delivery.assign");
  const canWalkLeg = a.nextDeliveryStatus !== null && may("delivery.update");
  const canFail = a.markFailed && may("delivery.update");
  const nextLeg = a.nextDeliveryStatus;

  /** Only one reason box open at a time, always starting empty. */
  const startReason = (open: (v: boolean) => void) => {
    setRejecting(false);
    setCancelling(false);
    setFailing(false);
    setReason("");
    open(true);
  };
  const closeReasons = () => {
    setRejecting(false);
    setCancelling(false);
    setFailing(false);
  };

  /** `PACKED` with no rider: the dispatch endpoint would 400, so say why. */
  const needsRiderToDispatch = o.status === "PACKED" && o.rider === null;
  const handover = a.nextDeliveryStatus === "DELIVERED" && canWalkLeg;
  const returnConfirmation = a.nextDeliveryStatus === "RETURNED_TO_SHOP" && canWalkLeg;
  const nextAction = canAccept
    ? {
        title: "Review and accept this order",
        detail: "Confirm the items are available before the customer starts waiting.",
        icon: Check,
      }
    : canPack
      ? {
          title: "Prepare and pack the items",
          detail:
            "Check quantities, substitutions and the customer note, then mark the order packed.",
          icon: PackageCheck,
        }
      : needsRiderToDispatch
        ? {
            title: "Assign a delivery rider",
            detail: "This order is packed. Choose an available rider in the delivery panel below.",
            icon: Bike,
          }
        : canDispatch
          ? {
              title: "Hand the packed order to the rider",
              detail: "Confirm the assigned rider has physically received the package.",
              icon: Truck,
            }
          : nextLeg !== null &&
              nextLeg !== "DELIVERED" &&
              nextLeg !== "RETURNED_TO_SHOP" &&
              may("delivery.update")
            ? {
                title: deliveryStepLabel(nextLeg),
                detail: "Update the delivery only when this step has actually happened.",
                icon: Route,
              }
            : returnConfirmation
              ? {
                  title: "Receive the returned parcel",
                  detail:
                    "Physically check the parcel and record its condition before releasing the rider.",
                  icon: PackageCheck,
                }
              : handover
                ? {
                    title: "Confirm delivery at the customer’s door",
                    detail: o.isCod
                      ? `Verify the rider collected ${rs(o.total)} before closing the order.`
                      : "Confirm the customer received the order before closing it.",
                    icon: ShieldCheck,
                  }
                : null;

  return (
    <div>
      <PageHeader
        icon={<PackageCheck className="h-5 w-5" />}
        title={o.code}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              Placed {dayMonth(o.placedAt)} at {clockTime(o.placedAt)} · {ago(o.placedAt)}
            </span>
            <span className="inline-flex items-center gap-1 text-ink-400">
              <Store className="h-3.5 w-3.5" /> {shopName}
            </span>
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <OrderStatusBadge status={o.status} />
            {o.deliveryStatus && <DeliveryStatusBadge status={o.deliveryStatus} />}
            <Button variant="outline" size="sm" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" /> Orders
            </Button>
          </div>
        }
      />

      {actionError && <InlineError message={actionError} className="mb-4" />}

      {nextAction && (
        <div className="mb-4 overflow-hidden rounded-2xl border border-crimson-100 bg-gradient-to-r from-crimson-50 via-white to-white shadow-sm">
          <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#c02636] text-white shadow-sm">
              <nextAction.icon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#c02636]">
                Next required action
              </p>
              <h2 className="mt-0.5 text-base font-semibold text-ink-900">{nextAction.title}</h2>
              <p className="mt-0.5 text-sm text-ink-600">{nextAction.detail}</p>
            </div>
          </div>
        </div>
      )}

      {/* Why an order left the flow, in the API's own words. */}
      {closed && o.cancelReason && (
        <InlineNotice
          message={`${o.status === "REJECTED" ? "Rejected" : "Cancelled"}: ${o.cancelReason}`}
          className="mb-4"
        />
      )}
      {/*
        The action bar. `handover` is deliberately not a button here: marking an
        order delivered takes a COD answer, so it gets its own panel below.
      */}
      {(canAccept ||
        canReject ||
        canPack ||
        canDispatch ||
        canCancel ||
        canFail ||
        canWalkLeg ||
        needsRiderToDispatch) && (
        <Card className="mb-4 overflow-hidden border-ink-100 p-0">
          <div className="border-b border-ink-100 bg-ink-50/60 px-4 py-3 sm:px-5">
            <h2 className="text-sm font-semibold text-ink-900">Order actions</h2>
            <p className="mt-0.5 text-xs text-ink-500">
              Only actions allowed by this order’s current stage and your role are shown.
            </p>
          </div>
          <div className="flex flex-col gap-2 p-4 sm:flex-row sm:flex-wrap sm:p-5">
            {canAccept && (
              <Button
                className="w-full sm:w-auto"
                onClick={() => void onRun(() => acceptOrder(shopId, o.id))}
                disabled={busy}
              >
                {busy ? <Spinner /> : <Check className="h-4 w-4" />} Accept order
              </Button>
            )}
            {canPack && (
              <Button
                className="w-full sm:w-auto"
                onClick={() => void onRun(() => packOrder(shopId, o.id))}
                disabled={busy}
              >
                {busy ? <Spinner /> : <PackageCheck className="h-4 w-4" />} Mark packed
              </Button>
            )}
            {canDispatch && (
              <Button
                className="w-full sm:w-auto"
                onClick={() => void onRun(() => dispatchOrder(shopId, o.id))}
                disabled={busy}
              >
                {busy ? <Spinner /> : <Truck className="h-4 w-4" />} Hand to rider
              </Button>
            )}
            {nextLeg !== null &&
              nextLeg !== "DELIVERED" &&
              nextLeg !== "RETURNED_TO_SHOP" &&
              may("delivery.update") && (
                <Button
                  className="w-full sm:w-auto"
                  variant="outline"
                  onClick={() => void onRun(() => patchDelivery(shopId, o.id, { status: nextLeg }))}
                  disabled={busy}
                >
                  {busy ? <Spinner /> : <Route className="h-4 w-4" />} {deliveryStepLabel(nextLeg)}
                </Button>
              )}
            {canReject && !rejecting && (
              <Button
                className="w-full sm:w-auto"
                variant="outline"
                onClick={() => startReason(setRejecting)}
                disabled={busy}
              >
                <X className="h-4 w-4" /> Reject
              </Button>
            )}
            {canCancel && !cancelling && (
              <Button
                className="w-full sm:w-auto"
                variant="ghost"
                onClick={() => startReason(setCancelling)}
                disabled={busy}
              >
                <Ban className="h-4 w-4" /> Cancel order
              </Button>
            )}
            {canFail && !failing && (
              <Button
                className="w-full sm:w-auto"
                variant="ghost"
                onClick={() => startReason(setFailing)}
                disabled={busy}
              >
                <Ban className="h-4 w-4" /> Delivery failed
              </Button>
            )}
          </div>
          {/*
            One reason box, three uses. Reject and delivery failure demand a reason because
            `RejectOrderDto.reason` is required and is written to the order the
            customer reads. All three actions require a specific reason.
          */}
          {(rejecting || cancelling || failing) && (
            <div className="border-t border-ink-100 bg-white p-4 sm:p-5">
              <p className="text-sm font-medium text-ink-700">
                {rejecting
                  ? `Why are you rejecting ${o.code}? The customer will see this.`
                  : cancelling
                    ? `Why are you cancelling ${o.code}? The customer will see this.`
                    : "What went wrong with this delivery?"}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(rejecting ? REJECT_REASONS : cancelling ? CANCEL_REASONS : FAIL_REASONS).map(
                  (r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setReason(r)}
                      // Selection was crimson fill alone; same fix as the queue's
                      // reject chips.
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
                  ),
                )}
              </div>
              <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={280}
                  placeholder="Or type the reason"
                  className="h-10 flex-1 rounded-xl border border-ink-200 px-3 text-sm outline-none focus:border-crimson-300"
                />
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={closeReasons} disabled={busy}>
                    Keep order
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={busy || reason.trim().length < 3}
                    onClick={() => {
                      const note = reason.trim();
                      void onRun(async () => {
                        if (rejecting) await rejectOrder(shopId, o.id, note);
                        else if (cancelling) await cancelOrder(shopId, o.id, note);
                        else
                          await patchDelivery(shopId, o.id, { status: "FAILED", failReason: note });
                        closeReasons();
                      });
                    }}
                  >
                    {busy ? <Spinner /> : <X className="h-4 w-4" />}{" "}
                    {rejecting ? "Confirm reject" : cancelling ? "Confirm cancel" : "Mark failed"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* The API 400s on dispatch without a rider, so this is stated, not discovered. */}
          {needsRiderToDispatch && (
            <p className="border-t border-ink-100 bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:px-5">
              <Info className="h-4 w-4 shrink-0 text-ink-400" />
              Packed and ready. Assign a rider below before handing this order over.
            </p>
          )}
        </Card>
      )}

      {returnConfirmation && (
        <Card className="mb-4 border-amber-200 bg-amber-50/50 p-4 sm:p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
            <PackageCheck className="h-4 w-4 text-amber-700" /> Confirm return to shop
          </h2>
          <p className="mt-1 text-sm text-ink-600">
            Do this only after the parcel is in the shop. The rider remains unavailable until you
            confirm receipt.
          </p>
          <textarea
            rows={2}
            maxLength={500}
            value={returnNote}
            onChange={(event) => setReturnNote(event.target.value)}
            placeholder="e.g. All items returned sealed and undamaged"
            className="mt-3 w-full rounded-xl border border-amber-200 bg-white p-3 text-sm outline-none focus:border-amber-400"
          />
          <Button
            className="mt-3 w-full sm:w-auto"
            disabled={busy || returnNote.trim().length < 3}
            onClick={() =>
              void onRun(() =>
                patchDelivery(shopId, o.id, {
                  status: "RETURNED_TO_SHOP",
                  returnNote: returnNote.trim(),
                }),
              )
            }
          >
            {busy ? <Spinner /> : <PackageCheck className="h-4 w-4" />} Parcel received
          </Button>
        </Card>
      )}
      {/*
        Handover. The delivery PATCH is the only seller path to `DELIVERED`, and
        for a COD order the API stamps the collected amount from the order total
        itself — so this asks the one question it needs and never an amount.
      */}
      {handover && (
        <Card className="mb-4 p-4 sm:p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
            <ShieldCheck className="h-4 w-4 text-green-600" /> Confirm handover
          </h2>
          {o.isCod && (
            <label className="mt-2.5 flex cursor-pointer items-start gap-2.5 rounded-xl bg-ink-50 p-3 text-sm">
              <input
                type="checkbox"
                checked={codCollected}
                onChange={(e) => setCodCollected(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#c02636]"
              />
              <span className="text-ink-700">
                Cash collected — <span className="font-semibold">{rs(o.total)}</span>
                <span className="block text-xs text-ink-500">
                  Untick this if the rider did not collect. It is recorded either way.
                </span>
              </span>
            </label>
          )}
          <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
            <input
              value={podNote}
              onChange={(e) => setPodNote(e.target.value)}
              maxLength={280}
              placeholder="Who received it and where? (required)"
              className="h-10 flex-1 rounded-xl border border-ink-200 px-3 text-sm outline-none focus:border-crimson-300"
            />
            <Button
              disabled={busy || podNote.trim().length < 3 || (o.isCod && !codCollected)}
              onClick={() =>
                void onRun(() =>
                  patchDelivery(shopId, o.id, {
                    status: "DELIVERED",
                    ...(podNote.trim() ? { podNote: podNote.trim() } : {}),
                    ...(o.isCod ? { codCollected } : {}),
                  }),
                )
              }
            >
              {busy ? <Spinner /> : <Check className="h-4 w-4" />} Mark delivered
            </Button>
          </div>
          <p className="mt-2 text-xs text-ink-500">
            Record a factual handover note. A consented photo, when present, is added by the
            assigned rider and appears below after delivery.
          </p>
        </Card>
      )}
      {/*
        The lifecycle, straight from the API's state machine, with the real
        timestamp column under each step it has one for. A rejected or cancelled
        order left this line rather than advancing along it, so it shows the
        reason above instead of a stepper.
      */}
      {!closed && (
        <Card className="mb-4 overflow-x-auto p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-ink-900">Fulfilment progress</h2>
              <p className="text-xs text-ink-500">A complete audit trail from order to handover</p>
            </div>
            <span className="rounded-full bg-ink-100 px-2.5 py-1 text-xs font-semibold text-ink-600">
              Step {step + 1} of {ORDER_STEPS.length}
            </span>
          </div>
          <ol className="gp-scroll flex min-w-[650px] items-start">
            {ORDER_STEPS.map((s, i) => {
              const done = i <= step;
              const at = stampFor(o, s.status);
              return (
                <li key={s.status} className="flex items-start">
                  <div className="flex w-24 flex-col items-center text-center">
                    <span
                      className={cn(
                        "inline-flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold ring-4 ring-white",
                        done ? "bg-[#c02636] text-white" : "bg-ink-100 text-ink-400",
                      )}
                    >
                      {i < step ? <Check className="h-4 w-4" /> : i + 1}
                    </span>
                    <span
                      className={cn(
                        "mt-2 text-xs font-semibold",
                        done ? "text-ink-900" : "text-ink-400",
                      )}
                    >
                      {s.label}
                    </span>
                    {at && <span className="text-[11px] text-ink-400">{clockTime(at)}</span>}
                  </div>
                  {i < ORDER_STEPS.length - 1 && (
                    <span
                      className={cn(
                        "mt-[18px] h-0.5 w-10 flex-1 rounded-full",
                        i < step ? "bg-[#c02636]" : "bg-ink-100",
                      )}
                      aria-hidden
                    />
                  )}
                </li>
              );
            })}
          </ol>
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Snapshot lines: the name and unit as they were at checkout. */}
          <Card className="p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-ink-900">
              Items ({o.itemCount} {o.itemCount === 1 ? "unit" : "units"})
            </h2>
            <ul className="mt-1 divide-y divide-ink-100">
              {o.lines.map((l) => (
                <li key={l.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-ink-900">{l.name}</p>
                    <p className="text-xs text-ink-500">
                      {l.unit ? `${l.unit} · ` : ""}
                      {rs(l.unitPrice)} × {l.qty}
                    </p>
                  </div>
                  <span className="shrink-0 font-semibold text-ink-900">{rs(l.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-1.5 border-t border-ink-100 pt-3 text-sm">
              <Money label="Subtotal" value={rs(o.subtotal)} />
              <Money label="Delivery fee" value={rs(o.deliveryFee)} />
              {o.discount > 0 && (
                <Money
                  label={o.coupon ? `Discount (${o.coupon.code})` : "Discount"}
                  value={`− ${rs(o.discount)}`}
                />
              )}
              <div className="flex items-center justify-between border-t border-ink-100 pt-1.5 text-base font-semibold text-ink-900">
                <dt>Total</dt>
                <dd>{rs(o.total)}</dd>
              </div>
            </dl>
          </Card>

          {/* The customer's own note, if they left one. */}
          {o.note && (
            <Card className="p-4 sm:p-5">
              <h2 className="text-sm font-semibold text-ink-900">Note from the customer</h2>
              <p className="mt-1.5 text-sm text-ink-700">{o.note}</p>
            </Card>
          )}
          {/*
            The real `OrderEvent` rows, oldest first. `actorId` is a bare id — the
            API does not join the actor's user record here — so this says what
            happened and when, and does not guess who.
          */}
          <Card className="p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-ink-900">History</h2>
            {o.timeline.length === 0 ? (
              <p className="mt-1.5 text-sm text-ink-500">Nothing recorded on this order yet.</p>
            ) : (
              <ol className="mt-2.5 space-y-3">
                {o.timeline.map((e) => (
                  <li key={e.id} className="flex gap-3">
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-crimson-300"
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink-900">{e.label}</p>
                      {e.note && <p className="text-sm text-ink-600">{e.note}</p>}
                      <p className="text-xs text-ink-400">
                        {dayMonth(e.at)} · {clockTime(e.at)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          {/*
            Customer contact. These are the snapshot columns on the order — a
            seller order carries no customer relation — so they are exactly what
            the shop is allowed to see, and the buttons dial the real number.
          */}
          <Card className="p-4 sm:p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
              <User className="h-4 w-4 text-ink-400" /> Customer
            </h2>
            <p className="mt-1.5 font-medium text-ink-900">{o.recipientName}</p>
            <p className="text-sm text-ink-600">{o.recipientPhone}</p>
            <div className="mt-2.5 flex gap-2">
              <Button variant="outline" size="sm" href={`tel:${o.recipientPhone}`}>
                <Phone className="h-4 w-4" /> Call
              </Button>
              {shopId && canInShop(shopId, "messages.respond") && (
                <Button
                  variant="ghost"
                  size="sm"
                  href={`/messages?shopId=${encodeURIComponent(shopId)}&orderId=${encodeURIComponent(o.id)}`}
                >
                  <MessageCircle className="h-4 w-4" /> Message securely
                </Button>
              )}
            </div>
          </Card>
          <Card className="p-4 sm:p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
              <MapPin className="h-4 w-4 text-ink-400" /> Where it goes
            </h2>
            <p className="mt-1.5 font-medium text-ink-900">{o.area}</p>
            <p className="text-sm text-ink-600">{o.fullAddress}</p>
            {o.landmark && <p className="mt-0.5 text-xs text-ink-500">Landmark: {o.landmark}</p>}
            {/* Distance only when the API computed one at checkout. No ETA: no
                seller route returns one, and the shop sets its own timing. */}
            {o.distanceMeters != null && (
              <p className="mt-1.5 text-xs text-ink-500">
                {(o.distanceMeters / 1000).toFixed(1)} km from the shop
              </p>
            )}
          </Card>

          <Card className="p-4 sm:p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
              <Wallet className="h-4 w-4 text-ink-400" /> Payment
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Badge tone={o.isCod ? "marigold" : "blue"}>{o.paymentMethodLabel}</Badge>
              <Badge tone={o.paymentStatus === "PAID" ? "green" : "ink"}>
                {PAYMENT_STATUS_LABELS[o.paymentStatus] ?? o.paymentStatus}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-ink-600">
              {o.isCod
                ? o.codCollected
                  ? `${rs(o.total)} collected in cash.`
                  : `${rs(o.total)} to collect on delivery.`
                : `${rs(o.total)} paid online.`}
            </p>
            {o.coupon && (
              <p className="mt-1 text-xs text-ink-500">
                Coupon {o.coupon.code} ·{" "}
                {o.coupon.type === "PERCENT"
                  ? `${o.coupon.value}% off`
                  : `${rs(o.coupon.value)} off`}
              </p>
            )}
          </Card>
          {/*
            Self-delivery: the rider is one of this shop's own people, read from
            `GET /seller/shops/:shopId/riders`. Never a made-up name — a rider
            account with no name yet shows their phone number instead.
          */}
          <Card className="p-4 sm:p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
              <Bike className="h-4 w-4 text-ink-400" /> Delivery
            </h2>
            <div className="mt-1.5">
              {o.deliveryStatus ? (
                <DeliveryStatusBadge status={o.deliveryStatus} />
              ) : (
                <span className="text-sm text-ink-500">No delivery leg on this order.</span>
              )}
            </div>

            {o.rider ? (
              <div className="mt-2.5">
                <p className="font-medium text-ink-900">{o.rider.name}</p>
                <p className="text-sm text-ink-600">
                  {o.rider.phone} · {vehicleLabel(o.rider.vehicleType)}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" href={`tel:${o.rider.phone}`}>
                    <Phone className="h-4 w-4" /> Call rider
                  </Button>
                  {canUnassign && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => void onRun(() => unassignRider(shopId, o.id))}
                    >
                      {busy ? <Spinner /> : <UserMinus className="h-4 w-4" />} Unassign
                    </Button>
                  )}
                </div>
                {/* A live reading, if the rider's app has reported one. Not an ETA. */}
                {o.riderPosition && (
                  <p className="mt-2 text-xs text-ink-500">
                    Last position {o.riderPosition.lat.toFixed(4)}, {o.riderPosition.lng.toFixed(4)}
                    {o.riderPosition.lastPingAt && ` · ${ago(o.riderPosition.lastPingAt)}`}
                    {o.riderPosition.stale && " · not updating"}
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-2.5 text-sm text-ink-500">No rider assigned yet.</p>
            )}
            {canAssign && (
              <div className="mt-3 border-t border-ink-100 pt-3">
                {ridersError ? (
                  <InlineError
                    message={`Could not load this shop’s riders. ${ridersError.message}`}
                  />
                ) : riders.length === 0 ? (
                  <p className="text-sm text-ink-500">
                    No riders on this shop’s roster yet. Add one under Delivery, then assign it
                    here.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    <label htmlFor="rider" className="text-xs font-medium text-ink-600">
                      {o.rider ? "Reassign to" : "Assign a rider"}
                    </label>
                    <select
                      id="rider"
                      value={riderId}
                      onChange={(e) => setRiderId(e.target.value)}
                      className="h-10 rounded-xl border border-ink-200 bg-white px-3 text-sm outline-none focus:border-crimson-300"
                    >
                      <option value="">Choose a rider</option>
                      {riders.map((r) => (
                        <option
                          key={r.id}
                          value={r.id}
                          disabled={r.status !== "ONLINE" || r.activeDeliveries > 0}
                        >
                          {r.name} · {riderStatusLabel(r.status)}
                          {r.activeDeliveries > 0 ? ` · ${r.activeDeliveries} on the go` : ""}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      disabled={busy || !selectedRiderAvailable}
                      onClick={() =>
                        void onRun(async () => {
                          await assignRider(shopId, o.id, riderId);
                          setRiderId("");
                        })
                      }
                    >
                      {busy ? <Spinner /> : <Bike className="h-4 w-4" />}{" "}
                      {o.deliveryStatus === "FAILED" || o.deliveryStatus === "RETURNED_TO_SHOP"
                        ? "Assign reattempt"
                        : o.rider
                          ? "Reassign"
                          : "Assign"}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {o.podNote && (
              <p className="mt-3 border-t border-ink-100 pt-3 text-sm text-ink-600">
                Handover note: {o.podNote}
              </p>
            )}
            {o.hasProofPhoto && <DeliveryProofPhoto shopId={shopId} orderId={o.id} />}
            {o.failReason && (
              <p className="mt-3 border-t border-ink-100 pt-3 text-sm text-[#c02636]">
                Delivery failed: {o.failReason}
              </p>
            )}
            {o.returnNote && (
              <p className="mt-3 border-t border-ink-100 pt-3 text-sm text-amber-900">
                Returned parcel check: {o.returnNote}
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
/* -------------------------------------------------------------- Small pieces */

/**
 * Suggested reasons, one tap each. The free-text box is always there too — the
 * API stores whatever is sent, and the customer reads it on a reject or cancel,
 * so a preset must never be the only option.
 */
const REJECT_REASONS = ["Out of stock", "Shop is closed", "Can’t deliver to this area"];
const CANCEL_REASONS = ["Customer asked to cancel", "Item unavailable", "Address unreachable"];
const FAIL_REASONS = [
  "Nobody at the address",
  "Customer refused the order",
  "Couldn’t find the address",
];

/** `PaymentStatus`, in words. Indexed by string, so a new enum value falls back. */
const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "Payment pending",
  PAID: "Paid",
  FAILED: "Payment failed",
  REFUNDED: "Refunded",
};

/*
 * Vehicle, rider status and the delivery-step verb are *not* declared here.
 * `lib/delivery-view.ts` owns all three and the delivery board renders from them,
 * so a second copy here meant the same leg read "Rider picked up" on this screen
 * and "Rider has it" on the board — one action described two ways depending on
 * which screen the seller happened to open.
 */

/** The real timestamp column behind a lifecycle step, or null if it hasn't happened. */
function stampFor(o: SellerOrderDetail, status: OrderStatusWire): string | null {
  switch (status) {
    case "PLACED":
      return o.placedAt;
    case "ACCEPTED":
      return o.acceptedAt;
    case "PACKED":
      return o.packedAt;
    case "OUT_FOR_DELIVERY":
      return o.dispatchedAt;
    case "DELIVERED":
      return o.deliveredAt;
    default:
      return null;
  }
}

function Money({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-ink-600">
      <dt>{label}</dt>
      <dd className="font-medium text-ink-800">{value}</dd>
    </div>
  );
}
