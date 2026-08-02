export type LatLng = [number, number];

const EARTH_RADIUS_M = 6_371_008.8; // IUGG mean radius
const toRad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Haversine great-circle distance. Accurate to ~0.3% versus Vincenty at any
 * distance we care about, and it never fails to converge near-antipodally.
 */
export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Encoded Polyline Algorithm Format, precision 5 — the map-library lingua franca. */
export function encodePolyline(points: LatLng[]): string {
  let lastLat = 0;
  let lastLng = 0;
  let out = '';

  const encodeValue = (value: number) => {
    let v = value < 0 ? ~(value << 1) : value << 1;
    while (v >= 0x20) {
      out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    out += String.fromCharCode(v + 63);
  };

  for (const [lat, lng] of points) {
    const iLat = Math.round(lat * 1e5);
    const iLng = Math.round(lng * 1e5);
    encodeValue(iLat - lastLat);
    encodeValue(iLng - lastLng);
    lastLat = iLat;
    lastLng = iLng;
  }
  return out;
}

/** Evenly spaced subsample that always keeps the first and last fix. */
export function downsample<T>(points: T[], maxPoints: number): T[] {
  if (points.length <= maxPoints) return [...points];
  const step = (points.length - 1) / (maxPoints - 1);
  const out: T[] = [];
  for (let i = 0; i < maxPoints; i += 1) out.push(points[Math.round(i * step)]!);
  return out;
}
