import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "node:crypto";
import { RedisService } from "../common/redis/redis.service";
import type { AppConfig } from "../config/configuration";
import { bearingDegrees, estimateDurationSeconds, haversineMeters, type GeoPoint } from "./geo";

export interface RouteResult {
  distanceMeters: number;
  durationSeconds: number;
  /** GeoJSON LineString coordinates [lng,lat][] when the provider returns geometry. */
  geometry?: [number, number][];
  degraded: boolean; // true when computed locally (no provider/route available)
}

export interface PlaceSuggestion {
  id: string;
  name: string;
  address: string;
  type?: string;
}

export interface PlaceResult extends PlaceSuggestion, GeoPoint {}

/**
 * Map / routing abstraction. The customer & rider apps talk to OUR API and read
 * `clientConfig()` to know which map SDK + token to load — they never hardcode a
 * vendor. Swapping Baato → Mapbox → OSM is a `MAP_PROVIDER` env change.
 */
export interface MapProvider {
  readonly name: string;
  /** Public, front-end-safe config for initialising the map SDK. */
  clientConfig(): { provider: string; token: string | null; styleUrl?: string };
  reverseGeocode(point: GeoPoint): Promise<string | null>;
  route(from: GeoPoint, to: GeoPoint): Promise<RouteResult>;
  searchPlaces?(query: string, near?: GeoPoint, limit?: number): Promise<PlaceSuggestion[]>;
  resolvePlace?(id: string): Promise<PlaceResult | null>;
}

export const MAP_PROVIDER = Symbol("MAP_PROVIDER");
const MAP_REQUEST_TIMEOUT_MS = 5_000;
const MAX_ROUTE_POINTS = 10_000;

/**
 * Key-free routing provider and the development default. Its route and reverse
 * methods make no vendor API calls: the distance is a real great-circle calculation,
 * and `degraded: true` tells callers the number came from here rather than from a
 * road network, so nothing downstream mistakes it for a routed distance. GoPasal
 * promises no ETAs to anybody (SRS), which is what makes this genuinely usable
 * rather than merely a fallback.
 *
 * `reverseGeocode` returns null — honestly nothing, not a fabricated address.
 * Callers treat a null as "no address known" and fall back to the coordinates the
 * customer pinned, which is the same thing they do when a vendor lookup misses.
 */
export class OsmMapProvider implements MapProvider {
  readonly name = "osm";
  constructor(private readonly styleUrl = "https://demotiles.maplibre.org/style.json") {}
  clientConfig() {
    return { provider: "osm", token: null, styleUrl: this.styleUrl };
  }
  // Neither geo method touches the network. The optional browser map style is a
  // separate concern and the bundled public demo style is rejected in production.
  reverseGeocode(): Promise<string | null> {
    return Promise.resolve(null);
  }
  route(from: GeoPoint, to: GeoPoint): Promise<RouteResult> {
    const distanceMeters = haversineMeters(from, to);
    return Promise.resolve({
      distanceMeters,
      durationSeconds: estimateDurationSeconds(distanceMeters),
      degraded: true,
    });
  }
  searchPlaces(): Promise<PlaceSuggestion[]> {
    return Promise.resolve([]);
  }
  resolvePlace(): Promise<PlaceResult | null> {
    return Promise.resolve(null);
  }
}

/**
 * Mapbox provider. Calls the Directions/Geocoding APIs and falls back to the
 * local calculation when a *request* fails, which is legitimate resilience — a
 * rider's map should not go blank because Mapbox had a bad minute.
 *
 * What it no longer does is start without a token. A missing token used to mean
 * every route silently came from haversine while the logs claimed Mapbox was the
 * provider; `validateConfig` now refuses that configuration and tells you to
 * select MAP_PROVIDER=osm if you want the key-free setup on purpose.
 */
export class MapboxMapProvider implements MapProvider {
  readonly name = "mapbox";
  private readonly logger = new Logger("Map:mapbox");
  private readonly fallback = new OsmMapProvider();
  constructor(private readonly token: string) {}

  clientConfig() {
    return {
      provider: "mapbox",
      token: this.token,
      styleUrl: `https://api.mapbox.com/styles/v1/mapbox/streets-v12?access_token=${encodeURIComponent(this.token)}`,
    };
  }

  async reverseGeocode(point: GeoPoint): Promise<string | null> {
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${point.lng},${point.lat}.json?access_token=${this.token}&limit=1`;
      const res = await fetch(url, { signal: AbortSignal.timeout(MAP_REQUEST_TIMEOUT_MS) });
      if (!res.ok) return null;
      const body = (await res.json()) as { features?: { place_name?: string }[] };
      const name = body.features?.[0]?.place_name;
      return typeof name === "string" && name.length <= 500 ? name : null;
    } catch (e) {
      this.logger.warn(`reverseGeocode failed: ${(e as Error).message}`);
      return null;
    }
  }

  async route(from: GeoPoint, to: GeoPoint): Promise<RouteResult> {
    try {
      const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?geometries=geojson&overview=full&access_token=${this.token}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(MAP_REQUEST_TIMEOUT_MS) });
      if (!res.ok) return this.fallback.route(from, to);
      const body = (await res.json()) as {
        routes?: {
          distance: number;
          duration: number;
          geometry?: { coordinates: [number, number][] };
        }[];
      };
      const r = body.routes?.[0];
      if (
        !r ||
        !Number.isFinite(r.distance) ||
        r.distance < 0 ||
        !Number.isFinite(r.duration) ||
        r.duration < 0
      )
        return this.fallback.route(from, to);
      const geometry = r.geometry?.coordinates;
      const geometryValid =
        Array.isArray(geometry) &&
        geometry.length >= 2 &&
        geometry.length <= MAX_ROUTE_POINTS &&
        geometry.every(
          (point) =>
            Array.isArray(point) &&
            point.length === 2 &&
            Number.isFinite(point[0]) &&
            Number.isFinite(point[1]) &&
            point[0] >= -180 &&
            point[0] <= 180 &&
            point[1] >= -90 &&
            point[1] <= 90,
        );
      return {
        distanceMeters: Math.round(r.distance),
        durationSeconds: Math.round(r.duration),
        geometry: geometryValid ? geometry : undefined,
        degraded: false,
      };
    } catch (e) {
      this.logger.warn(`route failed, degrading: ${(e as Error).message}`);
      return this.fallback.route(from, to);
    }
  }

  searchPlaces(): Promise<PlaceSuggestion[]> {
    return Promise.resolve([]);
  }

  resolvePlace(): Promise<PlaceResult | null> {
    return Promise.resolve(null);
  }
}

type BaatoEnvelope<T> = { status?: number; message?: string; data?: T };

/**
 * Baato's production APIs for Nepal. Search/places/reverse calls stay behind our
 * API so the server token is never exposed. MapLibre receives a separate,
 * origin-restricted browser token because the renderer must fetch the style and
 * vector tiles directly.
 *
 * Provider responses are cached in Redis for 12 hours. That is deliberately
 * below Baato's 48-hour free-tier caching ceiling, and route cache keys contain
 * only a SHA-256 digest of the coordinates rather than a customer's raw pin.
 */
export class BaatoMapProvider implements MapProvider {
  readonly name = "baato";
  private readonly logger = new Logger("Map:baato");
  private readonly fallback = new OsmMapProvider();
  private static readonly CACHE_SECONDS = 12 * 60 * 60;

  constructor(
    private readonly token: string,
    private readonly browserToken: string,
    private readonly style = "breeze",
    private readonly baseUrl = "https://api.baato.io/api/v1",
    private readonly redis?: RedisService,
    private readonly monthlyUpstreamLimit?: number,
  ) {}

  clientConfig() {
    return {
      provider: "baato",
      token: null,
      styleUrl: `${this.baseUrl}/styles/${encodeURIComponent(this.style)}?key=${encodeURIComponent(this.browserToken)}`,
    };
  }

  async searchPlaces(query: string, near?: GeoPoint, limit = 6): Promise<PlaceSuggestion[]> {
    const params = new URLSearchParams({ q: query, limit: String(Math.min(8, Math.max(1, limit))) });
    if (near) {
      // ~110 m is enough to bias suggestions while greatly improving cache hits
      // and avoiding precise customer GPS in the upstream request/cache input.
      params.set("lat", near.lat.toFixed(3));
      params.set("lon", near.lng.toFixed(3));
    }
    const data = await this.getCached<Array<Record<string, unknown>>>("search", params);
    return data.flatMap((row) => {
      const id = row.placeId;
      const name = row.name;
      const address = row.address;
      if ((typeof id !== "string" && typeof id !== "number") || typeof name !== "string") return [];
      return [{
        id: String(id),
        name: name.slice(0, 160),
        address: typeof address === "string" ? address.slice(0, 500) : "",
        type: typeof row.type === "string" ? row.type.slice(0, 80) : undefined,
      }];
    });
  }

  async resolvePlace(id: string): Promise<PlaceResult | null> {
    // Baato place identifiers are decimal IDs. Rejecting anything else avoids
    // spending provider quota on malformed or deliberately hostile input.
    if (!/^\d{1,20}$/.test(id)) return null;
    const params = new URLSearchParams({ placeId: id });
    const data = await this.getCached<Array<Record<string, unknown>>>("places", params);
    const row = data[0];
    const centroid = row?.centroid as Record<string, unknown> | undefined;
    const lat = centroid?.lat;
    const lng = centroid?.lon;
    if (!row || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const name = typeof row.name === "string" ? row.name.slice(0, 160) : "Selected location";
    return {
      id,
      name,
      address: typeof row.address === "string" ? row.address.slice(0, 500) : name,
      type: typeof row.type === "string" ? row.type.slice(0, 80) : undefined,
      lat: lat as number,
      lng: lng as number,
    };
  }

  async reverseGeocode(point: GeoPoint): Promise<string | null> {
    try {
      const params = new URLSearchParams({
        lat: String(point.lat),
        lon: String(point.lng),
        limit: "1",
      });
      const data = await this.getCached<Array<Record<string, unknown>>>("reverse", params);
      const row = data[0];
      const address = row?.address;
      const name = row?.name;
      if (typeof address === "string" && address.length <= 500) return address;
      return typeof name === "string" && name.length <= 500 ? name : null;
    } catch (cause) {
      this.logger.warn(`reverseGeocode failed: ${(cause as Error).message}`);
      return null;
    }
  }

  async route(from: GeoPoint, to: GeoPoint): Promise<RouteResult> {
    try {
      const params = new URLSearchParams({ mode: "bike", alternatives: "false", instructions: "false" });
      params.append("points[]", `${from.lat},${from.lng}`);
      params.append("points[]", `${to.lat},${to.lng}`);
      const data = await this.getCached<Array<Record<string, unknown>>>("directions", params);
      const row = data[0];
      const distance = row?.distanceInMeters;
      const timeMs = row?.timeInMs;
      if (!Number.isFinite(distance) || !Number.isFinite(timeMs)) return this.fallback.route(from, to);
      const encoded = typeof row?.encodedPolyline === "string" ? row.encodedPolyline : undefined;
      const geometry = encoded ? decodePolyline(encoded) : undefined;
      return {
        distanceMeters: Math.round(distance as number),
        durationSeconds: Math.round((timeMs as number) / 1000),
        geometry: geometry && geometry.length <= MAX_ROUTE_POINTS ? geometry : undefined,
        degraded: false,
      };
    } catch (cause) {
      this.logger.warn(`route failed, degrading: ${(cause as Error).message}`);
      return this.fallback.route(from, to);
    }
  }

  private async getCached<T>(endpoint: string, params: URLSearchParams): Promise<T> {
    const cacheInput = `${endpoint}?${params.toString()}`;
    const digest = createHash("sha256").update(cacheInput).digest("hex");
    const cacheKey = `maps:baato:v1:${digest}`;
    if (this.redis) {
      try {
        const found = await this.redis.client.get(cacheKey);
        if (found) return JSON.parse(found) as T;
      } catch (cause) {
        this.logger.warn(`map cache read failed: ${(cause as Error).message}`);
      }
    }

    if (this.monthlyUpstreamLimit) {
      if (!this.redis) throw new Error("Baato usage limiter requires Redis");
      const month = new Date().toISOString().slice(0, 7);
      // A shared Redis counter covers all API replicas. Fail closed on Redis
      // failure rather than silently spending provider credits without a cap.
      const counter = `maps:baato:upstream:${month}`;
      const count = await this.redis.client.incr(counter);
      if (count === 1) await this.redis.client.expire(counter, 35 * 24 * 60 * 60);
      if (count > this.monthlyUpstreamLimit) {
        throw new Error("Baato server-side monthly request limit reached");
      }
    }

    const request = new URL(`${this.baseUrl}/${endpoint}`);
    for (const [key, value] of params) request.searchParams.append(key, value);
    request.searchParams.set("key", this.token);
    const response = await fetch(request, { signal: AbortSignal.timeout(MAP_REQUEST_TIMEOUT_MS) });
    const body = (await response.json().catch(() => null)) as BaatoEnvelope<T> | null;
    if (
      !response.ok ||
      !body ||
      (body.status !== undefined && (body.status < 200 || body.status >= 300)) ||
      !Array.isArray(body.data)
    ) {
      throw new Error(`Baato ${endpoint} answered ${response.status}`);
    }
    if (this.redis) {
      try {
        await this.redis.client.set(
          cacheKey,
          JSON.stringify(body.data),
          "EX",
          BaatoMapProvider.CACHE_SECONDS,
        );
      } catch (cause) {
        this.logger.warn(`map cache write failed: ${(cause as Error).message}`);
      }
    }
    return body.data;
  }
}

/** Decode a Google/Baato encoded polyline into GeoJSON [lng, lat] points. */
function decodePolyline(value: string): [number, number][] | undefined {
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const component = (): number | null => {
    let result = 0;
    let shift = 0;
    while (index < value.length) {
      const byte = value.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63) return null;
      result |= (byte & 0x1f) << shift;
      shift += 5;
      if (byte < 0x20) return result & 1 ? ~(result >> 1) : result >> 1;
      if (shift > 30) return null;
    }
    return null;
  };
  while (index < value.length && points.length <= MAX_ROUTE_POINTS) {
    const deltaLat = component();
    const deltaLng = component();
    if (deltaLat == null || deltaLng == null) return undefined;
    lat += deltaLat;
    lng += deltaLng;
    const point: [number, number] = [lng / 1e5, lat / 1e5];
    if (point[0] < -180 || point[0] > 180 || point[1] < -90 || point[1] > 90) return undefined;
    points.push(point);
  }
  return points.length >= 2 && points.length <= MAX_ROUTE_POINTS ? points : undefined;
}

export const mapProviderFactory = {
  provide: MAP_PROVIDER,
  inject: [ConfigService, RedisService],
  useFactory: (config: ConfigService<AppConfig, true>, redis?: RedisService): MapProvider => {
    const maps = config.get("maps", { infer: true });
    if (maps.provider === "osm") return new OsmMapProvider(maps.styleUrl);
    if (maps.provider === "mapbox") {
      if (!maps.mapboxToken)
        throw new Error("MAPBOX_ACCESS_TOKEN is required for MAP_PROVIDER=mapbox");
      return new MapboxMapProvider(maps.mapboxToken);
    }
    if (maps.provider === "baato") {
      if (!maps.baatoToken || !maps.baatoBrowserToken) {
        throw new Error(
          "BAATO_ACCESS_TOKEN and BAATO_BROWSER_ACCESS_TOKEN are required for MAP_PROVIDER=baato",
        );
      }
      return new BaatoMapProvider(
        maps.baatoToken,
        maps.baatoBrowserToken,
        maps.baatoStyle ?? "breeze",
        maps.baatoBaseUrl ?? "https://api.baato.io/api/v1",
        redis,
        maps.baatoServerMonthlyLimit,
      );
    }
    // Google is not implemented. Silently returning OSM here would leave a
    // deployment convinced it was paying for Google routing and getting it.
    const name: string = maps.provider;
    throw new Error(`MAP_PROVIDER="${name}" is not implemented (choose "osm", "mapbox" or "baato")`);
  },
};

/** Re-export for convenience so consumers import geo helpers from one place. */
export { bearingDegrees, haversineMeters, type GeoPoint };
