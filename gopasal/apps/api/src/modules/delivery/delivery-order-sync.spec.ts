import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { DeliveryStatus, OrderStatus, PaymentMethod } from "@prisma/client";
import type { PrismaService } from "../../common/prisma/prisma.service";
import type { AuditService } from "../audit/audit.service";
import type { OrdersService } from "../orders/orders.service";
import type { UploadsService } from "../uploads/uploads.service";
import { DeliveryService } from "./delivery.service";
import type { RiderLocationService } from "./rider-location.service";

/**
 * The delivery row is committed before the order is asked to follow it. That
 * ordering is what made an illegal order move destructive rather than merely
 * rejected: the rider went EN_ROUTE, the order stayed behind, and the retry
 * path — which short-circuits on `delivery.status === to` — re-ran the same
 * failing sync on every attempt, so the order could never move again.
 *
 * These tests pin both halves of the fix: the move is refused before any write
 * when the order cannot legally follow, and it is allowed (advancing the order)
 * when it can.
 */

function delivery(deliveryStatus: DeliveryStatus, orderStatus: OrderStatus) {
  return {
    id: "delivery_1",
    orderId: "order_1",
    riderId: "rider_1",
    status: deliveryStatus,
    assignedAt: new Date("2026-09-14T08:00:00Z"),
    pickedUpAt: new Date("2026-09-14T08:10:00Z"),
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
    order: {
      shopId: "shop_1",
      customerId: "customer_1",
      code: "GP-100001",
      status: orderStatus,
      paymentMethod: PaymentMethod.COD,
      total: 420,
    },
  };
}

function subject(initial: ReturnType<typeof delivery>) {
  const writes: string[] = [];
  const transitions: { to: OrderStatus; actor: string }[] = [];
  const tx = {
    delivery: {
      updateMany: () => {
        writes.push("delivery");
        return Promise.resolve({ count: 1 });
      },
      findUnique: () => Promise.resolve(initial),
    },
    rider: {
      updateMany: () => {
        writes.push("rider");
        return Promise.resolve({ count: 1 });
      },
    },
  };
  const prisma = {
    rider: { findUnique: () => Promise.resolve({ id: "rider_1", userId: "user_1" }) },
    delivery: { findUnique: () => Promise.resolve(initial) },
    $transaction: (fn: (client: typeof tx) => unknown) => fn(tx),
  } as unknown as PrismaService;
  const orders = {
    transition: (_orderId: string, to: OrderStatus, actor: string) => {
      transitions.push({ to, actor });
      return Promise.resolve({});
    },
  } as unknown as OrdersService;
  const service = new DeliveryService(
    prisma,
    orders,
    { clearOrderCache: () => Promise.resolve() } as unknown as RiderLocationService,
    new EventEmitter2(),
    {} as UploadsService,
    { record: () => Promise.resolve() } as unknown as AuditService,
  );
  return { service, writes, transitions };
}

describe("delivery → order status sync", () => {
  it("advances a packed order when the rider goes en route", async () => {
    const { service, writes, transitions } = subject(
      delivery(DeliveryStatus.PICKED_UP, OrderStatus.PACKED),
    );

    await service.riderUpdateStatus("user_1", "order_1", { status: DeliveryStatus.EN_ROUTE });

    assert.deepEqual(writes, ["delivery"]);
    assert.deepEqual(transitions, [{ to: OrderStatus.OUT_FOR_DELIVERY, actor: "SYSTEM" }]);
  });

  it("refuses en route before the shop has packed, and writes nothing", async () => {
    const { service, writes, transitions } = subject(
      delivery(DeliveryStatus.PICKED_UP, OrderStatus.ACCEPTED),
    );

    await assert.rejects(
      () => service.riderUpdateStatus("user_1", "order_1", { status: DeliveryStatus.EN_ROUTE }),
      (err: unknown) => {
        assert.ok(err instanceof BadRequestException);
        assert.match(err.message, /accepted/i);
        return true;
      },
    );

    // The point of the guard: the rejection leaves the delivery exactly as it
    // was, so the next attempt starts from a clean state instead of a dead end.
    assert.deepEqual(writes, []);
    assert.deepEqual(transitions, []);
  });

  it("refuses delivered while the order is still packed, and writes nothing", async () => {
    const { service, writes, transitions } = subject(
      delivery(DeliveryStatus.EN_ROUTE, OrderStatus.PACKED),
    );

    await assert.rejects(
      () =>
        service.riderUpdateStatus("user_1", "order_1", {
          status: DeliveryStatus.DELIVERED,
          podNote: "Handed to the customer at the gate",
          codCollected: true,
        }),
      BadRequestException,
    );

    assert.deepEqual(writes, []);
    assert.deepEqual(transitions, []);
  });

  it("still moves a delivered order when it is genuinely out for delivery", async () => {
    const { service, writes, transitions } = subject(
      delivery(DeliveryStatus.EN_ROUTE, OrderStatus.OUT_FOR_DELIVERY),
    );

    await service.riderUpdateStatus("user_1", "order_1", {
      status: DeliveryStatus.DELIVERED,
      podNote: "Handed to the customer at the gate",
      codCollected: true,
    });

    assert.deepEqual(writes, ["delivery", "rider"]);
    assert.deepEqual(transitions, [{ to: OrderStatus.DELIVERED, actor: "SYSTEM" }]);
  });

  it("heals an order left behind by an earlier divergence", async () => {
    // Delivery already EN_ROUTE, order still PACKED — the exact state the old
    // code stranded orders in. Re-sending the same status must now carry the
    // order forward rather than throwing for ever.
    const { service, transitions } = subject(delivery(DeliveryStatus.EN_ROUTE, OrderStatus.PACKED));

    await service.riderUpdateStatus("user_1", "order_1", { status: DeliveryStatus.EN_ROUTE });

    assert.deepEqual(transitions, [{ to: OrderStatus.OUT_FOR_DELIVERY, actor: "SYSTEM" }]);
  });
});
