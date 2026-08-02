export interface SwimLengthInput {
  durationS: number;
  strokeCount?: number | null;
}

export interface SwimStats {
  lengthCount: number;
  distanceM: number;
  totalStrokes: number | null;
  /** Mean SWOLF across scoreable lengths, normalised to a 25 m pool. */
  avgSwolf: number | null;
}

export const SWOLF_REFERENCE_POOL_M = 25;

/**
 * Stage (i). SWOLF = seconds + strokes for one length: the swimming analogue of
 * golf's score, where lower is better and you cannot improve it by thrashing.
 *
 * Raw SWOLF is only comparable within one pool length, so we normalise to 25 m
 * — the reference every swimmer already thinks in — by scaling the score with
 * the length ratio. Lengths without a stroke count are still distance, but they
 * cannot be scored and are excluded from the average rather than counted as 0.
 *
 * Strava reports SWOLF inconsistently and never for open water; first-class
 * swimming is PLAN pillar 7.
 */
export function computeSwimStats(
  lengths: SwimLengthInput[],
  poolLengthM: number,
): SwimStats {
  const lengthCount = lengths.length;
  const distanceM = lengthCount * poolLengthM;

  let strokeTotal = 0;
  let scoreable = 0;
  let swolfTotal = 0;

  for (const length of lengths) {
    const strokes = length.strokeCount ?? null;
    if (strokes === null) continue;
    strokeTotal += strokes;
    scoreable += 1;
    const raw = length.durationS + strokes;
    swolfTotal += raw * (SWOLF_REFERENCE_POOL_M / poolLengthM);
  }

  return {
    lengthCount,
    distanceM,
    totalStrokes: scoreable > 0 ? strokeTotal : null,
    avgSwolf: scoreable > 0 ? swolfTotal / scoreable : null,
  };
}
