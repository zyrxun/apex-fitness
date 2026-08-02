import type { StreamsInput } from '@apex/shared';

/**
 * `[lat, lng]`, derived from the server's own `latlng` stream schema rather than
 * redeclared — if the API ever reorders the pair, this stops compiling.
 */
export type LatLng = NonNullable<StreamsInput['latlng']>[number];

const EARTH_RADIUS_M = 6_371_008.8; // IUGG mean radius

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Haversine great-circle distance in metres.
 *
 * Deliberately duplicated from `apps/api/src/processing/geo.ts` for now: the
 * server copy lives inside the API workspace and the mobile app must not depend
 * on it. ADR 0001 build task 6 moves GPS maths into `@apex/shared` as a pure TS
 * module used by both sides — at which point this file deletes itself and the
 * import above becomes `haversineM` from `@apex/shared`.
 */
export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Cumulative distance along an ordered track, in metres. */
export function trackDistanceM(points: readonly LatLng[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += haversineM(points[i - 1]!, points[i]!);
  return total;
}
