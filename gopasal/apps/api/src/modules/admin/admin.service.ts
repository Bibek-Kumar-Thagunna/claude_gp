import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ShopStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Platform operations: shop approval lifecycle, user management, catalog
 * moderation, and the headline analytics for the admin dashboard. All state
 * changes are invoked from audit-logged controllers.
 */
@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Shops ──────────────────────────────────────────────────────────────
  listShops(status?: ShopStatus, q?: string) {
    return this.prisma.shop.findMany({
      where: {
        status,
        ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { slug: { contains: q, mode: 'insensitive' } }] } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: { owner: { select: { name: true, phone: true } }, _count: { select: { products: true, orders: true } } },
      take: 200,
    });
  }

  async getShop(shopId: string) {
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      include: { owner: { select: { name: true, phone: true } }, _count: { select: { products: true, orders: true, memberships: true } } },
    });
    if (!shop) throw new NotFoundException('Shop not found');
    return shop;
  }

  async approveShop(shopId: string) {
    const shop = await this.getShop(shopId);
    if (shop.status === 'ACTIVE') throw new BadRequestException('Shop is already active');
    return this.prisma.shop.update({
      where: { id: shopId },
      data: { status: 'ACTIVE', verified: true, approvedAt: new Date() },
    });
  }

  async rejectShop(shopId: string) {
    await this.getShop(shopId);
    return this.prisma.shop.update({ where: { id: shopId }, data: { status: 'REJECTED' } });
  }

  async suspendShop(shopId: string) {
    await this.getShop(shopId);
    return this.prisma.shop.update({ where: { id: shopId }, data: { status: 'SUSPENDED', isOpen: false } });
  }

  async reactivateShop(shopId: string) {
    const shop = await this.getShop(shopId);
    if (shop.status !== 'SUSPENDED') throw new BadRequestException('Only suspended shops can be reactivated');
    return this.prisma.shop.update({ where: { id: shopId }, data: { status: 'ACTIVE' } });
  }

  // ── Users ──────────────────────────────────────────────────────────────
  listUsers(q?: string) {
    return this.prisma.user.findMany({
      where: q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }] } : {},
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, phone: true, status: true, isPlatformStaff: true, createdAt: true,
        _count: { select: { orders: true, ownedShops: true } },
      },
      take: 200,
    });
  }

  async suspendUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.isPlatformStaff) throw new BadRequestException('Platform staff cannot be suspended here');
    return this.prisma.user.update({ where: { id: userId }, data: { status: 'SUSPENDED' } });
  }

  async reactivateUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return this.prisma.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } });
  }

  // ── Catalog moderation ───────────────────────────────────────────────────
  async moderateProduct(productId: string, isActive: boolean) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');
    return this.prisma.product.update({ where: { id: productId }, data: { isActive } });
  }

  // ── Analytics ──────────────────────────────────────────────────────────
  async overview() {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [shopsByStatus, ordersByStatus, gmv, users, newUsers, recentOrders, riders] = await Promise.all([
      this.prisma.shop.groupBy({ by: ['status'], _count: true }),
      this.prisma.order.groupBy({ by: ['status'], _count: true }),
      this.prisma.order.aggregate({ where: { status: 'DELIVERED' }, _sum: { total: true } }),
      this.prisma.user.count({ where: { status: 'ACTIVE' } }),
      this.prisma.user.count({ where: { createdAt: { gte: since } } }),
      this.prisma.order.count({ where: { createdAt: { gte: since } } }),
      this.prisma.rider.count(),
    ]);

    const shopCounts = Object.fromEntries(shopsByStatus.map((s) => [s.status, s._count]));
    const orderCounts = Object.fromEntries(ordersByStatus.map((o) => [o.status, o._count]));

    return {
      gmv: gmv._sum.total ?? 0,
      shops: {
        total: shopsByStatus.reduce((s, x) => s + x._count, 0),
        pending: shopCounts['PENDING'] ?? 0,
        active: shopCounts['ACTIVE'] ?? 0,
        suspended: shopCounts['SUSPENDED'] ?? 0,
        byStatus: shopCounts,
      },
      orders: {
        total: ordersByStatus.reduce((s, x) => s + x._count, 0),
        last7Days: recentOrders,
        byStatus: orderCounts,
      },
      users: { active: users, newLast7Days: newUsers },
      riders,
    };
  }

  /** Simple daily order + GMV series for the dashboard chart (last N days). */
  async ordersTrend(days = 14) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.$queryRaw<{ day: Date; orders: bigint; gmv: bigint }[]>`
      SELECT date_trunc('day', "createdAt") AS day,
             count(*)::bigint AS orders,
             coalesce(sum(CASE WHEN status = 'DELIVERED' THEN total ELSE 0 END), 0)::bigint AS gmv
      FROM "Order"
      WHERE "createdAt" >= ${since}
      GROUP BY 1
      ORDER BY 1 ASC`;
    return rows.map((r) => ({ day: r.day, orders: Number(r.orders), gmv: Number(r.gmv) }));
  }
}
