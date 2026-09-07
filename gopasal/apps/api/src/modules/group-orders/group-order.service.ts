import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { customAlphabet } from 'nanoid';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CartService } from '../cart/cart.service';
import { OrdersService } from '../orders/orders.service';
import { CheckoutDto } from '../orders/dto/orders.dto';

const groupCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);

export interface DraftItem {
  productId: string;
  variantId?: string | null;
  qty: number;
}

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
    private readonly cart: CartService,
    private readonly orders: OrdersService,
  ) {}

  async create(hostId: string, shopId: string, expiresInMinutes?: number) {
    const shop = await this.prisma.shop.findUnique({ where: { id: shopId }, select: { status: true } });
    if (!shop || shop.status !== 'ACTIVE') throw new BadRequestException('Shop is not available');
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
    const group = await this.prisma.groupOrder.findUnique({ where: { code }, include: this.detail() });
    if (!group) throw new NotFoundException('Group order not found');
    return group;
  }

  async get(groupOrderId: string) {
    const group = await this.prisma.groupOrder.findUnique({ where: { id: groupOrderId }, include: this.detail() });
    if (!group) throw new NotFoundException('Group order not found');
    return group;
  }

  mine(userId: string) {
    return this.prisma.groupOrder.findMany({
      where: { OR: [{ hostId: userId }, { participants: { some: { userId } } }] },
      orderBy: { createdAt: 'desc' },
      include: this.detail(),
    });
  }

  async join(userId: string, code: string) {
    const group = await this.prisma.groupOrder.findUnique({ where: { code } });
    if (!group) throw new NotFoundException('Group order not found');
    if (group.status !== 'OPEN') throw new BadRequestException('This group is no longer accepting people');
    if (group.expiresAt && group.expiresAt < new Date()) throw new BadRequestException('This group has expired');
    await this.prisma.groupOrderParticipant.upsert({
      where: { groupOrderId_userId: { groupOrderId: group.id, userId } },
      create: { groupOrderId: group.id, userId, items: [] },
      update: {},
    });
    return this.get(group.id);
  }

  async setItems(userId: string, groupOrderId: string, items: DraftItem[]) {
    const group = await this.prisma.groupOrder.findUnique({ where: { id: groupOrderId } });
    if (!group) throw new NotFoundException('Group order not found');
    if (group.status !== 'OPEN') throw new BadRequestException('The group is locked — you can no longer edit items');
    await this.validateItemsForShop(group.shopId, items);
    const participant = await this.prisma.groupOrderParticipant.findUnique({
      where: { groupOrderId_userId: { groupOrderId, userId } },
    });
    if (!participant) throw new ForbiddenException('Join the group before adding items');
    await this.prisma.groupOrderParticipant.update({
      where: { groupOrderId_userId: { groupOrderId, userId } },
      data: { items: toJsonItems(items) },
    });
    return this.get(groupOrderId);
  }

  async leave(userId: string, groupOrderId: string) {
    const group = await this.prisma.groupOrder.findUnique({ where: { id: groupOrderId } });
    if (!group) throw new NotFoundException('Group order not found');
    if (group.hostId === userId) throw new BadRequestException('The host cannot leave — cancel the group instead');
    if (group.status !== 'OPEN') throw new BadRequestException('The group is locked');
    await this.prisma.groupOrderParticipant.deleteMany({ where: { groupOrderId, userId } });
    return this.get(groupOrderId);
  }

  async lock(hostId: string, groupOrderId: string) {
    const group = await this.requireHost(hostId, groupOrderId);
    if (group.status !== 'OPEN') throw new BadRequestException('Group is not open');
    return this.prisma.groupOrder.update({ where: { id: groupOrderId }, data: { status: 'LOCKED' }, include: this.detail() });
  }

  async cancel(hostId: string, groupOrderId: string) {
    const group = await this.requireHost(hostId, groupOrderId);
    if (group.status === 'PLACED') throw new BadRequestException('Order already placed');
    return this.prisma.groupOrder.update({ where: { id: groupOrderId }, data: { status: 'CANCELLED' } });
  }

  /**
   * Host places the combined order. Aggregates every participant's draft items
   * into the host's cart and runs the standard checkout, then links the created
   * order back to the group and marks it PLACED.
   */
  async place(hostId: string, groupOrderId: string, checkout: CheckoutDto) {
    const group = await this.requireHost(hostId, groupOrderId);
    if (group.status === 'PLACED') throw new BadRequestException('Order already placed');
    if (group.status === 'CANCELLED') throw new BadRequestException('Group was cancelled');

    const aggregated = this.aggregate(group.participants);
    if (aggregated.length === 0) throw new BadRequestException('No items in the group yet');

    // rebuild the host cart from the group's combined items
    await this.cart.clear(hostId);
    for (const item of aggregated) {
      await this.cart.addItem(hostId, { productId: item.productId, variantId: item.variantId, qty: item.qty });
    }

    const result = await this.orders.checkout(hostId, checkout);
    await this.prisma.$transaction([
      this.prisma.order.update({ where: { id: result.id }, data: { groupOrderId } }),
      this.prisma.groupOrder.update({ where: { id: groupOrderId }, data: { status: 'PLACED' } }),
    ]);
    return result;
  }

  // ── helpers ──────────────────────────────────────────────────────────────
  private aggregate(participants: { items: unknown }[]): DraftItem[] {
    const map = new Map<string, DraftItem>();
    for (const p of participants) {
      const items = Array.isArray(p.items) ? (p.items as DraftItem[]) : [];
      for (const it of items) {
        if (!it?.productId || !it.qty) continue;
        const key = `${it.productId}:${it.variantId ?? ''}`;
        const prev = map.get(key);
        if (prev) prev.qty += it.qty;
        else map.set(key, { productId: it.productId, variantId: it.variantId ?? null, qty: it.qty });
      }
    }
    return [...map.values()];
  }

  private async validateItemsForShop(shopId: string, items: DraftItem[]) {
    if (!items.length) return;
    const ids = [...new Set(items.map((i) => i.productId))];
    const products = await this.prisma.product.findMany({
      where: { id: { in: ids }, shopId, isActive: true },
      select: { id: true },
    });
    const ok = new Set(products.map((p) => p.id));
    const bad = ids.filter((id) => !ok.has(id));
    if (bad.length) throw new BadRequestException('Some items are not available from this shop');
  }

  private async requireHost(hostId: string, groupOrderId: string) {
    const group = await this.prisma.groupOrder.findUnique({
      where: { id: groupOrderId },
      include: { participants: true },
    });
    if (!group) throw new NotFoundException('Group order not found');
    if (group.hostId !== hostId) throw new ForbiddenException('Only the host can do that');
    return group;
  }

  private detail() {
    return {
      participants: { include: { user: { select: { name: true } } } },
      shop: { select: { id: true, name: true, slug: true, minOrder: true } },
    };
  }
}
