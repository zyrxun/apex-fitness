# @apex/mobile

The React Native shell from [ADR 0001](../../docs/decisions/0001-mobile-stack.md).
Expo SDK 57 (dev-client workflow), React Native 0.86, TypeScript.

This is build tasks 1–3 of the ADR's Phase 2 list: **scaffold the app and prove
`@apex/shared` imports end to end**, the `ActivityRecorder` interface, and
**the recording core integrated in a licence-free DEBUG build**. There is no
product here yet, and deliberately so — the ADR orders the recording core ahead
of any UI.

## Run it

```bash
npm install          # from the repo root; this is an npm workspace
npm run mobile       # or: npm start --workspace @apex/mobile
```

`npm start` launches Metro with `--dev-client`. **Expo Go will not work** —
ADR §5 commits us to background location, which needs a dev build from day one.
To get one:

```bash
npm run prebuild --workspace @apex/mobile   # expo prebuild --clean
npm run android  --workspace @apex/mobile   # buildable anywhere
npm run ios      --workspace @apex/mobile   # macOS + Xcode only
```

`ios/` and `android/` are generated, not committed.

## Recording

`src/recording/ActivityRecorder.ts` is the interface every part of the app talks
to: `start` / `pause` / `resume` / `stop` / `discard`, `onSample` / `onMetrics` /
`onStateChange` streams, and a serialisable `RecordingSession`. Nothing outside
`src/recording/` may import a geolocation SDK — that rule is the migration
escape hatch ADR §5 describes, and it is only real if it holds from the first
screen. `src/recording/nativeBackgroundGeolocation.ts` is the single file that
names `react-native-background-geolocation`, so the rule is one grep away from
being audited.

Two implementations sit behind the interface, and `createActivityRecorder()`
picks between them:

- **`BackgroundGeolocationRecorder`** — Transistorsoft's native Swift/Kotlin
  SDK. It owns the motion state machine, the foreground service, and the SQLite
  buffer; this class owns what the SDK cannot know about — what a session is,
  whether a pause was the athlete's idea or the stop-detector's, and which
  numbers the screen shows. `ready()` is configured with `distanceFilter: 10`,
  `stopTimeout: 5`, `stopOnTerminate: false`, `startOnBoot: true` and high
  desired accuracy, and **no licence key anywhere**: the SDK is fully functional
  in DEBUG builds, and the `$399` from ADR §7.1 is needed only for Android
  _release_ builds. Every fix is logged to the console, which is the literal
  ADR task 2 deliverable.
- **`MockActivityRecorder`** — a `setInterval` replaying a hardcoded ~1.4 km
  rectangular loop with a plausible wandering heart rate. It is both the test
  double and the runtime fallback for any build with no native module: Expo Go,
  a fresh checkout that has not run `prebuild`, and this repo's Node test runs.

The fallback is not a convenience. The SDK's `NativeModule.js` resolves its
TurboModule during _module evaluation_ and throws when the native side is
missing, so a static `import` would take the whole JS bundle down on any build
without it. The load is therefore a deferred `require` inside a `try` — Metro
still sees the literal specifier and bundles the SDK, so nothing about the
shipped app is lazy; only the failure is, and it lands as a mock recorder and a
visible label on `RecordScreen` rather than a white screen.

Distance and moving time accrue strictly between two consecutive fixes taken
while the session was running — they do not bridge a pause, because an athlete
who pauses at a trailhead and drives home has not run those kilometres.
Distance is measured over our own samples rather than read from the SDK's native
odometer, so that the live figure and the one the server recomputes from the
uploaded `latlng` stream come from the same points; an athlete shown two
different numbers for one run will believe neither.

### Config plugin and permissions

`app.json` lists both Transistorsoft config plugins and declares the platform
requirements from ADR §7.3: iOS `UIBackgroundModes: ["location", …]` with
`NSLocationAlwaysAndWhenInUseUsageDescription` and `NSMotionUsageDescription`,
and the Android `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`,
`ACCESS_FINE_LOCATION`, `ACCESS_BACKGROUND_LOCATION` and `ACTIVITY_RECOGNITION`
permissions (plus `ACCESS_COARSE_LOCATION`, which Android 12+ requires
alongside the fine one for the runtime dialog).

Two notes on how that differs from the ADR's sketch. First, the plugin props
ADR §7.3 lists — `locationAlwaysAndWhenInUsePermission`,
`isAndroidBackgroundLocationEnabled` — belong to `expo-location`, not to this
one: `react-native-background-geolocation@5.4.0`'s plugin accepts only
`license` / `hmsLicense` / `polygonLicense` and does nothing else on iOS.
Passing them would have been silently dead config, so the permissions are
declared directly and produce the same manifest and plist. Second, the SDK's
v5 config is grouped (`geolocation`, `app`, `logger`, …) where v4 was flat, so
`distanceFilter` and `stopTimeout` live under `geolocation` and
`stopOnTerminate` / `startOnBoot` under `app` — same settings, different tree.

**Changing `app.json` means the generated native projects are stale.** Run
`npm run prebuild --workspace @apex/mobile` before the next device build.

## What proves the ADR

`src/screens/HomeScreen.tsx` imports the sport taxonomy, `sportsInCategory`,
`fromCanonicalMeters` and `createActivityBodySchema` from `@apex/shared` and
runs `safeParse` on a sample upload **at runtime, on the device** — the same
zod schema instance the Fastify API validates that request body with. A backend
schema change becomes a mobile compile error, which is the whole reason ADR
§3.5 chose React Native.

`packages/shared` is consumed at source level (its `exports` point at
`./src/index.ts`, there is no build step), so Metro needs help: see
`metro.config.js` for the monorepo `watchFolders` / `nodeModulesPaths` and for
the resolver shim that maps the packages' Node-ESM `./enums.js` specifiers onto
the `.ts` files actually on disk.

## Checks

```bash
npm run typecheck --workspace @apex/mobile   # tsc --noEmit
npm test --workspace @apex/mobile            # vitest, node environment
npx expo export --platform android           # proves Metro resolves the workspace + the SDK
npx expo config --type introspect            # runs the config plugins without writing native projects
```

The export is the one that matters: typecheck and tests both resolve
`@apex/shared` — and deliberately never resolve the SDK — through tooling that
is happy with TypeScript path conventions Metro is not. Bundling is what proves
it works on a device.

Tests are plain Node — nothing under test imports `react-native` or the
geolocation SDK, which is a consequence of the recorder taking a
`BackgroundGeolocationPort` instead of reaching for the SDK itself. The state
machine is therefore driven from a fake: every transition, the auto-pause
handling, the metric arithmetic and the `ready()` config are asserted in Node.
What that cannot cover is everything native — permissions, the foreground
service, battery, OEM kills — which is exactly the gap ADR §8 task 10 (the
physical-device soak test) exists to close. Screens are not rendered in tests.

## Not here yet

Per the ADR's dependency list (§7.2) and build order (§8): BLE
(`react-native-ble-plx`), maps behind the §4.2 provider adapter, MMKV
crash-recovery storage and resume-on-relaunch (task 4), GPS smoothing and
outlier rejection (task 6), TanStack Query, secure token storage, and any call
to the real API. Nothing here has run on a device or an emulator: no prebuild,
no native build, no permission prompt has ever been shown.
