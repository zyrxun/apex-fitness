import { gradeAdjustedSeconds } from './gap.js';
import { ELEVATION_HYSTERESIS_M } from './thresholds.js';

export interface SplitInput {
  cumulativeM: number[];
  time: number[];
  moving: boolean[];
  /** Smoothed altitude, index-aligned; nulls allowed. */
  altitude: (number | null)[];
  heartrate: (number | null)[];
  unitM: number;
  /** GAP is a running model; only run-category sports get gapS. */
  withGap: boolean;
}

export interface ComputedSplit {
  index: number;
  distanceM: number;
  elapsedS: number;
  movingS: number;
  elevGainM: number;
  netElevM: number;
  avgHr: number | null;
  gapS: number | null;
}

/**
 * Stage (e): per-unit splits. Distance and time boundaries are interpolated
 * inside the sample that crosses them, so the splits sum back to the activity
 * totals exactly rather than drifting by up to one sample each. Elevation and
 * heart rate are bucketed by whole sample — sub-sample interpolation of a
 * hysteresis walker would be precision theatre.
 */
export function computeSplits(input: SplitInput): ComputedSplit[] {
  const { cumulativeM, time, moving, altitude, heartrate, unitM } = input;
  const n = time.length;
  const total = cumulativeM[n - 1] ?? 0;
  if (n < 2 || total <= 0 || unitM <= 0) return [];

  const count = Math.max(1, Math.ceil(total / unitM));
  const splits: ComputedSplit[] = Array.from({ length: count }, (_, index) => ({
    index,
    distanceM: 0,
    elapsedS: 0,
    movingS: 0,
    elevGainM: 0,
    netElevM: 0,
    avgHr: null,
    gapS: null,
  }));

  // Pass 1 — distance/time, splitting the crossing sample proportionally.
  let current = 0;
  for (let i = 1; i < n; i += 1) {
    let remainingD = (cumulativeM[i] ?? 0) - (cumulativeM[i - 1] ?? 0);
    let remainingT = (time[i] ?? 0) - (time[i - 1] ?? 0);
    const isMoving = moving[i] ?? false;
    if (remainingD < 0) remainingD = 0;
    if (remainingT < 0) remainingT = 0;

    while (current < count - 1 && splits[current]!.distanceM + remainingD >= unitM) {
      const split = splits[current]!;
      const need = unitM - split.distanceM;
      const fraction = remainingD > 0 ? need / remainingD : 1;
      const takenT = remainingT * fraction;

      split.distanceM += need;
      split.elapsedS += takenT;
      if (isMoving) split.movingS += takenT;

      remainingD -= need;
      remainingT -= takenT;
      current += 1;
    }

    const split = splits[current]!;
    split.distanceM += remainingD;
    split.elapsedS += remainingT;
    if (isMoving) split.movingS += remainingT;
  }

  // Pass 2 — elevation gain with a hysteresis reference carried across the
  // whole activity (so the splits sum to the activity total) and time-weighted
  // heart rate, both attributed to the split the sample lands in.
  const bucketOf = (i: number) =>
    Math.min(count - 1, Math.floor((cumulativeM[i] ?? 0) / unitM));

  let reference: number | null = null;
  const firstAlt: (number | null)[] = new Array(count).fill(null);
  const lastAlt: (number | null)[] = new Array(count).fill(null);
  const hrSum = new Array(count).fill(0);
  const hrTime = new Array(count).fill(0);

  for (let i = 0; i < n; i += 1) {
    const bucket = bucketOf(i);
    const alt = altitude[i] ?? null;
    if (alt !== null) {
      if (firstAlt[bucket] === null) firstAlt[bucket] = alt;
      lastAlt[bucket] = alt;
      if (reference === null) {
        reference = alt;
      } else if (alt - reference >= ELEVATION_HYSTERESIS_M) {
        splits[bucket]!.elevGainM += alt - reference;
        reference = alt;
      } else if (reference - alt >= ELEVATION_HYSTERESIS_M) {
        reference = alt;
      }
    }

    const hr = heartrate[i] ?? null;
    if (hr !== null && i > 0) {
      const dt = (time[i] ?? 0) - (time[i - 1] ?? 0);
      if (dt > 0) {
        hrSum[bucket] += hr * dt;
        hrTime[bucket] += dt;
      }
    }
  }

  for (const split of splits) {
    const i = split.index;
    split.avgHr = (hrTime[i] ?? 0) > 0 ? hrSum[i]! / hrTime[i]! : null;
    const start = firstAlt[i] ?? null;
    const end = lastAlt[i] ?? null;
    split.netElevM = start !== null && end !== null ? end - start : 0;
    split.gapS = input.withGap
      ? gradeAdjustedSeconds(split.distanceM, split.elapsedS, split.netElevM)
      : null;
  }

  return splits;
}
