"use client";

import * as React from "react";
import {
  AlertTriangle,
  Bike,
  Check,
  MapPin,
  Package,
  PackageCheck,
  Phone,
  Plus,
  RefreshCw,
  Store,
  Trash2,
  Truck,
  UserPlus,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { ApiError, isValidNepalMobile, normalisePhone } from "@gopasal/api-client";
import { useAuth } from "@/components/auth-provider";
import { useShops } from "@/components/shop-provider";
import { ShopScopeState, scopeShopIds, useShopScope } from "@/components/ShopScope";
import { PageHeader, Card, Button, Badge, EmptyState, Switch } from "@/components/primitives";
import { StatCard } from "@/components/StatCard";
import { Reveal } from "@/components/Reveal";
import { PermissionGate } from "@/components/PermissionGate";
import { ErrorPanel, InlineError, InlineNotice, SkeletonRows, Spinner } from "@/components/states";
import { DeliveryStatusBadge, OrderStatusBadge } from "@/components/orders/OrderBits";
import { cn } from "@/lib/cn";
import { rs, num, ago } from "@/lib/format";
import { asApiError } from "@/lib/api/client";
import { dispatchOrder, listAllShopOrders, listShopOrders } from "@/lib/api/orders";
import {
  assignRider,
  createShopZone,
  deleteShopZone,
  listShopRiders,
  listShopZones,
  patchDelivery,
  registerRider,
  removeRider,
  unassignRider,
  updateShopZone,
  type DeliveryStatusWire,
  type UpsertZoneBody,
  type VehicleTypeWire,
} from "@/lib/api/delivery";
import { BOARD_OPEN_STATUSES, toSellerOrders, type SellerOrder } from "@/lib/orders-view";
import {
  DELIVERY_LANES,
  VEHICLE_OPTIONS,
  codOutstanding,
  codState,
  deliveryStepLabel,
  parsePolygonText,
  polygonToText,
  toDeliveryBoard,
  toDeliveryRiders,
  toDeliveryZones,
  vehicleLabel,
  type DeliveryLane,
  type DeliveryRider,
  type DeliveryZone,
} from "@/lib/delivery-view";

/**
 * The self-delivery board, read from the API.
 *
 * GoPasal shops deliver their own orders (SRS Model 4A), so every person on this
 * screen is a real `Rider` row belonging to this shop — registered by phone
 * number, visible to the API, and the only thing that can be assigned to a
 * delivery. The fixture version of this page picked a courier out of a `STAFF`
 * array and wrote a free-text `runner` name onto a local copy of an order; that is
 * gone, along with the array. A name on this screen now belongs to someone the
 * platform can actually reach.
 *
 * Four endpoint facts shape the layout:
 *
 * 1. **There is no delivery-scoped order list.** The board reads
 *    `GET /seller/shops/:shopId/orders`, which requires `orders.view` — so a
 *    teammate holding only `delivery.view` sees the roster and the zones but no
 *    orders, and the page says exactly that instead of showing an empty board.
 * 2. **Assignment must come before dispatch.** `OrdersService.dispatch` 400s with
 *    `'Assign a rider before dispatching'`, and patching a leg to `EN_ROUTE`
 *    before the order is `OUT_FOR_DELIVERY` writes the leg and *then* 403s on the
 *    cascade. The lanes are ordered to make the legal path the obvious one.
 * 3. **Zone writes are `settings.manage`, not a delivery key.** A delivery
 *    teammate can read the zones and cannot touch them; the buttons are gated
 *    separately from everything else here and say why.
 * 4. **Rider status is not ours to set.** `RiderStatus` is written by the rider's
 *    own app and by the assign/complete transactions. There is no seller route,
 *    so it is reported and never edited — and there are no shifts, because the
 *    schema has no shift.
 *
 * Nothing on this screen estimates. No ETA, no "arrives by", no distance the API
 * did not compute, and no live position: the roster says only whether a rider has
 * ever reported one, and the real feed lives on the order detail where it is
 * scoped to an order that is actually out.
 */

type TabId = "board" | "riders" | "zones";

/**
 * How many finished orders per shop the "recently finished" lane asks for.
 *
 * A number, not "all": `DELIVERED` is the one status that grows without bound, and
 * a board that read every delivered order to show four of them would get slower
 * every week the shop succeeded. The lane's label says "the newest few" because
 * that is exactly what this is.
 */
const BOARD_DONE_LIMIT = 20;

/** One shop's delivery-side state, kept per shop because every write is per shop. */
type ShopSlice = {
  shopId: string;
  shopName: string;
  riders: DeliveryRider[];
  zones: DeliveryZone[];
  /** Whether this account may edit zones here — `settings.manage`, not delivery. */
  canManageZones: boolean;
  canManageRiders: boolean;
};

/**
 * One shop's four delivery-side reads, kept together so a failure is attributable.
 *
 * The board used to read every shop inside a single `Promise.all`, which meant one
 * shop's 403 — or one dropped connection — rejected the lot and emptied the screen
 * for the shops that had answered perfectly well. Reading per shop and recording the
 * outcome lets the good shops render while the failed ones are named.
 *
 * `riders`/`zones` are `null` when this account has no `delivery.view` on the shop:
 * not read is a different fact from read and empty, and only the first may be left
 * out of the roster.
 */
type ShopRead = {
  id: string;
  /** Non-null when this shop's read failed; every other field is then empty. */
  error: unknown;
  orderRows: Awaited<ReturnType<typeof listAllShopOrders>>["orders"];
  truncated: boolean;
  riders: Awaited<ReturnType<typeof listShopRiders>> | null;
  zones: Awaited<ReturnType<typeof listShopZones>> | null;
};

export default function DeliveryPage() {
  return (
    <PermissionGate perm="delivery.view">
      <DeliveryInner />
    </PermissionGate>
  );
}

function DeliveryInner() {
  const { canInShop } = useAuth();
  const { activeShopId, shopById } = useShops();

  const [orders, setOrders] = React.useState<SellerOrder[]>([]);
  /** True when a shop had more live orders than the fan-out reads. Disclosed, not hidden. */
  const [boardTruncated, setBoardTruncated] = React.useState(false);
  const [slices, setSlices] = React.useState<ShopSlice[]>([]);
  /**
   * Shops whose delivery-side read failed while at least one other shop's succeeded.
   *
   * The fan-out below is per shop, so one shop answering with a 403 or a dropped
   * connection used to empty the whole board. Now the shops that answered are shown
   * and the ones that did not are named here, because a lane that is short by one
   * shop's orders looks exactly like a lane with nothing left to do.
   */
  const [partialShops, setPartialShops] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<ApiError | null>(null);
  const [tab, setTab] = React.useState<TabId>("board");
  const [acting, setActing] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  // Two different grants, two different lists. Firing a request we know would 403
  // turns one missing permission into a page-wide error banner. Each scope also
  // separates "still reading your shops" and "that read failed" from "you don't
  // have the permission", which are four situations and not one.
  const orderScope = useShopScope("orders.view");
  const deliveryScope = useShopScope("delivery.view");
  const orderShopIds = scopeShopIds(orderScope);
  const deliveryShopIds = scopeShopIds(deliveryScope);
  const orderIdsKey = orderShopIds.join(",");
  const deliveryIdsKey = deliveryShopIds.join(",");

  const load = React.useCallback(
    async (signal?: AbortSignal) => {
      const orderIds = orderIdsKey ? orderIdsKey.split(",") : [];
      const deliveryIds = deliveryIdsKey ? deliveryIdsKey.split(",") : [];
      if (orderIds.length === 0 && deliveryIds.length === 0) {
        setOrders([]);
        setBoardTruncated(false);
        setSlices([]);
        setPartialShops([]);
        setLoading(false);
        setError(null);
        return;
      }
      setLoading(true);

      /** Everything one shop can tell this screen, with its own failure boundary. */
      const readShop = async (id: string): Promise<ShopRead> => {
        const wantOrders = orderIds.includes(id);
        const wantDelivery = deliveryIds.includes(id);
        try {
          const [open, done, riders, zones] = await Promise.all([
            // The three live lanes, filtered by Postgres rather than by the browser.
            wantOrders
              ? listAllShopOrders(id, { status: BOARD_OPEN_STATUSES, sort: "newest" }, signal)
              : null,
            // Finished work, deliberately as one short newest-first page per shop:
            // `DELIVERED` grows without bound and a full read of it would crowd the
            // live lanes out of the fan-out.
            wantOrders
              ? listShopOrders(
                  id,
                  { status: ["DELIVERED"], sort: "newest", page: 1, limit: BOARD_DONE_LIMIT },
                  signal,
                )
              : null,
            wantDelivery ? listShopRiders(id, signal) : null,
            wantDelivery ? listShopZones(id, signal) : null,
          ]);
          return {
            id,
            error: null,
            orderRows: [...(open?.orders ?? []), ...(done?.data ?? [])],
            truncated: open?.truncated ?? false,
            riders,
            zones,
          };
        } catch (err) {
          return { id, error: err, orderRows: [], truncated: false, riders: null, zones: null };
        }
      };

      try {
        const shopIds = Array.from(new Set([...orderIds, ...deliveryIds]));
        const reads = await Promise.all(shopIds.map(readShop));
        if (signal?.aborted) return;

        const failed = reads.filter((r) => r.error !== null);
        const answered = reads.filter((r) => r.error === null);

        // Nothing answered: this is a page-wide failure and gets the error panel,
        // with the first shop's own message rather than a manufactured one. The
        // early return above guarantees at least one shop was read, so there is a
        // failure here to speak for.
        if (answered.length === 0) {
          setError(asApiError(failed[0]?.error));
          setOrders([]);
          setBoardTruncated(false);
          setSlices([]);
          setPartialShops([]);
          return;
        }

        setOrders(
          toSellerOrders(answered.flatMap((r) => r.orderRows)).sort((a, b) =>
            a.placedAt < b.placedAt ? 1 : -1,
          ),
        );
        setBoardTruncated(answered.some((r) => r.truncated));
        setSlices(
          answered
            .filter((r) => r.riders !== null && r.zones !== null)
            .map((r) => ({
              shopId: r.id,
              shopName: shopById(r.id)?.name ?? "This shop",
              riders: toDeliveryRiders(r.riders ?? []),
              zones: toDeliveryZones(r.zones ?? []),
              canManageZones: canInShop(r.id, "settings.manage"),
              canManageRiders: canInShop(r.id, "delivery.assign"),
            })),
        );
        setPartialShops(failed.map((r) => shopById(r.id)?.name ?? "a shop on your account"));
        setError(null);
      } catch (err) {
        // `readShop` already absorbs every request failure, so what reaches here is a
        // mapper throwing on a shape the API changed — `toSellerOrders`,
        // `toDeliveryRiders`, `toDeliveryZones`. Without this the rejection escaped
        // `void load()` entirely and the board rendered as an empty day: lanes with
        // nothing in them, no rider roster, and no indication anything went wrong.
        if (signal?.aborted) return;
        setError(asApiError(err));
        setOrders([]);
        setBoardTruncated(false);
        setSlices([]);
        setPartialShops([]);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [orderIdsKey, deliveryIdsKey, shopById, canInShop],
  );

  React.useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  /**
   * Every write here answers with a bare row — a `Delivery` with no rider, an
   * `Order` with no items, a rider with no roster counts. Merging any of those
   * into what is on screen would blank fields the seller can currently read, so
   * each action refetches instead.
   *
   * It resolves `true` only when the server accepted the write, and `false` when it
   * did not. Callers use that to decide whether to close the panel or form they took
   * the values from: a POD note, a failure reason, a rider's phone number or a
   * hand-typed delivery polygon only exists in that form's state, so tearing it down
   * before the request lands means a 403 or a dropped connection destroys typing the
   * seller cannot get back. `load()` catches its own errors, so a `false` here always
   * means the write itself failed, never the refetch after it.
   */
  const runAction = React.useCallback(
    async (key: string, fn: () => Promise<unknown>): Promise<boolean> => {
      setActing(key);
      setActionError(null);
      try {
        await fn();
        await load();
        return true;
      } catch (err) {
        setActionError(
          err instanceof ApiError ? err.message : "That didn’t go through. Please try again.",
        );
        return false;
      } finally {
        setActing(null);
      }
    },
    [load],
  );

  /**
   * The five real moves this board can make, each keyed by the order it touches so
   * only that card shows a spinner.
   *
   * `codCollected` is sent only for a COD order, and never with an amount: the API
   * stamps `codAmount` from the order total itself. There is no proof-of-delivery
   * photo on this body — `DeliveryStatusDto` accepts `status`, `podNote`,
   * `codCollected` and `failReason` and nothing else, so any other key is a 400.
   *
   * Each one hands back `runAction`'s verdict so the card can wait for the server
   * before it closes the panel the values came from.
   */
  const handlers: CardHandlers = React.useMemo(
    () => ({
      assign: (o, riderId) => runAction(o.id, () => assignRider(o.shopId, o.id, riderId)),
      unassign: (o) => runAction(o.id, () => unassignRider(o.shopId, o.id)),
      dispatch: (o) => runAction(o.id, () => dispatchOrder(o.shopId, o.id)),
      step: (o, to) => runAction(o.id, () => patchDelivery(o.shopId, o.id, { status: to })),
      finish: (o, codCollected, note) =>
        runAction(o.id, () =>
          patchDelivery(o.shopId, o.id, {
            status: "DELIVERED",
            ...(o.isCod ? { codCollected } : {}),
            ...(note.trim() ? { podNote: note.trim() } : {}),
          }),
        ),
      fail: (o, reason) =>
        runAction(o.id, () =>
          patchDelivery(o.shopId, o.id, {
            status: "FAILED",
            ...(reason.trim() ? { failReason: reason.trim() } : {}),
          }),
        ),
    }),
    [runAction],
  );

  const board = React.useMemo(() => toDeliveryBoard(orders), [orders]);

  const ridersByShop = React.useMemo(
    () => new Map(slices.map((s) => [s.shopId, s.riders])),
    [slices],
  );

  const stats = React.useMemo(() => {
    const riders = slices.flatMap((s) => s.riders);
    return {
      needsRider: board.ready.length,
      out: board.on_the_way.length,
      riders: riders.length,
      carrying: riders.filter((r) => r.busy).length,
      // Cash still with a rider or still to be handed over: the legs in someone's
      // hands, not every open COD order.
      cod: codOutstanding([...board.with_rider, ...board.on_the_way]),
    };
  }, [board, slices]);

  const zoneCount = slices.reduce((n, s) => n + s.zones.length, 0);

  /**
   * Whether the four cards below are counting anything yet.
   *
   * They are tallies of what was fetched, not a server summary, so before the first
   * answer — and after a failed one — every one of them is zero. "Needs a rider: 0"
   * and "Cash with riders: Rs 0" are strong claims about a shop's day; neither may be
   * made on the strength of an empty array.
   */
  const countsKnown =
    (orderShopIds.length > 0 || deliveryShopIds.length > 0) &&
    !error &&
    !(loading && orders.length === 0 && slices.length === 0);
  const stat = (value: number) => (countsKnown ? num(value) : "—");

  const TABS: { id: TabId; label: string; count: number }[] = [
    { id: "board", label: "Board", count: board.ready.length + board.on_the_way.length },
    { id: "riders", label: "Riders", count: stats.riders },
    { id: "zones", label: "Delivery zones", count: zoneCount },
  ];

  /**
   * Shops whose riders and zones this account can see, but whose orders it cannot.
   *
   * The board is built from the order list, so such a shop shows a roster and no
   * work. Comparing the two scopes shop by shop — rather than only asking whether the
   * order list is empty overall — is what makes a three-shop account with one missing
   * grant say so, instead of quietly drawing two shops' lanes as if that were all of
   * them.
   */
  const ordersHiddenShops = React.useMemo(
    () =>
      deliveryShopIds
        .filter((id) => !orderShopIds.includes(id))
        .map((id) => shopById(id)?.name ?? "a shop on your account"),
    [deliveryShopIds, orderShopIds, shopById],
  );

  return (
    <div>
      <PageHeader
        icon={<Truck className="h-5 w-5" />}
        title="Delivery"
        subtitle={
          activeShopId === null
            ? "Your shops deliver their own orders. Assign a rider, then send the order out — you decide the timing."
            : "This shop delivers its own orders. Assign a rider, then send the order out — you decide the timing."
        }
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? <Spinner /> : <RefreshCw className="h-4 w-4" />} Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <Reveal delay={0}>
          <StatCard
            label="Needs a rider"
            value={stat(stats.needsRider)}
            icon={Package}
            tone="marigold"
            hint="Accepted or packed"
          />
        </Reveal>
        <Reveal delay={1}>
          <StatCard
            label="Out for delivery"
            value={stat(stats.out)}
            icon={Truck}
            tone="crimson"
            hint="On the way now"
          />
        </Reveal>
        <Reveal delay={2}>
          {/* Roster size, not "on shift": the API has no shift or availability
              window, and the rider's ONLINE flag is set by their own app. */}
          <StatCard
            label="Riders"
            value={stat(stats.riders)}
            icon={Bike}
            tone="blue"
            hint={countsKnown ? `${num(stats.carrying)} carrying an order` : undefined}
          />
        </Reveal>
        <Reveal delay={3}>
          <StatCard
            label="Cash with riders"
            value={countsKnown ? rs(stats.cod) : "—"}
            icon={Wallet}
            tone="green"
            hint="COD still to collect"
          />
        </Reveal>
      </div>

      <div className="gp-scroll -mx-1 mt-5 flex gap-1 overflow-x-auto px-1 pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
              tab === t.id
                ? "bg-ink-900 text-white"
                : "bg-white text-ink-600 ring-1 ring-ink-200 hover:bg-ink-50",
            )}
          >
            {t.label}
            {t.count > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs font-semibold",
                  tab === t.id ? "bg-white/20 text-white" : "bg-ink-100 text-ink-500",
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {actionError && <InlineError message={actionError} className="mt-4" />}

      {/* Some shops answered and some did not. Saying which keeps a lane that is
          short by one shop's orders from reading as a lane with nothing left in it. */}
      {!error && partialShops.length > 0 && (
        <InlineNotice
          className="mt-4"
          message={`Couldn’t read ${partialShops.join(", ")} just now, so nothing from ${
            partialShops.length === 1 ? "it" : "them"
          } is on this screen. Everything else loaded — press Refresh to try again.`}
        />
      )}

      {loading && orders.length === 0 && slices.length === 0 ? (
        <div className="mt-4">
          <SkeletonRows rows={4} />
        </div>
      ) : error ? (
        <div className="mt-4">
          <ErrorPanel
            title="Couldn’t load your delivery board"
            message={error.message}
            offline={error.offline}
            onRetry={() => void load()}
          />
        </div>
      ) : deliveryShopIds.length === 0 && orderShopIds.length === 0 ? (
        <div className="mt-4">
          {deliveryScope.kind === "denied" ? (
            <Card className="p-0">
              {/* This page's own wording, not the shared one: either grant shows
                  something here, so naming only one of them would be untrue. */}
              <EmptyState
                icon={<Truck className="h-6 w-6" />}
                title="No shop to run deliveries for"
                description="Seeing anything here needs either the “view delivery board” or the “view orders” permission on a shop, and this account has neither. Ask an owner for whichever you need."
              />
            </Card>
          ) : (
            <ShopScopeState
              scope={deliveryScope}
              what="deliveries"
              permLabel="view delivery board"
              icon={<Truck className="h-6 w-6" />}
            />
          )}
        </div>
      ) : tab === "board" ? (
        <div className="mt-4">
          {ordersHiddenShops.length > 0 && (
            <InlineNotice
              className="mb-4"
              message={
                deliveryShopIds.length === 1
                  ? "You can see this shop’s riders and zones, but not its orders. The board is built from the order list, which needs the “view orders” permission — ask an owner to add it."
                  : `The board leaves out ${ordersHiddenShops.join(
                      ", ",
                    )}: you can see riders and zones there, but not orders. That needs the “view orders” permission — ask an owner to add it.`
              }
            />
          )}
          {/*
            The live lanes are read a bounded number of pages deep per shop. If a shop
            has more open orders than that, the board is showing the newest of them —
            which has to be said, or the empty space below a lane reads as "nothing
            left to do".
          */}
          {boardTruncated && (
            <InlineNotice
              className="mb-4"
              message="This shop has more open orders than the board reads at once. The newest are shown — work through them and refresh to pull the rest."
            />
          )}
          <BoardView board={board} showShop={activeShopId === null} ridersByShop={ridersByShop} acting={acting} handlers={handlers} />
        </div>
      ) : tab === "riders" ? (
        <RidersPanel
          slices={slices}
          activeShopId={activeShopId}
          acting={acting}
          onRegister={(shopId, body) => runAction(`reg:${shopId}`, () => registerRider(shopId, body))}
          onRemove={(shopId, riderId) => void runAction(`rider:${riderId}`, () => removeRider(shopId, riderId))}
        />
      ) : (
        <ZonesPanel
          slices={slices}
          activeShopId={activeShopId}
          acting={acting}
          onCreate={(shopId, body) => runAction(`zone:new:${shopId}`, () => createShopZone(shopId, body))}
          onUpdate={(shopId, zoneId, body) => runAction(`zone:${zoneId}`, () => updateShopZone(shopId, zoneId, body))}
          onDelete={(shopId, zoneId) => void runAction(`zone:${zoneId}`, () => deleteShopZone(shopId, zoneId))}
        />
      )}
    </div>
  );
}

/* --------------------------------------------------------------------- Board */

/**
 * What a card may ask the board to do.
 *
 * Every one resolves `true` on a server-accepted write and `false` otherwise, which is
 * what lets a card keep its panel — and the note or reason typed into it — on screen
 * when the write is refused.
 */
type CardHandlers = {
  assign: (o: SellerOrder, riderId: string) => Promise<boolean>;
  unassign: (o: SellerOrder) => Promise<boolean>;
  dispatch: (o: SellerOrder) => Promise<boolean>;
  step: (o: SellerOrder, to: DeliveryStatusWire) => Promise<boolean>;
  finish: (o: SellerOrder, codCollected: boolean, note: string) => Promise<boolean>;
  fail: (o: SellerOrder, reason: string) => Promise<boolean>;
};

const LANE_GRID: Record<DeliveryLane, string> = {
  ready: "border-t-[#e2a200]",
  with_rider: "border-t-[#1D4ED8]",
  on_the_way: "border-t-crimson-500",
  closed: "border-t-[#0B7E58]",
};

function BoardView({
  board,
  showShop,
  ridersByShop,
  acting,
  handlers,
}: {
  board: Record<DeliveryLane, SellerOrder[]>;
  showShop: boolean;
  ridersByShop: Map<string, DeliveryRider[]>;
  acting: string | null;
  handlers: CardHandlers;
}) {
  const total = DELIVERY_LANES.reduce((n, l) => n + board[l.id].length, 0);

  if (total === 0) {
    return (
      <Card className="p-0">
        <EmptyState
          icon={<PackageCheck className="h-6 w-6" />}
          title="Nothing to deliver right now"
          description="Orders appear here once you accept them. Assign a rider, then send the order out."
        />
      </Card>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-4">
      {DELIVERY_LANES.map((lane) => (
        <section
          key={lane.id}
          className={cn("gp-panel border-t-2 p-3", LANE_GRID[lane.id])}
          aria-label={lane.label}
        >
          <header className="mb-3 px-1">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-ink-900">{lane.label}</h2>
              <Badge tone={lane.tone}>{num(board[lane.id].length)}</Badge>
            </div>
            <p className="mt-0.5 text-xs text-ink-400">{lane.hint}</p>
          </header>
          <div className="space-y-2.5">
            {board[lane.id].length === 0 ? (
              <p className="rounded-xl border border-dashed border-ink-200 px-3 py-6 text-center text-xs text-ink-400">
                Empty
              </p>
            ) : (
              board[lane.id].map((o) => (
                <OrderCard
                  key={o.id}
                  order={o}
                  lane={lane.id}
                  showShop={showShop}
                  riders={ridersByShop.get(o.shopId) ?? []}
                  busy={acting === o.id}
                  handlers={handlers}
                />
              ))
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------- One order */

/**
 * Common reasons, as shortcuts into the same free-text field.
 *
 * `failReason` is `@IsString() @IsOptional()` on the API — there is no enum behind
 * it, so these are conveniences and not a closed list. The input stays editable so
 * a real reason nobody anticipated can still be recorded.
 */
const FAIL_REASONS = [
  "Nobody at the address",
  "Phone not reachable",
  "Buyer refused the order",
  "Wrong or unclear address",
  "Buyer had no cash",
] as const;

/**
 * One order on the board.
 *
 * Every gate here is `canInShop(order.shopId, …)`, never the ambient `can`: in the
 * consolidated view the ambient check answers "somewhere", which would offer
 * Assign on an order belonging to a shop where the grant does not exist. The API
 * would refuse it and the button would have lied.
 */
function OrderCard({
  order: o,
  lane,
  showShop,
  riders,
  busy,
  handlers,
}: {
  order: SellerOrder;
  lane: DeliveryLane;
  showShop: boolean;
  riders: DeliveryRider[];
  busy: boolean;
  handlers: CardHandlers;
}) {
  const { canInShop } = useAuth();
  const { shopById } = useShops();
  const [panel, setPanel] = React.useState<"none" | "pick" | "finish" | "fail">("none");
  const [collected, setCollected] = React.useState(true);
  const [note, setNote] = React.useState("");
  const [reason, setReason] = React.useState("");

  const canAssign = canInShop(o.shopId, "delivery.assign");
  const canUpdate = canInShop(o.shopId, "delivery.update");
  const canDispatch = canInShop(o.shopId, "orders.dispatch");
  const next = o.actions.nextDeliveryStatus;
  const cash = codState(o);
  const shopName = shopById(o.shopId)?.name;

  return (
    <Card className="overflow-hidden p-0">
      <div className="p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-semibold text-ink-900">{o.code}</span>
          <OrderStatusBadge status={o.status} />
          {o.deliveryStatus && <DeliveryStatusBadge status={o.deliveryStatus} />}
        </div>

        <p className="mt-1 truncate text-sm text-ink-700">{o.recipientName}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-400">
          {showShop && shopName && (
            <span className="inline-flex items-center gap-1">
              <Store className="h-3 w-3" /> {shopName}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" /> {o.area}
            {/* Only when the API computed one. There is no ETA to show beside it. */}
            {o.distanceMeters != null && ` · ${(o.distanceMeters / 1000).toFixed(1)} km`}
          </span>
          <span>{ago(o.placedAt)}</span>
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge tone={cash === "collected" ? "green" : cash === "pending" ? "marigold" : "ink"}>
            <Wallet className="h-3 w-3" />
            {cash === "not_cod"
              ? `${o.paymentMethodLabel} · ${rs(o.total)}`
              : cash === "collected"
                ? `Cash collected · ${rs(o.total)}`
                : `Collect ${rs(o.total)}`}
          </Badge>
          {o.rider ? (
            <Badge tone="blue">
              <Bike className="h-3 w-3" /> {o.rider.name} · {vehicleLabel(o.rider.vehicleType)}
            </Badge>
          ) : (
            lane !== "closed" && <Badge tone="ink">No rider yet</Badge>
          )}
        </div>

        {o.rider && (
          <a
            href={`tel:${o.rider.phone}`}
            className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-crimson-600"
          >
            <Phone className="h-3 w-3" /> {o.rider.phone}
          </a>
        )}

        {lane === "closed" ? (
          <p className="mt-2 text-xs text-ink-500">
            {o.deliveryStatus === "FAILED"
              ? "This leg failed and cannot be reassigned — the delivery machine has no way back out of FAILED. Cancel or re-place the order instead."
              : o.deliveredAt
                ? `Handed over ${ago(o.deliveredAt)}`
                : "Closed"}
          </p>
        ) : (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {lane === "ready" && canAssign && o.actions.assignRider && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPanel(panel === "pick" ? "none" : "pick")}
                disabled={busy}
              >
                <UserPlus className="h-4 w-4" /> Assign rider
              </Button>
            )}

            {canAssign && o.actions.unassignRider && (
              <Button size="sm" variant="ghost" onClick={() => handlers.unassign(o)} disabled={busy}>
                {busy ? <Spinner /> : <X className="h-4 w-4" />} Take off
              </Button>
            )}

            {canUpdate && next && next !== "DELIVERED" && (
              <Button size="sm" variant="outline" onClick={() => handlers.step(o, next)} disabled={busy}>
                {busy ? <Spinner /> : <Check className="h-4 w-4" />} {deliveryStepLabel(next)}
              </Button>
            )}

            {canDispatch && o.actions.dispatch && (
              <Button size="sm" onClick={() => handlers.dispatch(o)} disabled={busy}>
                {busy ? <Spinner /> : <Truck className="h-4 w-4" />} Send out
              </Button>
            )}

            {canUpdate && next === "DELIVERED" && (
              <Button size="sm" onClick={() => setPanel(panel === "finish" ? "none" : "finish")} disabled={busy}>
                <PackageCheck className="h-4 w-4" /> Handed over
              </Button>
            )}

            {canUpdate && o.actions.markFailed && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setPanel(panel === "fail" ? "none" : "fail")}
                disabled={busy}
              >
                <AlertTriangle className="h-4 w-4" /> Couldn’t deliver
              </Button>
            )}

            {/* The order machine, not an opinion: PACKED is the only status
                `dispatch` accepts, and packing lives on the order screen. */}
            {o.status === "ACCEPTED" && o.rider && (
              <p className="w-full text-xs text-ink-400">
                Mark this order packed in Orders before you can send it out.
              </p>
            )}
            {lane === "ready" && !canAssign && (
              <p className="w-full text-xs text-ink-400">
                You don’t have permission to assign riders on this shop.
              </p>
            )}
          </div>
        )}
      </div>

      {panel === "pick" && (
        <div className="border-t border-ink-100 bg-ink-50/60 p-3">
          {riders.length === 0 ? (
            <p className="text-xs text-ink-500">
              No riders on this shop’s roster yet. Add one on the Riders tab — only a registered
              rider can be assigned.
            </p>
          ) : (
            <>
              <p className="mb-1.5 text-xs font-semibold text-ink-600">Who is taking it out?</p>
              <ul className="space-y-1">
                {riders.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        // The list closes only once the assignment is the server's
                        // opinion too. A 403 from a rider another shop owns, or a
                        // dropped connection, leaves the picker open with the error
                        // banner above it instead of silently reverting the card.
                        if (await handlers.assign(o, r.id)) setPanel("none");
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-2 text-left ring-1 ring-ink-200 transition-colors hover:bg-crimson-50 disabled:opacity-60"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-ink-800">
                          {r.name}
                        </span>
                        <span className="block truncate text-xs text-ink-400">
                          {r.vehicleLabel}
                          {r.busy && ` · carrying ${num(r.activeDeliveries)}`}
                        </span>
                      </span>
                      <Badge tone={r.statusTone}>{r.statusLabel}</Badge>
                    </button>
                  </li>
                ))}
              </ul>
              {/* Reported by the rider's own app; a shop cannot set it, so an
                  OFFLINE rider is still assignable and the API will accept it. */}
              <p className="mt-1.5 text-xs text-ink-400">
                Status comes from the rider’s own app. You can still assign someone who is offline.
              </p>
            </>
          )}
        </div>
      )}

      {panel === "finish" && (
        <div className="border-t border-ink-100 bg-ink-50/60 p-3">
          <p className="text-xs font-semibold text-ink-600">Close this delivery</p>
          {o.isCod && (
            <div className="mt-2 flex items-center justify-between gap-3 rounded-lg bg-white px-2.5 py-2 ring-1 ring-ink-200">
              <span className="text-sm text-ink-700">
                Cash collected · <strong>{rs(o.total)}</strong>
              </span>
              <Switch checked={collected} onChange={setCollected} label="Cash collected" />
            </div>
          )}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={280}
            placeholder="Note for your records — who received it, where it was left"
            className="mt-2 w-full rounded-xl border border-ink-200 px-3 py-2 text-sm outline-none focus:border-crimson-300"
          />
          {/*
            No file picker here on purpose, and no photo field on the body either:
            `DeliveryStatusDto` accepts `status`, `podNote`, `codCollected` and
            `failReason`, and `forbidNonWhitelisted` answers 400 to anything else. The
            uploads module was built for onboarding documents and has no delivery
            route, so there is nowhere for a photo to go. A picker that dropped the
            photo would be worse than saying so.
          */}
          <p className="mt-1.5 text-xs text-ink-400">
            Photo proof isn’t available yet — there’s no upload for delivery photos. Your note is
            saved with the delivery.
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setPanel("none")} disabled={busy}>
              Not yet
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                // Closed only after the server has the note. It lives nowhere else,
                // so unmounting this panel on a failed PATCH would lose what the
                // seller typed about a handover that never got recorded.
                if (await handlers.finish(o, collected, note)) setPanel("none");
              }}
              disabled={busy}
            >
              {busy ? <Spinner /> : <PackageCheck className="h-4 w-4" />} Confirm handover
            </Button>
          </div>
        </div>
      )}

      {panel === "fail" && (
        <div className="border-t border-ink-100 bg-red-50/50 p-3">
          <p className="text-xs font-semibold text-ink-600">
            What happened? The buyer is told the delivery failed.
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {FAIL_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                // FAILED is terminal, so the chosen reason is the last editable thing
                // about this delivery. It was crimson fill alone.
                aria-pressed={reason === r}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-medium ring-1 transition-colors",
                  reason === r
                    ? "bg-[#c02636] text-white ring-[#c02636]"
                    : "bg-white text-ink-700 ring-ink-200 hover:bg-red-50",
                )}
              >
                {r}
              </button>
            ))}
          </div>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={280}
            placeholder="Or type the reason"
            className="mt-2 h-10 w-full rounded-xl border border-ink-200 px-3 text-sm outline-none focus:border-crimson-300"
          />
          <p className="mt-1.5 text-xs text-ink-400">
            A failed leg is final — it can’t be reassigned to another rider.
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setPanel("none")} disabled={busy}>
              Keep trying
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={busy || reason.trim().length === 0}
              onClick={async () => {
                // FAILED is terminal, so this is the one write a seller most needs to
                // see refused. The reason stays on screen until the server has it.
                if (await handlers.fail(o, reason)) setPanel("none");
              }}
            >
              {busy ? <Spinner /> : <AlertTriangle className="h-4 w-4" />} Mark failed
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------- Riders */

/**
 * The shop's rider roster.
 *
 * There is no platform-wide rider pool to pick from: `registerRider` takes a phone
 * number and a name, and a rider belongs to exactly one shop. So this panel is a
 * roster plus one form, per shop, and the form only appears when a single shop is
 * in scope — in the consolidated view there is no honest answer to "which shop is
 * this person riding for?", and guessing would attach someone to the wrong books.
 */
function RidersPanel({
  slices,
  activeShopId,
  acting,
  onRegister,
  onRemove,
}: {
  slices: ShopSlice[];
  activeShopId: string | null;
  acting: string | null;
  onRegister: (
    shopId: string,
    body: { phone: string; name: string; vehicleType: VehicleTypeWire },
  ) => Promise<boolean>;
  onRemove: (shopId: string, riderId: string) => void;
}) {
  if (slices.length === 0) {
    return (
      <Card className="mt-4 p-0">
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="No delivery access"
          description="You can’t see riders for the shop in scope."
        />
      </Card>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      {slices.map((s) => (
        <Card key={s.shopId} className="p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-ink-900">
              {slices.length > 1 ? s.shopName : "Riders"}
            </h2>
            <Badge tone="ink">{num(s.riders.length)} on the roster</Badge>
          </div>

          {s.riders.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed border-ink-200 px-4 py-8 text-center text-sm text-ink-500">
              Nobody on this shop’s roster yet. Add the person who will carry the orders — they get a
              GoPasal account on their phone number.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-ink-100">
              {s.riders.map((r) => (
                <RiderRow
                  key={r.id}
                  rider={r}
                  canManage={s.canManageRiders}
                  busy={acting === `rider:${r.id}`}
                  onRemove={() => onRemove(s.shopId, r.id)}
                />
              ))}
            </ul>
          )}

          {activeShopId !== null && s.canManageRiders && (
            <RegisterRiderForm
              shopId={s.shopId}
              busy={acting === `reg:${s.shopId}`}
              onRegister={onRegister}
            />
          )}
          {activeShopId === null && s.canManageRiders && (
            <p className="mt-3 text-xs text-ink-400">
              Switch to a single shop to add a rider — a rider belongs to one shop.
            </p>
          )}
          {!s.canManageRiders && (
            <p className="mt-3 text-xs text-ink-400">
              You can see this roster but not change it — adding or removing a rider needs the
              “assign deliveries” permission.
            </p>
          )}
        </Card>
      ))}
    </div>
  );
}

function RiderRow({
  rider: r,
  canManage,
  busy,
  onRemove,
}: {
  rider: DeliveryRider;
  canManage: boolean;
  busy: boolean;
  onRemove: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-ink-900">{r.name}</span>
          {/* Their app reports this. No shift, no roster window — none exists. */}
          <Badge tone={r.statusTone}>{r.statusLabel}</Badge>
          <Badge tone="ink">
            <Bike className="h-3 w-3" /> {r.vehicleLabel}
          </Badge>
        </div>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-400">
          <a href={`tel:${r.phone}`} className="hover:text-crimson-600">
            {r.phone}
          </a>
          <span>
            {r.busy ? `Carrying ${num(r.activeDeliveries)} order${r.activeDeliveries === 1 ? "" : "s"}` : "Free"}
          </span>
          {/* "Has ever reported a position" — not a location, and not a claim
              about where they are now. The live feed is on the order detail. */}
          {r.hasPosition && r.lastPingAt && <span>Last reported {ago(r.lastPingAt)}</span>}
        </p>
      </div>

      {canManage &&
        (r.canRemove ? (
          <Button size="sm" variant="ghost" onClick={onRemove} disabled={busy}>
            {busy ? <Spinner /> : <Trash2 className="h-4 w-4" />} Remove
          </Button>
        ) : (
          // The endpoint's own precondition, said out loud instead of a 400.
          <span className="text-xs text-ink-400">Can’t be removed while carrying an order</span>
        ))}
    </li>
  );
}

/**
 * Add someone to the roster.
 *
 * The warning is not decoration. `registerRider` upserts a `User` on the
 * normalised phone number: an unknown number gets a GoPasal account created, and a
 * number that already has one gets its **name overwritten** with whatever is typed
 * here. There is no undo and no confirmation step server-side, so the screen has to
 * be the one that says it.
 */
function RegisterRiderForm({
  shopId,
  busy,
  onRegister,
}: {
  shopId: string;
  busy: boolean;
  onRegister: (
    shopId: string,
    body: { phone: string; name: string; vehicleType: VehicleTypeWire },
  ) => Promise<boolean>;
}) {
  const [open, setOpen] = React.useState(false);
  const [phone, setPhone] = React.useState("");
  const [name, setName] = React.useState("");
  const [vehicleType, setVehicleType] = React.useState<VehicleTypeWire>("MOTORBIKE");

  const phoneOk = isValidNepalMobile(phone);
  const nameOk = name.trim().length >= 2;

  if (!open) {
    return (
      <div className="mt-3">
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Add a rider
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl bg-ink-50/70 p-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-ink-600">Mobile number</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="numeric"
            placeholder="98XXXXXXXX"
            className="h-10 w-full rounded-xl border border-ink-200 px-3 text-sm outline-none focus:border-crimson-300"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-ink-600">Their name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="As it should appear to buyers"
            className="h-10 w-full rounded-xl border border-ink-200 px-3 text-sm outline-none focus:border-crimson-300"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-ink-600">Vehicle</span>
          <select
            value={vehicleType}
            onChange={(e) => setVehicleType(e.target.value as VehicleTypeWire)}
            className="h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm outline-none focus:border-crimson-300"
          >
            {VEHICLE_OPTIONS.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <InlineNotice
        className="mt-2.5"
        message="This creates a GoPasal account on that number if there isn’t one, and updates the name on it if there is. Check the number before you save — it can’t be undone from here."
      />

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={busy || !phoneOk || !nameOk}
          onClick={async () => {
            // Registering a rider can overwrite the name on someone's existing
            // GoPasal account, so a seller who gets a refusal needs the number they
            // typed still in front of them to check it. The form empties only after
            // the server confirms the roster changed.
            const ok = await onRegister(shopId, {
              phone: normalisePhone(phone),
              name: name.trim(),
              vehicleType,
            });
            if (!ok) return;
            setPhone("");
            setName("");
            setOpen(false);
          }}
        >
          {busy ? <Spinner /> : <UserPlus className="h-4 w-4" />} Add to roster
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </Button>
        {phone.length > 0 && !phoneOk && (
          <span className="text-xs text-[#c02636]">Enter a 10-digit Nepal mobile number.</span>
        )}
        {name.length > 0 && !nameOk && (
          <span className="text-xs text-[#c02636]">A name needs at least 2 characters.</span>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- Zones */

/**
 * The shop's delivery zones.
 *
 * A zone is a boundary plus an optional delivery fee for orders inside it, and it
 * is the one thing on this screen a delivery teammate cannot touch: the write
 * routes are `settings.manage`. So reading and editing are gated separately, per
 * shop, and the panel says which one you have.
 *
 * There is no map here, and no drawing surface is faked. Boundaries are typed as
 * `lat, lng` lines — the exact shape the endpoint accepts — which is plain but
 * truthful. A shop that already has a zone stored in a shape this console cannot
 * read keeps it: the row is shown, and editing is refused rather than replacing the
 * boundary with something invented.
 */
function ZonesPanel({
  slices,
  activeShopId,
  acting,
  onCreate,
  onUpdate,
  onDelete,
}: {
  slices: ShopSlice[];
  activeShopId: string | null;
  acting: string | null;
  onCreate: (shopId: string, body: UpsertZoneBody) => Promise<boolean>;
  onUpdate: (shopId: string, zoneId: string, body: UpsertZoneBody) => Promise<boolean>;
  onDelete: (shopId: string, zoneId: string) => void;
}) {
  if (slices.length === 0) {
    return (
      <Card className="mt-4 p-0">
        <EmptyState
          icon={<MapPin className="h-6 w-6" />}
          title="No delivery access"
          description="You can’t see delivery zones for the shop in scope."
        />
      </Card>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      {slices.map((s) => (
        <Card key={s.shopId} className="p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-ink-900">
              {slices.length > 1 ? s.shopName : "Delivery zones"}
            </h2>
            <Badge tone="ink">{num(s.zones.length)} zone{s.zones.length === 1 ? "" : "s"}</Badge>
          </div>
          <p className="mt-1 text-xs text-ink-400">
            An area you deliver to, with its own delivery fee if you want one. Orders outside every
            zone still reach you — a zone changes the fee, it doesn’t block an order.
          </p>

          {s.zones.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed border-ink-200 px-4 py-8 text-center text-sm text-ink-500">
              No zones yet. Your shop’s normal delivery fee applies everywhere.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {s.zones.map((z) => (
                <ZoneRow
                  key={z.id}
                  zone={z}
                  canManage={s.canManageZones}
                  busy={acting === `zone:${z.id}`}
                  onSave={(body) => onUpdate(s.shopId, z.id, body)}
                  onDelete={() => onDelete(s.shopId, z.id)}
                />
              ))}
            </ul>
          )}

          {activeShopId !== null && s.canManageZones && (
            <NewZoneForm
              busy={acting === `zone:new:${s.shopId}`}
              onCreate={(body) => onCreate(s.shopId, body)}
            />
          )}
          {activeShopId === null && s.canManageZones && (
            <p className="mt-3 text-xs text-ink-400">
              Switch to a single shop to add a zone — a boundary belongs to one shop.
            </p>
          )}
          {!s.canManageZones && (
            <p className="mt-3 text-xs text-ink-400">
              You can see these zones but not change them — that needs the “manage shop settings”
              permission, which is separate from delivery.
            </p>
          )}
        </Card>
      ))}
    </div>
  );
}

/**
 * The name, fee and boundary of one zone.
 *
 * Used for both create and edit because `PATCH` takes the same DTO as `POST` — it
 * replaces the zone rather than merging into it, so an edit form that showed only
 * the name would silently rewrite the boundary and drop the fee. Every field is
 * always present and always sent.
 *
 * An empty fee box means "use the shop's normal delivery fee": the key is omitted,
 * and the service writes `feeOverride ?? null`. `0` is a different, deliberate
 * answer — free delivery inside this zone.
 */
function ZoneFields({
  initialName,
  initialFee,
  initialPolygon,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
}: {
  initialName: string;
  initialFee: string;
  initialPolygon: string;
  submitLabel: string;
  busy: boolean;
  onSubmit: (body: UpsertZoneBody) => void;
  onCancel: () => void;
}) {
  const [name, setName] = React.useState(initialName);
  const [fee, setFee] = React.useState(initialFee);
  const [text, setText] = React.useState(initialPolygon);

  const parsed = React.useMemo(() => parsePolygonText(text), [text]);
  const feeTrimmed = fee.trim();
  const feeNumber = feeTrimmed === "" ? null : Number(feeTrimmed);
  const feeOk = feeNumber === null || (Number.isInteger(feeNumber) && feeNumber >= 0);
  const nameOk = name.trim().length >= 2;
  const ready = nameOk && feeOk && parsed.error === null;

  return (
    <div className="rounded-xl bg-ink-50/70 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-ink-600">Zone name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New Baneshwor"
            className="h-10 w-full rounded-xl border border-ink-200 px-3 text-sm outline-none focus:border-crimson-300"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-ink-600">
            Delivery fee inside this zone
          </span>
          <input
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            inputMode="numeric"
            placeholder="Leave empty for your normal fee"
            className="h-10 w-full rounded-xl border border-ink-200 px-3 text-sm outline-none focus:border-crimson-300"
          />
        </label>
      </div>

      <label className="mt-2 block">
        <span className="mb-1 block text-xs font-semibold text-ink-600">
          Boundary — one point per line, as “latitude, longitude”
        </span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          spellCheck={false}
          placeholder={"27.6910, 85.3400\n27.6935, 85.3480\n27.6880, 85.3495"}
          className="w-full rounded-xl border border-ink-200 px-3 py-2 font-mono text-xs outline-none focus:border-crimson-300"
        />
      </label>
      {/* No map, and no pretence of one. The console has no map surface yet, so a
          boundary is typed in the shape the endpoint actually takes. */}
      <p className="mt-1 text-xs text-ink-400">
        At least 3 points. There’s no map to draw on yet — take the corners from your phone’s map
        app and paste them here.
      </p>

      {parsed.error && text.trim().length > 0 && (
        <InlineError message={parsed.error} className="mt-2" />
      )}
      {!feeOk && (
        <InlineError message="A delivery fee must be a whole number of rupees, or empty." className="mt-2" />
      )}
      {parsed.error === null && (
        <p className="mt-2 text-xs text-ink-500">
          {num(parsed.points.length)} points read.
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={busy || !ready}
          onClick={() =>
            onSubmit({
              name: name.trim(),
              polygon: parsed.points,
              ...(feeNumber !== null ? { feeOverride: feeNumber } : {}),
            })
          }
        >
          {busy ? <Spinner /> : <Check className="h-4 w-4" />} {submitLabel}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function ZoneRow({
  zone: z,
  canManage,
  busy,
  onSave,
  onDelete,
}: {
  zone: DeliveryZone;
  canManage: boolean;
  busy: boolean;
  onSave: (body: UpsertZoneBody) => Promise<boolean>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);

  // `null` is not zero. Zero is free delivery, which a shop may well mean.
  const feeLabel =
    z.feeOverride === null
      ? "Your normal delivery fee"
      : z.feeOverride === 0
        ? "Free delivery here"
        : `${rs(z.feeOverride)} delivery`;

  if (editing) {
    return (
      <li>
        <ZoneFields
          initialName={z.name}
          initialFee={z.feeOverride === null ? "" : String(z.feeOverride)}
          initialPolygon={polygonToText(z.points)}
          submitLabel="Save zone"
          busy={busy}
          onSubmit={async (body) => {
            // Leaving edit mode unmounts `ZoneFields`, and the boundary in it was
            // typed by hand, coordinate by coordinate. Closing before the PATCH lands
            // would mean a refused save destroys that typing with no way back, so the
            // editor stays open until the server has the polygon.
            if (await onSave(body)) setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-ink-50/60 px-3 py-2.5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-ink-900">{z.name}</span>
          <Badge tone={z.feeOverride === 0 ? "green" : "ink"}>{feeLabel}</Badge>
        </div>
        <p className="mt-0.5 text-xs text-ink-400">
          {num(z.pointCount)} points · added {ago(z.createdAt)}
        </p>
        {!z.editable && (
          // Saving means sending the whole polygon back. If we could not read what
          // is stored, an edit would replace the shop's boundary with a guess.
          <p className="mt-1 text-xs text-ink-500">
            This boundary was saved in a form this screen can’t read back, so it can’t be edited
            here without redrawing it. Delete it and add it again to change it.
          </p>
        )}
      </div>

      {canManage && (
        <div className="flex flex-wrap gap-1.5">
          {z.editable && (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)} disabled={busy}>
              Edit
            </Button>
          )}
          {confirming ? (
            <>
              <Button size="sm" variant="danger" onClick={onDelete} disabled={busy}>
                {busy ? <Spinner /> : <Trash2 className="h-4 w-4" />} Delete for good
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
                Keep
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirming(true)} disabled={busy}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

function NewZoneForm({
  busy,
  onCreate,
}: {
  busy: boolean;
  onCreate: (body: UpsertZoneBody) => Promise<boolean>;
}) {
  const [open, setOpen] = React.useState(false);

  if (!open) {
    return (
      <div className="mt-3">
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Add a zone
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <ZoneFields
        initialName=""
        initialFee=""
        initialPolygon=""
        submitLabel="Create zone"
        busy={busy}
        onSubmit={async (body) => {
          // Same reason as the edit form: the polygon only exists inside `ZoneFields`.
          if (await onCreate(body)) setOpen(false);
        }}
        onCancel={() => setOpen(false)}
      />
    </div>
  );
}
