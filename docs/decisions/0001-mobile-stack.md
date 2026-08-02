# ADR 0001 — Mobile stack for Apex Fitness

- **Status:** Accepted
- **Date:** 2026-08-03
- **Deciders:** Founder (solo) + AI agents
- **Supersedes:** the open question in [PLAN.md §4.1](../../PLAN.md) ("React Native or Flutter — decide in Phase 0 spike")
- **Affects:** Phase 2 (Activity Recording), Phase 3 (Ingestion/Device Ecosystem), Phase 8 (Routes & Maps), Phase 9 (Watch & Wearable), Phase 14 (China track)

---

## 1. Context

Apex Fitness is a Strava-class endurance recorder (run / ride / swim GPS tracking) **plus** a strength logger with a ranking engine. PLAN.md §4.1 already commits to the hard part:

> "Mobile: iOS + Android (single codebase — React Native or Flutter; decide in Phase 0 spike). **GPS recording must run as native background modules regardless of framework.**"

That sentence is the whole spike in miniature. The Phase 2 checklist is dominated by work that is native on both frameworks — background GPS with start/pause/auto-pause/resume/stop, battery-optimised sampling, tunnel/canyon signal-loss handling, barometric elevation, BLE HR straps and power meters, treadmill accelerometer distance, pool-mode lap detection, and **"crash/kill recovery — never lose a recording."** Phase 9 adds a standalone Apple Watch recorder and a Wear OS app, both of which are native by construction (watchOS has no React Native or Flutter runtime worth shipping).

The backend is already built and opinionated: Fastify + zod on Node 22, TypeScript strict, Drizzle/Postgres, and a `packages/shared` workspace whose stated purpose is client reuse — it currently exports zod v4 schemas for auth, profile, privacy, social, GDPR, plus shared enums and unit helpers. The team is one founder plus AI agents. There is no mobile toolchain on the development machine, so **this spike is desk research, not a prototype build** — see §6 for what that costs us in confidence.

The choice therefore is not really "which framework draws the feed screen." It is: **which framework do we wrap around a native recording core, and what does that wrapper cost us over five phases?**

---

## 2. Options considered

| #     | Option                                                                            | Shape                                                                                                                                                                         |
| ----- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A** | **React Native (Expo, dev-client) shell + native recording core**                 | TS/React app; background GPS via Transistorsoft's native Swift/Kotlin SDK; our own Nitro/Turbo modules for sport-specific sensors; native Swift watchOS + Kotlin Wear OS apps |
| **B** | **Flutter shell + native recording core**                                         | Dart app; background GPS via Transistorsoft's _identical_ native SDK exposed through platform channels; Pigeon/FFI for our own modules; same native watch apps                |
| **C** | **Full native** — SwiftUI + Kotlin/Compose                                        | Two apps, two teams' worth of work, highest ceiling                                                                                                                           |
| **D** | _(considered, rejected early)_ Kotlin Multiplatform shared-logic core + native UI | Real option for location-heavy apps (see §3.7), but it makes the backend's TypeScript investment unreachable and needs Kotlin fluency we don't have                           |

---

## 3. Evidence

> **Method note.** All figures below were pulled from primary sources (vendor docs, package registries, the npm downloads API, GitHub) on 2026-08-03. Registry download counts are directional only — npm counts CI installs far more aggressively than pub.dev, so cross-registry comparisons indicate ecosystem _shape_, not a like-for-like ratio. Where a claim could not be verified from a primary source, it is marked **[unverified]** rather than asserted.

### 3.1 RQ1 — Background GPS recording (the deciding criterion)

**The single most important finding: this criterion does not discriminate between A and B.**

Transistorsoft's Background Geolocation SDK is "a full native implementation for both iOS (Swift) and Android (Kotlin), with identical APIs across React Native, Flutter, Capacitor and Cordova" (<https://docs.transistorsoft.com/>). Both wrappers are thin bindings over the _same compiled native core_. Both are priced identically at **$399** (<https://shop.transistorsoft.com/>). Both are free in DEBUG and require a licence only for **Android RELEASE builds**; iOS needs no licence.

| Signal   | React Native                                                                       | Flutter                                                                               |
| -------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Package  | `react-native-background-geolocation` **5.4.0**, published 2026-07-24, MIT wrapper | `flutter_background_geolocation` **5.5.0**, published ~2026-07-25, Apache-2.0 wrapper |
| Adoption | **57,568** npm downloads/week                                                      | **31,900** pub.dev downloads/week, 843 likes, 160 pub points                          |
| Repo     | 27 open issues                                                                     | 726 stars, 14 open issues, 902 commits                                                |
| Licence  | $399                                                                               | $399                                                                                  |

Sources: <https://www.npmjs.com/package/react-native-background-geolocation> (via registry API), <https://pub.dev/packages/flutter_background_geolocation>, <https://github.com/transistorsoft/react-native-background-geolocation>, <https://github.com/transistorsoft/flutter_background_geolocation>.

**How the SDK actually achieves reliability** (<https://github.com/transistorsoft/react-native-background-geolocation/wiki/Philosophy-of-Operation>) — a two-state moving/stationary machine driven by native motion APIs:

- **iOS:** `CMMotionActivityManager` classifies still / on_foot / running / on_bicycle / in_vehicle. When stationary the OS suspends the app entirely and the SDK drops a ~200 m "stationary geofence"; exiting it wakes the app. Distance-based tracking only. A `preventSuspend` mode keeps the app alive indefinitely for the duration of an active recording.
- **Android:** Google Play Services `ActivityRecognitionAPI`; no geofence needed, reacts to motion within ≤10 m, supports both distance- and time-based sampling (`distanceFilter: 0`), and the app is not fully suspended.

That motion state machine is exactly what **auto-pause** needs (the `stopTimeout` timer is auto-pause), and it is available identically in both frameworks. **Auto-pause feasibility: equal.**

**The DIY paths are meaningfully worse in both ecosystems, in the same way.** Expo's own docs are blunt (<https://docs.expo.dev/versions/latest/sdk/location/>):

> "Background location will stop if the user terminates the app." … "A terminated app will not automatically restart when a location or geofencing event occurs due to platform limitations." … "the result of removing an app from the recent apps list varies by device vendor" — with an explicit link to dontkillmyapp.com.

`expo-background-task` is documented as **15-minute minimum interval, OS-scheduled, explicitly unsuitable for continuous tracking** (<https://docs.expo.dev/versions/latest/sdk/background-task/>). On the Flutter side `geolocator` (14.0.3, 1.98M downloads) does support a `ForegroundNotificationConfig` and background modes, but its docs stop at permissions and configuration — it offers no motion state machine, no SQLite buffer, no crash-recovery story (<https://pub.dev/packages/geolocator>). `flutter_foreground_task` (10.0.0) fills part of that gap on Android but notes iOS tasks run "roughly 30 seconds every 15 minutes" and terminate on force-close (<https://pub.dev/packages/flutter_foreground_task>) — nowhere near a continuous recorder.

**OEM hostility is a platform problem, not a framework problem.** dontkillmyapp.com ranks Huawei, Xiaomi, OnePlus and Samsung as the worst offenders (<https://dontkillmyapp.com/>). For Samsung the site states flatly: **"No known solution on dev end"** — Adaptive Battery kills unused apps after ~3 days, "Put Apps to Sleep" restricts within 3 days, and Android 11 removed wake-lock-holding in foreground services, which the site says "broke health app data gathering"; Samsung promised guaranteed foreground services again in Android 14 (<https://dontkillmyapp.com/samsung>). Xiaomi/MIUI requires user-enabled Autostart, detectable but not settable by the developer (<https://dontkillmyapp.com/xiaomi>).

Corroborating this from the SDK's own bug tracker: the recent open issues on `react-native-background-geolocation` are overwhelmingly OEM-specific — Samsung stuck in stationary mode, Motorola `ForegroundServiceDidNotStartInTimeException`, Oppo/Vivo `RemoteServiceException`, Samsung S24+ on Android 16 — i.e. **manufacturer constraints, not library instability**.

Platform floor, identical for both frameworks: Android 14+ requires `FOREGROUND_SERVICE_LOCATION` + `FOREGROUND_SERVICE` + a location runtime permission, a Play Console foreground-service-type declaration, and a `location` foreground service **cannot be started from the background** unless `ACCESS_BACKGROUND_LOCATION` is granted (<https://developer.android.com/develop/background-work/services/fgs/service-types>).

**Native-module story (the escape hatch quality), a genuine differentiator:**

- **React Native:** Turbo Modules are now the _only_ architecture. Nitro Modules (`react-native-nitro-modules` **0.36.5**, published 2026-07-31, 1.9k stars, 1,894 commits) generates type-safe C++/Swift/Kotlin bindings from **TypeScript interface definitions** via its Nitrogen codegen, over a statically-compiled JSI layer (<https://nitro.margelo.com/>, <https://github.com/mrousavy/nitro>). Its **1,689,684 npm downloads/week** show it is already load-bearing infrastructure under other libraries. Crucially, the interface we'd hand-write for our recording module is _the same TypeScript_ our backend already speaks.
- **Flutter:** Platform channels are asynchronous message passing with `StandardMessageCodec` serialisation, explicitly characterised in Flutter's own docs as suited to "I/O-bound operations, not real-time/performance-critical code," with **Pigeon** recommended for type safety and **FFI** for "performance-critical, low-latency operations" (<https://docs.flutter.dev/platform-integration/platform-channels>). Pigeon is good; it is a second IDL to maintain alongside our zod schemas.

**RQ1 verdict: a tie on capability, a narrow RN win on the escape hatch.** Neither ecosystem has a production-proven path that the other lacks, because the proven path _is the same native SDK_. The correct architecture in both cases is "native recording core behind a thin binding." RN edges ahead only because its binding IDL is TypeScript.

### 3.2 RQ2 — BLE sensors (HR straps, power meters, cadence)

**This is Flutter's strongest card.**

|                    | `react-native-ble-plx`                                                                                                                                      | `flutter_blue_plus`                                                                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Version / date     | **3.5.1**, 2026-02-18 (≈5½ months stale)                                                                                                                    | **2.3.11**, ≈2026-07-25 (9 days)                                                                                                                                           |
| Adoption           | 196,420 npm/week; 3.4k stars                                                                                                                                | 228,000 pub/week; 1.26k likes                                                                                                                                              |
| Maintainer         | dotintent (agency-backed)                                                                                                                                   | community                                                                                                                                                                  |
| iOS background     | Supported — `Uses Bluetooth LE Accessories` background mode                                                                                                 | Supported — `bluetooth-central` in `UIBackgroundModes`; `restoreState: true` for post-termination restore, **~10 s** background task budget                                |
| Android background | `isBackgroundEnabled` flag in the library                                                                                                                   | **Not supported natively** — docs point you at `flutter_foreground_task` or `workmanager`, and warn "FlutterBluePlus does not support everything… you may have to fork it" |
| Known gaps         | No BLE classic, no peripheral role, no bonding, no beacons; `neverForLocation` flagged experimental; **no documented New Architecture/TurboModule support** | see above                                                                                                                                                                  |

Sources: <https://github.com/dotintent/react-native-ble-plx>, <https://github.com/dotintent/react-native-ble-plx/releases>, <https://pub.dev/packages/flutter_blue_plus>.

Read carefully, this is closer than it looks. Flutter's package ships more often; RN's package has _better documented Android background support_ and equal iOS support. Both are GATT-central wrappers over the same `CoreBluetooth` / `BluetoothGatt` APIs, and on Android both ultimately need our location foreground service running anyway — which Transistorsoft already gives us. The real risk on the RN side is `react-native-ble-plx`'s silence on New Architecture: it works today via the interop layer, but it is the one dependency that could need a Nitro rewrite. **Budget for that.** (Standard GATT profiles — Heart Rate 0x180D, Cycling Power 0x1818, CSC 0x1816 — are about 300 lines of parsing on top of whichever wrapper.)

**RQ2 verdict: narrow Flutter win on release cadence; capability parity; one named RN risk with a known mitigation.**

### 3.3 RQ3 — Watch apps (Phase 9)

watchOS has no viable React Native or Flutter runtime. **The Apple Watch app is a native SwiftUI target in Xcode under either option** — as is the Wear OS app in Kotlin/Compose. What differs is only the phone↔watch bridge.

|               | React Native                                                                                                             | Flutter                                                                                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bridge lib    | `react-native-watch-connectivity` **2.0.0**, published 2026-03-20, 785 stars, 263 commits, requires RN 0.76+ / iOS 13.4+ | `watch_connectivity` **0.2.9**, ~2026-06-09, 94 likes, 160 pub points, ~7k downloads/week — wraps WatchConnectivity **and** Android Wearable APIs in one package |
| Alternative   | —                                                                                                                        | `flutter_watch_os_connectivity` 1.0.0 — **last published 3 years ago, effectively abandoned**, iOS only                                                          |
| Wear OS       | Separate lib needed                                                                                                      | Covered by the same package                                                                                                                                      |
| Honest caveat | Its own docs say it "doesn't allow writing watch apps in React Native" — only RN↔watchOS messaging                       | Same limitation                                                                                                                                                  |

Sources: <https://github.com/mtford90/react-native-watch-connectivity>, <https://pub.dev/packages/watch_connectivity>, <https://pub.dev/packages/flutter_watch_os_connectivity>.

`watch_connectivity` covering both watchOS and Wear OS in a single maintained package is genuinely tidier. `react-native-watch-connectivity` is bigger, more recently released, and explicitly tracks modern RN. **RQ3 verdict: a wash. Phase 9 is a native Swift/Kotlin project either way** — which is itself an argument that the shell framework matters less than it feels like it should.

### 3.4 RQ4 — Maps, and the map-provider abstraction

PLAN.md §4.2 already mandates a map-provider abstraction (Mapbox/OSM now, Amap adapter later) and a WGS-84 → GCJ-02 display transform hook. That requirement dominates this section: **we are writing an adapter interface regardless**, so what matters is how many credible providers we can put behind it.

|                       | React Native                                                                                                                                                                                  | Flutter                                                                                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mapbox                | `@rnmapbox/maps` **10.3.5** (2026-07-22), 2.9k stars, 3,743 commits, Mapbox SDK v11, RN 0.79+, **174,436 npm/week**. Community-maintained; there is an open "call for additional maintainers" | `mapbox_maps_flutter` **2.27.0**, ~2026-07-25, **official verified Mapbox publisher**, 104k/week. Gaps: Style DSL / Expression DSL / View Annotations   |
| MapLibre              | `@maplibre/maplibre-react-native`, 642 stars, 3,134 commits, active, **100,499 npm/week**                                                                                                     | `maplibre_gl` **0.26.2** (~2026-06-19), official MapLibre.org publisher, 68.5k/week, Android+iOS+**Web**. "Only a subset of native SDK APIs is exposed" |
| Baseline              | `react-native-maps` 1,124,177/week (Apple/Google Maps)                                                                                                                                        | `google_maps_flutter` (official)                                                                                                                        |
| **Amap (China fork)** | `react-native-amap3d`, 1.3k stars, but **latest npm publish 2023-07-10** and the README states maintenance-only, no new features                                                              | `amap_flutter_map` **3.0.0**, **published 4 years ago**, unverified uploader, 55 pub points, 896 downloads, documented iOS MapView-destruction crash    |

Sources: <https://github.com/rnmapbox/maps>, <https://pub.dev/packages/mapbox_maps_flutter>, <https://github.com/maplibre/maplibre-react-native>, <https://pub.dev/packages/maplibre_gl>, <https://github.com/qiuxiang/react-native-amap3d>, <https://pub.dev/packages/amap_flutter_map>.

Mapbox's _official_ Flutter binding is a real point for Flutter — one fewer community dependency on a load-bearing surface. But RN's community bindings are larger, more active, and higher-adoption on both Mapbox and MapLibre, and the vendor-neutral MapLibre path (no proprietary token, self-hosted tiles) is stronger on RN.

**On Amap, both ecosystems are effectively dead.** Neither binding is official AutoNavi; the Flutter one is four years stale with a documented crash; the RN one is three years stale and self-described as maintenance-only. **Conclusion: for the China fork we will wrap the native Amap SDK ourselves behind the §4.2 map-provider interface, in either framework.** This is a Phase 14 problem, and the abstraction PLAN.md already mandates is what actually de-risks it. RN's Nitro/TypeScript path makes that wrapper marginally cheaper to write.

**RQ4 verdict: narrow RN win on today's providers; parity (both bad) on Amap.**

### 3.5 RQ5 — Code and type sharing (weighted heavily, as instructed)

This is where the options stop being close.

**What exists today:** `packages/shared` is a TypeScript workspace exporting **zod ^4.1.12** schemas (`auth`, `common`, `gdpr`, `privacy`, `profile`, `social`), shared `enums.ts` and `units.ts`, published via `"types": "./src/index.ts"` — source-level, no build step. The API consumes them directly.

**Option A (RN):** the mobile app adds `"@apex/shared": "*"` to its workspace dependencies and imports the _same objects the server validates with_. Not "compatible types" — literally the same zod schema instances. Request bodies validate client-side before they leave the device using server-authoritative rules; response parsing is `Schema.parse(json)` with inferred types; enums (the ~70-value sport taxonomy from PLAN.md §4.3, the Beginner→Elite ladder from §4.4, unit conversions from `units.ts`) are single-sourced. A schema change is a `tsc` error in the mobile app on the next typecheck. **Marginal cost: zero.** This is the single largest asymmetry in this document.

**Option B (Flutter):** Dart cannot consume zod. The pipeline becomes: zod → JSON Schema (`zod-to-json-schema`) → OpenAPI → `openapi-generator` `dart-dio` → Dart models. That is three generators, a build step in CI, and a permanent drift surface. The generator's own docs list the gaps (<https://openapi-generator.tech/docs/generators/dart-dio>):

> No custom data types, no UUID support, no XML serialisation, **no null type handling**; OAuth2 password/client-credentials flows unsupported; multi-server, callbacks, Link objects, parameter styling and OpenID Connect unsupported.

"No null type handling" is not cosmetic for a fitness API where streams are sparse by design — a swim has no power, an indoor ride has no lat/lng, a manual entry has no GPS at all (all three are explicit Phase 2 checklist items). We would be hand-patching generated models against nullability, forever. Then there's the second copy of the business logic that _isn't_ schema-shaped: e1RM formulas (Epley/Brzycki/Wathan with the r=37 guard), DOTS polynomials, age multipliers, GAP models, SWOLF — all of which PLAN.md wants consistent between client preview and server truth. In Option A those are one TS module in `packages/shared`. In Option B they are written twice, in two languages, and drift silently.

**RQ5 verdict: decisive React Native win.** This is the tiebreaker that RQ1 declined to be.

### 3.6 RQ6 — Team and agent productivity, upgrade churn

**RN's upgrade churn — the historical case against it — is now largely spent.** From <https://reactnative.dev/blog>:

| Version  | Date           | Significance                                                                      |
| -------- | -------------- | --------------------------------------------------------------------------------- |
| 0.76     | Oct 2024       | New Architecture default for new projects                                         |
| 0.80     | 2025-06-12     | Legacy Architecture **frozen**, deprecation warnings                              |
| 0.82     | 2025-10-08     | **First release running entirely on New Architecture**                            |
| 0.83     | 2025-12-10     | React 19.2 — **first release with no user-facing breaking changes**               |
| 0.84     | 2026-02-11     | Hermes V1 default, precompiled iOS binaries, **legacy architecture code removed** |
| 0.85     | 2026-04-07     | New animation backend (breaking changes)                                          |
| **0.86** | **2026-06-11** | Edge-to-edge on Android 15+, DevTools — **no breaking changes**                   |

The migration that made RN painful for four years is _finished_. Two of the last four releases shipped zero breaking changes. Expo SDK **57** (2026-06-30) tracks it (<https://expo.dev/changelog>). Weekly downloads: `react-native` 11.1M, `expo` 7.4M.

**Flutter is stable but not churn-free either.** Flutter **3.44** (2026-05-20) moved iOS/macOS to Swift Package Manager as the default and announced **CocoaPods support is ending**; Material and Cupertino are being frozen ahead of a move to standalone packages; Canonical takes over Desktop; Impeller gets Vulkan memory-management improvements rather than an overhaul (<https://flutter.dev/blog/whats-new-in-flutter-3-44>). The CocoaPods removal in particular is a real 2026–27 migration for any app with native dependencies — and our app is _all_ native dependencies.

**Language leverage for a solo founder + AI agents:** one language (TypeScript) across Fastify backend, mobile app, future web dashboard (Phase 8 route planner, PLAN.md §4.1), and the shared schema package. One type system, one lint config, one test runner idiom, one mental model. Agents generating code against `@apex/shared` get compile-time feedback from the _same_ types the server enforces — the tightest correctness loop available here. AI codegen quality for both frameworks is high, but for RN it is checked by a type system that already knows our domain.

**RQ6 verdict: React Native win.**

### 3.7 RQ7 — What did comparable apps choose?

**The most useful finding is a negative one, and it is worth stating plainly: neither framework's official showcase contains a Strava-class GPS recorder.**

- **React Native showcase** (<https://reactnative.dev/showcase>) — Facebook, Instagram, Microsoft Office/Outlook/Teams/Xbox Game Pass, Amazon Shopping/Alexa/Photos/Kindle, Shopify. **Fitness apps: exactly one — "Fit by Wix."** No GPS recorder.
- **Flutter showcase** (<https://flutter.dev/showcase>) — Google Pay, Google Earth, Nubank, eBay, Alibaba, BMW, ByteDance, Toyota. **Fitness/health: Fitbit Ace, Tonal, Push (athletic training), Headspace.** Location-adjacent: SNCF Connect, Kakao Mobility, Wolt. **No GPS recorder.**
- **Expo customers** (<https://expo.dev/customers>) — MTA, Hipcamp, Phantom, Partiful, incident.io, Bounce, Mollie, Cameo. **No fitness or GPS-tracking company listed.**

Flutter has the better _fitness_ showcase (Fitbit Ace is Google's own, Tonal is real hardware); RN has the better _scale_ showcase. Neither has a continuous-recording endurance app.

**Where location-heavy apps at scale actually went:** JetBrains' Kotlin Multiplatform case studies (<https://www.kotlinlang.org/lp/multiplatform/case-studies/>) list **Bolt** (entire chat engine in KMP, millions of daily users), **Careem** (100% of business logic shared), **Feres** (taxi, 1M+ downloads, 100% business logic + 90% UI shared), and fitness app **Fast&Fit** (90%+ shared). That is the "shared logic core, native platform edges" pattern — and it is the pattern this ADR is choosing, with TypeScript in the shared-core role instead of Kotlin.

**Circumstantial evidence on specific competitors:** komoot's public GitHub (<https://github.com/komoot>) is Java (Photon geocoder), Python and JavaScript on the server side, with **Objective-C and Swift** forks on the mobile side and no Dart or JS-mobile presence — directionally consistent with native iOS. Slopes is a well-known single-developer native SwiftUI/iOS app.

**[unverified]** I could not confirm the mobile stacks of **Strava, Runna, Hevy, WHOOP or Ladder** from primary sources in this spike: Strava's careers page returned only navigation chrome, its Greenhouse and Ashby boards 404'd, Hevy's careers page listed no engineering roles and its about page names no technology, WHOOP's careers domain did not resolve, and Runna's Notion-hosted careers page returned no readable content. **These are stated as unknown rather than guessed.** Note also that this spike's WebSearch budget was exhausted before hiring-signal research could run, so this is the weakest section of the ADR — see §6.

**RQ7 verdict: no framework wins on precedent, because the precedent for this app class is "native, or native core + shared logic."** That is itself the strongest evidence for the architecture chosen below.

### 3.8 Option C — full native (SwiftUI + Kotlin/Compose)

**Cost multiplier.** Look at the actual Phase 2–11 surface: sport taxonomy screens, live recording UI, feed, profile, strength logger with fast set entry and plate calculator, leaderboards, training analytics, route planner, club admin, subscription/entitlement UI, GDPR flows. That is well over a hundred screens, and roughly **70–80% of them are ordinary product UI** with no performance ceiling to speak of. Full native writes every one of them twice, in two languages, with two review cycles, two release trains, and two sets of bugs — for a **solo founder**. The realistic multiplier on the app layer is **~1.8–2.0×**.

**Quality ceiling.** The ceiling is genuinely higher, but only in three places: (a) the background recording core, (b) BLE sensor handling, (c) the watch apps. **We are building all three natively anyway.** The ceiling advantage over Options A/B therefore applies to the 20–30% of the app where it barely matters, and costs 2× on the 70–80% where it matters not at all.

**Verdict: rejected.** Full native buys a ceiling we can already reach by other means, at a price a solo founder cannot pay across fourteen phases. If the shell ever becomes the bottleneck, the native recording core migrates unchanged — see §5.

---

## 4. Decision

> ### We will build Apex Fitness as a **React Native (Expo dev-client) shell around a native Swift/Kotlin recording core**, with native watchOS and Wear OS companion apps in Phase 9.
>
> **Yes — the honest answer is "cross-platform shell + native recording core," and the shell is React Native.**

Concretely:

1. **The recording core is native and treated as a first-class subsystem**, not an app detail. `react-native-background-geolocation` (Transistorsoft's Swift/Kotlin SDK) owns the location lifecycle, motion-state machine, auto-pause, SQLite buffering and crash recovery. We buy the licence.
2. **Sport-specific sensor work we cannot buy** — barometric elevation, treadmill accelerometer distance, pool-mode lap detection, FIT parsing — is written as **Nitro Modules in Swift/Kotlin behind TypeScript interfaces**.
3. **Everything above the recording core** — the ~100+ product screens across Phases 1, 4, 5, 6, 7, 11 — is React Native + TypeScript, sharing `@apex/shared` zod schemas with the API directly.
4. **watchOS and Wear OS are native targets** (SwiftUI, Kotlin/Compose) bridged via `react-native-watch-connectivity` and the Wearable Data Layer.

**Why React Native and not Flutter, in one paragraph:** the deciding criterion refused to decide. Background GPS is a tie because both frameworks bind the _same native SDK_ at the _same $399 price_ — RQ1 produced parity, not a winner. Once the deciding criterion is neutral, the decision falls to the tiebreakers, and there the asymmetry is stark: RN consumes our existing zod schemas and shared domain logic at **zero marginal cost**, while Flutter needs a three-stage codegen pipeline whose own documentation admits it has **no null-type handling** — precisely the property a sparse-stream fitness API depends on — plus a second, hand-maintained copy of the e1RM/DOTS/GAP maths. RN also wins the escape hatch (Nitro generates Swift/Kotlin bindings _from TypeScript interfaces_, the same language as everything else we own), wins narrowly on map providers, and has finished the New Architecture migration that was historically the case against it. Flutter's real wins — an officially-published Mapbox binding, a fresher BLE package, one package covering both watch platforms — are each worth a few days. The codegen tax is worth months, forever, for a solo founder.

---

## 5. Consequences

### What we buy

- **One language end to end.** TypeScript for API, mobile, shared schemas and the future web dashboard. One type system, one lint config, one idiom for agents to generate against.
- **Server-authoritative validation on-device for free.** `@apex/shared` zod schemas import straight into the app; a backend schema change becomes a mobile compile error the same day.
- **A recording core that is best-in-class from day one** rather than something we discover is broken on a Samsung in month nine. Transistorsoft's motion state machine gives us auto-pause, battery-conscious sampling and stop-detection as configuration rather than research.
- **A genuinely portable expensive part.** The native modules are Swift/Kotlin. If we ever migrate the shell, they come with us.
- **Recruiting reality:** the RN/TS pool is the largest cross-platform pool, and TypeScript is the one skill that overlaps our backend.

### What we accept

- **$399 one-off** for the Transistorsoft React Native licence, required for **Android release builds only** (iOS free, DEBUG free on both). **Action before purchase: confirm with Transistorsoft whether the licence is per-bundle-ID and whether updates are included — the shop page lists the price but states no terms.** Budget a second **$399** if we later ship a separately-bundled China fork under a different application ID, and **$399** more if we add Polygon Geofencing for Phase 6 Routes & Rivals.
- **We will write native code.** This is not a "no native code" decision. Expect a meaningful share of Phase 2 in Swift and Kotlin. Expo Go is unusable — background location requires a dev build from day one.
- **Three community dependencies on load-bearing surfaces:** `@rnmapbox/maps` (community, actively seeking maintainers), `react-native-ble-plx` (agency-maintained but ~5½ months since release and silent on New Architecture), `react-native-watch-connectivity`. Each has a viable fallback.
- **Fitness-app precedent is thin on RN's showcase** (one Wix app). We are not following a beaten path — but §3.7 shows no such path exists on Flutter either.

### Migration risks and mitigations

| Risk                                                           | Likelihood                                                    | Mitigation                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `react-native-ble-plx` stalls or breaks on a future RN release | Medium                                                        | It is a GATT-central wrapper over stable OS APIs; budget ~2 weeks to reimplement as a Nitro module. Standard profiles (0x180D/0x1818/0x1816) are ~300 lines of parsing that we own regardless.                                                                                           |
| Samsung/Xiaomi/OnePlus kill a long recording                   | **High — this is an Android platform reality, not an RN one** | Foreground service + Transistorsoft SQLite buffer + resume-on-relaunch; ship an in-app "battery settings" coach linking to dontkillmyapp guidance; make "crash/kill recovery — never lose a recording" a Phase 2 acceptance test on physical Samsung/Xiaomi hardware, not an aspiration. |
| Transistorsoft licence terms or pricing change                 | Low                                                           | The API surface is small and native-backed. Worst case we fork the recording module against raw `CLLocationManager` / `FusedLocationProvider` — expensive but bounded, and identical to what Flutter would face.                                                                         |
| Amap binding rot blocks the China fork                         | Medium                                                        | PLAN.md §4.2 already mandates the map-provider abstraction. Enforce it in Phase 2 — **never import a map SDK type outside the adapter.** Plan to wrap Amap natively in Phase 14.                                                                                                         |
| RN upgrade churn returns                                       | Low                                                           | 0.83 and 0.86 shipped zero breaking changes; the New Architecture migration completed in 0.84. Pin to Expo SDK 57 and upgrade one SDK at a time.                                                                                                                                         |
| We chose wrong and want Flutter/native                         | Low                                                           | The recording core, BLE parsing and watch apps — the expensive 30% — are native Swift/Kotlin and port unchanged. Only the shell is rewritten. **This is the point of the architecture.**                                                                                                 |

---

## 6. Confidence and gaps

This ADR is desk research. It was produced with **no mobile toolchain on the development machine**, so nothing here was empirically measured: **no battery-drain figures, no on-device background-survival testing on aggressive OEMs, no BLE throughput numbers.** The section-3 claims rest on vendor documentation, package registries and the npm downloads API.

Two specific weaknesses to be honest about:

1. **RQ7 (comparable apps) is thin.** The spike's WebSearch budget was exhausted before hiring-signal research could run, and every direct careers-page fetch for Strava, Runna, Hevy and WHOOP failed. Their stacks are recorded as **unknown**, not guessed.
2. **Battery drain from real fitness apps is unmeasured.** No credible primary source was reachable, so no number appears in this document. The mitigation is Phase 2 task 10 below: a 3-hour physical-device soak test on Samsung and Xiaomi hardware **before** the recording core is considered done.

Neither gap changes the decision, because the decision does not rest on them — it rests on the RQ1 tie and the RQ5 asymmetry, both of which are firmly sourced. **Revisit this ADR if** the soak test shows Transistorsoft failing on target OEMs, if `react-native-ble-plx` goes unmaintained for 12+ months, or if we hire mobile engineers whose expertise is Dart or native.

---

## 7. Next steps

### 7.1 Purchases

| Item                                                                                     | Cost        | When                                                                                                                                                |
| ---------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| React Native Background Geolocation Premium Licence — <https://shop.transistorsoft.com/> | **$399**    | Before the first Android **release** build. Free in DEBUG, so not needed on day one. **Confirm per-bundle-ID scope and update policy at purchase.** |
| Polygon Geofencing (optional)                                                            | $399        | Phase 6 only, if Routes & Rivals needs polygon geofences                                                                                            |
| Apple Developer Program                                                                  | $99/yr      | Before TestFlight                                                                                                                                   |
| Google Play Developer                                                                    | $25 one-off | Before internal testing                                                                                                                             |

Not needed: the Firebase adapter ($149) — we sync to our own Fastify API.

### 7.2 Exact starting dependency set (verified 2026-08-03)

```jsonc
// apps/mobile/package.json — target versions
{
  "dependencies": {
    "expo": "~57.0.0", // SDK 57, 2026-06-30
    "react-native": "0.86.x", // 2026-06-11, no breaking changes
    "@apex/shared": "*", // ← the whole reason we chose RN
    "zod": "^4.1.12", // must match packages/shared

    "react-native-background-geolocation": "^5.4.0", // 2026-07-24 — recording core
    "react-native-background-fetch": "^4.x", // Transistorsoft companion

    "react-native-nitro-modules": "^0.36.5", // 2026-07-31 — our native modules
    "react-native-ble-plx": "^3.5.1", // 2026-02-18 — HR/power/cadence
    "@rnmapbox/maps": "^10.3.5", // 2026-07-22 — behind map adapter
    "@maplibre/maplibre-react-native": "^10.x", // vendor-neutral fallback

    "react-native-watch-connectivity": "^2.0.0", // 2026-03-20 — Phase 9
    "react-native-mmkv": "^3.x", // fast local persistence
    "@tanstack/react-query": "^5.x", // server state
    "expo-sensors": "*", // barometer, accelerometer
    "expo-secure-store": "*", // JWT storage
  },
}
```

### 7.3 Scaffold commands

```bash
# from the repo root — the mobile app joins the existing npm workspace
npx create-expo-app@latest apps/mobile --template blank-typescript
cd apps/mobile

# link the shared schema package (this is the decision, made concrete)
npm pkg set dependencies.@apex/shared="*"

# recording core
npx expo install react-native-background-geolocation react-native-background-fetch

# sensors, maps, storage, watch
npx expo install react-native-ble-plx @rnmapbox/maps react-native-mmkv \
                 expo-sensors expo-secure-store react-native-nitro-modules
npm i react-native-watch-connectivity @tanstack/react-query

# generate native projects — Expo Go cannot do background location
npx expo prebuild --clean

# dev client builds (requires macOS for iOS; Android buildable anywhere)
npx expo run:android
npx expo run:ios
```

Then, before writing a single feature:

1. Add to `app.json` → `expo.plugins`: the background-geolocation config plugin with `locationAlwaysAndWhenInUsePermission`, `isAndroidBackgroundLocationEnabled: true`, and the Android foreground-service declaration.
2. iOS: enable **Location updates** and **Uses Bluetooth LE Accessories** background modes; add `NSLocationAlwaysAndWhenInUseUsageDescription`, `NSMotionUsageDescription`, `NSBluetoothAlwaysUsageDescription` with the specific justification Apple's review requires.
3. Android: `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, `ACCESS_FINE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`, `ACTIVITY_RECOGNITION`, `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`; declare the foreground service type in Play Console → Policy → App content.
4. Add `apps/mobile` to root `tsconfig.base.json` path mapping so `@apex/shared` resolves at source level, matching `apps/api`.

---

## 8. Phase 2 mobile scope — the first 10 build tasks

Ordered so that the riskiest, least-reversible work lands first. Tasks 1–4 are the spike we could not run on this machine; **do not build product UI until task 10 passes.**

| #      | Task                                                                              | Deliverable                                                                                                                                                                                                                                                                            | Why here                                                                                                                                             |
| ------ | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1**  | **Scaffold `apps/mobile` and prove `@apex/shared` imports end to end**            | Dev-client builds on both platforms; a screen calls `POST /auth/*` using the _server's own_ zod schema for request and response validation; typecheck runs in the root `npm run typecheck`                                                                                             | Validates the entire premise of this ADR in one day. If this is awkward, we found out for £0.                                                        |
| **2**  | **Integrate the recording core with a licence-free DEBUG build**                  | `BackgroundGeolocation.ready()` configured; start/stop from a bare screen; points streaming to console with `distanceFilter`, `stopTimeout`, `stopOnTerminate: false`, `startOnBoot: true`                                                                                             | The single largest technical risk. Prove it before anything else.                                                                                    |
| **3**  | **Define the `ActivityRecorder` TypeScript interface and hide the SDK behind it** | `start / pause / resume / stop / getState`, an `onLocation` stream, a serialisable `RecordingSession`. **Nothing outside this module imports `react-native-background-geolocation`.**                                                                                                  | This is the migration escape hatch from §5. It only exists if we build it on day one, not month six.                                                 |
| **4**  | **Local-first recording store with crash/kill recovery**                          | MMKV/SQLite append-only point log written on every fix; on cold start, detect an unfinished session and offer resume; kill the app mid-run and lose nothing                                                                                                                            | PLAN.md's "never lose a recording." Non-negotiable, and it constrains the data model — so it comes before the data model is used.                    |
| **5**  | **Canonical stream model + sport taxonomy in `packages/shared`**                  | zod schemas for the §4.3 streams (lat/lng, altitude, HR, cadence, power, temp, velocity) and the ~70-value sport enum, **written once, used by API and app**                                                                                                                           | Renaming enums later is the trap §4.3 explicitly calls out. Shared package, not app-local.                                                           |
| **6**  | **GPS smoothing, outlier rejection and tunnel/canyon handling**                   | Kalman or equivalent filter + accuracy-gated point rejection, as a pure TS module in `packages/shared` with unit tests over recorded fixtures                                                                                                                                          | Pure logic, no device needed, testable in CI, reusable server-side for imported FIT/GPX files in Phase 3.                                            |
| **7**  | **Auto-pause + derived live metrics**                                             | Map the SDK's motion state to pause/resume; live pace, distance, elapsed vs moving time, splits, and the §4.3 GAP model — all in shared TS                                                                                                                                             | The metrics must match what the server computes on upload, or users see two different numbers for one run.                                           |
| **8**  | **Live recording screen with configurable data fields**                           | Start/pause/resume/stop, lock screen, foreground-service notification, sport picker, configurable metric tiles                                                                                                                                                                         | The first genuinely product-shaped task — deliberately eighth.                                                                                       |
| **9**  | **BLE HR strap pairing (GATT 0x180D)**                                            | Scan, pair, persist the device, live BPM into the stream, reconnect on drop; zones config                                                                                                                                                                                              | First sensor; proves the `react-native-ble-plx` risk from §3.2 early enough to act on it. Power (0x1818) and cadence (0x1816) follow the same shape. |
| **10** | **Physical-device OEM soak test — the Phase 2 gate**                              | 3-hour continuous recording on a **Samsung** and a **Xiaomi** device plus one iPhone: screen off, app backgrounded, app swiped from recents, airplane-mode tunnel simulation. Record battery drain %/hour and point loss. Ship an in-app battery-settings coach if kills are observed. | Closes the confidence gap in §6. **Phase 2 is not "done" until this passes on real hardware.**                                                       |

---

## Sources

**Background location (RQ1)**
<https://docs.transistorsoft.com/> ·
<https://shop.transistorsoft.com/> ·
<https://github.com/transistorsoft/react-native-background-geolocation> ·
<https://github.com/transistorsoft/react-native-background-geolocation/wiki/Philosophy-of-Operation> ·
<https://github.com/transistorsoft/react-native-background-geolocation/issues> ·
<https://github.com/transistorsoft/flutter_background_geolocation> ·
<https://pub.dev/packages/flutter_background_geolocation> ·
<https://docs.expo.dev/versions/latest/sdk/location/> ·
<https://docs.expo.dev/versions/latest/sdk/task-manager/> ·
<https://docs.expo.dev/versions/latest/sdk/background-task/> ·
<https://pub.dev/packages/geolocator> ·
<https://pub.dev/packages/flutter_foreground_task> ·
<https://developer.android.com/develop/background-work/services/fgs/service-types> ·
<https://dontkillmyapp.com/> ·
<https://dontkillmyapp.com/samsung> ·
<https://dontkillmyapp.com/xiaomi>

**Native modules (RQ1)**
<https://nitro.margelo.com/> · <https://github.com/mrousavy/nitro> · <https://docs.flutter.dev/platform-integration/platform-channels>

**BLE (RQ2)**
<https://github.com/dotintent/react-native-ble-plx> · <https://github.com/dotintent/react-native-ble-plx/releases> · <https://pub.dev/packages/flutter_blue_plus>

**Watch (RQ3)**
<https://github.com/mtford90/react-native-watch-connectivity> · <https://pub.dev/packages/watch_connectivity> · <https://pub.dev/packages/flutter_watch_os_connectivity>

**Maps (RQ4)**
<https://github.com/rnmapbox/maps> · <https://pub.dev/packages/mapbox_maps_flutter> · <https://github.com/maplibre/maplibre-react-native> · <https://pub.dev/packages/maplibre_gl> · <https://github.com/qiuxiang/react-native-amap3d> · <https://pub.dev/packages/amap_flutter_map>

**Codegen (RQ5)**
<https://openapi-generator.tech/docs/generators/dart-dio>

**Framework churn (RQ6)**
<https://reactnative.dev/blog> · <https://expo.dev/changelog> · <https://docs.flutter.dev/release/release-notes> · <https://flutter.dev/blog/whats-new-in-flutter-3-44>

**Precedent (RQ7)**
<https://reactnative.dev/showcase> · <https://flutter.dev/showcase> · <https://expo.dev/customers> · <https://www.kotlinlang.org/lp/multiplatform/case-studies/> · <https://github.com/komoot>

**Registry data** — npm registry + downloads API (`registry.npmjs.org`, `api.npmjs.org/downloads`), queried 2026-08-03.
