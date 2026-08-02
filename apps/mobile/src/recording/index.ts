/**
 * The only recording surface the rest of the app may import.
 *
 * ADR 0001 build task 3: "Nothing outside this module imports
 * react-native-background-geolocation."
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
export { haversineM, trackDistanceM, type LatLng } from './geo';
