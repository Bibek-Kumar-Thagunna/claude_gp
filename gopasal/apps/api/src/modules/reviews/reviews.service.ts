import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { paginate } from '../../common/dto/pagination.dto';
import type { ListShopReviewsQueryDto } from './dto/reviews.dto';

/**
 * Shop-wide counts that travel alongside a page of reviews.
 *
 * About the shop, not the page: a seller filtering to "1–2 stars" still needs to
 * see how many reviews are unanswered and what the shop's rating actually is.
 */
export interface ShopReviewSummary {
  total: number;
  /** The shop has posted a `sellerReply`. */
  answered: number;
  unanswered: number;
  /** 1 or 2 stars — the ones worth reading first. */
  lowRated: number;
  /**
   * Mean rating over every review the shop has, or `null` when it has none.
   *
   * `null` rather than `0`: a shop with no reviews does not have a zero-star
   * rating, and rendering one would be an invented number.
   */
  averageRating: number | null;
}

/**
 * Free-text search over the two things a seller has to hand when a review comes up:
 * the words the customer wrote, and the order code they can match it against.
 *
 * `contains` is a sequential scan, which the `(shopId, createdAt)` index has already
 * narrowed to one tenant. The customer's name is deliberately not searchable here —
 * reviews are shown with a name but are not a customer directory, and searching
 * people by name from a shop console is a wider capability than this endpoint owes.
 */
function reviewSearchFilter(q: string | undefined): Prisma.ReviewWhereInput | undefined {
  const term = q?.trim();
  if (!term) return undefined;
  return {
    OR: [
      { comment: { contains: term, mode: 'insensitive' } },
      { order: { code: { contains: term, mode: 'insensitive' } } },
    ],
  };
}

/** `answered=true` → a reply exists; `false` → it does not. `undefined` → no filter. */
function answeredFilter(answered: boolean | undefined): Prisma.ReviewWhereInput | undefined {
  if (answered === undefined) return undefined;
  return answered ? { sellerReply: { not: null } } : { sellerReply: null };
}

/**
 * Reviews are tied to a delivered order (one review per order) and always carry
 * the shop; an optional productId lets a review also surface on a product page.
 */
@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async createForOrder(userId: string, orderId: string, input: { rating: number; comment?: string; productId?: string }) {
    if (input.rating < 1 || input.rating > 5) throw new BadRequestException('Rating must be 1–5');
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { review: true } });
    if (!order || order.customerId !== userId) throw new NotFoundException('Order not found');
    if (order.status !== 'DELIVERED') throw new BadRequestException('You can review only delivered orders');
    if (order.review) throw new BadRequestException('You already reviewed this order');

    if (input.productId) {
      const belongs = await this.prisma.orderItem.findFirst({ where: { orderId, productId: input.productId } });
      if (!belongs) throw new BadRequestException('That product is not in this order');
    }

    return this.prisma.review.create({
      data: {
        orderId,
        shopId: order.shopId,
        productId: input.productId ?? null,
        customerId: userId,
        rating: input.rating,
        comment: input.comment,
      },
    });
  }

  async listForShop(shopId: string) {
    const [reviews, agg] = await Promise.all([
      this.prisma.review.findMany({
        where: { shopId },
        orderBy: { createdAt: 'desc' },
        include: { customer: { select: { name: true } } },
        take: 100,
      }),
      this.prisma.review.aggregate({ where: { shopId }, _avg: { rating: true }, _count: true }),
    ]);
    return { averageRating: agg._avg.rating ?? 0, count: agg._count, reviews };
  }

  /**
   * One page of the shop's reviews, plus a summary of every review it has.
   *
   * This used to be `findMany({ where: { shopId } })` with no `take`: one review
   * exists per delivered order, customers write them, and a shop cannot delete
   * them, so the read grew for as long as the shop kept selling. The console then
   * filtered and tallied that array in the browser.
   *
   * The `summary` is why this is not a plain `paginate()` call. The console's tally
   * cards — total, unanswered, low-rated, average — describe the shop, so paging
   * the rows without answering the counts separately would have turned four true
   * numbers into four numbers about an arbitrary twenty reviews. It deliberately
   * ignores `q`, `answered` and `rating`: narrowing the view must not change what
   * the shop's rating is.
   *
   * `orderBy: createdAt` matches the `(shopId, createdAt)` index, so the page comes
   * back without a sort.
   */
  async listForShopManage(shopId: string, query: ListShopReviewsQueryDto) {
    const where: Prisma.ReviewWhereInput = {
      shopId,
      ...(query.rating?.length ? { rating: { in: query.rating } } : {}),
      ...(answeredFilter(query.wantsAnswered) ?? {}),
      ...(reviewSearchFilter(query.q) ?? {}),
    };

    const [rows, total, summary] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: query.sort === 'oldest' ? 'asc' : 'desc' },
        skip: query.skip,
        take: query.limit,
        include: { customer: { select: { name: true } }, order: { select: { code: true } } },
      }),
      this.prisma.review.count({ where }),
      this.reviewSummary(shopId),
    ]);

    return { ...paginate(rows, total, query.page, query.limit), summary };
  }

  /**
   * Counts for the whole shop, independent of the current page and filters.
   *
   * The rating breakdown comes from one `groupBy`, so "low-rated" is derived from the
   * same numbers the average is, rather than from a second query that could disagree
   * with it mid-write.
   */
  private async reviewSummary(shopId: string): Promise<ShopReviewSummary> {
    const [groups, answered, agg] = await Promise.all([
      this.prisma.review.groupBy({
        by: ['rating'],
        where: { shopId },
        _count: { _all: true },
      }),
      this.prisma.review.count({ where: { shopId, sellerReply: { not: null } } }),
      this.prisma.review.aggregate({ where: { shopId }, _avg: { rating: true } }),
    ]);

    const total = groups.reduce((sum, g) => sum + g._count._all, 0);
    const lowRated = groups
      .filter((g) => g.rating <= 2)
      .reduce((sum, g) => sum + g._count._all, 0);

    return {
      total,
      answered,
      unanswered: total - answered,
      lowRated,
      averageRating: agg._avg.rating,
    };
  }

  async reply(shopId: string, reviewId: string, sellerReply: string) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review || review.shopId !== shopId) throw new NotFoundException('Review not found');
    return this.prisma.review.update({ where: { id: reviewId }, data: { sellerReply } });
  }

  async listMine(userId: string) {
    return this.prisma.review.findMany({ where: { customerId: userId }, orderBy: { createdAt: 'desc' } });
  }
}
