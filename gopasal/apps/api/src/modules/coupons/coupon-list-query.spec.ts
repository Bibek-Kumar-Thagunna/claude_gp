import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { CouponsService } from './coupons.service';
import { ListShopCouponsQueryDto } from './dto/coupons.dto';

/**
 * The seller coupon list contract: what the query string turns into, in SQL.
 *
 * `list({ shopId })` had no `take`, and the console derived every coupon's status and
 * every stat card from the whole array. Nothing prunes this table — `deactivate` writes
 * `isActive: false` and no route deletes a row — so it only grows.
 *
 * The assertions are about `where` objects rather than rows, because the things that can
 * silently break are all shapes:
 *
 * - **`shopId` constrains every read**, including the three summary reads. A `where`
 *   that lost it would be a cross-tenant read of other shops' discount codes.
 * - **`?status=running` is the checkout's ladder**, not the `isActive` column. If it
 *   drifted to `isActive` the console would print "Expired" on rows the server called
 *   running, and a seller would be told a dead code still works.
 * - **`running` and `idle` are exact complements**, spelled out term by term below, so
 *   `total = running + idle` is a fact rather than a coincidence.
 * - **The summary is counted over the whole shop.** If it moved with the filter,
 *   clicking "Not running" would rewrite "Running now" to zero.
 * - **One `now` serves the page, the summary and `asOf`**, so no two numbers on the
 *   screen are answers about different instants.
 */

/** The sentinel Prisma hands back for `prisma.coupon.fields.usageLimit`. */
const USAGE_LIMIT_REF = { _ref: 'usageLimit', _container: 'Coupon' } as unknown as Prisma.IntFieldRefInput<'Coupon'>;

interface Captured {
  findWhere: Prisma.CouponWhereInput[];
  orderBy: unknown[];
  skip: (number | undefined)[];
  take: (number | undefined)[];
  countWhere: Prisma.CouponWhereInput[];
  aggregateWhere: Prisma.CouponWhereInput[];
}

/** `plainToInstance` is what the pipe does; the `page`/`limit`/`sort` defaults come from it. */
function query(partial: Partial<ListShopCouponsQueryDto>): ListShopCouponsQueryDto {
  return Object.assign(new ListShopCouponsQueryDto(), partial);
}

function harness(counts: { total?: number; running?: number; sum?: number | null } = {}): {
  coupons: CouponsService;
  seen: Captured;
} {
  const seen: Captured = {
    findWhere: [],
    orderBy: [],
    skip: [],
    take: [],
    countWhere: [],
    aggregateWhere: [],
  };

  const prisma = {
    coupon: {
      fields: { usageLimit: USAGE_LIMIT_REF },
      findMany: (args: {
        where: Prisma.CouponWhereInput;
        orderBy: unknown;
        skip?: number;
        take?: number;
      }) => {
        seen.findWhere.push(args.where);
        seen.orderBy.push(args.orderBy);
        seen.skip.push(args.skip);
        seen.take.push(args.take);
        return Promise.resolve([]);
      },
      count: (args: { where: Prisma.CouponWhereInput }) => {
        seen.countWhere.push(args.where);
        // In call order: the filtered `meta.total`, the shop's total, the shop's running.
        const nth = seen.countWhere.length;
        if (nth === 1) return Promise.resolve(0);
        if (nth === 2) return Promise.resolve(counts.total ?? 0);
        return Promise.resolve(counts.running ?? 0);
      },
      aggregate: (args: { where: Prisma.CouponWhereInput }) => {
        seen.aggregateWhere.push(args.where);
        return Promise.resolve({ _sum: { usedCount: counts.sum ?? null } });
      },
    },
  } as unknown as PrismaService;

  return { coupons: new CouponsService(prisma), seen };
}

/**
 * Run the list and hand back the page `where`, plus the `now` the service used —
 * read off `summary.asOf`, which is the same instant by construction.
 */
async function listWith(partial: Partial<ListShopCouponsQueryDto>): Promise<{
  where: Prisma.CouponWhereInput;
  seen: Captured;
  now: Date;
}> {
  const { coupons, seen } = harness();
  const result = await coupons.listForShopManage('shop_a', query(partial));
  const where = seen.findWhere[0];
  assert.ok(where, 'listForShopManage must have run one findMany');
  assert.equal(where.shopId, 'shop_a', 'shopId must constrain every coupon read');
  return { where, seen, now: new Date(result.summary.asOf) };
}

describe('coupon list · paging', () => {
  it('defaults to the first page of twenty, newest first', async () => {
    const { seen } = await listWith({});

    assert.equal(seen.skip[0], 0);
    assert.equal(seen.take[0], 20, 'the read must be bounded — nothing prunes this table');
    assert.deepEqual(seen.orderBy[0], { createdAt: 'desc' });
  });

  it('translates page and limit into skip and take', async () => {
    const { seen } = await listWith({ page: 3, limit: 25 });

    assert.equal(seen.skip[0], 50);
    assert.equal(seen.take[0], 25);
  });

  it('orders by the column the (shopId, createdAt) index leads with', async () => {
    const { seen } = await listWith({ sort: 'oldest' });
    assert.deepEqual(seen.orderBy[0], { createdAt: 'asc' });
  });

  it('counts the filtered set with the same where the page used', async () => {
    // Otherwise `meta.totalPages` is a page count for a different query, and the
    // console pages past the end of the list it is showing.
    const { seen } = await listWith({ q: 'dashain', status: 'running' });
    assert.deepEqual(seen.countWhere[0], seen.findWhere[0]);
  });

  it('returns the paging envelope alongside the summary', async () => {
    const { coupons } = harness();
    const result = await coupons.listForShopManage('shop_a', query({ page: 2, limit: 10 }));

    assert.deepEqual(result.data, []);
    assert.equal(result.meta.page, 2);
    assert.equal(result.meta.limit, 10);
    // Both names carry the page count; `pages` is what already-shipped callers read.
    assert.equal(result.meta.pages, result.meta.totalPages);
    assert.ok('summary' in result);
  });
});

describe('coupon list · search', () => {
  it('matches the code case-insensitively', async () => {
    // `Coupon` has no name, no description and no note. The code is the only text on
    // the row, so this is the whole of `?q=`.
    const { where } = await listWith({ q: 'DASHAIN' });
    assert.deepEqual(where.code, { contains: 'DASHAIN', mode: 'insensitive' });
  });

  it('trims the term', async () => {
    const { where } = await listWith({ q: '  dashain ' });
    assert.deepEqual(where.code, { contains: 'dashain', mode: 'insensitive' });
  });

  it('adds no predicate for a blank or whitespace term', async () => {
    // An empty search box must read the whole shop, not zero rows.
    for (const q of ['', '   ', undefined]) {
      const { where } = await listWith({ q });
      assert.equal('code' in where, false, `q=${JSON.stringify(q)} must not filter on code`);
      assert.deepEqual(where, { shopId: 'shop_a' });
    }
  });
});

describe('coupon list · status is the checkout ladder', () => {
  it('leaves the where alone when no status is asked for', async () => {
    const { where } = await listWith({});
    assert.deepEqual(where, { shopId: 'shop_a' }, 'an unfiltered list is the shop and nothing else');
  });

  it('running spells out every term quote walks, against the served instant', async () => {
    const { where, now } = await listWith({ status: 'running' });

    assert.equal(where.isActive, true);
    assert.deepEqual(where.validFrom, { lte: now });
    assert.deepEqual(where.AND, [
      // Both `IS NULL` arms are load-bearing: a comparison against NULL is never true,
      // so without them every never-expiring and every uncapped coupon would drop out.
      { OR: [{ validTo: null }, { validTo: { gte: now } }] },
      { OR: [{ usageLimit: null }, { usedCount: { lt: USAGE_LIMIT_REF } }] },
    ]);
  });

  it('compares usedCount against the usageLimit column, not a number', async () => {
    // A column-against-column comparison, which is why this is a Prisma field
    // reference. Inlining a number here would silently filter on a constant.
    const { where } = await listWith({ status: 'running' });
    const and = where.AND;
    assert.ok(Array.isArray(and) && and.length === 2);
    assert.equal(JSON.stringify(and[1]).includes('"_ref":"usageLimit"'), true);
  });

  it('idle is the exact complement, one arm per way a code fails', async () => {
    const { where, now } = await listWith({ status: 'idle' });

    assert.deepEqual(where.OR, [
      { isActive: false }, // the seller turned it off
      { validFrom: { gt: now } }, // it has not started
      { validTo: { lt: now } }, // it has ended
      { usedCount: { gte: USAGE_LIMIT_REF } }, // it has been used up
    ]);
    assert.equal('isActive' in where, false, 'idle must not also constrain isActive at the top level');
  });

  it('combines status and search rather than letting one win', async () => {
    const { where } = await listWith({ status: 'running', q: 'tihar' });
    assert.equal(where.isActive, true);
    assert.deepEqual(where.code, { contains: 'tihar', mode: 'insensitive' });
  });
});

describe('coupon list · the summary is a claim about the shop', () => {
  it('counts over the whole shop even while the page is filtered', async () => {
    const { seen, now } = await listWith({ q: 'dashain', status: 'idle', page: 2 });

    // countWhere[0] is `meta.total` for the filtered page; the rest are the summary.
    assert.deepEqual(seen.countWhere[1], { shopId: 'shop_a' }, 'total is every coupon the shop has');
    assert.deepEqual(seen.countWhere[2], {
      shopId: 'shop_a',
      isActive: true,
      validFrom: { lte: now },
      AND: [
        { OR: [{ validTo: null }, { validTo: { gte: now } }] },
        { OR: [{ usageLimit: null }, { usedCount: { lt: USAGE_LIMIT_REF } }] },
      ],
    });
    assert.deepEqual(seen.aggregateWhere[0], { shopId: 'shop_a' });
  });

  it('inherits neither q nor status into any summary read', async () => {
    const { seen } = await listWith({ q: 'dashain', status: 'idle' });

    for (const where of [seen.countWhere[1], seen.countWhere[2], seen.aggregateWhere[0]]) {
      const printed = JSON.stringify(where);
      assert.equal(printed.includes('dashain'), false, `summary read must not carry ?q=: ${printed}`);
      assert.equal(printed.includes('isActive":false'), false, `summary read must not carry ?status=: ${printed}`);
    }
  });

  it('derives idle by subtraction so the two buckets add up to the total', async () => {
    const { coupons } = harness({ total: 9, running: 4, sum: 137 });
    const { summary } = await coupons.listForShopManage('shop_a', query({}));

    assert.equal(summary.total, 9);
    assert.equal(summary.running, 4);
    assert.equal(summary.idle, 5);
    assert.equal(summary.idle + summary.running, summary.total);
    assert.equal(summary.redemptions, 137);
  });

  it('reports zero redemptions — not null — for a shop with no coupons', async () => {
    // A sum of nothing genuinely is nothing redeemed, unlike an average of nothing,
    // which is not a rating.
    const { coupons } = harness({ total: 0, running: 0, sum: null });
    const { summary } = await coupons.listForShopManage('shop_a', query({}));

    assert.equal(summary.redemptions, 0);
    assert.equal(summary.total, 0);
    assert.equal(summary.idle, 0);
  });

  it('publishes the instant it filtered by, so the console can label rows with it', async () => {
    const before = Date.now();
    const { where, now } = await listWith({ status: 'running' });
    const after = Date.now();

    assert.ok(now.getTime() >= before && now.getTime() <= after);
    // The same Date object reaches the page filter, the summary count and `asOf`.
    assert.deepEqual(where.validFrom, { lte: now });
  });
});

describe('coupon list · the index behind it', () => {
  const prismaDir = join(__dirname, '..', '..', '..', 'prisma');

  it('declares (shopId, createdAt) on model Coupon', () => {
    const schema = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
    const model = /model Coupon \{([\s\S]*?)\n\}/.exec(schema)?.[1];
    assert.ok(model, 'model Coupon must exist');

    assert.match(model, /@@index\(\[shopId, createdAt\]\)/);
    // A swap, not an addition: the composite covers the single-column index's every use,
    // including the shop cascade, which needs only the leftmost column.
    assert.equal(/@@index\(\[shopId\]\)/.test(model), false, 'the single-column shop index is redundant now');
  });

  it('ships a migration that creates the composite and drops the prefix', () => {
    const dir = readdirSync(prismaDir + '/migrations').find((name) =>
      name.endsWith('_coupon_shop_created_index'),
    );
    assert.ok(dir, 'the schema change needs a migration beside it');

    const sql = readFileSync(join(prismaDir, 'migrations', dir, 'migration.sql'), 'utf8');
    assert.match(sql, /CREATE INDEX "Coupon_shopId_createdAt_idx" ON "Coupon"\("shopId", "createdAt"\)/);
    assert.match(sql, /DROP INDEX "Coupon_shopId_idx"/);
  });
});
