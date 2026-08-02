# @apex/api

Phase 1 backend — **Identity, Profiles & Privacy Core**. Fastify + Drizzle + Postgres.

The OpenAPI document is generated from the Zod schemas that also validate every
request, so `/docs` is the source of truth rather than a hand-maintained spec.

## Quick start

From the **repo root**:

```bash
npm install          # first time only
npm run dev          # boots embedded Postgres + API on http://localhost:3000
```

Then open:

- <http://localhost:3000/docs> — Swagger UI
- <http://localhost:3000/docs/json> — raw OpenAPI 3.1 document
- <http://localhost:3000/health> — liveness probe

No Docker and no local Postgres install are required. When `DATABASE_URL` is
unset, `npm run dev` downloads and runs real PostgreSQL 17 server binaries via
the `embedded-postgres` package (data dir `apps/api/.pgdata`, port 55432),
applies migrations, then starts the API. Set `DATABASE_URL` to point at your own
cluster and the embedded one is skipped entirely.

If the embedded cluster ever gets wedged, delete `apps/api/.pgdata` and restart —
it is disposable dev state and is gitignored.

## Tests

```bash
npm test                        # from the repo root (all workspaces)
npm test --workspace @apex/api  # just the API
```

Integration tests run against real Postgres, not a mock. The vitest global setup
starts one embedded cluster (`apps/api/.pgdata-test`, port 55433), migrates a
template database once, and each test file clones it into a fresh database —
so files are fully isolated and the whole suite still finishes in ~11s.

## Other commands

| Command                                   | What it does                                      |
| ----------------------------------------- | ------------------------------------------------- |
| `npm run typecheck`                       | `tsc --noEmit` across all workspaces              |
| `npm run db:generate`                     | Regenerate SQL migrations from `src/db/schema.ts` |
| `npm run db:migrate`                      | Apply migrations to `DATABASE_URL`                |
| `npm run format` / `npm run format:check` | Prettier                                          |

## Environment

Copy `.env.example` to `.env` at the repo root. `apps/api` reads it on boot;
real environment variables always win over the file. Config is parsed and
validated by Zod in `src/config.ts` — the process refuses to start with a
listing of every invalid variable rather than failing later at runtime. No
secret has a hardcoded fallback outside `src/dev.ts`, which generates throwaway
dev values and is never used in production.

| Variable                   | Required   | Default                        | Notes                                                                              |
| -------------------------- | ---------- | ------------------------------ | ---------------------------------------------------------------------------------- |
| `NODE_ENV`                 | no         | `development`                  | `development` \| `test` \| `production`                                            |
| `PORT`                     | no         | `3000`                         |                                                                                    |
| `HOST`                     | no         | `0.0.0.0`                      |                                                                                    |
| `LOG_LEVEL`                | no         | `info`                         | pino levels, or `silent`                                                           |
| `DATABASE_URL`             | yes (prod) | —                              | Unset in dev ⇒ embedded Postgres is started and the URL injected                   |
| `EMBEDDED_PG_PORT`         | no         | `55432`                        | Dev cluster only                                                                   |
| `EMBEDDED_PG_DATA_DIR`     | no         | `.pgdata`                      | Dev cluster only                                                                   |
| `JWT_SECRET`               | yes        | —                              | ≥32 chars; signs access tokens                                                     |
| `ACCESS_TOKEN_TTL_MINUTES` | no         | `15`                           |                                                                                    |
| `REFRESH_TOKEN_TTL_DAYS`   | no         | `30`                           |                                                                                    |
| `TOTP_ENCRYPTION_KEY`      | yes        | —                              | 64 hex chars (32 bytes); AES-256-GCM key for TOTP secrets at rest                  |
| `TOTP_ISSUER`              | no         | `Apex Fitness`                 | Label shown in authenticator apps                                                  |
| `MAIL_TRANSPORT`           | no         | `console`                      | `console` \| `noop` \| `memory` (a real provider lands with the mobile app)        |
| `MAIL_FROM`                | no         | `no-reply@apexfitness.example` |                                                                                    |
| `DEFAULT_REGION`           | no         | `global`                       | Region tag stamped on new users (China-fork readiness, PLAN §4.2)                  |
| `PUBLIC_BASE_URL`          | no         | `http://localhost:3000`        | Server URL advertised in the OpenAPI document                                      |
| `RATE_LIMIT_DISABLED`      | no         | `false`                        | Tests set `true` except in the rate-limit suite                                    |
| `EXPOSE_DEV_TOKENS`        | no         | `true`                         | Returns email-verification/reset tokens in responses. Forced `false` in production |

## Layout

```
src/
  app.ts          buildApp(): plugins, swagger, error handler, route registration
  config.ts       Zod-validated environment
  context.ts      AppContext: config, db, mail, mfaTickets
  server.ts       production entrypoint
  dev.ts          dev entrypoint (embedded pg + migrate + serve)
  db/             schema.ts, client.ts, migrate.ts, embedded.ts
  lib/            crypto, jwt, errors, mailer, time, env-file
  services/       users, sessions, totp, email-tokens, mfa-tickets, social
  plugins/        auth (requireAuth decorator)
  routes/         auth, me, privacy, social, gdpr, users
drizzle/          generated SQL migrations
test/             integration suites + embedded-pg global setup
```

## Conventions worth knowing

- **Canonical storage is metric + WGS-84 + UTC.** Conversion happens at the API
  edge using the helpers in `@apex/shared`; `bodyweight_entries.weight_kg` is
  always kilograms regardless of what the client sent.
- **Every table has `created_at`/`updated_at`,** and ids are UUIDv7 so they sort
  by creation time — which is what makes cursor pagination cheap.
- **Refresh tokens rotate and are stored hashed.** Sessions form a family;
  replaying an already-rotated token revokes the entire family (reuse
  detection). Access tokens are 15-minute JWTs.
- **Privacy defaults are restrictive:** profile and activity visibility default
  to `followers`, bodyweight is hidden, and privacy zones are enabled.
- **Blocked users get 404, not 403** — a 403 confirms the account exists.

## Not built yet (Phase 1 scope notes)

- Apple/Google sign-in: the `identities` table and provider-agnostic seam exist;
  `POST /auth/apple` and `POST /auth/google` return `501 oauth_not_configured`
  pending real developer credentials. The integration is not faked.
- Privacy-zone **auto-generation** from home/work addresses needs a geocoder and
  activity history; CRUD and the on-by-default flag are in place.
- Quiet mode is stored and exposed on the profile; it has no feed to affect
  until Phase 5.
