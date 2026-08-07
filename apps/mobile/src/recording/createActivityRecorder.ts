/**
 * Picks the recorder this build can actually run.
 *
 * `react-native-background-geolocation` needs a dev-client build; there is no
 * native module in Expo Go, in vitest, or in any checkout that has not run
 * `expo prebuild` yet — including the machine ADR 0001 §6 admits has no mobile
 * toolchain. Rather than let that be a crash, the factory probes for the native
 * module and falls back to `MockActivityRecorder`, which implements the same
 * interface and was written for exactly this.
 *
 * Callers get told which one they got. That is the honest way to surface it: a
 * screen showing "mock" has no business importing the SDK to find out, and the
 * silent alternative — a recording screen that quietly replays a hardcoded loop
 * in Auckland — is the worst outcome available.
 */

import type { ActivityRecorder } from './ActivityRecorder';
import {
  BackgroundGeolocationRecorder,
  type BackgroundGeolocationRecorderOptions,
} from './BackgroundGeolocationRecorder';
import { MockActivityRecorder, type MockRecorderOptions } from './MockActivityRecorder';
import { loadNativeBackgroundGeolocation } from './nativeBackgroundGeolocation';

export type RecorderImplementation = 'background-geolocation' | 'mock';

export interface ActiveRecorder {
  recorder: ActivityRecorder;
  implementation: RecorderImplementation;
  /**
   * Non-null only when the native recorder was wanted and unavailable. `null`
   * covers both "we got the real thing" and "the mock was asked for".
   */
  fallbackReason: string | null;
}

export interface CreateActivityRecorderOptions {
  /**
   * Force an implementation. For tests and a dev menu, not for product code —
   * screens should take whatever this build supports.
   */
  prefer?: RecorderImplementation;
  recorder?: BackgroundGeolocationRecorderOptions;
  mock?: MockRecorderOptions;
}

export function createActivityRecorder(
  options: CreateActivityRecorderOptions = {},
): ActiveRecorder {
  if (options.prefer === 'mock') {
    return {
      recorder: new MockActivityRecorder(options.mock),
      implementation: 'mock',
      fallbackReason: null,
    };
  }

  const native = loadNativeBackgroundGeolocation();

  if (native.port) {
    return {
      recorder: new BackgroundGeolocationRecorder(native.port, options.recorder),
      implementation: 'background-geolocation',
      fallbackReason: null,
    };
  }

  // Asking for the real recorder and silently getting a fake one would make a
  // failed prebuild look like a working recording.
  if (options.prefer === 'background-geolocation') {
    throw new Error(`react-native-background-geolocation is unavailable: ${native.reason}`);
  }

  return {
    recorder: new MockActivityRecorder(options.mock),
    implementation: 'mock',
    fallbackReason: native.reason,
  };
}
