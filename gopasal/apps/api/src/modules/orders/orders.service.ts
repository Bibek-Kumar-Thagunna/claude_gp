import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OrderStatus, PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';
import { customAlphabet } from 'nanoid';
import { PrismaService } from '../../common/prisma/prisma.service';
import { paginate } from '../../common/dto/pagination.dto';
import { computeDeliveryFee } from '../../common/delivery-fee';
import { EVENTS, type OrderPlacedEvent, type OrderStatusChangedEvent } from '../../common/events';
import { haversineMeters, pointInPolygon, type GeoPoint } from '../../providers/geo';
import { PAYMENT_PROVIDERS, type PaymentProvider } from '../../providers/payment.provider';
import { CouponsService } from '../coupons/coupons.service';
import { CartService } from '../cart/cart.service';
import {
  Actor,
  STATUS_TIMESTAMP,
  allowedTransitions,
  canTransition,
} from './order-state';
import type { CheckoutDto, ListShopOrdersQueryDto } from './dto/orders.dto';

const orderCode = customAlphabet('0123456789', 6);

/** The statuses that mean the order is still open — nobody has finished with it. */
const OPEN_STATUSES: OrderStatus[] = [
  OrderStatus.PLACED,
  OrderStatus.ACCEPTED,
  OrderStatus.PACKED,
  OrderStatus.OUT_FOR_DELIVERY,
];

/**
 * Queue-wide counts that travel alongside a page of orders.
 *
 * These are about the shop, not the page: a seller filtering to "Delivered" still
 * needs to see how many orders are waiting to be accepted.
 */
export interface OrderQueueSummary {
  total: number;
  /** PLACED — waiting for the shop to accept or reject. */
  needsAction: number;
  /** ACCEPTED, PACKED or OUT_FOR_DELIVERY. */
  inProgress: number;
  delivered: number;
  /** REJECTED or CANCELLED. */
  closed: number;
  /** Rupees of COD still uncollected across open orders. Not a settlement figure. */
  codOutstanding: number;
}

/**
 * Free-text search over the three things a seller has in front of them when a
 * customer calls: the order code they read out, their name, and where it is going.
 *
 * There is no full-text index behind this — `contains` is a sequential scan over the
 * shop's rows, which the `(shopId, placedAt)` index has already narrowed to one
 * tenant. Nothing here searches item names: an order's lines are a separate table and
 * joining them per keystroke would be a much larger promise than this endpoint makes.
 */
function searchFilter(q: string | undefined): Prisma.OrderWhereInput | undefined {
  const term = q?.trim();
  if (!term) return undefined;
  const like = { contains: term, mode: 'insensitive' as const };
  return { OR: [{ code: like }, { recipientName: like }, { area: like }] };
}

/**
 * The shape an order is loaded in whenever a human is going to look at it.
 * Declared once and `satisfies`-checked against Prisma's include type, so the
 * detail payload and the `tracking` object derived from it below stay in step
 * with the schema instead of being asserted into existence.
 */
const ORDER_DETAIL_INCLUDE = {
  shop: { select: { id: true, name: true, slug: true, phone: true, area: true, lat: true, lng: true } },
  items: true,
  events: { orderBy: { createdAt: 'asc' } },
  coupon: { select: { code: true, type: true, value: true } },
  delivery: { include: { rider: { include: { user: { select: { name: true, phone: true } } } } } },
} satisfies Prisma.OrderInclude;

type OrderDetail = Prisma.OrderGetPayload<{ include: typeof ORDER_DETAIL_INCLUDE }>;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cart: CartService,
    private readonly coupons: CouponsService,
    private readonly events: EventEmitter2,
    @Inject(PAYMENT_PROVIDERS) private readonly payments: PaymentProvider[],
  ) {}

  // ══════════════════════════════ CHECKOUT ══════════════════════════════════

  async checkout(userId: string, dto: CheckoutDto) {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: {
        shop: true,
        items: { include: { product: { include: { variants: true } }, variant: true } },
      },
    });
    if (!cart || cart.items.length === 0) throw new BadRequestException('Your cart is empty');
    if (!cart.shop) throw new BadRequestException('Cart has no shop');
    const shop = cart.shop;
    if (shop.status !== 'ACTIVE' || !shop.isOpen) throw new BadRequestException('Shop is not accepting orders');

    const address = await this.prisma.address.findUnique({ where: { id: dto.addressId } });
    if (!address || address.userId !== userId) throw new NotFoundException('Address not found');
    if (address.lat == null || address.lng == null)
      throw new BadRequestException('Please pin your address on the map');
    const dest: GeoPoint = { lat: address.lat, lng: address.lng };

    // payment method must be enabled (online gateways are key-gated)
    const provider = this.payments.find((p) => p.method === (dto.paymentMethod as unknown as string));
    if (!provider || !provider.enabled)
      throw new BadRequestException(`Payment method ${dto.paymentMethod} is not available`);

    // delivery serviceability + fee (deterministic haversine; no external dependency)
    if (shop.lat == null || shop.lng == null) throw new BadRequestException('Shop location not set');
    const origin: GeoPoint = { lat: shop.lat, lng: shop.lng };
    const distanceMeters = haversineMeters(origin, dest);
    const { deliverable, feeOverride } = await this.serviceability(shop.id, origin, dest, shop.deliveryRadiusKm, distanceMeters);
    if (!deliverable) throw new BadRequestException('This shop does not deliver to your location');

    // price from live data (never trust client)
    const lineItems = cart.items.map((it) => {
      const unit = it.variant?.price ?? it.product.price;
      return {
        productId: it.productId,
        variantId: it.variantId,
        nameSnapshot: it.product.name + (it.variant ? ` — ${it.variant.name}` : ''),
        unitSnapshot: it.variant?.name ?? it.product.unit,
        price: unit,
        qty: it.qty,
      };
    });
    const subtotal = lineItems.reduce((s, i) => s + i.price * i.qty, 0);
    if (subtotal < shop.minOrder)
      throw new BadRequestException(`Minimum order for this shop is Rs ${shop.minOrder}`);

    const deliveryFee = computeDeliveryFee(distanceMeters, { override: feeOverride });

    // coupon (validated, not yet redeemed)
    const coupon = dto.couponCode
      ? await this.coupons.quote(dto.couponCode, userId, shop.id, subtotal)
      : null;
    const discount = coupon?.discount ?? 0;
    const total = Math.max(0, subtotal + deliveryFee - discount);

    const code = await this.uniqueCode();

    // ── everything below is atomic ───────────────────────────────────────────
    const order = await this.prisma.$transaction(async (tx) => {
      // decrement stock with an oversell guard
      for (const it of cart.items) {
        if (it.variantId) {
          const r = await tx.productVariant.updateMany({
            where: { id: it.variantId, stock: { gte: it.qty } },
            data: { stock: { decrement: it.qty } },
          });
          if (r.count === 0) throw new BadRequestException(`${it.product.name} is out of stock`);
        } else if (it.product.trackStock) {
          const r = await tx.product.updateMany({
            where: { id: it.productId, stock: { gte: it.qty } },
            data: { stock: { decrement: it.qty } },
          });
          if (r.count === 0) throw new BadRequestException(`${it.product.name} is out of stock`);
        }
      }

      const created = await tx.order.create({
        data: {
          code,
          customerId: userId,
          shopId: shop.id,
          status: OrderStatus.PLACED,
          addressId: address.id,
          recipientName: address.recipientName,
          recipientPhone: address.phone,
          area: address.area,
          landmark: address.landmark,
          fullAddress: address.fullAddress,
          lat: address.lat,
          lng: address.lng,
          subtotal,
          deliveryFee,
          discount,
          total,
          paymentMethod: dto.paymentMethod,
          paymentStatus: PaymentStatus.PENDING,
          couponId: coupon?.couponId ?? null,
          note: dto.note,
          items: { create: lineItems },
          events: { create: { status: OrderStatus.PLACED, actorId: userId, note: 'Order placed' } },
          delivery: {
            create: { destLat: dest.lat, destLng: dest.lng, distanceMeters: Math.round(distanceMeters) },
          },
        },
      });

      await tx.paymentIntent.create({
        data: { orderId: created.id, provider: dto.paymentMethod, amount: total, status: PaymentStatus.PENDING },
      });

      if (coupon) await this.coupons.redeem(tx, coupon.couponId, userId, created.id, discount);

      return created;
    });

    // side-effects after commit
    await this.cart.clear(userId);
    const init = await provider.init({ orderId: order.id, orderCode: code, amount: total });

    this.events.emit(EVENTS.ORDER_PLACED, {
      orderId: order.id,
      code: order.code,
      shopId: shop.id,
      customerId: userId,
      total,
    } satisfies OrderPlacedEvent);

    this.logger.log(`Order ${code} placed (shop=${shop.id}, total=Rs ${total})`);
    return { ...(await this.getMine(userId, order.id)), payment: init };
  }

  /** True if the destination is inside the shop's radius or a custom zone; returns any fee override. */
  private async serviceability(
    shopId: string,
    origin: GeoPoint,
    dest: GeoPoint,
    radiusKm: number,
    distanceMeters: number,
  ): Promise<{ deliverable: boolean; feeOverride: number | null }> {
    if (distanceMeters <= radiusKm * 1000) return { deliverable: true, feeOverride: null };
    const zones = await this.prisma.deliveryZone.findMany({ where: { shopId } });
    for (const z of zones) {
      const ring = (z.polygon as unknown as GeoPoint[]) ?? [];
      if (ring.length >= 3 && pointInPolygon(dest, ring)) return { deliverable: true, feeOverride: z.feeOverride ?? null };
    }
    return { deliverable: false, feeOverride: null };
  }

  private async uniqueCode(): Promise<string> {
    for (let i = 0; i < 6; i++) {
      const code = `GP-${orderCode()}`;
      const exists = await this.prisma.order.findUnique({ where: { code }, select: { id: true } });
      if (!exists) return code;
    }
    throw new Error('Could not allocate order code');
  }

  // ══════════════════════════════ CUSTOMER ══════════════════════════════════

  /** Preview a coupon against the current cart without placing the order. */
  async previewCoupon(userId: string, code: string) {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: { items: { include: { product: true, variant: true } } },
    });
    if (!cart?.shopId || cart.items.length === 0) throw new BadRequestException('Your cart is empty');
    const subtotal = cart.items.reduce((s, it) => s + (it.variant?.price ?? it.product.price) * it.qty, 0);
    const quote = await this.coupons.quote(code, userId, cart.shopId, subtotal);
    return { ...quote, subtotal, newTotalBeforeDelivery: subtotal - quote.discount };
  }

  async listMine(userId: string) {
    const orders = await this.prisma.order.findMany({
      where: { customerId: userId },
      orderBy: { createdAt: 'desc' },
      include: { shop: { select: { id: true, name: true, slug: true } }, items: true, delivery: true },
    });
    return orders;
  }

  async getMine(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: this.detailInclude(),
    });
    if (!order || order.customerId !== userId) throw new NotFoundException('Order not found');
    return this.withTracking(order);
  }

  async cancelMine(userId: string, orderId: string, reason?: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.customerId !== userId) throw new NotFoundException('Order not found');
    return this.transition(order.id, OrderStatus.CANCELLED, 'CUSTOMER', userId, reason ?? 'Cancelled by customer');
  }

  // ══════════════════════════════ SELLER ════════════════════════════════════

  /**
   * The shop's order queue: one page of it, plus a summary of the whole queue.
   *
   * This used to return every order the shop had ever taken, with items, delivery,
   * rider and rider's user eagerly included, and no `take`. That is fine for a shop
   * with forty orders and a slow, growing outage for a shop with forty thousand — the
   * cost is paid by the API, the wire and the browser at once. It is now paged, and
   * filtering and search happen here rather than in the console.
   *
   * The `summary` is the reason this is not a plain `paginate()` call. The console's
   * four stat cards are counts of the *queue*, not of the page, so paging the rows
   * without also answering the counts separately would have turned four true numbers
   * into four numbers about an arbitrary twenty orders. It is computed from a
   * `groupBy` over the shop's statuses and one COD sum, and it deliberately ignores
   * `status`/`q` — narrowing the view must not change what the shop is owed.
   *
   * `orderBy` is `placedAt`, not `createdAt`. They are set from the same clock at
   * checkout, so the order is identical, but `placedAt` is the column the
   * `(shopId, placedAt)` index is built on, so the page comes back without a sort.
   */
  async listForShop(shopId: string, query: ListShopOrdersQueryDto) {
    const where: Prisma.OrderWhereInput = {
      shopId,
      ...(query.status?.length ? { status: { in: query.status } } : {}),
      ...(searchFilter(query.q) ?? {}),
    };

    const [rows, total, summary] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { placedAt: query.sort === 'oldest' ? 'asc' : 'desc' },
        skip: query.skip,
        take: query.limit,
        // `user: { select: … }`, not `user: true`. The whole `User` row was going out
        // here — the rider's `email`, `avatarUrl`, `locale`, `isPlatformStaff` and
        // account timestamps, none of which the queue displays and none of which are
        // the shop's business — while `ORDER_DETAIL_INCLUDE` above narrows the same
        // relation to exactly these two columns. The console's `DeliveryRiderWire`
        // already declares `user: { name, phone }`, so this is the shape it reads.
        include: {
          items: true,
          delivery: {
            include: { rider: { include: { user: { select: { name: true, phone: true } } } } },
          },
        },
      }),
      this.prisma.order.count({ where }),
      this.queueSummary(shopId),
    ]);

    return { ...paginate(rows, total, query.page, query.limit), summary };
  }

  /**
   * Counts for the whole shop queue, independent of the current page and filters.
   *
   * `codOutstanding` is cash the shop is still owed: COD orders that have not reached
   * a terminal state. It is summed from the order totals themselves — there is no
   * settlement or ledger table to ask, and this figure must not be mistaken for one.
   */
  private async queueSummary(shopId: string): Promise<OrderQueueSummary> {
    const [groups, cod] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['status'],
        where: { shopId },
        _count: { _all: true },
      }),
      this.prisma.order.aggregate({
        where: { shopId, paymentMethod: PaymentMethod.COD, status: { in: OPEN_STATUSES } },
        _sum: { total: true },
      }),
    ]);

    const count = (...statuses: OrderStatus[]) =>
      groups
        .filter((g) => statuses.includes(g.status))
        .reduce((sum, g) => sum + g._count._all, 0);

    return {
      total: groups.reduce((sum, g) => sum + g._count._all, 0),
      needsAction: count(OrderStatus.PLACED),
      inProgress: count(OrderStatus.ACCEPTED, OrderStatus.PACKED, OrderStatus.OUT_FOR_DELIVERY),
      delivered: count(OrderStatus.DELIVERED),
      closed: count(OrderStatus.REJECTED, OrderStatus.CANCELLED),
      codOutstanding: cod._sum.total ?? 0,
    };
  }

  async getForShop(shopId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: this.detailInclude() });
    if (!order || order.shopId !== shopId) throw new NotFoundException('Order not found');
    return this.withTracking(order);
  }

  accept(shopId: string, orderId: string, note?: string) {
    return this.shopTransition(shopId, orderId, OrderStatus.ACCEPTED, note ?? 'Accepted by shop');
  }
  reject(shopId: string, orderId: string, reason: string) {
    return this.shopTransition(shopId, orderId, OrderStatus.REJECTED, reason);
  }
  pack(shopId: string, orderId: string, note?: string) {
    return this.shopTransition(shopId, orderId, OrderStatus.PACKED, note ?? 'Packed');
  }
  cancelForShop(shopId: string, orderId: string, reason?: string) {
    return this.shopTransition(shopId, orderId, OrderStatus.CANCELLED, reason ?? 'Cancelled by shop');
  }

  /**
   * Dispatch requires a rider to be assigned to the delivery — you can't send an
   * order "out for delivery" with nobody carrying it.
   */
  async dispatch(shopId: string, orderId: string, note?: string) {
    const delivery = await this.prisma.delivery.findUnique({ where: { orderId } });
    if (!delivery?.riderId) throw new BadRequestException('Assign a rider before dispatching');
    return this.shopTransition(shopId, orderId, OrderStatus.OUT_FOR_DELIVERY, note ?? 'Out for delivery');
  }

  private async shopTransition(shopId: string, orderId: string, to: OrderStatus, note?: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.shopId !== shopId) throw new NotFoundException('Order not found');
    return this.transition(order.id, to, 'SHOP', undefined, note);
  }

  // ══════════════════════════════ STATE MACHINE ═════════════════════════════

  /** The single choke-point for every status change. Validates the move, stamps the
   * timestamp, writes an OrderEvent, and emits a domain event — all atomically. */
  async transition(orderId: string, to: OrderStatus, actor: Actor, actorId?: string, note?: string) {
    const before = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!before) throw new NotFoundException('Order not found');
    if (before.status === to) return before;
    if (!canTransition(before.status, to, actor)) {
      const legal = allowedTransitions(before.status)
        .filter((r) => r.actors.includes(actor))
        .map((r) => r.to);
      throw new ForbiddenException(
        `Cannot move order from ${before.status} to ${to}${legal.length ? ` (allowed: ${legal.join(', ')})` : ''}`,
      );
    }

    const data: Prisma.OrderUpdateInput = { status: to };
    const stampField = STATUS_TIMESTAMP[to];
    if (stampField) (data as Record<string, unknown>)[stampField] = new Date();
    if (to === OrderStatus.CANCELLED || to === OrderStatus.REJECTED) data.cancelReason = note;
    // COD is settled when the order is delivered
    if (to === OrderStatus.DELIVERED && before.paymentMethod === PaymentMethod.COD)
      data.paymentStatus = PaymentStatus.PAID;

    const updated = await this.prisma.$transaction(async (tx) => {
      const o = await tx.order.update({ where: { id: orderId }, data });
      await tx.orderEvent.create({ data: { orderId, status: to, actorId, note } });
      // keep the delivery row roughly in sync for terminal states
      if (to === OrderStatus.DELIVERED)
        await tx.delivery.updateMany({ where: { orderId, status: { not: 'DELIVERED' } }, data: { status: 'DELIVERED', deliveredAt: new Date() } });
      if (to === OrderStatus.CANCELLED || to === OrderStatus.REJECTED)
        await tx.delivery.updateMany({ where: { orderId }, data: { status: 'FAILED', failedAt: new Date(), failReason: note } });
      return o;
    });

    this.events.emit(EVENTS.ORDER_STATUS_CHANGED, {
      orderId,
      code: updated.code,
      shopId: updated.shopId,
      customerId: updated.customerId,
      from: before.status,
      to,
      actorId,
      note,
    } satisfies OrderStatusChangedEvent);

    return updated;
  }

  // ══════════════════════════════ HELPERS ═══════════════════════════════════

  private detailInclude() {
    return ORDER_DETAIL_INCLUDE;
  }

  /** Attaches a compact `tracking` object the customer app uses to draw the map. */
  private withTracking(order: OrderDetail) {
    const d = order.delivery;
    const rider = d?.rider;
    const tracking = {
      status: order.status,
      deliveryStatus: d?.status ?? null,
      destination: order.lat != null && order.lng != null ? { lat: order.lat, lng: order.lng } : null,
      origin:
        order.shop.lat != null && order.shop.lng != null
          ? { lat: order.shop.lat, lng: order.shop.lng }
          : null,
      // live rider position is only exposed while the order is actually moving
      rider:
        order.status === OrderStatus.OUT_FOR_DELIVERY && rider?.lat != null && rider.lng != null
          ? {
              name: rider.user.name ?? 'Rider',
              phone: rider.user.phone,
              vehicleType: rider.vehicleType,
              lat: rider.lat,
              lng: rider.lng,
              heading: rider.heading,
              speed: rider.speed,
              lastPingAt: rider.lastPingAt,
              stale: rider.lastPingAt ? Date.now() - rider.lastPingAt.getTime() > 30_000 : true,
            }
          : null,
    };
    return { ...order, tracking };
  }
}
