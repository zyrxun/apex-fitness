# Apex Fitness — Master Plan & Implementation Checklist

**The app for hybrid athletes** — people who run *and* lift. Strava-grade endurance tracking (running, cycling, swimming) fused with Liftoff-grade competitive strength rankings into one profile, one training-load model, and one rank that requires both.

**Research inputs:** [research/strava.md](research/strava.md) · [research/liftoff.md](research/liftoff.md) · [research/china-market-entry.md](research/china-market-entry.md)

---

## 1. Vision & Positioning

### The wedge: the hybrid athlete

Strava has no strength story at all; Liftoff has no cardio story at all. Meanwhile the fastest-growing segment in fitness is people who do both — Hyrox sells out global events, CrossFit normalized "strong *and* conditioned," and every gym is full of runners who lift. Those people currently run two apps that don't know about each other, and neither can answer the question they actually care about: **"am I fit?"** — not "am I fast" or "am I strong."

We are not "Strava but cheaper" or "Liftoff but fair." We are the only app for a group both incumbents structurally ignore — a position neither can copy without becoming the other.

**The flagship mechanic: the Apex Score.** A combined rank where your engine (pace/VO2max-proxy percentiles) and your strength (e1RM percentiles) both feed one number — and you can't max it by being one-dimensional. A 180kg-squatter who can't run a mile and a 2:50 marathoner who can't do a pull-up both rank *Intermediate overall*. Inherently viral ("what's your Apex Score?"), and structurally uncopyable by either incumbent.

**The technical moat: one fatigue model across both.** Strava's Fitness & Freshness only sees cardio; every lifting app ignores systemic fatigue from running. A training-load engine that knows Tuesday's heavy squats are why Thursday's tempo run felt terrible — and adjusts your plan accordingly — is something neither company can ship without becoming the other.

**The identity wedge:** Strava culture intimidates lifters; lifting culture intimidates runners. Percentile-based ranks fix both — you're only ever compared to your cohort (sex, bodyweight, age), never to elites. *The app where being a beginner at your second sport is the point.*

**Two engines underneath:**

1. **Endurance engine** — GPS activity tracking, social feed, competitive leaderboards, and training analytics for run/ride/swim. Generous where Strava has become extractive.
2. **Strength engine** — logged lifts converted to estimated 1RM, normalized by bodyweight/sex/age, and ranked on percentile ladders. Rigorous where Liftoff is gamified-to-a-fault.

**Tailwinds — the incumbents' self-inflicted wounds (secondary positioning):**

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

1. **The Apex Score** — one combined rank requiring both engine and strength; percentile-normalized by sex/bodyweight/age so beginners compete in their cohort, not against elites. The flagship mechanic and the viral loop.
2. **Unified hybrid training load** — one fatigue model (CTL/ATL/TSB extended with strength tonnage/intensity) across all training; the analytics and coaching moat.
3. **Hybrid competition formats** — combined-event challenges ("5k time + DOTS-adjusted deadlift total"), Hyrox-style scored simulations, alternating engine/iron seasons. Formats neither incumbent can host.
4. **Cross-modality team leagues** — a run crew, a CrossFit box, and a powerlifting gym enter the same league because scoring is percentile-normalized. Strava's stickiest loop (local rivalry), multiplied across venues.
5. **Verified, fair strength ranks** — physics-sane e1RM caps, video-verification tier for leaderboard tops, no purchasable rank ever.
6. **Generous free tier & open platform** — everything Strava paywalled in 2020–2025 is free; public API, webhooks, one-click export, no rug-pulls. Court the developers Strava burned.
7. **Serious swimming** — SWOLF, stroke type detection, pool-length auto-detect, open-water GPS smoothing, drill logging.
8. **Prescriptive hybrid coaching** — adaptive plans that consume the unified load model and adjust when lifting fatigue hits running (and vice versa). The premium product.
9. **Privacy-first** — private zones on by default, aggregate features opt-in, granular per-activity visibility, no dark patterns.
10. **Low-pressure by design** — cohort ranks + optional "quiet mode" hiding raw numbers; the app where being a beginner at your second sport is the point.

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

### 4.4b Apex Score engine (the flagship)
- **Inputs:** strength percentile (best e1RM percentiles across core lifts, cohort-normalized) + engine percentile (pace/power/VO2max-proxy percentiles across endurance sports, cohort-normalized).
- **Combination rule:** designed so one-dimensionality caps the score — e.g. weighted toward the *lower* of the two components (exact curve to be tuned in beta; a pure average lets a specialist coast). Elite overall must require at least Advanced in both.
- **Cohorts:** same normalization stack as strength ranks — sex × bodyweight × age multipliers — so the score is fair at every body type and age.
- **Freshness:** engine component decays without recent training (strength decays slower, mirroring physiology) so the score reflects current fitness, not career bests.
- **Output:** one number + the Beginner→Elite ladder, with a two-axis breakdown (engine/strength) on the profile — the shareable identity object of the whole product.

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
- [ ] Signup/login: email, Apple, Google; 2FA — *(email + TOTP 2FA backend done, mobile pending; Apple/Google seam built — `identities` table + routes — but returns 501 until we hold developer credentials)*
- [ ] Profile: name, photo, bio, sex, DOB (needed for age multipliers), bodyweight log with history — *(backend done, mobile pending; photo is a URL field, upload pipeline pending)*
- [ ] Units preference (metric/imperial) everywhere — *(backend done, mobile pending; canonical metric storage + conversion at the edge)*
- [ ] Privacy model: per-activity visibility (public / followers / private), profile visibility — *(backend done, mobile pending; per-activity enforcement lands with Phase 2 activities)*
- [ ] **Privacy zones ON by default** (auto-generated around home/work addresses) — *(backend done, mobile pending: zone CRUD + on-by-default flag; auto-generation needs a geocoder and activity history, and geo-fuzzing applies in Phase 2)*
- [ ] Granular stats hiding (hide weight, hide pace, hide HR independently) — *(backend done, mobile pending)*
- [ ] Quiet mode (low-pressure social: hides comparative numbers in feed) — *(backend done, mobile pending: profile flag stored and exposed; no feed to suppress until Phase 5)*
- [ ] GDPR tooling: full data export (one click), account deletion, consent management — *(backend done, mobile pending: `GET /me/export` + `DELETE /me/account` with anonymisation; consent is currently the aggregate-data opt-in flag)*
- [ ] Blocking, reporting, muting — *(backend done, mobile pending)*

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
- [ ] **Apex Score v1: engine percentile + strength percentile → combined rank** (lower-component-weighted curve; two-axis profile breakdown)
- [ ] Apex Score freshness decay (engine decays faster than strength without training)
- [ ] Apex Score share card (the "what's your Apex Score?" viral asset)

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
- [ ] Apex Score leaderboards (global/regional/club, cohort-filtered)
- [ ] **Hybrid combined-event challenges** ("5k time + DOTS deadlift total", monthly hybrid ladders)
- [ ] Hyrox-style scored simulation format (run + functional stations, self-recorded at any gym)
- [ ] Alternating "engine week / iron week" seasonal structure
- [ ] **Cross-modality team leagues** — run crews, CrossFit boxes, and powerlifting gyms in one percentile-normalized league (supersedes gym-vs-gym only)
- [ ] Challenges: distance/elevation/streak/e1RM-total challenges, badges — **all free**
- [ ] Goals: weekly/annual distance, time, elevation, strength targets
- [ ] Seasons for strength ranks (soft reset with placement, à la Liftoff Jan/May/Sep — but no purchasable boosts, ever)
- [ ] Local legends-style frequency crown (distinct mechanic from Strava's — include in FTO review)

### Phase 7 — Training Analytics & Coaching
- [ ] Training load: TRIMP-based Relative Effort equivalent for endurance
- [ ] Strength load quantification (tonnage × intensity-relative-to-e1RM → comparable load units)
- [ ] **Unified Fitness/Fatigue/Form: CTL/ATL/TSB model fed by BOTH endurance and strength load** (the hybrid moat — squats on Tuesday explain the bad tempo run on Thursday)
- [ ] Power analytics: FTP estimate, power curve, W' balance
- [ ] Running: VO2max estimate, race-time predictor, GAP trends
- [ ] Swim analytics: SWOLF trends, stroke efficiency, CSS (critical swim speed)
- [ ] Strength analytics: volume/tonnage trends, e1RM progression curves, muscle-group balance
- [ ] Personal records: auto-detected PRs across all sports, PR timeline
- [ ] Annual recap ("Year in Sport" equivalent) — **free**
- [ ] Weekly/monthly summary emails & in-app reports
- [ ] **Premium: adaptive HYBRID training plans** (Hyrox prep, run-plus-lift blocks, 5K→marathon, century, swim, strength blocks) that adjust to unified logged load & missed sessions
- [ ] Premium: fatigue-aware daily workout suggestions across cardio + strength (the unified-model payoff)

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

**MVP = Phases 0–4 + minimal slices of 5 and 7:** record run/ride/swim, import full Strava/Garmin history, log lifts, see your strength rank **and your Apex Score**, follow friends, feed + kudos, PRs and basic charts. The Apex Score is in the MVP because it *is* the product thesis — everything else is table stakes. Ship to closed beta before building the competitive layer — leaderboards with 50 users are worse than no leaderboards.

**The three riskiest bets to validate earliest:**
1. The Apex Score lands — hybrid athletes see their number, understand it, and share it (test the combination curve with real imported data in week one).
2. Import-first onboarding actually wows Strava refugees (a Strava import alone should produce a meaningful engine percentile immediately).
3. Strength ranks feel fair and motivating with OpenPowerlifting-bootstrapped standards (test with lifters before building seasons/leaderboards on top).

**Beta recruiting follows the wedge:** seed with Hyrox training groups, CrossFit boxes, and run clubs with strength programs — hybrid communities first, single-sport communities second.

**Deliberately deferred:** DMs, Wear OS, 3D flyovers, China track — none block the core loop.

**China note:** the hybrid concept degrades gracefully for the China fork — Apex Score works indoor-only (erg/treadmill distance + lifts), so the strength-first China product keeps the flagship mechanic without touching GPS/map law.
