import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  bearingDegrees,
  estimateDurationSeconds,
  haversineMeters,
  pointInPolygon,
  type GeoPoint,
} from './geo';

/**
 * These functions are what makes the credential-free map provider real rather
 * than a stub, so "the distance is a genuine great-circle distance" has to be
 * checked against something other than itself. `lawOfCosines` below is an
 * independent formula for the same quantity — different algebra, same geometry —
 * and the two must agree to within a metre over city distances.
 */
const R = 6_371_000;
const rad = (d: number): number => (d * Math.PI) / 180;
const lawOfCosines = (a: GeoPoint, b: GeoPoint): number =>
  R *
  Math.acos(
    Math.sin(rad(a.lat)) * Math.sin(rad(b.lat)) +
      Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng)),
  );

/** Real places, because a wrong earth radius shows up as a plausible-looking number. */
const KATHMANDU_DURBAR: GeoPoint = { lat: 27.7045, lng: 85.307 };
const PATAN_DURBAR: GeoPoint = { lat: 27.6727, lng: 85.325 };
const BHAKTAPUR_DURBAR: GeoPoint = { lat: 27.6722, lng: 85.4285 };

describe('haversineMeters', () => {
  it('agrees with an independent great-circle formula', () => {
    for (const [a, b] of [
      [KATHMANDU_DURBAR, PATAN_DURBAR],
      [KATHMANDU_DURBAR, BHAKTAPUR_DURBAR],
      [PATAN_DURBAR, BHAKTAPUR_DURBAR],
    ] as const) {
      assert.ok(Math.abs(haversineMeters(a, b) - lawOfCosines(a, b)) <= 1);
    }
  });

  it('gets the magnitude right for a distance that can be checked on a map', () => {
    // Kathmandu Durbar Square to Patan Durbar Square is a little under 4 km.
    const d = haversineMeters(KATHMANDU_DURBAR, PATAN_DURBAR);
    assert.ok(d > 3600 && d < 4200, `got ${d} m`);
    // Kathmandu to Bhaktapur is roughly 12 km as the crow flies.
    const far = haversineMeters(KATHMANDU_DURBAR, BHAKTAPUR_DURBAR);
    assert.ok(far > 11000 && far < 13500, `got ${far} m`);
  });

  it('is zero for one point and symmetric between two', () => {
    assert.equal(haversineMeters(KATHMANDU_DURBAR, KATHMANDU_DURBAR), 0);
    assert.equal(
      haversineMeters(KATHMANDU_DURBAR, PATAN_DURBAR),
      haversineMeters(PATAN_DURBAR, KATHMANDU_DURBAR),
    );
  });
});

describe('bearingDegrees', () => {
  it('reads 0 for north, 90 for east, 180 for south, 270 for west', () => {
    const o: GeoPoint = { lat: 27.7, lng: 85.3 };
    assert.ok(Math.abs(bearingDegrees(o, { lat: 27.8, lng: 85.3 })) < 0.01);
    assert.ok(Math.abs(bearingDegrees(o, { lat: 27.7, lng: 85.4 }) - 90) < 0.1);
    assert.ok(Math.abs(bearingDegrees(o, { lat: 27.6, lng: 85.3 }) - 180) < 0.01);
    assert.ok(Math.abs(bearingDegrees(o, { lat: 27.7, lng: 85.2 }) - 270) < 0.1);
  });

  it('always returns a compass value, never a negative one', () => {
    const b = bearingDegrees({ lat: 27.7, lng: 85.3 }, { lat: 27.6, lng: 85.2 });
    assert.ok(b >= 0 && b < 360, `got ${b}`);
  });
});

describe('estimateDurationSeconds', () => {
  it('scales linearly with distance at the assumed city speed', () => {
    // 22 km/h default: 22 km ⇒ one hour.
    assert.equal(estimateDurationSeconds(22_000), 3600);
    assert.equal(estimateDurationSeconds(11_000), 1800);
    assert.equal(estimateDurationSeconds(0), 0);
  });

  it('honours an explicit average speed', () => {
    assert.equal(estimateDurationSeconds(10_000, 20), 1800);
  });
});

describe('pointInPolygon', () => {
  // A square around Kathmandu, in the {lat,lng} form service-area rings use.
  const ring: GeoPoint[] = [
    { lat: 27.6, lng: 85.2 },
    { lat: 27.8, lng: 85.2 },
    { lat: 27.8, lng: 85.4 },
    { lat: 27.6, lng: 85.4 },
  ];

  it('includes an interior point and excludes an exterior one', () => {
    assert.equal(pointInPolygon({ lat: 27.7, lng: 85.3 }, ring), true);
    assert.equal(pointInPolygon({ lat: 27.9, lng: 85.3 }, ring), false);
    assert.equal(pointInPolygon({ lat: 27.7, lng: 85.5 }, ring), false);
  });

  it('excludes everything when the ring is empty rather than throwing', () => {
    assert.equal(pointInPolygon({ lat: 27.7, lng: 85.3 }, []), false);
  });
});
