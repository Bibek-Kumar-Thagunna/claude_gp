import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { DeliveryStatus, OrderStatus, PaymentMethod, RiderStatus } from "@prisma/client";
import type { PrismaService } from "../../common/prisma/prisma.service";
import type { AuditService } from "../audit/audit.service";
import type { OrdersService } from "../orders/orders.service";
import type { UploadsService } from "../uploads/uploads.service";
import { DeliveryService } from "./delivery.service";
import type { RiderLocationService } from "./rider-location.service";

const returnedDelivery = {
  id: "delivery_1",
  orderId: "order_1",
  riderId: "rider_old",
  status: DeliveryStatus.RETURNED_TO_SHOP,
  assignedAt: new Date("2026-09-13T08:00:00Z"),
  pickedUpAt: new Date("2026-09-13T08:05:00Z"),
  deliveredAt: null,
  failedAt: new Date("2026-09-13T08:30:00Z"),
  failReason: "Customer phone was unreachable",
  returnStartedAt: new Date("2026-09-13T08:31:00Z"),
  returnedAt: new Date("2026-09-13T08:45:00Z"),
  returnNote: "Sealed parcel received with no visible damage",
  podNote: null,
  podImageUrl: "private/delivery-proofs/delivery_1/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg",
  codCollected: false,
  codAmount: 0,
  order: {
    shopId: "shop_1",
    customerId: "customer_1",
    code: "GP-100001",
    status: OrderStatus.OUT_FOR_DELIVERY,
    paymentMethod: PaymentMethod.COD,
    total: 420,
  },
};

function subject(options: {
  riderStatus: RiderStatus;
  riderClaim?: number;
  deliveryClaim?: number;
}) {
  const writes: Array<{ name: string; value: unknown }> = [];
  const updated = {
    ...returnedDelivery,
    riderId: "rider_new",
    status: DeliveryStatus.ASSIGNED,
    failedAt: null,
    failReason: null,
    podImageUrl: null,
  };
  const tx = {
    rider: {
      updateMany: (value: unknown) => {
        writes.push({ name: "rider", value });
        return Promise.resolve({ count: options.riderClaim ?? 1 });
      },
    },
    delivery: {
      updateMany: (value: unknown) => {
        writes.push({ name: "delivery", value });
        return Promise.resolve({ count: options.deliveryClaim ?? 1 });
      },
      findUnique: () => Promise.resolve(updated),
    },
    orderEvent: {
      create: (value: unknown) => {
        writes.push({ name: "event", value });
        return Promise.resolve(value);
      },
    },
  };
  const prisma = {
    delivery: { findUnique: () => Promise.resolve(returnedDelivery) },
    rider: {
      findUnique: () =>
        Promise.resolve({ id: "rider_new", shopId: "shop_1", status: options.riderStatus }),
    },
    $transaction: (fn: (client: typeof tx) => unknown) => fn(tx),
  } as unknown as PrismaService;
  const removed: string[] = [];
  const audits: unknown[] = [];
  const service = new DeliveryService(
    prisma,
    {} as OrdersService,
    { clearOrderCache: () => Promise.resolve() } as unknown as RiderLocationService,
    new EventEmitter2(),
    {
      remove: (key: string) => {
        removed.push(key);
        return Promise.resolve();
      },
    } as unknown as UploadsService,
    {
      record: (entry: unknown) => {
        audits.push(entry);
        return Promise.resolve();
      },
    } as unknown as AuditService,
  );
  return { service, writes, removed, audits };
}

describe("delivery assignment concurrency and reattempts", () => {
  it("refuses to reassign a failed parcel that is still in the rider custody", async () => {
    const { service, writes } = subject({ riderStatus: RiderStatus.ONLINE });
    const unsafe = {
      ...returnedDelivery,
      status: DeliveryStatus.FAILED,
      returnedAt: null,
      returnNote: null,
    };
    (
      service as unknown as { prisma: { delivery: { findUnique: () => Promise<unknown> } } }
    ).prisma.delivery.findUnique = () => Promise.resolve(unsafe);
    await assert.rejects(
      () => service.assignRider("shop_1", "order_1", "rider_new", "seller_1"),
      BadRequestException,
    );
    assert.equal(writes.length, 0);
  });

  it("refuses an offline rider before opening an assignment transaction", async () => {
    const { service, writes } = subject({ riderStatus: RiderStatus.OFFLINE });
    await assert.rejects(
      () => service.assignRider("shop_1", "order_1", "rider_new", "seller_1"),
      BadRequestException,
    );
    assert.equal(writes.length, 0);
  });

  it("turns an atomic rider-claim loss into a conflict without moving the delivery", async () => {
    const { service, writes } = subject({ riderStatus: RiderStatus.ONLINE, riderClaim: 0 });
    await assert.rejects(
      () => service.assignRider("shop_1", "order_1", "rider_new", "seller_1"),
      ConflictException,
    );
    assert.deepEqual(
      writes.map((write) => write.name),
      ["rider"],
    );
  });

  it("reattempts a failed leg, preserves its reason in history, and removes stale proof", async () => {
    const { service, writes, removed, audits } = subject({ riderStatus: RiderStatus.ONLINE });
    const result = await service.assignRider("shop_1", "order_1", "rider_new", "seller_1");

    const deliveryWrite = writes.find((write) => write.name === "delivery");
    assert.ok(deliveryWrite);
    assert.match(JSON.stringify(deliveryWrite.value), /"failReason":null/);
    assert.match(
      JSON.stringify(writes.find((write) => write.name === "event")?.value),
      /unreachable/,
    );
    assert.deepEqual(removed, [returnedDelivery.podImageUrl]);
    assert.equal(audits.length, 1);
    assert.equal(result.hasProofPhoto, false);
    assert.ok(!("podImageUrl" in result));
  });
});
