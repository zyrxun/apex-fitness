/**
 * A timer-driven fake recorder.
 *
 * ADR 0001 orders the recording core (build task 2) before any product UI, but
 * the native SDK needs a dev-client build and a device to prove anything. This
 * implementation exists so the screens above `ActivityRecorder` can be built,
 * reviewed and tested on a laptop, and so the interface itself is exercised by
 * something before the real implementation lands. It replays a small hardcoded
 * loop at a fixed ground speed; no native module, no permissions, no SDK.
 *
 * When `BackgroundGeolocationActivityRecorder` arrives it implements the same
 * interface and this file stays, unchanged, as the test double.
 */

import type {
  ActivityRecorder,
  RecorderState,
  RecorderStateChange,
  RecordingMetrics,
  RecordingSample,
  RecordingSession,
  StartOptions,
  Unsubscribe,
} from './ActivityRecorder';
import { haversineM, type LatLng } from './geo';

/**
 * Corners of a ~1 km loop in Auckland Domain, closed back on itself. Small
 * enough to read, long enough that a few minutes of recording stays on it.
 */
export const DEFAULT_LOOP: readonly LatLng[] = [
  [-36.8601, 174.7761],
  [-36.8601, 174.7801],
  [-36.8631, 174.7801],
  [-36.8631, 174.7761],
  [-36.8601, 174.7761],
];

export interface MockRecorderOptions {
  /** Wall-clock milliseconds between fixes. 1 Hz matches the real SDK's ceiling. */
  intervalMs?: number;
  /** Ground speed in m/s. 3.0 ≈ a 5:33/km run. */
  speedMs?: number;
  /** Waypoints of the loop to replay. Walked at `speedMs`, wrapping forever. */
  track?: readonly LatLng[];
  /** Resting heart rate the fake strap converges towards, in bpm. */
  heartrateBpm?: number;
  /** Injectable clock; defaults to `Date.now`. */
  now?: () => number;
}

interface Segment {
  from: LatLng;
  to: LatLng;
  lengthM: number;
}

/** Linear interpolation is fine at these distances — segments are metres, not degrees of arc. */
const interpolate = (from: LatLng, to: LatLng, fraction: number): LatLng => [
  from[0] + (to[0] - from[0]) * fraction,
  from[1] + (to[1] - from[1]) * fraction,
];

const buildSegments = (track: readonly LatLng[]): Segment[] => {
  const segments: Segment[] = [];
  for (let i = 1; i < track.length; i += 1) {
    const from = track[i - 1]!;
    const to = track[i]!;
    const lengthM = haversineM(from, to);
    if (lengthM > 0) segments.push({ from, to, lengthM });
  }
  if (segments.length === 0) throw new Error('MockActivityRecorder: track has no length');
  return segments;
};

let sessionCounter = 0;

export class MockActivityRecorder implements ActivityRecorder {
  readonly #intervalMs: number;
  readonly #speedMs: number;
  readonly #segments: Segment[];
  readonly #baseHeartrate: number;
  readonly #now: () => number;

  #state: RecorderState = 'idle';
  #session: RecordingSession | null = null;
  #timer: ReturnType<typeof setInterval> | null = null;

  #segmentIndex = 0;
  #segmentOffsetM = 0;
  #lastPoint: LatLng | null = null;
  #movingMs = 0;

  readonly #sampleListeners = new Set<(sample: RecordingSample) => void>();
  readonly #metricsListeners = new Set<(metrics: RecordingMetrics) => void>();
  readonly #stateListeners = new Set<(change: RecorderStateChange) => void>();

  constructor(options: MockRecorderOptions = {}) {
    this.#intervalMs = options.intervalMs ?? 1000;
    this.#speedMs = options.speedMs ?? 3.0;
    this.#segments = buildSegments(options.track ?? DEFAULT_LOOP);
    this.#baseHeartrate = options.heartrateBpm ?? 148;
    this.#now = options.now ?? Date.now;
  }

  start(options: StartOptions): Promise<RecordingSession> {
    if (this.#state !== 'idle') {
      return Promise.reject(new Error(`Cannot start while ${this.#state}`));
    }

    sessionCounter += 1;
    const startedAt = this.#now();

    this.#segmentIndex = 0;
    this.#segmentOffsetM = 0;
    this.#lastPoint = null;
    this.#movingMs = 0;

    this.#session = {
      id: options.sessionId ?? `mock-session-${sessionCounter}`,
      sportType: options.sportType,
      state: 'recording',
      startedAt,
      endedAt: null,
      samples: [],
      metrics: {
        elapsedS: 0,
        movingS: 0,
        distanceM: 0,
        sampleCount: 0,
        currentSpeedMs: null,
      },
    };

    this.#transition('recording');
    this.#startTimer();
    return Promise.resolve(this.#session);
  }

  pause(): Promise<void> {
    if (this.#state !== 'recording') {
      return Promise.reject(new Error(`Cannot pause while ${this.#state}`));
    }
    this.#stopTimer();
    this.#transition('paused', 'user');
    return Promise.resolve();
  }

  resume(): Promise<void> {
    if (this.#state !== 'paused') {
      return Promise.reject(new Error(`Cannot resume while ${this.#state}`));
    }
    this.#transition('recording');
    this.#startTimer();
    return Promise.resolve();
  }

  stop(): Promise<RecordingSession> {
    if (this.#state !== 'recording' && this.#state !== 'paused') {
      return Promise.reject(new Error(`Cannot stop while ${this.#state}`));
    }
    const session = this.#session!;
    this.#stopTimer();
    session.endedAt = session.samples.at(-1)?.timestamp ?? this.#now();
    this.#refreshMetrics();
    this.#transition('stopped');
    return Promise.resolve(session);
  }

  discard(): Promise<void> {
    if (this.#state === 'idle') return Promise.resolve();
    this.#stopTimer();
    if (this.#session) {
      this.#session.samples = [];
      this.#session.endedAt = this.#now();
    }
    this.#transition('discarded');
    this.#session = null;
    return Promise.resolve();
  }

  getState(): RecorderState {
    return this.#state;
  }

  getSession(): RecordingSession | null {
    return this.#session;
  }

  onSample(listener: (sample: RecordingSample) => void): Unsubscribe {
    this.#sampleListeners.add(listener);
    return () => this.#sampleListeners.delete(listener);
  }

  onMetrics(listener: (metrics: RecordingMetrics) => void): Unsubscribe {
    this.#metricsListeners.add(listener);
    return () => this.#metricsListeners.delete(listener);
  }

  onStateChange(listener: (change: RecorderStateChange) => void): Unsubscribe {
    this.#stateListeners.add(listener);
    return () => this.#stateListeners.delete(listener);
  }

  destroy(): void {
    this.#stopTimer();
    this.#sampleListeners.clear();
    this.#metricsListeners.clear();
    this.#stateListeners.clear();
  }

  // --- internals ---------------------------------------------------------

  #startTimer(): void {
    this.#stopTimer();
    this.#timer = setInterval(() => this.#tick(), this.#intervalMs);
    // Node keeps the process alive for a pending interval and a fake recorder
    // should never do that to a test run. No-op under React Native, where
    // setInterval returns a plain number.
    (this.#timer as unknown as { unref?: () => void }).unref?.();
  }

  #stopTimer(): void {
    if (this.#timer !== null) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
  }

  #transition(state: RecorderState, pauseReason?: RecorderStateChange['pauseReason']): void {
    const previous = this.#state;
    this.#state = state;
    if (this.#session) this.#session.state = state;
    const change: RecorderStateChange = pauseReason
      ? { state, previous, pauseReason }
      : { state, previous };
    for (const listener of this.#stateListeners) listener(change);
  }

  #tick(): void {
    const session = this.#session;
    if (!session || this.#state !== 'recording') return;

    const stepM = (this.#speedMs * this.#intervalMs) / 1000;
    const point = this.#advance(stepM);
    const timestamp = this.#now();

    // A gently wandering heart rate keeps the HR tile from looking broken and
    // stays inside the 0-300 bound streamsInputSchema enforces.
    const drift = Math.sin(session.samples.length / 12) * 8;

    const sample: RecordingSample = {
      timestamp,
      coords: {
        latitude: point[0],
        longitude: point[1],
        accuracyM: 5,
        altitudeM: 25,
        speedMs: this.#speedMs,
      },
      heartrateBpm: Math.round(this.#baseHeartrate + drift),
      moving: true,
    };

    session.samples.push(sample);
    this.#movingMs += this.#intervalMs;
    this.#refreshMetrics();

    for (const listener of this.#sampleListeners) listener(sample);
    for (const listener of this.#metricsListeners) listener(session.metrics);
  }

  /** Walks `stepM` along the loop, wrapping at the end, and returns the new position. */
  #advance(stepM: number): LatLng {
    let remaining = stepM;
    while (remaining > 0) {
      const segment = this.#segments[this.#segmentIndex]!;
      const left = segment.lengthM - this.#segmentOffsetM;
      if (remaining < left) {
        this.#segmentOffsetM += remaining;
        remaining = 0;
      } else {
        remaining -= left;
        this.#segmentIndex = (this.#segmentIndex + 1) % this.#segments.length;
        this.#segmentOffsetM = 0;
      }
    }
    const segment = this.#segments[this.#segmentIndex]!;
    return interpolate(segment.from, segment.to, this.#segmentOffsetM / segment.lengthM);
  }

  #refreshMetrics(): void {
    const session = this.#session;
    if (!session) return;

    const last = session.samples.at(-1);
    const previous = this.#lastPoint;
    let distanceM = session.metrics.distanceM;

    if (last?.coords) {
      const point: LatLng = [last.coords.latitude, last.coords.longitude];
      if (previous) distanceM += haversineM(previous, point);
      this.#lastPoint = point;
    }

    const endedAt = session.endedAt ?? this.#now();
    session.metrics = {
      elapsedS: Math.max(0, Math.round((endedAt - session.startedAt) / 1000)),
      movingS: Math.round(this.#movingMs / 1000),
      distanceM,
      sampleCount: session.samples.length,
      currentSpeedMs: last?.coords?.speedMs ?? null,
    };
  }
}
