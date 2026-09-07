import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DeliveryStatus, OrderStatus, Prisma, RiderStatus, VehicleType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EVENTS, type DeliveryAssignedEvent, type DeliveryStatusChangedEvent } from '../../common/events';
import { normalizeNepalPhone } from '../../auth/auth.service';
import { OrdersService } from '../orders/orders.service';
import { RiderLocationService } from './rider-location.service';
import { DELIVERY_TO_ORDER_STATUS, canDeliveryTransition, deliveryNextStates } from './delivery-state';
import type { UpsertZoneDto } from './dto/delivery.dto';

@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly location: RiderLocationService,
    private readonly events: EventEmitter2,
  ) {}

  // ══════════════════════════════ RIDERS (seller) ═══════════════════════════

  /** Register a rider for a shop. Creates the underlying User (by phone) if new. */
  async registerRider(shopId: string, input: { phone: string; name: string; vehicleType?: VehicleType }) {
    const phone = normalizeNepalPhone(input.phone);
    const user = await this.prisma.user.upsert({
      where: { phone },
      create: { phone, name: input.name },
      update: { name: input.name },
    });

    const existing = await this.prisma.rider.findUnique({ where: { userId: user.id } });
    if (existing) {
      if (existing.shopId && existing.shopId !== shopId)
        throw new BadRequestException('This person is already a rider for another shop');
      return this.prisma.rider.update({
        where: { id: existing.id },
        data: { shopId, vehicleType: input.vehicleType ?? existing.vehicleType },
        include: { user: { select: { name: true, phone: true } } },
      });
    }

    return this.prisma.rider.create({
      data: { userId: user.id, shopId, vehicleType: input.vehicleType ?? VehicleType.MOTORBIKE },
      include: { user: { select: { name: true, phone: true } } },
    });
  }

  async listRiders(shopId: string) {
    const riders = await this.prisma.rider.findMany({
      where: { shopId },
      include: {
        user: { select: { name: true, phone: true, avatarUrl: true } },
        _count: { select: { deliveries: { where: { status: { in: ['ASSIGNED', 'PICKED_UP', 'EN_ROUTE'] } } } } },
      },
      orderBy: { createdAt: 'asc' },
    });
    // attach freshness from the location service
    return Promise.all(
      riders.map(async (r) => ({
        ...r,
        activeDeliveries: r._count.deliveries,
        location: await this.location.latest(r.id),
      })),
    );
  }

  async removeRider(shopId: string, riderId: string) {
    const rider = await this.mustOwnRider(shopId, riderId);
    const active = await this.prisma.delivery.count({
      where: { riderId: rider.id, status: { in: ['ASSIGNED', 'PICKED_UP', 'EN_ROUTE'] } },
    });
    if (active > 0) throw new BadRequestException('Rider still has active deliveries');
    await this.prisma.rider.delete({ where: { id: rider.id } });
    return { removed: true };
  }

  // ══════════════════════════════ RIDER self-service ════════════════════════

  async myRider(userId: string) {
    const rider = await this.prisma.rider.findUnique({
      where: { userId },
      include: { shop: { select: { id: true, name: true } }, user: { select: { name: true, phone: true } } },
    });
    if (!rider) throw new NotFoundException('You are not registered as a rider');
    return { ...rider, location: await this.location.latest(rider.id) };
  }

  async setMyStatus(userId: string, status: RiderStatus) {
    if (status === RiderStatus.ON_DELIVERY)
      throw new BadRequestException('ON_DELIVERY is set automatically when a delivery is assigned');
    const rider = await this.prisma.rider.findUnique({ where: { userId } });
    if (!rider) throw new NotFoundException('You are not registered as a rider');
    if (rider.status === RiderStatus.ON_DELIVERY && status === RiderStatus.OFFLINE)
      throw new BadRequestException('Finish your active delivery before going offline');
    return this.prisma.rider.update({ where: { id: rider.id }, data: { status } });
  }

  async myDeliveries(userId: string) {
    const rider = await this.prisma.rider.findUnique({ where: { userId } });
    if (!rider) throw new NotFoundException('You are not registered as a rider');
    return this.prisma.delivery.findMany({
      where: { riderId: rider.id, status: { in: ['ASSIGNED', 'PICKED_UP', 'EN_ROUTE'] } },
      include: { order: { include: { items: true, shop: { select: { name: true, area: true, lat: true, lng: true, phone: true } } } } },
      orderBy: { assignedAt: 'asc' },
    });
  }

  /** Rider updates their own delivery (identified by the signed-in user). */
  async riderUpdateStatus(userId: string, orderId: string, input: DeliveryUpdateInput) {
    const rider = await this.prisma.rider.findUnique({ where: { userId } });
    if (!rider) throw new NotFoundException('You are not registered as a rider');
    const delivery = await this.loadDelivery(orderId);
    if (delivery.riderId !== rider.id) throw new ForbiddenException('This delivery is not assigned to you');
    return this.applyStatus(delivery, input, 'RIDER');
  }

  // ══════════════════════════════ ASSIGNMENT (seller) ═══════════════════════

  async assignRider(shopId: string, orderId: string, riderId: string) {
    // Called for its guard, not its value: it throws if the rider belongs to
    // another shop, which is what stops one shop assigning another's rider.
    await this.mustOwnRider(shopId, riderId);
    const delivery = await this.loadDelivery(orderId);
    if (delivery.order.shopId !== shopId) throw new NotFoundException('Order not found');
    if (delivery.order.status === OrderStatus.CANCELLED || delivery.order.status === OrderStatus.DELIVERED)
      throw new BadRequestException('Order is not assignable');
    if (delivery.status !== DeliveryStatus.UNASSIGNED && delivery.status !== DeliveryStatus.ASSIGNED)
      throw new BadRequestException('Delivery already in progress');

    const updated = await this.prisma.$transaction(async (tx) => {
      // free the previous rider if reassigning
      if (delivery.riderId && delivery.riderId !== riderId) {
        await tx.rider.update({ where: { id: delivery.riderId }, data: { status: RiderStatus.ONLINE } });
      }
      const d = await tx.delivery.update({
        where: { id: delivery.id },
        data: { riderId, status: DeliveryStatus.ASSIGNED, assignedAt: new Date() },
      });
      await tx.rider.update({ where: { id: riderId }, data: { status: RiderStatus.ON_DELIVERY } });
      return d;
    });

    await this.location.clearOrderCache(riderId);
    this.events.emit(EVENTS.DELIVERY_ASSIGNED, {
      orderId,
      deliveryId: updated.id,
      riderId,
      shopId,
      customerId: delivery.order.customerId,
    } satisfies DeliveryAssignedEvent);

    this.logger.log(`Rider ${riderId} assigned to order ${delivery.order.code}`);
    return updated;
  }

  async unassign(shopId: string, orderId: string) {
    const delivery = await this.loadDelivery(orderId);
    if (delivery.order.shopId !== shopId) throw new NotFoundException('Order not found');
    if (delivery.status !== DeliveryStatus.ASSIGNED)
      throw new BadRequestException('Can only unassign before pickup');
    const prevRider = delivery.riderId;
    await this.prisma.$transaction(async (tx) => {
      await tx.delivery.update({
        where: { id: delivery.id },
        data: { riderId: null, status: DeliveryStatus.UNASSIGNED, assignedAt: null },
      });
      if (prevRider) await tx.rider.update({ where: { id: prevRider }, data: { status: RiderStatus.ONLINE } });
    });
    if (prevRider) await this.location.clearOrderCache(prevRider);
    return { unassigned: true };
  }

  /** Seller updates a delivery's status (shop-scoped). */
  async sellerUpdateStatus(shopId: string, orderId: string, input: DeliveryUpdateInput) {
    const delivery = await this.loadDelivery(orderId);
    if (delivery.order.shopId !== shopId) throw new NotFoundException('Order not found');
    return this.applyStatus(delivery, input, 'SHOP');
  }

  // ══════════════════════════════ core status transition ════════════════════

  private async applyStatus(delivery: LoadedDelivery, input: DeliveryUpdateInput, actor: 'RIDER' | 'SHOP') {
    const to = input.status;
    if (delivery.status === to) return delivery;
    if (!canDeliveryTransition(delivery.status, to)) {
      throw new BadRequestException(
        `Cannot move delivery from ${delivery.status} to ${to} (allowed: ${deliveryNextStates(delivery.status).join(', ') || 'none'})`,
      );
    }
    if (!delivery.riderId) throw new BadRequestException('No rider assigned');

    const now = new Date();
    const data: Prisma.DeliveryUpdateInput = { status: to };
    if (to === DeliveryStatus.PICKED_UP) data.pickedUpAt = now;
    if (to === DeliveryStatus.DELIVERED) {
      data.deliveredAt = now;
      data.podNote = input.podNote;
      // `podImageUrl` is not written here and is not accepted on the wire. The
      // column stays on the model for the upload route that will fill it; a
      // client-supplied value would be proof of nothing. See DeliveryStatusDto.
      if (delivery.order.paymentMethod === 'COD') {
        data.codCollected = input.codCollected ?? true;
        data.codAmount = delivery.order.total;
      }
    }
    if (to === DeliveryStatus.FAILED) {
      data.failedAt = now;
      data.failReason = input.failReason ?? 'Delivery failed';
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const d = await tx.delivery.update({ where: { id: delivery.id }, data });
      // rider frees up when the run ends
      if (to === DeliveryStatus.DELIVERED || to === DeliveryStatus.FAILED) {
        await tx.rider.update({ where: { id: delivery.riderId! }, data: { status: RiderStatus.ONLINE } });
      }
      return d;
    });

    // keep the order status in lockstep for the customer-facing states
    const orderStatus = DELIVERY_TO_ORDER_STATUS[to];
    const by = actor === 'RIDER' ? 'rider' : 'shop';
    if (orderStatus === 'OUT_FOR_DELIVERY') {
      await this.orders.transition(delivery.orderId, OrderStatus.OUT_FOR_DELIVERY, 'SYSTEM', undefined, `Rider en route (marked by ${by})`);
    } else if (orderStatus === 'DELIVERED') {
      await this.orders.transition(delivery.orderId, OrderStatus.DELIVERED, 'SYSTEM', undefined, `Delivered (confirmed by ${by})`);
    }

    await this.location.clearOrderCache(delivery.riderId);
    this.events.emit(EVENTS.DELIVERY_STATUS_CHANGED, {
      orderId: delivery.orderId,
      deliveryId: delivery.id,
      shopId: delivery.order.shopId,
      customerId: delivery.order.customerId,
      from: delivery.status,
      to,
      actor,
    } satisfies DeliveryStatusChangedEvent);

    return updated;
  }

  // ══════════════════════════════ ZONES (seller) ════════════════════════════

  listZones(shopId: string) {
    return this.prisma.deliveryZone.findMany({ where: { shopId }, orderBy: { createdAt: 'asc' } });
  }

  createZone(shopId: string, dto: UpsertZoneDto) {
    if (dto.polygon.length < 3) throw new BadRequestException('A zone needs at least 3 points');
    return this.prisma.deliveryZone.create({
      data: {
        shopId,
        name: dto.name,
        polygon: dto.polygon as unknown as Prisma.InputJsonValue,
        feeOverride: dto.feeOverride ?? null,
      },
    });
  }

  async updateZone(shopId: string, zoneId: string, dto: UpsertZoneDto) {
    await this.mustOwnZone(shopId, zoneId);
    if (dto.polygon.length < 3) throw new BadRequestException('A zone needs at least 3 points');
    return this.prisma.deliveryZone.update({
      where: { id: zoneId },
      data: {
        name: dto.name,
        polygon: dto.polygon as unknown as Prisma.InputJsonValue,
        feeOverride: dto.feeOverride ?? null,
      },
    });
  }

  async removeZone(shopId: string, zoneId: string) {
    await this.mustOwnZone(shopId, zoneId);
    await this.prisma.deliveryZone.delete({ where: { id: zoneId } });
    return { removed: true };
  }

  // ══════════════════════════════ helpers ═══════════════════════════════════

  private async loadDelivery(orderId: string): Promise<LoadedDelivery> {
    const delivery = await this.prisma.delivery.findUnique({
      where: { orderId },
      include: DELIVERY_INCLUDE,
    });
    if (!delivery) throw new NotFoundException('Delivery not found');
    return delivery;
  }

  private async mustOwnRider(shopId: string, riderId: string) {
    const rider = await this.prisma.rider.findUnique({ where: { id: riderId } });
    if (!rider || rider.shopId !== shopId) throw new NotFoundException('Rider not found');
    return rider;
  }

  private async mustOwnZone(shopId: string, zoneId: string) {
    const zone = await this.prisma.deliveryZone.findUnique({ where: { id: zoneId } });
    if (!zone || zone.shopId !== shopId) throw new NotFoundException('Zone not found');
    return zone;
  }
}

export interface DeliveryUpdateInput {
  status: DeliveryStatus;
  podNote?: string;
  codCollected?: boolean;
  failReason?: string;
}

/**
 * The one shape a delivery is loaded in. Declared as a `satisfies`-checked const
 * and used both as the query argument and as the source of `LoadedDelivery`, so
 * the include and the type can never drift — which is what previously made the
 * `as LoadedDelivery` cast in `loadDelivery` necessary.
 */
const DELIVERY_INCLUDE = {
  order: {
    select: { shopId: true, customerId: true, code: true, status: true, paymentMethod: true, total: true },
  },
} satisfies Prisma.DeliveryInclude;

type LoadedDelivery = Prisma.DeliveryGetPayload<{ include: typeof DELIVERY_INCLUDE }>;
