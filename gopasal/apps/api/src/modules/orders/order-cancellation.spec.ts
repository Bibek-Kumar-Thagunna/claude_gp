import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { DeliveryStatus, OrderStatus, PaymentMethod, PaymentStatus } from "@prisma/client";
import type { PrismaService } from "../../common/prisma/prisma.service";
import type { CartService } from "../cart/cart.service";
import type { CouponsService } from "../coupons/coupons.service";
import type { LoyaltyService } from "../engagement/loyalty.service";
import type { ReferralService } from "../engagement/referral.service";
import type { FinanceService } from "../finance/finance.service";
import type { MapProvider } from "../../providers/map.provider";
import type { PaymentProvider } from "../../providers/payment.provider";
import { EVENTS } from "../../common/events";
import { OrdersService } from "./orders.service";
import type { IdempotencyService } from "../../common/idempotency/idempotency.service";

const paidOrder = {
  id: "order_1",
  code: "GP-100001",
  customerId: "customer_1",
  shopId: "shop_1",
  status: OrderStatus.ACCEPTED,
  paymentMethod: PaymentMethod.KHALTI,
  paymentStatus: PaymentStatus.PAID,
  total: 500,
};

function cancellationSubject(
  options: {
    claimCount?: number;
    beforePayment?: PaymentStatus;
    currentPayment?: PaymentStatus;
    orderStatus?: OrderStatus;
    deliveryStatus?: DeliveryStatus;
  } = {},
) {
  const before = {
    ...paidOrder,
    status: options.orderStatus ?? paidOrder.status,
    paymentStatus: options.beforePayment ?? PaymentStatus.PAID,
  };
  const current = {
    ...paidOrder,
    status: OrderStatus.CANCELLED,
    paymentStatus: options.currentPayment ?? before.paymentStatus,
  };
  const writes: string[] = [];
  const tx = {
    order: {
      updateMany: () => {
        writes.push("order.claim");
        return Promise.resolve({ count: options.claimCount ?? 1 });
      },
      findUniqueOrThrow: () => Promise.resolve(current),
      update: () => {
        writes.push("order.payment");
        return Promise.resolve({});
      },
    },
    orderEvent: {
      create: () => {
        writes.push("event");
        return Promise.resolve({});
      },
    },
    delivery: {
      findUnique: () => Promise.resolve({ riderId: "rider_1" }),
      updateMany: () => {
        writes.push("delivery");
        return Promise.resolve({ count: 1 });
      },
    },
    rider: {
      updateMany: () => {
        writes.push("rider");
        return Promise.resolve({ count: 1 });
      },
    },
    orderItem: {
      findMany: () =>
        Promise.resolve([
          { productId: "product_1", variantId: null, qty: 2 },
          { productId: "product_2", variantId: "variant_1", qty: 3 },
        ]),
    },
    product: {
      updateMany: () => {
        writes.push("product.stock");
        return Promise.resolve({ count: 1 });
      },
    },
    productVariant: {
      updateMany: () => {
        writes.push("variant.stock");
        return Promise.resolve({ count: 1 });
      },
    },
    paymentIntent: {
      updateMany: () => {
        writes.push("payment.intent");
        return Promise.resolve({ count: 0 });
      },
    },
    paymentAttempt: {
      updateMany: () => {
        writes.push("payment.attempt");
        return Promise.resolve({ count: 0 });
      },
    },
  };
  const prisma = {
    order: { findUnique: () => Promise.resolve(before) },
    delivery: {
      findUnique: () =>
        Promise.resolve({ status: options.deliveryStatus ?? DeliveryStatus.RETURNED_TO_SHOP }),
    },
    $transaction: (fn: (client: typeof tx) => unknown) => fn(tx),
  } as unknown as PrismaService;
  const restored: string[] = [];
  const finance = {
    reserveCancellationRefund: () => {
      restored.push("refund");
      return Promise.resolve({});
    },
  } as unknown as FinanceService;
  const loyalty = {
    restoreCancelledOrder: () => {
      restored.push("coins");
      return Promise.resolve();
    },
  } as unknown as LoyaltyService;
  const coupons = {
    releaseForOrder: () => {
      restored.push("coupon");
      return Promise.resolve();
    },
  } as unknown as CouponsService;
  const events = new EventEmitter2();
  let emitted = 0;
  events.on(EVENTS.ORDER_STATUS_CHANGED, () => {
    emitted += 1;
  });
  const service = new OrdersService(
    prisma,
    {} as CartService,
    coupons,
    finance,
    {} as ReferralService,
    loyalty,
    events,
    { route: () => Promise.resolve(null) } as unknown as MapProvider,
    [] as PaymentProvider[],
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
  return { service, writes, restored, emitted: () => emitted };
}

describe("order cancellation consistency", () => {
  it("refuses an in-flight cancellation until the parcel is confirmed back at the shop", async () => {
    const { service, writes, restored } = cancellationSubject({
      orderStatus: OrderStatus.OUT_FOR_DELIVERY,
      deliveryStatus: DeliveryStatus.RETURNING_TO_SHOP,
    });
    await assert.rejects(
      () =>
        service.transition(
          paidOrder.id,
          OrderStatus.CANCELLED,
          "CUSTOMER",
          paidOrder.customerId,
          "Plans changed",
        ),
      ForbiddenException,
    );
    assert.deepEqual(writes, []);
    assert.deepEqual(restored, []);
  });

  it("allows cancellation after the shop confirms the return and starts the paid refund", async () => {
    const { service, restored } = cancellationSubject({
      orderStatus: OrderStatus.OUT_FOR_DELIVERY,
      deliveryStatus: DeliveryStatus.RETURNED_TO_SHOP,
    });
    const result = await service.transition(
      paidOrder.id,
      OrderStatus.CANCELLED,
      "CUSTOMER",
      paidOrder.customerId,
      "Please cancel instead of redelivering",
    );
    assert.equal(result.status, OrderStatus.CANCELLED);
    assert.deepEqual(restored.sort(), ["coins", "coupon", "refund"]);
  });

  it("restocks every reserved line, frees the rider, and reserves a paid refund once", async () => {
    const { service, writes, restored, emitted } = cancellationSubject();
    const result = await service.transition(
      paidOrder.id,
      OrderStatus.CANCELLED,
      "CUSTOMER",
      paidOrder.customerId,
      "Plans changed",
    );

    assert.equal(result.status, OrderStatus.CANCELLED);
    assert.ok(writes.includes("product.stock"));
    assert.ok(writes.includes("variant.stock"));
    assert.ok(writes.includes("rider"));
    assert.deepEqual(restored.sort(), ["coins", "coupon", "refund"]);
    assert.equal(emitted(), 1);
  });

  it("performs no terminal side effects when another request won the state claim", async () => {
    const { service, writes, restored, emitted } = cancellationSubject({ claimCount: 0 });
    await service.transition(
      paidOrder.id,
      OrderStatus.CANCELLED,
      "CUSTOMER",
      paidOrder.customerId,
      "Plans changed",
    );

    assert.deepEqual(writes, ["order.claim"]);
    assert.deepEqual(restored, []);
    assert.equal(emitted(), 0);
  });

  it("reserves a refund when payment completes just before cancellation gets the row lock", async () => {
    const { service, writes, restored } = cancellationSubject({
      beforePayment: PaymentStatus.PENDING,
      currentPayment: PaymentStatus.PAID,
    });
    await service.transition(
      paidOrder.id,
      OrderStatus.CANCELLED,
      "CUSTOMER",
      paidOrder.customerId,
      "Ordered by mistake",
    );

    assert.ok(restored.includes("refund"));
    assert.ok(!writes.includes("order.payment"));
  });
});

describe("late gateway callbacks", () => {
  it("cannot mark a closed order paid or open escrow", async () => {
    let intentWrites = 0;
    let captured = 0;
    const tx = {
      order: { updateMany: () => Promise.resolve({ count: 0 }) },
      paymentIntent: {
        updateMany: () => {
          intentWrites += 1;
          return Promise.resolve({ count: 1 });
        },
      },
      paymentAttempt: { updateMany: () => Promise.resolve({ count: 1 }) },
    };
    const prisma = {
      order: {
        findUnique: () => Promise.resolve({ ...paidOrder, paymentStatus: PaymentStatus.PENDING }),
      },
      paymentIntent: {
        findUnique: () =>
          Promise.resolve({
            id: "intent_1",
            orderId: paidOrder.id,
            provider: PaymentMethod.KHALTI,
            status: PaymentStatus.PENDING,
            attempt: 1,
            amount: paidOrder.total,
            reference: "pidx_1",
            rawPayload: null,
          }),
      },
      $transaction: (fn: (client: typeof tx) => unknown) => fn(tx),
    } as unknown as PrismaService;
    const provider = {
      method: "KHALTI",
      enabled: true,
      init: () => Promise.resolve({ status: "REQUIRES_ACTION" as const }),
      verify: () => Promise.resolve({ status: "PAID" as const }),
    } satisfies PaymentProvider;
    const service = new OrdersService(
      prisma,
      {} as CartService,
      {} as CouponsService,
      {
        recordPaymentCaptured: () => {
          captured += 1;
          return Promise.resolve();
        },
      } as unknown as FinanceService,
      {} as ReferralService,
      {} as LoyaltyService,
      new EventEmitter2(),
      { route: () => Promise.resolve(null) } as unknown as MapProvider,
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

    await service.verifyGatewayPayment(paidOrder.id, "KHALTI");
    assert.equal(intentWrites, 0);
    assert.equal(captured, 0);
  });
});
