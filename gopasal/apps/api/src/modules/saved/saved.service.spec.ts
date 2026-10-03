/* eslint-disable @typescript-eslint/require-await -- Prisma-shaped fakes preserve the service's async contract. */
import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NotFoundException } from "@nestjs/common";
import { IS_PUBLIC_KEY } from "../../auth/decorators/public.decorator";
import type { PrismaService } from "../../common/prisma/prisma.service";
import type { PaginationDto } from "../../common/dto/pagination.dto";
import type { StorageProvider } from "../../providers/storage.provider";
import {
  DELIVERABLE_PRODUCT_WHERE,
  STOREFRONT_SHOP_WHERE,
} from "../catalog/storefront-eligibility";
import { SavedController } from "./saved.controller";
import { SavedService } from "./saved.service";

function storage(): StorageProvider {
  return {
    name: "test",
    save: async () => ({ key: "", url: null }),
    read: async () => Buffer.alloc(0),
    remove: async () => undefined,
    publicUrl: (key) => `https://files.test/${key}`,
  };
}

const page = { page: 1, limit: 20, skip: 0 } as PaginationDto;

describe("saved-item authentication and ownership boundaries", () => {
  it("keeps every route behind the global authentication guard", () => {
    assert.notEqual(Reflect.getMetadata(IS_PUBLIC_KEY, SavedController), true);
  });

  it("uses an idempotent upsert owned by the authenticated user", async () => {
    let upsert: Record<string, unknown> | undefined;
    let lookup: Record<string, unknown> | undefined;
    const prisma = {
      shop: {
        findFirst: async (args: Record<string, unknown>) => {
          lookup = args;
          return { id: "shop-one" };
        },
      },
      savedShop: {
        upsert: async (args: Record<string, unknown>) => {
          upsert = args;
          return {};
        },
      },
    };
    const service = new SavedService(prisma as unknown as PrismaService, storage());
    assert.deepEqual(await service.saveShop("user-one", "shop-one"), {
      saved: true,
      shopId: "shop-one",
    });
    assert.deepEqual(
      (lookup?.where as Record<string, unknown>).products,
      STOREFRONT_SHOP_WHERE.products,
    );
    assert.deepEqual(upsert, {
      where: { userId_shopId: { userId: "user-one", shopId: "shop-one" } },
      create: { userId: "user-one", shopId: "shop-one" },
      update: {},
    });
  });

  it("cannot remove another customer’s saved row", async () => {
    let deletedWhere: unknown;
    const prisma = {
      savedProduct: {
        deleteMany: async (args: { where: unknown }) => {
          deletedWhere = args.where;
          return { count: 0 };
        },
      },
    };
    const service = new SavedService(prisma as unknown as PrismaService, storage());
    await service.removeProduct("user-one", "product-one");
    assert.deepEqual(deletedWhere, { userId: "user-one", productId: "product-one" });
  });
});

describe("saved-item storefront truthfulness", () => {
  it("refuses to newly save a shop that is not discoverable", async () => {
    let writes = 0;
    const prisma = {
      shop: { findFirst: async () => null },
      savedShop: {
        upsert: async () => {
          writes += 1;
        },
      },
    };
    const service = new SavedService(prisma as unknown as PrismaService, storage());
    await assert.rejects(() => service.saveShop("user-one", "hidden-shop"), NotFoundException);
    assert.equal(writes, 0);
  });

  it("checks both product stock and shop eligibility before saving", async () => {
    let lookup: { where: Record<string, unknown> } | undefined;
    const prisma = {
      product: {
        findFirst: async (args: { where: Record<string, unknown> }) => {
          lookup = args;
          return { id: "product-one" };
        },
      },
      savedProduct: { upsert: async () => ({}) },
    };
    const service = new SavedService(prisma as unknown as PrismaService, storage());
    await service.saveProduct("user-one", "product-one");
    assert.equal(lookup?.where.shop, STOREFRONT_SHOP_WHERE);
    assert.equal(lookup?.where.OR, DELIVERABLE_PRODUCT_WHERE.OR);
  });

  it("keeps a previously saved shop visible when it becomes unavailable", async () => {
    const createdAt = new Date("2026-09-13T00:00:00.000Z");
    const prisma = {
      savedShop: {
        findMany: async () => [
          {
            id: "saved-one",
            userId: "user-one",
            shopId: "shop-one",
            createdAt,
            shop: { id: "shop-one", name: "Temporarily closed" },
          },
        ],
        count: async () => 1,
      },
      shop: { findMany: async () => [] },
    };
    const service = new SavedService(prisma as unknown as PrismaService, storage());
    const result = await service.listShops("user-one", page);
    assert.equal(result.data.length, 1);
    assert.equal(result.data[0]?.available, false);
    assert.equal(result.data[0]?.shop.id, "shop-one");
  });
});
