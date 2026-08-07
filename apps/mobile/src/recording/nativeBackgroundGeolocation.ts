/**
 * The only file in this repository that names `react-native-background-geolocation`.
 *
 * ADR 0001 §8 task 3 states the rule — "nothing outside this module imports
 * react-native-background-geolocation" — and this is where it is spent. The
 * recorder, the factory, every screen and every test import the port type
 * instead; if this file is the only grep hit for the package name outside
 * `package.json` and `app.json`, the escape hatch in ADR §5 is intact.
 *
 * The load is a deferred `require` rather than a top-level `import`, for one
 * concrete reason: the SDK's `NativeModule.js` resolves its TurboModule during
 * *module evaluation* and throws if the native side is missing. A static import
 * would therefore crash the JS bundle on any build without the native module —
 * Expo Go, a client's phone before a fresh `prebuild`, and this repository's
 * own Node test runs. Metro still sees the literal specifier and bundles the
 * SDK, so nothing is lazy about the shipped app; only the *failure* is deferred
 * into a catch, where it becomes a `MockActivityRecorder` fallback.
 */

import type { BackgroundGeolocationPort } from './backgroundGeolocationPort';
import type {
  GEO_ACTIVITY_TYPE_FITNESS,
  GEO_DESIRED_ACCURACY_HIGH,
  GEO_LOG_LEVEL_ERROR,
  GEO_LOG_LEVEL_VERBOSE,
} from './backgroundGeolocationPort';

/** Type-only, so the SDK is absent from this module's runtime import graph. */
type Sdk = typeof import('react-native-background-geolocation').default;
type SdkModule = typeof import('react-native-background-geolocation');

/**
 * Compile-time proof that the magic numbers in `backgroundGeolocationPort.ts`
 * still name the SDK enum members their doc comments claim. These aliases emit
 * nothing; they exist so an SDK upgrade that renumbers an enum fails `tsc`
 * rather than silently configuring the recorder wrong on a device we cannot
 * build for here.
 */
type Assert<Expected, Actual extends Expected> = Actual;
type _AccuracyIsHigh = Assert<
  SdkModule['DesiredAccuracy']['High'],
  typeof GEO_DESIRED_ACCURACY_HIGH
>;
type _ActivityIsFitness = Assert<
  SdkModule['ActivityType']['Fitness'],
  typeof GEO_ACTIVITY_TYPE_FITNESS
>;
type _LogVerbose = Assert<SdkModule['LogLevel']['Verbose'], typeof GEO_LOG_LEVEL_VERBOSE>;
type _LogError = Assert<SdkModule['LogLevel']['Error'], typeof GEO_LOG_LEVEL_ERROR>;

// React Native and Metro provide `require`; Node ESM under vitest does not, and
// the resulting ReferenceError lands in the same catch as a missing native
// module. Declared locally because the mobile tsconfig has no Node types.
declare function require(moduleName: string): unknown;

export interface NativeBackgroundGeolocation {
  /** The SDK, or null when this build has no native module linked. */
  port: BackgroundGeolocationPort | null;
  /** Why `port` is null, phrased for a log line or a dev-build footnote. */
  reason: string | null;
}

let cached: NativeBackgroundGeolocation | null = null;

export function loadNativeBackgroundGeolocation(): NativeBackgroundGeolocation {
  if (cached !== null) return cached;

  try {
    const loaded = require('react-native-background-geolocation') as { default?: Sdk };
    // Metro hands back the ES module namespace; a CommonJS interop path would
    // hand back the object itself.
    const sdk = (loaded.default ?? loaded) as Sdk;

    cached =
      typeof sdk?.ready === 'function'
        ? { port: sdk, reason: null }
        : {
            port: null,
            reason: 'react-native-background-geolocation loaded without a ready() — not linked',
          };
  } catch (error) {
    cached = { port: null, reason: error instanceof Error ? error.message : String(error) };
  }

  return cached;
}
