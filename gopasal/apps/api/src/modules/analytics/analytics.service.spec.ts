import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import type { OrderStatus, PaymentMethod } from '@prisma/client';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { RbacService } from '../../rbac/rbac.service';
import type { ShopLifecycle } from '../../rbac/shop-status.policy';
import { AnalyticsService } from './analytics.service';

/**
 * The query layer, against an in-memory Prisma that *honours* the filters it is given
 * rather than merely recording them.
 *
 * That distinction is the point of this file. A fake that returns a fixed array no
 * matter what `where` it receives would let "shop B's money leaked into shop A's
 * dashboard" pass every test in the suite. So the fake below actually applies
 * `shopId in […]`, the `placedAt` range and the status filters — and every delegate it
 * does not implement throws, so a future query added to the service cannot silently
 * go unasserted.
 *
 * The RBAC half uses the **real** `RbacService`, with only its Prisma reads faked, so
 * the consolidated route is tested against the same permission and shop-lifecycle
 * logic the guard uses in production.
 */

/* ----------------------------------------------------------------- The fixture */

interface SeedItem {
  productId: string | null;
  nameSnapshot: string;
  price: number;
  qty: number;
}

interface SeedOrder {
  shopId: string;
  placedAt: string;
  total: number;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  items?: SeedItem[];
}

interface SeedVariant {
  isActive: boolean;
  stock: number;
}

interface SeedProduct {
  id: string;
  shopId: string;
  name: string;
  isActive: boolean;
  trackStock: boolean;
  stock: number;
  variants?: SeedVariant[];
}

type InFilter = { in: string[] };
type RangeFilter = { gte: Date; lt: Date };

interface OrderWhere {
  shopId: InFilter;
  placedAt?: RangeFilter;
  status?: { in: OrderStatus[] };
}

interface ItemWhere {
  order: { shopId: InFilter; placedAt: RangeFilter; status: OrderStatus };
}

interface ProductWhere {
  shopId?: InFilter;
  id?: InFilter;
  isActive?: boolean;
  trackStock?: boolean;
  stock?: { lte: number };
}

interface VariantWhere {
  isActive: boolean;
  stock: { lte: number };
  product: { shopId: InFilter; isActive: boolean };
}

interface GroupRow {
  status: OrderStatus;
  _count: { _all: number };
  _sum: { total: number | null };
}

/** Every `where` the service issued, so scoping can be asserted directly too. */
interface Journal {
  orderFindMany: OrderWhere[];
  orderGroupBy: OrderWhere[];
  itemFindMany: ItemWhere[];
  productFindMany: ProductWhere[];
  productCount: ProductWhere[];
  variantCount: VariantWhere[];
}

function inRange(at: Date, range?: RangeFilter): boolean {
  if (!range) return true;
  return at.getTime() >= range.gte.getTime() && at.getTime() < range.lt.getTime();
}

function fakePrisma(
  orders: SeedOrder[],
  products: SeedProduct[],
): { prisma: PrismaService; journal: Journal } {
  const journal: Journal = {
    orderFindMany: [],
    orderGroupBy: [],
    itemFindMany: [],
    productFindMany: [],
    productCount: [],
    variantCount: [],
  };

  const matchOrders = (where: OrderWhere): SeedOrder[] =>
    orders.filter(
      (o) =>
        where.shopId.in.includes(o.shopId) &&
        inRange(new Date(o.placedAt), where.placedAt) &&
        (where.status === undefined || where.status.in.includes(o.status)),
    );

  const prisma = {
    order: {
      findMany: (args: { where: OrderWhere }) => {
        journal.orderFindMany.push(args.where);
        return Promise.resolve(
          matchOrders(args.where).map((o) => ({
            shopId: o.shopId,
            placedAt: new Date(o.placedAt),
            total: o.total,
            status: o.status,
            paymentMethod: o.paymentMethod,
          })),
        );
      },
      groupBy: (args: { where: OrderWhere; _sum?: { total: true } }) => {
        journal.orderGroupBy.push(args.where);
        const buckets = new Map<OrderStatus, GroupRow>();
        for (const o of matchOrders(args.where)) {
          const row = buckets.get(o.status) ?? {
            status: o.status,
            _count: { _all: 0 },
            _sum: { total: 0 },
          };
          row._count._all += 1;
          row._sum.total = (row._sum.total ?? 0) + o.total;
          buckets.set(o.status, row);
        }
        return Promise.resolve([...buckets.values()]);
      },
    },
    orderItem: {
      findMany: (args: { where: ItemWhere }) => {
        journal.itemFindMany.push(args.where);
        const { shopId, placedAt, status } = args.where.order;
        return Promise.resolve(
          orders
            .filter(
              (o) =>
                shopId.in.includes(o.shopId) &&
                inRange(new Date(o.placedAt), placedAt) &&
                o.status === status,
            )
            .flatMap((o) => o.items ?? []),
        );
      },
    },
    product: {
      findMany: (args: { where: ProductWhere }) => {
        journal.productFindMany.push(args.where);
        const { id, shopId } = args.where;
        return Promise.resolve(
          products
            .filter(
              (p) =>
                (id === undefined || id.in.includes(p.id)) &&
                (shopId === undefined || shopId.in.includes(p.shopId)),
            )
            .map((p) => ({ id: p.id, name: p.name })),
        );
      },
      count: (args: { where: ProductWhere }) => {
        journal.productCount.push(args.where);
        const w = args.where;
        return Promise.resolve(
          products.filter(
            (p) =>
              (w.shopId === undefined || w.shopId.in.includes(p.shopId)) &&
              (w.isActive === undefined || p.isActive === w.isActive) &&
              (w.trackStock === undefined || p.trackStock === w.trackStock) &&
              (w.stock === undefined || p.stock <= w.stock.lte),
          ).length,
        );
      },
    },
    productVariant: {
      count: (args: { where: VariantWhere }) => {
        journal.variantCount.push(args.where);
        const w = args.where;
        let n = 0;
        for (const p of products) {
          if (!w.product.shopId.in.includes(p.shopId)) continue;
          if (p.isActive !== w.product.isActive) continue;
          for (const v of p.variants ?? []) {
            if (v.isActive === w.isActive && v.stock <= w.stock.lte) n += 1;
          }
        }
        return Promise.resolve(n);
      },
    },
  };

  // Anything the service reaches for that is not modelled above must fail loudly
  // rather than return undefined and be quietly summarised as a zero.
  const guarded = new Proxy(prisma, {
    get(target, key: string) {
      if (!(key in target)) throw new Error(`unexpected prisma delegate: ${String(key)}`);
      return target[key as keyof typeof target];
    },
  });

  return { prisma: guarded as unknown as PrismaService, journal };
}

/* -------------------------------------------------------------------- The RBAC */

interface SeedMembership {
  shopId: string;
  owner?: boolean;
  perms?: string[];
  status?: ShopLifecycle;
}

/** The real RbacService, with only its two membership queries faked. */
function realRbac(memberships: SeedMembership[]): RbacService {
  const prisma = {
    platformMembership: { findUnique: () => Promise.resolve(null) },
    shopMembership: {
      findMany: () =>
        Promise.resolve(
          memberships.map((m) => ({
            shopId: m.shopId,
            role: {
              isPrivileged: m.owner ?? false,
              permissions: (m.perms ?? []).map((permissionKey) => ({ permissionKey })),
            },
            shop: { status: m.status ?? 'ACTIVE' },
          })),
        ),
    },
  };
  return new RbacService(prisma as unknown as PrismaService);
}

/* --------------------------------------------------------------------- Fixture */

const NOW = new Date('2026-08-26T10:00:00Z'); // 15:45 Kathmandu, 26 Aug

const ORDERS: SeedOrder[] = [
  // shop A, inside the 7-day window (20–26 Aug NPT)
  {
    shopId: 'A',
    placedAt: '2026-08-24T06:00:00Z',
    total: 1200,
    status: 'DELIVERED',
    paymentMethod: 'COD',
    items: [{ productId: 'pA', nameSnapshot: 'Rice — 5 kg', price: 600, qty: 2 }],
  },
  {
    shopId: 'A',
    placedAt: '2026-08-25T06:00:00Z',
    total: 800,
    status: 'DELIVERED',
    paymentMethod: 'ESEWA',
    items: [{ productId: 'pA', nameSnapshot: 'Rice — 1 kg', price: 400, qty: 2 }],
  },
  {
    shopId: 'A',
    placedAt: '2026-08-26T04:00:00Z',
    total: 500,
    status: 'PLACED',
    paymentMethod: 'COD',
    items: [{ productId: 'pB', nameSnapshot: 'Oil', price: 500, qty: 1 }],
  },
  // shop A, previous window (13–19 Aug NPT)
  {
    shopId: 'A',
    placedAt: '2026-08-17T06:00:00Z',
    total: 1000,
    status: 'DELIVERED',
    paymentMethod: 'COD',
  },
  // shop A, far outside every window
  {
    shopId: 'A',
    placedAt: '2026-05-01T06:00:00Z',
    total: 99_999,
    status: 'DELIVERED',
    paymentMethod: 'COD',
    items: [{ productId: 'pA', nameSnapshot: 'Rice — 5 kg', price: 99_999, qty: 1 }],
  },
  // shop B — another seller entirely. None of this may ever appear under shop A.
  {
    shopId: 'B',
    placedAt: '2026-08-24T06:00:00Z',
    total: 7777,
    status: 'DELIVERED',
    paymentMethod: 'COD',
    items: [{ productId: 'pZ', nameSnapshot: 'Somebody else’s stock', price: 7777, qty: 1 }],
  },
];

const PRODUCTS: SeedProduct[] = [
  {
    id: 'pA',
    shopId: 'A',
    name: 'Rice',
    isActive: true,
    trackStock: true,
    stock: 0,
    variants: [
      { isActive: true, stock: 0 },
      { isActive: true, stock: 4 },
      { isActive: false, stock: 0 },
    ],
  },
  { id: 'pB', shopId: 'A', name: 'Mustard oil', isActive: true, trackStock: false, stock: 0 },
  { id: 'pC', shopId: 'A', name: 'Retired', isActive: false, trackStock: true, stock: 0 },
  {
    id: 'pZ',
    shopId: 'B',
    name: 'Somebody else’s product',
    isActive: true,
    trackStock: true,
    stock: 0,
    variants: [{ isActive: true, stock: 0 }],
  },
];

const serviceFor = (orders: SeedOrder[] = ORDERS, products: SeedProduct[] = PRODUCTS) => {
  const { prisma, journal } = fakePrisma(orders, products);
  return { journal, prisma, make: (rbac: RbacService) => new AnalyticsService(prisma, rbac) };
};

/* ----------------------------------------------------------------------- Tests */

describe('AnalyticsService.overviewForShop', () => {
  it('reports an empty shop as empty, without inventing an average', async () => {
    const { make } = serviceFor([], []);
    const out = await make(realRbac([])).overviewForShop('A', '7d', NOW);
    assert.equal(out.summary.sales, 0);
    assert.equal(out.summary.ordersPlaced, 0);
    assert.equal(out.summary.averageOrderValue, null);
    assert.equal(out.comparison.salesChangePercent, null);
    assert.deepEqual(out.topProducts, []);
    assert.equal(out.salesSeries.length, 7); // seven real days, all genuinely zero
    assert.equal(out.byShop, undefined); // single-shop route has nothing to split
  });

  it('summarises a shop with orders, on delivered money and Nepal days', async () => {
    const { make } = serviceFor();
    const out = await make(realRbac([])).overviewForShop('A', '7d', NOW);
    assert.equal(out.period, '7d');
    assert.equal(out.timezone, 'Asia/Kathmandu');
    assert.equal(out.summary.sales, 2000); // 1200 + 800; the PLACED 500 is not money yet
    assert.equal(out.summary.ordersPlaced, 3);
    assert.equal(out.summary.ordersDelivered, 2);
    assert.equal(out.summary.ordersInProgress, 1);
    assert.equal(out.summary.averageOrderValue, 1000);
    assert.equal(out.comparison.salesChangePercent, 100); // 2000 against last week's 1000
    assert.equal(out.comparison.ordersChangePercent, 200);
  });

  it('drops orders outside the window instead of stretching to reach them', async () => {
    const { make } = serviceFor();
    const out = await make(realRbac([])).overviewForShop('A', '7d', NOW);
    // The May order is 99,999 — if the date bound leaked, every figure would show it.
    assert.equal(out.summary.sales, 2000);
    assert.equal(
      out.topProducts.some((p) => p.revenue >= 99_999),
      false,
    );
    const dated = out.salesSeries.map((p) => p.date);
    assert.equal(dated.at(0), '2026-08-20');
    assert.equal(dated.at(-1), '2026-08-26');
  });

  it('never lets another shop’s orders, items or stock into the answer', async () => {
    const { make, journal } = serviceFor();
    const out = await make(realRbac([])).overviewForShop('A', '7d', NOW);
    assert.equal(out.shopIds.length, 1);
    assert.equal(out.summary.sales, 2000); // shop B delivered 7777 on the same day
    assert.equal(
      out.topProducts.some((p) => p.productId === 'pZ'),
      false,
    );
    // …and every query that ran was bounded to shop A, not merely the ones whose
    // output happened to be checked above.
    for (const where of journal.orderFindMany) assert.deepEqual(where.shopId, { in: ['A'] });
    for (const where of journal.orderGroupBy) assert.deepEqual(where.shopId, { in: ['A'] });
    for (const where of journal.itemFindMany) {
      assert.deepEqual(where.order.shopId, { in: ['A'] });
    }
    for (const where of journal.productFindMany) assert.deepEqual(where.shopId, { in: ['A'] });
    for (const where of journal.productCount) assert.deepEqual(where.shopId, { in: ['A'] });
    for (const where of journal.variantCount) {
      assert.deepEqual(where.product.shopId, { in: ['A'] });
    }
  });

  it('builds top products from delivered lines only, under the live product name', async () => {
    const { make } = serviceFor();
    const out = await make(realRbac([])).overviewForShop('A', '7d', NOW);
    assert.equal(out.topProducts.length, 1); // the PLACED order's line does not count
    assert.deepEqual(out.topProducts[0], {
      productId: 'pA',
      name: 'Rice', // not "Rice — 5 kg": two variants folded into one product
      unitsSold: 4,
      revenue: 600 * 2 + 400 * 2,
    });
  });

  it('reports COD as cash due on delivered COD orders, and nothing more', async () => {
    const { make } = serviceFor();
    const out = await make(realRbac([])).overviewForShop('A', '7d', NOW);
    assert.deepEqual(out.payments, {
      codOrders: 2, // the delivered one and the still-placed one
      codCollected: 1200, // only the delivered one is cash
      onlineOrders: 1,
      onlineDelivered: 800,
    });
  });

  it('counts open orders regardless of the window, because they are open now', async () => {
    const { make, journal } = serviceFor();
    const out = await make(realRbac([])).overviewForShop('A', '90d', NOW);
    assert.deepEqual(out.openOrders, {
      total: 1,
      awaitingAcceptance: 1,
      preparing: 0,
      outForDelivery: 0,
    });
    // The snapshot query filters on status and deliberately carries no date bound.
    const snapshot = journal.orderGroupBy.find((w) => w.status !== undefined);
    assert.ok(snapshot, 'expected a status-filtered groupBy');
    assert.equal(snapshot.placedAt, undefined);
    assert.deepEqual(snapshot.status?.in, ['PLACED', 'ACCEPTED', 'PACKED', 'OUT_FOR_DELIVERY']);
  });

  it('counts stock it can speak for, and says how much it cannot', async () => {
    const { make } = serviceFor();
    const out = await make(realRbac([])).overviewForShop('A', '7d', NOW);
    assert.deepEqual(out.inventory, {
      activeProducts: 2, // pA and pB; the retired pC is not for sale
      outOfStockProducts: 1, // pA, tracked and at zero
      untrackedProducts: 1, // pB, which GoPasal holds no stock opinion about
      outOfStockVariants: 1, // pA's zero variant; the inactive one does not count
    });
    assert.equal('lowStock' in out.inventory, false); // there is no threshold to use
  });

  it('states the window it measured, in instants, so the console need not guess', async () => {
    const { make } = serviceFor();
    const out = await make(realRbac([])).overviewForShop('A', '30d', NOW);
    assert.equal(out.days, 30);
    assert.equal(out.window.to, '2026-08-26T18:15:00.000Z'); // 27 Aug 00:00 NPT
    assert.equal(out.window.previousTo, out.window.from);
    assert.equal(out.salesSeries.length, 30);
  });
});

describe('AnalyticsService.overviewForSeller', () => {
  it('covers every shop the caller may read analytics for, in one pass', async () => {
    const { make, journal } = serviceFor();
    const rbac = realRbac([
      { shopId: 'A', perms: ['analytics.view'] },
      { shopId: 'B', owner: true },
    ]);
    const out = await make(rbac).overviewForSeller('u1', '7d', NOW);
    assert.deepEqual(out.shopIds.sort(), ['A', 'B']);
    assert.equal(out.summary.sales, 2000 + 7777);
    // One fetch, not one per shop: the brief's "do not fan out" made literal.
    assert.equal(journal.orderFindMany.length, 1);
    assert.equal(out.byShop?.length, 2);
    assert.equal(out.byShop?.find((s) => s.shopId === 'A')?.summary.sales, 2000);
    assert.equal(out.byShop?.find((s) => s.shopId === 'B')?.summary.sales, 7777);
  });

  it('leaves out a shop where the caller holds dashboard.view but not analytics.view', async () => {
    const { make } = serviceFor();
    const rbac = realRbac([
      { shopId: 'A', perms: ['analytics.view'] },
      { shopId: 'B', perms: ['dashboard.view', 'orders.view'] },
    ]);
    const out = await make(rbac).overviewForSeller('u1', '7d', NOW);
    assert.deepEqual(out.shopIds, ['A']);
    assert.equal(out.summary.sales, 2000); // shop B's 7777 is not theirs to see
  });

  it('leaves out a shop that is not yet approved, because analytics is not prepare-only', async () => {
    const { make } = serviceFor();
    const rbac = realRbac([
      { shopId: 'A', owner: true },
      { shopId: 'B', owner: true, status: 'PENDING' },
    ]);
    const out = await make(rbac).overviewForSeller('u1', '7d', NOW);
    assert.deepEqual(out.shopIds, ['A']);
  });

  it('refuses a caller who has shops but analytics.view in none of them', async () => {
    const { make } = serviceFor();
    const rbac = realRbac([{ shopId: 'A', perms: ['orders.view'] }]);
    await assert.rejects(() => make(rbac).overviewForSeller('u1', '7d', NOW), ForbiddenException);
  });

  it('tells a caller with no shops that they have none, rather than that they are barred', async () => {
    const { make, journal } = serviceFor();
    const out = await make(realRbac([])).overviewForSeller('u1', '7d', NOW);
    assert.deepEqual(out.shopIds, []);
    assert.deepEqual(out.byShop, []);
    assert.equal(out.summary.averageOrderValue, null);
    assert.equal(out.salesSeries.length, 7);
    // And it did not ask the database anything at all to find that out.
    assert.equal(journal.orderFindMany.length, 0);
    assert.equal(journal.productCount.length, 0);
  });

  it('scopes every consolidated query to the permitted set, not the membership set', async () => {
    const { make, journal } = serviceFor();
    const rbac = realRbac([
      { shopId: 'A', perms: ['analytics.view'] },
      { shopId: 'B', perms: ['dashboard.view'] },
    ]);
    await make(rbac).overviewForSeller('u1', '7d', NOW);
    for (const where of journal.orderFindMany) assert.deepEqual(where.shopId, { in: ['A'] });
    for (const where of journal.orderGroupBy) assert.deepEqual(where.shopId, { in: ['A'] });
    for (const where of journal.itemFindMany) assert.deepEqual(where.order.shopId, { in: ['A'] });
    for (const where of journal.productCount) assert.deepEqual(where.shopId, { in: ['A'] });
  });
});
