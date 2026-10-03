/**
 * The seller surface of the API, as typed calls and React Query hooks.
 *
 * This is the shop counter on a phone, which is a narrower thing than the seller
 * console in a browser. The console is where a shop is *set up* — photographs,
 * spreadsheets, staff, roles, delivery zones, promotions. This module covers what
 * somebody standing behind a counter with one hand free actually does: watch the
 * order queue, move an order through it, mark a shelf empty, answer a customer,
 * check the money. Endpoints outside that are left out on purpose and each
 * omission says so where a reader would otherwise wonder whether it was
 * forgotten.
 *
 * It is reached as `@gopasal/native-data/seller` and is deliberately **not**
 * re-exported from `./index`. The customer app imports the same package, and a
 * barrel that pulled this file in would put the whole seller surface — every
 * type, every hook — into a bundle shipped to shoppers who can never call any of
 * it.
 *
 * Shapes are declared against what the server actually sends, mirroring the
 * seller console's `apps/web-seller/lib/api/*` rather than being guessed, so the
 * phone and the browser cannot disagree about one wire. Where the type already
 * exists in `@gopasal/api-client` it is imported instead of redeclared.
 *
 * ## Writes do not go through the outbox — with one exception
 *
 * The outbox exists so a customer never loses a tap: a write is put on disk
 * first, attempted second, and replayed when the signal comes back. That is
 * plainly right for *add to cart*. It is plainly wrong for a shop counter, for
 * two reasons that are specific rather than stylistic:
 *
 *  1. **A replayed shop write is not the same write.** An accept queued at 12:04
 *     and sent at 12:14 accepts an order the shopkeeper may by then have decided
 *     to reject, and a stock delta of `-3` replayed after the shelf was counted
 *     again removes three more. A failed write the shopkeeper can see and retry
 *     knowingly is the better failure: they are present, the customer is waiting,
 *     and ten seconds of honesty beats ten minutes of confident wrongness.
 *  2. **The server would not deduplicate it anyway.** `IdempotencyService` is
 *     wired to checkout alone (`orders.controller.ts`); no seller route reads an
 *     `Idempotency-Key`, so the outbox's key buys nothing here and the replay
 *     would land as a second real request. The queue's whole safety argument
 *     rests on that key being honoured.
 *
 * The exception is **sending a message**. `MessagingService.createMessage` looks
 * up `(conversationId, clientMessageId)` inside its transaction and returns the
 * existing row rather than writing a second one, so a replay is provably a
 * no-op; and a reply typed into a phone in a back room with no signal is exactly
 * the intent that must not evaporate. It is queued, with the client id as the
 * outbox key so the two agree on what "the same message" means.
 */
import * as React from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
import type { Paginated, ShopLifecycle } from "@gopasal/api-client/types";
import { STALE, useGopasal } from "./GopasalProvider";
import { usePaged } from "./paged";
import { selectedShopStore, useSelectedShopId } from "./seller-shop";
import {
  isShopScopedKey,
  orderQueryString,
  productQueryString,
  qk,
  reviewQueryString,
  stockDelta,
  transitionBody,
} from "./seller-wire";

export { qk } from "./seller-wire";

export {
  createSelectedShopStore,
  selectedShopStore,
  useSelectedShopId,
  type SelectedShopState,
  type SelectedShopStore,
} from "./seller-shop";

/* ── freshness ────────────────────────────────────────────────────────────── */

/**
 * How long a seller answer is treated as fresh.
 *
 * The provider's `STALE` tiers were chosen for a shopper, and two of them carry
 * over unchanged: a shop's own record is `STALE.mine`, one order is
 * `STALE.orders`. The rest are a different job. A shopkeeper is not browsing on
 * a metered plan between screens; they are watching one screen for work, and the
 * cost of a stale queue is a customer standing in a shop that has not noticed
 * their order.
 */
export const SELLER_STALE = {
  /**
   * The order queue. Short because this is the one number on the phone that is
   * allowed to be late by seconds rather than minutes — and cheap because the
   * socket usually gets there first and this is only the fallback.
   */
  queue: 5_000,
  /**
   * Things a second person on the counter can change while you are looking at
   * them: the catalogue, the rider roster, the message list. A minute is short
   * enough that two people do not work from different pictures for long, and
   * long enough that scrolling a shelf is not a request per row.
   */
  counter: 60_000,
  /**
   * Money and analytics. A settlement window is hours wide and a sales chart is
   * a day's worth of bars; refetching either on a screen focus would be spending
   * a seller's data to redraw the same picture.
   */
  money: 5 * 60_000,
} as const;

/* ── query keys ───────────────────────────────────────────────────────────── */

/**
 * The key factory and the query-string builders live in `./seller-wire`.
 *
 * They are plain functions of their arguments, and this file cannot be loaded
 * off a phone — it imports `react-native` above — so keeping them here would
 * put the one piece of addressing that must never collide between two shops
 * out of reach of every test. `qk` is re-exported at the top of this file, so
 * nothing outside had to change.
 */

/**
 * Drop everything that was an answer about a shop.
 *
 * Used when the counter switches shop. The shop *list* is spared: it is a
 * question about the signed-in seller, it is what the switcher itself renders,
 * and refetching it would blank the menu the shopkeeper is looking at mid-tap.
 */
function invalidateShopScoped(qc: QueryClient): void {
  void qc.invalidateQueries({ predicate: (query) => isShopScopedKey(query.queryKey) });
}

/* ── shared wire enumerations ─────────────────────────────────────────────── */

/** `OrderStatus` in `prisma/schema.prisma`. Terminal: DELIVERED/CANCELLED/REJECTED. */
export type OrderStatus =
  "PLACED" | "ACCEPTED" | "PACKED" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED" | "REJECTED";

export type PaymentMethod = "COD" | "ESEWA" | "KHALTI";
export type PaymentStatus = "PENDING" | "PAID" | "FAILED" | "REFUNDED";

export type DeliveryStatus =
  | "UNASSIGNED"
  | "ASSIGNED"
  | "PICKED_UP"
  | "EN_ROUTE"
  | "DELIVERED"
  | "FAILED"
  | "RETURNING_TO_SHOP"
  | "RETURNED_TO_SHOP";

export type RiderStatus = "OFFLINE" | "ONLINE" | "ON_DELIVERY";
export type VehicleType = "BICYCLE" | "MOTORBIKE" | "SCOOTER" | "WALK" | "VAN";

/* ── shops ────────────────────────────────────────────────────────────────── */

/**
 * One row of `GET /seller/shops` — the whole `Shop` record, plus the caller's
 * role on it, two counts and the storefront readiness block.
 *
 * Nullable columns arrive as `null`, never `undefined`, exactly as Prisma
 * serialises them, so a missing value is a real absence rather than a mapping
 * slip further down.
 *
 * `storefront.blockers` is the answer to the question a seller actually asks —
 * "why can nobody see my shop?" — and it is worth rendering verbatim rather than
 * inferring from `status` and `isOpen`, which between them cannot express
 * "approved, open, and stocking nothing deliverable".
 */
export type SellerShop = {
  id: string;
  slug: string;
  name: string;
  nameNp: string | null;
  description: string | null;
  categoryId: string | null;
  ownerId: string;
  status: ShopLifecycle;
  verified: boolean;

  phone: string | null;
  area: string | null;
  fullAddress: string | null;
  lat: number | null;
  lng: number | null;
  locationAccuracyM: number | null;
  locationCapturedAt: string | null;
  locationCaptureMethod: string | null;
  deliveryRadiusKm: number;

  hours: string | null;
  isOpen: boolean;
  minOrder: number;
  soloMode: boolean;
  codEnabled: boolean;
  onlinePaymentEnabled: boolean;

  coverImage: string | null;
  logoImage: string | null;
  emoji: string | null;

  ratingAvg: number;
  ratingCount: number;

  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  /** Why GoPasal rejected or suspended the shop, in words the owner can act on. */
  statusReason: string | null;

  myRole: { name: string; isPrivileged: boolean };
  _count: { products: number; orders: number };
  storefront: {
    visible: boolean;
    blockers: Array<"APPROVAL" | "VERIFIED_LOCATION" | "DELIVERABLE_PRODUCT">;
    deliverableProductCount: number;
  };
};

/**
 * Every shop this account is an active member of.
 *
 * A bare array, not a page: a seller has a handful of shops, not a page of them.
 * `STALE.mine` because this is the signed-in seller's own membership list, which
 * changes when somebody is added to a branch and not otherwise.
 */
export function useMyShops() {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: qk.shops(),
    staleTime: STALE.mine,
    enabled: Boolean(user),
    queryFn: () => http.request<SellerShop[]>("/seller/shops"),
  });
}

/**
 * The shop this counter is working, reconciled against what the seller may see.
 *
 * Three things happen here that the raw stored id cannot do on its own:
 *
 *  - **A stored shop the seller no longer runs is dropped.** Memberships end.
 *    Keeping the id would mean every screen asking about a shop the API will
 *    answer 403 for, which reads to the shopkeeper as the app being broken.
 *  - **A single shop selects itself.** Most sellers have exactly one, and asking
 *    them to choose it is a screen that exists only to be dismissed.
 *  - **Switching invalidates everything shop-scoped**, because a queue, a
 *    catalogue and a finance summary are all answers about the shop that was
 *    selected a moment ago, and showing them under the new shop's name would be
 *    a lie the cache told on the app's behalf.
 */
export function useSelectedShop() {
  const { shopId: storedId, hydrated } = useSelectedShopId();
  const shops = useMyShops();
  const qc = useQueryClient();

  const list = shops.data;
  const stored = storedId !== null ? (list?.find((s) => s.id === storedId) ?? null) : null;
  const only = list?.length === 1 ? (list[0] ?? null) : null;
  const shop = stored ?? only;

  // Persist the fallbacks so the next launch does not repeat the reasoning, and
  // so a switcher and a queue screen cannot disagree about which shop is live.
  React.useEffect(() => {
    if (!hydrated || !list) return;
    if (stored) return;
    if (only) void selectedShopStore.set(only.id);
    else if (storedId !== null) void selectedShopStore.clear();
  }, [hydrated, list, stored, only, storedId]);

  const select = React.useCallback(
    async (nextShopId: string) => {
      if (selectedShopStore.get() === nextShopId) return;
      await selectedShopStore.set(nextShopId);
      invalidateShopScoped(qc);
    },
    [qc],
  );

  return {
    /** Null until a shop is chosen, or while the shop list is still loading. */
    shopId: shop?.id ?? null,
    shop,
    shops: list ?? [],
    /** False while either the stored id or the shop list is still being read. */
    ready: hydrated && !shops.isPending,
    /** True when the seller has several shops and none has been chosen yet. */
    needsChoice: hydrated && Boolean(list) && list!.length > 1 && !stored,
    select,
    error: shops.error,
    refetch: shops.refetch,
  };
}

/**
 * The two shop settings a counter changes: open/closed and the minimum order.
 *
 * `PATCH /seller/shops/:shopId` takes far more than this — name, address, hours,
 * delivery radius — and the console is where those belong: they are typed once,
 * carefully, sitting down. These two are different in kind. "We're closed" is a
 * decision made at the moment it becomes true, often with a shutter half down,
 * and a minimum order gets raised on a wet afternoon when nobody wants to ride
 * out for eighty rupees.
 *
 * `UpdateShopDto` runs under `forbidNonWhitelisted` with `@OptionalField()` on
 * every key: an unknown key is a 400 naming it, and so is an explicit `null`.
 * Omit a field to leave the column alone. `minOrder` must be a real integer —
 * body validation runs without implicit conversion, so `"200"` is a 400.
 */
export type ShopSettingsPatch = {
  isOpen?: boolean;
  minOrder?: number;
};

/**
 * The bare `Shop` row a settings PATCH answers with.
 *
 * `ShopsService.update` returns `prisma.shop.update(...)` directly, so there is
 * no `myRole`, no `_count` and no `storefront`. It is therefore not a
 * `SellerShop` and must never be spliced into the list — see the refetch in
 * `useShopSettings`.
 */
export type ShopRow = Omit<SellerShop, "myRole" | "_count" | "storefront">;

export function useShopSettings(shopId: string | null | undefined) {
  const { http } = useGopasal();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (patch: ShopSettingsPatch) =>
      http.request<ShopRow>(`/seller/shops/${encodeURIComponent(shopId!)}`, {
        method: "PATCH",
        body: patch,
      }),

    // Optimistic, and only for the switch. A shutter toggle that waits for a
    // round trip gets pressed twice, and the second press closes a shop that was
    // being opened. The rollback is honest: the row goes back to exactly the
    // value the server last confirmed.
    onMutate: async (patch) => {
      if (patch.isOpen === undefined || !shopId) return { previous: undefined };
      await qc.cancelQueries({ queryKey: qk.shops() });
      const previous = qc.getQueryData<SellerShop[]>(qk.shops());
      qc.setQueryData<SellerShop[]>(qk.shops(), (current) =>
        current?.map((s) => (s.id === shopId ? { ...s, isOpen: patch.isOpen! } : s)),
      );
      return { previous };
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) qc.setQueryData(qk.shops(), context.previous);
    },
    // Refetched rather than merged: the response is a bare row, and merging it
    // would blank `myRole`, `_count` and `storefront` on the shop the switcher
    // is rendering.
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.shops() });
    },
  });
}

/* ── orders: the queue ────────────────────────────────────────────────────── */

/** A bare `Order` row: the scalar half of the list, and what every transition answers with. */
export type OrderRow = {
  id: string;
  /** Human-facing code, e.g. `GP-482913`. */
  code: string;
  customerId: string;
  shopId: string;
  status: OrderStatus;

  addressId: string | null;
  /**
   * The delivery snapshot, not a relation. A seller sees the recipient columns
   * the order was placed with and nothing more, so an address edited afterwards
   * cannot rewrite where an order was going.
   */
  recipientName: string;
  recipientPhone: string;
  area: string;
  landmark: string | null;
  fullAddress: string;
  lat: number | null;
  lng: number | null;

  /** Money is whole NPR rupees, not paisa. */
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;

  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;

  couponId: string | null;
  note: string | null;

  placedAt: string;
  acceptedAt: string | null;
  packedAt: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;

  createdAt: string;
  updatedAt: string;
  groupOrderId: string | null;
};

/** One line. Names and units are snapshots, so a rename does not rewrite history. */
export type OrderItem = {
  id: string;
  orderId: string;
  productId: string | null;
  variantId: string | null;
  nameSnapshot: string;
  unitSnapshot: string | null;
  /** Unit price at checkout, whole NPR. There is no `lineTotal` on the wire. */
  price: number;
  qty: number;
};

/** Append-only status history. `note` carries the reject or cancel reason. */
export type OrderEvent = {
  id: string;
  orderId: string;
  status: OrderStatus;
  note: string | null;
  actorId: string | null;
  createdAt: string;
};

/** The rider as it appears nested inside a `Delivery`. */
export type DeliveryRider = {
  id: string;
  userId: string;
  shopId: string | null;
  vehicleType: VehicleType;
  status: RiderStatus;
  lat: number | null;
  lng: number | null;
  heading: number | null;
  speed: number | null;
  accuracy: number | null;
  lastPingAt: string | null;
  createdAt: string;
  updatedAt: string;
  user: { name: string | null; phone: string };
};

/**
 * The delivery leg. Created at checkout, so in practice always present — typed
 * nullable because it is an optional relation and a null must read as "no leg"
 * rather than as a bug.
 */
export type Delivery = {
  id: string;
  orderId: string;
  riderId: string | null;
  status: DeliveryStatus;
  destLat: number | null;
  destLng: number | null;
  distanceMeters: number | null;
  assignedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  failReason: string | null;
  returnStartedAt: string | null;
  returnedAt: string | null;
  returnNote: string | null;
  podNote: string | null;
  hasProofPhoto: boolean;
  codCollected: boolean;
  codAmount: number;
  createdAt: string;
  updatedAt: string;
  rider: DeliveryRider | null;
};

/** One row of `GET /seller/shops/:shopId/orders`. */
export type ShopOrder = OrderRow & {
  items: OrderItem[];
  delivery: Delivery | null;
};

/**
 * `GET /seller/shops/:shopId/orders/:orderId`.
 *
 * `tracking.rider` is non-null only while the order is `OUT_FOR_DELIVERY` *and*
 * the rider has a persisted position; `stale` is true when the last ping is over
 * thirty seconds old. It is a live position, not an estimate — there is no ETA
 * anywhere on the seller side.
 */
export type ShopOrderDetail = OrderRow & {
  shop: {
    id: string;
    name: string;
    slug: string;
    phone: string | null;
    area: string | null;
    lat: number | null;
    lng: number | null;
  };
  items: OrderItem[];
  events: OrderEvent[];
  coupon: { code: string; type: "PERCENT" | "FLAT"; value: number } | null;
  delivery: Delivery | null;
  tracking: {
    status: OrderStatus;
    deliveryStatus: DeliveryStatus | null;
    destination: { lat: number; lng: number } | null;
    origin: { lat: number; lng: number } | null;
    rider: {
      name: string;
      phone: string;
      vehicleType: VehicleType;
      lat: number;
      lng: number;
      heading: number | null;
      speed: number | null;
      lastPingAt: string | null;
      stale: boolean;
    } | null;
  };
};

/** `ORDER_SORTS` in `apps/api/src/modules/orders/dto/orders.dto.ts`. */
export type OrderSort = "newest" | "oldest";

/**
 * Everything `ListShopOrdersQueryDto` accepts, and nothing else.
 *
 * `status` is a list because a tab is a status group rather than one status —
 * "in progress" is `ACCEPTED`, `PACKED` and `OUT_FOR_DELIVERY` together. The API
 * takes them comma-separated and validates each against the enum, so an unknown
 * value is a 400 rather than a silently empty queue. `limit` is capped at 100.
 */
export type OrderQuery = {
  page?: number;
  limit?: number;
  /** Matches order code, recipient name or delivery area, case-insensitively. */
  q?: string;
  status?: OrderStatus[];
  sort?: OrderSort;
};

/**
 * The counts the API returns beside every page, over the **whole shop queue**.
 *
 * Deliberately unaffected by `status` and `q`: these are claims about the shop,
 * and a "needs action" count that fell to zero because the shopkeeper tapped the
 * Delivered tab would be a lie about work still waiting.
 *
 * `codOutstanding` is rupees of cash-on-delivery across orders that have not
 * reached a terminal state, summed from the order totals. There is no ledger
 * behind it, so it must never be shown as a payout figure.
 */
export type OrderQueueSummary = {
  total: number;
  /** `PLACED` — waiting for the shop to accept or reject. */
  needsAction: number;
  /** `ACCEPTED`, `PACKED` or `OUT_FOR_DELIVERY`. */
  inProgress: number;
  delivered: number;
  /** `REJECTED` or `CANCELLED`. */
  closed: number;
  codOutstanding: number;
};

export type OrderPage = Paginated<ShopOrder> & { summary: OrderQueueSummary };

/**
 * The order queue, filtered, searched and sorted by the server.
 *
 * The one read on this phone that must feel immediate, so it gets the shortest
 * `staleTime` in the file and a poll as a floor. The poll is a fallback, not the
 * mechanism: `useShopRealtime` pushes an invalidation the moment an order
 * arrives, and a screen that is watching passes `live` so the polling stops and
 * the queue costs one request per change instead of four per minute.
 *
 * `poll` is the screen's to give for the same reason the customer app's
 * conversation list takes one: expo-router keeps screens mounted behind the one
 * on top, and a hook that polled unconditionally would keep three screens' worth
 * of requests in the air.
 */
export function useShopOrders(
  shopId: string | null | undefined,
  query: OrderQuery = {},
  options?: { poll?: boolean; live?: boolean },
) {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: qk.orders(shopId ?? "", query),
    staleTime: SELLER_STALE.queue,
    enabled: Boolean(shopId) && Boolean(user),
    refetchInterval: options?.poll && !options.live ? 15_000 : false,
    refetchIntervalInBackground: false,
    queryFn: () =>
      http.request<OrderPage>(
        `/seller/shops/${encodeURIComponent(shopId!)}/orders${orderQueryString(query)}`,
      ),
  });
}

/** {@link useShopOrders}, readable to the end — for the finished orders. */
export function useShopOrderPages(shopId: string | null | undefined, query: OrderQuery = {}) {
  const { http, user } = useGopasal();
  return usePaged<ShopOrder, OrderPage>({
    enabled: Boolean(shopId) && Boolean(user),
    staleTime: SELLER_STALE.queue,
    key: (page) => qk.orders(shopId ?? "", { ...query, page }),
    fetch: (page) =>
      http.request<OrderPage>(
        `/seller/shops/${encodeURIComponent(shopId!)}/orders${orderQueryString({ ...query, page })}`,
      ),
    resetOn: `${shopId}|${JSON.stringify(query)}`,
  });
}

/** One order in full. 404s if the order belongs to a different shop. */
export function useShopOrder(
  shopId: string | null | undefined,
  orderId: string | null | undefined,
) {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: qk.order(shopId ?? "", orderId ?? ""),
    staleTime: STALE.orders,
    enabled: Boolean(shopId) && Boolean(orderId) && Boolean(user),
    queryFn: () =>
      http.request<ShopOrderDetail>(
        `/seller/shops/${encodeURIComponent(shopId!)}/orders/${encodeURIComponent(orderId!)}`,
      ),
  });
}

/** The five transitions, in the order an order walks through them. */
export type OrderTransition = "accept" | "reject" | "pack" | "dispatch" | "cancel";

/**
 * What each transition sends.
 *
 * `note` is optional on accept, pack and dispatch (`TransitionNoteDto`, max 280
 * characters). `reason` is **required** on reject and cancel — `RejectOrderDto`
 * and `CancelOrderDto` declare it `@IsString() @MinLength(3) @MaxLength(280)`
 * with no `@IsOptional()`, so an empty body is a 400 — and it is stored on
 * `Order.cancelReason` and on the event, which means the customer reads it.
 * These are the whole body under `forbidNonWhitelisted`; a sixth key is a 400.
 */
export type TransitionInput =
  | { orderId: string; action: "accept" | "pack" | "dispatch"; note?: string }
  | { orderId: string; action: "reject" | "cancel"; reason: string };

/** The status each transition lands on, for the optimistic patch below. */
const TRANSITION_RESULT: Record<OrderTransition, OrderStatus> = {
  accept: "ACCEPTED",
  reject: "REJECTED",
  pack: "PACKED",
  dispatch: "OUT_FOR_DELIVERY",
  cancel: "CANCELLED",
};

/**
 * Moving an order through the queue.
 *
 * Optimistic, and this is the case the technique was invented for: the
 * shopkeeper taps *Accept* with a customer in front of them, and the card has to
 * leave the "new" tab in that same moment or the tap gets repeated. Only
 * `status` is patched — `acceptedAt`, the event row and the delivery leg all
 * come from the refetch, and inventing timestamps here would put a time on the
 * screen that the receipt later disagrees with.
 *
 * The rollback is honest because the transitions really do fail in ways a
 * shopkeeper needs to see: `accept` is legal from `PLACED` only, so an order the
 * customer cancelled a second ago is a 400; `dispatch` is a 400 with "Assign a
 * rider before dispatching" until one is assigned; `cancel` is refused once the
 * order is out. In every case the card returns to the state the server confirmed
 * and the error text is the thing worth showing.
 *
 * Each transition answers with a bare `OrderRow` — no items, no delivery, no
 * events — so nothing is merged; the affected reads are invalidated instead.
 */
export function useOrderTransitions(shopId: string | null | undefined) {
  const { http } = useGopasal();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: TransitionInput) =>
      // The body's shape is `transitionBody` in `./seller-wire`, where it can be
      // tested: `reason` is required on reject and cancel, and a key the DTO
      // does not declare is a 400 under `forbidNonWhitelisted`.
      http.request<OrderRow>(
        `/seller/shops/${encodeURIComponent(shopId!)}/orders/${encodeURIComponent(input.orderId)}/${input.action}`,
        { method: "POST", body: transitionBody(input) },
      ),

    onMutate: async (input) => {
      if (!shopId) return { previousPages: [], previousDetail: undefined };
      const listFilter = { queryKey: qk.ordersRoot(shopId) };
      const detailKey = qk.order(shopId, input.orderId);
      await Promise.all([qc.cancelQueries(listFilter), qc.cancelQueries({ queryKey: detailKey })]);

      const previousPages = qc.getQueriesData<OrderPage>(listFilter);
      const previousDetail = qc.getQueryData<ShopOrderDetail>(detailKey);
      const next = TRANSITION_RESULT[input.action];

      qc.setQueriesData<OrderPage>(listFilter, (page) =>
        page
          ? {
              ...page,
              data: page.data.map((order) =>
                order.id === input.orderId ? { ...order, status: next } : order,
              ),
            }
          : page,
      );
      // The summary counts are left alone on purpose. They are shop-wide facts
      // and the arithmetic that keeps them true — which bucket an order leaves,
      // which it joins, what `codOutstanding` does when an order is cancelled —
      // is the server's, and a second implementation here would be wrong in a
      // way nobody would notice until a card disagreed with the list under it.
      qc.setQueryData<ShopOrderDetail>(detailKey, (order) =>
        order ? { ...order, status: next } : order,
      );

      return { previousPages, previousDetail };
    },

    onError: (_error, input, context) => {
      if (!shopId) return;
      for (const [key, page] of context?.previousPages ?? []) {
        if (page) qc.setQueryData(key, page);
      }
      if (context?.previousDetail) {
        qc.setQueryData(qk.order(shopId, input.orderId), context.previousDetail);
      }
    },

    onSettled: (_data, _error, input) => {
      if (!shopId) return;
      void qc.invalidateQueries({ queryKey: qk.ordersRoot(shopId) });
      void qc.invalidateQueries({ queryKey: qk.order(shopId, input.orderId) });
    },
  });
}

/* ── orders: live ─────────────────────────────────────────────────────────── */

/** `shop:order` — a new order has landed in this shop's queue. */
type ShopOrderEvent = { orderId: string; code: string; total: number; at: string };

/** `shop:order:status` — an order moved, possibly because a colleague moved it. */
type ShopOrderStatusEvent = {
  orderId: string;
  code: string;
  from: OrderStatus;
  to: OrderStatus;
  at: string;
};

/**
 * Socket payloads arrive as `unknown` and are narrowed before use.
 *
 * Not ceremony: this is the one input to the module that no type checker ever
 * saw. A gateway on an older deployment, a payload renamed on the way through a
 * Redis adapter, or a reconnect to a different API version all produce an object
 * that TypeScript would happily have called a `ShopOrderEvent`. Both hooks only
 * ever read `orderId` and `at`, so those are what is checked.
 */
function isShopOrderEvent(value: unknown): value is ShopOrderEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  return typeof event.orderId === "string";
}

function isShopOrderStatusEvent(value: unknown): value is ShopOrderStatusEvent {
  return isShopOrderEvent(value) && typeof (value as Record<string, unknown>).to === "string";
}

function eventAt(value: unknown): string {
  const at = (value as Record<string, unknown>).at;
  // The server stamps this; a payload without one is still a real event, and a
  // local clock is a better answer than a blank timestamp beside "watching".
  return typeof at === "string" ? at : new Date().toISOString();
}

export type ShopRealtimeState = {
  /** True while a socket is connected *and* subscribed to this shop's room. */
  live: boolean;
  /**
   * When a new order last arrived over the socket, or null since this screen
   * started watching. Movement on existing orders does not set it: the question
   * a counter asks is "has anything come in", and a colleague packing an order
   * is not that.
   */
  lastOrderAt: string | null;
};

function realtimeOrigin(apiOrigin: string): string | null {
  try {
    return new URL(apiOrigin).origin;
  } catch {
    return null;
  }
}

/**
 * The queue, live.
 *
 * The gateway has a room per shop (`shop:subscribe`), gated on the same
 * `orders.view` permission as the list itself — a socket is not a second, looser
 * way into the same data — and it pushes `shop:order` when an order is placed
 * and `shop:order:status` when one moves. Both mean the same thing here: the
 * cached queue is out of date, refetch it.
 *
 * Why the events are not applied to the cache the way `useOrderRealtime` applies
 * a rider position: a position is the whole fact, whereas `{orderId, code, from,
 * to}` is a fraction of an order row — a new order has items, a recipient and a
 * total that the payload does not carry, and patching a status into a page would
 * leave the shop-wide `summary` beside it stale. One invalidation gets the real
 * rows, and on the queue's five-second `staleTime` that is one request.
 *
 * Everything else is `realtime.ts`'s, for the reasons stated there and worth
 * restating because they are load-bearing on a counter phone:
 *
 *  - **It follows the app's lifecycle.** A socket held open behind a locked
 *    screen keeps the radio awake all night for a queue nobody is watching, so
 *    it closes on background and reopens on foreground.
 *  - **It re-reads the token on every reconnect.** The access token is
 *    short-lived and the transport refreshes it in the background; a socket that
 *    cached the token it opened with would authenticate with an expired one and
 *    be refused for the rest of the shift — during which the phone would quietly
 *    stop reporting new orders.
 */
export function useShopRealtime(
  shopId: string | null | undefined,
  enabled = true,
): ShopRealtimeState {
  const { http, session, user } = useGopasal();
  const queryClient = useQueryClient();
  const [live, setLive] = React.useState(false);
  const [lastOrderAt, setLastOrderAt] = React.useState<string | null>(null);
  const [foreground, setForeground] = React.useState(() => AppState.currentState !== "background");

  React.useEffect(() => {
    const sub = AppState.addEventListener("change", (state: AppStateStatus) =>
      setForeground(state !== "background" && state !== "inactive"),
    );
    return () => sub.remove();
  }, []);

  React.useEffect(() => {
    if (!enabled || !shopId || !user || !foreground) {
      setLive(false);
      return;
    }
    const origin = realtimeOrigin(http.origin());
    if (!origin) return;

    let closed = false;
    let socket: Socket | null = null;

    void (async () => {
      // A fresh token, not whatever was in memory when the screen mounted.
      const token = session.get()?.accessToken;
      if (!token || closed) return;

      socket = io(`${origin}/realtime`, {
        auth: { token },
        // Websocket only: React Native has no cookies for the polling transport
        // to carry, and long-polling is the battery cost this hook avoids.
        transports: ["websocket"],
        reconnection: true,
        reconnectionDelay: 900,
        reconnectionDelayMax: 10_000,
      });

      const subscribe = () => {
        socket?.emit("shop:subscribe", { shopId }, (reply: { ok?: boolean } | undefined) =>
          setLive(Boolean(reply?.ok)),
        );
      };

      socket.on("connect", subscribe);
      socket.on("disconnect", () => setLive(false));
      socket.on("unauthorized", () => setLive(false));
      socket.on("connect_error", () => setLive(false));

      socket.on("shop:order", (event: unknown) => {
        if (!isShopOrderEvent(event)) return;
        setLive(true);
        setLastOrderAt(eventAt(event));
        void queryClient.invalidateQueries({ queryKey: qk.ordersRoot(shopId) });
      });

      socket.on("shop:order:status", (event: unknown) => {
        if (!isShopOrderStatusEvent(event)) return;
        setLive(true);
        void queryClient.invalidateQueries({ queryKey: qk.ordersRoot(shopId) });
        // The detail too, because whoever moved it may not have been this phone:
        // two people on one counter is the case this room exists for.
        void queryClient.invalidateQueries({ queryKey: qk.order(shopId, event.orderId) });
      });

      socket.io.on("reconnect_attempt", () => {
        if (socket) socket.auth = { token: session.get()?.accessToken ?? "" };
      });
    })();

    return () => {
      closed = true;
      setLive(false);
      if (socket) {
        socket.emit("shop:unsubscribe", { shopId });
        socket.disconnect();
      }
    };
  }, [enabled, shopId, user, foreground, http, session, queryClient]);

  return { live, lastOrderAt };
}

/* ── catalogue: quick edits ───────────────────────────────────────────────── */

/** `ProductVariant` in `prisma/schema.prisma`. No `trackStock` of its own. */
export type ProductVariant = {
  id: string;
  productId: string;
  name: string;
  sku: string | null;
  price: number;
  mrp: number | null;
  stock: number;
  isActive: boolean;
};

/**
 * A bare `Product` row: what every write answers with, and the scalar half of the
 * list.
 *
 * `images` are the storage keys the server minted; `imageUrls` is the same list
 * resolved for rendering, in the same order — but it can be *shorter* when a key
 * no longer resolves, so never index one by the other's position.
 */
export type ProductRow = {
  id: string;
  shopId: string;
  name: string;
  nameNp: string | null;
  description: string | null;
  categoryId: string | null;
  /** Whole NPR rupees; the API stores integers. */
  price: number;
  mrp: number | null;
  unit: string;
  images: string[];
  imageUrls: string[];
  tags: string[];
  isActive: boolean;
  trackStock: boolean;
  stock: number;
  createdAt: string;
  updatedAt: string;
};

/** What the seller list returns: the row plus every variant, active or not. */
export type ShopProduct = ProductRow & { variants: ProductVariant[] };

export type ProductStatusFilter = "active" | "hidden";

/**
 * `PRODUCT_STOCK_FILTERS`. There is no `low`: `Product` carries `stock` and
 * `trackStock` and no threshold, so a "running low" tier would be a number this
 * app invented and then attributed to the shop. `untracked` is the shop
 * declining to count, which is not the same as having none.
 */
export type ProductStockFilter = "in" | "out" | "untracked";

export type ProductSort = "recent" | "name" | "price_asc" | "price_desc" | "stock_asc";

/** The sentinel `categoryId` meaning "the shop never assigned one". */
export const NO_CATEGORY = "none";

/** Everything `ListShopProductsQueryDto` accepts. Omitted keys are not sent. */
export type ProductQuery = {
  page?: number;
  limit?: number;
  q?: string;
  /** A category id, or {@link NO_CATEGORY}. */
  categoryId?: string;
  status?: ProductStatusFilter;
  stock?: ProductStockFilter;
  sort?: ProductSort;
};

/**
 * The counts the API returns beside every page, over the **whole shop**.
 *
 * These ignore `q`, `status`, `stock` and `categoryId` by design, so a header
 * that says "4 out of stock" keeps saying something true while the list below it
 * is filtered to one category.
 */
export type CatalogSummary = {
  total: number;
  active: number;
  hidden: number;
  /** Tracked and at or below zero. */
  outOfStock: number;
  /** `trackStock: false`. */
  untracked: number;
  categories: { categoryId: string | null; count: number }[];
};

export type ProductPage = Paginated<ShopProduct> & { summary: CatalogSummary };

/**
 * The shelf, searched and filtered by the server.
 *
 * `SELLER_STALE.counter` rather than `STALE.catalog`: the customer app's ten
 * minutes is right for a catalogue somebody is browsing, and wrong for one two
 * people are editing — a colleague marking the eggs out of stock must show up
 * here in under a minute, not after the screen has been left and returned to.
 */
export function useShopProducts(shopId: string | null | undefined, query: ProductQuery = {}) {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: qk.products(shopId ?? "", query),
    staleTime: SELLER_STALE.counter,
    enabled: Boolean(shopId) && Boolean(user),
    queryFn: () =>
      http.request<ProductPage>(
        `/seller/shops/${encodeURIComponent(shopId!)}/products${productQueryString(query)}`,
      ),
  });
}

/** {@link useShopProducts}, readable to the end — see `./paged`. */
export function useShopProductPages(shopId: string | null | undefined, query: ProductQuery = {}) {
  const { http, user } = useGopasal();
  return usePaged<ShopProduct, ProductPage>({
    enabled: Boolean(shopId) && Boolean(user),
    staleTime: SELLER_STALE.counter,
    key: (page) => qk.products(shopId ?? "", { ...query, page }),
    fetch: (page) =>
      http.request<ProductPage>(
        `/seller/shops/${encodeURIComponent(shopId!)}/products${productQueryString({ ...query, page })}`,
      ),
    resetOn: `${shopId}|${JSON.stringify(query)}`,
  });
}

/**
 * The edits a counter makes, and only those.
 *
 * `UpdateProductDto` accepts a good deal more — description, category, tags,
 * MRP, `trackStock` — and the console is where that belongs. What is here is
 * what a shopkeeper does with a product in their other hand: hide it, count it,
 * correct a price, fix a spelling.
 *
 * Two capabilities are **deliberately absent**, rather than pending:
 *
 *  - **Photographs.** Uploading, deleting and reordering product images are
 *    three multipart routes whose storage keys are the server's to mint, and a
 *    shop's shelf photography is a sit-down job with good light. The console
 *    keeps it.
 *  - **CSV import and export.** The importer is all-or-nothing over a whole
 *    catalogue, its report has to be read carefully before it is applied, and a
 *    spreadsheet is not a thing anyone edits on a phone. The console keeps that
 *    too.
 *
 * Neither is a gap to fill later on this surface; a seller who needs them is
 * already at a desk.
 */
export type ProductQuickEdit = {
  name?: string;
  price?: number;
  isActive?: boolean;
};

export function useProductActions(shopId: string | null | undefined) {
  const { http } = useGopasal();
  const qc = useQueryClient();

  const listFilter = React.useMemo(() => ({ queryKey: qk.productsRoot(shopId ?? "") }), [shopId]);

  /** Patch one product across every cached page of this shop's shelf. */
  const patchLocal = React.useCallback(
    (productId: string, patch: Partial<ShopProduct>) => {
      qc.setQueriesData<ProductPage>(listFilter, (page) =>
        page
          ? {
              ...page,
              data: page.data.map((p) => (p.id === productId ? { ...p, ...patch } : p)),
            }
          : page,
      );
    },
    [qc, listFilter],
  );

  const snapshot = React.useCallback(
    () => qc.getQueriesData<ProductPage>(listFilter),
    [qc, listFilter],
  );

  const restore = React.useCallback(
    (pages: ReturnType<typeof snapshot>) => {
      for (const [key, page] of pages) if (page) qc.setQueryData(key, page);
    },
    [qc],
  );

  // Every write answers with a bare `ProductRow` — no `variants` — so nothing is
  // merged: a shelf row that lost its variants on a successful save would read
  // as data loss.
  const settle = React.useCallback(() => {
    void qc.invalidateQueries(listFilter);
  }, [qc, listFilter]);

  return {
    /**
     * Hide or show a product. The only reversible way to take something off the
     * shelf — `DELETE` is a real row delete and is not offered here.
     *
     * Optimistic: this is a switch, and a switch that does not move under a
     * thumb gets flicked twice.
     */
    setAvailability: useMutation({
      mutationFn: (input: { productId: string; isActive: boolean }) =>
        http.request<ProductRow>(
          `/seller/shops/${encodeURIComponent(shopId!)}/products/${encodeURIComponent(input.productId)}`,
          { method: "PATCH", body: { isActive: input.isActive } },
        ),
      onMutate: async (input) => {
        await qc.cancelQueries(listFilter);
        const previous = snapshot();
        patchLocal(input.productId, { isActive: input.isActive });
        return { previous };
      },
      onError: (_error, _input, context) => restore(context?.previous ?? []),
      onSettled: settle,
    }),

    /**
     * Set the count on the shelf.
     *
     * The route takes a **signed delta**, not a total (`AdjustStockDto.delta`),
     * so the arithmetic happens here — and `from` is a required argument rather
     * than something read out of the cache, because it has to be the number the
     * shopkeeper was looking at when they decided. Two people counting the same
     * shelf then produce two deltas that both apply, which is the honest
     * outcome; a cached total would have silently overwritten one of them.
     *
     * The server clamps the result at zero, and 400s with "Stock tracking is off
     * for this product" when `trackStock` is false — so the screen must offer
     * this only on a tracked product rather than discover it by being refused.
     * Variant stock is not reachable from this route at all; changing it is
     * `PATCH …/variants/:id`, an absolute value, and a console job.
     *
     * Not optimistic. A count is a claim about the world that the server clamps
     * and may refuse, and a number that appeared instantly and then moved would
     * leave the shopkeeper unsure which figure the shelf now carries.
     */
    setStock: useMutation({
      mutationFn: (input: { productId: string; from: number; to: number }) =>
        http.request<ProductRow>(
          `/seller/shops/${encodeURIComponent(shopId!)}/products/${encodeURIComponent(input.productId)}/stock`,
          { method: "POST", body: { delta: stockDelta(input.from, input.to) } },
        ),
      onSettled: settle,
    }),

    /** Correct a price or a name. Both are whole fields; `price` must be an integer. */
    edit: useMutation({
      mutationFn: (input: { productId: string; patch: ProductQuickEdit }) =>
        http.request<ProductRow>(
          `/seller/shops/${encodeURIComponent(shopId!)}/products/${encodeURIComponent(input.productId)}`,
          { method: "PATCH", body: input.patch },
        ),
      onSettled: settle,
    }),
  };
}

/* ── messages ─────────────────────────────────────────────────────────────── */

export type ConversationSender = "CUSTOMER" | "SHOP" | "SYSTEM";

export type ConversationMessage = {
  id: string;
  /** Absent on a bubble that has not reached the server yet. */
  conversationId?: string;
  authorId: string | null;
  sender: ConversationSender;
  body: string;
  clientMessageId: string;
  createdAt: string;
  /** Set by the client only: queued, not yet acknowledged. */
  pending?: boolean;
};

export type ShopConversation = {
  id: string;
  shopId: string;
  customerId: string;
  orderId: string | null;
  kind: "PRE_ORDER" | "ORDER";
  status: "OPEN" | "CLOSED";
  lastMessageAt: string;
  /** From the shop's side: the customer wrote last and nobody has read it. */
  hasUnread: boolean;
  customer: { id: string; name: string | null; avatarUrl: string | null };
  shop: { id: string; name: string; slug: string; emoji: string | null };
  order: { id: string; code: string; status: OrderStatus; placedAt: string } | null;
  lastMessage: ConversationMessage | null;
};

/** The detail carries the newest 200 messages, oldest first. */
export type ShopConversationDetail = Omit<ShopConversation, "lastMessage"> & {
  messages: ConversationMessage[];
};

/**
 * A client id that makes a send safe to repeat.
 *
 * Declared here rather than imported from `./customer`, where the identical
 * function lives: importing it would pull the entire customer surface into the
 * seller bundle, which is the one thing the `./seller` subpath export exists to
 * prevent. Twenty lines of duplication is the cheaper of the two mistakes.
 *
 * The server validates it as a v4 UUID and keys `(conversationId,
 * clientMessageId)` on it, so the same id twice is the same message.
 */
export function newClientMessageId(): string {
  const c = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (c?.randomUUID) return c.randomUUID();
  const hex = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${"89ab"[Math.floor(Math.random() * 4)]}${hex(3)}-${hex(12)}`;
}

/**
 * The shop's inbox.
 *
 * `poll` is the screen's to pass, as everywhere else in this file: a mounted
 * screen three deep in the stack must not keep asking.
 */
export function useShopConversations(
  shopId: string | null | undefined,
  options?: { poll?: boolean },
) {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: qk.conversations(shopId ?? ""),
    staleTime: SELLER_STALE.counter,
    enabled: Boolean(shopId) && Boolean(user),
    refetchInterval: options?.poll ? 15_000 : false,
    refetchIntervalInBackground: false,
    queryFn: () =>
      http.request<Paginated<ShopConversation>>(
        `/seller/shops/${encodeURIComponent(shopId!)}/conversations?page=1&limit=50`,
      ),
  });
}

/** Unread badge for the tab bar, from the list that is already cached. */
export function useUnreadConversations(shopId: string | null | undefined): number {
  const { data } = useShopConversations(shopId);
  return (data?.data ?? []).filter((c) => c.hasUnread).length;
}

export function useShopConversation(
  shopId: string | null | undefined,
  conversationId: string | null | undefined,
  options?: { poll?: boolean },
) {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: qk.conversation(shopId ?? "", conversationId ?? ""),
    staleTime: 5_000,
    enabled: Boolean(shopId) && Boolean(conversationId) && Boolean(user),
    refetchInterval: options?.poll ? 5_000 : false,
    refetchIntervalInBackground: false,
    queryFn: () =>
      http.request<ShopConversationDetail>(
        `/seller/shops/${encodeURIComponent(shopId!)}/conversations/${encodeURIComponent(conversationId!)}`,
      ),
  });
}

/**
 * Replying — the one seller write that goes through the outbox.
 *
 * The reasoning is set out at the top of this file and comes down to two facts
 * about this route and no other: `MessagingService.createMessage` finds an
 * existing `(conversationId, clientMessageId)` inside its transaction and hands
 * that row back rather than writing a second one, so replay is provably a no-op;
 * and a reply is an intent that keeps its meaning while it waits, unlike an
 * accept, a cancel or a stock delta, all of which can be made wrong by the ten
 * minutes they spend in a queue. A shopkeeper who types "on its way, five
 * minutes" in a stockroom with no bars should find it sent when they walk out,
 * not lost.
 *
 * The bubble appears immediately and is marked `pending` until the server
 * confirms it. A chat that shows a message as sent when it is still queued is
 * worse than one that admits it is still trying.
 */
export function useSendShopMessage(
  shopId: string | null | undefined,
  conversationId: string | null | undefined,
) {
  const { outbox } = useGopasal();
  const qc = useQueryClient();
  const detailKey = qk.conversation(shopId ?? "", conversationId ?? "");

  return useMutation({
    mutationFn: (body: string) => {
      const clientMessageId = newClientMessageId();
      return outbox.enqueue<ConversationMessage>({
        path: `/seller/shops/${encodeURIComponent(shopId!)}/conversations/${encodeURIComponent(conversationId!)}/messages`,
        method: "POST",
        body: { body, clientMessageId },
        // The outbox's key and the server's dedup key are the same string, so
        // the two agree about what "the same message" means.
        idempotencyKey: clientMessageId,
        label: "Your reply",
      });
    },

    onMutate: async (body: string) => {
      await qc.cancelQueries({ queryKey: detailKey });
      const optimistic: ConversationMessage = {
        id: `pending-${newClientMessageId()}`,
        authorId: null,
        sender: "SHOP",
        body,
        clientMessageId: "",
        createdAt: new Date().toISOString(),
        pending: true,
      };
      qc.setQueryData<ShopConversationDetail>(detailKey, (current) =>
        current ? { ...current, messages: [...current.messages, optimistic] } : current,
      );
      return { optimisticId: optimistic.id };
    },

    onSettled: () => {
      void qc.invalidateQueries({ queryKey: detailKey });
      void qc.invalidateQueries({ queryKey: qk.conversations(shopId ?? "") });
    },
  });
}

/**
 * Open (or continue) the thread about one order.
 *
 * The server upserts on `(shop, customer, ORDER:<id>)`, so this is the same call
 * whether it is the first message or the fiftieth — there is no "do we already
 * have a thread" request to make first. Straight to `http`, not the outbox:
 * unlike a reply into an existing thread, this is the shop starting a
 * conversation, and the screen needs the answer to navigate into it.
 */
export function useStartOrderConversation(shopId: string | null | undefined) {
  const { http } = useGopasal();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { orderId: string; body: string }) =>
      http.request<ConversationMessage>(
        `/seller/shops/${encodeURIComponent(shopId!)}/conversations/orders/start`,
        {
          method: "POST",
          body: {
            orderId: input.orderId,
            body: input.body,
            clientMessageId: newClientMessageId(),
          },
        },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.conversations(shopId ?? "") });
    },
  });
}

export function useConversationActions(shopId: string | null | undefined) {
  const { http } = useGopasal();
  const qc = useQueryClient();

  const settle = (conversationId: string) => {
    void qc.invalidateQueries({ queryKey: qk.conversation(shopId ?? "", conversationId) });
    void qc.invalidateQueries({ queryKey: qk.conversations(shopId ?? "") });
  };

  return {
    markRead: useMutation({
      mutationFn: (conversationId: string) =>
        http.request<{ ok: true }>(
          `/seller/shops/${encodeURIComponent(shopId!)}/conversations/${encodeURIComponent(conversationId)}/read`,
          { method: "PATCH" },
        ),
      onSuccess: (_data, conversationId) => settle(conversationId),
    }),

    /** Closing is not deleting: a new message from either side reopens the thread. */
    close: useMutation({
      mutationFn: (conversationId: string) =>
        http.request<{ ok: true; status: "CLOSED" }>(
          `/seller/shops/${encodeURIComponent(shopId!)}/conversations/${encodeURIComponent(conversationId)}/close`,
          { method: "PATCH" },
        ),
      onSuccess: (_data, conversationId) => settle(conversationId),
    }),
  };
}

/* ── money ────────────────────────────────────────────────────────────────── */

export type Settlement = {
  id: string;
  code: string;
  shopId: string;
  windowStart: string;
  windowEnd: string;
  onlineSellerPayable: number;
  codCommissionReceivable: number;
  refundAdjustments: number;
  netAmount: number;
  direction: "PAYOUT_TO_SELLER" | "COLLECTION_FROM_SELLER";
  status: "OPEN" | "PAID" | "FAILED";
  payoutMethod: "BANK" | "ESEWA" | "KHALTI" | null;
  payoutDestinationMasked: string | null;
  providerReference: string | null;
  failureReason: string | null;
  completedAt: string | null;
  createdAt: string;
  shop: { id: string; name: string; area: string | null };
  lines: Array<{
    id: string;
    orderFinance: {
      order: {
        id: string;
        code: string;
        paymentMethod: PaymentMethod;
        total: number;
        deliveredAt: string | null;
      };
    };
  }>;
};

export type ShopRefund = {
  id: string;
  code: string;
  amount: number;
  reason: string;
  method: string;
  createdAt: string;
  order: { code: string };
};

/**
 * `GET /seller/shops/:shopId/finance`.
 *
 * The two directions matter and the words are the API's, not this app's:
 * `escrowHeld` is online money taken from customers and not yet released,
 * `onlineReady` is the seller's share of what has been released and not yet
 * settled, and `codCommissionDue` is money the seller owes GoPasal on cash they
 * collected at the door. A settlement can therefore run either way, which is why
 * `direction` exists and why no screen should label this block "earnings".
 */
export type ShopFinance = {
  summary: {
    escrowHeld: number;
    escrowOrders: number;
    onlineReady: number;
    codCommissionDue: number;
    /** Signed: payouts positive, collections negative. */
    openSettlementAmount: number;
  };
  settlements: Settlement[];
  refunds: ShopRefund[];
  /** When the API computed this. Worth showing beside the numbers. */
  generatedAt: string;
};

export function useShopFinance(shopId: string | null | undefined) {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: qk.finance(shopId ?? ""),
    staleTime: SELLER_STALE.money,
    enabled: Boolean(shopId) && Boolean(user),
    queryFn: () =>
      http.request<ShopFinance>(`/seller/shops/${encodeURIComponent(shopId!)}/finance`),
  });
}

/** The only three windows the API accepts; a fourth is a 400. */
export const ANALYTICS_PERIODS = ["7d", "30d", "90d"] as const;
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number];

/** Sums over the window. `averageOrderValue` is null when nothing was delivered. */
export type AnalyticsSummary = {
  /** Delivered money, in rupees. Not take-home: no commission is netted off. */
  sales: number;
  ordersPlaced: number;
  ordersDelivered: number;
  /** CANCELLED + REJECTED. */
  ordersCancelled: number;
  ordersInProgress: number;
  averageOrderValue: number | null;
};

/** Movement against the equal-length window before this one. Null means no basis. */
export type AnalyticsComparison = {
  salesChangePercent: number | null;
  ordersChangePercent: number | null;
  averageOrderValueChangePercent: number | null;
};

/** One Nepal day. A zero is a fact: the shop took no orders that day. */
export type SalesPoint = { date: string; sales: number; orders: number };

export type TopProduct = {
  /** Null once the product row is gone; `name` is then the snapshot it sold as. */
  productId: string | null;
  name: string;
  unitsSold: number;
  /** Line value at snapshotted prices. Not a share of `summary.sales`. */
  revenue: number;
};

export type PaymentSplit = {
  codOrders: number;
  /** Value of *delivered* COD orders — cash due, not cash counted. */
  codCollected: number;
  onlineOrders: number;
  onlineDelivered: number;
};

/** Period-independent snapshot of work in hand. */
export type OpenOrders = {
  total: number;
  awaitingAcceptance: number;
  preparing: number;
  outForDelivery: number;
};

/** No `lowStock`: there is no threshold column anywhere to derive one from. */
export type InventoryHealth = {
  activeProducts: number;
  outOfStockProducts: number;
  outOfStockVariants: number;
  untrackedProducts: number;
};

/**
 * `GET /seller/shops/:shopId/analytics/overview`.
 *
 * Three properties of this payload decide how it may be rendered, and all three
 * are about honesty rather than arithmetic:
 *
 *  - **A day is a Nepal day**, computed by the API at a fixed UTC+05:45, and
 *    `timezone` and `window` come back so a screen can state the boundary rather
 *    than imply one. An order belongs to the day it was *placed*, so a recent
 *    day's bar can still grow.
 *  - **`averageOrderValue` and every `…ChangePercent` are `null`, never 0**, when
 *    the question does not apply. Render nothing, not a zero.
 *  - **`topProducts[].revenue` does not add up to `summary.sales`.** It excludes
 *    the delivery fee and precedes any order-level coupon, which cannot honestly
 *    be split across lines.
 */
export type ShopAnalytics = {
  period: AnalyticsPeriod;
  days: number;
  /** IANA name the API used for day boundaries: `Asia/Kathmandu`. */
  timezone: string;
  window: { from: string; to: string; previousFrom: string; previousTo: string };
  shopIds: string[];
  summary: AnalyticsSummary;
  comparison: AnalyticsComparison;
  salesSeries: SalesPoint[];
  topProducts: TopProduct[];
  payments: PaymentSplit;
  openOrders: OpenOrders;
  inventory: InventoryHealth;
};

/**
 * The shop's numbers.
 *
 * Only the shop-scoped route. `GET /seller/analytics/overview` consolidates every
 * shop the caller may read and is genuinely useful — to an owner at a desk
 * comparing two branches. This phone is one counter, and the shop it is standing
 * in is the only one whose numbers it can act on.
 */
export function useShopAnalytics(
  shopId: string | null | undefined,
  period: AnalyticsPeriod = "7d",
) {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: qk.analytics(shopId ?? "", period),
    staleTime: SELLER_STALE.money,
    enabled: Boolean(shopId) && Boolean(user),
    queryFn: () =>
      http.request<ShopAnalytics>(
        `/seller/shops/${encodeURIComponent(shopId!)}/analytics/overview?period=${period}`,
      ),
  });
}

/* ── riders ───────────────────────────────────────────────────────────────── */

/**
 * One row of `GET /seller/shops/:shopId/riders`.
 *
 * `status` is display-only on this surface: `RiderStatus` is written by the
 * rider's own `PATCH /rider/status` and by the assign and complete transactions,
 * and there is no seller route that sets it. A screen must not offer a control
 * for it.
 */
export type ShopRider = {
  id: string;
  userId: string;
  shopId: string | null;
  vehicleType: VehicleType;
  status: RiderStatus;
  lat: number | null;
  lng: number | null;
  lastPingAt: string | null;
  createdAt: string;
  updatedAt: string;
  user: { name: string | null; phone: string; avatarUrl: string | null };
  /** Deliveries currently ASSIGNED, PICKED_UP or EN_ROUTE. */
  activeDeliveries: number;
  _count: { deliveries: number };
  /** Latest cached ping, or null if this rider has never reported a position. */
  location: {
    lat: number;
    lng: number;
    heading?: number | null;
    speed?: number | null;
    accuracy?: number | null;
    at?: string | null;
  } | null;
};

/**
 * The shop's own rider roster. Self-delivery, so these are the shop's people.
 *
 * Registering and removing riders are not here. Registering upserts a `User`
 * — an unknown phone number gets an account created and a known one has its
 * name overwritten — which is a consequential, undoable write that deserves the
 * console's space to warn about it. The counter picks from the roster.
 */
export function useShopRiders(shopId: string | null | undefined) {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: qk.riders(shopId ?? ""),
    staleTime: SELLER_STALE.counter,
    enabled: Boolean(shopId) && Boolean(user),
    queryFn: () => http.request<ShopRider[]>(`/seller/shops/${encodeURIComponent(shopId!)}/riders`),
  });
}

/**
 * Putting a rider on an order, and taking them off again.
 *
 * Assignment is the step before dispatch, not after: `OrdersService.dispatch`
 * 400s with "Assign a rider before dispatching" while `delivery.riderId` is
 * null, so the screen has to offer this first. Unassigning is legal only while
 * the leg is still `ASSIGNED` — once the rider has picked up, the order is out
 * of the shop's hands.
 *
 * Both answer with a bare `Delivery` row, so the order is refetched rather than
 * patched: the rider's name and phone live on the relation the response omits.
 */
export function useRiderAssignment(shopId: string | null | undefined) {
  const { http } = useGopasal();
  const qc = useQueryClient();

  const settle = (orderId: string) => {
    void qc.invalidateQueries({ queryKey: qk.order(shopId ?? "", orderId) });
    void qc.invalidateQueries({ queryKey: qk.ordersRoot(shopId ?? "") });
    // The roster too: `activeDeliveries` is exactly what decides whether a rider
    // may be given another job, and it has just changed.
    void qc.invalidateQueries({ queryKey: qk.riders(shopId ?? "") });
  };

  return {
    assign: useMutation({
      mutationFn: (input: { orderId: string; riderId: string }) =>
        http.request<Delivery>(
          `/seller/shops/${encodeURIComponent(shopId!)}/orders/${encodeURIComponent(input.orderId)}/assign`,
          { method: "POST", body: { riderId: input.riderId } },
        ),
      onSuccess: (_data, input) => settle(input.orderId),
    }),

    unassign: useMutation({
      mutationFn: (orderId: string) =>
        http.request<{ unassigned: true }>(
          `/seller/shops/${encodeURIComponent(shopId!)}/orders/${encodeURIComponent(orderId)}/unassign`,
          { method: "POST", body: {} },
        ),
      onSuccess: (_data, orderId) => settle(orderId),
    }),
  };
}

/* ── reviews ──────────────────────────────────────────────────────────────── */

/** One review as the seller list returns it: the row plus two thin relations. */
export type ShopReview = {
  id: string;
  /** Null for a review not tied to an order — the column is optional. */
  orderId: string | null;
  shopId: string;
  /** Set when the review is also about one product in the order. */
  productId: string | null;
  customerId: string;
  /** 1–5. */
  rating: number;
  comment: string | null;
  sellerReply: string | null;
  /** When the *customer* wrote it. Nothing records when the shop answered. */
  createdAt: string;
  /** An OTP account may still have no name. */
  customer: { name: string | null } | null;
  order: { code: string } | null;
};

export type ReviewSort = "newest" | "oldest";

/**
 * `?answered=true|false`, as the literal strings the API validates.
 *
 * Not a boolean: query strings are validated with implicit conversion on, which
 * coerces a boolean-typed property with `!!value` — and `!!"false"` is `true`.
 */
export type Answered = "true" | "false";

/** Everything `ListShopReviewsQueryDto` accepts. Omit a field to not filter on it. */
export type ReviewQuery = {
  page?: number;
  limit?: number;
  /** Matches the review comment or the order code — not the customer's name. */
  q?: string;
  answered?: Answered;
  /** 1–5. An empty array is no filter, not "match nothing". */
  rating?: number[];
  sort?: ReviewSort;
};

/**
 * Counts over **every review the shop has**, unaffected by the filters.
 *
 * `averageRating` is `null`, never `0`, when there are no reviews: a shop nobody
 * has reviewed does not have a zero-star rating.
 */
export type ShopReviewSummary = {
  total: number;
  answered: number;
  unanswered: number;
  /** Rated 1 or 2 — the ones worth reading first. */
  lowRated: number;
  averageRating: number | null;
};

export type ReviewPage = Paginated<ShopReview> & { summary: ShopReviewSummary };

export function useShopReviews(shopId: string | null | undefined, query: ReviewQuery = {}) {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: qk.reviews(shopId ?? "", query),
    staleTime: SELLER_STALE.money,
    enabled: Boolean(shopId) && Boolean(user),
    queryFn: () =>
      http.request<ReviewPage>(
        `/seller/shops/${encodeURIComponent(shopId!)}/reviews${reviewQueryString(query)}`,
      ),
  });
}

/** {@link useShopReviews}, readable to the end. */
export function useShopReviewPages(shopId: string | null | undefined, query: ReviewQuery = {}) {
  const { http, user } = useGopasal();
  return usePaged<ShopReview, ReviewPage>({
    enabled: Boolean(shopId) && Boolean(user),
    staleTime: SELLER_STALE.money,
    key: (page) => qk.reviews(shopId ?? "", { ...query, page }),
    fetch: (page) =>
      http.request<ReviewPage>(
        `/seller/shops/${encodeURIComponent(shopId!)}/reviews${reviewQueryString({ ...query, page })}`,
      ),
    resetOn: `${shopId}|${JSON.stringify(query)}`,
  });
}

/** `ReplyReviewDto.reply` is `@MaxLength(1000)`. */
export const REPLY_MAX_LENGTH = 1000;

/**
 * The shop's one public reply.
 *
 * A replace, not a thread: `reply()` writes `sellerReply` with a plain update,
 * so posting again overwrites the previous text, there is no history, and no
 * route removes one. The DTO would accept `""`, but that stores an empty string
 * rather than clearing the column — so a screen should require some text instead
 * of offering a delete it cannot honour.
 *
 * The response is a bare `Review` row — no customer, no order — so the list is
 * refetched rather than patched, or a successful reply would blank the name and
 * the order code beside it.
 */
export function useReplyToReview(shopId: string | null | undefined) {
  const { http } = useGopasal();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { reviewId: string; reply: string }) =>
      http.request<ShopReview>(
        `/seller/shops/${encodeURIComponent(shopId!)}/reviews/${encodeURIComponent(input.reviewId)}/reply`,
        { method: "POST", body: { reply: input.reply } },
      ),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.reviewsRoot(shopId ?? "") });
    },
  });
}
