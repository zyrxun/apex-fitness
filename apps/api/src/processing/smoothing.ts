/**
 * Moving median over a centred window. Chosen over a mean for positions
 * because a median is immune to a single wild fix — the exact failure mode GPS
 * has in urban canyons — where a mean would drag the whole neighbourhood
 * toward the outlier. Nulls are passed through untouched.
 *
 * The window shrinks symmetrically near the ends rather than leaning inward: a
 * lopsided window pulls the first and last fixes toward the middle of the
 * track, quietly shortening every activity by a sample at each end.
 */
export function movingMedian(values: (number | null)[], window: number): (number | null)[] {
  const half = Math.floor(window / 2);
  return values.map((value, i) => {
    if (value === null) return null;
    const radius = Math.min(half, i, values.length - 1 - i);
    const slice: number[] = [];
    for (let j = i - radius; j <= i + radius; j += 1) {
      const v = values[j];
      if (v !== null && v !== undefined) slice.push(v);
    }
    if (slice.length === 0) return value;
    slice.sort((a, b) => a - b);
    const mid = slice.length >> 1;
    return slice.length % 2 ? slice[mid]! : (slice[mid - 1]! + slice[mid]!) / 2;
  });
}

/**
 * Centred moving average. Correct for altitude, where the noise is roughly
 * symmetric drift rather than discrete spikes and preserving the true mean
 * matters more than rejecting outliers.
 */
export function movingAverage(values: (number | null)[], window: number): (number | null)[] {
  const half = Math.floor(window / 2);
  return values.map((value, i) => {
    if (value === null) return null;
    const radius = Math.min(half, i, values.length - 1 - i);
    let sum = 0;
    let count = 0;
    for (let j = i - radius; j <= i + radius; j += 1) {
      const v = values[j];
      if (v !== null && v !== undefined) {
        sum += v;
        count += 1;
      }
    }
    return count === 0 ? value : sum / count;
  });
}
