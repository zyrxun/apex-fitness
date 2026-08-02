# Apex Fitness — Master Plan & Implementation Checklist

A social fitness platform combining Strava-style endurance tracking (running, cycling, swimming) with Liftoff-style competitive weightlifting rankings — built to exploit the documented weaknesses of both incumbents.

**Research inputs:** [research/strava.md](research/strava.md) · [research/liftoff.md](research/liftoff.md) · [research/china-market-entry.md](research/china-market-entry.md)

---

## 1. Vision & Positioning

**One product, two engines:**

1. **Endurance engine** — GPS activity tracking, social feed, competitive leaderboards, and training analytics for run/ride/swim. Compete with Strava by being generous where Strava has become extractive.
2. **Strength engine** — logged lifts converted to estimated 1RM, normalized by bodyweight/sex/age, and ranked on percentile ladders. Compete with Liftoff by being rigorous where Liftoff is gamified-to-a-fault.

**Why now — the incumbents' self-inflicted wounds:**

| Grievance | Incumbent behavior | Our counter-position |
|---|---|---|
| API lockdown | Strava's Nov 2024 API crackdown broke third-party apps; sued Garmin over segments/heatmap patents (Sept 2025) | Free, open API from day one; one-click full data export |
| Paywall creep | Strava moved segment leaderboards, matched runs, route planning behind $79.99/yr | Full leaderboards, challenges, and annual recap free forever |
| Weak swimming | Strava treats swimming as an afterthought (no SWOLF, poor pool support) | First-class swimming: SWOLF, stroke detection, pool lengths, open-water |
| No coaching | Strava describes your training but never prescribes | Adaptive plans that react to logged training load |
| Privacy scar tissue | Heatmap military-base incident; opt-out defaults | Privacy-first defaults: private zones auto-on, opt-in aggregation |
| Pay-to-win ranks | Liftoff sells XP boosts ("shakes") that inflate rank | Ranks derive only from logged lifts — money can't buy rank |
| Hard paywall | Liftoff's 42-screen onboarding paywall, ~20% one-star reviews | Free core forever; premium adds depth, never gates identity |
| No age normalization | Liftoff ranks a 55-year-old against 25-year-olds | Foster/McCulloch age multipliers built in |

**Legal guardrail:** Strava holds patents around segments and heatmaps and has litigated them. Our competitive-route feature and aggregate maps must be *mechanically different* (see §4.5 and checklist Phase 6).

**Cold-start strategy:** import-first onboarding. Bulk import of Strava/Garmin archives (FIT/TCX/GPX) so a new user arrives with their entire history, PRs, and stats pre-populated.

---

## 2. Competitor Summaries

### Strava (full detail: [research/strava.md](research/strava.md))
- ~70 sport types; segments/KOM/QOM leaderboards; clubs; challenges; routes + global heatmap; Fitness & Freshness (CTL/ATL/TSB); Relative Effort (TRIMP); GAP; Beacon safety; 100+ device integrations.
- Monetization: free tier progressively hollowed out; $11.99/mo or $79.99/yr.
- Weaknesses to exploit: API hostility, paywall resentment, weak swim support, zero prescriptive coaching, privacy incidents, no strength-training story at all.

### Liftoff (full detail: [research/liftoff.md](research/liftoff.md))
- GymBros Inc., ~$6.5M ARR. Rank ladder Wood → Bronze → Silver → Gold → Platinum → Diamond → Champion → Titan → Olympian (24 divisions + open-ended Olympian >900 GSR).
- Ranks computed from bodyweight + estimated 1RM; no verification layer; heavy gamification (streaks, seasons, eggs, XP shakes).
- Anti-patterns to avoid: pay-to-win XP, hard paywall, soft standards on machine lifts, no age normalization.
- Build recipe validated: StrengthLevel-style regression standards, DOTS/Wilks/IPF-GL coefficients, multiple e1RM formulas, OpenPowerlifting as openly-licensed bootstrap dataset (StrengthLevel data is not licensable).

### China (full detail: [research/china-market-entry.md](research/china-market-entry.md))
- The GPS half of the product is effectively blocked for a foreign operator (licensed Chinese basemap + GCJ-02 required, foreign entities can't hold mapping qualification, trajectory data can't leave China, mainland entity required for everything, no global user graph, UGC video foreign-ineligible).
- Payments are the easy part (Apple IAP pays foreign banks; WeChat Pay/Alipay cross-border need no entity).
- **The viable China thesis is the strength product**: no GPS → sidesteps all map law; Chinese strength-logging category totals ~50k App Store ratings vs Keep's 2.95M and *nobody ranks lifters*. Entry paths: agent route 3–5 months / ~$40–75k; pilot-zone WFOE 9–12 months / ~$350–390k. First action regardless: file the China trademark (first-to-file).

---

## 3. Product Pillars & Differentiators

1. **Generous free tier** — everything Strava paywalled in 2020–2025 is free here: full segment-equivalent leaderboards, challenges, annual recap, route planning basics.
2. **Open platform** — public API, webhooks, one-click export, no rug-pulls. Court the developers Strava burned.
3. **Serious swimming** — SWOLF, stroke type detection, pool-length auto-detect, open-water GPS smoothing, drill logging.
4. **Verified, fair strength ranks** — physics-sane e1RM caps, video-verification tier for leaderboard tops, age/sex/bodyweight normalization, no purchasable rank.
5. **Prescriptive coaching** — adaptive training plans that consume the analytics engine (CTL/ATL/TSB) and adjust to real logged load.
6. **Privacy-first** — private zones on by default, aggregate features opt-in, granular per-activity visibility, no dark patterns.
7. **Low-pressure social mode** — optional "quiet mode" hiding pace/weight numbers from the feed; supportive, not comparative, for users intimidated by Strava culture.
8. **One identity across cardio + strength** — the runner who lifts twice a week gets one profile, one training load model, one recap. Nobody else does this.

---

## 4. Architecture Overview

### 4.1 Platform targets
- **Mobile:** iOS + Android (single codebase — React Native or Flutter; decide in Phase 0 spike). GPS recording must run as native background modules regardless of framework.
- **Watch:** Apple Watch (workout recording without phone), Wear OS; Garmin/Coros/Polar via file sync integrations first.
- **Web:** analysis dashboard, route planner, club admin, account/data management.

### 4.2 Backend
- API gateway + services: identity, activities, ingestion, social graph, feed, leaderboards, strength-ranking, training-analytics, notifications, media.
- Postgres (+PostGIS) as system of record; Redis for feeds/leaderboards; object storage for raw activity files and media; queue-based ingestion pipeline (upload → parse → normalize → derive metrics → publish to feed/leaderboards).
- Time-series/derived-metrics store for streams (HR, power, pace, cadence).
- **China-fork readiness (day-one decisions, cheap now, impossible later):** region tag on every user/activity row; no hard-coded single-region assumptions in the identity service; map-provider abstraction layer (Mapbox/OSM today, Amap adapter later); coordinate-system abstraction (WGS-84 internally, display-layer transform hook for GCJ-02).

### 4.3 Activity data model
- Canonical internal activity format; parsers for FIT, TCX, GPX (import); exporters for the same (open-data commitment).
- Streams model: per-second/per-point arrays for lat/lng, altitude, HR, cadence, power, temperature, velocity.
- Sport-type taxonomy superset of Strava's ~70 types from day one (cheap; renaming enums later is not).

### 4.4 Strength ranking engine (the crown jewel — spec from research/liftoff.md)
- **e1RM:** Epley `w×(1+r/30)` as default, averaged with Brzycki `w×36/(37−r)` (guard r=37) and Wathan; **hard cap: sets >10 reps are logged but never rank-eligible**.
- **Normalization:** percentile within (sex × bodyweight) cohort via regression/allometric smoothing; DOTS available for absolute cross-bodyweight leaderboards (4th-degree polynomial, both sexes, clamp BW 40–210 kg M / 40–150 kg F).
- **Ladder:** percentiles 5/20/50/80/95 → Beginner / Novice / Intermediate / Advanced / Elite, per exercise and overall.
- **Age:** flat 1.00 for 23–40; Foster multipliers 14–23; McCulloch 40+.
- **Storage:** small coefficient sets per (exercise × sex) — new exercises are a data insert, not a code change.
- **Bootstrap data:** OpenPowerlifting dump for SBD; extend to accessory lifts with our own telemetry over time.
- **Schema trap fixed on day one:** dumbbell lifts store per-hand weight + hand-count explicitly (Liftoff's single-vs-pair ambiguity corrupts their data).
- **Anti-cheat:** physics-sanity bounds vs world records, velocity-of-progress anomaly detection, optional video verification for top-percentile leaderboard placement.

### 4.5 Segments-alternative — design around Strava's patents
- Do **not** clone user-drawn start/finish segments with all-time KOM tables.
- Instead: **time-boxed "Routes & Rivals"** — system-generated popular routes with weekly/monthly rotating leaderboards, head-to-head challenges, and effort-matched divisions. Different mechanism, arguably better product (fresh competition, no decade-old unbeatable times), and distinct from the litigated claims. Formal FTO legal review before build (checklist Phase 6).

---

## 5. Monetization

**Free forever:** recording all sports, full social feed, leaderboards, challenges, strength ranks, basic analytics, annual recap, import/export, API access.

**Premium (~$6.99/mo, $49.99/yr — undercut Strava):**
- Adaptive training plans & prescriptive coaching
- Deep analytics (power curves, multi-year trends, fatigue modeling)
- Advanced route planning (surface type, elevation optimization)
- Live tracking/safety sharing beyond the free basic Beacon-equivalent
- Video verification badge + verified leaderboard tier
- Custom club competitions & admin tools

**Never:** rank/XP purchases, paywalled historical data, export fees, API fees at hobbyist scale.

**China (if/when):** model on Keep's findings — virtual events with physical medals and hardware/merch monetize better than subscriptions in China; Apple IAP at 25%/12% commission pays foreign banks directly.

---

## 6. China Strategy (deliberately sequenced last)

- **Now (costs almost nothing):** file China trademark (first-to-file); keep the day-one architecture decisions in §4.2.
- **Phase 2 decision gate:** if entering, enter with the **strength product only** — no GPS, no basemap, no coordinate transform, empty competitive category (~60× rating-count gap vs Keep). Agent/publisher route first (3–5 months, ~$40–75k) before committing to a WFOE.
- **Requirements if entering:** China backend fork, real-name signup (PRC mobile), minors' mode, Chinese-language moderation team, photo-only feed (no UGC video — licence is foreign-ineligible), IP-location display, algorithm filing, Software Copyright Certificate.
- **Never:** serve Chinese users from the global backend, sync PRC trajectories overseas, or include PRC territory in global heatmaps.

---

## 7. THE MASTER CHECKLIST

Work through in order; phases 1–4 are the MVP line. Items marked 🇨🇳 are China-track and can be deferred without blocking anything else.

### Phase 0 — Foundation & Infrastructure
- [ ] Choose mobile stack (React Native vs Flutter) via 1-week GPS-background-recording spike on both
- [ ] Monorepo setup (mobile, web, backend, shared types), CI/CD, trunk-based workflow
- [ ] Provision cloud infra (staging + prod), IaC from day one
- [ ] Postgres + PostGIS, Redis, object storage, message queue
- [ ] Observability: structured logging, tracing, error reporting, uptime alerts
- [ ] API gateway + service skeleton; OpenAPI spec as source of truth
- [ ] Design system & component library (mobile + web)
- [ ] Region/tenant tag on all user-owned tables (China-fork readiness)
- [ ] Map-provider abstraction layer (Mapbox/OSM adapter first)
- [ ] Coordinate-system abstraction (WGS-84 canonical; display-transform hook)
- [ ] File China trademark 🇨🇳 (first-to-file — do this in week 1, ~$500)
- [ ] Domain, app-store developer accounts (Apple, Google Play), brand assets

### Phase 1 — Identity, Profiles & Privacy Core
- [ ] Signup/login: email, Apple, Google; 2FA
- [ ] Profile: name, photo, bio, sex, DOB (needed for age multipliers), bodyweight log with history
- [ ] Units preference (metric/imperial) everywhere
- [ ] Privacy model: per-activity visibility (public / followers / private), profile visibility
- [ ] **Privacy zones ON by default** (auto-generated around home/work addresses)
- [ ] Granular stats hiding (hide weight, hide pace, hide HR independently)
- [ ] Quiet mode (low-pressure social: hides comparative numbers in feed)
- [ ] GDPR tooling: full data export (one click), account deletion, consent management
- [ ] Blocking, reporting, muting

### Phase 2 — Activity Recording (Endurance)
- [ ] Native GPS background recording module (iOS + Android): start/pause/auto-pause/resume/stop
- [ ] Battery-optimized location sampling; tunnel/canyon signal-loss handling
- [ ] GPS smoothing & outlier rejection pipeline
- [ ] Sport-type taxonomy (~70 types, superset of Strava's enums)
- [ ] **Run:** pace, splits, cadence, GAP (grade-adjusted pace) model
- [ ] **Ride:** speed, power meter pairing (BLE), cadence sensors
- [ ] **Swim (first-class):** pool mode (length count, auto lap detect, SWOLF, stroke type), open-water mode (GPS smoothing tuned for water), drill/kick logging
- [ ] Indoor modes: treadmill (accelerometer distance), trainer, indoor swim without GPS
- [ ] Heart-rate: BLE strap pairing + watch HR ingestion; zones config
- [ ] Elevation: barometric + DEM-corrected elevation profiles
- [ ] Live recording screen with configurable data fields
- [ ] Beacon-equivalent live safety sharing (free, basic)
- [ ] Auto-detect activity start (optional)
- [ ] Manual activity entry (no GPS)
- [ ] Crash/kill recovery — never lose a recording

### Phase 3 — Ingestion, Import & Device Ecosystem
- [ ] FIT, TCX, GPX parsers → canonical activity format
- [ ] FIT/TCX/GPX exporters (open-data commitment)
- [ ] **Bulk archive import: Strava export ZIP and Garmin archive → full history, one upload** (cold-start weapon)
- [ ] Dedupe engine (same activity from two sources)
- [ ] Garmin Connect API integration (auto-sync)
- [ ] Apple Health / HealthKit read+write
- [ ] Health Connect (Android) read+write
- [ ] Wahoo, Coros, Polar, Suunto integrations
- [ ] Zwift & smart-trainer virtual ride ingestion
- [ ] Ingestion pipeline: upload → parse → normalize → derive metrics → fan out (queued, retryable)
- [ ] Historical PR/stats recomputation after bulk import

### Phase 4 — Strength Logging & Ranking Engine
- [ ] Exercise library (barbell/dumbbell/machine/bodyweight; tagged by muscle group & equipment)
- [ ] **Dumbbell schema: per-hand weight + hand count explicit** (fix Liftoff's data-corruption trap in v1 schema)
- [ ] Workout logger: fast set entry (weight × reps), rest timer, supersets, templates, plate calculator
- [ ] Previous-performance surfacing during logging ("last time: 100×5")
- [ ] e1RM engine: Epley default averaged with Brzycki (guard r=37) + Wathan; **>10 reps never rank-eligible**
- [ ] All-time best e1RM per (user × exercise), recomputed on edit/delete
- [ ] Bodyweight history model (rank uses bodyweight at time of lift)
- [ ] Coefficient storage: per (exercise × sex) regression/allometric parameter sets
- [ ] Percentile engine: percentile within (sex × bodyweight) cohort, smoothed
- [ ] Rank ladder: 5/20/50/80/95 → Beginner/Novice/Intermediate/Advanced/Elite (per-exercise + overall)
- [ ] Age multipliers: flat 1.00 at 23–40, Foster (14–23), McCulloch (40+)
- [ ] DOTS calculator (both-sex polynomials, BW clamps 40–210 kg M / 40–150 kg F) for absolute leaderboards
- [ ] Bootstrap standards from OpenPowerlifting dump (SBD + OHP); document license attribution
- [ ] Telemetry loop: refine per-exercise standards from our own logged data over time
- [ ] Anti-cheat v1: physics bounds vs world records, progress-velocity anomaly flags
- [ ] Video verification tier (upload → review → verified badge; required for top-percentile leaderboard placement)
- [ ] Strength ↔ endurance unified profile (one training-load model across both)

### Phase 5 — Social Layer
- [ ] Follow graph (asymmetric) + optional friend (mutual) layer
- [ ] Activity feed: followed users, chronological default, optional ranked toggle (algorithm off-switch is also a China requirement 🇨🇳)
- [ ] Kudos/reactions + comments (with moderation tooling)
- [ ] Photos on activities; activity share cards (Instagram-story render)
- [ ] Clubs: create/join, club feed, club leaderboards, admin roles, events
- [ ] Group activity detection ("did this with…")
- [ ] Notifications: push + in-app, granular preferences
- [ ] Direct messaging (defer if needed — not MVP-critical)
- [ ] Content moderation: report queues, automated NSFW/abuse filtering, audit log
- [ ] Feed privacy honoring all Phase-1 visibility rules (test matrix!)

### Phase 6 — Competitive Layer
- [ ] **Legal: freedom-to-operate review vs Strava segment/heatmap patents before building this phase**
- [ ] "Routes & Rivals": system-generated popular routes (clustering from opt-in aggregate data)
- [ ] Rotating leaderboards (weekly/monthly reset — no stale all-time KOMs)
- [ ] Effort-matched divisions (by pace/power cohort, not one global table)
- [ ] Head-to-head challenges (challenge a friend on a route/distance/duration)
- [ ] Strength leaderboards: per-exercise, DOTS absolute, filterable by sex/age-class/weight-class/region/gym
- [ ] Gym-vs-gym team competitions
- [ ] Challenges: distance/elevation/streak/e1RM-total challenges, badges — **all free**
- [ ] Goals: weekly/annual distance, time, elevation, strength targets
- [ ] Seasons for strength ranks (soft reset with placement, à la Liftoff Jan/May/Sep — but no purchasable boosts, ever)
- [ ] Local legends-style frequency crown (distinct mechanic from Strava's — include in FTO review)

### Phase 7 — Training Analytics & Coaching
- [ ] Training load: TRIMP-based Relative Effort equivalent
- [ ] Fitness/Fatigue/Form: CTL/ATL/TSB model with charts
- [ ] Power analytics: FTP estimate, power curve, W' balance
- [ ] Running: VO2max estimate, race-time predictor, GAP trends
- [ ] Swim analytics: SWOLF trends, stroke efficiency, CSS (critical swim speed)
- [ ] Strength analytics: volume/tonnage trends, e1RM progression curves, muscle-group balance
- [ ] Personal records: auto-detected PRs across all sports, PR timeline
- [ ] Annual recap ("Year in Sport" equivalent) — **free**
- [ ] Weekly/monthly summary emails & in-app reports
- [ ] **Premium: adaptive training plans** (5K→marathon, century, swim, strength blocks) that adjust to logged load & missed sessions
- [ ] Premium: fatigue-aware daily workout suggestions across cardio + strength (the unified-profile payoff)

### Phase 8 — Routes & Maps
- [ ] Map rendering via abstraction layer (Mapbox/OSM)
- [ ] Route builder (web first): draw, snap-to-path, elevation profile, surface type
- [ ] Route library: save, share, star; GPX export
- [ ] Popular-route suggestions from opt-in aggregate data (**opt-in, not opt-out** — privacy differentiator; mechanically distinct from Strava heatmap, include in FTO review)
- [ ] Turn-by-turn route following in recording mode
- [ ] Offline map tiles for recording without signal
- [ ] 3D flyover replay share asset (viral loop)

### Phase 9 — Watch & Wearable Apps
- [ ] Apple Watch app: standalone recording (no phone), all core sports, offline sync
- [ ] Watch complications & always-on recording display
- [ ] Wear OS app: recording + sync
- [ ] Strength mode on watch: set logging, rest timer, auto-rep-detection spike
- [ ] Garmin Connect IQ data field / app (meet Garmin users where they are)

### Phase 10 — Open Platform & API
- [ ] Public REST API: activities, streams, profile, ranks (OAuth2)
- [ ] Webhooks for activity events
- [ ] Developer portal: docs, API keys, sandbox
- [ ] **Public API fairness pledge** (rate limits generous & published; no retroactive lockouts — direct counter-position to Strava Nov 2024)
- [ ] Embeddable widgets (activity card, rank badge) for blogs/forums
- [ ] Zapier/IFTTT-style integration recipes

### Phase 11 — Monetization
- [ ] Subscription infra: StoreKit 2, Google Play Billing, Stripe (web)
- [ ] Free/premium entitlement service; graceful downgrade (no data hostage-taking)
- [ ] Premium onboarding — **soft sell, skippable in one tap** (anti-Liftoff)
- [ ] Trial: 30-day full premium, no card required
- [ ] Family/duo plan; student pricing
- [ ] Receipt validation, refunds, dunning, win-back flows
- [ ] Revenue analytics dashboard

### Phase 12 — Trust, Safety & Compliance (Global)
- [ ] GDPR/CCPA compliance audit; DPA, privacy policy, ToS
- [ ] Minors policy (16+ or guardian consent; no minors on public leaderboards)
- [ ] Health-data handling review (HealthKit/Health Connect terms; never sell health data — say so loudly)
- [ ] Security: pen test, dependency scanning, secrets management, SOC2 roadmap
- [ ] Abuse/anti-spam systems for feed and DMs
- [ ] Accessibility audit (WCAG AA web, platform a11y mobile)
- [ ] Localization framework + first languages (EN, ES, DE, FR, PT, JA)

### Phase 13 — Launch & Growth Ops
- [ ] Closed beta (500 users) → open beta; feedback loops in-app
- [ ] App Store / Play Store ASO: listings, screenshots, preview videos
- [ ] Import-first onboarding funnel polish (time-to-wow < 3 minutes with full history)
- [ ] Referral program (premium months for invites — never rank boosts)
- [ ] Club seeding program: recruit 100 running/cycling/lifting clubs pre-launch
- [ ] Content: strength-standards calculator as free SEO web tool (rank-checker virality, à la StrengthLevel)
- [ ] Community: Discord/subreddit presence; changelog culture; public roadmap
- [ ] Analytics: activation/retention/resurrection funnels, cohort dashboards
- [ ] Support: help center, in-app support, escalation runbook
- [ ] Status page + incident process

### Phase 14 — China Track 🇨🇳 (strength-product-first; gated on Phase 4 success)
- [ ] ~~China trademark~~ (done in Phase 0 — verify registration issued)
- [ ] Go/no-go decision memo: agent route vs pilot-zone WFOE (use research/china-market-entry.md §8)
- [ ] Select publishing agent OR incorporate pilot-zone WFOE (Hainan/Shenzhen/Lin-gang/Beijing)
- [ ] Legal opinion: B25 sub-category mapping for strength product (publishing/delivery vs community platform — determines WFOE viability)
- [ ] China backend fork: mainland hosting, isolated account system, region-tagged data plane
- [ ] Strip GPS/map features from China build entirely (strength + non-GPS cardio only)
- [ ] Real-name signup via PRC mobile number; IP-location display in UI
- [ ] Minors' mode (time caps, curfew, visibility restrictions)
- [ ] Photo-only feed (no UGC video); Chinese-language moderation team + tooling
- [ ] Software Copyright Certificate (Chinese manual + source pages)
- [ ] ICP Filing → PSB Filing → MIIT App Filing → B25 licence (via agent or own entity)
- [ ] Algorithm recommendation filing with CAC; recommendation off-switch
- [ ] PIPL: separate consents (sensitive PI + any cross-border), PIPIA, domestic representative
- [ ] Apple CN App Store submission; Android: Huawei AppGallery + vivo + Tencent MyApp + Xiaomi + OPPO (SCC + per-store billing SDKs)
- [ ] Payments: Apple IAP (25%/12%); WeChat Pay + Alipay cross-border merchant accounts
- [ ] China monetization experiment: virtual strength events with physical medals (the Keep playbook)

---

## 8. Sequencing & MVP Definition

**MVP = Phases 0–4 + minimal slices of 5 and 7:** record run/ride/swim, import full Strava/Garmin history, log lifts, see your strength rank, follow friends, feed + kudos, PRs and basic charts. Ship the MVP to closed beta before building the competitive layer — leaderboards with 50 users are worse than no leaderboards.

**The two riskiest bets to validate earliest:**
1. Import-first onboarding actually wows Strava refugees (test in week one of beta).
2. Strength ranks feel fair and motivating with OpenPowerlifting-bootstrapped standards (test with lifters before building seasons/leaderboards on top).

**Deliberately deferred:** DMs, Wear OS, 3D flyovers, gym-vs-gym, China track — none block the core loop.
