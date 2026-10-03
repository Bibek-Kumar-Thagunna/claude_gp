/* eslint-disable @typescript-eslint/require-await -- Prisma-shaped fakes preserve service contracts. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DeliveryStatus, OrderStatus, PaymentMethod, PaymentStatus } from "@prisma/client";
import type { PrismaService } from "../../common/prisma/prisma.service";
import type { MapProvider } from "../../providers/map.provider";
import { OrdersService } from "./orders.service";
import type { IdempotencyService } from "../../common/idempotency/idempotency.service";

const baseOrder = {
  id: "order-one",
  customerId: "customer-one",
  status: OrderStatus.OUT_FOR_DELIVERY,
  paymentMethod: PaymentMethod.COD,
  paymentStatus: PaymentStatus.PENDING,
  lat: 27.69,
  lng: 85.345,
  shop: {
    id: "shop-one",
    name: "Shop One",
    nameNp: null,
    slug: "shop-one",
    phone: "9800000000",
    area: "Kathmandu",
    emoji: null,
    lat: 27.7,
    lng: 85.33,
  },
  items: [],
  events: [],
  coupon: null,
  delivery: { status: DeliveryStatus.EN_ROUTE, podImageUrl: null, rider: null },
};

function harness(order: typeof baseOrder) {
  let routeCalls = 0;
  const prisma = {
    order: { findUnique: async () => order },
  };
  const maps: MapProvider = {
    name: "route-test",
    clientConfig: () => ({ provider: "none", token: null }),
    reverseGeocode: async () => null,
    route: async () => {
      routeCalls += 1;
      return {
        distanceMeters: 1_850,
        durationSeconds: 540,
        geometry: [
          [85.33, 27.7],
          [85.345, 27.69],
        ],
        degraded: false,
      };
    },
  };
  const service = new OrdersService(
    prisma as unknown as PrismaService,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    maps,
    [],
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
  return {
    service,
    get routeCalls() {
      return routeCalls;
    },
  };
}

describe("customer order tracking route", () => {
  it("returns provider distance and geometry for the real saved pins", async () => {
    const state = harness(baseOrder);
    const result = (await state.service.getMine("customer-one", "order-one")) as unknown as {
      tracking: {
        origin: { lat: number; lng: number };
        destination: { lat: number; lng: number };
        route: {
          distanceMeters: number;
          durationSeconds: number;
          geometry: [number, number][];
          degraded: boolean;
        };
      };
    };
    assert.equal(state.routeCalls, 1);
    assert.deepEqual(result.tracking.origin, { lat: 27.7, lng: 85.33 });
    assert.deepEqual(result.tracking.destination, { lat: 27.69, lng: 85.345 });
    assert.equal(result.tracking.route.distanceMeters, 1_850);
    assert.equal(result.tracking.route.degraded, false);
    assert.deepEqual(result.tracking.route.geometry[1], [85.345, 27.69]);
  });

  it("returns null pins and route rather than inventing a fallback location", async () => {
    const missingPins = {
      ...baseOrder,
      lat: null,
      lng: null,
      shop: { ...baseOrder.shop, lat: null, lng: null },
    } as unknown as typeof baseOrder;
    const state = harness(missingPins);
    const result = (await state.service.getMine("customer-one", "order-one")) as unknown as {
      tracking: { origin: null; destination: null; route: null };
    };
    assert.equal(state.routeCalls, 0);
    assert.equal(result.tracking.origin, null);
    assert.equal(result.tracking.destination, null);
    assert.equal(result.tracking.route, null);
  });

  it("does not expose a customer route after the parcel starts returning to the shop", async () => {
    const returningOrder = {
      ...baseOrder,
      delivery: {
        ...baseOrder.delivery,
        status: DeliveryStatus.RETURNING_TO_SHOP,
        rider: {
          lat: 27.695,
          lng: 85.34,
          heading: null,
          speed: null,
          lastPingAt: new Date(),
          vehicleType: "MOTORBIKE",
          user: { name: "Rider", phone: "9811111120" },
        },
      },
    } as unknown as typeof baseOrder;
    const state = harness(returningOrder);
    const result = (await state.service.getMine("customer-one", "order-one")) as unknown as {
      tracking: { route: null; rider: null };
    };
    assert.equal(state.routeCalls, 0);
    assert.equal(result.tracking.route, null);
    assert.equal(result.tracking.rider, null);
  });
});
