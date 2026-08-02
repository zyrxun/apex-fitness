import { movingAverage } from './smoothing.js';
import { ALTITUDE_MEAN_WINDOW, ELEVATION_HYSTERESIS_M } from './thresholds.js';

export interface ElevationResult {
  smoothed: (number | null)[];
  gainM: number;
  lossM: number;
}

/**
 * Stage (d): smooth, then accumulate gain/loss against a hysteresis band.
 *
 * The reference altitude only moves once the signal has travelled ±2 m from it,
 * so barometric drift and GNSS altitude jitter contribute nothing while a real
 * climb still accumulates its full height (each 2 m step is credited in full
 * and the reference follows). Raw altitude is preserved by the caller; this
 * returns the smoothed series as the `altitude_clean` stream.
 */
export function computeElevation(
  altitude: (number | null)[],
  options: { window?: number; hysteresisM?: number } = {},
): ElevationResult {
  const smoothed = movingAverage(altitude, options.window ?? ALTITUDE_MEAN_WINDOW);
  const hysteresis = options.hysteresisM ?? ELEVATION_HYSTERESIS_M;

  let gainM = 0;
  let lossM = 0;
  let reference: number | null = null;

  for (const value of smoothed) {
    if (value === null) continue;
    if (reference === null) {
      reference = value;
      continue;
    }
    const delta = value - reference;
    if (delta >= hysteresis) {
      gainM += delta;
      reference = value;
    } else if (-delta >= hysteresis) {
      lossM += -delta;
      reference = value;
    }
  }

  return { smoothed, gainM, lossM };
}
