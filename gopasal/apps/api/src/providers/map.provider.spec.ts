import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { ConfigService } from "@nestjs/config";
import type { AppConfig } from "../config/configuration";
import { haversineMeters, type GeoPoint } from "./geo";
import {
  BaatoMapProvider,
  MAP_PROVIDER,
  MapboxMapProvider,
  type MapProvider,
  OsmMapProvider,
  mapProviderFactory,
} from "./map.provider";

/**
 * The claim these tests defend is the one in .env.example: MAP_PROVIDER=osm is a
 * genuine local implementation, not a mock. It must return a real distance, admit
 * that the distance is not a road route (`degraded`), and return *nothing* for an
 * address rather than inventing one — a fabricated street name would flow
 * straight into a delivery address.
 */
const SHOP: GeoPoint = { lat: 27.7045, lng: 85.307 };
const CUSTOMER: GeoPoint = { lat: 27.6727, lng: 85.325 };

let restoreFetch: (() => void) | undefined;
afterEach(() => {
  restoreFetch?.();
  restoreFetch = undefined;
});

function stubFetch(reply: { ok: boolean; json?: unknown } | Error): { urls: string[] } {
  const urls: string[] = [];
  const original = globalThis.fetch;
  restoreFetch = () => {
    globalThis.fetch = original;
  };
  globalThis.fetch = ((input: string | URL): Promise<Response> => {
    urls.push(String(input));
    if (reply instanceof Error) return Promise.reject(reply);
    return Promise.resolve({
      ok: reply.ok,
      json: () => Promise.resolve(reply.json),
    } as unknown as Response);
  }) as typeof fetch;
  return { urls };
}
describe("OsmMapProvider", () => {
  // Held at the interface type on purpose: the customer, rider and admin surfaces
  // only ever see a `MapProvider`, so the contract is what these tests exercise.
  const osm: MapProvider = new OsmMapProvider();

  it("computes a real distance, not a placeholder", async () => {
    const calls = stubFetch({ ok: true });
    const route = await osm.route(SHOP, CUSTOMER);
    assert.equal(calls.urls.length, 0, "the offline provider must not touch the network");
    assert.equal(route.distanceMeters, haversineMeters(SHOP, CUSTOMER));
    assert.ok(route.distanceMeters > 3600 && route.distanceMeters < 4200);
    assert.ok(route.durationSeconds > 0);
  });

  it("flags the result as degraded so nothing downstream reads it as a road route", async () => {
    assert.equal((await osm.route(SHOP, CUSTOMER)).degraded, true);
  });

  it("returns no geometry rather than a straight line pretending to be a road", async () => {
    assert.equal((await osm.route(SHOP, CUSTOMER)).geometry, undefined);
  });

  it("returns null for an address instead of fabricating one", async () => {
    assert.equal(await osm.reverseGeocode(SHOP), null);
  });

  it("gives the browser a key-free style, so maps render on a fresh clone", () => {
    const cfg = osm.clientConfig();
    assert.equal(cfg.provider, "osm");
    assert.equal(cfg.token, null);
    assert.match(cfg.styleUrl ?? "", /^https:\/\//);
  });
});

describe("MapboxMapProvider", () => {
  const mapbox = new MapboxMapProvider("pk.test-token");

  it("asks Mapbox for a real route and reports it as not degraded", async () => {
    const calls = stubFetch({
      ok: true,
      json: {
        routes: [
          {
            distance: 5123.7,
            duration: 842.2,
            geometry: {
              coordinates: [
                [85.307, 27.7045],
                [85.325, 27.6727],
              ],
            },
          },
        ],
      },
    });
    const route = await mapbox.route(SHOP, CUSTOMER);
    assert.match(calls.urls[0], /^https:\/\/api\.mapbox\.com\/directions\/v5\/mapbox\/driving\//);
    assert.match(calls.urls[0], /85\.307,27\.7045;85\.325,27\.6727/);
    assert.equal(route.distanceMeters, 5124);
    assert.equal(route.durationSeconds, 842);
    assert.equal(route.degraded, false);
    assert.equal(route.geometry?.length, 2);
  });

  it("degrades to the local calculation when the request fails, and says so", async () => {
    // Resilience, not deception: the rider's map keeps working and the caller can
    // still tell the number did not come from a road network.
    stubFetch(new Error("fetch failed"));
    const route = await mapbox.route(SHOP, CUSTOMER);
    assert.equal(route.degraded, true);
    assert.equal(route.distanceMeters, haversineMeters(SHOP, CUSTOMER));
  });

  it("degrades on a non-2xx and on an empty route list", async () => {
    stubFetch({ ok: false });
    assert.equal((await mapbox.route(SHOP, CUSTOMER)).degraded, true);
    restoreFetch?.();
    stubFetch({ ok: true, json: { routes: [] } });
    assert.equal((await mapbox.route(SHOP, CUSTOMER)).degraded, true);
  });

  it("rejects malformed route totals and discards unsafe geometry", async () => {
    stubFetch({
      ok: true,
      json: { routes: [{ distance: Number.NaN, duration: 10 }] },
    });
    assert.equal((await mapbox.route(SHOP, CUSTOMER)).degraded, true);
    restoreFetch?.();
    stubFetch({
      ok: true,
      json: {
        routes: [
          {
            distance: 100,
            duration: 20,
            geometry: {
              coordinates: [
                [999, 999],
                [85.3, 27.7],
              ],
            },
          },
        ],
      },
    });
    const route = await mapbox.route(SHOP, CUSTOMER);
    assert.equal(route.degraded, false);
    assert.equal(route.geometry, undefined);
  });

  it("returns null rather than an invented address when geocoding fails", async () => {
    stubFetch({ ok: false });
    assert.equal(await mapbox.reverseGeocode(SHOP), null);
    restoreFetch?.();
    stubFetch(new Error("fetch failed"));
    assert.equal(await mapbox.reverseGeocode(SHOP), null);
    restoreFetch?.();
    stubFetch({ ok: true, json: { features: [] } });
    assert.equal(await mapbox.reverseGeocode(SHOP), null);
  });

  it("reads the place name when Mapbox has one", async () => {
    stubFetch({ ok: true, json: { features: [{ place_name: "Basantapur, Kathmandu, Nepal" }] } });
    assert.equal(await mapbox.reverseGeocode(SHOP), "Basantapur, Kathmandu, Nepal");
  });
});

describe("BaatoMapProvider", () => {
  it("fails closed at the configured server request cap across distinct uncached lookups", async () => {
    let count = 0;
    let expirations = 0;
    const redis = {
      client: {
        get: () => Promise.resolve(null),
        incr: () => Promise.resolve(++count),
        expire: () => { expirations += 1; return Promise.resolve(1); },
        set: () => Promise.resolve("OK"),
      },
    };
    const calls = stubFetch({ ok: true, json: { status: 200, data: [] } });
    const provider = new BaatoMapProvider(
      "server-secret", "browser-public", "breeze", "https://api.baato.io/api/v1", redis as never, 1,
    );
    await provider.searchPlaces("baneshwor");
    await assert.rejects(provider.searchPlaces("boudha"), /monthly request limit/);
    assert.equal(count, 2);
    assert.equal(expirations, 1);
    assert.equal(calls.urls.length, 1);
  });

  it("keeps the server token private and gives MapLibre the restricted browser token", () => {
    const provider = new BaatoMapProvider("server-secret", "browser-public", "breeze");
    const config = provider.clientConfig();
    assert.equal(config.provider, "baato");
    assert.equal(config.token, null);
    assert.match(config.styleUrl ?? "", /styles\/breeze\?key=browser-public$/);
    assert.doesNotMatch(config.styleUrl ?? "", /server-secret/);
  });

  it("uses Baato search then resolves the selected place to a pin", async () => {
    const searchCalls = stubFetch({
      ok: true,
      json: {
        status: 200,
        data: [
          {
            placeId: 102235,
            name: "Shemrock School",
            address: "Kamal Pokhari, Kathmandu, Nepal",
            type: "school",
          },
        ],
      },
    });
    const provider = new BaatoMapProvider("server-secret", "browser-public");
    const suggestions = await provider.searchPlaces("shemrock", SHOP);
    assert.deepEqual(suggestions[0], {
      id: "102235",
      name: "Shemrock School",
      address: "Kamal Pokhari, Kathmandu, Nepal",
      type: "school",
    });
    assert.match(searchCalls.urls[0], /\/search\?/);
    assert.match(searchCalls.urls[0], /lat=27\.704/);
    assert.match(searchCalls.urls[0], /lon=85\.307/);
    assert.doesNotMatch(searchCalls.urls[0], /27\.7045/);
    assert.match(searchCalls.urls[0], /key=server-secret/);

    restoreFetch?.();
    const placeCalls = stubFetch({
      ok: true,
      json: {
        status: 200,
        data: [
          {
            placeId: 102235,
            name: "Shemrock School",
            address: "Kamal Pokhari, Kathmandu, Nepal",
            centroid: { lat: 27.7108304, lon: 85.3265325 },
          },
        ],
      },
    });
    const place = await provider.resolvePlace("102235");
    assert.equal(place?.lat, 27.7108304);
    assert.equal(place?.lng, 85.3265325);
    assert.match(placeCalls.urls[0], /\/places\?/);
    assert.match(placeCalls.urls[0], /placeId=102235/);
  });

  it("decodes Baato route geometry and converts milliseconds to seconds", async () => {
    stubFetch({
      ok: true,
      json: {
        status: 200,
        data: [
          {
            encodedPolyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@",
            distanceInMeters: 2542.4,
            timeInMs: 546077,
          },
        ],
      },
    });
    const route = await new BaatoMapProvider("server-secret", "browser-public").route(
      SHOP,
      CUSTOMER,
    );
    assert.equal(route.distanceMeters, 2542);
    assert.equal(route.durationSeconds, 546);
    assert.equal(route.degraded, false);
    assert.deepEqual(route.geometry?.[0], [-120.2, 38.5]);
    assert.equal(route.geometry?.length, 3);
  });

  it("uses a digest for cached coordinate lookups and stays below the 48-hour ceiling", async () => {
    const writes: Array<{ key: string; ttl: number }> = [];
    const redis = {
      client: {
        get: () => Promise.resolve(null),
        set: (key: string, _value: string, _mode: string, ttl: number) => {
          writes.push({ key, ttl });
          return Promise.resolve("OK");
        },
      },
    };
    stubFetch({ ok: true, json: { status: 200, data: [] } });
    await new BaatoMapProvider(
      "server-secret",
      "browser-public",
      "breeze",
      "https://api.baato.io/api/v1",
      redis as never,
    ).reverseGeocode(SHOP);
    assert.equal(writes.length, 1);
    const write = writes[0];
    assert.ok(write);
    assert.match(write.key, /^maps:baato:v1:[a-f0-9]{64}$/);
    assert.doesNotMatch(write.key, /27\.7045|85\.307/);
    assert.ok(write.ttl > 0 && write.ttl < 48 * 60 * 60);
  });
});
// MARKER-MAP-SPEC

const build = (maps: AppConfig["maps"]): MapProvider =>
  mapProviderFactory.useFactory({ get: () => maps } as unknown as ConfigService<AppConfig, true>);

describe("mapProviderFactory", () => {
  it("binds the token the API and its /maps/config endpoint resolve", () => {
    assert.equal(mapProviderFactory.provide, MAP_PROVIDER);
  });

  it("selects the offline provider for the development default", () => {
    assert.ok(build({ provider: "osm" }) instanceof OsmMapProvider);
  });

  it("passes a production MapLibre style through to the browser config", () => {
    const provider = build({ provider: "osm", styleUrl: "https://maps.gopasal.com/style.json" });
    assert.equal(provider.clientConfig().styleUrl, "https://maps.gopasal.com/style.json");
  });

  it("selects Mapbox with a token and passes it through to the client config", () => {
    const provider = build({ provider: "mapbox", mapboxToken: "pk.live" });
    assert.ok(provider instanceof MapboxMapProvider);
    assert.equal(provider.clientConfig().token, "pk.live");
  });

  it("selects Baato only when both server and origin-restricted browser tokens exist", () => {
    const provider = build({
      provider: "baato",
      baatoToken: "server-secret",
      baatoBrowserToken: "browser-public",
    });
    assert.ok(provider instanceof BaatoMapProvider);
    assert.throws(
      () => build({ provider: "baato", baatoToken: "server-secret" }),
      /BAATO_ACCESS_TOKEN and BAATO_BROWSER_ACCESS_TOKEN/,
    );
  });

  it("refuses Mapbox without a token instead of quietly routing by haversine", () => {
    // This exact fallback used to exist: logs said "mapbox", every distance came
    // from the local calculation, and nobody noticed until a bill did not arrive.
    assert.throws(() => build({ provider: "mapbox" }), /MAPBOX_ACCESS_TOKEN is required/);
  });

  it("refuses a provider it does not implement", () => {
    const google = "google" as AppConfig["maps"]["provider"];
    assert.throws(() => build({ provider: google }), /MAP_PROVIDER="google" is not implemented/);
  });
});
