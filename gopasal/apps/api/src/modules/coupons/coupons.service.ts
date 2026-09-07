import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Coupon } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { paginate, type Paginated } from '../../common/dto/pagination.dto';
import type { ListShopCouponsQueryDto } from './dto/coupons.dto';

export interface CouponQuote {
  couponId: string;
  code: string;
  type: 'PERCENT' | 'FLAT';
  value: number;
  discount: number;
}

/**
 * The counts beside every page of a shop's coupons, over **every coupon the shop
 * has** and deliberately unaffected by `q` and `status`.
 *
 * These are the numbers the console's stat cards and filter badges render, and they
 * are claims about the shop: if they moved with the filter, clicking "Not running"
 * would rewrite "Running now" to zero.
 *
 * `redemptions` is `0` — not `null` — over a shop with no coupons. A sum of nothing
 * genuinely is nothing redeemed, unlike an average of nothing, which is not a rating.
 */
export interface ShopCouponSummary {
  total: number;
  running: number;
  idle: number;
  /** Sum of `usedCount`, the column the order transaction increments. Not an estimate. */
  redemptions: number;
  /**
   * The instant the running/idle ladder was evaluated, so the console can label each
   * row with the same clock the server filtered by. Without it a browser a minute
   * behind could print "Expired" on a row the server returned as running.
   */
  asOf: string;
}

/** `?q=` matches the code and nothing else — `Coupon` has no other text column. */
function couponSearchFilter(q: string | undefined): Prisma.CouponWhereInput | undefined {
  const term = q?.trim();
  if (!term) return undefined;
  return { code: { contains: term, mode: 'insensitive' } };
}

/**
 * "Checkout will accept this code right now", as SQL — the same ladder `quote` walks,
 * in the same order, so a list that calls a coupon running is a list of codes that
 * work.
 *
 * `usedCount < usageLimit` is a column-against-column comparison, which is why
 * `usageLimit` arrives as a Prisma field reference rather than a number. The two
 * `IS NULL` arms are load-bearing: a comparison against NULL is never true, so
 * without them every uncapped coupon (`usageLimit: null`) and every coupon with no
 * expiry would drop out of the running set.
 */
function runningCouponFilter(
  now: Date,
  usageLimit: Prisma.IntFieldRefInput<'Coupon'>,
): Prisma.CouponWhereInput {
  return {
    isActive: true,
    validFrom: { lte: now },
    AND: [
      { OR: [{ validTo: null }, { validTo: { gte: now } }] },
      { OR: [{ usageLimit: null }, { usedCount: { lt: usageLimit } }] },
    ],
  };
}

/**
 * The exact complement of {@link runningCouponFilter}, written out rather than as a
 * `NOT` over it.
 *
 * Spelled as the four ways a code fails, in the ladder's own order: the seller turned
 * it off, it has not started, it has ended, it has been used up. `isActive`,
 * `validFrom` and `usedCount` are all non-nullable, so negating each conjunct is
 * exact — and here the NULL semantics work *for* the query: `validTo < now` cannot
 * match a coupon with no expiry, and `usedCount >= usageLimit` cannot match an
 * uncapped one, which is precisely what "not expired" and "not used up" mean.
 */
function idleCouponFilter(
  now: Date,
  usageLimit: Prisma.IntFieldRefInput<'Coupon'>,
): Prisma.CouponWhereInput {
  return {
    OR: [
      { isActive: false },
      { validFrom: { gt: now } },
      { validTo: { lt: now } },
      { usedCount: { gte: usageLimit } },
    ],
  };
}

/**
 * Coupons can be platform-wide (shopId null) or scoped to a single shop.
 * `quote` validates + computes the discount without mutating anything; `redeem`
 * is called inside the order-creation transaction to lock in usage atomically.
 */
@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Validate a coupon for a user/shop/subtotal and return the computed discount. */
  async quote(code: string, userId: string, shopId: string, subtotal: number): Promise<CouponQuote> {
    const coupon = await this.prisma.coupon.findUnique({ where: { code: code.trim().toUpperCase() } });
    if (!coupon || !coupon.isActive) throw new BadRequestException('Invalid coupon');

    const now = new Date();
    if (coupon.validFrom > now) throw new BadRequestException('Coupon not active yet');
    if (coupon.validTo && coupon.validTo < now) throw new BadRequestException('Coupon expired');
    if (coupon.shopId && coupon.shopId !== shopId) throw new BadRequestException('Coupon not valid for this shop');
    if (subtotal < coupon.minOrder)
      throw new BadRequestException(`Minimum order Rs ${coupon.minOrder} for this coupon`);
    if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit)
      throw new BadRequestException('Coupon usage limit reached');

    const usedByUser = await this.prisma.couponRedemption.count({
      where: { couponId: coupon.id, userId },
    });
    if (usedByUser >= coupon.perUserLimit) throw new BadRequestException('Coupon already used');

    const discount = this.computeDiscount(coupon, subtotal);
    if (discount <= 0) throw new BadRequestException('Coupon gives no discount on this order');

    return { couponId: coupon.id, code: coupon.code, type: coupon.type, value: coupon.value, discount };
  }

  /** Record a redemption + bump usedCount. MUST run inside the order transaction. */
  async redeem(
    tx: Prisma.TransactionClient,
    couponId: string,
    userId: string,
    orderId: string,
    amount: number,
  ) {
    await tx.couponRedemption.create({ data: { couponId, userId, orderId, amount } });
    await tx.coupon.update({ where: { id: couponId }, data: { usedCount: { increment: 1 } } });
  }

  private computeDiscount(coupon: { type: string; value: number; maxDiscount: number | null }, subtotal: number) {
    let discount = coupon.type === 'PERCENT' ? Math.round((subtotal * coupon.value) / 100) : coupon.value;
    if (coupon.maxDiscount != null) discount = Math.min(discount, coupon.maxDiscount);
    return Math.min(discount, subtotal); // never exceed the order value
  }

  // ── management (seller shop-scoped) ─────────────────────────────────────────

  /**
   * One page of a shop's coupons, filtered and sorted by the database.
   *
   * This replaced `list({ shopId })`, which was `findMany({ where: { shopId } })` with
   * no `take`. Nothing prunes this table — `deactivate` writes `isActive: false` and no
   * route deletes a row — so the read grew for as long as the shop kept creating codes,
   * and the console then derived every status and every tally over whatever came back.
   *
   * One `now` serves the page filter, the summary and the `asOf` the console labels
   * rows with, so no two numbers on the screen can be answers about different instants.
   *
   * The platform-coupon read that used to share this method (`shopId: null`, and an
   * unfiltered `{}` for an admin) is gone: no controller ever called either, and a
   * second scope on a shop-scoped read is a cross-tenant query waiting for a caller.
   */
  async listForShopManage(
    shopId: string,
    query: ListShopCouponsQueryDto,
  ): Promise<Paginated<Coupon> & { summary: ShopCouponSummary }> {
    const now = new Date();
    const usageLimit = this.prisma.coupon.fields.usageLimit;
    const running = runningCouponFilter(now, usageLimit);

    const where: Prisma.CouponWhereInput = {
      shopId,
      ...(query.status === 'running' ? running : {}),
      ...(query.status === 'idle' ? idleCouponFilter(now, usageLimit) : {}),
      ...(couponSearchFilter(query.q) ?? {}),
    };

    const [rows, total, all, runningNow, used] = await Promise.all([
      this.prisma.coupon.findMany({
        where,
        orderBy: { createdAt: query.sort === 'oldest' ? 'asc' : 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.coupon.count({ where }),
      // The summary's three reads carry the shop and nothing from the query string.
      this.prisma.coupon.count({ where: { shopId } }),
      this.prisma.coupon.count({ where: { shopId, ...running } }),
      this.prisma.coupon.aggregate({ where: { shopId }, _sum: { usedCount: true } }),
    ]);

    return {
      ...paginate(rows, total, query.page, query.limit),
      summary: {
        total: all,
        running: runningNow,
        // Subtracted rather than counted again: `idle` is the complement of `running`,
        // and two independent counts could add up to something other than `total`.
        idle: all - runningNow,
        redemptions: used._sum.usedCount ?? 0,
        asOf: now.toISOString(),
      },
    };
  }

  async create(data: {
    code: string;
    shopId?: string | null;
    type: 'PERCENT' | 'FLAT';
    value: number;
    minOrder?: number;
    maxDiscount?: number | null;
    usageLimit?: number | null;
    perUserLimit?: number;
    validFrom?: Date;
    validTo?: Date | null;
  }) {
    const code = data.code.trim().toUpperCase();
    const exists = await this.prisma.coupon.findUnique({ where: { code } });
    if (exists) throw new BadRequestException('Coupon code already exists');
    if (data.type === 'PERCENT' && (data.value < 1 || data.value > 100))
      throw new BadRequestException('Percent value must be 1–100');
    return this.prisma.coupon.create({ data: { ...data, code } });
  }

  /**
   * A coupon PATCH, projected column by column.
   *
   * `data` was typed `Prisma.CouponUpdateInput` — the generated type, which admits
   * every column on the row: `code`, `shopId`, `type`, `value`, `usedCount`, and the
   * `redemptions` relation. Nothing sent any of them. The only caller is
   * `CouponsSellerController.update`, and `RequestValidationPipe` whitelists its body
   * down to `UpdateCouponDto`'s four properties, so the wide type was never reachable
   * from a request.
   *
   * It is narrowed anyway, because the DTO was the only thing doing that work: a
   * second caller — an admin route, a migration script, a scheduled job — would
   * inherit none of it and the signature would tell it that writing `usedCount` here
   * is fine. It is not. `usedCount` is the counter `redeem` increments inside the
   * checkout transaction to enforce `usageLimit`, so a coupon whose own edit route
   * can reset it has no usage limit at all. `products.service.ts` hand-projects its
   * PATCH columns for the same reason.
   *
   * Four keys, not a spread of `data`: a spread would carry whatever a future caller
   * put on the object, which is exactly the hole the type just closed.
   *
   * Neither `usageLimit` nor `validTo` is `| null` here, and that is not an omission
   * — no route can clear either one (`UpdateCouponDto.validTo` is an
   * `@IsDateString()`, and the controller converts a present value only). "Remove the
   * expiry from a live coupon" is a capability the platform does not have; typing it
   * as though it did would be the first half of pretending otherwise.
   */
  async update(
    id: string,
    shopScope: string | null,
    data: { isActive?: boolean; minOrder?: number; usageLimit?: number; validTo?: Date },
  ) {
    await this.mustOwn(id, shopScope);
    return this.prisma.coupon.update({
      where: { id },
      data: {
        isActive: data.isActive,
        minOrder: data.minOrder,
        usageLimit: data.usageLimit,
        validTo: data.validTo,
      },
    });
  }

  async deactivate(id: string, shopScope: string | null) {
    await this.mustOwn(id, shopScope);
    return this.prisma.coupon.update({ where: { id }, data: { isActive: false } });
  }

  /**
   * shopScope null = platform admin (may touch any). Otherwise must match shop.
   *
   * A seller who asks about somebody else's coupon gets the same `404` as one who asks
   * about a coupon that does not exist. The previous `400 "Coupon belongs to another
   * shop"` distinguished the two, which let a seller confirm a rival's coupon ids —
   * and coupon codes are guessable in a way product ids are not.
   */
  private async mustOwn(id: string, shopScope: string | null) {
    const coupon = await this.prisma.coupon.findUnique({ where: { id } });
    if (!coupon) throw new NotFoundException('Coupon not found');
    if (shopScope !== null && coupon.shopId !== shopScope)
      throw new NotFoundException('Coupon not found');
    return coupon;
  }
}
