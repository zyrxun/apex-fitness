# @apex/api

Phases 1–2 backend — **Identity, Profiles & Privacy Core** plus the server side of
**Activity Recording**. Fastify + Drizzle + Postgres.

Recording itself happens on the phone; this service takes the finished session,
processes it, and owns everything after the upload.

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
so files are fully isolated and the whole suite (121 tests) still finishes in ~14s.

The processing pipeline is pure, so `test/processing.test.ts` exercises it
directly with no database at all; `test/fixtures/track.ts` builds deterministic
synthetic recordings (seeded PRNG, due-north tracks whose expected distance is
exact rather than approximate). Uploads are processed asynchronously, so the
harness exposes `awaitProcessed(activityId)` instead of polling.

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
| `APPLE_BUNDLE_ID`          | no         | —                              | iOS bundle identifier; enables `POST /auth/apple` (see below)                      |
| `APPLE_AUDIENCES`          | no         | —                              | Comma-separated extra `aud` values (a web Services ID, a second bundle id)         |
| `APPLE_JWKS_URL`           | no         | Apple's JWKS                   | Override only in tests                                                             |
| `ACTIVITY_QUEUE_MODE`      | no         | `serial`                       | `serial` (in-process worker) \| `inline` (run on the request). See below           |
| `DEFAULT_REGION`           | no         | `global`                       | Region tag stamped on new users (China-fork readiness, PLAN §4.2)                  |
| `PUBLIC_BASE_URL`          | no         | `http://localhost:3000`        | Server URL advertised in the OpenAPI document                                      |
| `RATE_LIMIT_DISABLED`      | no         | `false`                        | Tests set `true` except in the rate-limit suite                                    |
| `EXPOSE_DEV_TOKENS`        | no         | `true`                         | Returns email-verification/reset tokens in responses. Forced `false` in production |

### Sign in with Apple

`POST /auth/apple` implements the **native app flow**: the iOS client runs
`ASAuthorizationController`, then posts the resulting `identityToken` (plus
`fullName` on the very first authorization) here. The server verifies the token
against Apple's JWKS and issues the same JWT access token + rotating refresh
session as password login.

Only one value has to be filled in:

| Value             | Where to get it                                                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `APPLE_BUNDLE_ID` | developer.apple.com → **Certificates, Identifiers & Profiles → Identifiers →** your App ID → **Identifier** (e.g. `com.apexfitness.app`) |

The bundle id can be decided when the iOS app is created — it just has to match
the App ID that has the **Sign In with Apple** capability enabled, because Apple
stamps it into the token's `aud` claim. Until `APPLE_BUNDLE_ID` is set the route
returns `501 oauth_not_configured`.

A **web** sign-in flow (Sign in with Apple JS, or a browser redirect) would
additionally need a **Services ID** and a **.p8 private key** for the client
secret — neither is needed for the native app. When that day comes, add the
Services ID to `APPLE_AUDIENCES`.

Behaviour worth knowing:

- **The name is one-shot.** Apple releases `fullName` only on the first
  authorization and only to the client, so it is stored at account creation and
  never overwritten afterwards.
- **Verified-email linking.** An Apple sign-in whose `email_verified` claim is
  true and whose address matches an existing account links to that account
  rather than creating a second one; the existing password keeps working.
- **Private-relay addresses** (`@privaterelay.appleid.com`) are stored like any
  other email and flagged on the identity row.
- **Passwordless accounts.** Apple-only accounts have no `credentials` row.
  Password login for them fails with `use_social_login`, and account deletion
  accepts a fresh `appleIdentityToken` in place of the password.
- **TOTP still applies.** Apple is one strong factor; an enrolled authenticator
  still produces an `mfa_required` response.
- **Google is still 501.** `POST /auth/google` awaits its own credentials.

## Activity recording (Phase 2, server side)

The phone records the session and uploads it once, finished. Nothing streams
live and nothing is parsed from a file — FIT/TCX/GPX import is Phase 3.

| Route                         | Auth     | Notes                                                                |
| ----------------------------- | -------- | -------------------------------------------------------------------- |
| `GET /sports`                 | none     | The ~70-type taxonomy with category / GPS / pool / distance metadata |
| `POST /activities`            | required | Upload with streams. `201` on create, `200` replaying a `uploadId`   |
| `POST /activities/manual`     | required | No streams, no pipeline, lands `ready`                               |
| `GET /activities`             | required | Own activities, cursor paginated, filterable                         |
| `GET /activities/:id`         | optional | Detail + splits + swim lengths                                       |
| `PATCH /activities/:id`       | required | Name, description, sport, visibility, trainer flag                   |
| `DELETE /activities/:id`      | required | Soft delete                                                          |
| `GET /activities/:id/streams` | optional | `?keys=time,latlng,heartrate`; omit for everything stored            |
| `GET /users/:id/activities`   | optional | Someone else's **public** activities only                            |
| `GET /me/prs`                 | required | Best 1k / 5k / 10k / half / marathon                                 |
| `GET`/`PUT /me/hr-zones`      | required | Max HR + zone boundaries as % of max                                 |

**Uploads are idempotent.** The client generates a `uploadId` (unique per user)
before it starts recording, so an upload interrupted by a dead battery or a
killed app can be retried forever and still resolve to one activity — the retry
returns `200` with the original rather than creating a duplicate.

**Validation is strict up front.** Every stream must be index-aligned with
`time`, `time` must be non-decreasing, coordinates must be on Earth, moving time
cannot exceed elapsed, and a single upload is capped at 50 000 samples per
stream (~14 h at 1 Hz — beyond that the client decimates).

The record is created immediately with `processingStatus: "pending"` and the
heavy work is queued. `ACTIVITY_QUEUE_MODE=serial` runs a single in-process FIFO
worker — serial on purpose, since the pipeline is CPU-bound over large arrays
and N parallel jobs on one event loop would trade throughput for latency on
every other request. Everything sits behind the `QueueLike` interface in
`src/lib/queue.ts`, so moving to Redis + BullMQ is a config change rather than a
rewrite. If processing fails the activity stays visible with the client's own
aggregates, flagged `failed` with the error recorded.

### The pipeline

Pure functions in `src/processing/`: no database, no clock, no randomness, so
the same upload always yields the same activity — which is what makes both the
unit tests and a future reprocessing job trustworthy.

| Stage            | What happens                                                                                                                                                                                                                                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GPS cleanup**  | Fixes implying a speed above the sport's ceiling are dropped (12.5 m/s run, 30 m/s ride, 3.5 m/s swim), then a 5-sample **moving median** — median, not mean, because it deletes a spike instead of smearing it across its neighbours. The raw stream is stored untouched as `latlng`; the result is a second stream, `latlng_clean`. |
| **Distance**     | Haversine over the cleaned track; failing that, integrated velocity; failing that, the client's own figure spread evenly over time so indoor splits still work.                                                                                                                                                                       |
| **Moving time**  | The recorder's own pause flags win when present, otherwise speed below the sport threshold (0.5 m/s run, 1.0 m/s ride) counts as stopped.                                                                                                                                                                                             |
| **Elevation**    | 7-sample moving average over the barometric stream, then gain/loss accumulated with **±2 m hysteresis** — barometric drift and GNSS altitude jitter both sit under 2 m, and without the deadband a flat run "climbs" a few hundred metres.                                                                                            |
| **Splits**       | Per kilometre **and** per mile, both stored; the client picks by unit preference rather than recomputing.                                                                                                                                                                                                                             |
| **GAP**          | Grade-adjusted pace for the run category, using the **Minetti et al. (2002)** 5th-order cost-of-gradient polynomial, clamped to ±45%. Aggregated by summing _equivalent flat distance_ per split — adjusting the average gradient once would score an out-and-back as flat, when the climb costs far more than the descent refunds.   |
| **Aggregates**   | Average/max speed, HR, cadence, power; map summary downsampled to 200 points; start/end coordinates.                                                                                                                                                                                                                                  |
| **Time in zone** | Seconds in each of five HR zones from `/me/hr-zones` — explicit max HR, else 220−age, else a default.                                                                                                                                                                                                                                 |
| **Swim**         | SWOLF per length normalised to a **25 m** reference pool so a 50 m pool's numbers are comparable; pool lengths are authoritative for distance, since a pool swim has no GPS and the client counted the walls.                                                                                                                         |
| **Calories**     | **Keytel et al. (2005)** HR regression when heart rate and bodyweight are known, otherwise a MET estimate from the sport's compendium value.                                                                                                                                                                                          |
| **Best efforts** | Rolling window over cumulative distance for 1k/5k/10k/half/marathon, run category only (Phase 7 generalises this).                                                                                                                                                                                                                    |

### Privacy zones on activities

The differentiator, so it is enforced at read time rather than trusted to the
client. When a **non-owner** reads an activity:

- Every sample inside one of the owner's zones is nulled in **both** `latlng`
  and `latlng_clean`, at identical indices — the sample itself survives so
  heart rate, power and everything else stay index-aligned with `time`.
- Non-positional streams are untouched: they leak nothing about location.
- `startLatLng`, `endLatLng` and the map polyline are suppressed entirely, and
  the response is flagged `privacyRedacted: true`.
- Aggregates are **not** touched. A zone hides _where_, not _what_ — distance
  and pace are the point of the activity.
- The owner always sees everything.

The cut extends a random **0–200 m** past the configured radius. Stopping
exactly at the true edge would let anyone fetch a few activities that pass the
same house, take the convex hull of the surviving points, and read the zone
centre — which is the address the zone exists to hide. That offset must also be
_stable_: a fuzz redrawn per request averages out to the true boundary over a
handful of fetches, so a seed is persisted on the activity at creation and mixed
with the zone id (FNV-1a) to derive it.

## Layout

```
src/
  app.ts          buildApp(): plugins, swagger, error handler, route registration
  config.ts       Zod-validated environment
  context.ts      AppContext: config, db, mail, mfaTickets
  server.ts       production entrypoint
  dev.ts          dev entrypoint (embedded pg + migrate + serve)
  db/             schema.ts, client.ts, migrate.ts, embedded.ts
  lib/            crypto, jwt, errors, mailer, time, env-file, queue
  processing/     pure pipeline: geo, gps, smoothing, moving, elevation, splits,
                  gap, aggregates, hr-zones, swim, calories, efforts,
                  privacy-zones, thresholds, pipeline
  services/       users, sessions, totp, email-tokens, mfa-tickets, social, apple,
                  activities, activity-view, hr-zones
  plugins/        auth (requireAuth decorator)
  routes/         auth, me, privacy, social, gdpr, users, activities, sports
drizzle/          generated SQL migrations
test/             integration suites + embedded-pg global setup + fixtures/
```

Activity tables: `activities`, `activity_streams` (one row per activity ×
stream type, samples as a jsonb array), `activity_splits` (km and mile),
`swim_lengths`, `activity_efforts`, `hr_zone_settings`.

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
- **Visibility is snapshotted at creation,** not read live from the profile.
  Tightening the default later must not silently republish yesterday's runs, and
  loosening it must not retroactively expose them.
- **Nothing is hard-deleted on the athlete's behalf.** Activities soft-delete,
  and deleting an account forces every activity private as well as deleted, so
  nothing stays readable while the purge job is still Phase 3 work.

## Not built yet (Phase 1–2 scope notes)

- Google sign-in: `POST /auth/google` still returns `501 oauth_not_configured`
  pending developer credentials. The integration is not faked. Apple sign-in is
  implemented (see above).
- Apple **token revocation**: `authorizationCode` is accepted but not yet
  exchanged at `appleid.apple.com/auth/token`, so deleting an account does not
  revoke Apple's own grant. Apple requires this once the app ships.
- Privacy-zone **auto-generation** from home/work addresses needs a geocoder and
  activity history; CRUD and the on-by-default flag are in place.
- Quiet mode is stored and exposed on the profile; it has no feed to affect
  until Phase 5.
- **File import** (FIT / TCX / GPX) is Phase 3. Uploads are JSON only.
- **`followers`-visibility activities are invisible to everyone but the owner**
  until the follow graph lands in Phase 5 — `GET /users/:id/activities` returns
  public rows only. Marked `TODO(phase-5)` in `src/routes/activities.ts`, the
  same convention `GET /users/:id` uses.
- **Personal records** cover the five standard run distances by rolling window.
  Segments, ride/swim records and the full effort system are Phase 7.
- **DEM elevation correction** needs an elevation dataset; only barometric
  smoothing is in place.
- **The real queue.** `serial` is an in-process worker: jobs queued when the
  process dies are lost, and nothing retries. Redis + BullMQ arrives with
  ingestion volume in Phase 3 — the interface is already in the way.
