import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { paginate, type PaginationDto } from "../../common/dto/pagination.dto";
import { STORAGE_PROVIDER, type StorageProvider } from "../../providers/storage.provider";
import { withImageUrlsAll } from "../catalog/product-images";
import {
  DELIVERABLE_PRODUCT_WHERE,
  STOREFRONT_SHOP_WHERE,
} from "../catalog/storefront-eligibility";

const ID_SYNC_LIMIT = 2_000;

@Injectable()
export class SavedService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async ids(userId: string) {
    const [shops, products, shopTotal, productTotal] = await Promise.all([
      this.prisma.savedShop.findMany({
        where: { userId },
        select: { shopId: true },
        orderBy: { createdAt: "desc" },
        take: ID_SYNC_LIMIT,
      }),
      this.prisma.savedProduct.findMany({
        where: { userId },
        select: { productId: true },
        orderBy: { createdAt: "desc" },
        take: ID_SYNC_LIMIT,
      }),
      this.prisma.savedShop.count({ where: { userId } }),
      this.prisma.savedProduct.count({ where: { userId } }),
    ]);
    return {
      shopIds: shops.map((row) => row.shopId),
      productIds: products.map((row) => row.productId),
      totals: { shops: shopTotal, products: productTotal },
      truncated: shopTotal > ID_SYNC_LIMIT || productTotal > ID_SYNC_LIMIT,
    };
  }

  async saveShop(userId: string, shopId: string) {
    const shop = await this.prisma.shop.findFirst({
      where: { id: shopId, ...STOREFRONT_SHOP_WHERE },
      select: { id: true },
    });
    if (!shop) throw new NotFoundException("Shop is not available to save");
    await this.prisma.savedShop.upsert({
      where: { userId_shopId: { userId, shopId } },
      create: { userId, shopId },
      update: {},
    });
    return { saved: true as const, shopId };
  }

  async removeShop(userId: string, shopId: string) {
    await this.prisma.savedShop.deleteMany({ where: { userId, shopId } });
    return { saved: false as const, shopId };
  }

  async saveProduct(userId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, ...DELIVERABLE_PRODUCT_WHERE, shop: STOREFRONT_SHOP_WHERE },
      select: { id: true },
    });
    if (!product) throw new NotFoundException("Product is not available to save");
    await this.prisma.savedProduct.upsert({
      where: { userId_productId: { userId, productId } },
      create: { userId, productId },
      update: {},
    });
    return { saved: true as const, productId };
  }

  async removeProduct(userId: string, productId: string) {
    await this.prisma.savedProduct.deleteMany({ where: { userId, productId } });
    return { saved: false as const, productId };
  }

  async listShops(userId: string, query: PaginationDto) {
    const where: Prisma.SavedShopWhereInput = { userId };
    const [rows, total] = await Promise.all([
      this.prisma.savedShop.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: query.skip,
        take: query.limit,
        include: { shop: { include: { category: true } } },
      }),
      this.prisma.savedShop.count({ where }),
    ]);
    const availableIds = rows.length
      ? await this.prisma.shop.findMany({
          where: { id: { in: rows.map((row) => row.shopId) }, ...STOREFRONT_SHOP_WHERE },
          select: { id: true },
        })
      : [];
    const available = new Set(availableIds.map((row) => row.id));
    return paginate(
      rows.map((row) => ({
        id: row.id,
        savedAt: row.createdAt,
        available: available.has(row.shopId),
        shop: row.shop,
      })),
      total,
      query.page,
      query.limit,
    );
  }

  async listProducts(userId: string, query: PaginationDto) {
    const where: Prisma.SavedProductWhereInput = { userId };
    const [rows, total] = await Promise.all([
      this.prisma.savedProduct.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: query.skip,
        take: query.limit,
        include: {
          product: {
            include: {
              category: true,
              variants: { where: { isActive: true } },
              shop: { include: { category: true } },
            },
          },
        },
      }),
      this.prisma.savedProduct.count({ where }),
    ]);
    const availableIds = rows.length
      ? await this.prisma.product.findMany({
          where: {
            id: { in: rows.map((row) => row.productId) },
            ...DELIVERABLE_PRODUCT_WHERE,
            shop: STOREFRONT_SHOP_WHERE,
          },
          select: { id: true },
        })
      : [];
    const available = new Set(availableIds.map((row) => row.id));
    const products = withImageUrlsAll(
      this.storage,
      rows.map((row) => row.product),
    );
    return paginate(
      rows.map((row, index) => ({
        id: row.id,
        savedAt: row.createdAt,
        available: available.has(row.productId),
        product: products[index],
      })),
      total,
      query.page,
      query.limit,
    );
  }
}
