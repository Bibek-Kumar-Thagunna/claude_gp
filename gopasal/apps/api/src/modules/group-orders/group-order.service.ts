import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { customAlphabet } from "nanoid";
import { PrismaService } from "../../common/prisma/prisma.service";
import { OrdersService } from "../orders/orders.service";
import { CheckoutDto } from "../orders/dto/orders.dto";
import type { CheckoutQuoteDto } from "../orders/dto/orders.dto";
import { STOREFRONT_SHOP_WHERE } from "../catalog/storefront-eligibility";
import {
  aggregateGroupDraftItems,
  assertGroupDraftItems,
  type DraftItem,
} from "./group-order-items";

export type { DraftItem } from "./group-order-items";

const groupCode = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6);

/**
 * `DraftItem[]` in the shape Prisma accepts for a `Json` column. Each item is
 * re-built as a fresh literal rather than the array being cast: the literals
 * satisfy `Prisma.InputJsonValue` on their own, and adding a field to
 * `DraftItem` then becomes a visible decision here about whether it belongs in
 * the persisted draft — instead of silently riding along.
 */
function toJsonItems(items: DraftItem[]): Prisma.InputJsonValue {
  return items.map((i) => ({ productId: i.productId, variantId: i.variantId ?? null, qty: i.qty }));
}

/**
 * Group orders ("order together"). A host opens a group for one shop and shares
 * the code; friends join and add draft items; the host locks the group and
 * places ONE combined order (routed through the normal checkout so stock,
 * pricing, delivery and payment all behave identically to a solo order).
 */
@Injectable()
export class GroupOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
  ) {}

  async create(hostId: string, shopId: string, expiresInMinutes?: number) {
    const shop = await this.prisma.shop.findFirst({
      where: { id: shopId, ...STOREFRONT_SHOP_WHERE },
      select: { id: true },
    });
    if (!shop) throw new BadRequestException("Shop is not available");
    const expiresAt = expiresInMinutes ? new Date(Date.now() + expiresInMinutes * 60_000) : null;
    return this.prisma.groupOrder.create({
      data: {
        code: `GRP-${groupCode()}`,
        hostId,
        shopId,
        expiresAt,
        participants: { create: { userId: hostId, items: [] } },
      },
      include: this.detail(),
    });
  }

  async getByCode(code: string) {
    const group = await this.prisma.groupOrder.findUnique({
      where: { code },
      select: {
        status: true,
        expiresAt: true,
        shop: { select: { id: true, name: true, slug: true, minOrder: true } },
        _count: { select: { participants: true } },
      },
    });
    if (!group) throw new NotFoundException("Group order not found");
    return {
      status: group.status,
      expiresAt: group.expiresAt,
      participantCount: group._count.participants,
      shop: group.shop,
    };
  }

  async get(userId: string, groupOrderId: string) {
    return this.requireMember(userId, groupOrderId);
  }

  mine(userId: string) {
    return this.prisma.groupOrder.findMany({
      where: { OR: [{ hostId: userId }, { participants: { some: { userId } } }] },
      orderBy: { createdAt: "desc" },
      include: this.detail(),
    });
  }

  async join(userId: string, code: string) {
    const group = await this.prisma.groupOrder.findUnique({ where: { code } });
    if (!group) throw new NotFoundException("Group order not found");
    if (group.status !== "OPEN")
      throw new BadRequestException("This group is no longer accepting people");
    if (group.expiresAt && group.expiresAt < new Date())
      throw new BadRequestException("This group has expired");
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const gate = await tx.groupOrder.updateMany({
        where: {
          id: group.id,
          status: "OPEN",
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        data: { status: "OPEN" },
      });
      if (gate.count !== 1)
        throw new BadRequestException("This group is no longer accepting people");
      await tx.groupOrderParticipant.upsert({
        where: { groupOrderId_userId: { groupOrderId: group.id, userId } },
        create: { groupOrderId: group.id, userId, items: [] },
        update: {},
      });
    });
    return this.get(userId, group.id);
  }

  async setItems(userId: string, groupOrderId: string, items: DraftItem[]) {
    const group = await this.requireMember(userId, groupOrderId);
    if (group.status !== "OPEN")
      throw new BadRequestException("The group is locked — you can no longer edit items");
    assertGroupDraftItems(items);
    await this.validateItemsForShop(group.shopId, items);
    await this.prisma.$transaction(async (tx) => {
      const gate = await tx.groupOrder.updateMany({
        where: { id: groupOrderId, status: "OPEN", participants: { some: { userId } } },
        data: { status: "OPEN" },
      });
      if (gate.count !== 1)
        throw new BadRequestException("The group is locked — you can no longer edit items");
      await tx.groupOrderParticipant.update({
        where: { groupOrderId_userId: { groupOrderId, userId } },
        data: { items: toJsonItems(items) },
      });
    });
    return this.get(userId, groupOrderId);
  }

  async leave(userId: string, groupOrderId: string) {
    const group = await this.requireMember(userId, groupOrderId);
    if (group.hostId === userId)
      throw new BadRequestException("The host cannot leave — cancel the group instead");
    if (group.status !== "OPEN") throw new BadRequestException("The group is locked");
    await this.prisma.$transaction(async (tx) => {
      const gate = await tx.groupOrder.updateMany({
        where: { id: groupOrderId, status: "OPEN", participants: { some: { userId } } },
        data: { status: "OPEN" },
      });
      if (gate.count !== 1) throw new BadRequestException("The group is locked");
      await tx.groupOrderParticipant.delete({
        where: { groupOrderId_userId: { groupOrderId, userId } },
      });
    });
    return { id: groupOrderId, left: true };
  }

  async lock(hostId: string, groupOrderId: string) {
    const group = await this.requireHost(hostId, groupOrderId);
    if (group.status !== "OPEN") throw new BadRequestException("Group is not open");
    const combined = aggregateGroupDraftItems(group.participants);
    if (combined.length === 0)
      throw new BadRequestException("Add at least one item before locking");
    await this.validateItemsForShop(group.shopId, combined);
    const result = await this.prisma.groupOrder.updateMany({
      where: { id: groupOrderId, hostId, status: "OPEN" },
      data: { status: "LOCKED" },
    });
    if (result.count !== 1) throw new BadRequestException("Group is not open");
    return this.get(hostId, groupOrderId);
  }

  async cancel(hostId: string, groupOrderId: string) {
    const group = await this.requireHost(hostId, groupOrderId);
    if (group.status === "PLACED") throw new BadRequestException("Order already placed");
    const result = await this.prisma.groupOrder.updateMany({
      where: { id: groupOrderId, hostId, status: { in: ["OPEN", "LOCKED"] } },
      data: { status: "CANCELLED" },
    });
    if (result.count !== 1) throw new BadRequestException("Order already placed");
    return this.prisma.groupOrder.findUnique({ where: { id: groupOrderId } });
  }

  /**
   * Host places one combined order. OrdersService reloads the drafts and performs
   * the claim, checkout effects, group link and state transition atomically; this
   * preflight only gives ordinary invalid requests an early, readable error.
   */
  async place(hostId: string, groupOrderId: string, checkout: CheckoutDto) {
    const group = await this.requireHost(hostId, groupOrderId);
    if (group.status === "CANCELLED") throw new BadRequestException("Group was cancelled");

    // A committed retry must cross the idempotent transaction boundary so it can
    // return the already-linked order instead of turning a lost response into an error.
    if (group.status === "PLACED") return this.orders.checkoutGroup(hostId, groupOrderId, checkout);

    const aggregated = aggregateGroupDraftItems(group.participants);
    if (aggregated.length === 0) throw new BadRequestException("No items in the group yet");

    return this.orders.checkoutGroup(hostId, groupOrderId, checkout);
  }

  async quote(hostId: string, groupOrderId: string, checkout: CheckoutQuoteDto) {
    await this.requireHost(hostId, groupOrderId);
    return this.orders.groupCheckoutQuote(hostId, groupOrderId, checkout);
  }

  // ── helpers ──────────────────────────────────────────────────────────────
  private async validateItemsForShop(shopId: string, items: DraftItem[]) {
    if (!items.length) return;
    const ids = [...new Set(items.map((i) => i.productId))];
    const products = await this.prisma.product.findMany({
      where: { id: { in: ids }, shopId, isActive: true },
      select: {
        id: true,
        name: true,
        trackStock: true,
        stock: true,
        variants: { select: { id: true, isActive: true, stock: true } },
      },
    });
    const byId = new Map(products.map((product) => [product.id, product]));
    for (const item of items) {
      const product = byId.get(item.productId);
      if (!product) throw new BadRequestException("Some items are not available from this shop");
      const activeVariants = product.variants.filter((variant) => variant.isActive);
      if (item.variantId) {
        const variant = activeVariants.find((candidate) => candidate.id === item.variantId);
        if (!variant) throw new BadRequestException(`${product.name}: that option is unavailable`);
        if (variant.stock < item.qty)
          throw new BadRequestException(`${product.name}: only ${variant.stock} left in stock`);
      } else {
        if (activeVariants.length)
          throw new BadRequestException(`${product.name}: choose an option`);
        if (product.trackStock && product.stock < item.qty)
          throw new BadRequestException(`${product.name}: only ${product.stock} left in stock`);
      }
    }
  }

  private async requireMember(userId: string, groupOrderId: string) {
    const group = await this.prisma.groupOrder.findFirst({
      where: {
        id: groupOrderId,
        OR: [{ hostId: userId }, { participants: { some: { userId } } }],
      },
      include: this.detail(),
    });
    if (!group) throw new NotFoundException("Group order not found");
    return group;
  }

  private async requireHost(hostId: string, groupOrderId: string) {
    const group = await this.prisma.groupOrder.findFirst({
      where: { id: groupOrderId, hostId },
      include: { participants: true },
    });
    if (!group) throw new NotFoundException("Group order not found");
    return group;
  }

  private detail() {
    return {
      participants: { include: { user: { select: { name: true } } } },
      shop: { select: { id: true, name: true, slug: true, minOrder: true } },
      order: { select: { id: true, code: true, status: true } },
    };
  }
}
