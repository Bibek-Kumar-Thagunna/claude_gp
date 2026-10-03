import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { OrderStatus, PaymentMethod, PaymentStatus, Prisma } from "@prisma/client";
import { customAlphabet } from "nanoid";
import { PrismaService } from "../../common/prisma/prisma.service";
import { IdempotencyService } from "../../common/idempotency/idempotency.service";
import { paginate } from "../../common/dto/pagination.dto";
import { computeDeliveryFee } from "../../common/delivery-fee";
import { EVENTS, type OrderPlacedEvent, type OrderStatusChangedEvent } from "../../common/events";
import { haversineMeters, pointInPolygon, type GeoPoint } from "../../providers/geo";
import { MAP_PROVIDER, type MapProvider } from "../../providers/map.provider";
import { PAYMENT_PROVIDERS, type PaymentProvider } from "../../providers/payment.provider";
import { CouponsService } from "../coupons/coupons.service";
import { CartService } from "../cart/cart.service";
import { FinanceService } from "../finance/finance.service";
import { ReferralService } from "../engagement/referral.service";
import { LoyaltyService } from "../engagement/loyalty.service";
import { aggregateGroupDraftItems } from "../group-orders/group-order-items";
import { Actor, STATUS_TIMESTAMP, allowedTransitions, canTransition } from "./order-state";
import type { CheckoutDto, CheckoutQuoteDto, ListShopOrdersQueryDto } from "./dto/orders.dto";

const orderCode = customAlphabet("0123456789", 6);

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
  const like = { contains: term, mode: "insensitive" as const };
  return { OR: [{ code: like }, { recipientName: like }, { area: like }] };
}

/**
 * The shape an order is loaded in whenever a human is going to look at it.
 * Declared once and `satisfies`-checked against Prisma's include type, so the
 * detail payload and the `tracking` object derived from it below stay in step
 * with the schema instead of being asserted into existence.
 */
const ORDER_DETAIL_INCLUDE = {
  shop: {
    select: {
      id: true,
      name: true,
      nameNp: true,
      slug: true,
      phone: true,
      area: true,
      emoji: true,
      lat: true,
      lng: true,
    },
  },
  items: true,
  events: { orderBy: { createdAt: "asc" } },
  refunds: {
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      code: true,
      amount: true,
      reason: true,
      method: true,
      status: true,
      failureReason: true,
      completedAt: true,
      createdAt: true,
    },
  },
  coupon: { select: { code: true, type: true, value: true } },
  delivery: { include: { rider: { include: { user: { select: { name: true, phone: true } } } } } },
} satisfies Prisma.OrderInclude;

type OrderDetail = Prisma.OrderGetPayload<{ include: typeof ORDER_DETAIL_INCLUDE }>;

type CheckoutReadClient = Pick<Prisma.TransactionClient, "deliveryZone" | "order">;

type GroupCheckoutOutcome =
  | { created: false; orderId: string }
  | {
      created: true;
      orderId: string;
      code: string;
      shopId: string;
      total: number;
      provider: PaymentProvider;
    };

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cart: CartService,
    private readonly coupons: CouponsService,
    private readonly finance: FinanceService,
    private readonly referrals: ReferralService,
    private readonly loyalty: LoyaltyService,
    private readonly events: EventEmitter2,
    @Inject(MAP_PROVIDER) private readonly maps: MapProvider,
    @Inject(PAYMENT_PROVIDERS) private readonly payments: PaymentProvider[],
    private readonly idempotency: IdempotencyService,
  ) {}

  async availablePaymentMethods(shopId: string) {
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      select: { id: true, codEnabled: true, onlinePaymentEnabled: true, status: true },
    });
    if (!shop || shop.status !== "ACTIVE") throw new NotFoundException("Shop not found");
    const labels: Record<string, { label: string; description: string; online: boolean }> = {
      COD: {
        label: "Cash on delivery",
        description: "Pay the exact total when your order is delivered.",
        online: false,
      },
      ESEWA: { label: "eSewa", description: "Pay securely using eSewa.", online: true },
      KHALTI: { label: "Khalti", description: "Pay securely using Khalti.", online: true },
    };
    return this.payments
      .filter((provider) => provider.enabled)
      .filter((provider) =>
        provider.method === "COD" ? shop.codEnabled : shop.onlinePaymentEnabled,
      )
      .map((provider) => ({ id: provider.method, ...labels[provider.method] }));
  }

  // ══════════════════════════════ CHECKOUT ══════════════════════════════════

  async checkoutQuote(userId: string, dto: CheckoutQuoteDto) {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: {
        shop: true,
        items: { include: { product: true, variant: true } },
      },
    });
    if (!cart?.shop || cart.items.length === 0) throw new BadRequestException("Your cart is empty");
    const shop = cart.shop;
    if (shop.status !== "ACTIVE" || !shop.isOpen)
      throw new BadRequestException("Shop is not accepting orders");
    const address = await this.prisma.address.findUnique({ where: { id: dto.addressId } });
    if (!address || address.userId !== userId) throw new NotFoundException("Address not found");
    if (address.lat == null || address.lng == null)
      throw new BadRequestException("Please pin your address on the map");
    if (shop.lat == null || shop.lng == null)
      throw new BadRequestException("Shop location not set");

    const destination = { lat: address.lat, lng: address.lng };
    const origin = { lat: shop.lat, lng: shop.lng };
    const distanceMeters = haversineMeters(origin, destination);
    const service = await this.serviceability(
      shop.id,
      origin,
      destination,
      shop.deliveryRadiusKm,
      distanceMeters,
    );
    if (!service.deliverable)
      throw new BadRequestException("This shop does not deliver to your location");

    const subtotal = cart.items.reduce(
      (sum, item) => sum + (item.variant?.price ?? item.product.price) * item.qty,
      0,
    );
    const deliveryFee = computeDeliveryFee(distanceMeters, { override: service.feeOverride });
    const coupon = dto.couponCode?.trim()
      ? await this.coupons.quote(dto.couponCode, userId, shop.id, subtotal)
      : null;
    const discount = coupon?.discount ?? 0;
    const payableBeforeCoins = Math.max(0, subtotal + deliveryFee - discount);
    const availableCoins = await this.loyalty.redemptionQuote(userId, payableBeforeCoins);
    const loyaltyDiscount = dto.useGoCoins ? availableCoins.discount : 0;
    const loyaltyPointsRedeemed = dto.useGoCoins ? availableCoins.pointsUsed : 0;
    return {
      addressId: address.id,
      shopId: shop.id,
      deliverable: true,
      distanceMeters: Math.round(distanceMeters),
      subtotal,
      deliveryFee,
      discount,
      loyaltyDiscount,
      loyaltyPointsRedeemed,
      availableGoCoins: availableCoins.balance,
      eligibleGoCoins: availableCoins.pointsUsed,
      eligibleGoCoinsValue: availableCoins.discount,
      coinsPerRupee: availableCoins.coinsPerRupee,
      total: Math.max(0, payableBeforeCoins - loyaltyDiscount),
      couponCode: coupon?.code ?? null,
      minOrder: shop.minOrder,
      meetsMinOrder: subtotal >= shop.minOrder,
    };
  }

  /**
   * Place an order, at most once per `Idempotency-Key`.
   *
   * The phone this runs on loses replies. A checkout that succeeded on the
   * server and timed out on the way back looks identical, from the app, to one
   * that never arrived — and the app must retry, or a customer on a weak signal
   * can never order at all. Keying the attempt is what makes that retry safe:
   * the second request is handed the first request's order instead of creating
   * another one, with another stock decrement and another rider at the door.
   *
   * A replay answers with the order as it stands *now* rather than a recording
   * of the original response. It may since have been accepted, which is more
   * useful to show than a stale snapshot. The one thing it cannot reproduce is
   * `payment`, the gateway hand-off built during placement — a caller that
   * needs to resume an unfinished online payment asks for a fresh intent
   * through `POST /orders/:id/payment/retry`, which is the route that exists
   * for exactly that.
   */
  async checkout(userId: string, dto: CheckoutDto, idempotencyKey?: string) {
    return this.idempotency.once(
      "checkout",
      userId,
      idempotencyKey,
      async () => {
        const result = await this.placeOrder(userId, dto);
        return { id: result.id, result };
      },
      (orderId) => this.getMine(userId, orderId),
    );
  }

  private async placeOrder(userId: string, dto: CheckoutDto) {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: {
        shop: true,
        items: { include: { product: { include: { variants: true } }, variant: true } },
      },
    });
    if (!cart || cart.items.length === 0) throw new BadRequestException("Your cart is empty");
    if (!cart.shop) throw new BadRequestException("Cart has no shop");
    const shop = cart.shop;
    if (shop.status !== "ACTIVE" || !shop.isOpen)
      throw new BadRequestException("Shop is not accepting orders");

    const address = await this.prisma.address.findUnique({ where: { id: dto.addressId } });
    if (!address || address.userId !== userId) throw new NotFoundException("Address not found");
    if (address.lat == null || address.lng == null)
      throw new BadRequestException("Please pin your address on the map");
    const dest: GeoPoint = { lat: address.lat, lng: address.lng };

    // payment method must be enabled (online gateways are key-gated)
    const provider = this.payments.find(
      (p) => p.method === (dto.paymentMethod as unknown as string),
    );
    if (!provider || !provider.enabled)
      throw new BadRequestException(`Payment method ${dto.paymentMethod} is not available`);
    if (dto.paymentMethod === PaymentMethod.COD && !shop.codEnabled)
      throw new BadRequestException("Cash on delivery is not enabled for this shop");
    if (dto.paymentMethod !== PaymentMethod.COD && !shop.onlinePaymentEnabled)
      throw new BadRequestException("Online payment is not enabled for this shop");

    // delivery serviceability + fee (deterministic haversine; no external dependency)
    if (shop.lat == null || shop.lng == null)
      throw new BadRequestException("Shop location not set");
    const origin: GeoPoint = { lat: shop.lat, lng: shop.lng };
    const distanceMeters = haversineMeters(origin, dest);
    const { deliverable, feeOverride } = await this.serviceability(
      shop.id,
      origin,
      dest,
      shop.deliveryRadiusKm,
      distanceMeters,
    );
    if (!deliverable) throw new BadRequestException("This shop does not deliver to your location");

    // price from live data (never trust client)
    const lineItems = cart.items.map((it) => {
      const unit = it.variant?.price ?? it.product.price;
      return {
        productId: it.productId,
        variantId: it.variantId,
        nameSnapshot: it.product.name + (it.variant ? ` — ${it.variant.name}` : ""),
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
    const totalBeforeCoins = Math.max(0, subtotal + deliveryFee - discount);
    await this.finance.enforceCodLimit(dto.paymentMethod, totalBeforeCoins);

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
          total: totalBeforeCoins,
          paymentMethod: dto.paymentMethod,
          paymentStatus: PaymentStatus.PENDING,
          couponId: coupon?.couponId ?? null,
          note: dto.note,
          items: { create: lineItems },
          events: { create: { status: OrderStatus.PLACED, actorId: userId, note: "Order placed" } },
          delivery: {
            create: {
              destLat: dest.lat,
              destLng: dest.lng,
              distanceMeters: Math.round(distanceMeters),
            },
          },
        },
      });

      const coinRedemption = dto.useGoCoins
        ? await this.loyalty.redeemForOrder(tx, userId, created.id, totalBeforeCoins)
        : { pointsUsed: 0, discount: 0 };
      const finalized = coinRedemption.discount
        ? await tx.order.update({
            where: { id: created.id },
            data: {
              loyaltyDiscount: coinRedemption.discount,
              loyaltyPointsRedeemed: coinRedemption.pointsUsed,
              total: Math.max(0, totalBeforeCoins - coinRedemption.discount),
            },
          })
        : created;

      await tx.paymentIntent.create({
        data: {
          orderId: created.id,
          provider: dto.paymentMethod,
          amount: finalized.total,
          status: PaymentStatus.PENDING,
        },
      });
      const intent = await tx.paymentIntent.findUniqueOrThrow({ where: { orderId: created.id } });
      await tx.paymentAttempt.create({
        data: { paymentIntentId: intent.id, attempt: 1, status: PaymentStatus.PENDING },
      });
      await this.finance.recordOrderPlaced(tx, created.id);

      if (coupon) await this.coupons.redeem(tx, coupon.couponId, userId, created.id, discount);

      return finalized;
    });

    // side-effects after commit
    await this.cart.clear(userId);
    const init = await provider.init({ orderId: order.id, orderCode: code, amount: order.total });
    await this.persistPaymentInit(order.id, provider.method, init);

    this.events.emit(EVENTS.ORDER_PLACED, {
      orderId: order.id,
      code: order.code,
      shopId: shop.id,
      customerId: userId,
      total: order.total,
    } satisfies OrderPlacedEvent);

    this.logger.log(`Order ${code} placed (shop=${shop.id}, total=Rs ${order.total})`);
    return { ...(await this.getMine(userId, order.id)), payment: init };
  }

  /**
   * Server-owned preview for a host's combined draft. This intentionally reads
   * the group rows again rather than accepting line items or prices from the
   * browser, and runs the same serviceability, coupon and GoCoin calculations
   * as placement.
   */
  async groupCheckoutQuote(userId: string, groupOrderId: string, dto: CheckoutQuoteDto) {
    const group = await this.prisma.groupOrder.findFirst({
      where: { id: groupOrderId, hostId: userId },
      include: { participants: { select: { items: true } }, shop: true },
    });
    if (!group) throw new NotFoundException("Group order not found");
    if (group.status === "CANCELLED") throw new BadRequestException("Group was cancelled");
    if (group.status === "PLACED") throw new BadRequestException("Group order was already placed");

    const drafts = aggregateGroupDraftItems(group.participants);
    if (drafts.length === 0) throw new BadRequestException("No items in the group yet");
    const products = await this.prisma.product.findMany({
      where: {
        id: { in: [...new Set(drafts.map((item) => item.productId))] },
        shopId: group.shopId,
        isActive: true,
      },
      include: { variants: true },
    });
    const productsById = new Map(products.map((product) => [product.id, product]));
    const subtotal = drafts.reduce((sum, draft) => {
      const product = productsById.get(draft.productId);
      if (!product) throw new BadRequestException("Some items are not available from this shop");
      const variant = draft.variantId
        ? product.variants.find(
            (candidate) => candidate.id === draft.variantId && candidate.isActive,
          )
        : null;
      if (draft.variantId && !variant)
        throw new BadRequestException("Some item options are no longer available");
      if (!draft.variantId && product.variants.some((candidate) => candidate.isActive))
        throw new BadRequestException("Please choose a variant");
      if (variant && variant.stock < draft.qty)
        throw new BadRequestException(`${product.name} is out of stock`);
      if (!variant && product.trackStock && product.stock < draft.qty)
        throw new BadRequestException(`${product.name} is out of stock`);
      return sum + (variant?.price ?? product.price) * draft.qty;
    }, 0);

    const shop = group.shop;
    if (shop.status !== "ACTIVE" || !shop.isOpen)
      throw new BadRequestException("Shop is not accepting orders");
    const address = await this.prisma.address.findUnique({ where: { id: dto.addressId } });
    if (!address || address.userId !== userId) throw new NotFoundException("Address not found");
    if (address.lat == null || address.lng == null)
      throw new BadRequestException("Please pin your address on the map");
    if (shop.lat == null || shop.lng == null)
      throw new BadRequestException("Shop location not set");

    const origin: GeoPoint = { lat: shop.lat, lng: shop.lng };
    const destination: GeoPoint = { lat: address.lat, lng: address.lng };
    const distanceMeters = haversineMeters(origin, destination);
    const service = await this.serviceability(
      shop.id,
      origin,
      destination,
      shop.deliveryRadiusKm,
      distanceMeters,
    );
    if (!service.deliverable)
      throw new BadRequestException("This shop does not deliver to your location");

    const deliveryFee = computeDeliveryFee(distanceMeters, { override: service.feeOverride });
    const coupon = dto.couponCode?.trim()
      ? await this.coupons.quote(dto.couponCode, userId, shop.id, subtotal)
      : null;
    const discount = coupon?.discount ?? 0;
    const payableBeforeCoins = Math.max(0, subtotal + deliveryFee - discount);
    const availableCoins = await this.loyalty.redemptionQuote(userId, payableBeforeCoins);
    const loyaltyDiscount = dto.useGoCoins ? availableCoins.discount : 0;
    const loyaltyPointsRedeemed = dto.useGoCoins ? availableCoins.pointsUsed : 0;
    return {
      addressId: address.id,
      shopId: shop.id,
      deliverable: true as const,
      distanceMeters: Math.round(distanceMeters),
      subtotal,
      deliveryFee,
      discount,
      loyaltyDiscount,
      loyaltyPointsRedeemed,
      availableGoCoins: availableCoins.balance,
      eligibleGoCoins: availableCoins.pointsUsed,
      eligibleGoCoinsValue: availableCoins.discount,
      coinsPerRupee: availableCoins.coinsPerRupee,
      total: Math.max(0, payableBeforeCoins - loyaltyDiscount),
      couponCode: coupon?.code ?? null,
      minOrder: shop.minOrder,
      meetsMinOrder: subtotal >= shop.minOrder,
    };
  }

  /**
   * Place one group order without borrowing the host's personal cart.
   *
   * The conditional status update is the database claim. It, the linked order,
   * stock changes, payment intent and coupon redemption all share one transaction,
   * so a checkout error rolls the status back and a concurrent worker either waits
   * for that rollback or observes the committed PLACED row. The unique nullable
   * Order.groupOrderId index is an independent final backstop.
   */
  async checkoutGroup(userId: string, groupOrderId: string, dto: CheckoutDto) {
    const provider = this.payments.find(
      (payment) => payment.method === (dto.paymentMethod as unknown as string),
    );

    const outcome = await this.prisma.$transaction(async (tx): Promise<GroupCheckoutOutcome> => {
      const authorized = await tx.groupOrder.findFirst({
        where: { id: groupOrderId, hostId: userId },
        select: { status: true },
      });
      if (!authorized) throw new NotFoundException("Group order not found");

      if (authorized.status === "PLACED") {
        const existing = await tx.order.findUnique({
          where: { groupOrderId },
          select: { id: true },
        });
        if (!existing) throw new Error("Placed group order has no linked order");
        return { created: false, orderId: existing.id };
      }
      if (authorized.status === "CANCELLED") throw new BadRequestException("Group was cancelled");
      if (!provider || !provider.enabled) {
        throw new BadRequestException(`Payment method ${dto.paymentMethod} is not available`);
      }

      // In PostgreSQL, a concurrent UPDATE of this row waits, then rechecks this
      // predicate against the committed version. Only one transaction gets count=1.
      const claim = await tx.groupOrder.updateMany({
        where: { id: groupOrderId, hostId: userId, status: { in: ["OPEN", "LOCKED"] } },
        data: { status: "PLACED" },
      });
      if (claim.count !== 1) {
        const existing = await tx.order.findUnique({
          where: { groupOrderId },
          select: { id: true },
        });
        if (existing) return { created: false, orderId: existing.id };
        throw new Error("Group placement claim failed without a linked order");
      }

      const group = await tx.groupOrder.findUnique({
        where: { id: groupOrderId },
        include: { participants: { select: { items: true } }, shop: true },
      });
      if (!group) throw new Error("Claimed group order disappeared");

      const drafts = aggregateGroupDraftItems(group.participants);
      if (drafts.length === 0) throw new BadRequestException("No items in the group yet");

      const products = await tx.product.findMany({
        where: {
          id: { in: [...new Set(drafts.map((item) => item.productId))] },
          shopId: group.shopId,
          isActive: true,
        },
        include: { variants: true },
      });
      const productsById = new Map(products.map((product) => [product.id, product]));
      const checkoutItems = drafts.map((draft) => {
        const product = productsById.get(draft.productId);
        if (!product) throw new BadRequestException("Some items are not available from this shop");
        const variant = draft.variantId
          ? product.variants.find(
              (candidate) => candidate.id === draft.variantId && candidate.isActive,
            )
          : null;
        if (draft.variantId && !variant)
          throw new BadRequestException("Some item options are no longer available");
        if (!draft.variantId && product.variants.some((candidate) => candidate.isActive)) {
          throw new BadRequestException("Please choose a variant");
        }
        return { draft, product, variant };
      });

      const shop = group.shop;
      if (shop.status !== "ACTIVE" || !shop.isOpen)
        throw new BadRequestException("Shop is not accepting orders");
      if (dto.paymentMethod === PaymentMethod.COD && !shop.codEnabled)
        throw new BadRequestException("Cash on delivery is not enabled for this shop");
      if (dto.paymentMethod !== PaymentMethod.COD && !shop.onlinePaymentEnabled)
        throw new BadRequestException("Online payment is not enabled for this shop");
      const address = await tx.address.findUnique({ where: { id: dto.addressId } });
      if (!address || address.userId !== userId) throw new NotFoundException("Address not found");
      if (address.lat == null || address.lng == null)
        throw new BadRequestException("Please pin your address on the map");
      if (shop.lat == null || shop.lng == null)
        throw new BadRequestException("Shop location not set");

      const origin: GeoPoint = { lat: shop.lat, lng: shop.lng };
      const dest: GeoPoint = { lat: address.lat, lng: address.lng };
      const distanceMeters = haversineMeters(origin, dest);
      const { deliverable, feeOverride } = await this.serviceability(
        shop.id,
        origin,
        dest,
        shop.deliveryRadiusKm,
        distanceMeters,
        tx,
      );
      if (!deliverable)
        throw new BadRequestException("This shop does not deliver to your location");

      const lineItems = checkoutItems.map(({ draft, product, variant }) => ({
        productId: product.id,
        variantId: variant?.id ?? null,
        nameSnapshot: product.name + (variant ? ` — ${variant.name}` : ""),
        unitSnapshot: variant?.name ?? product.unit,
        price: variant?.price ?? product.price,
        qty: draft.qty,
      }));
      const subtotal = lineItems.reduce((sum, item) => sum + item.price * item.qty, 0);
      if (subtotal < shop.minOrder)
        throw new BadRequestException(`Minimum order for this shop is Rs ${shop.minOrder}`);
      const deliveryFee = computeDeliveryFee(distanceMeters, { override: feeOverride });
      const coupon = dto.couponCode
        ? await this.coupons.quote(dto.couponCode, userId, shop.id, subtotal, tx)
        : null;
      const discount = coupon?.discount ?? 0;
      const totalBeforeCoins = Math.max(0, subtotal + deliveryFee - discount);
      await this.finance.enforceCodLimit(dto.paymentMethod, totalBeforeCoins, tx);
      const code = await this.uniqueCode(tx);

      for (const { draft, product, variant } of checkoutItems) {
        if (variant) {
          const result = await tx.productVariant.updateMany({
            where: { id: variant.id, stock: { gte: draft.qty } },
            data: { stock: { decrement: draft.qty } },
          });
          if (result.count === 0) throw new BadRequestException(`${product.name} is out of stock`);
        } else if (product.trackStock) {
          const result = await tx.product.updateMany({
            where: { id: product.id, stock: { gte: draft.qty } },
            data: { stock: { decrement: draft.qty } },
          });
          if (result.count === 0) throw new BadRequestException(`${product.name} is out of stock`);
        }
      }

      const order = await tx.order.create({
        data: {
          code,
          customerId: userId,
          shopId: shop.id,
          groupOrderId,
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
          total: totalBeforeCoins,
          paymentMethod: dto.paymentMethod,
          paymentStatus: PaymentStatus.PENDING,
          couponId: coupon?.couponId ?? null,
          note: dto.note,
          items: { create: lineItems },
          events: { create: { status: OrderStatus.PLACED, actorId: userId, note: "Order placed" } },
          delivery: {
            create: {
              destLat: dest.lat,
              destLng: dest.lng,
              distanceMeters: Math.round(distanceMeters),
            },
          },
        },
      });

      const coinRedemption = dto.useGoCoins
        ? await this.loyalty.redeemForOrder(tx, userId, order.id, totalBeforeCoins)
        : { pointsUsed: 0, discount: 0 };
      const finalized = coinRedemption.discount
        ? await tx.order.update({
            where: { id: order.id },
            data: {
              loyaltyDiscount: coinRedemption.discount,
              loyaltyPointsRedeemed: coinRedemption.pointsUsed,
              total: Math.max(0, totalBeforeCoins - coinRedemption.discount),
            },
          })
        : order;
      await tx.paymentIntent.create({
        data: {
          orderId: order.id,
          provider: dto.paymentMethod,
          amount: finalized.total,
          status: PaymentStatus.PENDING,
        },
      });
      const intent = await tx.paymentIntent.findUniqueOrThrow({ where: { orderId: order.id } });
      await tx.paymentAttempt.create({
        data: { paymentIntentId: intent.id, attempt: 1, status: PaymentStatus.PENDING },
      });
      await this.finance.recordOrderPlaced(tx, order.id);
      if (coupon) await this.coupons.redeem(tx, coupon.couponId, userId, order.id, discount);

      return {
        created: true,
        orderId: order.id,
        code,
        shopId: shop.id,
        total: finalized.total,
        provider,
      };
    });

    if (!outcome.created) {
      const [order, payment] = await Promise.all([
        this.getMine(userId, outcome.orderId),
        this.prisma.paymentIntent.findUnique({ where: { orderId: outcome.orderId } }),
      ]);
      return {
        ...order,
        payment: {
          status: payment?.status ?? PaymentStatus.PENDING,
          ...(payment?.reference ? { providerRef: payment.reference } : {}),
        },
      };
    }

    // Non-database effects happen only for the transaction that created the order.
    const init = await outcome.provider.init({
      orderId: outcome.orderId,
      orderCode: outcome.code,
      amount: outcome.total,
    });
    await this.persistPaymentInit(outcome.orderId, outcome.provider.method, init);
    this.events.emit(EVENTS.ORDER_PLACED, {
      orderId: outcome.orderId,
      code: outcome.code,
      shopId: outcome.shopId,
      customerId: userId,
      total: outcome.total,
    } satisfies OrderPlacedEvent);
    this.logger.log(
      `Order ${outcome.code} placed (shop=${outcome.shopId}, total=Rs ${outcome.total})`,
    );
    return { ...(await this.getMine(userId, outcome.orderId)), payment: init };
  }

  /** True if the destination is inside the shop's radius or a custom zone; returns any fee override. */
  private async serviceability(
    shopId: string,
    origin: GeoPoint,
    dest: GeoPoint,
    radiusKm: number,
    distanceMeters: number,
    db: CheckoutReadClient = this.prisma,
  ): Promise<{ deliverable: boolean; feeOverride: number | null }> {
    if (distanceMeters <= radiusKm * 1000) return { deliverable: true, feeOverride: null };
    const zones = await db.deliveryZone.findMany({ where: { shopId } });
    for (const z of zones) {
      const ring = (z.polygon as unknown as GeoPoint[]) ?? [];
      if (ring.length >= 3 && pointInPolygon(dest, ring))
        return { deliverable: true, feeOverride: z.feeOverride ?? null };
    }
    return { deliverable: false, feeOverride: null };
  }

  private async uniqueCode(db: CheckoutReadClient = this.prisma): Promise<string> {
    for (let i = 0; i < 6; i++) {
      const code = `GP-${orderCode()}`;
      const exists = await db.order.findUnique({ where: { code }, select: { id: true } });
      if (!exists) return code;
    }
    throw new Error("Could not allocate order code");
  }

  // ══════════════════════════════ CUSTOMER ══════════════════════════════════

  /** Preview a coupon against the current cart without placing the order. */
  async previewCoupon(userId: string, code: string) {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: { items: { include: { product: true, variant: true } } },
    });
    if (!cart?.shopId || cart.items.length === 0)
      throw new BadRequestException("Your cart is empty");
    const subtotal = cart.items.reduce(
      (s, it) => s + (it.variant?.price ?? it.product.price) * it.qty,
      0,
    );
    const quote = await this.coupons.quote(code, userId, cart.shopId, subtotal);
    return { ...quote, subtotal, newTotalBeforeDelivery: subtotal - quote.discount };
  }

  async listMine(userId: string) {
    const orders = await this.prisma.order.findMany({
      where: { customerId: userId },
      orderBy: { createdAt: "desc" },
      include: this.detailInclude(),
    });
    return Promise.all(
      orders.map((order) =>
        this.withTracking(order, order.status === OrderStatus.OUT_FOR_DELIVERY),
      ),
    );
  }

  async getMine(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: this.detailInclude(),
    });
    if (!order || order.customerId !== userId) throw new NotFoundException("Order not found");
    return this.withTracking(order, true);
  }

  async cancelMine(userId: string, orderId: string, reason?: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.customerId !== userId) throw new NotFoundException("Order not found");
    return this.transition(
      order.id,
      OrderStatus.CANCELLED,
      "CUSTOMER",
      userId,
      reason ?? "Cancelled by customer",
    );
  }

  /**
   * A browser callback is only a signal to check. The adapter looks up the
   * persisted provider reference server-to-server and verifies the amount before
   * this method records PAID or opens escrow.
   */
  async verifyGatewayPayment(orderId: string, method: "ESEWA" | "KHALTI") {
    const [order, intent] = await Promise.all([
      this.prisma.order.findUnique({ where: { id: orderId } }),
      this.prisma.paymentIntent.findUnique({ where: { orderId } }),
    ]);
    if (!order || !intent || intent.provider !== method || order.paymentMethod !== method) {
      throw new NotFoundException("Payment attempt not found");
    }
    if (intent.status === PaymentStatus.PAID) return { status: PaymentStatus.PAID, orderId };
    const provider = this.payments.find((candidate) => candidate.method === method);
    if (!provider?.enabled) throw new BadRequestException(`${method} payments are not available`);

    const verified = await provider.verify({
      providerRef: intent.reference ?? undefined,
      orderId,
      amount: intent.amount,
    });
    const status = PaymentStatus[verified.status];
    await this.prisma.$transaction(async (tx) => {
      // Claim the order before the payment intent. Cancellation uses the same
      // lock order, so a late gateway callback can never capture a closed order.
      const orderClaim = await tx.order.updateMany({
        where: {
          id: orderId,
          status: { in: OPEN_STATUSES },
          paymentStatus: PaymentStatus.PENDING,
        },
        data: { paymentStatus: status },
      });
      if (orderClaim.count !== 1) return;
      // Only one concurrent callback is allowed to perform the PAID side
      // effects. Gateway return URLs are routinely opened twice by browsers or
      // retried by proxies, so plain read-then-update is not sufficient here.
      const claimed = await tx.paymentIntent.updateMany({
        where: {
          orderId,
          status: PaymentStatus.PENDING,
          attempt: intent.attempt,
        },
        data: {
          status,
          rawPayload: this.paymentAttemptPayload(intent.rawPayload, {
            gatewayVerifiedAt: new Date().toISOString(),
            status: verified.status,
          }),
        },
      });
      if (claimed.count === 0) return;
      await tx.paymentAttempt.updateMany({
        where: {
          paymentIntentId: intent.id,
          attempt: intent.attempt,
          status: PaymentStatus.PENDING,
        },
        data: {
          status,
          rawPayload: this.paymentAttemptPayload(intent.rawPayload, {
            gatewayVerifiedAt: new Date().toISOString(),
            status: verified.status,
          }),
        },
      });
      if (status === PaymentStatus.PAID) {
        await this.finance.recordPaymentCaptured(tx, orderId, order.customerId);
      }
    });
    return { status, orderId };
  }

  async retryGatewayPayment(userId: string, orderId: string) {
    const [order, intent] = await Promise.all([
      this.prisma.order.findUnique({ where: { id: orderId } }),
      this.prisma.paymentIntent.findUnique({ where: { orderId } }),
    ]);
    if (!order || order.customerId !== userId || !intent)
      throw new NotFoundException("Order not found");
    if (order.paymentMethod !== PaymentMethod.ESEWA && order.paymentMethod !== PaymentMethod.KHALTI)
      throw new BadRequestException("This order does not use an online gateway");
    if (intent.status === PaymentStatus.PAID)
      throw new BadRequestException("This payment is already paid");
    const noLongerPayable: OrderStatus[] = [
      OrderStatus.CANCELLED,
      OrderStatus.REJECTED,
      OrderStatus.DELIVERED,
    ];
    if (noLongerPayable.includes(order.status))
      throw new BadRequestException("This order can no longer be paid");
    const provider = this.payments.find((candidate) => candidate.method === order.paymentMethod);
    if (!provider?.enabled)
      throw new BadRequestException(`${order.paymentMethod} payments are not available`);

    const init = await provider.init({ orderId, orderCode: order.code, amount: intent.amount });
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.paymentIntent.updateMany({
        where: {
          orderId,
          status: { in: [PaymentStatus.FAILED, PaymentStatus.PENDING] },
          attempt: intent.attempt,
        },
        data: {
          status: PaymentStatus.PENDING,
          attempt: { increment: 1 },
          reference: init.providerRef,
          rawPayload: this.paymentAttemptPayload(
            intent.rawPayload,
            { gatewayRetriedAt: new Date().toISOString() },
            true,
          ),
        },
      });
      if (claimed.count !== 1)
        throw new BadRequestException("Payment state changed; reload the order");
      const payment = await tx.paymentIntent.findUniqueOrThrow({ where: { orderId } });
      await tx.paymentAttempt.create({
        data: {
          paymentIntentId: payment.id,
          attempt: payment.attempt,
          status: PaymentStatus.PENDING,
          reference: init.providerRef,
          rawPayload: payment.rawPayload ?? undefined,
        },
      });
      await tx.order.updateMany({
        where: {
          id: orderId,
          paymentStatus: { in: [PaymentStatus.FAILED, PaymentStatus.PENDING] },
        },
        data: { paymentStatus: PaymentStatus.PENDING },
      });
    });
    return { payment: { ...init, amount: intent.amount } };
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
        orderBy: { placedAt: query.sort === "oldest" ? "asc" : "desc" },
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

    return {
      ...paginate(rows.map(withSafeDelivery), total, query.page, query.limit),
      summary,
    };
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
        by: ["status"],
        where: { shopId },
        _count: { _all: true },
      }),
      this.prisma.order.aggregate({
        where: { shopId, paymentMethod: PaymentMethod.COD, status: { in: OPEN_STATUSES } },
        _sum: { total: true },
      }),
    ]);

    const count = (...statuses: OrderStatus[]) =>
      groups.filter((g) => statuses.includes(g.status)).reduce((sum, g) => sum + g._count._all, 0);

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
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: this.detailInclude(),
    });
    if (!order || order.shopId !== shopId) throw new NotFoundException("Order not found");
    return this.withTracking(order, false);
  }

  async accept(shopId: string, orderId: string, note?: string, actorId?: string) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, shopId } });
    if (!order) throw new NotFoundException("Order not found");
    if (order.paymentMethod !== PaymentMethod.COD && order.paymentStatus !== PaymentStatus.PAID) {
      throw new BadRequestException(
        "Wait for the online payment to be verified before accepting this order",
      );
    }
    return this.shopTransition(
      shopId,
      orderId,
      OrderStatus.ACCEPTED,
      note ?? "Accepted by shop",
      actorId,
    );
  }
  reject(shopId: string, orderId: string, reason: string, actorId?: string) {
    return this.shopTransition(shopId, orderId, OrderStatus.REJECTED, reason, actorId);
  }
  pack(shopId: string, orderId: string, note?: string, actorId?: string) {
    return this.shopTransition(shopId, orderId, OrderStatus.PACKED, note ?? "Packed", actorId);
  }
  cancelForShop(shopId: string, orderId: string, reason?: string, actorId?: string) {
    return this.shopTransition(
      shopId,
      orderId,
      OrderStatus.CANCELLED,
      reason ?? "Cancelled by shop",
      actorId,
    );
  }

  /**
   * Dispatch requires a rider to be assigned to the delivery — you can't send an
   * order "out for delivery" with nobody carrying it.
   */
  async dispatch(shopId: string, orderId: string, note?: string, actorId?: string) {
    const delivery = await this.prisma.delivery.findUnique({ where: { orderId } });
    if (!delivery?.riderId) throw new BadRequestException("Assign a rider before dispatching");
    return this.shopTransition(
      shopId,
      orderId,
      OrderStatus.OUT_FOR_DELIVERY,
      note ?? "Out for delivery",
      actorId,
    );
  }

  private async shopTransition(
    shopId: string,
    orderId: string,
    to: OrderStatus,
    note?: string,
    actorId?: string,
  ) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.shopId !== shopId) throw new NotFoundException("Order not found");
    return this.transition(order.id, to, "SHOP", actorId, note);
  }

  // ══════════════════════════════ STATE MACHINE ═════════════════════════════

  /** The single choke-point for every status change. Validates the move, stamps the
   * timestamp, writes an OrderEvent, and emits a domain event — all atomically. */
  async transition(
    orderId: string,
    to: OrderStatus,
    actor: Actor,
    actorId?: string,
    note?: string,
  ) {
    const before = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!before) throw new NotFoundException("Order not found");
    if (before.status === to) return before;
    if (!canTransition(before.status, to, actor)) {
      const legal = allowedTransitions(before.status)
        .filter((r) => r.actors.includes(actor))
        .map((r) => r.to);
      throw new ForbiddenException(
        `Cannot move order from ${before.status} to ${to}${legal.length ? ` (allowed: ${legal.join(", ")})` : ""}`,
      );
    }
    if (before.status === OrderStatus.OUT_FOR_DELIVERY && to === OrderStatus.CANCELLED) {
      const delivery = await this.prisma.delivery.findUnique({
        where: { orderId },
        select: { status: true },
      });
      if (delivery?.status !== "RETURNED_TO_SHOP") {
        throw new ForbiddenException(
          "This order can be cancelled only after the shop confirms the parcel has returned",
        );
      }
    }

    const data: Prisma.OrderUpdateInput = { status: to };
    const stampField = STATUS_TIMESTAMP[to];
    if (stampField) (data as Record<string, unknown>)[stampField] = new Date();
    if (to === OrderStatus.CANCELLED || to === OrderStatus.REJECTED) data.cancelReason = note;
    if (to === OrderStatus.DELIVERED && before.paymentMethod === PaymentMethod.COD) {
      const delivery = await this.prisma.delivery.findUnique({ where: { orderId } });
      if (!delivery?.codCollected || delivery.codAmount !== before.total) {
        throw new BadRequestException("Confirm collection of the exact COD amount before delivery");
      }
      data.paymentStatus = PaymentStatus.PAID;
    }

    let changed = false;
    const updated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: { id: orderId, status: before.status },
        data,
      });
      if (claimed.count !== 1) return tx.order.findUniqueOrThrow({ where: { id: orderId } });
      changed = true;
      // Re-read under the row lock. A gateway callback may have completed
      // between the initial authorization read and this state claim.
      const current = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
      await tx.orderEvent.create({ data: { orderId, status: to, actorId, note } });
      // keep the delivery row roughly in sync for terminal states
      if (to === OrderStatus.DELIVERED)
        await tx.delivery.updateMany({
          where: { orderId, status: { not: "DELIVERED" } },
          data: { status: "DELIVERED", deliveredAt: new Date() },
        });
      if (to === OrderStatus.CANCELLED || to === OrderStatus.REJECTED) {
        const delivery = await tx.delivery.findUnique({
          where: { orderId },
          select: { riderId: true },
        });
        await tx.delivery.updateMany({
          where: { orderId, status: { not: "RETURNED_TO_SHOP" } },
          data: { status: "FAILED", failedAt: new Date(), failReason: note },
        });
        if (delivery?.riderId) {
          await tx.rider.updateMany({
            where: { id: delivery.riderId, status: "ON_DELIVERY" },
            data: { status: "ONLINE" },
          });
        }
        await this.restoreInventory(tx, orderId);
        await tx.paymentIntent.updateMany({
          where: { orderId, status: PaymentStatus.PENDING },
          data: { status: PaymentStatus.FAILED },
        });
        await tx.paymentAttempt.updateMany({
          where: { paymentIntent: { orderId }, status: PaymentStatus.PENDING },
          data: { status: PaymentStatus.FAILED },
        });
        if (current.paymentStatus === PaymentStatus.PENDING) {
          await tx.order.update({
            where: { id: orderId },
            data: { paymentStatus: PaymentStatus.FAILED },
          });
        } else if (
          actorId &&
          (current.paymentStatus === PaymentStatus.PAID ||
            current.paymentStatus === PaymentStatus.PARTIALLY_REFUNDED)
        ) {
          await this.finance.reserveCancellationRefund(
            tx,
            orderId,
            actorId,
            note ?? `Order ${to.toLowerCase()}`,
          );
        }
      }
      if (to === OrderStatus.DELIVERED)
        await this.finance.recordOrderDelivered(tx, orderId, actorId);
      if (to === OrderStatus.DELIVERED && before.paymentMethod === PaymentMethod.COD)
        await tx.paymentIntent.updateMany({
          where: { orderId, status: PaymentStatus.PENDING },
          data: { status: PaymentStatus.PAID },
        });
      if (to === OrderStatus.DELIVERED)
        await this.referrals.qualifyDeliveredOrder(tx, before.customerId, orderId);
      if (to === OrderStatus.CANCELLED || to === OrderStatus.REJECTED)
        await this.loyalty.restoreCancelledOrder(tx, before.customerId, orderId);
      if (to === OrderStatus.CANCELLED || to === OrderStatus.REJECTED)
        await this.coupons.releaseForOrder(tx, orderId);
      return tx.order.findUniqueOrThrow({ where: { id: orderId } });
    });

    if (changed)
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

  /** Return exactly the inventory reserved at checkout. This runs only after the
   * terminal state was atomically claimed, so concurrent retries cannot add stock twice. */
  private async restoreInventory(tx: Prisma.TransactionClient, orderId: string) {
    const items = await tx.orderItem.findMany({
      where: { orderId },
      select: { productId: true, variantId: true, qty: true },
    });
    for (const item of items) {
      if (item.variantId) {
        await tx.productVariant.updateMany({
          where: { id: item.variantId },
          data: { stock: { increment: item.qty } },
        });
      } else if (item.productId) {
        await tx.product.updateMany({
          where: { id: item.productId, trackStock: true },
          data: { stock: { increment: item.qty } },
        });
      }
    }
  }

  // ══════════════════════════════ HELPERS ═══════════════════════════════════

  private detailInclude() {
    return ORDER_DETAIL_INCLUDE;
  }

  private async persistPaymentInit(
    orderId: string,
    provider: string,
    init: { status: "PENDING" | "REQUIRES_ACTION" | "PAID"; providerRef?: string },
  ) {
    // COD is already persisted as PENDING in the checkout transaction and has
    // no external reference to add.
    if (init.status === "PENDING" && !init.providerRef) return;
    const status = init.status === "PAID" ? PaymentStatus.PAID : PaymentStatus.PENDING;
    await this.prisma.$transaction(async (tx) => {
      const intent = await tx.paymentIntent.findUniqueOrThrow({ where: { orderId } });
      const claimed = await tx.paymentIntent.updateMany({
        where: { orderId, status: PaymentStatus.PENDING, attempt: intent.attempt },
        data: {
          status,
          reference: init.providerRef,
          rawPayload: this.paymentAttemptPayload(null, {
            provider,
            initiatedAt: new Date().toISOString(),
          }),
        },
      });
      if (claimed.count !== 1) return;
      await tx.paymentAttempt.updateMany({
        where: {
          paymentIntentId: intent.id,
          attempt: intent.attempt,
          status: PaymentStatus.PENDING,
        },
        data: {
          status,
          reference: init.providerRef,
          rawPayload: this.paymentAttemptPayload(null, {
            provider,
            initiatedAt: new Date().toISOString(),
          }),
        },
      });
      await tx.order.updateMany({
        where: { id: orderId, paymentStatus: PaymentStatus.PENDING },
        data: { paymentStatus: status },
      });
      if (status === PaymentStatus.PAID) await this.finance.recordPaymentCaptured(tx, orderId);
    });
  }

  private paymentAttemptPayload(
    value: Prisma.JsonValue | null,
    event: Record<string, string>,
    increment = false,
  ): Prisma.InputJsonObject {
    const previous = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const attempt = typeof previous.attempt === "number" ? previous.attempt : 1;
    return { ...previous, attempt: increment ? attempt + 1 : attempt, ...event };
  }

  private paymentView(intent: { status: PaymentStatus; reference: string | null; amount: number }) {
    return {
      status: intent.status,
      providerRef: intent.reference ?? undefined,
      amount: intent.amount,
    };
  }

  /** Attaches real pins and, on customer tracking reads, provider route geometry. */
  private async withTracking(order: OrderDetail, includeRoute: boolean) {
    const d = order.delivery;
    const rider = d?.rider;
    const activelyEnRoute =
      order.status === OrderStatus.OUT_FOR_DELIVERY && d?.status === "EN_ROUTE";
    const destination =
      order.lat != null && order.lng != null ? { lat: order.lat, lng: order.lng } : null;
    const origin =
      order.shop.lat != null && order.shop.lng != null
        ? { lat: order.shop.lat, lng: order.shop.lng }
        : null;
    const routed =
      includeRoute && activelyEnRoute && origin && destination
        ? await this.maps.route(origin, destination)
        : null;
    const tracking = {
      status: order.status,
      deliveryStatus: d?.status ?? null,
      destination,
      origin,
      route: routed
        ? {
            distanceMeters: routed.distanceMeters,
            durationSeconds: routed.durationSeconds,
            geometry: routed.geometry ?? null,
            degraded: routed.degraded,
          }
        : null,
      // live rider position is only exposed while the order is actually moving
      rider:
        activelyEnRoute && rider?.lat != null && rider.lng != null
          ? {
              name: rider.user.name ?? "Rider",
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
    return { ...withSafeDelivery(order), tracking };
  }
}

/** Never serialize the private proof storage key in any customer or seller order. */
function withSafeDelivery<T extends { delivery?: { podImageUrl: string | null } | null }>(
  order: T,
) {
  if (!order.delivery) return order;
  const { podImageUrl, ...delivery } = order.delivery;
  return { ...order, delivery: { ...delivery, hasProofPhoto: Boolean(podImageUrl) } };
}
