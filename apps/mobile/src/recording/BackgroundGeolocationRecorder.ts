/**
 * The real recorder: ADR 0001 §8 build task 2.
 *
 * Transistorsoft's SDK owns the hard part — a native motion state machine that
 * decides when the athlete is moving, a foreground service that survives the
 * screen going off, and a SQLite buffer that survives the app being killed.
 * This class owns the part the SDK cannot know about: what a *session* is, when
 * a pause was the user's idea rather than the stop-detector's, and which
 * numbers the recording screen shows.
 *
 * It reaches the SDK only through `BackgroundGeolocationPort`, so everything
 * below runs in Node under vitest against a fake. The one file that names
 * `react-native-background-geolocation` is `nativeBackgroundGeolocation.ts`,
 * and `createActivityRecorder` is what decides whether to load it.
 *
 * `MockActivityRecorder` remains the sibling implementation; the two are kept
 * deliberately parallel (same private-field layout, same illegal-transition
 * messages) so a test written against one reads correctly against the other.
 */

import type {
  ActivityRecorder,
  PauseReason,
  RecorderState,
  RecorderStateChange,
  RecordingMetrics,
  RecordingSample,
  RecordingSession,
  StartOptions,
  Unsubscribe,
} from './ActivityRecorder';
import type {
  BackgroundGeolocationPort,
  GeoFix,
  GeoMotionChangeEvent,
  GeoReadyConfig,
  GeoSubscription,
} from './backgroundGeolocationPort';
import {
  GEO_ACTIVITY_TYPE_FITNESS,
  GEO_DESIRED_ACCURACY_HIGH,
  GEO_LOG_LEVEL_ERROR,
  GEO_LOG_LEVEL_VERBOSE,
} from './backgroundGeolocationPort';
import { haversineM, type LatLng } from './geo';

export interface BackgroundGeolocationRecorderOptions {
  /**
   * Metres of movement between fixes. 10 m is roughly 3 s of running and 1 s of
   * riding: dense enough to draw a track, sparse enough that the SDK can idle
   * its GPS between them. ADR build task 6 revisits this with real soak data.
   */
  distanceFilterM?: number;
  /**
   * Minutes of stillness before the SDK declares the athlete stopped. This
   * timer *is* auto-pause — there is no separate auto-pause setting.
   */
  stopTimeoutMin?: number;
  /**
   * The SDK's `debug` mode: verbose logs plus audible motion-change cues. The
   * SDK is licence-free in DEBUG builds only, so this defaults to whatever
   * `__DEV__` says and should never be forced on in a release.
   */
  debug?: boolean;
  /** Text on the Android foreground-service notification. */
  notification?: { title?: string; text?: string };
  /** Injectable clock; defaults to `Date.now`. */
  now?: () => number;
  /**
   * Where fixes are streamed. The task 2 deliverable is "points streaming to
   * console", so that is the default; tests pass a spy to keep output quiet.
   */
  log?: (line: string) => void;
}

const DEFAULT_DISTANCE_FILTER_M = 10;
const DEFAULT_STOP_TIMEOUT_MIN = 5;

/** `__DEV__` is a React Native global and simply absent under Node. */
const isDebugBuild = (): boolean => (globalThis as { __DEV__?: boolean }).__DEV__ === true;

/**
 * The SDK's timestamp format is a config option, so both spellings have to be
 * handled; an unparseable one falls back to the caller's clock rather than
 * poisoning the whole session with `NaN`.
 */
const toEpochMs = (timestamp: string | number, fallback: () => number): number => {
  if (typeof timestamp === 'number') return Number.isFinite(timestamp) ? timestamp : fallback();
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? fallback() : parsed;
};

let sessionCounter = 0;

export class BackgroundGeolocationRecorder implements ActivityRecorder {
  readonly #port: BackgroundGeolocationPort;
  readonly #distanceFilterM: number;
  readonly #stopTimeoutMin: number;
  readonly #debug: boolean;
  readonly #notification: { title: string; text: string };
  readonly #now: () => number;
  readonly #log: (line: string) => void;

  #state: RecorderState = 'idle';
  #session: RecordingSession | null = null;
  #pauseReason: PauseReason | null = null;
  #ready: Promise<void> | null = null;
  #subscriptions: GeoSubscription[] = [];

  #lastPoint: LatLng | null = null;
  #lastMovingAt: number | null = null;
  #movingMs = 0;

  readonly #sampleListeners = new Set<(sample: RecordingSample) => void>();
  readonly #metricsListeners = new Set<(metrics: RecordingMetrics) => void>();
  readonly #stateListeners = new Set<(change: RecorderStateChange) => void>();

  constructor(port: BackgroundGeolocationPort, options: BackgroundGeolocationRecorderOptions = {}) {
    this.#port = port;
    this.#distanceFilterM = options.distanceFilterM ?? DEFAULT_DISTANCE_FILTER_M;
    this.#stopTimeoutMin = options.stopTimeoutMin ?? DEFAULT_STOP_TIMEOUT_MIN;
    this.#debug = options.debug ?? isDebugBuild();
    this.#notification = {
      title: options.notification?.title ?? 'Apex Fitness',
      text: options.notification?.text ?? 'Recording your activity',
    };
    this.#now = options.now ?? Date.now;
    this.#log = options.log ?? ((line) => console.log(line));
  }

  async start(options: StartOptions): Promise<RecordingSession> {
    if (this.#state !== 'idle') throw new Error(`Cannot start while ${this.#state}`);

    await this.#configure();
    this.#subscribe();

    sessionCounter += 1;
    this.#lastPoint = null;
    this.#lastMovingAt = null;
    this.#movingMs = 0;

    this.#session = {
      id: options.sessionId ?? `bgl-session-${sessionCounter}`,
      sportType: options.sportType,
      state: 'recording',
      startedAt: this.#now(),
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
    await this.#port.start();
    // Without this the SDK sits stationary until its motion detector notices the
    // athlete, which can take a minute. A recording that starts because someone
    // pressed Start should start now.
    await this.#port.changePace(true);
    return this.#session;
  }

  async pause(): Promise<void> {
    if (this.#state !== 'recording') throw new Error(`Cannot pause while ${this.#state}`);
    this.#transition('paused', 'user');
    await this.#port.changePace(false);
  }

  async resume(): Promise<void> {
    if (this.#state !== 'paused') throw new Error(`Cannot resume while ${this.#state}`);
    this.#transition('recording');
    await this.#port.changePace(true);
  }

  async stop(): Promise<RecordingSession> {
    if (this.#state !== 'recording' && this.#state !== 'paused') {
      throw new Error(`Cannot stop while ${this.#state}`);
    }
    const session = this.#session!;
    await this.#port.stop();
    this.#unsubscribe();
    session.endedAt = session.samples.at(-1)?.timestamp ?? this.#now();
    this.#refreshMetrics();
    this.#transition('stopped');
    return session;
  }

  async discard(): Promise<void> {
    if (this.#state === 'idle') return;
    if (this.#state === 'recording' || this.#state === 'paused') await this.#port.stop();
    this.#unsubscribe();
    if (this.#session) {
      this.#session.samples = [];
      this.#session.endedAt = this.#now();
    }
    this.#transition('discarded');
    this.#session = null;
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

  /**
   * Detaches from the SDK. It deliberately does *not* stop the native service:
   * `stopOnTerminate: false` exists so a recording outlives the JS that started
   * it, and unmounting a screen is not the athlete finishing their run. Ending
   * a recording is `stop()` or `discard()`, never this.
   */
  destroy(): void {
    this.#unsubscribe();
    this.#sampleListeners.clear();
    this.#metricsListeners.clear();
    this.#stateListeners.clear();
  }

  // --- internals ---------------------------------------------------------

  /**
   * The ADR task 2 deliverable in one object. No licence key appears anywhere:
   * the SDK is fully functional in DEBUG builds, and a key is required only for
   * Android *release* builds (ADR §5, §7.1) — that purchase is deliberately not
   * a prerequisite for proving the core works.
   */
  #buildConfig(): GeoReadyConfig {
    return {
      reset: true,
      logger: {
        debug: this.#debug,
        logLevel: this.#debug ? GEO_LOG_LEVEL_VERBOSE : GEO_LOG_LEVEL_ERROR,
      },
      geolocation: {
        desiredAccuracy: GEO_DESIRED_ACCURACY_HIGH,
        activityType: GEO_ACTIVITY_TYPE_FITNESS,
        distanceFilter: this.#distanceFilterM,
        stopTimeout: this.#stopTimeoutMin,
        // Stop-detection must pause the recording, not end it. Ending is a
        // decision only the athlete gets to make.
        stopOnStationary: false,
      },
      app: {
        stopOnTerminate: false,
        startOnBoot: true,
        enableHeadless: true,
        notification: { ...this.#notification, sticky: true },
        backgroundPermissionRationale: {
          title: 'Keep recording in the background?',
          message:
            'Apex Fitness needs location access all the time so your run keeps recording with the screen off or the app in the background. Choose "Allow all the time".',
          positiveAction: 'Change to Allow all the time',
          negativeAction: 'Cancel',
        },
      },
    };
  }

  /** `ready()` is idempotent for the SDK but expensive; a failure must be retryable. */
  #configure(): Promise<void> {
    if (this.#ready === null) {
      const pending = this.#port.ready(this.#buildConfig()).then(() => undefined);
      pending.catch(() => {
        this.#ready = null;
      });
      this.#ready = pending;
    }
    return this.#ready;
  }

  #subscribe(): void {
    this.#unsubscribe();
    this.#subscriptions = [
      this.#port.onLocation(
        (fix) => this.#handleLocation(fix),
        (errorCode) => this.#log(`[recording] location error ${errorCode}`),
      ),
      this.#port.onMotionChange((event) => this.#handleMotionChange(event)),
    ];
  }

  #unsubscribe(): void {
    for (const subscription of this.#subscriptions) subscription.remove();
    this.#subscriptions = [];
  }

  #transition(state: RecorderState, pauseReason?: PauseReason): void {
    const previous = this.#state;
    this.#state = state;
    this.#pauseReason = state === 'paused' ? (pauseReason ?? 'user') : null;

    // Leaving `recording` breaks both accumulators, and it has to happen here
    // rather than in each caller because there are five ways out. Time and
    // distance accrue strictly between two consecutive fixes taken while the
    // session was running: an athlete who pauses at a trailhead and drives home
    // has not run those kilometres, and the ten minutes they spent driving are
    // not moving time either.
    if (state !== 'recording') {
      this.#lastMovingAt = null;
      this.#lastPoint = null;
    }

    if (this.#session) this.#session.state = state;
    const change: RecorderStateChange = pauseReason
      ? { state, previous, pauseReason }
      : { state, previous };
    for (const listener of this.#stateListeners) listener(change);
  }

  #handleLocation(fix: GeoFix): void {
    // Motion-detector probes are not track points, and a fix that arrives in
    // the gap between `changePace(false)` and the native service quietening
    // down belongs to a recording that is already paused.
    if (fix.sample === true) return;
    const session = this.#session;
    if (!session || this.#state !== 'recording') return;

    const timestamp = toEpochMs(fix.timestamp, this.#now);
    const speed = fix.coords.speed;
    const altitude = fix.coords.altitude;

    const sample: RecordingSample = {
      timestamp,
      coords: {
        latitude: fix.coords.latitude,
        longitude: fix.coords.longitude,
        accuracyM: fix.coords.accuracy,
        ...(altitude !== undefined ? { altitudeM: altitude } : {}),
        // CoreLocation and FusedLocationProvider both report -1 for "no speed".
        ...(speed !== undefined && speed >= 0 ? { speedMs: speed } : {}),
      },
      moving: fix.is_moving,
    };

    session.samples.push(sample);
    this.#accumulateMovingTime(sample);
    this.#refreshMetrics();

    this.#log(
      `[recording] #${session.samples.length} ${sample.coords!.latitude.toFixed(5)},` +
        `${sample.coords!.longitude.toFixed(5)} ±${Math.round(fix.coords.accuracy)}m ` +
        `${sample.moving ? 'moving' : 'still'} ${Math.round(session.metrics.distanceM)}m`,
    );

    for (const listener of this.#sampleListeners) listener(sample);
    for (const listener of this.#metricsListeners) listener(session.metrics);
  }

  /**
   * The SDK's motion state machine surfacing as auto-pause.
   *
   * A user pause outranks it: someone who pressed Pause at a road crossing does
   * not want the recording to restart because they took three steps. Only a
   * pause the stop-detector caused may be undone by the stop-detector.
   */
  #handleMotionChange(event: GeoMotionChangeEvent): void {
    if (event.isMoving) {
      if (this.#state === 'paused' && this.#pauseReason === 'auto') this.#transition('recording');
      return;
    }
    if (this.#state === 'recording') this.#transition('paused', 'auto');
  }

  /**
   * Moving time is the sum of gaps between consecutive moving fixes, not a tick
   * count: fixes arrive on `distanceFilter`, so their spacing is a function of
   * pace and cannot be assumed.
   */
  #accumulateMovingTime(sample: RecordingSample): void {
    if (!sample.moving) {
      this.#lastMovingAt = null;
      return;
    }
    if (this.#lastMovingAt !== null && sample.timestamp > this.#lastMovingAt) {
      this.#movingMs += sample.timestamp - this.#lastMovingAt;
    }
    this.#lastMovingAt = sample.timestamp;
  }

  /**
   * Distance is measured over our own samples rather than read from the SDK's
   * native odometer. The server recomputes distance from the uploaded `latlng`
   * stream, and an athlete shown two different numbers for one run will believe
   * neither — so the live figure has to come from the points we actually send.
   */
  #refreshMetrics(): void {
    const session = this.#session;
    if (!session) return;

    const last = session.samples.at(-1);
    let distanceM = session.metrics.distanceM;

    if (last?.coords) {
      const point: LatLng = [last.coords.latitude, last.coords.longitude];
      if (this.#lastPoint) distanceM += haversineM(this.#lastPoint, point);
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
