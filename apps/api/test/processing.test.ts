import { describe, expect, it } from 'vitest';
import { M_PER_MILE } from '@apex/shared';
import { seriesStats, speedStats } from '../src/processing/aggregates.js';
import { estimateCalories } from '../src/processing/calories.js';
import { computeElevation } from '../src/processing/elevation.js';
import { bestEffortForDistance, bestEfforts } from '../src/processing/efforts.js';
import {
  averageGapSecPerKm,
  gradeAdjustedSeconds,
  gradeAdjustmentFactor,
  minettiCost,
} from '../src/processing/gap.js';
import { encodePolyline, haversineM } from '../src/processing/geo.js';
import { cleanGpsTrack, distanceFromTrack } from '../src/processing/gps.js';
import { resolveMaxHr, timeInZones } from '../src/processing/hr-zones.js';
import { detectMovingTime } from '../src/processing/moving.js';
import {
  planZoneRedaction,
  redactPositions,
  survivingPoints,
  zoneFuzzM,
} from '../src/processing/privacy-zones.js';
import { movingAverage, movingMedian } from '../src/processing/smoothing.js';
import { computeSplits } from '../src/processing/splits.js';
import { computeSwimStats } from '../src/processing/swim.js';
import { runPipeline } from '../src/processing/pipeline.js';
import { buildTrack, M_PER_DEG_LAT } from './fixtures/track.js';

const zones = {
  maxHr: 200,
  maxHrSource: 'configured' as const,
  boundariesPct: [50, 60, 70, 80, 90],
};

const pipelineDefaults = {
  hrZones: zones,
  athlete: { bodyweightKg: 70, sex: 'male' as const, ageYears: 35 },
};

describe('geo', () => {
  it('measures a known great-circle distance', () => {
    // One degree of latitude at constant longitude.
    expect(haversineM([0, 0], [1, 0])).toBeCloseTo(M_PER_DEG_LAT, 3);
    expect(haversineM([-36.85, 174.76], [-36.85, 174.76])).toBe(0);
  });

  it('encodes a polyline the way Google documents it', () => {
    expect(
      encodePolyline([
        [38.5, -120.2],
        [40.7, -120.95],
        [43.252, -126.453],
      ]),
    ).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  });
});

describe('smoothing', () => {
  it('leaves a linear ramp untouched, including the endpoints', () => {
    const ramp = [0, 1, 2, 3, 4, 5, 6];
    expect(movingMedian(ramp, 5)).toEqual(ramp);
    expect(movingAverage(ramp, 5)).toEqual(ramp);
  });

  it('rejects a single spike the mean would smear', () => {
    const withSpike = [10, 10, 900, 10, 10];
    expect(movingMedian(withSpike, 5)[2]).toBe(10);
    expect(movingAverage(withSpike, 5)[2]).toBeGreaterThan(100);
  });
});

describe('GPS cleanup', () => {
  it('drops a fix that would require impossible speed and keeps the rest', () => {
    const track = buildTrack({ samples: 20, speedMs: 3 });
    const latlng: [number, number][] = [...track.latlng];
    latlng[10] = [latlng[10]![0] + 1, latlng[10]![1]]; // ~111 km sideways in 1 s

    const result = cleanGpsTrack({ latlng, time: track.time, maxSpeedMs: 12.5 });
    expect(result.droppedIndices).toContain(10);
    expect(result.cleaned[10]).toBeNull();
    expect(result.cleaned[9]).not.toBeNull();
    expect(result.cleaned[11]).not.toBeNull();
  });

  it('measures a clean straight-line track to its true length', () => {
    const track = buildTrack({ samples: 601, speedMs: 3 });
    const { cleaned } = cleanGpsTrack({
      latlng: track.latlng,
      time: track.time,
      maxSpeedMs: 12.5,
    });
    const measured = distanceFromTrack(cleaned);
    expect(measured.totalM).toBeCloseTo(track.distanceM, 3);
  });
});

describe('moving time', () => {
  it('excludes a stationary gap', () => {
    const track = buildTrack({ samples: 301, speedMs: 3, pause: { from: 100, to: 200 } });
    const { cumulativeM } = distanceFromTrack(track.latlng);
    const result = detectMovingTime(cumulativeM, track.time, 0.5);

    expect(track.elapsedS).toBe(300);
    expect(result.movingS).toBe(track.movingS);
    expect(result.movingS).toBe(200);
    expect(result.moving[150]).toBe(false);
    expect(result.moving[250]).toBe(true);
  });
});

describe('elevation', () => {
  it('reports zero gain for a flat road under barometric noise', () => {
    const track = buildTrack({
      samples: 600,
      altitudeAt: () => 100,
      altitudeNoiseM: 3, // +/-1.5 m, i.e. inside the hysteresis band
    });
    const result = computeElevation(track.altitude!);
    expect(result.gainM).toBe(0);
    expect(result.lossM).toBe(0);
  });

  it('counts a real climb and the descent back down', () => {
    // Up 100 m over 300 samples, then back down.
    const track = buildTrack({
      samples: 601,
      altitudeAt: (i) => (i <= 300 ? i / 3 : (600 - i) / 3),
    });
    const result = computeElevation(track.altitude!);
    expect(result.gainM).toBeGreaterThan(95);
    expect(result.gainM).toBeLessThan(101);
    expect(result.lossM).toBeGreaterThan(95);
    expect(result.lossM).toBeLessThan(101);
  });
});

describe('grade adjusted pace', () => {
  it('is flat-neutral and costs more per metre uphill than down', () => {
    expect(gradeAdjustmentFactor(0)).toBeCloseTo(1, 6);
    expect(minettiCost(0.1)).toBeGreaterThan(minettiCost(0));
    expect(minettiCost(-0.1)).toBeLessThan(minettiCost(0));
  });

  it('credits an uphill kilometre with a faster equivalent flat time', () => {
    const elapsedS = 300;
    const uphill = gradeAdjustedSeconds(1000, elapsedS, 50)!;
    const flat = gradeAdjustedSeconds(1000, elapsedS, 0)!;
    const downhill = gradeAdjustedSeconds(1000, elapsedS, -50)!;

    // Equivalent flat effort: the same clock time uphill represents a faster
    // runner, so the adjusted seconds (and therefore sec/km) drop.
    expect(uphill).toBeLessThan(flat);
    expect(flat).toBeCloseTo(elapsedS, 6);
    expect(downhill).toBeGreaterThan(uphill);
  });

  it('averages segment-wise rather than over the mean gradient', () => {
    const gap = averageGapSecPerKm([
      { distanceM: 1000, elapsedS: 300, elevationChangeM: 50 },
      { distanceM: 1000, elapsedS: 300, elevationChangeM: -50 },
    ])!;
    // Rolling out-and-back is harder than a flat 2 km at the same clock pace.
    expect(gap).toBeLessThan(300);
  });
});

describe('splits', () => {
  it('sums back to the activity totals', () => {
    const track = buildTrack({ samples: 1201, speedMs: 3, altitudeAt: (i) => i / 12 });
    const { cumulativeM } = distanceFromTrack(track.latlng);
    const moving = new Array(track.time.length).fill(true);
    const altitude = track.altitude!.map((a) => a);

    for (const unitM of [1000, M_PER_MILE]) {
      const splits = computeSplits({
        cumulativeM,
        time: track.time,
        moving,
        altitude,
        heartrate: new Array(track.time.length).fill(null),
        unitM,
        withGap: true,
      });
      const distance = splits.reduce((sum, s) => sum + s.distanceM, 0);
      const elapsed = splits.reduce((sum, s) => sum + s.elapsedS, 0);
      expect(distance).toBeCloseTo(track.distanceM, 6);
      expect(elapsed).toBeCloseTo(track.elapsedS, 6);
    }
  });

  it('averages heart rate per split, not across the activity', () => {
    const track = buildTrack({
      samples: 1201,
      speedMs: 3,
      heartrateAt: (i) => (i < 400 ? 120 : 170),
    });
    const { cumulativeM } = distanceFromTrack(track.latlng);
    const splits = computeSplits({
      cumulativeM,
      time: track.time,
      moving: new Array(track.time.length).fill(true),
      altitude: new Array(track.time.length).fill(null),
      heartrate: track.heartrate!,
      unitM: 1000,
      withGap: false,
    });
    expect(splits[0]!.avgHr).toBeCloseTo(120, 0);
    expect(splits[2]!.avgHr).toBeCloseTo(170, 0);
  });
});

describe('aggregates', () => {
  it('skips nulls and reports the max', () => {
    expect(seriesStats([10, null, 20, undefined, 30])).toEqual({ avg: 20, max: 30 });
    expect(seriesStats([null, null])).toEqual({ avg: null, max: null });
  });

  it('derives average speed from distance over moving time', () => {
    const stats = speedStats([0, 3, 3, 3], [false, true, true, true], 900, 300);
    expect(stats.avg).toBeCloseTo(3, 6);
  });
});

describe('heart-rate zones', () => {
  it('falls back to 220 minus age before any explicit max', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    expect(resolveMaxHr(185, '1990-01-01', now)).toEqual({ maxHr: 185, source: 'configured' });
    expect(resolveMaxHr(null, '1990-01-01', now)).toEqual({ maxHr: 184, source: 'age_estimate' });
    expect(resolveMaxHr(null, null, now).source).toBe('default');
  });

  it('buckets time by zone and ignores samples below zone 1', () => {
    const time = Array.from({ length: 100 }, (_, i) => i);
    const heartrate = time.map((i) => (i < 50 ? 80 : 150)); // 40% then 75% of 200
    const buckets = timeInZones(heartrate, time, zones);

    expect(buckets).toHaveLength(5);
    expect(buckets.find((b) => b.zone === 3)!.seconds).toBe(50); // 150 bpm = 75%
    expect(buckets.find((b) => b.zone === 1)!.seconds).toBe(0); // 80 bpm is below z1
    expect(buckets.reduce((sum, b) => sum + b.seconds, 0)).toBe(50);
  });
});

describe('swim', () => {
  it('computes SWOLF normalised to a 25 m pool', () => {
    const lengths = [
      { durationS: 30, strokeCount: 20 },
      { durationS: 32, strokeCount: 22 },
    ];
    const stats = computeSwimStats(lengths, 25);
    expect(stats.distanceM).toBe(50);
    expect(stats.totalStrokes).toBe(42);
    expect(stats.avgSwolf).toBeCloseTo(52, 6); // (50 + 54) / 2

    // A 50 m pool halves the per-length count, so the score is scaled to 25 m.
    const long = computeSwimStats([{ durationS: 60, strokeCount: 40 }], 50);
    expect(long.avgSwolf).toBeCloseTo(50, 6);
    expect(long.distanceM).toBe(50);
  });

  it('ignores lengths with no stroke count rather than scoring them zero', () => {
    const stats = computeSwimStats(
      [
        { durationS: 30, strokeCount: 20 },
        { durationS: 30, strokeCount: null },
      ],
      25,
    );
    expect(stats.avgSwolf).toBeCloseTo(50, 6);
  });
});

describe('calories', () => {
  it('prefers the heart-rate regression when a heart rate exists', () => {
    const withHr = estimateCalories({
      durationS: 3600,
      baseMet: 9.8,
      bodyweightKg: 70,
      avgHr: 150,
      ageYears: 35,
      sex: 'male',
    });
    expect(withHr.method).toBe('heart_rate');
    expect(withHr.kcal).toBeGreaterThan(400);
    expect(withHr.kcal).toBeLessThan(1200);
  });

  it('falls back to MET times kilograms times hours', () => {
    const met = estimateCalories({
      durationS: 3600,
      baseMet: 10,
      bodyweightKg: 70,
      avgHr: null,
      ageYears: null,
      sex: 'unspecified',
    });
    expect(met).toEqual({ kcal: 700, method: 'met' });
  });
});

describe('best efforts', () => {
  it('finds the fastest rolling window, not the first one', () => {
    // 20 minutes at 3 m/s with a 1 km surge at 5 m/s in the middle.
    const cumulativeM: number[] = [0];
    const time: number[] = [0];
    for (let i = 1; i <= 1200; i += 1) {
      const speed = i > 600 && i <= 800 ? 5 : 3;
      cumulativeM.push(cumulativeM[i - 1]! + speed);
      time.push(i);
    }

    const best = bestEffortForDistance(cumulativeM, time, 1000)!;
    expect(best.elapsedS).toBeCloseTo(200, 0);
    expect(best.startIndex).toBeGreaterThan(500);

    const all = bestEfforts(cumulativeM, time, [1000, 5000, 42195]);
    expect(all.map((e) => e.distanceM)).toEqual([1000]); // nothing longer was run
  });

  it('returns nothing when the activity is shorter than the distance', () => {
    expect(bestEffortForDistance([0, 100, 200], [0, 1, 2], 1000)).toBeNull();
  });
});

describe('privacy zones', () => {
  const home = { id: 'zone-1', centerLat: -36.85, centerLng: 174.76, radiusM: 300 };

  it('derives a stable fuzz distance from the persisted seed', () => {
    const a = zoneFuzzM(123456, home.id);
    const b = zoneFuzzM(123456, home.id);
    const other = zoneFuzzM(123457, home.id);
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(200);
    expect(other).not.toBe(a);
  });

  it('redacts every point inside the zone plus the fuzz margin', () => {
    const track = buildTrack({ samples: 601, speedMs: 3, startLat: home.centerLat });
    const plan = planZoneRedaction(track.latlng, [home], 99);

    expect(plan.anyRedacted).toBe(true);
    expect(plan.redacted[0]).toBe(true);

    const fuzz = zoneFuzzM(99, home.id);
    const cutoff = Math.ceil((home.radiusM + fuzz) / 3);
    expect(plan.redacted[cutoff + 2]).toBe(false);
    // Nothing beyond the zone is touched.
    expect(plan.redacted[600]).toBe(false);
  });

  it('nulls redacted samples in place and drops them from the polyline', () => {
    const track = buildTrack({ samples: 400, speedMs: 3, startLat: home.centerLat });
    const plan = planZoneRedaction(track.latlng, [home], 7);
    const redacted = redactPositions(track.latlng, plan);

    expect(redacted).toHaveLength(track.latlng.length);
    expect(redacted[0]).toBeNull();
    expect(redacted[399]).toEqual(track.latlng[399]);
    expect(survivingPoints(track.latlng, plan).length).toBeLessThan(track.latlng.length);
  });

  it('leaves a track that never enters a zone completely alone', () => {
    const track = buildTrack({ samples: 100, startLat: -37.5 });
    const plan = planZoneRedaction(track.latlng, [home], 7);
    expect(plan.anyRedacted).toBe(false);
    expect(plan.redacted.some(Boolean)).toBe(false);
  });
});

describe('pipeline', () => {
  it('derives distance, moving time and splits from a synthetic run', () => {
    const track = buildTrack({
      samples: 1201,
      speedMs: 3,
      altitudeAt: (i) => i / 12,
      heartrateAt: () => 150,
    });

    const result = runPipeline({
      ...pipelineDefaults,
      sportType: 'Run',
      elapsedS: track.elapsedS,
      streams: {
        time: track.time,
        latlng: track.latlng,
        altitude: track.altitude,
        heartrate: track.heartrate,
      },
    });

    expect(result.distanceM).toBeCloseTo(3600, 1);
    expect(result.movingS).toBe(1200);
    expect(result.avgSpeedMs).toBeCloseTo(3, 2);
    expect(result.avgHr).toBe(150);
    expect(result.elevGainM).toBeCloseTo(100, 0);
    expect(result.elevLossM).toBe(0);
    expect(result.splits.filter((s) => s.unit === 'km')).toHaveLength(4);
    expect(result.splits.filter((s) => s.unit === 'mile')).toHaveLength(3);
    // Steady 2.8% climb: the same clock pace is worth a faster flat equivalent.
    const rawPaceSecPerKm = (result.movingS / result.distanceM) * 1000;
    expect(rawPaceSecPerKm).toBeCloseTo(333.3, 0);
    expect(result.avgGapSecPerKm!).toBeLessThan(rawPaceSecPerKm);
    expect(result.efforts.map((e) => e.distanceM)).toEqual([1000]);
    expect(result.mapSummary!.length).toBeLessThanOrEqual(200);
    expect(result.hrZoneTimes!.find((b) => b.zone === 3)!.seconds).toBeGreaterThan(1000);
  });

  it('trusts the client distance when there is no GPS', () => {
    const time = Array.from({ length: 1800 }, (_, i) => i);
    const result = runPipeline({
      ...pipelineDefaults,
      sportType: 'VirtualRide',
      elapsedS: 1799,
      clientDistanceM: 15_000,
      streams: { time },
    });
    expect(result.distanceM).toBe(15_000);
    expect(result.splits.filter((s) => s.unit === 'km')).toHaveLength(15);
  });

  it('lets pool lengths, not GPS, define a swim', () => {
    const result = runPipeline({
      ...pipelineDefaults,
      sportType: 'Swim',
      elapsedS: 1200,
      poolLengthM: 25,
      swimLengths: Array.from({ length: 40 }, () => ({
        stroke: 'freestyle' as const,
        durationS: 28,
        strokeCount: 18,
      })),
    });
    expect(result.distanceM).toBe(1000);
    expect(result.avgSwolf).toBeCloseTo(46, 6);
    expect(result.totalStrokes).toBe(720);
    expect(result.avgGapSecPerKm).toBeNull();
  });
});
