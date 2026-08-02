export interface MovingResult {
  movingS: number;
  /** Per-sample moving flag, index-aligned with `time`. */
  moving: boolean[];
  /** Instantaneous speed per sample (m/s), 0 at the first sample. */
  speedMs: number[];
}

/**
 * Stage (c): auto-pause equivalent. A sample counts as moving when the speed
 * over the interval that ended at it clears the sport threshold; the interval's
 * duration is then credited to moving time. The first sample has no interval
 * and contributes nothing, so movingS <= elapsed always holds.
 */
export function detectMovingTime(
  cumulativeM: number[],
  time: number[],
  thresholdMs: number,
): MovingResult {
  const n = time.length;
  const moving: boolean[] = new Array(n).fill(false);
  const speedMs: number[] = new Array(n).fill(0);
  let movingS = 0;

  for (let i = 1; i < n; i += 1) {
    const dt = (time[i] ?? 0) - (time[i - 1] ?? 0);
    if (dt <= 0) continue;
    const dd = (cumulativeM[i] ?? 0) - (cumulativeM[i - 1] ?? 0);
    const speed = dd / dt;
    speedMs[i] = speed;
    if (speed >= thresholdMs) {
      moving[i] = true;
      movingS += dt;
    }
  }
  if (n > 0) moving[0] = moving[1] ?? false;

  return { movingS, moving, speedMs };
}

/**
 * When the client supplies its own `moving` stream (the recorder knows about
 * button presses we cannot see) it wins, but we still derive speeds ourselves.
 */
export function movingTimeFromFlags(flags: boolean[], time: number[]): number {
  let total = 0;
  for (let i = 1; i < time.length; i += 1) {
    const dt = (time[i] ?? 0) - (time[i - 1] ?? 0);
    if (dt > 0 && flags[i]) total += dt;
  }
  return total;
}
