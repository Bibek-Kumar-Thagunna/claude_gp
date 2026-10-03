import type { LatLng } from "@gopasal/native-data/seller-delivery";

/**
 * Just enough plane geometry to draw a walked zone and sanity-check it.
 *
 * Everything here projects degrees onto a flat plane in metres around the
 * shape's own centre, with longitude shrunk by cos(latitude). At Nepal's
 * latitudes, over a delivery zone, that is far more exact than the GPS fixes it
 * is fed — and without the cosine a zone in Kathmandu draws about 12% too wide,
 * which is the difference between a square block and one that looks wrong to the
 * person who just walked it.
 *
 * None of this is what checkout uses. `pointInZone` is the server's rule and is
 * imported from the data layer; this file only draws and warns.
 */

const M_PER_DEG_LAT = 110_540;
const M_PER_DEG_LNG_AT_EQUATOR = 111_320;

type XY = { x: number; y: number };

function centreOf(points: readonly LatLng[]): LatLng {
  let lat = 0;
  let lng = 0;
  for (const p of points) {
    lat += p.lat;
    lng += p.lng;
  }
  return { lat: lat / points.length, lng: lng / points.length };
}

function toPlane(points: readonly LatLng[], origin: LatLng): XY[] {
  const k = Math.cos((origin.lat * Math.PI) / 180) * M_PER_DEG_LNG_AT_EQUATOR;
  return points.map((p) => ({
    x: (p.lng - origin.lng) * k,
    y: (p.lat - origin.lat) * M_PER_DEG_LAT,
  }));
}

/** Area enclosed, in square metres. Zero for fewer than three points. */
export function ringAreaM2(points: readonly LatLng[]): number {
  if (points.length < 3) return 0;
  const xy = toPlane(points, centreOf(points));
  let twice = 0;
  for (let i = 0; i < xy.length; i += 1) {
    const a = xy[i]!;
    const b = xy[(i + 1) % xy.length]!;
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) / 2;
}

function orientation(a: XY, b: XY, c: XY): number {
  const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  if (Math.abs(value) < 1e-9) return 0;
  return value > 0 ? 1 : 2;
}

function segmentsCross(p1: XY, q1: XY, p2: XY, q2: XY): boolean {
  // Proper crossings only. Collinear touching is left alone: it comes from two
  // corners taken at the same spot, which the corner list already flags, and
  // calling it a crossing would give one mistake two warnings.
  const o1 = orientation(p1, q1, p2);
  const o2 = orientation(p1, q1, q2);
  const o3 = orientation(p2, q2, p1);
  const o4 = orientation(p2, q2, q1);
  return o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0 && o1 !== o2 && o3 !== o4;
}

/**
 * Whether the outline crosses itself — a figure-eight.
 *
 * This is the walk-the-boundary mistake that no validator catches: take the
 * corners out of order (the far side of the block before the near one) and the
 * edges cross. The server stores it happily, and `pointInZone`'s even-odd rule
 * then treats the lobes where the edges overlap as *outside*, so part of the
 * area the shopkeeper walked round silently isn't covered.
 */
export function ringSelfIntersects(points: readonly LatLng[]): boolean {
  const n = points.length;
  if (n < 4) return false;
  const xy = toPlane(points, centreOf(points));
  for (let i = 0; i < n; i += 1) {
    const a1 = xy[i]!;
    const a2 = xy[(i + 1) % n]!;
    for (let j = i + 1; j < n; j += 1) {
      // Neighbouring edges share a corner and always "touch" there.
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      const b1 = xy[j]!;
      const b2 = xy[(j + 1) % n]!;
      if (segmentsCross(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

/**
 * A mapping from coordinates to a `width × height` box, fitted to `points`.
 *
 * Aspect ratio is kept — a long thin zone must look long and thin — and a
 * minimum span stops two corners a metre apart from being blown up to fill the
 * box, which would make a mistake look like a shape.
 */
export function fitToBox(
  points: readonly LatLng[],
  width: number,
  height: number,
  padding: number,
  minSpanM = 60,
): { project: (p: LatLng) => XY; metresPerPixel: number } | null {
  if (points.length === 0) return null;
  const origin = centreOf(points);
  const xy = toPlane(points, origin);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of xy) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const spanX = Math.max(maxX - minX, minSpanM);
  const spanY = Math.max(maxY - minY, minSpanM);
  const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  const k = Math.cos((origin.lat * Math.PI) / 180) * M_PER_DEG_LNG_AT_EQUATOR;

  return {
    metresPerPixel: 1 / scale,
    project: (p: LatLng) => {
      const x = (p.lng - origin.lng) * k;
      const y = (p.lat - origin.lat) * M_PER_DEG_LAT;
      // North up: screen y grows downward, latitude grows upward.
      return { x: width / 2 + (x - midX) * scale, y: height / 2 - (y - midY) * scale };
    },
  };
}
