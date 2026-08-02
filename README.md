# Apex Fitness

**The app for hybrid athletes** — people who run _and_ lift. Strava-grade endurance tracking (running, cycling, swimming) fused with Liftoff-grade competitive strength rankings into one profile, one training-load model, and one rank that requires both: the **Apex Score**.

## Status

🚧 **Phase 1 backend in progress** — Identity, Profiles & Privacy Core. The API
(auth with 2FA, profiles, bodyweight history, privacy model, privacy zones,
blocking/muting/reporting, GDPR export + deletion) is implemented and covered by
integration tests against real Postgres. Mobile and web clients have not started.

See [apps/api/README.md](apps/api/README.md) to run it, and [PLAN.md](PLAN.md)
for competitor research and the full implementation checklist.

```bash
npm install
npm run dev    # http://localhost:3000/docs
npm test
```

### Repo layout

| Path              | What                                               |
| ----------------- | -------------------------------------------------- |
| `apps/api`        | Fastify + Drizzle + Postgres backend               |
| `packages/shared` | Zod schemas, shared types, unit-conversion helpers |
