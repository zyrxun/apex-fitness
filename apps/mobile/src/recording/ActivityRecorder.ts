/**
 * The recording escape hatch (ADR 0001 §5, build task 3).
 *
 * Everything the app knows about recording an activity goes through this
 * interface. The Transistorsoft background-geolocation SDK, the BLE stack and
 * any future Nitro modules live *behind* an implementation of it and are
 * imported nowhere else. That constraint is the entire reason the ADR could
 * claim the expensive native part is portable — it only stays true if nothing
 * outside `src/recording/` ever reaches past this file.
 *
 * Types here reuse `@apex/shared` wherever the concept already exists on the
 * server, so a finished session serialises straight into the upload contract
 * (`createActivityBodySchema`) with no translation layer.
 */

import type { SportType, StreamsInput } from '@apex/shared';
import type { LatLng } from './geo';

/**
 * Session lifecycle.
 *
 * `idle` is the only state from which `start` is legal; `stopped` and
 * `discarded` are terminal for a given session. The native SDK's motion state
 * machine (auto-pause) surfaces as transitions between `recording` and
 * `paused` — callers cannot tell a user pause from an auto-pause here, and
 * deliberately so.
 */
export type RecorderState = 'idle' | 'recording' | 'paused' | 'stopped' | 'discarded';

/** Why the recorder paused — user action, or the SDK's stop-detection timer. */
export type PauseReason = 'user' | 'auto';

/**
 * One fix. Location and sensor values arrive on the same clock because the
 * recording core interleaves BLE samples into the location stream; every field
 * beyond `timestamp` is optional because sparsity is normal (an indoor ride has
 * no lat/lng, a swim has no power, a strap-less run has no heart rate).
 */
export interface RecordingSample {
  /** Epoch milliseconds, from the device clock at fix time. */
  timestamp: number;
  coords?: {
    latitude: number;
    longitude: number;
    /** Horizontal accuracy in metres; the smoothing stage gates on this. */
    accuracyM?: number;
    altitudeM?: number;
    speedMs?: number;
  };
  heartrateBpm?: number;
  cadence?: number;
  powerW?: number;
  /** False while the motion state machine considers the athlete stationary. */
  moving: boolean;
}

/** Live figures for the recording screen. Derived, never authoritative. */
export interface RecordingMetrics {
  elapsedS: number;
  movingS: number;
  distanceM: number;
  sampleCount: number;
  /** Metres per second over the last few fixes, or null before there are any. */
  currentSpeedMs: number | null;
}

/**
 * A recording, serialisable end to end so it can be written to MMKV/SQLite on
 * every fix and recovered after a crash or an OEM kill (ADR build task 4).
 */
export interface RecordingSession {
  id: string;
  sportType: SportType;
  state: RecorderState;
  /** Epoch ms. */
  startedAt: number;
  /** Epoch ms of the final sample, or null while still recording. */
  endedAt: number | null;
  samples: RecordingSample[];
  metrics: RecordingMetrics;
}

export interface StartOptions {
  sportType: SportType;
  /** Supply for deterministic ids in tests; otherwise the implementation mints one. */
  sessionId?: string;
}

/** Fired on every state transition so the UI never polls. */
export interface RecorderStateChange {
  state: RecorderState;
  previous: RecorderState;
  pauseReason?: PauseReason;
}

export type Unsubscribe = () => void;

export interface ActivityRecorder {
  /** Begins a new session. Rejects unless the recorder is `idle`. */
  start(options: StartOptions): Promise<RecordingSession>;
  /** User-initiated pause. Auto-pause arrives as a state change, not a call. */
  pause(): Promise<void>;
  resume(): Promise<void>;
  /** Ends the session and returns it for upload. Terminal. */
  stop(): Promise<RecordingSession>;
  /** Ends the session and throws the samples away. Terminal. */
  discard(): Promise<void>;

  getState(): RecorderState;
  /** The in-progress (or just-finished) session, or null if there is none. */
  getSession(): RecordingSession | null;

  /** Every fix, in order. */
  onSample(listener: (sample: RecordingSample) => void): Unsubscribe;
  /** Recomputed metrics, emitted at least once per sample. */
  onMetrics(listener: (metrics: RecordingMetrics) => void): Unsubscribe;
  onStateChange(listener: (change: RecorderStateChange) => void): Unsubscribe;

  /** Releases native resources / timers. Safe to call more than once. */
  destroy(): void;
}

/**
 * Project a finished session onto the server's index-aligned stream contract.
 *
 * Lives here rather than in a screen because the shape of a `RecordingSample`
 * is this module's business. The result is `streamsInputSchema`-shaped, so
 * `createActivityBodySchema.parse()` validates a recording client-side against
 * the exact rules the API enforces — the payoff ADR 0001 §3.5 bought.
 */
export function sessionToStreams(session: RecordingSession): StreamsInput {
  const t0 = session.samples[0]?.timestamp ?? session.startedAt;

  const time: number[] = [];
  const latlng: LatLng[] = [];
  const altitude: number[] = [];
  const heartrate: number[] = [];
  const moving: boolean[] = [];

  let anyLatLng = false;
  let anyAltitude = false;
  let anyHeartrate = false;

  for (const sample of session.samples) {
    time.push(Math.max(0, Math.round((sample.timestamp - t0) / 1000)));
    moving.push(sample.moving);

    if (sample.coords) {
      anyLatLng = true;
      latlng.push([sample.coords.latitude, sample.coords.longitude]);
      if (sample.coords.altitudeM !== undefined) anyAltitude = true;
      altitude.push(sample.coords.altitudeM ?? 0);
    } else {
      // Index alignment is a hard requirement of streamsInputSchema: a gap has
      // to be filled, not skipped.
      latlng.push([0, 0]);
      altitude.push(0);
    }

    if (sample.heartrateBpm !== undefined) anyHeartrate = true;
    heartrate.push(Math.round(sample.heartrateBpm ?? 0));
  }

  return {
    time,
    moving,
    ...(anyLatLng ? { latlng } : {}),
    ...(anyAltitude ? { altitude } : {}),
    ...(anyHeartrate ? { heartrate } : {}),
  };
}
