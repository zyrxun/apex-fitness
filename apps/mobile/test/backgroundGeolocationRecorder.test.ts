/**
 * The state machine from ADR 0001 build task 2, exercised through a fake SDK.
 *
 * `BackgroundGeolocationRecorder` takes a `BackgroundGeolocationPort` rather
 * than reaching for `react-native-background-geolocation` itself, which is what
 * makes this file possible: it is plain Node, there is no react-native in the
 * import graph, and every transition the recorder can make is driven from here
 * instead of from a phone this machine cannot build for.
 *
 * The synthetic track runs due north at a constant longitude, so the haversine
 * reduces to R × Δlatitude and the expected distance is exact rather than
 * approximate — the same trick `apps/api`'s pipeline tests use.
 */

import { describe, expect, it } from 'vitest';
import { createActivityBodySchema } from '@apex/shared';

import { BackgroundGeolocationRecorder } from '../src/recording/BackgroundGeolocationRecorder';
import { createActivityRecorder } from '../src/recording/createActivityRecorder';
import { sessionToStreams } from '../src/recording/ActivityRecorder';
import type { RecorderStateChange, RecordingSample } from '../src/recording/ActivityRecorder';
import type {
  BackgroundGeolocationPort,
  GeoFix,
  GeoMotionChangeEvent,
  GeoReadyConfig,
  GeoSubscription,
} from '../src/recording/backgroundGeolocationPort';

// --- the fake SDK ---------------------------------------------------------

class FakeBackgroundGeolocation implements BackgroundGeolocationPort {
  readyConfig: GeoReadyConfig | null = null;
  /** Every call, in order, so tests can assert `ready` really preceded `start`. */
  readonly calls: string[] = [];
  readonly paceCalls: boolean[] = [];
  removedSubscriptions = 0;

  readonly #locationListeners = new Set<(fix: GeoFix) => void>();
  readonly #motionListeners = new Set<(event: GeoMotionChangeEvent) => void>();

  ready(config: GeoReadyConfig): Promise<unknown> {
    this.calls.push('ready');
    this.readyConfig = config;
    return Promise.resolve();
  }

  start(): Promise<unknown> {
    this.calls.push('start');
    return Promise.resolve();
  }

  stop(): Promise<unknown> {
    this.calls.push('stop');
    return Promise.resolve();
  }

  changePace(isMoving: boolean): Promise<unknown> {
    this.calls.push(`changePace:${isMoving}`);
    this.paceCalls.push(isMoving);
    return Promise.resolve();
  }

  onLocation(callback: (fix: GeoFix) => void): GeoSubscription {
    this.#locationListeners.add(callback);
    return {
      remove: () => {
        this.removedSubscriptions += 1;
        this.#locationListeners.delete(callback);
      },
    };
  }

  onMotionChange(callback: (event: GeoMotionChangeEvent) => void): GeoSubscription {
    this.#motionListeners.add(callback);
    return {
      remove: () => {
        this.removedSubscriptions += 1;
        this.#motionListeners.delete(callback);
      },
    };
  }

  get listenerCount(): number {
    return this.#locationListeners.size + this.#motionListeners.size;
  }

  emitLocation(fix: GeoFix): void {
    for (const listener of [...this.#locationListeners]) listener(fix);
  }

  emitMotionChange(isMoving: boolean, fix: GeoFix): void {
    for (const listener of [...this.#motionListeners]) listener({ isMoving, location: fix });
  }
}

// --- the synthetic track --------------------------------------------------

const EARTH_RADIUS_M = 6_371_008.8;
const BASE_LAT = -36.8601;
const BASE_LNG = 174.7761;
/** One `distanceFilter` hop. */
const STEP_M = 10;
/** 10 m every 3 s ≈ 3.33 m/s ≈ a 5:00/km run. */
const STEP_MS = 3_000;
const START_MS = Date.UTC(2026, 7, 7, 6, 0, 0);

const degreesForMetres = (metres: number): number => (metres / EARTH_RADIUS_M) * (180 / Math.PI);

interface FixOptions {
  moving?: boolean;
  sample?: boolean;
  speed?: number;
  accuracy?: number;
  /** Overrides the default ISO-8601 spelling. */
  timestamp?: string | number;
}

const fixAt = (index: number, options: FixOptions = {}): GeoFix => ({
  timestamp: options.timestamp ?? new Date(START_MS + index * STEP_MS).toISOString(),
  is_moving: options.moving ?? true,
  ...(options.sample === undefined ? {} : { sample: options.sample }),
  odometer: index * STEP_M,
  coords: {
    latitude: BASE_LAT + index * degreesForMetres(STEP_M),
    longitude: BASE_LNG,
    accuracy: options.accuracy ?? 5,
    altitude: 25,
    speed: options.speed ?? STEP_M / (STEP_MS / 1000),
  },
});

const build = (options: { debug?: boolean } = {}) => {
  const port = new FakeBackgroundGeolocation();
  const lines: string[] = [];
  const recorder = new BackgroundGeolocationRecorder(port, {
    distanceFilterM: STEP_M,
    stopTimeoutMin: 5,
    now: () => START_MS,
    log: (line) => lines.push(line),
    ...(options.debug === undefined ? {} : { debug: options.debug }),
  });
  return { port, recorder, lines };
};

// --- configuration --------------------------------------------------------

describe('BackgroundGeolocationRecorder.ready configuration', () => {
  it('sets every value ADR 0001 build task 2 names as the deliverable', async () => {
    const { port, recorder } = build();
    await recorder.start({ sportType: 'TrailRun', sessionId: 'cfg' });

    const config = port.readyConfig!;
    expect(config.geolocation?.distanceFilter).toBe(10);
    expect(config.geolocation?.stopTimeout).toBe(5);
    expect(config.app?.stopOnTerminate).toBe(false);
    expect(config.app?.startOnBoot).toBe(true);
    // -1 is DesiredAccuracy.High; nativeBackgroundGeolocation.ts holds the
    // compile-time proof that the literal still names that member.
    expect(config.geolocation?.desiredAccuracy).toBe(-1);
    // Stop-detection pauses a recording. It must never end one.
    expect(config.geolocation?.stopOnStationary).toBe(false);
  });

  it('carries no licence key of any kind', async () => {
    const { port, recorder } = build();
    await recorder.start({ sportType: 'Run' });

    // The SDK is free in DEBUG builds and a key is needed only for Android
    // release; proving task 2 must not depend on the $399 purchase.
    expect(JSON.stringify(port.readyConfig)).not.toMatch(/licen[cs]e/i);
  });

  it('readies before it starts, then forces the motion state moving', async () => {
    const { port, recorder } = build();
    await recorder.start({ sportType: 'Run' });

    expect(port.calls).toEqual(['ready', 'start', 'changePace:true']);
  });

  it('leaves the SDK debug mode off unless the build says otherwise', async () => {
    // `__DEV__` does not exist under Node, and debug mode is what makes the SDK
    // audible and verbose — it has no business defaulting on.
    const quiet = build();
    await quiet.recorder.start({ sportType: 'Run' });
    expect(quiet.port.readyConfig?.logger?.debug).toBe(false);
    expect(quiet.port.readyConfig?.logger?.logLevel).toBe(1);

    const loud = build({ debug: true });
    await loud.recorder.start({ sportType: 'Run' });
    expect(loud.port.readyConfig?.logger?.debug).toBe(true);
    expect(loud.port.readyConfig?.logger?.logLevel).toBe(5);
  });
});

// --- the stream -----------------------------------------------------------

describe('BackgroundGeolocationRecorder samples', () => {
  it('maps an SDK fix onto a RecordingSample and accumulates metrics', async () => {
    const { port, recorder } = build();
    const samples: RecordingSample[] = [];
    recorder.onSample((sample) => samples.push(sample));

    await recorder.start({ sportType: 'TrailRun', sessionId: 'stream' });
    for (let i = 0; i < 4; i += 1) port.emitLocation(fixAt(i));

    expect(samples).toHaveLength(4);
    expect(samples[0]).toMatchObject({
      timestamp: START_MS,
      moving: true,
      coords: { latitude: BASE_LAT, longitude: BASE_LNG, accuracyM: 5, altitudeM: 25 },
    });

    const metrics = recorder.getSession()!.metrics;
    // Three 10 m hops between four fixes; the first has no predecessor.
    expect(metrics.distanceM).toBeCloseTo(30, 6);
    expect(metrics.sampleCount).toBe(4);
    expect(metrics.movingS).toBe(9);
    expect(metrics.currentSpeedMs).toBeCloseTo(STEP_M / (STEP_MS / 1000), 6);
  });

  it('streams every fix to the log, which is the task 2 deliverable', async () => {
    const { port, recorder, lines } = build();
    await recorder.start({ sportType: 'Run' });
    port.emitLocation(fixAt(0));
    port.emitLocation(fixAt(1));

    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('#2');
    expect(lines[1]).toContain('moving');
    expect(lines[1]).toContain('10m');
  });

  it('accepts epoch timestamps as well as ISO ones, and survives neither', async () => {
    const { port, recorder } = build();
    await recorder.start({ sportType: 'Run' });

    port.emitLocation(fixAt(0, { timestamp: START_MS }));
    port.emitLocation(fixAt(1, { timestamp: 'not a date' }));

    const samples = recorder.getSession()!.samples;
    expect(samples[0]!.timestamp).toBe(START_MS);
    // A garbled timestamp falls back to the clock rather than poisoning the
    // session's arithmetic with NaN.
    expect(samples[1]!.timestamp).toBe(START_MS);
  });

  it('drops motion-detector probes and fixes with no speed', async () => {
    const { port, recorder } = build();
    await recorder.start({ sportType: 'Run' });

    port.emitLocation(fixAt(0, { sample: true }));
    expect(recorder.getSession()!.samples).toHaveLength(0);

    // -1 is CoreLocation's and FusedLocationProvider's "no speed for this fix".
    port.emitLocation(fixAt(0, { speed: -1 }));
    expect(recorder.getSession()!.samples[0]!.coords!.speedMs).toBeUndefined();
  });

  it('ignores fixes that arrive while paused', async () => {
    const { port, recorder } = build();
    await recorder.start({ sportType: 'Run' });
    port.emitLocation(fixAt(0));
    await recorder.pause();

    port.emitLocation(fixAt(1));
    port.emitLocation(fixAt(2));

    expect(recorder.getSession()!.samples).toHaveLength(1);
    expect(recorder.getSession()!.metrics.distanceM).toBe(0);
  });

  it('does not count the pause as moving time', async () => {
    const { port, recorder } = build();
    await recorder.start({ sportType: 'Run' });
    port.emitLocation(fixAt(0));
    port.emitLocation(fixAt(1));
    await recorder.pause();
    await recorder.resume();
    // Ten minutes of standing around between the pause and the next fix.
    port.emitLocation(fixAt(2, { timestamp: START_MS + 600_000 }));
    port.emitLocation(fixAt(3, { timestamp: START_MS + 603_000 }));

    // 3 s across the first pair and 3 s across the second; the gap is not moving.
    expect(recorder.getSession()!.metrics.movingS).toBe(6);
  });

  it('does not bridge distance across a pause', async () => {
    const { port, recorder } = build();
    await recorder.start({ sportType: 'Run' });
    port.emitLocation(fixAt(0));
    port.emitLocation(fixAt(1));
    await recorder.pause();
    await recorder.resume();
    // Resuming 5 km up the road: someone who paused and drove has not run it.
    port.emitLocation(fixAt(500));
    port.emitLocation(fixAt(501));

    expect(recorder.getSession()!.metrics.distanceM).toBeCloseTo(20, 6);
  });
});

// --- transitions ----------------------------------------------------------

describe('BackgroundGeolocationRecorder transitions', () => {
  it('auto-pauses and auto-resumes on the SDK motion state machine', async () => {
    const { port, recorder } = build();
    const changes: RecorderStateChange[] = [];
    recorder.onStateChange((change) => changes.push(change));

    await recorder.start({ sportType: 'Run' });
    port.emitLocation(fixAt(0));

    port.emitMotionChange(false, fixAt(1, { moving: false }));
    expect(recorder.getState()).toBe('paused');
    expect(changes.at(-1)).toEqual({ state: 'paused', previous: 'recording', pauseReason: 'auto' });

    port.emitMotionChange(true, fixAt(1));
    expect(recorder.getState()).toBe('recording');
    // Auto-pause never asks the SDK to change pace — the SDK is the one telling us.
    expect(port.paceCalls).toEqual([true]);
  });

  it('lets a user pause outrank the motion state machine', async () => {
    const { port, recorder } = build();
    await recorder.start({ sportType: 'Run' });
    await recorder.pause();

    expect(port.paceCalls).toEqual([true, false]);

    // Three steps at a road crossing must not restart a recording the athlete
    // deliberately paused.
    port.emitMotionChange(true, fixAt(1));
    expect(recorder.getState()).toBe('paused');

    await recorder.resume();
    expect(recorder.getState()).toBe('recording');
    expect(port.paceCalls).toEqual([true, false, true]);
  });

  it('does not re-announce a pause the SDK is merely echoing', async () => {
    const { port, recorder } = build();
    const changes: RecorderStateChange[] = [];
    await recorder.start({ sportType: 'Run' });
    recorder.onStateChange((change) => changes.push(change));

    await recorder.pause();
    port.emitMotionChange(false, fixAt(1, { moving: false }));

    expect(changes).toHaveLength(1);
  });

  it('stops the native service and closes the session', async () => {
    const { port, recorder } = build();
    await recorder.start({ sportType: 'TrailRun', sessionId: 'stop' });
    port.emitLocation(fixAt(0));
    port.emitLocation(fixAt(1));

    const session = await recorder.stop();

    expect(port.calls.at(-1)).toBe('stop');
    expect(recorder.getState()).toBe('stopped');
    expect(session.endedAt).toBe(START_MS + STEP_MS);
    expect(session.metrics.elapsedS).toBe(3);
    expect(session.state).toBe('stopped');
    // Ending a recording detaches from the SDK; nothing arrives afterwards.
    expect(port.listenerCount).toBe(0);
    port.emitLocation(fixAt(2));
    expect(session.samples).toHaveLength(2);
  });

  it('discards a session without leaving samples behind', async () => {
    const { port, recorder } = build();
    await recorder.start({ sportType: 'Run' });
    port.emitLocation(fixAt(0));

    await recorder.discard();

    expect(recorder.getState()).toBe('discarded');
    expect(recorder.getSession()).toBeNull();
    expect(port.calls.at(-1)).toBe('stop');
    expect(port.listenerCount).toBe(0);
  });

  it('refuses illegal transitions', async () => {
    const { recorder } = build();
    await expect(recorder.pause()).rejects.toThrow(/Cannot pause while idle/);
    await expect(recorder.resume()).rejects.toThrow(/Cannot resume while idle/);
    await expect(recorder.stop()).rejects.toThrow(/Cannot stop while idle/);

    await recorder.start({ sportType: 'Run' });
    await expect(recorder.start({ sportType: 'Run' })).rejects.toThrow(
      /Cannot start while recording/,
    );
    await expect(recorder.resume()).rejects.toThrow(/Cannot resume while recording/);

    await recorder.stop();
    await expect(recorder.stop()).rejects.toThrow(/Cannot stop while stopped/);
  });

  it('discards from idle without touching the SDK', async () => {
    const { port, recorder } = build();
    await recorder.discard();
    expect(port.calls).toEqual([]);
  });

  it('is destroyable more than once, and leaves the recording running', async () => {
    const { port, recorder } = build();
    await recorder.start({ sportType: 'Run' });

    recorder.destroy();
    recorder.destroy();

    expect(port.listenerCount).toBe(0);
    expect(port.removedSubscriptions).toBe(2);
    // `stopOnTerminate: false` exists so a recording outlives the screen that
    // started it. Unmounting a screen is not the athlete finishing their run.
    expect(port.calls).not.toContain('stop');
  });
});

// --- the server contract --------------------------------------------------

describe('a background-geolocation recording against the server contract', () => {
  it('produces a payload createActivityBodySchema accepts', async () => {
    const { port, recorder } = build();
    await recorder.start({ sportType: 'TrailRun', sessionId: 'contract' });
    for (let i = 0; i < 60; i += 1) port.emitLocation(fixAt(i));
    const session = await recorder.stop();

    const streams = sessionToStreams(session);
    const parsed = createActivityBodySchema.safeParse({
      uploadId: 'c4d1b8a2-3e5f-4b6c-9a7d-2f8e1c0b4a35',
      sportType: session.sportType,
      name: 'Background geolocation recording',
      startedAt: new Date(session.startedAt).toISOString().replace('Z', '+00:00'),
      timezone: 'Pacific/Auckland',
      elapsedS: session.metrics.elapsedS,
      movingS: session.metrics.movingS,
      distanceM: session.metrics.distanceM,
      streams,
    });

    expect(parsed.success ? [] : parsed.error.issues).toEqual([]);
    expect(streams.time.length).toBe(60);
    expect(streams.latlng?.length).toBe(60);
    expect(streams.altitude?.length).toBe(60);
    // No BLE strap yet (ADR build task 9), so the heart rate stream is absent
    // rather than zero-filled.
    expect(streams.heartrate).toBeUndefined();
  });
});

// --- implementation selection ---------------------------------------------

describe('createActivityRecorder', () => {
  it('falls back to the mock when there is no native module, and says why', () => {
    // This is the Node case, but it is also Expo Go and any checkout that has
    // not run `expo prebuild` — the fallback is a product requirement, not a
    // test convenience.
    const active = createActivityRecorder({ mock: { intervalMs: 1000 } });

    expect(active.implementation).toBe('mock');
    expect(active.fallbackReason).toBeTruthy();
    expect(active.recorder.getState()).toBe('idle');
    active.recorder.destroy();
  });

  it('honours an explicit request for the mock without probing', () => {
    const active = createActivityRecorder({ prefer: 'mock' });
    expect(active.implementation).toBe('mock');
    expect(active.fallbackReason).toBeNull();
    active.recorder.destroy();
  });

  it('throws rather than silently faking when the real recorder is demanded', () => {
    expect(() => createActivityRecorder({ prefer: 'background-geolocation' })).toThrow(
      /react-native-background-geolocation is unavailable/,
    );
  });
});
