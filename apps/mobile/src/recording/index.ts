/**
 * The only recording surface the rest of the app may import.
 *
 * ADR 0001 build task 3: "Nothing outside this module imports
 * react-native-background-geolocation." The SDK is not re-exported here in any
 * form — not its types, not its config, not its enums. What leaves this barrel
 * is the interface, the two implementations behind it, and the factory that
 * chooses between them.
 */

export type {
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
export { sessionToStreams } from './ActivityRecorder';
export {
  DEFAULT_LOOP,
  MockActivityRecorder,
  type MockRecorderOptions,
} from './MockActivityRecorder';
export {
  BackgroundGeolocationRecorder,
  type BackgroundGeolocationRecorderOptions,
} from './BackgroundGeolocationRecorder';
export {
  createActivityRecorder,
  type ActiveRecorder,
  type CreateActivityRecorderOptions,
  type RecorderImplementation,
} from './createActivityRecorder';
export { haversineM, trackDistanceM, type LatLng } from './geo';
