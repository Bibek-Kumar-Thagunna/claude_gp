import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { DeliveryStatus, OrderStatus, Prisma, RiderStatus, VehicleType } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { paginate, type PaginationDto } from "../../common/dto/pagination.dto";
import {
  EVENTS,
  type DeliveryAssignedEvent,
  type DeliveryStatusChangedEvent,
} from "../../common/events";
import { normalizeNepalPhone } from "../../auth/auth.service";
import { OrdersService } from "../orders/orders.service";
import { canTransition } from "../orders/order-state";
import type { UploadedFile } from "../uploads/uploaded-file";
import { UploadsService, type DeliveryProofDownload } from "../uploads/uploads.service";
import { RiderLocationService } from "./rider-location.service";
import {
  DELIVERY_TO_ORDER_STATUS,
  canDeliveryTransition,
  deliveryNextStates,
} from "./delivery-state";
import type { UpsertZoneDto } from "./dto/delivery.dto";

const ACTIVE_RIDER_DELIVERY_WHERE = {
  OR: [
    {
      status: {
        in: [
          DeliveryStatus.ASSIGNED,
          DeliveryStatus.PICKED_UP,
          DeliveryStatus.EN_ROUTE,
          DeliveryStatus.RETURNING_TO_SHOP,
        ],
      },
    },
    { status: DeliveryStatus.FAILED, pickedUpAt: { not: null } },
  ],
} satisfies Prisma.DeliveryWhereInput;

@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly location: RiderLocationService,
    private readonly events: EventEmitter2,
    private readonly uploads: UploadsService,
    private readonly audit: AuditService,
  ) {}

  // ══════════════════════════════ RIDERS (seller) ═══════════════════════════

  /** Register a rider for a shop. Creates the underlying User (by phone) if new. */
  async registerRider(
    shopId: string,
    input: { phone: string; name: string; vehicleType?: VehicleType },
  ) {
    const phone = normalizeNepalPhone(input.phone);
    const user = await this.prisma.user.upsert({
      where: { phone },
      create: { phone, name: input.name },
      update: { name: input.name },
    });

    const existing = await this.prisma.rider.findUnique({ where: { userId: user.id } });
    if (existing) {
      if (existing.shopId && existing.shopId !== shopId)
        throw new BadRequestException("This person is already a rider for another shop");
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
        _count: { select: { deliveries: { where: ACTIVE_RIDER_DELIVERY_WHERE } } },
      },
      orderBy: { createdAt: "asc" },
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
      where: { riderId: rider.id, ...ACTIVE_RIDER_DELIVERY_WHERE },
    });
    if (active > 0) throw new BadRequestException("Rider still has active deliveries");
    await this.prisma.rider.delete({ where: { id: rider.id } });
    return { removed: true };
  }

  // ══════════════════════════════ RIDER self-service ════════════════════════

  async myRider(userId: string) {
    const rider = await this.prisma.rider.findUnique({
      where: { userId },
      include: {
        shop: { select: { id: true, name: true } },
        user: { select: { name: true, phone: true } },
      },
    });
    if (!rider) throw new NotFoundException("You are not registered as a rider");
    return { ...rider, location: await this.location.latest(rider.id) };
  }

  async setMyStatus(userId: string, status: RiderStatus) {
    if (status === RiderStatus.ON_DELIVERY)
      throw new BadRequestException("ON_DELIVERY is set automatically when a delivery is assigned");
    const rider = await this.prisma.rider.findUnique({ where: { userId } });
    if (!rider) throw new NotFoundException("You are not registered as a rider");
    if (rider.status === RiderStatus.ON_DELIVERY && status === RiderStatus.OFFLINE)
      throw new BadRequestException("Finish your active delivery before going offline");
    return this.prisma.rider.update({ where: { id: rider.id }, data: { status } });
  }

  async myDeliveries(userId: string) {
    const rider = await this.prisma.rider.findUnique({ where: { userId } });
    if (!rider) throw new NotFoundException("You are not registered as a rider");
    const deliveries = await this.prisma.delivery.findMany({
      where: { riderId: rider.id, ...ACTIVE_RIDER_DELIVERY_WHERE },
      select: RIDER_DELIVERY_SELECT,
      orderBy: { assignedAt: "asc" },
    });
    return deliveries.map(toRiderDeliveryView);
  }

  async myDeliveryHistory(userId: string, query: PaginationDto) {
    const rider = await this.prisma.rider.findUnique({ where: { userId } });
    if (!rider) throw new NotFoundException("You are not registered as a rider");
    const where = {
      riderId: rider.id,
      OR: [
        { status: { in: [DeliveryStatus.DELIVERED, DeliveryStatus.RETURNED_TO_SHOP] } },
        { status: DeliveryStatus.FAILED, pickedUpAt: null },
      ],
    } satisfies Prisma.DeliveryWhereInput;
    const [deliveries, total] = await this.prisma.$transaction([
      this.prisma.delivery.findMany({
        where,
        select: RIDER_DELIVERY_SELECT,
        orderBy: { updatedAt: "desc" },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.delivery.count({ where }),
    ]);
    return paginate(deliveries.map(toRiderDeliveryView), total, query.page, query.limit);
  }

  /**
   * Persist POD bytes under a private storage key after proving the signed-in
   * rider owns the live delivery. A failed database write removes the just-written
   * object; a successful replacement removes the old object best-effort.
   */
  async uploadMyProof(userId: string, orderId: string, file: UploadedFile | undefined) {
    const rider = await this.prisma.rider.findUnique({ where: { userId } });
    if (!rider) throw new NotFoundException("You are not registered as a rider");
    const delivery = await this.loadDelivery(orderId);
    if (delivery.riderId !== rider.id)
      throw new ForbiddenException("This delivery is not assigned to you");
    if (
      delivery.status !== DeliveryStatus.PICKED_UP &&
      delivery.status !== DeliveryStatus.EN_ROUTE
    ) {
      throw new BadRequestException(
        "Proof can be attached only after pickup and before completion",
      );
    }

    const previous = delivery.podImageUrl;
    const stored = await this.uploads.storeDeliveryProof(delivery.id, file);
    try {
      await this.prisma.delivery.update({
        where: { id: delivery.id },
        data: { podImageUrl: stored.key },
      });
    } catch (error) {
      await this.uploads.remove(stored.key).catch(() => undefined);
      throw error;
    }
    if (previous && previous !== stored.key)
      await this.uploads.remove(previous).catch(() => undefined);
    return { uploaded: true, mimeType: stored.mime, size: stored.size };
  }

  async downloadProofForCustomer(userId: string, orderId: string): Promise<DeliveryProofDownload> {
    const delivery = await this.proofRow(orderId);
    if (delivery.order.customerId !== userId) throw new NotFoundException("Order not found");
    if (delivery.order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException("Delivery proof is available after the order is delivered");
    }
    const proof = await this.readProof(delivery);
    await this.recordProofRead(userId, "customer", delivery);
    return proof;
  }

  async downloadProofForSeller(
    userId: string,
    shopId: string,
    orderId: string,
  ): Promise<DeliveryProofDownload> {
    const delivery = await this.proofRow(orderId);
    if (delivery.order.shopId !== shopId) throw new NotFoundException("Order not found");
    const proof = await this.readProof(delivery);
    await this.recordProofRead(userId, "seller", delivery);
    return proof;
  }

  async downloadProofForRider(userId: string, orderId: string): Promise<DeliveryProofDownload> {
    const rider = await this.prisma.rider.findUnique({ where: { userId }, select: { id: true } });
    if (!rider) throw new NotFoundException("You are not registered as a rider");
    const delivery = await this.proofRow(orderId);
    if (delivery.riderId !== rider.id) throw new NotFoundException("Delivery not found");
    const proof = await this.readProof(delivery);
    await this.recordProofRead(userId, "rider", delivery);
    return proof;
  }

  async downloadProofForAdmin(
    userId: string,
    orderId: string,
    ip?: string | null,
  ): Promise<DeliveryProofDownload> {
    const delivery = await this.proofRow(orderId);
    const proof = await this.readProof(delivery);
    await this.recordProofRead(userId, "admin", delivery, ip);
    return proof;
  }

  /** Rider updates their own delivery (identified by the signed-in user). */
  async riderUpdateStatus(userId: string, orderId: string, input: DeliveryUpdateInput) {
    const rider = await this.prisma.rider.findUnique({ where: { userId } });
    if (!rider) throw new NotFoundException("You are not registered as a rider");
    const delivery = await this.loadDelivery(orderId);
    if (delivery.riderId !== rider.id)
      throw new ForbiddenException("This delivery is not assigned to you");
    return this.applyStatus(delivery, input, "RIDER", userId);
  }

  // ══════════════════════════════ ASSIGNMENT (seller) ═══════════════════════

  async assignRider(shopId: string, orderId: string, riderId: string, actorId?: string) {
    const delivery = await this.loadDelivery(orderId);
    if (delivery.order.shopId !== shopId) throw new NotFoundException("Order not found");
    if (
      delivery.order.status === OrderStatus.CANCELLED ||
      delivery.order.status === OrderStatus.DELIVERED
    )
      throw new BadRequestException("Order is not assignable");
    if (
      delivery.status !== DeliveryStatus.UNASSIGNED &&
      delivery.status !== DeliveryStatus.ASSIGNED &&
      delivery.status !== DeliveryStatus.FAILED &&
      delivery.status !== DeliveryStatus.RETURNED_TO_SHOP
    )
      throw new BadRequestException("Delivery already in progress");
    if (delivery.status === DeliveryStatus.FAILED && delivery.pickedUpAt) {
      throw new BadRequestException(
        "The rider still has this parcel; confirm its return to the shop before assigning a reattempt",
      );
    }

    // A repeated request for the same live assignment is idempotent. The rider
    // is already ON_DELIVERY, so it must be handled before the availability gate.
    if (delivery.status === DeliveryStatus.ASSIGNED && delivery.riderId === riderId) {
      return toSafeDeliveryView(delivery);
    }

    const rider = await this.mustOwnRider(shopId, riderId);
    if (rider.status !== RiderStatus.ONLINE) {
      throw new BadRequestException("Rider must be online and available");
    }

    const reattempt =
      delivery.status === DeliveryStatus.FAILED ||
      delivery.status === DeliveryStatus.RETURNED_TO_SHOP;
    const previousRider = delivery.riderId;
    const previousProof = delivery.podImageUrl;
    const assignedAt = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      // Claim the rider atomically. Two dispatchers (or two orders) cannot both
      // turn the same ONLINE rider into ON_DELIVERY.
      const riderClaim = await tx.rider.updateMany({
        where: { id: riderId, shopId, status: RiderStatus.ONLINE },
        data: { status: RiderStatus.ON_DELIVERY },
      });
      if (riderClaim.count !== 1) {
        throw new ConflictException("Rider was assigned elsewhere; refresh and choose another");
      }

      // Compare the state read above as part of the write. This prevents two
      // dispatchers assigning different riders to the same delivery concurrently.
      const deliveryClaim = await tx.delivery.updateMany({
        where: {
          id: delivery.id,
          status: delivery.status,
          riderId: delivery.riderId,
        },
        data: {
          riderId,
          status: DeliveryStatus.ASSIGNED,
          assignedAt,
          ...(reattempt
            ? {
                pickedUpAt: null,
                deliveredAt: null,
                failedAt: null,
                failReason: null,
                returnStartedAt: null,
                returnedAt: null,
                returnNote: null,
                podNote: null,
                podImageUrl: null,
                codCollected: false,
                codAmount: 0,
              }
            : {}),
        },
      });
      if (deliveryClaim.count !== 1) {
        throw new ConflictException("Delivery assignment changed; refresh and try again");
      }

      // The transaction has claimed the new rider and the delivery. Only now is
      // it safe to release the previous rider from an ordinary reassignment.
      if (previousRider && previousRider !== riderId && !reattempt) {
        await tx.rider.updateMany({
          where: { id: previousRider, status: RiderStatus.ON_DELIVERY },
          data: { status: RiderStatus.ONLINE },
        });
      }
      if (reattempt) {
        await tx.orderEvent.create({
          data: {
            orderId: delivery.orderId,
            status: delivery.order.status,
            actorId,
            note: `Delivery reattempt assigned${delivery.failReason ? ` after: ${delivery.failReason}` : ""}${delivery.returnNote ? `; returned parcel: ${delivery.returnNote}` : ""}`,
          },
        });
      }
      const d = await tx.delivery.findUnique({ where: { id: delivery.id } });
      if (!d) throw new ConflictException("Delivery no longer exists");
      return d;
    });

    if (reattempt && previousProof) {
      await this.uploads.remove(previousProof).catch(() => undefined);
    }
    if (reattempt) {
      await this.audit.record({
        actorId,
        action: "delivery.reattempt",
        entityType: "Delivery",
        entityId: delivery.id,
        surface: "seller",
        before: {
          riderId: previousRider,
          status: delivery.status,
          failedAt: delivery.failedAt,
          failReason: delivery.failReason,
          returnedAt: delivery.returnedAt,
          returnNote: delivery.returnNote,
        },
        after: { riderId, status: DeliveryStatus.ASSIGNED, assignedAt },
      });
    }
    if (previousRider && previousRider !== riderId) {
      await this.location.clearOrderCache(previousRider);
    }
    await this.location.clearOrderCache(riderId);
    this.events.emit(EVENTS.DELIVERY_ASSIGNED, {
      orderId,
      deliveryId: updated.id,
      riderId,
      shopId,
      customerId: delivery.order.customerId,
    } satisfies DeliveryAssignedEvent);

    this.logger.log(`Rider ${riderId} assigned to order ${delivery.order.code}`);
    return toSafeDeliveryView(updated);
  }

  async unassign(shopId: string, orderId: string) {
    const delivery = await this.loadDelivery(orderId);
    if (delivery.order.shopId !== shopId) throw new NotFoundException("Order not found");
    if (delivery.status !== DeliveryStatus.ASSIGNED)
      throw new BadRequestException("Can only unassign before pickup");
    const prevRider = delivery.riderId;
    await this.prisma.$transaction(async (tx) => {
      await tx.delivery.update({
        where: { id: delivery.id },
        data: { riderId: null, status: DeliveryStatus.UNASSIGNED, assignedAt: null },
      });
      if (prevRider)
        await tx.rider.update({ where: { id: prevRider }, data: { status: RiderStatus.ONLINE } });
    });
    if (prevRider) await this.location.clearOrderCache(prevRider);
    return { unassigned: true };
  }

  /** Seller updates a delivery's status (shop-scoped). */
  async sellerUpdateStatus(
    shopId: string,
    orderId: string,
    input: DeliveryUpdateInput,
    actorId?: string,
  ) {
    const delivery = await this.loadDelivery(orderId);
    if (delivery.order.shopId !== shopId) throw new NotFoundException("Order not found");
    return this.applyStatus(delivery, input, "SHOP", actorId);
  }

  // ══════════════════════════════ core status transition ════════════════════

  private async applyStatus(
    delivery: LoadedDelivery,
    input: DeliveryUpdateInput,
    actor: "RIDER" | "SHOP",
    actorId?: string,
  ) {
    const to = input.status;
    if (delivery.status === to) {
      await this.syncOrderStatus(delivery, to, actor);
      return toSafeDeliveryView(delivery);
    }
    if (!canDeliveryTransition(delivery.status, to)) {
      throw new BadRequestException(
        `Cannot move delivery from ${delivery.status} to ${to} (allowed: ${deliveryNextStates(delivery.status).join(", ") || "none"})`,
      );
    }
    if (!delivery.riderId) throw new BadRequestException("No rider assigned");
    if (to === DeliveryStatus.RETURNING_TO_SHOP && !delivery.pickedUpAt) {
      throw new BadRequestException(
        "Nothing was picked up; the shop can assign another rider directly",
      );
    }
    if (to === DeliveryStatus.RETURNED_TO_SHOP && actor !== "SHOP") {
      throw new ForbiddenException("The shop must confirm that it physically received the parcel");
    }
    this.assertOrderCanFollow(delivery, to);

    const now = new Date();
    const data: Prisma.DeliveryUpdateInput = { status: to };
    if (to === DeliveryStatus.PICKED_UP) data.pickedUpAt = now;
    if (to === DeliveryStatus.DELIVERED) {
      const handoverNote = input.podNote?.trim();
      if (!handoverNote || handoverNote.length < 3) {
        throw new BadRequestException("A factual handover note is required");
      }
      data.deliveredAt = now;
      data.podNote = handoverNote;
      // `podImageUrl` is not written here and is not accepted on the wire. The
      // column stays on the model for the upload route that will fill it; a
      // client-supplied value would be proof of nothing. See DeliveryStatusDto.
      if (delivery.order.paymentMethod === "COD") {
        if (input.codCollected !== true) {
          throw new BadRequestException("Explicit COD collection confirmation is required");
        }
        data.codCollected = true;
        data.codAmount = delivery.order.total;
      }
    }
    if (to === DeliveryStatus.FAILED) {
      const failureReason = input.failReason?.trim();
      if (!failureReason || failureReason.length < 3) {
        throw new BadRequestException("A specific delivery failure reason is required");
      }
      data.failedAt = now;
      data.failReason = failureReason;
    }
    if (to === DeliveryStatus.RETURNING_TO_SHOP) data.returnStartedAt = now;
    if (to === DeliveryStatus.RETURNED_TO_SHOP) {
      const returnNote = input.returnNote?.trim();
      if (!returnNote || returnNote.length < 3) {
        throw new BadRequestException("Record the condition of the parcel received by the shop");
      }
      data.returnedAt = now;
      data.returnNote = returnNote;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.delivery.updateMany({
        where: { id: delivery.id, status: delivery.status, riderId: delivery.riderId },
        data,
      });
      if (claimed.count !== 1) {
        throw new ConflictException("Delivery status changed; refresh before taking the next step");
      }
      const riderCanWorkAgain =
        to === DeliveryStatus.DELIVERED ||
        to === DeliveryStatus.RETURNED_TO_SHOP ||
        (to === DeliveryStatus.FAILED && !delivery.pickedUpAt);
      if (riderCanWorkAgain) {
        await tx.rider.updateMany({
          where: { id: delivery.riderId!, status: RiderStatus.ON_DELIVERY },
          data: { status: RiderStatus.ONLINE },
        });
      }
      const d = await tx.delivery.findUnique({ where: { id: delivery.id } });
      if (!d) throw new ConflictException("Delivery no longer exists");
      return d;
    });

    await this.syncOrderStatus(delivery, to, actor);

    await this.audit.record({
      actorId,
      action: "delivery.status.update",
      entityType: "Delivery",
      entityId: delivery.id,
      surface: actor === "RIDER" ? "rider" : "seller",
      before: { status: delivery.status },
      after: {
        status: to,
        failReason: to === DeliveryStatus.FAILED ? input.failReason?.trim() : undefined,
        returnNote: to === DeliveryStatus.RETURNED_TO_SHOP ? input.returnNote?.trim() : undefined,
      },
    });

    await this.location.clearOrderCache(delivery.riderId);
    this.events.emit(EVENTS.DELIVERY_STATUS_CHANGED, {
      orderId: delivery.orderId,
      deliveryId: delivery.id,
      shopId: delivery.order.shopId,
      customerId: delivery.order.customerId,
      from: delivery.status,
      to,
      actor,
      actorId,
    } satisfies DeliveryStatusChangedEvent);

    return toSafeDeliveryView(updated);
  }

  /**
   * Refuse a delivery move whose implied order move would be rejected — before
   * anything is written.
   *
   * `syncOrderStatus` runs after the delivery row is committed, so a throw in
   * there is not a rejection, it is corruption: the delivery advances, the order
   * does not, and because the retry path sees `delivery.status === to` it calls
   * the same failing sync forever. The order is then stranded with no way
   * forward from any console. Checking here turns that dead end into an ordinary
   * 400 that changes nothing and says what to do first.
   */
  private assertOrderCanFollow(delivery: LoadedDelivery, to: DeliveryStatus): void {
    const implied = DELIVERY_TO_ORDER_STATUS[to];
    if (!implied) return;
    const current = delivery.order.status;
    if (current === implied) return;
    if (canTransition(current, OrderStatus[implied], "SYSTEM")) return;
    const hint =
      implied === "OUT_FOR_DELIVERY"
        ? "the shop needs to accept and pack it first"
        : "it needs to be out for delivery first";
    throw new BadRequestException(
      `This order is ${current.toLowerCase().replace(/_/g, " ")} — ${hint}.`,
    );
  }

  /**
   * Advance the order to match the delivery. Never throws: by the time this
   * runs the delivery row is committed, and `assertOrderCanFollow` has already
   * rejected the moves that would be illegal. Anything still failing here is a
   * race — another console moving the same order in the same instant — and the
   * honest response is a log line, not an exception that would report the
   * committed delivery change as if it had not happened.
   */
  private async syncOrderStatus(
    delivery: LoadedDelivery,
    status: DeliveryStatus,
    actor: "RIDER" | "SHOP",
  ) {
    const orderStatus = DELIVERY_TO_ORDER_STATUS[status];
    const by = actor === "RIDER" ? "rider" : "shop";
    try {
    if (orderStatus === "OUT_FOR_DELIVERY") {
      await this.orders.transition(
        delivery.orderId,
        OrderStatus.OUT_FOR_DELIVERY,
        "SYSTEM",
        undefined,
        `Rider en route (marked by ${by})`,
      );
    } else if (orderStatus === "DELIVERED") {
      await this.orders.transition(
        delivery.orderId,
        OrderStatus.DELIVERED,
        "SYSTEM",
        undefined,
        `Delivered (confirmed by ${by})`,
      );
    }
    } catch (cause) {
      this.logger.error(
        `Delivery ${delivery.id} reached ${status} but order ${delivery.orderId} could not ` +
          `follow to ${orderStatus}: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
  }

  // ══════════════════════════════ ZONES (seller) ════════════════════════════

  listZones(shopId: string) {
    return this.prisma.deliveryZone.findMany({ where: { shopId }, orderBy: { createdAt: "asc" } });
  }

  createZone(shopId: string, dto: UpsertZoneDto) {
    if (dto.polygon.length < 3) throw new BadRequestException("A zone needs at least 3 points");
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
    if (dto.polygon.length < 3) throw new BadRequestException("A zone needs at least 3 points");
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
    if (!delivery) throw new NotFoundException("Delivery not found");
    return delivery;
  }

  private async proofRow(orderId: string): Promise<ProofDelivery> {
    const delivery = await this.prisma.delivery.findUnique({
      where: { orderId },
      select: PROOF_DELIVERY_SELECT,
    });
    if (!delivery) throw new NotFoundException("Delivery not found");
    return delivery;
  }

  private readProof(delivery: ProofDelivery): Promise<DeliveryProofDownload> {
    if (!delivery.podImageUrl) throw new NotFoundException("No delivery proof photo is available");
    return this.uploads.readDeliveryProof(delivery.id, delivery.podImageUrl);
  }

  private recordProofRead(
    actorId: string,
    surface: "customer" | "seller" | "rider" | "admin",
    delivery: ProofDelivery,
    ip?: string | null,
  ): Promise<void> {
    return this.audit.record({
      actorId,
      action: "delivery.proof.view",
      entityType: "Delivery",
      entityId: delivery.id,
      surface,
      ip,
      after: { orderId: delivery.orderId, shopId: delivery.order.shopId },
    });
  }

  private async mustOwnRider(shopId: string, riderId: string) {
    const rider = await this.prisma.rider.findUnique({ where: { id: riderId } });
    if (!rider || rider.shopId !== shopId) throw new NotFoundException("Rider not found");
    return rider;
  }

  private async mustOwnZone(shopId: string, zoneId: string) {
    const zone = await this.prisma.deliveryZone.findUnique({ where: { id: zoneId } });
    if (!zone || zone.shopId !== shopId) throw new NotFoundException("Zone not found");
    return zone;
  }
}

export interface DeliveryUpdateInput {
  status: DeliveryStatus;
  podNote?: string;
  codCollected?: boolean;
  failReason?: string;
  returnNote?: string;
}

/**
 * The one shape a delivery is loaded in. Declared as a `satisfies`-checked const
 * and used both as the query argument and as the source of `LoadedDelivery`, so
 * the include and the type can never drift — which is what previously made the
 * `as LoadedDelivery` cast in `loadDelivery` necessary.
 */
const DELIVERY_INCLUDE = {
  order: {
    select: {
      shopId: true,
      customerId: true,
      code: true,
      status: true,
      paymentMethod: true,
      total: true,
    },
  },
} satisfies Prisma.DeliveryInclude;

type LoadedDelivery = Prisma.DeliveryGetPayload<{ include: typeof DELIVERY_INCLUDE }>;

const PROOF_DELIVERY_SELECT = {
  id: true,
  orderId: true,
  riderId: true,
  podImageUrl: true,
  order: { select: { customerId: true, shopId: true, status: true } },
} satisfies Prisma.DeliverySelect;

type ProofDelivery = Prisma.DeliveryGetPayload<{ select: typeof PROOF_DELIVERY_SELECT }>;

const RIDER_DELIVERY_SELECT = {
  id: true,
  orderId: true,
  riderId: true,
  status: true,
  destLat: true,
  destLng: true,
  distanceMeters: true,
  assignedAt: true,
  pickedUpAt: true,
  deliveredAt: true,
  failedAt: true,
  failReason: true,
  returnStartedAt: true,
  returnedAt: true,
  returnNote: true,
  podNote: true,
  podImageUrl: true,
  codCollected: true,
  codAmount: true,
  updatedAt: true,
  order: {
    select: {
      code: true,
      status: true,
      recipientName: true,
      recipientPhone: true,
      area: true,
      landmark: true,
      fullAddress: true,
      lat: true,
      lng: true,
      subtotal: true,
      deliveryFee: true,
      discount: true,
      loyaltyDiscount: true,
      total: true,
      paymentMethod: true,
      paymentStatus: true,
      note: true,
      placedAt: true,
      shop: {
        select: {
          id: true,
          name: true,
          area: true,
          fullAddress: true,
          lat: true,
          lng: true,
          phone: true,
        },
      },
      items: {
        select: { id: true, nameSnapshot: true, unitSnapshot: true, price: true, qty: true },
      },
    },
  },
} satisfies Prisma.DeliverySelect;

type RiderDeliveryRow = Prisma.DeliveryGetPayload<{ select: typeof RIDER_DELIVERY_SELECT }>;

function toRiderDeliveryView(row: RiderDeliveryRow) {
  return toSafeDeliveryView(row);
}

function toSafeDeliveryView<T extends { podImageUrl: string | null }>(row: T) {
  const { podImageUrl, ...safe } = row;
  return { ...safe, hasProofPhoto: Boolean(podImageUrl) };
}
