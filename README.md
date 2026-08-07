# Apex Fitness

**The app for hybrid athletes** — people who run _and_ lift. Strava-grade endurance tracking (running, cycling, swimming) fused with Liftoff-grade competitive strength rankings into one profile, one training-load model, and one rank that requires both: the **Apex Score**.

## Status

🚧 **Phase 1 backend in progress** — Identity, Profiles & Privacy Core. The API
(auth with 2FA, profiles, bodyweight history, privacy model, privacy zones,
blocking/muting/reporting, GDPR export + deletion) is implemented and covered by
integration tests against real Postgres.

📱 **Phase 2 mobile just started** — `apps/mobile` is scaffolded per
[ADR 0001](docs/decisions/0001-mobile-stack.md) (Expo dev-client + React
Native) and imports `@apex/shared` end to end. The native recording core
(`react-native-background-geolocation`, licence-free in DEBUG) is wired up
behind the `ActivityRecorder` interface; the mock recorder remains as the test
double and as the fallback for builds with no native module. Nothing has run on
a device yet. No web client yet.

See [apps/api/README.md](apps/api/README.md) and
[apps/mobile/README.md](apps/mobile/README.md) to run them, and
[PLAN.md](PLAN.md) for competitor research and the full implementation
checklist.

```bash
npm install
npm run dev    # http://localhost:3000/docs
npm test
```

### Repo layout

| Path              | What                                                |
| ----------------- | --------------------------------------------------- |
| `apps/api`        | Fastify + Drizzle + Postgres backend                |
| `apps/mobile`     | Expo / React Native app — scaffold + recording core |
| `packages/shared` | Zod schemas, shared types, unit-conversion helpers  |
