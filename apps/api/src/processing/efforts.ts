export interface BestEffort {
  distanceM: number;
  elapsedS: number;
  startIndex: number;
  endIndex: number;
}

/**
 * Phase-2 PR detection: the fastest contiguous window covering exactly
 * `distanceM`, found with a single backward-walking pointer (O(n) amortised).
 *
 * The window start is interpolated inside the sample that crosses the target
 * so a 1 km best is measured over 1000 m, not over "the first sample at or
 * beyond 1000 m" — at 1 Hz that difference is several seconds on a bike.
 *
 * Full PR machinery (all sports, power curves, historical recomputation)
 * arrives in Phase 7; this is the correct-but-minimal version.
 */
export function bestEffortForDistance(
  cumulativeM: number[],
  time: number[],
  distanceM: number,
): BestEffort | null {
  const n = Math.min(cumulativeM.length, time.length);
  if (n < 2 || distanceM <= 0) return null;
  if ((cumulativeM[n - 1] ?? 0) - (cumulativeM[0] ?? 0) < distanceM) return null;

  let best: BestEffort | null = null;
  let start = 0;

  for (let end = 1; end < n; end += 1) {
    const target = (cumulativeM[end] ?? 0) - distanceM;
    if (target < (cumulativeM[0] ?? 0)) continue;
    while (start + 1 < end && (cumulativeM[start + 1] ?? 0) <= target) start += 1;

    const d0 = cumulativeM[start] ?? 0;
    const d1 = cumulativeM[start + 1] ?? d0;
    const span = d1 - d0;
    const fraction = span > 0 ? (target - d0) / span : 0;
    const startTime =
      (time[start] ?? 0) + fraction * ((time[start + 1] ?? time[start] ?? 0) - (time[start] ?? 0));
    const elapsedS = (time[end] ?? 0) - startTime;
    if (elapsedS <= 0) continue;

    if (!best || elapsedS < best.elapsedS) {
      best = { distanceM, elapsedS, startIndex: start, endIndex: end };
    }
  }

  return best;
}

export function bestEfforts(
  cumulativeM: number[],
  time: number[],
  distances: readonly number[],
): BestEffort[] {
  return distances
    .map((d) => bestEffortForDistance(cumulativeM, time, d))
    .filter((e): e is BestEffort => e !== null);
}
