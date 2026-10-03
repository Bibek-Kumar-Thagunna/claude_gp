import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { DeliveryStatus, OrderStatus, PaymentMethod } from "@prisma/client";
import type { PrismaService } from "../../common/prisma/prisma.service";
import type { AuditService } from "../audit/audit.service";
import type { OrdersService } from "../orders/orders.service";
import type { UploadsService } from "../uploads/uploads.service";
import { DeliveryService } from "./delivery.service";
import type { RiderLocationService } from "./rider-location.service";

function delivery(status: DeliveryStatus, pickedUpAt: Date | null) {
  return {
    id: "delivery_1",
    orderId: "order_1",
    riderId: "rider_1",
    status,
    assignedAt: new Date("2026-09-14T08:00:00Z"),
    pickedUpAt,
    deliveredAt: null,
    failedAt: status === DeliveryStatus.FAILED ? new Date("2026-09-14T08:30:00Z") : null,
    failReason: status === DeliveryStatus.FAILED ? "Customer was unavailable" : null,
    returnStartedAt:
      status === DeliveryStatus.RETURNING_TO_SHOP ? new Date("2026-09-14T08:35:00Z") : null,
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
      status: OrderStatus.OUT_FOR_DELIVERY,
      paymentMethod: PaymentMethod.COD,
      total: 420,
    },
  };
}

function subject(initial: ReturnType<typeof delivery>) {
  const writes: string[] = [];
  const audits: unknown[] = [];
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
    rider: { findUnique: () => Promise.resolve({ id: "rider_1" }) },
    delivery: { findUnique: () => Promise.resolve(initial) },
    $transaction: (fn: (client: typeof tx) => unknown) => fn(tx),
  } as unknown as PrismaService;
  const service = new DeliveryService(
    prisma,
    { transition: () => Promise.resolve({}) } as unknown as OrdersService,
    { clearOrderCache: () => Promise.resolve() } as unknown as RiderLocationService,
    new EventEmitter2(),
    {} as UploadsService,
    {
      record: (entry: unknown) => {
        audits.push(entry);
        return Promise.resolve();
      },
    } as unknown as AuditService,
  );
  return { service, writes, audits };
}

describe("delivery return custody", () => {
  it("keeps a rider occupied when a delivery fails after pickup", async () => {
    const { service, writes } = subject(
      delivery(DeliveryStatus.EN_ROUTE, new Date("2026-09-14T08:10:00Z")),
    );
    await service.sellerUpdateStatus(
      "shop_1",
      "order_1",
      { status: DeliveryStatus.FAILED, failReason: "Customer was unavailable" },
      "seller_1",
    );
    assert.deepEqual(writes, ["delivery"]);
  });

  it("releases a rider when an assignment fails before pickup", async () => {
    const { service, writes } = subject(delivery(DeliveryStatus.ASSIGNED, null));
    await service.sellerUpdateStatus(
      "shop_1",
      "order_1",
      { status: DeliveryStatus.FAILED, failReason: "Motorbike would not start" },
      "seller_1",
    );
    assert.deepEqual(writes, ["delivery", "rider"]);
  });

  it("does not let a rider self-confirm that the shop received a parcel", async () => {
    const { service, writes } = subject(
      delivery(DeliveryStatus.RETURNING_TO_SHOP, new Date("2026-09-14T08:10:00Z")),
    );
    await assert.rejects(
      () =>
        service.riderUpdateStatus("rider_user", "order_1", {
          status: DeliveryStatus.RETURNED_TO_SHOP,
          returnNote: "Parcel returned",
        }),
      ForbiddenException,
    );
    assert.equal(writes.length, 0);
  });

  it("requires the shop to record parcel condition before releasing the rider", async () => {
    const { service, writes } = subject(
      delivery(DeliveryStatus.RETURNING_TO_SHOP, new Date("2026-09-14T08:10:00Z")),
    );
    await assert.rejects(
      () =>
        service.sellerUpdateStatus(
          "shop_1",
          "order_1",
          { status: DeliveryStatus.RETURNED_TO_SHOP, returnNote: "  " },
          "seller_1",
        ),
      BadRequestException,
    );
    assert.equal(writes.length, 0);
  });

  it("releases the rider and audits the shop's physical return confirmation", async () => {
    const { service, writes, audits } = subject(
      delivery(DeliveryStatus.RETURNING_TO_SHOP, new Date("2026-09-14T08:10:00Z")),
    );
    await service.sellerUpdateStatus(
      "shop_1",
      "order_1",
      {
        status: DeliveryStatus.RETURNED_TO_SHOP,
        returnNote: "Sealed parcel received with no visible damage",
      },
      "seller_1",
    );
    assert.deepEqual(writes, ["delivery", "rider"]);
    assert.match(JSON.stringify(audits[0]), /Sealed parcel received/);
  });
});
