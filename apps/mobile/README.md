# @apex/mobile

The React Native shell from [ADR 0001](../../docs/decisions/0001-mobile-stack.md).
Expo SDK 57 (dev-client workflow), React Native 0.86, TypeScript.

This is build task 1 of the ADR's Phase 2 list: **scaffold the app and prove
`@apex/shared` imports end to end**, plus the `ActivityRecorder` interface from
task 3. There is no product here yet, and deliberately so — the ADR orders the
recording core ahead of any UI.

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

## Recording is mocked

`src/recording/ActivityRecorder.ts` is the interface every part of the app talks
to: `start` / `pause` / `resume` / `stop` / `discard`, `onSample` / `onMetrics` /
`onStateChange` streams, and a serialisable `RecordingSession`. Nothing outside
`src/recording/` may import a geolocation SDK — that rule is the migration
escape hatch ADR §5 describes, and it is only real if it holds from the first
screen.

The only implementation today is `MockActivityRecorder`: a `setInterval` that
replays a hardcoded ~1.4 km rectangular loop at a fixed ground speed, with a
plausible wandering heart rate. No native module, no permissions, no `$399`
licence. It exists so the UI above the interface can be built and tested on a
laptop.

`react-native-background-geolocation` lands in **ADR build task 2**, behind this
same interface, and `MockActivityRecorder` stays afterwards as the test double.

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
npx expo export --platform android           # proves Metro resolves @apex/shared
```

The export is the one that matters: typecheck and tests both resolve
`@apex/shared` through tooling that is happy with TypeScript path conventions
Metro is not. Bundling is what proves it works on a device.

Tests are plain Node — nothing under test imports `react-native`, which is a
consequence of keeping the recording layer free of native imports rather than a
coincidence. Screens are not currently rendered in tests.

## Not here yet

Per the ADR's dependency list (§7.2) and build order (§8): the background
geolocation SDK and its config plugin, the iOS/Android background modes and
permissions, BLE (`react-native-ble-plx`), maps behind the §4.2 provider
adapter, MMKV crash-recovery storage, TanStack Query, secure token storage, and
any call to the real API.
