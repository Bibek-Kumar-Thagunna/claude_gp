import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { ReviewsService } from './reviews.service';
import { ListShopReviewsQueryDto } from './dto/reviews.dto';

/**
 * The seller review list contract: what the query string turns into, in SQL.
 *
 * This is the endpoint that had no `take` at all. Reviews accumulate one per delivered
 * order, customers write them and a shop cannot delete them, so the old read grew for
 * as long as the shop kept selling — and the console then filtered and tallied that
 * whole array in the browser.
 *
 * The assertions are about the `where` objects rather than about rows, because the
 * things that can silently break are all shapes:
 *
 * - **`shopId` constrains every read.** A `where` that lost it would be a cross-tenant
 *   read of other shops' customer comments, not merely a slow one.
 * - **`summary` is counted over the whole shop.** It is what the tally cards render. If
 *   it moved with the filter, clicking "1–2 stars" would rewrite the shop's average
 *   rating to something between 1 and 2 — a claim about the shop, made from a filter.
 * - **A blank `q` adds no predicate**, so an empty search box cannot match nothing.
 */

interface Captured {
  findWhere: Prisma.ReviewWhereInput[];
  orderBy: unknown[];
  skip: (number | undefined)[];
  take: (number | undefined)[];
  countWhere: Prisma.ReviewWhereInput[];
  groupWhere: Prisma.ReviewWhereInput[];
  aggregateWhere: Prisma.ReviewWhereInput[];
}

/** `plainToInstance` is what the pipe does; the defaults for `page`/`limit`/`sort` come from it. */
function query(partial: Partial<ListShopReviewsQueryDto>): ListShopReviewsQueryDto {
  return Object.assign(new ListShopReviewsQueryDto(), partial);
}

type RatingGroup = { rating: number; _count: { _all: number } };

function harness(
  groups: RatingGroup[] = [],
  counts: { answered?: number; avg?: number | null } = {},
): { reviews: ReviewsService; seen: Captured } {
  const seen: Captured = {
    findWhere: [],
    orderBy: [],
    skip: [],
    take: [],
    countWhere: [],
    groupWhere: [],
    aggregateWhere: [],
  };

  const prisma = {
    review: {
      findMany: (args: {
        where: Prisma.ReviewWhereInput;
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
      count: (args: { where: Prisma.ReviewWhereInput }) => {
        seen.countWhere.push(args.where);
        // The first count is `meta.total`; the second is the summary's answered count.
        return Promise.resolve(seen.countWhere.length === 1 ? 0 : (counts.answered ?? 0));
      },
      groupBy: (args: { where: Prisma.ReviewWhereInput }) => {
        seen.groupWhere.push(args.where);
        return Promise.resolve(groups);
      },
      aggregate: (args: { where: Prisma.ReviewWhereInput }) => {
        seen.aggregateWhere.push(args.where);
        return Promise.resolve({ _avg: { rating: counts.avg ?? null } });
      },
    },
  } as unknown as PrismaService;

  return { reviews: new ReviewsService(prisma), seen };
}

/** The `where` the page query used — always the first `findMany`. */
async function whereFor(
  partial: Partial<ListShopReviewsQueryDto>,
): Promise<Prisma.ReviewWhereInput> {
  const { reviews, seen } = harness();
  await reviews.listForShopManage('shop_a', query(partial));
  const where = seen.findWhere[0];
  assert.ok(where, 'listForShopManage must have run one findMany');
  assert.equal(where.shopId, 'shop_a', 'shopId must constrain every review read');
  return where;
}

describe('review list · paging', () => {
  it('defaults to the first page of twenty, newest first', async () => {
    const { reviews, seen } = harness();
    await reviews.listForShopManage('shop_a', query({}));

    assert.equal(seen.skip[0], 0);
    assert.equal(seen.take[0], 20, 'the read must be bounded — this table only grows');
    assert.deepEqual(seen.orderBy[0], { createdAt: 'desc' });
  });

  it('translates page and limit into skip and take', async () => {
    const { reviews, seen } = harness();
    await reviews.listForShopManage('shop_a', query({ page: 4, limit: 25 }));

    assert.equal(seen.skip[0], 75);
    assert.equal(seen.take[0], 25);
  });

  it('orders by the column the (shopId, createdAt) index leads with', async () => {
    // Not `id`, and not the rating: an orderBy the index cannot supply puts a sort
    // over one shop's entire review history back into every page request.
    const { reviews, seen } = harness();
    await reviews.listForShopManage('shop_a', query({ sort: 'oldest' }));
    assert.deepEqual(seen.orderBy[0], { createdAt: 'asc' });
  });

  it('counts the filtered set with the same where the page used', async () => {
    const { reviews, seen } = harness();
    await reviews.listForShopManage('shop_a', query({ q: 'late', rating: [1, 2] }));

    // Otherwise `meta.totalPages` is a page count for a different query, and the
    // console pages past the end of the list it is showing.
    assert.deepEqual(seen.countWhere[0], seen.findWhere[0]);
  });

  it('returns the paging envelope alongside the summary', async () => {
    const { reviews } = harness();
    const result = await reviews.listForShopManage('shop_a', query({ page: 2, limit: 10 }));

    assert.deepEqual(result.data, []);
    assert.equal(result.meta.page, 2);
    assert.equal(result.meta.limit, 10);
    // Both names carry the page count; `pages` is what already-shipped callers read.
    assert.equal(result.meta.pages, result.meta.totalPages);
    assert.ok('summary' in result);
  });
});

describe('review list · filters reach SQL', () => {
  it('searches the comment and the order code, trimmed and case-insensitive', async () => {
    const where = await whereFor({ q: '  GP-1234  ' });
    const or = where.OR;
    assert.ok(Array.isArray(or), 'q should produce an OR list');

    const json = JSON.stringify(or);
    assert.ok(json.includes('"GP-1234"'), `search term should be trimmed, got ${json}`);
    assert.equal(json.includes('"  GP-1234  "'), false);
    assert.ok(json.includes('comment'), 'q should search what the customer wrote');
    assert.ok(json.includes('code'), 'q should search the order code');
    assert.equal(json.match(/insensitive/g)?.length, 2, 'both terms must be case-insensitive');
  });

  it('does not search the customer by name', async () => {
    // A shop console is not a customer directory. Reviews show a name; they are not
    // a way to look people up across a shop's whole history.
    const where = await whereFor({ q: 'sita' });
    assert.equal(JSON.stringify(where.OR).includes('customer'), false);
  });

  it('ignores a blank or whitespace-only q instead of matching nothing', async () => {
    for (const q of ['', '   ']) {
      const where = await whereFor({ q });
      assert.equal('OR' in where, false, `q=${JSON.stringify(q)} should add no predicate`);
    }
  });

  it('turns answered into a sellerReply null check, both ways', async () => {
    assert.deepEqual((await whereFor({ answered: 'true' })).sellerReply, { not: null });
    assert.equal((await whereFor({ answered: 'false' })).sellerReply, null);
    assert.equal('sellerReply' in (await whereFor({})), false);
  });

  it('keeps answered=false distinct from an absent filter', async () => {
    // `false` is a filter ("the unanswered queue"), not the default. A truthiness
    // check here would silently show every review on the one screen a shop opens to
    // find the ones it still owes a reply.
    const unanswered = await whereFor({ answered: 'false' });
    assert.ok('sellerReply' in unanswered);
  });

  it('turns a rating list into an IN over the column', async () => {
    assert.deepEqual((await whereFor({ rating: [1, 2] })).rating, { in: [1, 2] });
    assert.deepEqual((await whereFor({ rating: [5] })).rating, { in: [5] });
  });

  it('treats an empty rating list as no rating filter', async () => {
    // `{ in: [] }` matches nothing, which would render as "this shop has no reviews".
    assert.equal('rating' in (await whereFor({ rating: [] })), false);
    assert.equal('rating' in (await whereFor({})), false);
  });

  it('combines filters instead of letting the last one win', async () => {
    const where = await whereFor({ q: 'cold', answered: 'false', rating: [1, 2] });

    assert.equal(where.shopId, 'shop_a');
    assert.equal(where.sellerReply, null);
    assert.deepEqual(where.rating, { in: [1, 2] });
    assert.ok(Array.isArray(where.OR));
  });
});

describe('review list · the summary is about the shop, not the page', () => {
  it('counts the shop with no list filter applied', async () => {
    const { reviews, seen } = harness();
    await reviews.listForShopManage(
      'shop_a',
      query({ q: 'cold', answered: 'false', rating: [1] }),
    );

    // One groupBy and one aggregate, both over the shop alone.
    assert.deepEqual(seen.groupWhere, [{ shopId: 'shop_a' }]);
    assert.deepEqual(seen.aggregateWhere, [{ shopId: 'shop_a' }]);

    // countWhere[0] is `meta.total`; the one after it is the summary's answered count,
    // which carries the shop and the reply check and nothing from the query string.
    const answeredWhere = seen.countWhere[1];
    assert.ok(answeredWhere, 'the summary must count answered reviews separately');
    assert.equal(answeredWhere.shopId, 'shop_a');
    assert.deepEqual(answeredWhere.sellerReply, { not: null });
    assert.equal('OR' in answeredWhere, false, 'the summary must not inherit the search term');
    assert.equal('rating' in answeredWhere, false, 'the summary must not inherit the rating filter');
  });

  it('derives unanswered by subtraction so total and answered cannot disagree', async () => {
    const { reviews } = harness(
      [
        { rating: 5, _count: { _all: 7 } },
        { rating: 4, _count: { _all: 2 } },
        { rating: 1, _count: { _all: 1 } },
      ],
      { answered: 4, avg: 4.3 },
    );
    const { summary } = await reviews.listForShopManage('shop_a', query({}));

    assert.equal(summary.total, 10);
    assert.equal(summary.answered, 4);
    assert.equal(summary.unanswered, 6);
    assert.equal(summary.averageRating, 4.3);
  });

  it('counts 1 and 2 stars as low-rated, from the same groupBy as the total', async () => {
    const { reviews } = harness([
      { rating: 1, _count: { _all: 3 } },
      { rating: 2, _count: { _all: 2 } },
      { rating: 3, _count: { _all: 4 } },
      { rating: 5, _count: { _all: 1 } },
    ]);
    const { summary } = await reviews.listForShopManage('shop_a', query({}));

    assert.equal(summary.lowRated, 5);
    assert.equal(summary.total, 10, 'three stars is not low, and must still be counted');
  });

  it('reports no average rather than zero stars when a shop has no reviews', async () => {
    // Prisma's `_avg` is null over an empty set. Coercing it to 0 would put a
    // zero-star rating on a new shop that nobody has reviewed.
    const { reviews } = harness([], { avg: null });
    const { summary } = await reviews.listForShopManage('shop_a', query({}));

    assert.equal(summary.averageRating, null);
    assert.equal(summary.total, 0);
    assert.equal(summary.unanswered, 0);
  });
});

describe('review list · tenancy', () => {
  it('never reads without a shop, on any combination of filters', async () => {
    const cases: Partial<ListShopReviewsQueryDto>[] = [
      {},
      { q: 'x' },
      { answered: 'true' },
      { answered: 'false' },
      { rating: [1, 2, 3, 4, 5] },
      { page: 9, limit: 100, sort: 'oldest' },
    ];
    for (const partial of cases) {
      const { reviews, seen } = harness();
      await reviews.listForShopManage('shop_b', query(partial));
      for (const where of [...seen.findWhere, ...seen.countWhere, ...seen.groupWhere, ...seen.aggregateWhere]) {
        assert.equal(
          where.shopId,
          'shop_b',
          `a read lost its shop for ${JSON.stringify(partial)}: ${JSON.stringify(where)}`,
        );
      }
    }
  });
});

describe('review list · the index behind it', () => {
  const PRISMA_DIR = join(__dirname, '..', '..', '..', 'prisma');

  it('indexes Review by shop and created date', () => {
    const schema = readFileSync(join(PRISMA_DIR, 'schema.prisma'), 'utf8');
    const start = schema.indexOf('\nmodel Review {');
    assert.notEqual(start, -1, 'model Review not found in schema.prisma');
    const body = schema.slice(start, schema.indexOf('\n}', start));
    const indexes = [...body.matchAll(/@@(?:index|unique)\(\[([^\]]+)\]\)/g)].map((m) =>
      (m[1] ?? '').replace(/\s+/g, ''),
    );

    assert.ok(indexes.includes('shopId,createdAt'), 'the paged read has no index to range over');
    // Covered as the leftmost prefix of the composite, including for the shop cascade.
    assert.ok(!indexes.includes('shopId'), 'the single-column shop index is redundant now');
  });

  it('ships a migration for the index change', () => {
    const dirs = readdirSync(join(PRISMA_DIR, 'migrations'), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    const dir = dirs.find((d) => d.endsWith('_review_shop_created_index'));
    assert.ok(dir, 'no _review_shop_created_index migration directory');
    const sql = readFileSync(join(PRISMA_DIR, 'migrations', dir, 'migration.sql'), 'utf8');
    assert.ok(sql.includes('CREATE INDEX "Review_shopId_createdAt_idx"'));
    assert.ok(sql.includes('DROP INDEX "Review_shopId_idx"'));
  });
});
