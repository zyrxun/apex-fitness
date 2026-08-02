import { haversineM, type LatLng } from './geo.js';
import { movingMedian } from './smoothing.js';
import { GPS_MEDIAN_WINDOW } from './thresholds.js';

export interface CleanGpsInput {
  latlng: (LatLng | null)[];
  time: number[];
  maxSpeedMs: number;
  medianWindow?: number;
}

export interface CleanGpsResult {
  /** Index-aligned with `time`; null where the fix was rejected. */
  cleaned: (LatLng | null)[];
  droppedIndices: number[];
}

/**
 * After this many consecutive rejections we stop trusting the anchor and
 * re-anchor on the current fix. Without it, one bad anchor (or a legitimate
 * teleport out of a tunnel with a stale timestamp) would reject the entire
 * remainder of the track.
 */
const MAX_CONSECUTIVE_REJECTS = 5;

/**
 * Stage (a): drop physically impossible jumps, then smooth what survives.
 *
 * Rejection is anchor-relative rather than neighbour-relative so a run of bad
 * fixes cannot bootstrap itself into looking plausible. The raw stream is
 * never modified — the caller stores this as `latlng_clean` alongside it.
 */
export function cleanGpsTrack(input: CleanGpsInput): CleanGpsResult {
  const { latlng, time, maxSpeedMs } = input;
  const kept: (LatLng | null)[] = new Array(latlng.length).fill(null);
  const droppedIndices: number[] = [];

  let anchor: { point: LatLng; time: number } | null = null;
  let consecutiveRejects = 0;

  for (let i = 0; i < latlng.length; i += 1) {
    const point = latlng[i] ?? null;
    if (!point) {
      droppedIndices.push(i);
      continue;
    }
    const t = time[i] ?? i;

    if (!anchor) {
      kept[i] = point;
      anchor = { point, time: t };
      continue;
    }

    const dt = Math.max(t - anchor.time, 1);
    const speed = haversineM(anchor.point, point) / dt;

    if (speed > maxSpeedMs && consecutiveRejects < MAX_CONSECUTIVE_REJECTS) {
      droppedIndices.push(i);
      consecutiveRejects += 1;
      continue;
    }

    kept[i] = point;
    anchor = { point, time: t };
    consecutiveRejects = 0;
  }

  // Smooth lat and lng independently. A 2-D median filter is more principled
  // but the per-axis form is what every mainstream tracker ships, and the
  // residual error is far below GNSS accuracy.
  const window = input.medianWindow ?? GPS_MEDIAN_WINDOW;
  const lats = movingMedian(
    kept.map((p) => (p ? p[0] : null)),
    window,
  );
  const lngs = movingMedian(
    kept.map((p) => (p ? p[1] : null)),
    window,
  );

  const cleaned = kept.map((p, i) =>
    p && lats[i] !== null && lngs[i] !== null ? ([lats[i]!, lngs[i]!] as LatLng) : null,
  );

  return { cleaned, droppedIndices };
}

export interface DistanceResult {
  totalM: number;
  /** Cumulative metres at each sample index; carries forward across null fixes. */
  cumulativeM: number[];
}

/** Stage (b): distance from the cleaned track. */
export function distanceFromTrack(track: (LatLng | null)[]): DistanceResult {
  const cumulativeM: number[] = new Array(track.length).fill(0);
  let total = 0;
  let previous: LatLng | null = null;

  for (let i = 0; i < track.length; i += 1) {
    const point = track[i] ?? null;
    if (point && previous) total += haversineM(previous, point);
    if (point) previous = point;
    cumulativeM[i] = total;
  }
  return { totalM: total, cumulativeM };
}
