import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration';
import {
  bearingDegrees,
  estimateDurationSeconds,
  haversineMeters,
  type GeoPoint,
} from './geo';

export interface RouteResult {
  distanceMeters: number;
  durationSeconds: number;
  /** GeoJSON LineString coordinates [lng,lat][] when the provider returns geometry. */
  geometry?: [number, number][];
  degraded: boolean; // true when computed locally (no provider/route available)
}

/**
 * Map / routing abstraction. The customer & rider apps talk to OUR API and read
 * `clientConfig()` to know which map SDK + token to load — they never hardcode a
 * vendor. Swapping Mapbox → Google → OSM is a `MAP_PROVIDER` env change.
 */
export interface MapProvider {
  readonly name: string;
  /** Public, front-end-safe config for initialising the map SDK. */
  clientConfig(): { provider: string; token: string | null; styleUrl?: string };
  reverseGeocode(point: GeoPoint): Promise<string | null>;
  route(from: GeoPoint, to: GeoPoint): Promise<RouteResult>;
}

export const MAP_PROVIDER = Symbol('MAP_PROVIDER');

/**
 * Local, no-network provider and the development default. It is not a stub: the
 * distance it returns is a real great-circle calculation over real coordinates,
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
  readonly name = 'osm';
  clientConfig() {
    return { provider: 'osm', token: null, styleUrl: 'https://demotiles.maplibre.org/style.json' };
  }
  // Neither method touches the network — that is the whole point of this
  // provider — so both resolve immediately rather than being marked `async`.
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
  readonly name = 'mapbox';
  private readonly logger = new Logger('Map:mapbox');
  private readonly fallback = new OsmMapProvider();
  constructor(private readonly token: string) {}

  clientConfig() {
    return {
      provider: 'mapbox',
      token: this.token,
      styleUrl: 'mapbox://styles/mapbox/streets-v12',
    };
  }

  async reverseGeocode(point: GeoPoint): Promise<string | null> {
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${point.lng},${point.lat}.json?access_token=${this.token}&limit=1`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const body = (await res.json()) as { features?: { place_name?: string }[] };
      return body.features?.[0]?.place_name ?? null;
    } catch (e) {
      this.logger.warn(`reverseGeocode failed: ${(e as Error).message}`);
      return null;
    }
  }

  async route(from: GeoPoint, to: GeoPoint): Promise<RouteResult> {
    try {
      const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?geometries=geojson&overview=full&access_token=${this.token}`;
      const res = await fetch(url);
      if (!res.ok) return this.fallback.route(from, to);
      const body = (await res.json()) as {
        routes?: { distance: number; duration: number; geometry?: { coordinates: [number, number][] } }[];
      };
      const r = body.routes?.[0];
      if (!r) return this.fallback.route(from, to);
      return {
        distanceMeters: Math.round(r.distance),
        durationSeconds: Math.round(r.duration),
        geometry: r.geometry?.coordinates,
        degraded: false,
      };
    } catch (e) {
      this.logger.warn(`route failed, degrading: ${(e as Error).message}`);
      return this.fallback.route(from, to);
    }
  }
}

export const mapProviderFactory = {
  provide: MAP_PROVIDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService<AppConfig, true>): MapProvider => {
    const maps = config.get('maps', { infer: true });
    if (maps.provider === 'osm') return new OsmMapProvider();
    if (maps.provider === 'mapbox') {
      if (!maps.mapboxToken) throw new Error('MAPBOX_ACCESS_TOKEN is required for MAP_PROVIDER=mapbox');
      return new MapboxMapProvider(maps.mapboxToken);
    }
    // Google is not implemented. Silently returning OSM here would leave a
    // deployment convinced it was paying for Google routing and getting it.
    const name: string = maps.provider;
    throw new Error(`MAP_PROVIDER="${name}" is not implemented (choose "osm" or "mapbox")`);
  },
};

/** Re-export for convenience so consumers import geo helpers from one place. */
export { bearingDegrees, haversineMeters, type GeoPoint };
