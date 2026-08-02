import { haversineM, type LatLng } from './geo.js';

export interface PrivacyZoneCircle {
  id: string;
  centerLat: number;
  centerLng: number;
  radiusM: number;
}

/** Upper bound of the random extension applied beyond a zone's true edge. */
export const MAX_ZONE_FUZZ_M = 200;

/**
 * Deterministic per-(activity, zone) fuzz.
 *
 * If the redaction stopped exactly at the configured radius, anyone could
 * fetch a few activities that pass the same house, take the convex hull of the
 * surviving points and read the zone centre straight off the map — which is
 * the address the zone exists to hide. Extending the cut by a random 0-200 m
 * breaks that inference.
 *
 * The offset must be *stable*: a fuzz redrawn per request would average out to
 * the true boundary over a handful of fetches, so the seed is persisted on the
 * activity and mixed with the zone id here (FNV-1a, which is plenty for a
 * non-adversarial jitter — it is not a secret, only unpredictable-in-value).
 */
export function zoneFuzzM(seed: number, zoneId: string, maxFuzzM = MAX_ZONE_FUZZ_M): number {
  let hash = 0x811c9dc5;
  const input = `${seed >>> 0}:${zoneId}`;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash / 0x1_0000_0000) * maxFuzzM;
}

export interface RedactionPlan {
  /** True at indices whose position must be withheld from this viewer. */
  redacted: boolean[];
  anyRedacted: boolean;
}

export function planZoneRedaction(
  track: (LatLng | null | undefined)[],
  zones: PrivacyZoneCircle[],
  fuzzSeed: number,
  maxFuzzM = MAX_ZONE_FUZZ_M,
): RedactionPlan {
  const redacted = new Array<boolean>(track.length).fill(false);
  if (zones.length === 0) return { redacted, anyRedacted: false };

  const effective = zones.map((zone) => ({
    center: [zone.centerLat, zone.centerLng] as LatLng,
    radiusM: zone.radiusM + zoneFuzzM(fuzzSeed, zone.id, maxFuzzM),
  }));

  let anyRedacted = false;
  for (let i = 0; i < track.length; i += 1) {
    const point = track[i];
    if (!point) continue;
    for (const zone of effective) {
      if (haversineM(point, zone.center) <= zone.radiusM) {
        redacted[i] = true;
        anyRedacted = true;
        break;
      }
    }
  }

  return { redacted, anyRedacted };
}

/**
 * Positional streams get null at redacted indices — the sample survives so
 * every other stream stays index-aligned with `time`, but the coordinate is
 * gone. Non-positional streams (heart rate, power) are untouched: they leak
 * nothing about location.
 */
export function redactPositions<T>(values: T[], plan: RedactionPlan): (T | null)[] {
  return values.map((value, i) => (plan.redacted[i] ? null : value));
}

/** Surviving points only, for rebuilding a map summary the viewer may see. */
export function survivingPoints(
  track: (LatLng | null | undefined)[],
  plan: RedactionPlan,
): LatLng[] {
  const out: LatLng[] = [];
  for (let i = 0; i < track.length; i += 1) {
    const point = track[i];
    if (point && !plan.redacted[i]) out.push(point);
  }
  return out;
}
