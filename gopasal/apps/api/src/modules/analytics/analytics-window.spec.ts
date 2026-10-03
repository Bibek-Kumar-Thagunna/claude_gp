import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { OrderStatus, PaymentMethod } from '@prisma/client';
import {
  NEPAL_OFFSET_MINUTES,
  TOP_PRODUCTS_LIMIT,
  analyticsWindow,
  buildSeries,
  changePercent,
  compare,
  isAnalyticsPeriod,
  nepalDayKeyOf,
  paymentSplit,
  summarise,
  summariseByShop,
  summariseGroups,
  topProducts,
  type OrderFact,
  type OrderItemFact,
  type ShopOrderFact,
  type StatusGroup,
} from './analytics-window';

/**
 * The arithmetic, with no database anywhere near it.
 *
 * These are the tests that can actually pin down a day boundary. A "last 7 days" that
 * is one day out, or that cuts the day at 05:45 Kathmandu because Postgres truncated
 * in UTC, is a bug no smoke test would ever show — the chart would simply be subtly
 * wrong, forever.
 */

const order = (
  placedAt: string,
  total: number,
  status: OrderStatus = 'DELIVERED',
  paymentMethod: PaymentMethod = 'COD',
): OrderFact => ({ placedAt: new Date(placedAt), total, status, paymentMethod });

const item = (
  productId: string | null,
  nameSnapshot: string,
  price: number,
  qty: number,
): OrderItemFact => ({ productId, nameSnapshot, price, qty });

const group = (status: OrderStatus, count: number, total: number | null): StatusGroup => ({
  status,
  _count: { _all: count },
  _sum: { total },
});

describe('Nepal day boundaries', () => {
  it('uses the fixed +05:45 offset Nepal has never moved off', () => {
    assert.equal(NEPAL_OFFSET_MINUTES, 5 * 60 + 45);
  });

  it('puts an evening order on the day the shopkeeper served it, not the next one', () => {
    // 22:30 Kathmandu on 12 Aug = 16:45 UTC. A UTC date_trunc would agree here…
    assert.equal(nepalDayKeyOf(new Date('2026-08-12T16:45:00Z')), '2026-08-12');
    // …but 00:30 Kathmandu on 13 Aug is 18:45 UTC on the 12th, and that is the case a
    // UTC truncation gets wrong: it would file a late-night order under the 12th.
    assert.equal(nepalDayKeyOf(new Date('2026-08-12T18:45:00Z')), '2026-08-13');
  });

  it('rolls over at local midnight, to the second', () => {
    // Local midnight on 13 Aug is 18:15 UTC on the 12th.
    assert.equal(nepalDayKeyOf(new Date('2026-08-12T18:14:59.999Z')), '2026-08-12');
    assert.equal(nepalDayKeyOf(new Date('2026-08-12T18:15:00.000Z')), '2026-08-13');
  });
});

describe('analyticsWindow', () => {
  it('accepts exactly three periods and nothing else', () => {
    assert.ok(isAnalyticsPeriod('7d'));
    assert.ok(isAnalyticsPeriod('30d'));
    assert.ok(isAnalyticsPeriod('90d'));
    assert.equal(isAnalyticsPeriod('1y'), false);
    assert.equal(isAnalyticsPeriod('toString'), false); // prototype key, not a period
  });

  it('counts today as one of the seven days', () => {
    const w = analyticsWindow('7d', new Date('2026-08-26T10:00:00Z')); // 15:45 Kathmandu
    assert.equal(w.days, 7);
    assert.equal(w.dayKeys.length, 7);
    assert.deepEqual(w.dayKeys, [
      '2026-08-20',
      '2026-08-21',
      '2026-08-22',
      '2026-08-23',
      '2026-08-24',
      '2026-08-25',
      '2026-08-26',
    ]);
  });

  it('opens at local midnight and closes at tomorrow local midnight', () => {
    const w = analyticsWindow('7d', new Date('2026-08-26T10:00:00Z'));
    assert.equal(w.from.toISOString(), '2026-08-19T18:15:00.000Z'); // 20 Aug 00:00 NPT
    assert.equal(w.to.toISOString(), '2026-08-26T18:15:00.000Z'); // 27 Aug 00:00 NPT
  });

  it('abuts the previous window exactly, so no order can fall between or in both', () => {
    for (const period of ['7d', '30d', '90d'] as const) {
      const w = analyticsWindow(period, new Date('2026-08-26T10:00:00Z'));
      assert.equal(w.previousTo.getTime(), w.from.getTime(), period);
      const span = w.to.getTime() - w.from.getTime();
      assert.equal(w.previousTo.getTime() - w.previousFrom.getTime(), span, period);
      assert.equal(span, w.days * 86_400_000, period);
    }
  });

  it('does not shift when the same Nepal day is asked about twice', () => {
    const morning = analyticsWindow('30d', new Date('2026-08-26T02:00:00Z'));
    const evening = analyticsWindow('30d', new Date('2026-08-26T17:00:00Z'));
    assert.deepEqual(morning, evening);
  });
});

describe('summarise', () => {
  it('reports nothing as nothing, and refuses to average zero orders', () => {
    const s = summarise([]);
    assert.deepEqual(s, {
      sales: 0,
      grossSales: 0,
      refunds: 0,
      netSales: 0,
      ordersPlaced: 0,
      ordersDelivered: 0,
      ordersCancelled: 0,
      ordersInProgress: 0,
      averageOrderValue: null,
    });
  });

  it('counts money only once the goods arrive, but counts every order placed', () => {
    const s = summarise([
      order('2026-08-24T06:00:00Z', 1000, 'DELIVERED'),
      order('2026-08-24T07:00:00Z', 500, 'DELIVERED'),
      order('2026-08-24T08:00:00Z', 9999, 'PLACED'),
      order('2026-08-24T09:00:00Z', 9999, 'OUT_FOR_DELIVERY'),
      order('2026-08-24T10:00:00Z', 9999, 'CANCELLED'),
      order('2026-08-24T11:00:00Z', 9999, 'REJECTED'),
    ]);
    assert.equal(s.sales, 1500); // the 9999s never happened, financially
    assert.equal(s.grossSales, 1500);
    assert.equal(s.netSales, 1500);
    assert.equal(s.ordersPlaced, 6);
    assert.equal(s.ordersDelivered, 2);
    assert.equal(s.ordersCancelled, 2); // CANCELLED + REJECTED
    assert.equal(s.ordersInProgress, 2);
    assert.equal(s.averageOrderValue, 750);
  });

  it('averages over delivered orders, so an undelivered order cannot dilute it', () => {
    const s = summarise([
      order('2026-08-24T06:00:00Z', 900, 'DELIVERED'),
      order('2026-08-24T07:00:00Z', 100_000, 'PLACED'),
    ]);
    assert.equal(s.averageOrderValue, 900);
  });

  it('has no delivered orders and therefore no average, even with orders in hand', () => {
    const s = summarise([order('2026-08-24T06:00:00Z', 400, 'PACKED')]);
    assert.equal(s.sales, 0);
    assert.equal(s.averageOrderValue, null); // not 0 — the question does not apply
  });
});

describe('summariseGroups', () => {
  const rows: OrderFact[] = [
    order('2026-08-24T06:00:00Z', 1000, 'DELIVERED'),
    order('2026-08-24T07:00:00Z', 500, 'DELIVERED'),
    order('2026-08-24T08:00:00Z', 300, 'PLACED'),
    order('2026-08-24T09:00:00Z', 700, 'CANCELLED'),
    order('2026-08-24T10:00:00Z', 200, 'REJECTED'),
  ];

  it('agrees with summarise on the same orders — the comparison depends on it', () => {
    const fromRows = summarise(rows);
    const fromGroups = summariseGroups([
      group('DELIVERED', 2, 1500),
      group('PLACED', 1, 300),
      group('CANCELLED', 1, 700),
      group('REJECTED', 1, 200),
    ]);
    assert.deepEqual(fromGroups, fromRows);
  });

  it('treats a null sum as zero rather than as NaN', () => {
    const s = summariseGroups([group('DELIVERED', 0, null)]);
    assert.equal(s.sales, 0);
    assert.equal(s.averageOrderValue, null);
  });

  it('reports no average for a window that delivered nothing', () => {
    assert.equal(summariseGroups([group('PLACED', 3, 900)]).averageOrderValue, null);
  });
});

describe('changePercent and compare', () => {
  it('declines to compare against nothing instead of claiming 0% or 100%', () => {
    assert.equal(changePercent(5000, 0), null);
    assert.equal(changePercent(0, 0), null);
  });

  it('rounds to one decimal place', () => {
    assert.equal(changePercent(1100, 1000), 10);
    assert.equal(changePercent(1000, 3000), -66.7);
  });

  it('drops the average-order-value delta when either side has no average', () => {
    const current = summarise([order('2026-08-24T06:00:00Z', 800, 'DELIVERED')]);
    const previous = summarise([order('2026-08-17T06:00:00Z', 800, 'PLACED')]);
    const c = compare(current, previous);
    assert.equal(c.averageOrderValueChangePercent, null);
    assert.equal(c.salesChangePercent, null); // previous sales were 0
    assert.equal(c.ordersChangePercent, 0); // one order each window
  });
});

describe('buildSeries', () => {
  const dayKeys = ['2026-08-24', '2026-08-25', '2026-08-26'];

  it('keeps a bar for every day, including the days nothing sold', () => {
    const series = buildSeries([order('2026-08-25T06:00:00Z', 1200, 'DELIVERED')], dayKeys);
    assert.deepEqual(series, [
      { date: '2026-08-24', sales: 0, gross: 0, refunds: 0, net: 0, orders: 0 },
      { date: '2026-08-25', sales: 1200, gross: 1200, refunds: 0, net: 1200, orders: 1 },
      { date: '2026-08-26', sales: 0, gross: 0, refunds: 0, net: 0, orders: 0 },
    ]);
  });

  it('counts every order on its day but only delivered money', () => {
    const series = buildSeries(
      [
        order('2026-08-24T06:00:00Z', 500, 'DELIVERED'),
        order('2026-08-24T07:00:00Z', 700, 'PLACED'),
      ],
      dayKeys,
    );
    assert.deepEqual(series[0], { date: '2026-08-24', sales: 500, gross: 500, refunds: 0, net: 500, orders: 2 });
  });

  it('files a late-night order under the Nepal day it was placed on', () => {
    // 18:30 UTC on the 25th is 00:15 Kathmandu on the 26th.
    const series = buildSeries([order('2026-08-25T18:30:00Z', 400, 'DELIVERED')], dayKeys);
    assert.deepEqual(series[1], { date: '2026-08-25', sales: 0, gross: 0, refunds: 0, net: 0, orders: 0 });
    assert.deepEqual(series[2], { date: '2026-08-26', sales: 400, gross: 400, refunds: 0, net: 400, orders: 1 });
  });

  it('reports delivered gross, completed refunds and net explicitly', () => {
    const refunded = { ...order('2026-08-25T06:00:00Z', 1_000), refundAmount: 250 };
    const summary = summarise([refunded]);
    assert.equal(summary.grossSales, 1_000);
    assert.equal(summary.refunds, 250);
    assert.equal(summary.netSales, 750);
    assert.deepEqual(buildSeries([refunded], ['2026-08-25'])[0], {
      date: '2026-08-25', sales: 1_000, gross: 1_000, refunds: 250, net: 750, orders: 1,
    });
  });

  it('drops an order outside the window rather than inventing a bucket for it', () => {
    const series = buildSeries([order('2026-01-01T06:00:00Z', 999, 'DELIVERED')], dayKeys);
    assert.equal(
      series.reduce((n, p) => n + p.sales + p.orders, 0),
      0,
    );
    assert.equal(series.length, 3);
  });
});

describe('paymentSplit', () => {
  it('splits the window by intended method and only banks delivered cash', () => {
    const split = paymentSplit([
      order('2026-08-24T06:00:00Z', 1000, 'DELIVERED', 'COD'),
      order('2026-08-24T07:00:00Z', 400, 'PLACED', 'COD'),
      order('2026-08-24T08:00:00Z', 600, 'CANCELLED', 'COD'),
      order('2026-08-24T09:00:00Z', 250, 'DELIVERED', 'ESEWA'),
      order('2026-08-24T10:00:00Z', 700, 'OUT_FOR_DELIVERY', 'KHALTI'),
    ]);
    assert.deepEqual(split, {
      codOrders: 3,
      codCollected: 1000, // not 2000: the placed and cancelled COD orders are not cash
      onlineOrders: 2,
      onlineDelivered: 250,
    });
  });

  it('is all zeros for a shop that has taken no orders', () => {
    assert.deepEqual(paymentSplit([]), {
      codOrders: 0,
      codCollected: 0,
      onlineOrders: 0,
      onlineDelivered: 0,
    });
  });
});

describe('topProducts', () => {
  it('groups variants of one product together under the live product name', () => {
    const rows = topProducts(
      [
        item('p1', 'Basmati rice — 5 kg', 900, 2),
        item('p1', 'Basmati rice — 1 kg', 200, 3),
        item('p2', 'Mustard oil — 1 L', 400, 1),
      ],
      new Map([
        ['p1', 'Basmati rice'],
        ['p2', 'Mustard oil'],
      ]),
      TOP_PRODUCTS_LIMIT,
    );
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], {
      productId: 'p1',
      name: 'Basmati rice',
      unitsSold: 5,
      revenue: 900 * 2 + 200 * 3,
    });
  });

  it('keeps a deleted product visible under the name it was sold as', () => {
    const rows = topProducts([item(null, 'Ghee — 500 g', 700, 1)], new Map(), TOP_PRODUCTS_LIMIT);
    assert.deepEqual(rows[0], {
      productId: null,
      name: 'Ghee — 500 g',
      unitsSold: 1,
      revenue: 700,
    });
  });

  it('does not merge two different deleted products into one row', () => {
    const rows = topProducts(
      [item(null, 'Ghee', 700, 1), item(null, 'Dalmoth', 100, 1)],
      new Map(),
      TOP_PRODUCTS_LIMIT,
    );
    assert.equal(rows.length, 2);
  });

  it('falls back to the snapshot when the product row exists but was not fetched', () => {
    const rows = topProducts([item('p9', 'Tea — 250 g', 300, 1)], new Map(), TOP_PRODUCTS_LIMIT);
    assert.equal(rows[0]?.name, 'Tea — 250 g');
  });

  it('ranks by revenue, then units, then name, and never returns more than the limit', () => {
    const rows = topProducts(
      [
        item('a', 'A', 100, 1),
        item('b', 'B', 100, 3),
        item('c', 'C', 100, 2),
        item('d', 'D', 100, 2),
      ],
      new Map(),
      3,
    );
    assert.deepEqual(
      rows.map((r) => r.name),
      ['B', 'C', 'D'],
    );
  });

  it('has nothing to show when nothing was delivered', () => {
    assert.deepEqual(topProducts([], new Map(), TOP_PRODUCTS_LIMIT), []);
  });
});

describe('summariseByShop', () => {
  const shopOrder = (shopId: string, total: number, status: OrderStatus): ShopOrderFact => ({
    ...order('2026-08-24T06:00:00Z', total, status),
    shopId,
  });

  it('splits one fetch across the shops it covers, keeping money apart', () => {
    const slices = summariseByShop(
      [
        shopOrder('s1', 1000, 'DELIVERED'),
        shopOrder('s1', 500, 'PLACED'),
        shopOrder('s2', 300, 'DELIVERED'),
      ],
      ['s1', 's2'],
    );
    assert.equal(slices.length, 2);
    assert.equal(slices[0]?.shopId, 's1');
    assert.equal(slices[0]?.summary.sales, 1000);
    assert.equal(slices[0]?.summary.ordersPlaced, 2);
    assert.equal(slices[1]?.summary.sales, 300);
  });

  it('still lists a shop that sold nothing, rather than making it disappear', () => {
    const slices = summariseByShop([shopOrder('s1', 100, 'DELIVERED')], ['s1', 's2']);
    assert.equal(slices[1]?.shopId, 's2');
    assert.equal(slices[1]?.summary.ordersPlaced, 0);
    assert.equal(slices[1]?.summary.averageOrderValue, null);
  });

  it('refuses to summarise a shop that was not asked for', () => {
    const slices = summariseByShop(
      [shopOrder('s1', 100, 'DELIVERED'), shopOrder('intruder', 9999, 'DELIVERED')],
      ['s1'],
    );
    assert.equal(slices.length, 1);
    assert.equal(slices[0]?.summary.sales, 100);
  });

  it('returns nothing at all for a seller with no shops', () => {
    assert.deepEqual(summariseByShop([], []), []);
  });
});
