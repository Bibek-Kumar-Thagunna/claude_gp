import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { DeliveryStatus, OrderStatus } from "@prisma/client";
import type { ConfigService } from "@nestjs/config";
import type { PrismaService } from "../../common/prisma/prisma.service";
import type { RedisService } from "../../common/redis/redis.service";
import type { AppConfig } from "../../config/configuration";
import { RiderLocationService } from "./rider-location.service";

function subject(deliveryStatus: DeliveryStatus) {
  let locationReads = 0;
  const prisma = {
    order: {
      findUnique: () =>
        Promise.resolve({
          status: OrderStatus.OUT_FOR_DELIVERY,
          delivery: { riderId: "rider_1", status: deliveryStatus },
        }),
    },
  } as unknown as PrismaService;
  const redis = {
    client: {
      get: () => {
        locationReads += 1;
        return Promise.resolve(
          JSON.stringify({ lat: 27.7, lng: 85.33, at: new Date().toISOString() }),
        );
      },
    },
  } as unknown as RedisService;
  const config = {
    get: () => ({
      riderPingMinIntervalMs: 5_000,
      riderLocationStaleMs: 30_000,
      riderOfflineMs: 60_000,
    }),
  } as unknown as ConfigService<AppConfig, true>;
  return {
    service: new RiderLocationService(prisma, redis, new EventEmitter2(), config),
    locationReads: () => locationReads,
  };
}

describe("customer rider-location privacy", () => {
  it("returns a rider position only while that rider is travelling to the customer", async () => {
    const state = subject(DeliveryStatus.EN_ROUTE);
    const result = await state.service.latestForOrder("order_1");
    assert.equal(result?.riderId, "rider_1");
    assert.equal(state.locationReads(), 1);
  });

  it("stops exposing the rider position when the parcel is returning to the shop", async () => {
    const state = subject(DeliveryStatus.RETURNING_TO_SHOP);
    const result = await state.service.latestForOrder("order_1");
    assert.equal(result, null);
    assert.equal(state.locationReads(), 0);
  });
});
