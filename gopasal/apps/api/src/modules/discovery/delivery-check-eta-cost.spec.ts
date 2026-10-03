import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MapProvider } from "../../providers/map.provider";
import type { PrismaService } from "../../common/prisma/prisma.service";
import { DiscoveryService } from "./discovery.service";

const SHOP = {
  id: "shop_1",
  lat: 27.6935,
  lng: 85.342,
  deliveryRadiusKm: 4,
  isOpen: true,
  minOrder: 200,
  zones: [],
};

describe("deliveryCheck map-credit budget", () => {
  it("does not spend a routing credit on storefront browsing", async () => {
    let routes = 0;
    const maps: MapProvider = {
      name: "counting",
      clientConfig: () => ({ provider: "counting", token: null }),
      reverseGeocode: () => Promise.resolve(null),
      route: () => {
        routes += 1;
        return Promise.resolve({ distanceMeters: 800, durationSeconds: 300, degraded: false });
      },
    };
    const prisma = { shop: { findUnique: () => Promise.resolve(SHOP) } } as unknown as PrismaService;
    const service = new DiscoveryService(prisma, { get: () => undefined } as never, maps, {} as never);

    for (let i = 0; i < 20; i += 1) {
      const result = await service.deliveryCheck("shop_1", {
        lat: 27.6941 + i * 0.000037,
        lng: 85.3433 + i * 0.000041,
      });
      assert.equal(result.deliverable, true);
      assert.equal(result.etaDegraded, true);
      assert.ok((result.etaSeconds ?? 0) > 0);
      assert.notEqual(result.distanceMeters, 800);
    }
    assert.equal(routes, 0, "viewing shops must never call the paid routing endpoint");
  });

  it("does not show a delivery estimate for a closed shop", async () => {
    const maps = { route: () => Promise.reject(new Error("must not route")) } as unknown as MapProvider;
    const prisma = {
      shop: { findUnique: () => Promise.resolve({ ...SHOP, isOpen: false }) },
    } as unknown as PrismaService;
    const service = new DiscoveryService(prisma, { get: () => undefined } as never, maps, {} as never);
    const result = await service.deliveryCheck("shop_1", { lat: 27.6941, lng: 85.3433 });
    assert.equal(result.deliverable, false);
    assert.equal(result.etaSeconds, null);
  });
});
