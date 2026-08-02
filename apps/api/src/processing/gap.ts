/**
 * Grade Adjusted Pace, stage (f).
 *
 * Model: Minetti et al. (2002), "Energy cost of walking and running at extreme
 * uphill and downhill slopes" (J Appl Physiol 93:1039-46). The published 5th-
 * order polynomial gives the metabolic cost of running in J/kg/m as a function
 * of gradient:
 *
 *   Cr(i) = 155.4·i⁵ − 30.4·i⁴ − 43.3·i³ + 46.3·i² + 19.5·i + 3.6
 *
 * Chosen over Strava's undisclosed curve because it is published, peer-
 * reviewed, and reproducible — an athlete can check our arithmetic, which is
 * the whole point of the open-platform position (PLAN §3.6).
 *
 * The cost ratio Cr(i)/Cr(0) is how much harder the graded metre is than a
 * flat metre, so the equivalent flat time for a segment is elapsed/ratio:
 * uphill running yields a FASTER grade-adjusted pace than the raw pace, which
 * is the behaviour every runner expects from GAP.
 */

const FLAT_COST = 3.6; // J/kg/m at i = 0

/** Minetti's fit is only valid over ±45%; beyond that you are scrambling, not running. */
export const MAX_GRADIENT = 0.45;

/** Guards against a division blow-up if the polynomial is ever pushed out of range. */
const MIN_RATIO = 0.5;
const MAX_RATIO = 4;

export function minettiCost(gradient: number): number {
  const i = Math.max(-MAX_GRADIENT, Math.min(MAX_GRADIENT, gradient));
  return 155.4 * i ** 5 - 30.4 * i ** 4 - 43.3 * i ** 3 + 46.3 * i ** 2 + 19.5 * i + FLAT_COST;
}

/** Cost of a graded metre relative to a flat metre. >1 uphill, <1 on gentle descents. */
export function gradeAdjustmentFactor(gradient: number): number {
  const ratio = minettiCost(gradient) / FLAT_COST;
  return Math.max(MIN_RATIO, Math.min(MAX_RATIO, ratio));
}

/**
 * Equivalent flat-ground duration for one segment. Returns null when the
 * segment has no horizontal extent, since gradient is then undefined.
 */
export function gradeAdjustedSeconds(
  distanceM: number,
  elapsedS: number,
  elevationChangeM: number,
): number | null {
  if (distanceM <= 0 || elapsedS <= 0) return null;
  return elapsedS / gradeAdjustmentFactor(elevationChangeM / distanceM);
}

export interface GapSegment {
  distanceM: number;
  elapsedS: number;
  elevationChangeM: number;
}

/**
 * Whole-activity GAP in seconds per kilometre: the real elapsed time over the
 * equivalent flat distance, where each segment contributes its own length
 * scaled by its own cost. Adjusting the average gradient once would score an
 * out-and-back as flat, when the climb costs far more than the descent refunds;
 * summing equivalent distances is the only aggregation that conserves work.
 */
export function averageGapSecPerKm(segments: GapSegment[]): number | null {
  let equivalentM = 0;
  let elapsedS = 0;
  for (const segment of segments) {
    if (segment.distanceM <= 0 || segment.elapsedS <= 0) continue;
    equivalentM +=
      segment.distanceM * gradeAdjustmentFactor(segment.elevationChangeM / segment.distanceM);
    elapsedS += segment.elapsedS;
  }
  if (equivalentM <= 0) return null;
  return (elapsedS / equivalentM) * 1000;
}
