import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { StorageProvider } from '../../providers/storage.provider';
import type { UploadsService } from '../uploads/uploads.service';
import { ProductsService } from './products.service';
import { ListShopProductsQueryDto } from './dto/catalog.dto';

/**
 * The seller catalogue list contract: what the query string turns into, in SQL.
 *
 * This is the endpoint that used to accept `?q=` and silently ignore it. A seller with
 * more than one page of products could search for something they owned, get nothing
 * back, and reasonably conclude it had been deleted. So the assertions here are about
 * the `where` object rather than about rows: the point is that every filter the console
 * offers actually reaches Postgres, and that `shopId` is never absent from it.
 *
 * Two invariants are load-bearing beyond "the filter works":
 *
 * - **`shopId` is the leftmost term of every `where`.** The `(shopId, isActive)`
 *   composite index only helps if the shop is always constrained, and a `where` that
 *   lost it would be a cross-tenant read, not merely a slow one.
 * - **`summary` is computed over the whole shop.** It is what the stat cards render.
 *   If it moved with the filter then typing in the search box would silently rewrite
 *   "Out of stock: 4" to "Out of stock: 0", which reads as a fact about the shop.
 */

interface Captured {
  findWhere: Prisma.ProductWhereInput[];
  orderBy: unknown[];
  skip: (number | undefined)[];
  take: (number | undefined)[];
  countWhere: Prisma.ProductWhereInput[];
  groupWhere: Prisma.ProductWhereInput[];
}

/** `plainToInstance` is what the pipe does; the defaults for `page`/`limit` come from it. */
function query(partial: Partial<ListShopProductsQueryDto>): ListShopProductsQueryDto {
  return Object.assign(new ListShopProductsQueryDto(), partial);
}

/**
 * The photo collaborators, as objects that refuse to be used.
 *
 * `listForShop` hands its rows to `withImageUrlsAll`, but this file's fake returns no
 * rows, so nothing is resolved and nothing is stored. Throwing rather than returning
 * a placeholder keeps that honest: if the list path ever starts touching storage, the
 * assertions here are about `where` objects and would otherwise not notice.
 */
function refusingStorage(): StorageProvider {
  const refuse =
    (op: string) =>
    (): never => {
      throw new Error(`storage.${op} must not be reached by a product list test`);
    };
  return {
    name: 'refusing',
    save: refuse('save'),
    read: refuse('read'),
    remove: refuse('remove'),
    publicUrl: refuse('publicUrl'),
  };
}

function refusingUploads(): UploadsService {
  const refuse =
    (op: string) =>
    (): never => {
      throw new Error(`uploads.${op} must not be reached by a product list test`);
    };
  return {
    storePublicImage: refuse('storePublicImage'),
    remove: refuse('remove'),
    read: refuse('read'),
  } as unknown as UploadsService;
}

function harness(groups: { categoryId: string | null; _count: { _all: number } }[] = []): {
  products: ProductsService;
  seen: Captured;
} {
  const seen: Captured = {
    findWhere: [],
    orderBy: [],
    skip: [],
    take: [],
    countWhere: [],
    groupWhere: [],
  };

  const prisma = {
    product: {
      findMany: (args: {
        where: Prisma.ProductWhereInput;
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
      count: (args: { where: Prisma.ProductWhereInput }) => {
        seen.countWhere.push(args.where);
        return Promise.resolve(0);
      },
      groupBy: (args: { where: Prisma.ProductWhereInput }) => {
        seen.groupWhere.push(args.where);
        return Promise.resolve(groups);
      },
    },
  } as unknown as PrismaService;

  return {
    products: new ProductsService(prisma, refusingUploads(), refusingStorage()),
    seen,
  };
}

/** The `where` the page query used — always the first `findMany`. */
async function whereFor(partial: Partial<ListShopProductsQueryDto>): Promise<Prisma.ProductWhereInput> {
  const { products, seen } = harness();
  await products.listForShop('shop_a', query(partial));
  const where = seen.findWhere[0];
  assert.ok(where, 'listForShop must have run one findMany');
  assert.equal(where.shopId, 'shop_a', 'shopId must constrain every product read');
  return where;
}

describe('product list · paging', () => {
  it('defaults to the first page of twenty, newest-touched first', async () => {
    const { products, seen } = harness();
    await products.listForShop('shop_a', query({}));

    assert.equal(seen.skip[0], 0);
    assert.equal(seen.take[0], 20);
    assert.deepEqual(seen.orderBy[0], [{ updatedAt: 'desc' }, { id: 'asc' }]);
  });

  it('translates page and limit into skip and take', async () => {
    const { products, seen } = harness();
    await products.listForShop('shop_a', query({ page: 3, limit: 50 }));

    assert.equal(seen.skip[0], 100);
    assert.equal(seen.take[0], 50);
  });

  it('counts the filtered set with the same where the page used', async () => {
    const { products, seen } = harness();
    await products.listForShop('shop_a', query({ q: 'oil', status: 'active' }));

    // First count is the total for `meta`; it must match the page's filter or the
    // page count is a number about a different query.
    assert.deepEqual(seen.countWhere[0], seen.findWhere[0]);
  });

  it('breaks every sort tie on id so a page boundary cannot duplicate or skip a row', async () => {
    for (const sort of ['recent', 'name', 'price_asc', 'price_desc', 'stock_asc'] as const) {
      const { products, seen } = harness();
      await products.listForShop('shop_a', query({ sort }));
      const orderBy = seen.orderBy[0] as { id?: string }[];
      assert.equal(orderBy.length, 2, `${sort} should order by a column then id`);
      assert.equal(orderBy[1]?.id, 'asc', `${sort} is missing the id tiebreak`);
    }
  });

  it('maps each sort to the column it names', async () => {
    const expected = {
      name: 'name',
      price_asc: 'price',
      price_desc: 'price',
      stock_asc: 'stock',
    } as const;
    for (const [sort, column] of Object.entries(expected)) {
      const { products, seen } = harness();
      await products.listForShop('shop_a', query({ sort: sort as keyof typeof expected }));
      const first = (seen.orderBy[0] as Record<string, string>[])[0] ?? {};
      assert.ok(column in first, `${sort} should order by ${column}, got ${JSON.stringify(first)}`);
    }
  });
});

describe('product list · filters reach SQL', () => {
  it('applies q across names, unit, tags, category and variants', async () => {
    const where = await whereFor({ q: '  Oil  ' });
    const or = where.OR;
    assert.ok(Array.isArray(or), 'q should produce an OR list');

    const json = JSON.stringify(or);
    // Trimmed, and case-insensitive everywhere a `contains` is used.
    assert.ok(json.includes('"Oil"'), `search term should be trimmed, got ${json}`);
    assert.equal(json.includes('"  Oil  "'), false);
    for (const field of ['name', 'nameNp', 'unit', 'tags', 'category', 'variants']) {
      assert.ok(json.includes(field), `q should search ${field}`);
    }
  });

  it('ignores a blank or whitespace-only q instead of matching nothing', async () => {
    for (const q of ['', '   ']) {
      const where = await whereFor({ q });
      assert.equal('OR' in where, false, `q=${JSON.stringify(q)} should add no predicate`);
    }
  });

  it('turns status into the isActive column', async () => {
    assert.equal((await whereFor({ status: 'active' })).isActive, true);
    assert.equal((await whereFor({ status: 'hidden' })).isActive, false);
    assert.equal('isActive' in (await whereFor({})), false);
  });

  it('reads categoryId=none as "the shop never set one"', async () => {
    assert.equal((await whereFor({ categoryId: 'none' })).categoryId, null);
    assert.equal((await whereFor({ categoryId: 'cat_7' })).categoryId, 'cat_7');
    assert.equal('categoryId' in (await whereFor({})), false);
  });

  it('keeps untracked stock separate from none-left', async () => {
    const out = await whereFor({ stock: 'out' });
    assert.equal(out.trackStock, true, 'only a tracked product can be out of stock');
    assert.deepEqual(out.stock, { lte: 0 });

    const inStock = await whereFor({ stock: 'in' });
    assert.equal(inStock.trackStock, true);
    assert.deepEqual(inStock.stock, { gt: 0 });

    const untracked = await whereFor({ stock: 'untracked' });
    assert.equal(untracked.trackStock, false);
    assert.equal('stock' in untracked, false, 'a count we do not keep must not be compared');
  });

  it('combines filters instead of letting the last one win', async () => {
    const where = await whereFor({ q: 'rice', status: 'active', stock: 'out', categoryId: 'cat_1' });

    assert.equal(where.shopId, 'shop_a');
    assert.equal(where.isActive, true);
    assert.equal(where.categoryId, 'cat_1');
    assert.equal(where.trackStock, true);
    assert.ok(Array.isArray(where.OR));
  });
});

describe('product list · the summary is about the shop, not the page', () => {
  it('counts the shop with no list filter applied', async () => {
    const { products, seen } = harness();
    await products.listForShop('shop_a', query({ q: 'oil', status: 'hidden', stock: 'out' }));

    // seen.countWhere[0] is the filtered total for `meta`; the rest are the summary.
    const summaryWheres = seen.countWhere.slice(1);
    assert.equal(summaryWheres.length, 4, 'four summary counts, no rows');
    for (const where of summaryWheres) {
      assert.equal(where.shopId, 'shop_a');
      assert.equal('OR' in where, false, 'the summary must not inherit the search term');
    }
    assert.deepEqual(summaryWheres.map((w) => JSON.stringify(w)).sort(), [
      JSON.stringify({ shopId: 'shop_a' }),
      JSON.stringify({ shopId: 'shop_a', isActive: true }),
      JSON.stringify({ shopId: 'shop_a', trackStock: false }),
      JSON.stringify({ shopId: 'shop_a', trackStock: true, stock: { lte: 0 } }),
    ].sort());
  });

  it('derives hidden by subtraction so total and active cannot disagree', async () => {
    const counts = [17, 12, 0, 0];
    let call = 0;
    const prisma = {
      product: {
        findMany: () => Promise.resolve([]),
        // The first count is `meta.total`; the four after it are the summary, in the
        // order `catalogSummary` awaits them.
        count: () => Promise.resolve(call === 0 ? (call++, 5) : (counts[call++ - 1] ?? 0)),
        groupBy: () => Promise.resolve([]),
      },
    } as unknown as PrismaService;

    const result = await new ProductsService(
      prisma,
      refusingUploads(),
      refusingStorage(),
    ).listForShop('shop_a', query({}));
    assert.equal(result.summary.total, 17);
    assert.equal(result.summary.active, 12);
    assert.equal(result.summary.hidden, 5);
  });

  it('returns the paging envelope alongside the summary', async () => {
    const { products } = harness();
    const result = await products.listForShop('shop_a', query({ page: 2, limit: 10 }));

    assert.deepEqual(result.data, []);
    assert.equal(result.meta.page, 2);
    assert.equal(result.meta.limit, 10);
    assert.ok('summary' in result);
  });
});

describe('product list · the category chips describe the shop', () => {
  it('rolls up categoryId over the whole shop, ignoring the list filter', async () => {
    const { products, seen } = harness([
      { categoryId: 'cat_b', _count: { _all: 3 } },
      { categoryId: null, _count: { _all: 2 } },
      { categoryId: 'cat_a', _count: { _all: 7 } },
    ]);
    const result = await products.listForShop(
      'shop_a',
      query({ q: 'oil', categoryId: 'cat_a', status: 'active' }),
    );

    // One groupBy, and its `where` is the shop alone. Chips built from the *filtered*
    // set would collapse to the one category as soon as a seller clicked it — a filter
    // UI that deletes its own alternatives.
    assert.equal(seen.groupWhere.length, 1);
    assert.deepEqual(seen.groupWhere[0], { shopId: 'shop_a' });
    assert.equal(result.summary.categories.length, 3);
  });

  it('names the uncategorised bucket null rather than dropping it', async () => {
    const { products } = harness([
      { categoryId: null, _count: { _all: 4 } },
      { categoryId: 'cat_a', _count: { _all: 1 } },
    ]);
    const { summary } = await products.listForShop('shop_a', query({}));

    const uncategorised = summary.categories.find((c) => c.categoryId === null);
    assert.ok(uncategorised, 'products with no category must still be countable');
    assert.equal(uncategorised.count, 4);
  });

  it('orders the chips deterministically so the row does not reshuffle between reads', async () => {
    const groups = [
      { categoryId: 'cat_c', _count: { _all: 1 } },
      { categoryId: null, _count: { _all: 1 } },
      { categoryId: 'cat_a', _count: { _all: 1 } },
      { categoryId: 'cat_b', _count: { _all: 1 } },
    ];
    const first = await harness(groups).products.listForShop('shop_a', query({}));
    const second = await harness([...groups].reverse()).products.listForShop('shop_a', query({}));

    assert.deepEqual(
      first.summary.categories.map((c) => c.categoryId),
      second.summary.categories.map((c) => c.categoryId),
      'the same rows in a different order must produce the same chip order',
    );
  });
});
