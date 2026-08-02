import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActivityBodySchema, SPORT_TYPES, sportHasGps } from '@apex/shared';

import {
  DEFAULT_LOOP,
  MockActivityRecorder,
  haversineM,
  sessionToStreams,
  trackDistanceM,
  type RecordingMetrics,
} from '../src/recording';

const record = async (seconds: number, recorder: MockActivityRecorder) => {
  await recorder.start({ sportType: 'TrailRun', sessionId: 'test-session' });
  await vi.advanceTimersByTimeAsync(seconds * 1000);
  return recorder.stop();
};

describe('haversineM', () => {
  it('measures the hardcoded loop as a closed circuit of plausible length', () => {
    const perimeter = trackDistanceM(DEFAULT_LOOP);
    expect(perimeter).toBeGreaterThan(1_000);
    expect(perimeter).toBeLessThan(1_600);
    // First and last waypoint are the same point, so the loop closes.
    expect(haversineM(DEFAULT_LOOP[0]!, DEFAULT_LOOP.at(-1)!)).toBe(0);
  });
});

describe('MockActivityRecorder', () => {
  let recorder: MockActivityRecorder;

  beforeEach(() => {
    vi.useFakeTimers();
    recorder = new MockActivityRecorder({ intervalMs: 1000, speedMs: 3 });
  });

  afterEach(() => {
    recorder.destroy();
    vi.useRealTimers();
  });

  it('emits monotonically increasing distance while recording', async () => {
    const seen: RecordingMetrics[] = [];
    recorder.onMetrics((m) => seen.push({ ...m }));

    await record(10, recorder);

    expect(seen.length).toBe(10);
    for (let i = 1; i < seen.length; i += 1) {
      expect(seen[i]!.distanceM).toBeGreaterThan(seen[i - 1]!.distanceM);
      expect(seen[i]!.elapsedS).toBeGreaterThanOrEqual(seen[i - 1]!.elapsedS);
    }
    // 3 m/s for 10 s, minus the first fix which has no predecessor to measure from.
    expect(seen.at(-1)!.distanceM).toBeGreaterThan(20);
    expect(seen.at(-1)!.distanceM).toBeLessThan(30);
  });

  it('stays on the loop across more than one lap', async () => {
    // ~2100 m at 3 m/s, on a loop of ~1.4 km: this wraps, which is the part
    // most likely to be wrong. The loop is a rectangle, so "on the track" is
    // checkable exactly rather than approximately.
    const session = await record(700, recorder);

    const lats = DEFAULT_LOOP.map((p) => p[0]);
    const lngs = DEFAULT_LOOP.map((p) => p[1]);
    const bounds = {
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
      minLng: Math.min(...lngs),
      maxLng: Math.max(...lngs),
    };

    expect(session.samples.length).toBe(700);
    for (const sample of session.samples) {
      const { latitude, longitude } = sample.coords!;
      expect(latitude).toBeGreaterThanOrEqual(bounds.minLat);
      expect(latitude).toBeLessThanOrEqual(bounds.maxLat);
      expect(longitude).toBeGreaterThanOrEqual(bounds.minLng);
      expect(longitude).toBeLessThanOrEqual(bounds.maxLng);
    }

    // Distance keeps accumulating past one lap instead of resetting at the wrap.
    expect(session.metrics.distanceM).toBeGreaterThan(trackDistanceM(DEFAULT_LOOP));
  });

  it('stops the clock while paused and keeps the samples on resume', async () => {
    await recorder.start({ sportType: 'Run' });
    await vi.advanceTimersByTimeAsync(5_000);
    const afterFirstLeg = recorder.getSession()!.metrics.distanceM;

    await recorder.pause();
    expect(recorder.getState()).toBe('paused');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(recorder.getSession()!.samples.length).toBe(5);
    expect(recorder.getSession()!.metrics.distanceM).toBe(afterFirstLeg);

    await recorder.resume();
    await vi.advanceTimersByTimeAsync(5_000);
    const session = await recorder.stop();

    expect(session.samples.length).toBe(10);
    expect(session.metrics.distanceM).toBeGreaterThan(afterFirstLeg);
    // Elapsed is wall clock and therefore includes the pause; moving time is not.
    expect(session.metrics.movingS).toBe(10);
    expect(session.metrics.elapsedS).toBeGreaterThan(session.metrics.movingS);
  });

  it('refuses illegal transitions', async () => {
    await expect(recorder.pause()).rejects.toThrow(/Cannot pause while idle/);
    await expect(recorder.stop()).rejects.toThrow(/Cannot stop while idle/);
    await recorder.start({ sportType: 'Run' });
    await expect(recorder.start({ sportType: 'Run' })).rejects.toThrow(
      /Cannot start while recording/,
    );
  });

  it('discards a session without leaving samples behind', async () => {
    await recorder.start({ sportType: 'Run' });
    await vi.advanceTimersByTimeAsync(5_000);
    await recorder.discard();

    expect(recorder.getState()).toBe('discarded');
    expect(recorder.getSession()).toBeNull();
  });
});

describe('a mock recording against the server contract', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('produces a payload createActivityBodySchema accepts', async () => {
    const recorder = new MockActivityRecorder({ intervalMs: 1000, speedMs: 3.2 });
    const session = await record(120, recorder);
    recorder.destroy();

    const streams = sessionToStreams(session);

    const parsed = createActivityBodySchema.safeParse({
      uploadId: '0f4a9d2c-1f7e-4a4b-9d3a-8c1b2e5f6a70',
      sportType: session.sportType,
      name: 'Mock recording',
      startedAt: new Date(session.startedAt).toISOString().replace('Z', '+00:00'),
      timezone: 'Pacific/Auckland',
      elapsedS: session.metrics.elapsedS,
      movingS: session.metrics.movingS,
      distanceM: session.metrics.distanceM,
      streams,
    });

    // The failure message matters more than the boolean when this breaks.
    expect(parsed.success ? [] : parsed.error.issues).toEqual([]);
    expect(streams.time.length).toBe(session.samples.length);
    expect(streams.latlng?.length).toBe(session.samples.length);
    expect(streams.heartrate?.length).toBe(session.samples.length);
  });

  it('records a sport the shared taxonomy agrees is GPS-backed', () => {
    expect(SPORT_TYPES).toContain('TrailRun');
    expect(sportHasGps('TrailRun')).toBe(true);
  });
});
