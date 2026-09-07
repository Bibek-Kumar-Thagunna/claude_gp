/**
 * Geo maths for the live delivery map.
 *
 * Deliberately dependency-free: the same Web-Mercator projection is used to
 * place raster tiles AND to place our own markers on top of them, so the two
 * layers can never drift apart. Mirrors `apps/api/src/providers/geo.ts`.
 */

export type LatLng = { lat: number; lng: number };

export const TILE = 256;
const R_EARTH = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/* ── projection ───────────────────────────────────────────────────────────── */

/** Normalised Mercator X in [0,1]. */
export function mercX(lng: number): number {
  return (lng + 180) / 360;
}

/** Normalised Mercator Y in [0,1] (clamped near the poles). */
export function mercY(lat: number): number {
  const phi = rad(Math.min(85.05112878, Math.max(-85.05112878, lat)));
  return 0.5 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / (2 * Math.PI);
}

export function unmercX(x: number): number {
  return x * 360 - 180;
}

export function unmercY(y: number): number {
  const n = Math.PI * (1 - 2 * y);
  return deg(Math.atan(Math.sinh(n)));
}

/** World pixel size at a zoom level. */
export const worldPx = (zoom: number) => TILE * Math.pow(2, zoom);

/** Absolute pixel position of a coordinate at a zoom level. */
export function project(p: LatLng, zoom: number): { x: number; y: number } {
  const w = worldPx(zoom);
  return { x: mercX(p.lng) * w, y: mercY(p.lat) * w };
}

/* ── measurement ──────────────────────────────────────────────────────────── */

/** Great-circle distance in metres. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Compass bearing a→b in degrees (0 = north, clockwise). */
export function bearingDegrees(a: LatLng, b: LatLng): number {
  const dLng = rad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(rad(b.lat));
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(dLng);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Straight-line interpolation between two coordinates (t in [0,1]). */
export function lerpLatLng(a: LatLng, b: LatLng, t: number): LatLng {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

/** Total length of a polyline in metres. */
export function pathLength(path: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i += 1) total += haversineMeters(path[i - 1]!, path[i]!);
  return total;
}

/**
 * Point at fraction `t` along a polyline, plus the heading at that point.
 * Used by the demo rider and to snap a real GPS ping onto the drawn route.
 */
export function pointAlong(path: LatLng[], t: number): { at: LatLng; heading: number } {
  if (path.length === 0) return { at: { lat: 0, lng: 0 }, heading: 0 };
  if (path.length === 1) return { at: path[0]!, heading: 0 };
  const clamped = Math.min(1, Math.max(0, t));
  const target = pathLength(path) * clamped;
  let walked = 0;
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const seg = haversineMeters(a, b);
    if (walked + seg >= target || i === path.length - 1) {
      const local = seg === 0 ? 0 : (target - walked) / seg;
      return { at: lerpLatLng(a, b, Math.min(1, Math.max(0, local))), heading: bearingDegrees(a, b) };
    }
    walked += seg;
  }
  return { at: path[path.length - 1]!, heading: 0 };
}

/* ── viewport fitting ─────────────────────────────────────────────────────── */

export type Bounds = { north: number; south: number; east: number; west: number };

export function boundsOf(points: LatLng[]): Bounds {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  return {
    north: Math.max(...lats),
    south: Math.min(...lats),
    east: Math.max(...lngs),
    west: Math.min(...lngs),
  };
}

/**
 * Zoom (and centre) that fits `points` inside a `width × height` box with
 * `padding` px to spare. Integer-free zoom keeps the fit tight; the tile layer
 * rounds it down and scales, which is what every slippy map does.
 */
export function fitView(
  points: LatLng[],
  width: number,
  height: number,
  padding = 56,
  maxZoom = 17,
  minZoom = 10,
): { center: LatLng; zoom: number } {
  const usable = { w: Math.max(80, width - padding * 2), h: Math.max(80, height - padding * 2) };
  const b = boundsOf(points.length ? points : [{ lat: 27.7172, lng: 85.324 }]);
  const center = {
    lat: unmercY((mercY(b.north) + mercY(b.south)) / 2),
    lng: (b.east + b.west) / 2,
  };
  const spanX = Math.max(1e-6, mercX(b.east) - mercX(b.west));
  const spanY = Math.max(1e-6, mercY(b.south) - mercY(b.north));
  const zx = Math.log2(usable.w / (TILE * spanX));
  const zy = Math.log2(usable.h / (TILE * spanY));
  const zoom = Math.min(maxZoom, Math.max(minZoom, Math.min(zx, zy)));
  return { center, zoom };
}

/** Human distance, Nepali-market friendly: metres under 1 km, else 1 decimal km. */
export function humanDistance(meters: number): string {
  if (!Number.isFinite(meters)) return "—";
  if (meters < 950) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
