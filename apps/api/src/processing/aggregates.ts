export interface SeriesStats {
  avg: number | null;
  max: number | null;
}

/**
 * Stage (g). Averages are taken over samples that actually carry a value:
 * a heart-rate strap that drops out for a minute must not average that minute
 * in as zero.
 */
export function seriesStats(values: (number | null | undefined)[]): SeriesStats {
  let sum = 0;
  let count = 0;
  let max: number | null = null;
  for (const value of values) {
    if (value === null || value === undefined || Number.isNaN(value)) continue;
    sum += value;
    count += 1;
    if (max === null || value > max) max = value;
  }
  return { avg: count > 0 ? sum / count : null, max };
}

/**
 * Speed stats over the moving portion only. Average speed over elapsed time
 * would punish a rider for a café stop, which is not what "average speed"
 * means to anyone. Max speed uses a 3-sample median to reject the single-fix
 * spikes that survive GPS cleanup as merely-implausible rather than impossible.
 */
export function speedStats(
  speedMs: number[],
  moving: boolean[],
  distanceM: number,
  movingS: number,
): SeriesStats {
  const avg = movingS > 0 ? distanceM / movingS : null;

  let max: number | null = null;
  for (let i = 1; i < speedMs.length - 1; i += 1) {
    if (!moving[i]) continue;
    const window = [speedMs[i - 1] ?? 0, speedMs[i] ?? 0, speedMs[i + 1] ?? 0].sort(
      (a, b) => a - b,
    );
    const median = window[1]!;
    if (max === null || median > max) max = median;
  }
  if (max === null && speedMs.length > 0) max = Math.max(0, ...speedMs);

  return { avg, max };
}
