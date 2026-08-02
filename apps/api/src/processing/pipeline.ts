import {
  PR_DISTANCES_M,
  sportCategory,
  sportHasPool,
  type Sex,
  type SplitUnit,
  type SportType,
  type SwimStroke,
  M_PER_MILE,
} from '@apex/shared';
import { seriesStats, speedStats } from './aggregates.js';
import { estimateCalories } from './calories.js';
import { computeElevation } from './elevation.js';
import { bestEfforts, type BestEffort } from './efforts.js';
import { averageGapSecPerKm } from './gap.js';
import { cleanGpsTrack, distanceFromTrack } from './gps.js';
import { downsample, type LatLng } from './geo.js';
import { timeInZones, type HrZoneBucket, type ResolvedHrZones } from './hr-zones.js';
import { detectMovingTime, movingTimeFromFlags } from './moving.js';
import { computeSplits, type ComputedSplit } from './splits.js';
import { computeSwimStats } from './swim.js';
import { sportProfile } from './thresholds.js';

/** Map previews never need more than this; the full track stays in the stream. */
export const MAP_SUMMARY_POINTS = 200;

export interface PipelineStreams {
  time: number[];
  latlng?: LatLng[];
  altitude?: number[];
  heartrate?: number[];
  cadence?: number[];
  power?: number[];
  velocity?: number[];
  temperature?: number[];
  moving?: boolean[];
}

export interface PipelineInput {
  sportType: SportType;
  elapsedS: number;
  clientDistanceM?: number | null;
  clientMovingS?: number | null;
  clientCalories?: number | null;
  poolLengthM?: number | null;
  streams?: PipelineStreams | null;
  swimLengths?: { stroke: SwimStroke; durationS: number; strokeCount?: number | null }[] | null;
  hrZones: ResolvedHrZones;
  athlete: { bodyweightKg: number | null; sex: Sex; ageYears: number | null };
}

export interface PipelineSplit extends ComputedSplit {
  unit: SplitUnit;
}

export interface PipelineResult {
  distanceM: number;
  movingS: number;
  elevGainM: number;
  elevLossM: number;
  avgSpeedMs: number | null;
  maxSpeedMs: number | null;
  avgHr: number | null;
  maxHr: number | null;
  avgCadence: number | null;
  maxCadence: number | null;
  avgPowerW: number | null;
  maxPowerW: number | null;
  avgGapSecPerKm: number | null;
  calories: number;
  calorieMethod: 'heart_rate' | 'met';
  hrZoneTimes: HrZoneBucket[] | null;
  avgSwolf: number | null;
  totalStrokes: number | null;
  splits: PipelineSplit[];
  efforts: BestEffort[];
  cleanedLatLng: (LatLng | null)[] | null;
  cleanedAltitude: (number | null)[] | null;
  mapSummary: LatLng[] | null;
  startLatLng: LatLng | null;
  endLatLng: LatLng | null;
}

const nullable = <T>(values: T[] | undefined, length: number): (T | null)[] =>
  values ? Array.from({ length }, (_, i) => values[i] ?? null) : new Array(length).fill(null);

/**
 * Stages (a)-(j) in order. Pure: no database, no clock, no randomness — the
 * same input always yields the same activity, which is what makes both the
 * unit tests and a future reprocessing job trustworthy.
 */
export function runPipeline(input: PipelineInput): PipelineResult {
  const profile = sportProfile(input.sportType);
  const category = sportCategory(input.sportType);
  const time = input.streams?.time ?? [];
  const n = time.length;

  // (a) GPS cleanup — raw stays raw; this becomes the latlng_clean stream.
  const rawLatLng = input.streams?.latlng;
  const cleanedLatLng = rawLatLng
    ? cleanGpsTrack({ latlng: rawLatLng, time, maxSpeedMs: profile.maxSpeedMs }).cleaned
    : null;

  // (b) Distance: cleaned GPS when we have it, then integrated velocity, then
  // the client's own figure spread evenly so indoor splits still work.
  let cumulativeM: number[];
  let distanceM: number;
  if (cleanedLatLng) {
    const measured = distanceFromTrack(cleanedLatLng);
    cumulativeM = measured.cumulativeM;
    distanceM = measured.totalM;
  } else if (input.streams?.velocity && n > 1) {
    cumulativeM = new Array(n).fill(0);
    let total = 0;
    for (let i = 1; i < n; i += 1) {
      const dt = (time[i] ?? 0) - (time[i - 1] ?? 0);
      if (dt > 0) total += (input.streams.velocity[i] ?? 0) * dt;
      cumulativeM[i] = total;
    }
    distanceM = total;
  } else {
    distanceM = input.clientDistanceM ?? 0;
    const span = n > 1 ? (time[n - 1] ?? 0) - (time[0] ?? 0) : 0;
    cumulativeM =
      span > 0 ? time.map((t) => ((t - (time[0] ?? 0)) / span) * distanceM) : new Array(n).fill(0);
  }

  // (c) Moving time. A recorder's own pause flags beat inference from speed.
  const derivedMoving = detectMovingTime(cumulativeM, time, profile.movingThresholdMs);
  const clientFlags = input.streams?.moving;
  const moving = clientFlags ?? derivedMoving.moving;
  let movingS = clientFlags ? movingTimeFromFlags(clientFlags, time) : derivedMoving.movingS;
  if (n === 0) movingS = input.clientMovingS ?? input.elapsedS;
  movingS = Math.min(Math.round(movingS), input.elapsedS);

  // (d) Elevation.
  const rawAltitude = nullable(input.streams?.altitude, n);
  const elevation = input.streams?.altitude
    ? computeElevation(rawAltitude)
    : { smoothed: null, gainM: 0, lossM: 0 };

  const heartrate = nullable(input.streams?.heartrate, n);
  const cadence = nullable(input.streams?.cadence, n);
  const power = nullable(input.streams?.power, n);

  // (e) Splits, per kilometre and per mile.
  const withGap = category === 'run';
  const splitBase = {
    cumulativeM,
    time,
    moving,
    altitude: elevation.smoothed ?? new Array<number | null>(n).fill(null),
    heartrate,
    withGap,
  };
  const splits: PipelineSplit[] = [
    ...computeSplits({ ...splitBase, unitM: 1000 }).map((s) => ({ ...s, unit: 'km' as SplitUnit })),
    ...computeSplits({ ...splitBase, unitM: M_PER_MILE }).map((s) => ({
      ...s,
      unit: 'mile' as SplitUnit,
    })),
  ];

  // (f) GAP over the kilometre splits — run category only.
  const avgGapSecPerKm = withGap
    ? averageGapSecPerKm(
        splits
          .filter((s) => s.unit === 'km')
          .map((s) => ({
            distanceM: s.distanceM,
            elapsedS: s.elapsedS,
            elevationChangeM: s.netElevM,
          })),
      )
    : null;

  // (g) Aggregates.
  const hrStats = seriesStats(heartrate);
  const cadenceStats = seriesStats(cadence);
  const powerStats = seriesStats(power);
  const speeds = speedStats(derivedMoving.speedMs, moving, distanceM, movingS);

  // (h) Time in zone.
  const hrZoneTimes = input.streams?.heartrate ? timeInZones(heartrate, time, input.hrZones) : null;

  // (i) Swim stats. Pool lengths are authoritative for distance — a pool swim
  // has no GPS and the client counted the walls.
  let avgSwolf: number | null = null;
  let totalStrokes: number | null = null;
  if (sportHasPool(input.sportType) && input.swimLengths?.length && input.poolLengthM) {
    const swim = computeSwimStats(input.swimLengths, input.poolLengthM);
    avgSwolf = swim.avgSwolf;
    totalStrokes = swim.totalStrokes;
    distanceM = swim.distanceM;
  }

  // (j) Calories.
  const calories = estimateCalories({
    durationS: movingS > 0 ? movingS : input.elapsedS,
    baseMet: profile.baseMet,
    bodyweightKg: input.athlete.bodyweightKg,
    avgHr: hrStats.avg,
    ageYears: input.athlete.ageYears,
    sex: input.athlete.sex,
  });

  // Best efforts: run category only for now (Phase 7 generalises this).
  const efforts = withGap && distanceM > 0 ? bestEfforts(cumulativeM, time, PR_DISTANCES_M) : [];

  const survivors = (cleanedLatLng ?? []).filter((p): p is LatLng => p !== null);

  return {
    distanceM,
    movingS,
    elevGainM: elevation.gainM,
    elevLossM: elevation.lossM,
    avgSpeedMs: speeds.avg,
    maxSpeedMs: speeds.max,
    avgHr: hrStats.avg,
    maxHr: hrStats.max,
    avgCadence: cadenceStats.avg,
    maxCadence: cadenceStats.max,
    avgPowerW: powerStats.avg,
    maxPowerW: powerStats.max,
    avgGapSecPerKm,
    calories: input.clientCalories ?? calories.kcal,
    calorieMethod: calories.method,
    hrZoneTimes,
    avgSwolf,
    totalStrokes,
    splits,
    efforts,
    cleanedLatLng,
    cleanedAltitude: elevation.smoothed,
    mapSummary: survivors.length > 0 ? downsample(survivors, MAP_SUMMARY_POINTS) : null,
    startLatLng: survivors[0] ?? null,
    endLatLng: survivors[survivors.length - 1] ?? null,
  };
}
