import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Coupon, Prisma } from '@prisma/client';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { CouponsService } from './coupons.service';

const NOW = new Date('2026-09-14T10:00:00.000Z');

function coupon(overrides: Partial<Coupon> = {}): Coupon {
  return {
    id: 'coupon_available',
    code: 'WELCOME100',
    shopId: null,
    type: 'FLAT',
    value: 100,
    minOrder: 500,
    maxDiscount: null,
    usageLimit: null,
    perUserLimit: 1,
    usedCount: 0,
    validFrom: new Date('2026-01-01T00:00:00.000Z'),
    validTo: null,
    isActive: true,
    createdAt: NOW,
    ...overrides,
  };
}

describe('customer coupon eligibility', () => {
  it('does not advertise a coupon after this customer reaches its active use limit', async () => {
    const rows = [
      coupon({ id: 'coupon_used', code: 'USED100' }),
      coupon({ id: 'coupon_available', code: 'FRESH100' }),
    ];
    let redemptionWhere: Prisma.CouponRedemptionWhereInput | undefined;
    const prisma = {
      shop: { findFirst: () => Promise.resolve({ id: 'shop_1' }) },
      coupon: {
        fields: { usageLimit: { _ref: 'usageLimit', _container: 'Coupon' } },
        findMany: () => Promise.resolve(rows),
      },
      couponRedemption: {
        groupBy: (args: { where: Prisma.CouponRedemptionWhereInput }) => {
          redemptionWhere = args.where;
          return Promise.resolve([{ couponId: 'coupon_used', _count: { _all: 1 } }]);
        },
      },
    } as unknown as PrismaService;

    const offers = await new CouponsService(prisma).listCustomerOffers('namaste-kirana', 'user_1');

    assert.deepEqual(offers.map((offer) => offer.code), ['FRESH100']);
    assert.equal(redemptionWhere?.userId, 'user_1');
    assert.equal(redemptionWhere?.releasedAt, null);
  });

  it('does not let a released redemption make preview say already used', async () => {
    const seen: Prisma.CouponRedemptionWhereInput[] = [];
    const row = coupon();
    const db = {
      coupon: { findUnique: () => Promise.resolve(row) },
      couponRedemption: {
        count: ({ where }: { where: Prisma.CouponRedemptionWhereInput }) => {
          seen.push(where);
          return Promise.resolve(0);
        },
      },
    } as unknown as Pick<Prisma.TransactionClient, 'coupon' | 'couponRedemption'>;

    const quote = await new CouponsService({} as PrismaService).quote(
      row.code,
      'user_1',
      'shop_1',
      600,
      db,
    );

    assert.equal(quote.discount, 100);
    assert.deepEqual(seen[0], {
      couponId: row.id,
      userId: 'user_1',
      releasedAt: null,
    });
  });
});
