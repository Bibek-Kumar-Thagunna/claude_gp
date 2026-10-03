import { ForbiddenException, Injectable } from '@nestjs/common';
import type { OrderStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RbacService } from '../../rbac/rbac.service';
import {
  NEPAL_TIMEZONE,
  TOP_PRODUCTS_LIMIT,
  analyticsWindow,
  buildSeries,
  compare,
  paymentSplit,
  summarise,
  summariseByShop,
  summariseGroups,
  topProducts,
  type AnalyticsComparison,
  type AnalyticsPeriod,
  type AnalyticsSummary,
  type PaymentSplit,
  type SalesPoint,
  type ShopSlice,
  type TopProduct,
} from './analytics-window';

/* ------------------------------------------------------------------- Contract */

/** The statuses that mean an order is still someone's problem. */
const OPEN_STATUSES: OrderStatus[] = ['PLACED', 'ACCEPTED', 'PACKED', 'OUT_FOR_DELIVERY'];

/**
 * Work in hand right now, **not** work in the selected window.
 *
 * A seller looking at "90 days" still wants to know how many orders are waiting
 * this minute, and an order placed before the window opened is no less urgent for it.
 * So this block ignores the period entirely, which is why it is a separate object
 * with its own name rather than a field inside `summary`.
 */
export interface OpenOrders {
  total: number;
  /** PLACED — nobody has accepted it yet. */
  awaitingAcceptance: number;
  /** ACCEPTED or PACKED — accepted, not yet dispatched. */
  preparing: number;
  outForDelivery: number;
}

/**
 * What the shop cannot currently sell.
 *
 * There is **no `lowStock`** here, and its absence is deliberate. `Product` carries
 * `trackStock` and `stock` and nothing else — no threshold, no reorder point, no
 * per-product minimum — so any "running low" count would be a number this API chose
 * on the seller's behalf and then presented as their data. `outOfStock` needs no
 * threshold: checkout genuinely refuses those lines.
 *
 * `untrackedProducts` is the honest counterweight: for a product with
 * `trackStock: false` the platform holds no opinion about stock at all, so it can
 * neither be out of stock nor low, and saying how many such products exist is more
 * use than pretending the remainder is the whole catalogue.
 */
export interface InventoryHealth {
  activeProducts: number;
  /** Active, stock-tracked products sitting at or below zero. */
  outOfStockProducts: number;
  /** Active variants at or below zero, on active products. */
  outOfStockVariants: number;
  /** Active products the shop has not asked GoPasal to track. */
  untrackedProducts: number;
}

/**
 * The response both endpoints return.
 *
 * `window` and `timezone` are part of the payload because "7 days" is a claim about
 * a calendar, and the console repeats the boundary back to the seller instead of
 * asking them to trust it. `shopIds` states which shops were actually included —
 * on the consolidated route that is the caller's permitted set, which may be smaller
 * than the shops they can see in the switcher.
 */
export interface AnalyticsOverview {
  period: AnalyticsPeriod;
  days: number;
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
  /** Per-shop split, present only on the consolidated route. */
  byShop?: ShopSlice[];
}

/**
 * Seller analytics: a shop-scoped, date-bounded read over orders the shop already
 * owns.
 *
 * The arithmetic lives in `analytics-window.ts` and is tested without a database.
 * This file's whole job is to fetch exactly the rows that arithmetic needs, scoped to
 * shops the caller may actually see. Splitting it that way means a wrong number is
 * either a query bug or a maths bug, never both at once.
 *
 * Six queries per request, none of them unbounded:
 *
 * 1. the window's orders (narrow select, `shopId in […]`, `placedAt` bounded)
 * 2. the previous window, grouped by status in Postgres — three numbers, not rows
 * 3. the window's *delivered* order items, filtered through the order relation
 * 4. the live names of the products those items point at
 * 5. a status snapshot of currently-open orders (deliberately not window-clipped)
 * 6. four inventory counts
 *
 * Every one of these starts from an index, and from a composite whose leading column
 * is the tenant. `Order(shopId, placedAt)` serves the window read, the previous-window
 * comparison and the delivered-items join; `Order(shopId, status)` serves the
 * open-orders snapshot; `OrderItem(productId)` serves the top-products fold; and
 * `Product(shopId, isActive)` serves three of the four inventory counts. See
 * `migrations/20260826161105_seller_query_indexes` for the query-by-query reasoning.
 * The product fold itself is still done in memory rather than in SQL — at a shop's
 * scale that is cheaper than a `groupBy` plus a name join, and it is what lets a
 * deleted product keep its name snapshot.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  /**
   * One shop. The route is `analytics.view`-gated on `:shopId`, so by the time we get
   * here the guard has already established that this caller may read this shop —
   * including that the shop's lifecycle state allows it.
   */
  async overviewForShop(
    shopId: string,
    period: AnalyticsPeriod,
    now: Date = new Date(),
  ): Promise<AnalyticsOverview> {
    return this.build([shopId], period, now, false);
  }

  /**
   * Every shop this caller may read analytics for, in one request.
   *
   * The console's "All shops" mode needs this, and the brief forbids fanning out —
   * rightly: N requests would be N times the round trips and would still have to be
   * summed in the browser, where a failed one would silently understate the total.
   *
   * Authorisation cannot be delegated to `PermissionsGuard` here, because there is no
   * `:shopId` to resolve and a SHOP-scoped key with no shop context is an
   * unconditional deny. So the route carries no `@RequirePermissions` and the filter
   * happens here instead, against the same `RbacService` the guard uses — which also
   * means a PENDING or REJECTED shop drops out on its own via the lifecycle policy.
   * `GET /seller/shops` already works this way.
   *
   * The two failure modes are told apart on purpose. A caller who belongs to shops
   * but holds `analytics.view` in none of them has a permission problem and is told
   * so. A caller who belongs to no shops at all does not — they simply have no shops,
   * and `shopIds: []` in the response says exactly that without dressing it up as a
   * denial.
   */
  async overviewForSeller(
    userId: string,
    period: AnalyticsPeriod,
    now: Date = new Date(),
  ): Promise<AnalyticsOverview> {
    const ctx = await this.rbac.loadContext(userId);
    const memberOf = [...ctx.shops.keys()];
    const permitted = memberOf.filter((id) => this.rbac.contextCan(ctx, 'analytics.view', id));
    if (memberOf.length > 0 && permitted.length === 0) {
      throw new ForbiddenException('Missing permission: analytics.view');
    }
    return this.build(permitted, period, now, true);
  }

  /**
   * The six queries and the fold over them.
   *
   * `shopIds` is the authorisation boundary and it is applied to every single query,
   * including the product-name lookup that only exists to make labels readable — a
   * product id arrives from this shop's own order items, so re-checking its `shopId`
   * cannot change the answer, and that is exactly why it is cheap insurance against a
   * future refactor making it possible.
   *
   * An empty `shopIds` means the caller has no shops. Running `in: []` six times to
   * learn that would be six round trips for a foregone conclusion, so the summary is
   * folded from empty arrays instead. Every number in that response is the honest
   * result of summarising nothing, and `shopIds: []` says where it came from.
   */
  private async build(
    shopIds: string[],
    period: AnalyticsPeriod,
    now: Date,
    includeByShop: boolean,
  ): Promise<AnalyticsOverview> {
    const w = analyticsWindow(period, now);
    const shell = {
      period: w.period,
      days: w.days,
      timezone: NEPAL_TIMEZONE,
      window: {
        from: w.from.toISOString(),
        to: w.to.toISOString(),
        previousFrom: w.previousFrom.toISOString(),
        previousTo: w.previousTo.toISOString(),
      },
      shopIds,
    };

    if (shopIds.length === 0) {
      const empty: AnalyticsSummary = summarise([]);
      return {
        ...shell,
        summary: empty,
        comparison: compare(empty, empty),
        salesSeries: buildSeries([], w.dayKeys),
        topProducts: [],
        payments: paymentSplit([]),
        openOrders: { total: 0, awaitingAcceptance: 0, preparing: 0, outForDelivery: 0 },
        inventory: {
          activeProducts: 0,
          outOfStockProducts: 0,
          outOfStockVariants: 0,
          untrackedProducts: 0,
        },
        ...(includeByShop ? { byShop: [] } : {}),
      };
    }

    const inShops = { in: shopIds };
    const placedInWindow = { gte: w.from, lt: w.to };

    const [orders, previousGroups, items, openGroups, inventory] = await Promise.all([
      this.prisma.order.findMany({
        where: { shopId: inShops, placedAt: placedInWindow },
        select: {
          shopId: true,
          placedAt: true,
          total: true,
          status: true,
          paymentMethod: true,
          refunds: { where: { status: 'COMPLETED' }, select: { amount: true } },
        },
      }),
      this.prisma.order.groupBy({
        by: ['status'],
        where: { shopId: inShops, placedAt: { gte: w.previousFrom, lt: w.previousTo } },
        _count: { _all: true },
        _sum: { total: true },
      }),
      this.prisma.orderItem.findMany({
        // Filtering through the relation keeps the shop boundary on the order, which
        // is the row that actually carries `shopId`. `OrderItem` has none.
        where: { order: { shopId: inShops, placedAt: placedInWindow, status: 'DELIVERED' } },
        select: { productId: true, nameSnapshot: true, price: true, qty: true },
      }),
      this.prisma.order.groupBy({
        by: ['status'],
        where: { shopId: inShops, status: { in: OPEN_STATUSES } },
        _count: { _all: true },
      }),
      this.inventoryHealth(shopIds),
    ]);

    const names = await this.productNames(shopIds, items);
    const facts = orders.map(({ refunds, ...order }) => ({
      ...order,
      refundAmount: (refunds ?? []).reduce((sum, refund) => sum + refund.amount, 0),
    }));
    const summary = summarise(facts);

    return {
      ...shell,
      summary,
      comparison: compare(summary, summariseGroups(previousGroups)),
      salesSeries: buildSeries(facts, w.dayKeys),
      topProducts: topProducts(items, names, TOP_PRODUCTS_LIMIT),
      payments: paymentSplit(facts),
      openOrders: countOpen(openGroups),
      inventory,
      ...(includeByShop ? { byShop: summariseByShop(facts, shopIds) } : {}),
    };
  }

  /**
   * Display names for the products the window's items point at.
   *
   * `nameSnapshot` is what was sold, and it is what the response falls back to, but it
   * carries the ` — variant` suffix. Grouping three variants of one product under one
   * of their names would be wrong, so the live product name wins when the row is still
   * there. Deleted products keep their snapshot; see `topProducts`.
   */
  private async productNames(
    shopIds: string[],
    items: { productId: string | null }[],
  ): Promise<Map<string, string>> {
    const ids = [...new Set(items.map((i) => i.productId).filter((id): id is string => id !== null))];
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.product.findMany({
      where: { id: { in: ids }, shopId: { in: shopIds } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  /** Four counts, no rows. See {@link InventoryHealth} for why `lowStock` is absent. */
  private async inventoryHealth(shopIds: string[]): Promise<InventoryHealth> {
    const inShops = { in: shopIds };
    const [activeProducts, outOfStockProducts, untrackedProducts, outOfStockVariants] =
      await Promise.all([
        this.prisma.product.count({ where: { shopId: inShops, isActive: true } }),
        this.prisma.product.count({
          where: { shopId: inShops, isActive: true, trackStock: true, stock: { lte: 0 } },
        }),
        this.prisma.product.count({
          where: { shopId: inShops, isActive: true, trackStock: false },
        }),
        this.prisma.productVariant.count({
          // A variant has no `trackStock` flag of its own — checkout always decrements
          // variant stock — so every active variant at zero is genuinely unsellable.
          where: { isActive: true, stock: { lte: 0 }, product: { shopId: inShops, isActive: true } },
        }),
      ]);
    return { activeProducts, outOfStockProducts, untrackedProducts, outOfStockVariants };
  }
}

/** Folds the open-order status snapshot into the three buckets a seller acts on. */
function countOpen(groups: { status: OrderStatus; _count: { _all: number } }[]): OpenOrders {
  let total = 0;
  let awaitingAcceptance = 0;
  let preparing = 0;
  let outForDelivery = 0;
  for (const g of groups) {
    const n = g._count._all;
    total += n;
    if (g.status === 'PLACED') awaitingAcceptance += n;
    else if (g.status === 'ACCEPTED' || g.status === 'PACKED') preparing += n;
    else if (g.status === 'OUT_FOR_DELIVERY') outForDelivery += n;
  }
  return { total, awaitingAcceptance, preparing, outForDelivery };
}
