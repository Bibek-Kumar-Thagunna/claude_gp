import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { paginate, type PaginationDto } from '../../common/dto/pagination.dto';
import {
  DELIVERABLE_PRODUCT_WHERE,
  STOREFRONT_SHOP_WHERE,
  storefrontReadiness,
} from './storefront-eligibility';

export interface CreateShopInput {
  name: string;
  nameNp?: string;
  description?: string;
  categoryId?: string;
  phone?: string;
  area?: string;
  fullAddress?: string;
  lat?: number;
  lng?: number;
  locationAccuracyM?: number;
  locationCapturedAt?: Date;
  locationCaptureMethod?: string;
  deliveryRadiusKm?: number;
  emoji?: string;
  hours?: string;
  soloMode?: boolean;
}

@Injectable()
export class ShopsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── public storefront ────────────────────────────────────────────────
  async listPublic(pagination: PaginationDto, categoryId?: string) {
    const where: Prisma.ShopWhereInput = {
      ...STOREFRONT_SHOP_WHERE,
      ...(categoryId ? { categoryId } : {}),
      ...(pagination.q
        ? { OR: [{ name: { contains: pagination.q, mode: 'insensitive' as const } }, { area: { contains: pagination.q, mode: 'insensitive' as const } }] }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.shop.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: [{ ratingAvg: 'desc' }, { ratingCount: 'desc' }],
        include: {
          category: true,
          _count: { select: { products: { where: DELIVERABLE_PRODUCT_WHERE } } },
        },
      }),
      this.prisma.shop.count({ where }),
    ]);
    return paginate(rows, total, pagination.page, pagination.limit);
  }

  async getBySlug(slug: string) {
    const shop = await this.prisma.shop.findFirst({
      where: { slug, ...STOREFRONT_SHOP_WHERE },
      include: {
        category: true,
        _count: {
          select: { products: { where: DELIVERABLE_PRODUCT_WHERE }, reviews: true },
        },
      },
    });
    if (!shop) throw new NotFoundException('Shop not found');
    return shop;
  }

  // ── owner / seller ───────────────────────────────────────────────────
  /**
   * Create a shop and grant its owner the seeded privileged Owner role.
   *
   * There is deliberately no self-service route into this method. A shop exists
   * because GoPasal approved a `ShopApplication`, so the only caller is the
   * onboarding approval path — which passes its own transaction client, because
   * the shop, the Owner membership and the application back-link have to land
   * together or not at all.
   *
   * `ACTIVE` rather than `PENDING`: the review that `PENDING` exists to wait for
   * has already happened by the time an application is approved.
   */
  async provisionApprovedShop(
    tx: Prisma.TransactionClient,
    ownerId: string,
    input: CreateShopInput,
    slug: string,
  ) {
    const ownerRole = await tx.role.findFirst({
      where: { scope: 'SHOP', isSystem: true, isPrivileged: true, shopId: null },
    });
    if (!ownerRole) {
      throw new BadRequestException('RBAC not seeded: missing Owner role. Run the seed first.');
    }

    const shop = await tx.shop.create({
      data: {
        slug,
        name: input.name,
        nameNp: input.nameNp,
        description: input.description,
        categoryId: input.categoryId,
        ownerId,
        phone: input.phone,
        area: input.area,
        fullAddress: input.fullAddress,
        lat: input.lat,
        lng: input.lng,
        locationAccuracyM: input.locationAccuracyM,
        locationCapturedAt: input.locationCapturedAt,
        locationCaptureMethod: input.locationCaptureMethod,
        deliveryRadiusKm: input.deliveryRadiusKm ?? 3,
        hours: input.hours,
        soloMode: input.soloMode ?? false,
        emoji: input.emoji,
        status: 'ACTIVE',
        verified: true,
        approvedAt: new Date(),
      },
    });

    // upsert, not create: a retried approval must not fail on, or duplicate,
    // a membership this user already holds for this shop.
    await tx.shopMembership.upsert({
      where: { userId_shopId: { userId: ownerId, shopId: shop.id } },
      create: { userId: ownerId, shopId: shop.id, roleId: ownerRole.id, status: 'ACTIVE' },
      update: { roleId: ownerRole.id, status: 'ACTIVE' },
    });

    return shop;
  }

  /** Shops the user owns or is an active member of (for the seller surface). */
  async mine(userId: string) {
    const memberships = await this.prisma.shopMembership.findMany({
      where: { userId, status: 'ACTIVE' },
      include: {
        shop: { include: { _count: { select: { products: true, orders: true } } } },
        role: { select: { name: true, isPrivileged: true } },
      },
    });
    const counts = memberships.length
      ? await this.prisma.product.groupBy({
          by: ['shopId'],
          where: { shopId: { in: memberships.map((m) => m.shop.id) }, ...DELIVERABLE_PRODUCT_WHERE },
          _count: { _all: true },
        })
      : [];
    const byShop = new Map(counts.map((row) => [row.shopId, row._count._all]));
    return memberships.map((m) => {
      const deliverableProductCount = byShop.get(m.shop.id) ?? 0;
      return {
        ...m.shop,
        myRole: m.role,
        storefront: storefrontReadiness(m.shop, deliverableProductCount),
      };
    });
  }

  async getForManage(shopId: string) {
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      include: { category: true, _count: { select: { products: true, orders: true, memberships: true } } },
    });
    if (!shop) throw new NotFoundException('Shop not found');
    const deliverableProductCount = await this.prisma.product.count({
      where: { shopId, ...DELIVERABLE_PRODUCT_WHERE },
    });
    return { ...shop, storefront: storefrontReadiness(shop, deliverableProductCount) };
  }

  async update(shopId: string, input: Partial<CreateShopInput> & { isOpen?: boolean; hours?: string; minOrder?: number; soloMode?: boolean }) {
    await this.exists(shopId);
    return this.prisma.shop.update({ where: { id: shopId }, data: input });
  }

  private async exists(shopId: string) {
    const s = await this.prisma.shop.findUnique({ where: { id: shopId }, select: { id: true } });
    if (!s) throw new NotFoundException('Shop not found');
  }

  /**
   * A storefront slug that is free *right now*. Public because the approval path
   * needs one before it opens its transaction — duplicating this logic there is
   * how two shops end up with slugs that differ only by suffix rules.
   *
   * This is advisory, not a reservation: `Shop.slug` is `@unique`, so the caller
   * still has to handle P2002 if another approval lands in between.
   */
  async uniqueSlug(name: string): Promise<string> {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 40) || 'shop';
    let slug = base;
    let n = 1;
    while (await this.prisma.shop.findUnique({ where: { slug }, select: { id: true } })) {
      slug = `${base}-${++n}`;
    }
    return slug;
  }
}
