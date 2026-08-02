import { sportCategory, type SportCategory, type SportType } from '@apex/shared';

export interface SportProfile {
  /**
   * Speed above which a GPS fix is physically impossible for this sport and is
   * therefore a bad fix rather than a fast athlete. Set well above world-record
   * pace so a genuinely fast effort is never truncated.
   */
  maxSpeedMs: number;
  /** Below this the athlete counts as stopped (auto-pause equivalent). */
  movingThresholdMs: number;
  /** Compendium-of-Physical-Activities MET used by the calorie fallback. */
  baseMet: number;
}

const PROFILES: Record<SportCategory, SportProfile> = {
  // 12.5 m/s ≈ 45 km/h — Bolt's peak is 12.4 m/s, so nothing legitimate exceeds it.
  run: { maxSpeedMs: 12.5, movingThresholdMs: 0.5, baseMet: 9.8 },
  // 30 m/s ≈ 108 km/h — steep alpine descents reach the mid-20s.
  ride: { maxSpeedMs: 30, movingThresholdMs: 1.0, baseMet: 8.0 },
  swim: { maxSpeedMs: 3.5, movingThresholdMs: 0.2, baseMet: 8.3 },
  strength: { maxSpeedMs: 5, movingThresholdMs: 0.3, baseMet: 5.0 },
  // Alpine ski and sailing live here, so the ceiling is deliberately generous.
  other: { maxSpeedMs: 45, movingThresholdMs: 0.4, baseMet: 4.5 },
};

export const sportProfile = (sport: SportType): SportProfile => PROFILES[sportCategory(sport)];

export const sportProfileForCategory = (category: SportCategory): SportProfile =>
  PROFILES[category];

/** Elevation noise floor: barometric drift and GNSS altitude jitter both sit under 2 m. */
export const ELEVATION_HYSTERESIS_M = 2;

/** Window sizes for the median (position) and mean (altitude) smoothers. */
export const GPS_MEDIAN_WINDOW = 5;
export const ALTITUDE_MEAN_WINDOW = 7;
