export interface ResolvedHrZones {
  maxHr: number;
  maxHrSource: 'configured' | 'age_estimate' | 'default';
  /** Lower bound of z1..z5 as a percentage of max HR. */
  boundariesPct: number[];
}

export interface HrZoneBucket {
  zone: number;
  minBpm: number;
  maxBpm: number | null;
  seconds: number;
}

/** Sane five-zone split; overridable per user. */
export const DEFAULT_BOUNDARIES_PCT = [50, 60, 70, 80, 90];
/** Used when we know neither a measured max nor a date of birth. */
export const DEFAULT_MAX_HR = 190;

/**
 * 220−age is crude (±10-12 bpm standard deviation) but it is the formula every
 * athlete recognises, and the alternative — Tanaka's 208−0.7·age — is not
 * meaningfully better for an unmeasured fallback. A configured max always wins.
 */
export function resolveMaxHr(
  configuredMaxHr: number | null,
  dateOfBirth: string | null,
  now = new Date(),
): { maxHr: number; source: ResolvedHrZones['maxHrSource'] } {
  if (configuredMaxHr) return { maxHr: configuredMaxHr, source: 'configured' };
  if (dateOfBirth) {
    const born = new Date(dateOfBirth);
    if (!Number.isNaN(born.getTime())) {
      const age = (now.getTime() - born.getTime()) / (365.2425 * 24 * 3600 * 1000);
      if (age >= 5 && age <= 100) {
        return { maxHr: Math.round(220 - age), source: 'age_estimate' };
      }
    }
  }
  return { maxHr: DEFAULT_MAX_HR, source: 'default' };
}

export function zoneBounds(
  zones: ResolvedHrZones,
): { zone: number; minBpm: number; maxBpm: number | null }[] {
  return zones.boundariesPct.map((pct, i) => {
    const next = zones.boundariesPct[i + 1];
    return {
      zone: i + 1,
      minBpm: Math.round((pct / 100) * zones.maxHr),
      maxBpm: next === undefined ? null : Math.round((next / 100) * zones.maxHr) - 1,
    };
  });
}

/**
 * Stage (h): time in zone. Samples under the z1 floor are not counted in any
 * zone — recovery standing around is not zone-1 training.
 */
export function timeInZones(
  heartrate: (number | null)[],
  time: number[],
  zones: ResolvedHrZones,
): HrZoneBucket[] {
  const bounds = zoneBounds(zones);
  const buckets: HrZoneBucket[] = bounds.map((b) => ({ ...b, seconds: 0 }));

  for (let i = 1; i < time.length; i += 1) {
    const hr = heartrate[i] ?? null;
    if (hr === null) continue;
    const dt = (time[i] ?? 0) - (time[i - 1] ?? 0);
    if (dt <= 0) continue;
    for (let z = buckets.length - 1; z >= 0; z -= 1) {
      if (hr >= buckets[z]!.minBpm) {
        buckets[z]!.seconds += dt;
        break;
      }
    }
  }

  return buckets.map((b) => ({ ...b, seconds: Math.round(b.seconds) }));
}
