/* eslint-disable @typescript-eslint/require-await -- Prisma-shaped in-memory fakes preserve async contracts. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PrismaService } from "../../common/prisma/prisma.service";
import type { CartService } from "../cart/cart.service";
import type { CouponsService } from "../coupons/coupons.service";
import type { PaymentProvider } from "../../providers/payment.provider";
import { OrdersService } from "../orders/orders.service";
import type { IdempotencyService } from "../../common/idempotency/idempotency.service";

const USER_ID = "host-one";
const GROUP_ID = "group-one";

class PlacementDatabase {
  groupStatus: "OPEN" | "PLACED" = "OPEN";
  order: { id: string; code: string; customerId: string } | null = null;
  stockDecrements = 0;
  couponRedemptions = 0;
  paymentIntents = 0;
  failNextCouponRedemption = false;
  private transactionTail: Promise<void> = Promise.resolve();

  readonly group = {
    id: GROUP_ID,
    hostId: USER_ID,
    shopId: "shop-one",
    participants: [{ items: [{ productId: "product-one", variantId: null, qty: 2 }] }],
    shop: {
      id: "shop-one",
      status: "ACTIVE",
      isOpen: true,
      lat: 27.7,
      lng: 85.3,
      deliveryRadiusKm: 3,
      minOrder: 0,
      codEnabled: true,
      onlinePaymentEnabled: true,
    },
  };

  readonly tx = {
    groupOrder: {
      findFirst: async () =>
        this.group.id === GROUP_ID && this.group.hostId === USER_ID
          ? { status: this.groupStatus }
          : null,
      updateMany: async () => {
        if (this.groupStatus !== "OPEN") return { count: 0 };
        this.groupStatus = "PLACED";
        return { count: 1 };
      },
      findUnique: async () => ({ ...this.group, status: this.groupStatus }),
    },
    order: {
      findUnique: async (args: { where: { groupOrderId?: string; code?: string } }) =>
        args.where.groupOrderId ? this.order : null,
      create: async (args: { data: { code: string; customerId: string } }) => {
        this.order = { id: "order-one", code: args.data.code, customerId: args.data.customerId };
        return this.order;
      },
    },
    product: {
      findMany: async () => [
        {
          id: "product-one",
          name: "Rice",
          unit: "1 bag",
          price: 100,
          trackStock: true,
          variants: [],
        },
      ],
      updateMany: async () => {
        this.stockDecrements += 1;
        return { count: 1 };
      },
    },
    productVariant: { updateMany: async () => ({ count: 1 }) },
    address: {
      findUnique: async () => ({
        id: "address-one",
        userId: USER_ID,
        recipientName: "Host",
        phone: "9800000000",
        area: "Kathmandu",
        landmark: null,
        fullAddress: "Kathmandu",
        lat: 27.7,
        lng: 85.3,
      }),
    },
    deliveryZone: { findMany: async () => [] },
    paymentIntent: {
      create: async () => {
        this.paymentIntents += 1;
        return {};
      },
      findUniqueOrThrow: async () => ({ id: "payment-intent-one" }),
    },
    paymentAttempt: { create: async () => ({}) },
  };

  async transaction<T>(work: (tx: PlacementDatabase["tx"]) => Promise<T>): Promise<T> {
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const snapshot = {
      groupStatus: this.groupStatus,
      order: this.order,
      stockDecrements: this.stockDecrements,
      couponRedemptions: this.couponRedemptions,
      paymentIntents: this.paymentIntents,
    };
    try {
      return await work(this.tx);
    } catch (error) {
      Object.assign(this, snapshot);
      throw error;
    } finally {
      release();
    }
  }
}

function harness(db = new PlacementDatabase()) {
  let providerInitializations = 0;
  let placedEvents = 0;
  const prisma = {
    $transaction: <T>(work: (tx: PlacementDatabase["tx"]) => Promise<T>) => db.transaction(work),
    paymentIntent: {
      findUnique: async () => ({ status: "PENDING", reference: null }),
    },
  };
  const coupons = {
    quote: async () => ({
      couponId: "coupon-one",
      code: "SAVE",
      type: "FLAT",
      value: 10,
      discount: 10,
    }),
    redeem: async () => {
      db.couponRedemptions += 1;
      if (db.failNextCouponRedemption) {
        db.failNextCouponRedemption = false;
        throw new Error("coupon redemption write failed");
      }
    },
  };
  const events = {
    emit: () => {
      placedEvents += 1;
      return true;
    },
  };
  const provider: PaymentProvider = {
    method: "COD",
    enabled: true,
    init: async () => {
      providerInitializations += 1;
      return { status: "PENDING" };
    },
    verify: async () => ({ status: "PENDING" }),
  };
  const service = new OrdersService(
    prisma as unknown as PrismaService,
    {} as CartService,
    coupons as unknown as CouponsService,
    {
      enforceCodLimit: async () => undefined,
      recordOrderPlaced: async () => undefined,
      recordPaymentCaptured: async () => undefined,
      recordOrderDelivered: async () => undefined,
    } as never,
    { qualifyDeliveredOrder: async () => false } as never,
    {
      redemptionQuote: async () => ({ balance: 0, pointsUsed: 0, discount: 0 }),
      redeemForOrder: async () => ({ pointsUsed: 0, discount: 0 }),
      restoreCancelledOrder: async () => undefined,
    } as never,
    events as never,
    {
      name: "test-map",
      clientConfig: () => ({ provider: "none", token: null }),
      reverseGeocode: async () => null,
      route: async () => ({ distanceMeters: 0, durationSeconds: 0, degraded: true }),
    },
    [provider],
        // Idempotency is exercised by its own spec; here it simply runs the work.
      {
        once: async (
          _scope: string,
          _userId: string,
          _key: string | null | undefined,
          work: () => Promise<{ id: string; result: unknown }>,
        ) => (await work()).result,
      } as unknown as IdempotencyService,
);
  service.getMine = async (_userId: string, orderId: string) =>
    ({ id: orderId, paymentStatus: "PENDING" }) as never;
  return {
    db,
    service,
    get providerInitializations() {
      return providerInitializations;
    },
    get placedEvents() {
      return placedEvents;
    },
  };
}

describe("group-order placement transaction", () => {
  it("returns the same order to concurrent callers with one stock, coupon, payment, and external effect", async () => {
    const state = harness();
    const dto = { addressId: "address-one", paymentMethod: "COD" as const, couponCode: "SAVE" };
    const [first, second] = await Promise.all([
      state.service.checkoutGroup(USER_ID, GROUP_ID, dto),
      state.service.checkoutGroup(USER_ID, GROUP_ID, dto),
    ]);

    assert.equal(first.id, "order-one");
    assert.equal(second.id, "order-one");
    assert.equal(state.db.stockDecrements, 1);
    assert.equal(state.db.couponRedemptions, 1);
    assert.equal(state.db.paymentIntents, 1);
    assert.equal(state.providerInitializations, 1);
    assert.equal(state.placedEvents, 1);
  });

  it("rolls back a failed claim and safely succeeds on retry", async () => {
    const state = harness();
    state.db.failNextCouponRedemption = true;
    const dto = { addressId: "address-one", paymentMethod: "COD" as const, couponCode: "SAVE" };

    await assert.rejects(
      () => state.service.checkoutGroup(USER_ID, GROUP_ID, dto),
      /coupon redemption write failed/,
    );
    assert.equal(state.db.groupStatus, "OPEN");
    assert.equal(state.db.order, null);
    assert.equal(state.db.stockDecrements, 0);
    assert.equal(state.db.couponRedemptions, 0);

    const retried = await state.service.checkoutGroup(USER_ID, GROUP_ID, dto);
    assert.equal(retried.id, "order-one");
    assert.equal(state.db.groupStatus, "PLACED");
    assert.equal(state.db.stockDecrements, 1);
    assert.equal(state.db.couponRedemptions, 1);
    assert.equal(state.db.paymentIntents, 1);
  });
});
