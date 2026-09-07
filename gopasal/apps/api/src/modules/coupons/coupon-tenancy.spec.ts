import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { CouponsService } from './coupons.service';
import { ListShopCouponsQueryDto } from './dto/coupons.dto';

/**
 * Coupon tenancy: `mustOwn` is the only thing standing between a seller and another
 * shop's promotions, and a foreign coupon must answer exactly like an absent one.
 *
 * This matters more here than for products. A coupon `code` is chosen by a human and
 * is therefore guessable — `SAVE20`, `DASHAIN`, `NEWYEAR` — and the create route
 * already leaks global uniqueness (`'Coupon code already exists'` fires across shops,
 * because `code` is unique platform-wide). The id route used to add a second channel:
 * a `400 "Coupon belongs to another shop"` confirmed that a given id was a live row in
 * somebody else's shop, which the 404 for a nonexistent id did not. Both are 404 now.
 *
 * `shopScope: null` is the platform admin path and deliberately passes everything —
 * asserted here so the fix cannot be mistaken for "nobody may touch anything".
 */

interface CouponRow {
  id: string;
  code: string;
  shopId: string | null;
}

const MINE: CouponRow = { id: 'cpn_1', code: 'SAVE20', shopId: 'shop_a' };
const THEIRS: CouponRow = { id: 'cpn_2', code: 'DASHAIN', shopId: 'shop_b' };
const PLATFORM: CouponRow = { id: 'cpn_3', code: 'GOPASAL', shopId: null };

function harness(): { coupons: CouponsService; updates: string[] } {
  const updates: string[] = [];
  const rows = [MINE, THEIRS, PLATFORM];

  const prisma = {
    coupon: {
      findUnique: ({ where }: { where: { id?: string; code?: string } }) =>
        Promise.resolve(
          rows.find((c) => (where.id ? c.id === where.id : c.code === where.code)) ?? null,
        ),
      update: ({ where }: { where: { id: string } }) => {
        updates.push(where.id);
        return Promise.resolve(MINE);
      },
    },
  } as unknown as PrismaService;

  return { coupons: new CouponsService(prisma), updates };
}

async function expectNotFound(run: () => Promise<unknown>, updates: string[]): Promise<void> {
  await assert.rejects(run, (err: unknown) => {
    assert.ok(err instanceof NotFoundException, `expected a 404, got ${String(err)}`);
    assert.equal(err.message, 'Coupon not found');
    return true;
  });
  assert.deepEqual(updates, [], 'the write must not have been reached');
}

describe('cross-shop coupon writes', () => {
  it('refuses to patch another shop’s coupon', async () => {
    const { coupons, updates } = harness();
    await expectNotFound(() => coupons.update(THEIRS.id, 'shop_a', { isActive: false }), updates);
  });

  it('answers identically for a coupon id that does not exist', async () => {
    const { coupons, updates } = harness();
    await expectNotFound(() => coupons.update('cpn_nope', 'shop_a', { isActive: false }), updates);
  });

  it('refuses to deactivate another shop’s coupon', async () => {
    const { coupons, updates } = harness();
    await expectNotFound(() => coupons.deactivate(THEIRS.id, 'shop_a'), updates);
  });

  it('will not let a seller reach a platform-wide coupon either', async () => {
    const { coupons, updates } = harness();
    await expectNotFound(() => coupons.deactivate(PLATFORM.id, 'shop_a'), updates);
  });

  it('lets a shop touch its own coupon', async () => {
    const { coupons, updates } = harness();
    await coupons.update(MINE.id, 'shop_a', { minOrder: 500 });
    assert.deepEqual(updates, [MINE.id]);
  });

  it('lets the platform scope touch any coupon, including a shop’s', async () => {
    const { coupons, updates } = harness();
    await coupons.deactivate(THEIRS.id, null);
    await coupons.deactivate(PLATFORM.id, null);
    assert.deepEqual(updates, [THEIRS.id, PLATFORM.id]);
  });
});

/**
 * What a coupon PATCH is allowed to write.
 *
 * `update` used to take `Prisma.CouponUpdateInput` and hand it to Prisma whole. The
 * seller route was safe — `RequestValidationPipe` whitelists the body down to
 * `UpdateCouponDto`'s four properties — but the signature said any column was fair
 * game, and `usedCount` is one of them: it is the counter checkout increments to
 * enforce `usageLimit`, so a coupon able to reset it through its own edit route has
 * no usage limit.
 *
 * The service now projects four keys by name. This test calls it the way a careless
 * future caller would, in TypeScript's own terms — through a cast, because the
 * narrowed signature is exactly what stops this at compile time — and asserts that
 * what reaches Prisma is still only those four.
 */
describe('coupon PATCH · only the four columns a coupon edit owns', () => {
  it('drops anything else on the way to the database', async () => {
    const written: Record<string, unknown>[] = [];
    const prisma = {
      coupon: {
        findUnique: () => Promise.resolve(MINE),
        update: ({ data }: { data: Record<string, unknown> }) => {
          written.push(data);
          return Promise.resolve(MINE);
        },
      },
    } as unknown as PrismaService;
    const coupons = new CouponsService(prisma);

    await coupons.update(MINE.id, 'shop_a', {
      isActive: true,
      minOrder: 500,
      usageLimit: 10,
      validTo: new Date('2026-10-01T00:00:00.000Z'),
      // None of these are on the parameter type. A caller that got past the compiler
      // — a spread of a request body, a script, an `as any` — must still not land them.
      usedCount: 0,
      shopId: 'shop_b',
      code: 'STOLEN',
      type: 'FLAT',
      value: 9999,
    } as unknown as { isActive?: boolean });

    assert.equal(written.length, 1);
    assert.deepEqual(Object.keys(written[0] ?? {}).sort(), ['isActive', 'minOrder', 'usageLimit', 'validTo']);
    assert.equal(written[0]?.usageLimit, 10);
    assert.equal(written[0]?.minOrder, 500);
  });

  it('leaves an omitted column alone rather than nulling it', async () => {
    const written: Record<string, unknown>[] = [];
    const prisma = {
      coupon: {
        findUnique: () => Promise.resolve(MINE),
        update: ({ data }: { data: Record<string, unknown> }) => {
          written.push(data);
          return Promise.resolve(MINE);
        },
      },
    } as unknown as PrismaService;

    await new CouponsService(prisma).update(MINE.id, 'shop_a', { isActive: false });

    // Every key is present but three are `undefined`, which is Prisma's "do not
    // change this column" — not `null`, which would clear an expiry or a limit.
    assert.equal(written[0]?.isActive, false);
    assert.equal(written[0]?.validTo, undefined);
    assert.equal(written[0]?.usageLimit, undefined);
    assert.equal(written[0]?.minOrder, undefined);
    assert.ok(!Object.values(written[0] ?? {}).includes(null), 'a PATCH must not send null for an absent field');
  });
});

describe('coupon list scoping', () => {
  /**
   * Every read the list issues carries the shop — the page, the page's count, and all
   * three shop-wide summary reads.
   *
   * This used to guard a `list(scope)` that could be called three ways: one shop's
   * rows, the platform's rows (`shopId: null`), or an unfiltered `{}` for an admin.
   * No controller ever asked for the second or the third, so `listForShopManage` now
   * takes a `shopId` and offers no other scope: an unfiltered coupon read is a
   * cross-tenant query waiting for a caller, and the only way to be sure one can't
   * appear is for there to be no code path that produces it.
   *
   * The `where` *shapes* are asserted in `coupon-list-query.spec.ts`. What this asks is
   * narrower and blunter: does anything at all go to the database without the tenant on
   * it, whatever the query string says.
   */
  it('puts the shop on every read, including the summary', async () => {
    const seen: { where: unknown }[] = [];
    const record = (args: { where: unknown }) => {
      seen.push({ where: args.where });
    };
    const prisma = {
      coupon: {
        fields: { usageLimit: { _ref: 'usageLimit', _container: 'Coupon' } },
        findMany: (args: { where: unknown }) => {
          record(args);
          return Promise.resolve([]);
        },
        count: (args: { where: unknown }) => {
          record(args);
          return Promise.resolve(0);
        },
        aggregate: (args: { where: unknown }) => {
          record(args);
          return Promise.resolve({ _sum: { usedCount: null } });
        },
      },
    } as unknown as PrismaService;
    const coupons = new CouponsService(prisma);

    // The widest query string the DTO allows, so no filter can be what supplies the shop.
    await coupons.listForShopManage('shop_a', new ListShopCouponsQueryDto());

    // findMany, the filtered count, then the three summary reads.
    assert.equal(seen.length, 5);
    for (const { where } of seen) {
      assert.equal(
        (where as { shopId?: unknown }).shopId,
        'shop_a',
        `every coupon read must name the shop, got ${JSON.stringify(where)}`,
      );
    }
  });
});
