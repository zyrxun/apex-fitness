/**
 * The seam between the recording state machine and Transistorsoft's native SDK.
 *
 * `BackgroundGeolocationRecorder` holds the lifecycle, the metrics and every
 * decision worth testing; it reaches the device only through the port declared
 * here. Two things follow from that, and both are the point:
 *
 * 1. The state machine is plain TypeScript with no `react-native` in its import
 *    graph, so vitest runs it in Node against a fake. `nativeBackgroundGeolocation.ts`
 *    is the only file in the app that names the SDK, and tests never load it.
 * 2. The SDK's own `BackgroundGeolocation` object is assigned *directly* to
 *    `BackgroundGeolocationPort` — no hand-written wrapper in between. The
 *    shapes below are therefore a deliberately narrow but faithful subset of
 *    the real API, and `tsc` fails if Transistorsoft ever changes it under us.
 *    That check is worth more than the wrapper it replaces.
 *
 * Field names follow the SDK (`is_moving`, `coords.accuracy`) rather than this
 * app's conventions precisely so that the assignment in (2) is an identity and
 * not a translation. Translation happens one layer up, into `RecordingSample`.
 */

/** `DesiredAccuracy.High` — the SDK's most aggressive distance-based mode. */
export const GEO_DESIRED_ACCURACY_HIGH = -1;
/** `ActivityType.Fitness` — tells iOS's motion classifier what it is watching. */
export const GEO_ACTIVITY_TYPE_FITNESS = 3;
/** `LogLevel.Verbose`. */
export const GEO_LOG_LEVEL_VERBOSE = 5;
/** `LogLevel.Error`. */
export const GEO_LOG_LEVEL_ERROR = 1;

/** The SDK returns one of these from every `onX` subscription. */
export interface GeoSubscription {
  remove(): void;
}

export interface GeoCoords {
  latitude: number;
  longitude: number;
  /** Horizontal accuracy in metres. */
  accuracy: number;
  altitude?: number;
  /** Metres per second. Negative when the platform has no speed for the fix. */
  speed?: number;
}

/** One location as the SDK reports it. */
export interface GeoFix {
  /** ISO-8601 by default; epoch milliseconds when `timestampFormat: 'epoch'`. */
  timestamp: string | number;
  is_moving: boolean;
  /**
   * True for fixes the motion detector requested while deciding whether the
   * device has started moving. They are diagnostics, not part of the track.
   */
  sample?: boolean;
  /** The SDK's own native distance total, in metres. */
  odometer: number;
  coords: GeoCoords;
}

/** Emitted when the native motion state machine flips moving/stationary. */
export interface GeoMotionChangeEvent {
  isMoving: boolean;
  location: GeoFix;
}

/**
 * The slice of the SDK's `Config` this app sets.
 *
 * v5 groups configuration (`geolocation`, `app`, `logger`, …) where v4 was flat —
 * ADR 0001 §8 task 2 lists the four keys it wants in the flat v4 spelling, so
 * `distanceFilter` and `stopTimeout` live under `geolocation` here and
 * `stopOnTerminate` / `startOnBoot` under `app`. Same settings, different tree.
 */
export interface GeoReadyConfig {
  /** Discard any config persisted by a previous launch. */
  reset?: boolean;
  logger?: {
    debug?: boolean;
    logLevel?: number;
  };
  geolocation?: {
    desiredAccuracy?: number;
    activityType?: number;
    /** Metres of movement between fixes. */
    distanceFilter?: number;
    /** Minutes of stillness before stop-detection fires. This is auto-pause. */
    stopTimeout?: number;
    /** Whether stop-detection should also end tracking outright. Never, for us. */
    stopOnStationary?: boolean;
  };
  app?: {
    stopOnTerminate?: boolean;
    startOnBoot?: boolean;
    enableHeadless?: boolean;
    notification?: {
      title?: string;
      text?: string;
      /** Keeps the foreground-service notification un-swipeable mid-recording. */
      sticky?: boolean;
    };
    backgroundPermissionRationale?: {
      title?: string;
      message?: string;
      positiveAction?: string;
      negativeAction?: string;
    };
  };
}

/**
 * Return types are `Promise<unknown>` because the SDK resolves each of these
 * with its `State` object and nothing here reads it — widening is what lets the
 * real SDK satisfy this interface without an adapter.
 */
export interface BackgroundGeolocationPort {
  ready(config: GeoReadyConfig): Promise<unknown>;
  start(): Promise<unknown>;
  stop(): Promise<unknown>;
  /** Forces the motion state machine moving or stationary. This is user pause. */
  changePace(isMoving: boolean): Promise<unknown>;
  onLocation(
    callback: (fix: GeoFix) => void,
    onError?: (errorCode: number) => void,
  ): GeoSubscription;
  onMotionChange(callback: (event: GeoMotionChangeEvent) => void): GeoSubscription;
}
