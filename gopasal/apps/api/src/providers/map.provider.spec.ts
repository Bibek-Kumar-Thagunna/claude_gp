import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import type { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration';
import { haversineMeters, type GeoPoint } from './geo';
import {
  MAP_PROVIDER,
  MapboxMapProvider,
  type MapProvider,
  OsmMapProvider,
  mapProviderFactory,
} from './map.provider';

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
describe('OsmMapProvider', () => {
  // Held at the interface type on purpose: the customer, rider and admin surfaces
  // only ever see a `MapProvider`, so the contract is what these tests exercise.
  const osm: MapProvider = new OsmMapProvider();

  it('computes a real distance, not a placeholder', async () => {
    const calls = stubFetch({ ok: true });
    const route = await osm.route(SHOP, CUSTOMER);
    assert.equal(calls.urls.length, 0, 'the offline provider must not touch the network');
    assert.equal(route.distanceMeters, haversineMeters(SHOP, CUSTOMER));
    assert.ok(route.distanceMeters > 3600 && route.distanceMeters < 4200);
    assert.ok(route.durationSeconds > 0);
  });

  it('flags the result as degraded so nothing downstream reads it as a road route', async () => {
    assert.equal((await osm.route(SHOP, CUSTOMER)).degraded, true);
  });

  it('returns no geometry rather than a straight line pretending to be a road', async () => {
    assert.equal((await osm.route(SHOP, CUSTOMER)).geometry, undefined);
  });

  it('returns null for an address instead of fabricating one', async () => {
    assert.equal(await osm.reverseGeocode(SHOP), null);
  });

  it('gives the browser a key-free style, so maps render on a fresh clone', () => {
    const cfg = osm.clientConfig();
    assert.equal(cfg.provider, 'osm');
    assert.equal(cfg.token, null);
    assert.match(cfg.styleUrl ?? '', /^https:\/\//);
  });
});

describe('MapboxMapProvider', () => {
  const mapbox = new MapboxMapProvider('pk.test-token');

  it('asks Mapbox for a real route and reports it as not degraded', async () => {
    const calls = stubFetch({
      ok: true,
      json: {
        routes: [
          { distance: 5123.7, duration: 842.2, geometry: { coordinates: [[85.307, 27.7045], [85.325, 27.6727]] } },
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

  it('degrades to the local calculation when the request fails, and says so', async () => {
    // Resilience, not deception: the rider's map keeps working and the caller can
    // still tell the number did not come from a road network.
    stubFetch(new Error('fetch failed'));
    const route = await mapbox.route(SHOP, CUSTOMER);
    assert.equal(route.degraded, true);
    assert.equal(route.distanceMeters, haversineMeters(SHOP, CUSTOMER));
  });

  it('degrades on a non-2xx and on an empty route list', async () => {
    stubFetch({ ok: false });
    assert.equal((await mapbox.route(SHOP, CUSTOMER)).degraded, true);
    restoreFetch?.();
    stubFetch({ ok: true, json: { routes: [] } });
    assert.equal((await mapbox.route(SHOP, CUSTOMER)).degraded, true);
  });

  it('returns null rather than an invented address when geocoding fails', async () => {
    stubFetch({ ok: false });
    assert.equal(await mapbox.reverseGeocode(SHOP), null);
    restoreFetch?.();
    stubFetch(new Error('fetch failed'));
    assert.equal(await mapbox.reverseGeocode(SHOP), null);
    restoreFetch?.();
    stubFetch({ ok: true, json: { features: [] } });
    assert.equal(await mapbox.reverseGeocode(SHOP), null);
  });

  it('reads the place name when Mapbox has one', async () => {
    stubFetch({ ok: true, json: { features: [{ place_name: 'Basantapur, Kathmandu, Nepal' }] } });
    assert.equal(await mapbox.reverseGeocode(SHOP), 'Basantapur, Kathmandu, Nepal');
  });
});
// MARKER-MAP-SPEC

const build = (maps: AppConfig['maps']): MapProvider =>
  mapProviderFactory.useFactory(({ get: () => maps }) as unknown as ConfigService<AppConfig, true>);

describe('mapProviderFactory', () => {
  it('binds the token the API and its /maps/config endpoint resolve', () => {
    assert.equal(mapProviderFactory.provide, MAP_PROVIDER);
  });

  it('selects the offline provider for the development default', () => {
    assert.ok(build({ provider: 'osm' }) instanceof OsmMapProvider);
  });

  it('selects Mapbox with a token and passes it through to the client config', () => {
    const provider = build({ provider: 'mapbox', mapboxToken: 'pk.live' });
    assert.ok(provider instanceof MapboxMapProvider);
    assert.equal(provider.clientConfig().token, 'pk.live');
  });

  it('refuses Mapbox without a token instead of quietly routing by haversine', () => {
    // This exact fallback used to exist: logs said "mapbox", every distance came
    // from the local calculation, and nobody noticed until a bill did not arrive.
    assert.throws(() => build({ provider: 'mapbox' }), /MAPBOX_ACCESS_TOKEN is required/);
  });

  it('refuses a provider it does not implement', () => {
    const google = 'google' as AppConfig['maps']['provider'];
    assert.throws(() => build({ provider: google }), /MAP_PROVIDER="google" is not implemented/);
  });
});
