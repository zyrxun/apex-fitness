# Strava Feature Inventory — Competitor Research (as of Aug 2026)

## 0. Company Context (why it matters for positioning)

- **Scale:** ~195M registered athletes across 185+ countries (April 2026), growing ~3M users/month. ~4B activities logged in 2025.
- **Revenue:** ~$500M ARR (2025); $338M in 2024. Paying subscriber estimates range 1.2M–4M (never disclosed) — implies a **very low free-to-paid conversion rate (~1–2%)**, the core strategic tension driving aggressive paywalling.
- **IPO:** Confidential S-1 filed Jan 2026; no public S-1/date/ticker as of late July 2026. Valued ~$2.2B (May 2025 Series F); analysts project $2–3B IPO.
- **M&A:** Acquired **Runna** (running coaching/training plans, 2025), **FATMAP** (3D mapping, Jan 2023 — app shut down Oct 1 2024, partially absorbed).
- **Legal:** Sued **Garmin** (Sept 30, 2025) for patent infringement on **Segments and heatmaps** + breach of a 2015 agreement, demanding a sales injunction. **Voluntarily dismissed without prejudice 21 days later (Oct 21, 2025)** after Garmin signaled it would counter-sue. Notable: Strava holds patents on segment-style virtual racing and heatmaps — a **competitor should treat "segments + heatmaps" as patent-encumbered territory** and get IP review before cloning them literally.

---

## 1. Core Activity Tracking

### 1.1 Supported sport types (~70+, official taxonomy)
Strava explicitly states *"some of Strava's features are currently only available for our three core sport types, riding, running, and swimming."* This is a key structural fact: everything outside Run/Ride/Swim is second-class.

| Category | Types |
|---|---|
| **Foot** | Run, Trail Run, Hike, Walk, Wheelchair |
| **Cycle** | Ride, E-Bike Ride, Mountain Bike Ride, E-Mountain Bike Ride, Gravel Ride, Velomobile, Handcycle |
| **Water** | Swim, Canoe, Kayak, Rowing, Stand Up Paddling, Surf, Kitesurf, Windsurf, Sailing |
| **Winter** | Alpine Ski, Backcountry Ski, Nordic Ski, Snowboard, Snowshoe, Ice Skate |
| **Other** | Workout, Weight Training, Crossfit, HIIT, Yoga, Pilates, Elliptical, Stair Stepper, Rock Climb, Golf, Tennis, Padel, Pickleball, Squash, Racquetball, Badminton, Table Tennis, Basketball, Volleyball, Football (Soccer), Cricket, Dance, Skateboarding, Inline Skate, Roller Ski, Physical Therapy (added Apr 2026) |
| **Virtual** | Virtual Ride, Virtual Run, Virtual Row — **cannot be recorded in the mobile app**, sync-only from Zwift/trainers |

API enum names (useful for schema design): `Run, TrailRun, VirtualRun, Ride, VirtualRide, EBikeRide, MountainBikeRide, GravelRide, Handcycle, Velomobile, Swim, Hike, Walk, Wheelchair, Rowing, Kayaking, Canoeing, StandUpPaddling, Surfing, Kitesurf, Windsurf, Sail, AlpineSki, BackcountrySki, NordicSki, Snowboard, Snowshoe, IceSkate, InlineSkate, RollerSki, Skateboard, RockClimbing, Golf, Soccer, Elliptical, StairStepper, WeightTraining, Crossfit, Yoga, Workout`.

### 1.2 Recording modes
- **GPS outdoor** — phone app or synced device.
- **Indoor / trainer / treadmill** — no dedicated "Treadmill" sport type; treadmill runs land as Run (indoor flag) or Virtual Run. Indoor rides arrive as Ride (indoor) or Virtual Ride. Indoor activities can be recorded natively in-app for: Crossfit, Elliptical, Stair Stepper, Weight Training, Yoga, Workout. Everything else indoors must be synced from a device.
- **Pool vs open-water swim** — both supported; **user can toggle the type after upload and the visualization changes entirely**. Open water gets a map + HR + pace (+ stroke rate on Android); pool gets distance/time/pace/HR (HR lap-average only). **Weak area:** SWOLF and stroke count are inconsistently surfaced — often dropped on ingest from Garmin FIT files. Open water has *no* SWOLF or stroke count at all. **This is a clear, well-documented gap for a swim-serious competitor.**

### 1.3 Metrics captured
- **Universal:** distance, elapsed time, moving time, current/avg/max speed, pace, elevation gain, calories, weather conditions at time of activity (subscriber).
- **Running:** pace, **Grade Adjusted Pace (GAP)** (subscriber), splits (auto per mile/km), laps, cadence, **Pace Analysis** / pace zones (subscriber), **Best Efforts** by distance (mobile, subscriber).
- **Cycling:** power (watts), **FTP**, **Power Curve** (best avg power for 1s→full ride, comparable vs last 6 weeks / this year / prior years), **Power Zones Z1–Z7**, weighted avg power, **Training Load** (power-derived), cadence, **Power Analysis** (subscriber). Best-effort power PRs tracked at 5s, 30s, 1m, 5m, 10m, 20m, 30m, 1h, 2h.
- **Heart rate:** avg/max, HR zones, **custom HR zones (subscriber)**, **Relative Effort** (TRIMP-derived, HR-weighted, intensity-biased; replaced "Suffer Score" in 2018), Perceived Exertion fallback when no HR.
- **Elevation:** gain, elevation profile, **biggest single climbs** (Best Efforts), cumulative gain.
- **Swimming:** distance, pace/100m, time, HR (lap avg), stroke rate (partial), SWOLF (pool only, inconsistent).
- **Laps/splits:** auto splits, device laps, **Live Laps** (in-app manual lap marking).

### 1.4 Device & app integrations
- **Watches/head units:** Garmin (via Garmin Connect), Apple Watch (native Strava app + Apple Health import from Workout app), COROS, Suunto, Polar, Wahoo (ELEMNT), Fitbit, Amazfit, Whoop, Oura, Withings, XOSS, Samsung Galaxy Watch (**July 2026 partnership: Strava pre-installed on Galaxy Watch + Strava routes inside Samsung Health**).
- **Virtual/indoor platforms:** Zwift, Peloton, iFIT, TrainerRoad, Rouvy, etc.
- **Strength partners (May 2026):** Amazfit, Caliber, COROS, Fitbod, Garmin, Hevy, iFIT Personal Trainer, Jefit, Liftoff, Motra, Remaker, Runna, Whoop (+24 Hour Fitness).
- **In-app BLE sensor pairing:** HR monitors, power meters, cadence sensors — historically limited (one sensor class at a time on free per some reports).
- **Live Segments push to device:** Garmin, Wahoo, and other compatible head units (subscriber).
- **Route sync to watch:** Garmin, Apple Watch, COROS (route following on-wrist, June 2026).
- **Apple Fitness+** partnership (subscribers get a Fitness+ trial).

### 1.5 File import / export
- **Import formats:** **FIT, TCX, GPX**, and limited JSON. Manual upload via web + auto-sync via connected accounts.
- **Export (single activity):** "Export Original" (returns the source FIT/TCX/GPX), plus Export GPX / Export TCX. **TCX/GPX export requires GPS data** — indoor activities can't be exported this way.
- **Bulk export:** account-archive ZIP request (GDPR-driven, since May 2018). Delivered in hours to up to 10 days; download link expires. **Widely complained about as slow and clunky** — third-party Chrome extensions exist purely to work around it.
- **Route export:** GPX and TCX via API and web.

---

## 2. Social Features

- **Feed** — chronological-ish activity feed of people you follow + clubs. Filters for "Following" vs "My Activities." Includes a "1 year ago" throwback injection that users widely dislike.
- **Kudos** — the signature one-tap reaction (equivalent of a like). Free. Bulk-kudos ("kudos bomb") from feed.
- **Comments** — free, on any visible activity. **External links in comments/descriptions were blocked Sept 2025 (anti-spam), then reversed in 2026 with a public apology** after backlash from clubs, charities, and event organizers.
- **Follow model** — asymmetric follow, with optional "private account" requiring follow approval.
- **Clubs** — free to create/join. Include: club feed, **club discussion boards**, **club leaderboards** (weekly, top 100 on web; single-sport clubs rank by distance, multisport by total time; reset Sunday 23:59 club-local), **Group Events** (title, date/time, map meeting point, recurring, RSVP), promotional/branded club pages, and **Club Messaging** (2026 — real-time club chat, admin announcements).
- **Events tab (July 9, 2026)** — new sub-tab in the Groups experience: upcoming group runs/rides + **race discovery powered by Runna's global race database**. Filters: distance, date, location, sport type, elevation profile, average event temperature. Club events filter by date/location/format/distance. Entering a race hands off into a **Runna-generated training plan** for that date/distance.
- **Group Activities** — activities recorded together are auto-detected and cross-linked ("You + 3 others"), with its own privacy control.
- **Flyby** — playback of your activity on a map/timeline showing every athlete you crossed paths with. Lives at `labs.strava.com/flyby`. **Off by default** since privacy backlash; must opt in to "Everyone."
- **Media** — photos and videos on activities, activity descriptions, **Flyover** (cinematic 3D flythrough of the route using FATMAP terrain, with stat overlays + off-platform sharing — subscriber), and shareable stat cards.
- **Messaging (Dec 2023 →)** — 1:1 DMs and group chats up to 25 people; share saved routes and club events into chat with RSVP.
- **Tagging** — tag other athletes in activities; gear tagging (bikes/shoes with mileage tracking); tagging in photos.
- **Activity privacy controls:**
  - Per-activity + default visibility: **Everyone / Followers / Only You**. "Followers" activities are excluded from public leaderboards.
  - **Map visibility** — hide the whole map or portions of it.
  - **Hide start time**, hide stats, hide heart rate — via **Quick Edit**.
  - **Default: first and last 200m of activity maps are hidden** for new users (post-scandal default).
  - Separate controls for Group Activities, Flyby, Local Legends visibility, profile page, and "who can see my activities on leaderboards."
- **Year in Sport** — annual animated recap. **Moved behind the subscription paywall for the first time in Dec 2025**, provoking major backlash.

---

## 3. Competitive Features

- **Segments** — community-created stretches of road/trail. Any GPS activity is auto-matched to overlapping segments. Star segments to track them. This is Strava's single strongest moat: a **decade-plus corpus of user-created segments**, essentially impossible to bootstrap from zero.
- **Leaderboards** — all-time, and filtered by **date range, following, club, age group, weight class, gender**.
  - **FREE:** overall **top 10 only**, plus your own time, your own PRs/achievements on the segment.
  - **PAID:** full leaderboard, all filters, segment effort comparison and analysis, viewing your own historical efforts.
- **CR / KOM / QOM** — Course Record overall; King/Queen of the Mountain for the fastest male/female effort.
- **Local Legends (2020)** — awarded to whoever has completed a segment the **most times in a rolling 90-day window**, regardless of speed. Laurel crown icon. Deliberately rewards consistency over speed — good inclusivity mechanic. Free to view.
- **Live Segments** — **subscriber-only.** Real-time in-activity racing against your PR / KOM / CR, with live time-gap on phone or compatible head unit. Audio cues (voice or chimes).
- **Personal Records (PRs) / Achievements** — free. Trophy/medal icons for 1st/2nd/3rd best efforts on a segment.
- **Best Efforts** — PR and trend view across distance, cumulative elevation gain, biggest single climbs, power, and time intervals. Subscriber, mobile-only.
- **Challenges** — public, brand-sponsored monthly/seasonal challenges (distance, elevation, time, streak, segment-match). **Free to join.** Digital trophies. Brands pay Strava **$30k+** per sponsored challenge (Brooks, Red Bull, Le Col) — this is a real ancillary revenue line.
- **Group Challenges** — private challenges with your friends. **Subscriber-only to create AND to join.**
- **Goals** — weekly/monthly/annual/segment/power goals. Custom goals are listed as a subscriber feature; basic weekly distance goals are broadly available.
- **Leaderboard integrity** — ML-based flagging of impossible/suspicious activities. In 2026 Strava reprocessed the top 100 on every ride leaderboard with improved e-bike detection and **removed 3.9M activities, incl. 2.3M mislabeled e-bike rides**. Cheating/mislabeling remains a perennial community complaint.

---

## 4. Analysis & Training Features

**Nearly all of this is subscriber-only** — this is the primary paid value bundle.

- **Relative Effort** (subscriber) — cardiovascular load per activity from HR or Perceived Exertion; TRIMP-based, zone-weighted so intensity outweighs duration. Plus **Weekly Relative Effort** vs your personal range.
- **Training Load** (subscriber) — power-derived equivalent for cyclists.
- **Fitness & Freshness** (subscriber) — the classic CTL/ATL/TSB model: Fitness (impulse-response accumulation of Training Load/RE), Fatigue, and **Form = Fitness − Fatigue**. Charted over time.
- **Training Log** (subscriber) — calendar/grid view of all training, volume bubbles, progress visualization.
- **Matched Activities / Matched Runs** (subscriber) — auto-detects repeats of a route you've done before and ranks the effort against your history.
- **Workout Analysis** (subscriber) — pace-zone and lap breakdown for structured sessions.
- **Pace Analysis** (subscriber) — time-in-pace-zone for runs. **Grade Adjusted Pace (GAP)** for terrain-neutral comparison.
- **Power Analysis** (subscriber) — power zones, Power Curve, weighted average power, FTP estimation (widely criticized as over-estimating).
- **Custom HR zones** (subscriber). Custom power zones.
- **Performance Predictions** (subscriber) — estimated finish times for 5K / 10K / Half / Full marathon. Requires ≥20 runs in a rolling 24-week window. Model upgraded Sept 2025 to weight recent best efforts more heavily.
- **Athlete Intelligence** (subscriber; beta 2024 → GA) — LLM-generated post-activity summaries and trend narratives immediately on upload. Covers run, ride, walk, hike + virtual run/ride, power insights, segment analysis. Strava claims 80%+ "very helpful" ratings. Critics (Cycling Weekly) call it thin; reviewers position it as **"good at what just happened, useless at what to do next"** — it does not prescribe training.
- **Strava MCP Connector (June 1, 2026, subscriber)** — remote MCP server letting subscribers query their own training data conversationally through **Claude**. OAuth, read-only, revocable. Covers activity history, fitness trends, readiness, goal planning, cross-sport analysis, gear. Strava is among the first major fitness platforms to ship a native AI-assistant integration.
- **Training plans** — running and cycling plans (subscriber); the serious plan engine is now **Runna** (separate subscription, bundled at $149.99/yr).
- **Strength experience (May 21, 2026)** — dedicated **workout log** (sets/reps/weight), **auto-generated muscle maps** highlighting trained muscle groups, 5 new shareables, 14 partner integrations. Strength was Strava's **most-uploaded sport type** (500M+ activities in 2025) yet had almost no purpose-built support until 2026 — a striking blind spot.
- **Stanford partnership (June 2026)** — sports science research collaboration feeding insights back to users.

### Maps, heatmaps, routes
- **Global Heatmap** — **free**; aggregated activity heat over a rolling ~12 months, updated monthly; filterable by Run / Ride / Water / Winter / Other. Requires ≥5 unique athletes before heat renders (privacy floor). **Free users cannot zoom to the finest detail levels.**
- **Personal Heatmap** — subscriber. Your own lifetime coverage.
- **Night Heatmap** — activities between sundown and sunrise (safety/lighting use case).
- **Weekly Heatmap** — last 7 days; used to spot trail closures and what's currently in use.
- **Route Builder** (subscriber) — draw on web/mobile, live distance + elevation + **surface type** feedback, OSM-based routing, trail-specific map styles, **custom waypoints**, photos on routes.
- **Suggested Routes** (subscriber) — auto-generated loops from your location by distance, elevation/hilliness, terrain, difficulty.
- **Offline maps / Offline Routes** (subscriber).
- **Navigation (June 2026 hiking release)** — turn-by-turn-style route following, **off-route alerts**, **route following on Apple Watch**, smart watch route sync to Garmin/Apple/COROS, enhanced trail map styles showing surface types, trailheads, picnic areas, campgrounds, **Route Saves** from anywhere in the app.
- **Flyover** — 3D FATMAP-terrain flythrough with pause/speed control and stat overlays (subscriber).
- **Strava Metro** — free, anonymized-aggregate dataset for urban planners/governments. First **Commute Report** (Apr 2026): 550M commute miles logged in 2025. Pure goodwill/PR + policy influence play, not revenue.

---

## 5. Subscription Model

### Pricing (US, current)
| Plan | Price |
|---|---|
| Monthly | **$11.99/mo** |
| Annual | **$79.99/yr** (~44% cheaper than monthly) |
| **Family Plan** (up to 4 people) | **$139.99/yr**, annual only |
| **Strava + Runna** | **$149.99/yr**, annual only |

Other regions: UK £8.99/mo, £54.99/yr. EU €7.99–€10.99/mo. NZ$14.99/mo, NZ$94.99/yr, NZ family NZ$159.99, NZ Runna NZ$224.99. **Strava moved to standardized per-country pricing effective July 1, 2025** (previously price varied by cohort/legacy), with 30-day notice before renewal. 30-day free trial typical. No student tier found.

### FREE tier
- Unlimited GPS activity recording and uploads, all sport types
- Distance, time, pace/speed, elevation, HR, power, cadence display
- Splits, laps, activity feed
- **Full social layer:** kudos, comments, photos/video, following, clubs (incl. club leaderboards, discussion boards, group events), messaging/DMs, group activities, Flyby
- **Public Challenges** (join + trophies)
- Segments: matching, your own times, PRs/achievements, **top-10 leaderboard only**, Local Legends view
- **Strava Beacon** (moved to free — notable, safety-as-loss-leader)
- Privacy controls (all of them), Quick Edit
- **Global Heatmap** (limited zoom), basic route viewing, Dark Mode
- Device sync from all partners; GPX/TCX/FIT import and export; bulk archive export
- Basic goals

### PAID (subscriber-only) — the full list
**Segments/competition:** full segment leaderboards, all leaderboard filters (date, following, club, age, weight), segment effort comparison/analysis, **Live Segments**.
**Training:** Relative Effort + Weekly Relative Effort, Fitness & Freshness, Training Log, Matched Activities, Workout Analysis, Pace Analysis, Power Analysis, Grade Adjusted Pace, custom HR zones, custom goals, Best Efforts, Performance Predictions, cumulative monthly stats by sport, training plans.
**AI:** Athlete Intelligence, **MCP/Claude connector**.
**Maps/routes:** Route Builder, Suggested Routes, Personal/Night/Weekly Heatmaps, full heatmap zoom, offline maps/routes, custom waypoints, advanced navigation, Flyover.
**Social:** **Group Challenges** (create *and* join), **Year in Sport recap** (paywalled Dec 2025).
**Recording:** Beacon on compatible *devices* (in-app Beacon is free), Live Performance Data, weather.
**Perks:** Recover Athletics (PT/injury-prevention exercises), brand/retailer discounts, custom iOS app icons, priority support.

---

## 6. Safety / Other

- **Beacon** — live location sharing to up to **3** safety contacts. Generates a public URL (no Strava account needed to view), refreshes ~every 15s, shows the athlete's **battery level**, and dies automatically when the activity ends. **Now free** (was a premium feature at 2016 launch). Device-side Beacon (Garmin etc.) remains subscriber.
- **Privacy Zones** — user-defined circular zones (multiple, variable radius) that clip the start/end of activities beginning or ending inside them. Reworked after a 2018/2019 engineering post-mortem showed the original implementation leaked the true center point. Complemented by the **default 200m start/end hide**.
- **Privacy history** — two major incidents shape the space: the **2018 military base exposure** via the global heatmap (forced a global privacy-settings overhaul), and **2023 research showing home addresses were derivable from heatmap data**. Female athletes in particular have publicly pressed for more granular controls. **A competitor can win trust by being private-by-default from day one.**
- **FATMAP** — acquired Jan 2023, app + website **retired Oct 1, 2024**. Only the 3D terrain map and curated (non-user-generated) route content migrated into Strava. **Lost in transition:** waypoints (later re-added), personal guidebooks, national topo maps (IGN, Ordnance Survey), FATMAP offline map downloads, live snow/piste data. Ski/backcountry community remains vocally unhappy.
- **Messaging** — DMs, group chats (25 max), club chat; share routes and events in-thread.
- **Recover Athletics** — injury-prevention/PT exercise programming, bundled as a subscriber perk. **Physical Therapy** added as a recordable sport type Apr 2026.
- **adidas partnership (July 14, 2026)** — earn **adiClub points** for GPS-tracked miles logged on Strava. Rewards/loyalty as a retention lever.
- **Localization** — 10 additional languages added March 2026.

---

## 7. Platform Surface

- **Mobile:** iOS + Android (feature-leading). Some features are mobile-only (Best Efforts, Athlete Intelligence historically). Redesigned Record experience; audio announcements (start/stop/pause, splits every half/full mile-km, Live Segment cues as voice or chimes); BLE sensor pairing; Live Laps; Dark Mode (2026).
- **Wearables:** native Apple Watch app (record + route following), Wear OS, **Samsung Galaxy Watch pre-install (July 2026)**. Live Segments on compatible Garmin/Wahoo head units.
- **Web (strava.com):** deepest analysis surface — Training Log, Fitness & Freshness charts, route builder, full leaderboards, settings, bulk export, `/maps/global-heatmap`, `/maps/personal-heatmap`. Some features are web-only, some mobile-only — **the inconsistency is a standing user complaint**.
- **Labs:** `labs.strava.com/flyby` (Flyby viewer), various experiments.
- **API / developer platform:**
  - OAuth 2.0; scopes `activity:read`, `activity:read_all`, `activity:write`, `profile:read_all`.
  - Resources: Activities (CRUD, comments, kudos, laps, zones), Athletes (+stats), **Segments** (explore, star, segment efforts), **Streams** (time-series: altitude, cadence, HR, distance, power, temp, latlng, velocity, grade), Routes (GPX/TCX export), Clubs (members, admins, activities), Gear, Uploads.
  - Webhooks for activity create/update/delete.
  - Rate limits: historically 200 req/15min, 2,000/day per app (now tiered — see below).
- **Strava Metro:** separate free portal for public-sector/research access to aggregate data.

---

## 8. Known Weaknesses & Common Complaints — **Opportunity Map**

### 8.1 The API crackdown (biggest single opening)
- **Nov 11, 2024:** API agreement rewritten. Third-party apps may **only display a user's Strava data to that user** (killing comparison, coaching-dashboard, club, and leaderboard use cases). **Explicit ban on using any API data to train AI models.** Brand/look-and-feel restrictions added. Strava claimed <0.1% of apps affected; VeloViewer and similar analytics tools were hit hard. Widespread accusations that Strava was strangling its own ecosystem.
- **June 1, 2026:** API access put behind an **$11.99/mo subscription**. New developers immediately; existing active developers had until June 30, 2026 (with 3 free months). **Standard tier** = up to 10 athletes, no formal review. **Extended tier** = higher rate limits, more users, priority support, Partner API access, no subscription required (i.e., negotiated/commercial). Rationale given: a **448% surge in app registrations** from zero-code AI builders, and CEO Michael Martin citing AI firms "ruthlessly scraping public websites."
- **Fallout:** open-source and hobbyist communities are furious — **you now need a paid subscription to read your own data via API**. Framed widely as pre-IPO data enclosure.
- **→ Opportunity:** a **genuinely open, free, well-documented API with liberal terms** is now a credible wedge. So is a first-class, fast, complete **data export/import** path — explicitly market "your data, exportable in one click, no waiting 10 days."

### 8.2 Paywall creep
- Segment leaderboards (beyond top 10) and route planning were **taken away from free users** in 2020 — still the most-cited grievance.
- **Group Challenges require a subscription to even join** — a social feature gated on both sides, which actively suppresses network effects.
- **Year in Sport moved behind the paywall (Dec 2025)** while essentially every competitor gives an annual recap away free as a marketing/goodwill gesture. Very poorly received ("How pathetic does an app need to be…").
- Press coverage now routinely frames Strava as having "a paywall problem that's gone a step too far" (T3, Yahoo).
- **→ Opportunity:** keep the *social* layer 100% free and unbounded (challenges, leaderboards, recaps). Monetize *analysis and coaching*, not participation. Ship a free annual recap.

### 8.3 Feature quality gaps
- **Swimming is a second-class citizen** — no SWOLF/stroke count on open water, unreliable stroke data on pool swims, no drill/interval detection, no set-based structure. For a tri/swim audience this is wide open.
- **Indoor/treadmill handling is awkward** — no treadmill sport type, virtual activities can't be recorded in-app, TCX/GPX export fails without GPS.
- **Analysis depth trails dedicated tools** — reviewers repeatedly note Garmin Connect, TrainingPeaks, intervals.icu and WKO give deeper analysis; **FTP estimation is widely regarded as inflated**.
- **Athlete Intelligence is descriptive, not prescriptive** — it tells you what happened, never what to do next. Real coaching lives in a separate product (Runna) on a separate subscription.
- **Web/mobile feature parity is inconsistent** (Best Efforts mobile-only, Training Log richer on web).
- **Strength training was neglected until May 2026** despite being the most-uploaded sport type — indicative of a road/trail-centric product bias that leaves gym, hybrid, and general-fitness athletes underserved.
- **Non-core sports get almost nothing** — no segments, no analysis, minimal metrics outside Run/Ride/Swim.

### 8.4 Social & trust problems
- **Comparison anxiety / performative pressure** — the feed behaves like Instagram; users delete slow runs rather than post them. A recurring theme is that Strava is motivating *and* corrosive. There is a visible **"anti-Strava" movement** (ride for fun, don't log it).
- **Cheating and leaderboard integrity** — mislabeled e-bike rides, car-assisted segments, GPS spoofing. 3.9M activities purged in the 2026 cleanup, which itself demonstrates how large the problem had grown.
- **Privacy** — repeated incidents (military bases 2018, home-address inference 2023). Female athletes have specifically demanded more granular controls.
- **Spam and the link ban** — Strava blocked all external links in Sept 2025 to fight spam, breaking event signups, charity fundraisers, and club sites; reversed in 2026 with a formal apology and a promise of "greater transparency." Signals reactive, under-communicated product governance.
- **Garmin lawsuit whiplash** — sued and dropped its most important data partner within 21 days, damaging the relationship on the eve of an IPO.
- **The "1 year ago" feed injection** is broadly disliked.

### 8.5 Competitive landscape
Nike Run Club (fully free, guided runs, celebrity coaching), Garmin Connect (free, deeper raw analysis for Garmin owners), Komoot (best-in-class route planning + offline trail maps), Runna (now Strava-owned), TrainingPeaks/intervals.icu (serious analysis), Runify, Adidas Runtastic, Motera. **Nobody has meaningfully displaced Strava's social graph or segment corpus** — which is exactly where the moat is.

---

## 9. Table Stakes vs Differentiators

### Table stakes — must ship at parity or you're not credible
- GPS recording for run/ride/swim with accurate distance, pace/speed, elevation
- Pool vs open-water swim distinction; indoor/trainer/treadmill handling
- HR, power, cadence capture; splits and laps; HR/power zones
- FIT/TCX/GPX import **and** export; sync with Garmin, Apple Watch, COROS, Wahoo, Polar, Suunto, Zwift, Peloton, Whoop, Fitbit
- Activity feed, kudos-equivalent, comments, follow graph, photos on activities
- Clubs with events and leaderboards
- Per-activity privacy (public/followers/private), map hiding, privacy zones, hidden start/end
- Free live location safety sharing (Strava made Beacon free — it is now table stakes, not a perk)
- Personal records, distance/elevation goals, monthly challenges
- Route creation + follow-on-watch, offline maps
- Dark mode, mobile + web parity

### Differentiators — where you can actually win
1. **Open, free API + instant full data export.** Strava has vacated this ground entirely. Own it loudly.
2. **Serious swimming.** SWOLF, stroke count/type, set and interval structure, open-water stroke rate, drill detection. Strava's weakest core sport by far.
3. **Free social layer, forever.** Full leaderboards, group challenges free to join, free annual recap. Every one of these is a Strava grievance you can convert directly.
4. **Prescriptive coaching in the core product**, not a separately-priced bolt-on. "What should I do tomorrow," not just "here's what you did."
5. **Privacy-first defaults** with genuinely granular controls, marketed explicitly — Strava carries real reputational scar tissue here, especially with women athletes.
6. **Verified leaderboards** — sensor-corroborated, e-bike-detected, anti-spoofing by design rather than retroactive purges.
7. **Low-pressure social mode** — private-by-default, effort-based rather than pace-based social signals, "consistency" framing (Local Legends is Strava's own best idea here and it's under-exploited). Directly addresses the comparison-anxiety and anti-Strava sentiment.
8. **Multisport-first design** — proper triathlon/brick sessions, and non-core sports treated as first-class rather than metadata.
9. **Segments: proceed carefully.** Strava holds patents on virtual race segments and heatmaps and has already litigated (Garmin, Sept 2025). Get IP counsel before implementing a literal clone; consider mechanically distinct competitive primitives.
10. **Cold-start strategy** — Strava's moat is the segment corpus and social graph. Import-first onboarding (bulk import from Strava/Garmin archives, contact/follow-graph import) is essential to be usable on day one.

---

## Sources

- [Strava Pricing](https://www.strava.com/pricing) · [Strava Pricing 2026 — PulseSignal](https://getpulsesignal.com/pricing/strava) · [Strava Free vs Paid 2026 — BikeTips](https://biketips.com/strava-free-vs-paid/)
- [Strava Subscription Features — Help Center](https://support.strava.com/en-us/articles/15402044-strava-subscription-features) · [Supported Sport Types](https://support.strava.com/hc/en-us/articles/216919407-Supported-Sport-Types-on-Strava) · [Indoor, Treadmill, and Bike Trainer Activities](https://support.strava.com/en-us/articles/15401956-indoor-treadmill-and-bike-trainer-activities)
- [Fitness & Freshness](https://support.strava.com/hc/en-us/articles/216918477-Fitness-Freshness) · [Relative Effort](https://support.strava.com/hc/en-us/articles/360000197364-Relative-Effort) · [Relative Effort guide — the5krunner](https://the5krunner.com/2025/11/17/strava-relative-effort-guide-tss-2025/) · [Power Curve](https://support.strava.com/en-us/articles/15401647-power-curve-cycling) · [Performance Predictions](https://support.strava.com/en-us/articles/15401591-performance-predictions)
- [Local Legends](https://support.strava.com/hc/en-us/articles/360043099552-Local-Legends) · [Segment Leaderboard Filters](https://support.strava.com/hc/en-us/articles/360030851772-Segment-Leaderboard-Filters) · [Strava removes segment features for free users — Cyclist](https://www.cyclist.co.uk/news/apps-maps-and-training-software/strava-removes-segment-features-for-free-users) · [Strava leaderboards and routes no longer free — BikeRadar](https://www.bikeradar.com/news/strava-leaderboards-routes-subscription)
- [Personal Heatmaps](https://support.strava.com/en-us/articles/15402028-personal-heatmaps) · [The Global Heatmap and Strava Metro](https://support.strava.com/en-us/articles/15401880-the-global-heatmap-and-strava-metro) · [Strava Heatmaps guide — the5krunner](https://the5krunner.com/2026/01/16/strava-heatmaps-guide/)
- [Strava Beacon](https://support.strava.com/hc/en-us/articles/224357527-Strava-Beacon) · [Beacon now free — AOL](https://www.aol.com/news/strava-beacon-feature-available-free-users-160045955.html) · [Privacy Controls](https://support.strava.com/hc/en-us/articles/207343930-Privacy-Controls) · [Activity Privacy Controls](https://support.strava.com/hc/en-us/articles/216919377-Activity-Privacy-Controls) · [Update to Privacy Zones functionality — Strava Engineering](https://medium.com/strava-engineering/update-to-privacy-zones-functionality-98a570f6ebb)
- [Messaging on Strava](https://support.strava.com/hc/en-us/articles/19255163090573-Messaging-on-Strava) · [Club Messaging](https://support.strava.com/en-us/articles/15401541-club-messaging) · [Clubs on Strava](https://support.strava.com/hc/en-us/articles/216918347-Clubs-on-Strava) · [Group Events for Clubs](https://support.strava.com/hc/en-us/articles/216918607-Group-Events-for-Clubs) · [Strava Flyby](https://labs.strava.com/flyby/) · [Group Challenges](https://support.strava.com/en-us/articles/15401736-group-challenges)
- [Exporting your Data and Bulk Export](https://support.strava.com/hc/en-us/articles/216918437-Exporting-your-Data-and-Bulk-Export) · [How to get your Activities to Strava](https://support.strava.com/hc/en-us/articles/223297187-How-to-get-your-Activities-to-Strava) · [Strava API Reference](https://developers.strava.com/docs/reference/) · [Uploading to Strava](https://developers.strava.com/docs/uploads/)
- [Updates to Strava's API Agreement](https://press.strava.com/articles/updates-to-stravas-api-agreement) · [Strava declares war on scrapers ahead of IPO — TechCrunch](https://techcrunch.com/2026/06/01/strava-declares-war-on-scrapers-ahead-of-ipo/) · [Strava API Pricing in 2026](https://appsforstrava.com/blog/strava-developer-program-changes-2026) · [Strava's "Security" Changes Wall Out Third-Party Apps — Marathon Handbook](https://marathonhandbook.com/strava-api-changes/) · [Strava API $12/mo fee — BigGo](https://finance.biggo.com/news/202606011823_Strava_API_Fee_2026)
- [Strava Launches MCP Connector](https://press.strava.com/articles/strava-launches-mcp-connector) · [Strava MCP Connector — Help Center](https://support.strava.com/en-us/articles/15401531-strava-mcp-connector) · [Athlete Intelligence](https://press.strava.com/articles/stravas-athlete-intelligence-translates-workout-data-into-simple-and) · [Strava AI feature "not a novelty" — Cycling Weekly](https://www.cyclingweekly.com/news/strava-says-its-new-ai-feature-is-not-a-novelty-but-i-think-its-pointless)
- [Strava Overhauls Strength Experience](https://press.strava.com/articles/strava-overhauls-strength-experience-with-expanded-partner-ecosystem-new-workout-log-and-muscle-maps) · [Strava Adds New Features for Hiking](https://press.strava.com/articles/strava-adds-new-features-for-hiking-making-the-outdoor-experience-more-discoverable-navigable-and-social) · [Strava Adds Race and Club Event Discovery](https://press.strava.com/articles/strava-adds-race-and-club-event-discovery-elevating-community-led-training-during-peak-running-season) · [Strava Press Room](https://press.strava.com/)
- [Strava to shut down FATMAP — TechCrunch](https://techcrunch.com/2024/06/26/strava-to-shutter-3d-mapping-platform-fatmap-18-months-after-acquisition) · [What to Expect as FATMAP Transitions to Strava](https://communityhub.strava.com/general-chat-2/what-to-expect-as-fatmap-transitions-to-strava-3646)
- [Strava Sues Garmin — BikeRadar](https://www.bikeradar.com/news/strava-sues-garmin-over-segments-and-heatmaps) · [Strava Sued Garmin Then Backed Down — Lawsuits Journal](https://lawsuitsjournal.com/strava-garmin-lawsuit/)
- [Strava puts Year In Sport behind paywall — Slashdot](https://news.slashdot.org/story/25/12/19/2158235/strava-puts-popular-year-in-sport-recap-behind-an-80-paywall) · [Dear Strava, we have a paywall problem — T3](https://www.t3.com/tech/dear-strava-we-have-a-paywall-problem-thats-gone-a-step-too-far) · [Strava reverses external link ban — Tom's Guide](https://tomsguide.com/wellness/fitness/good-news-for-strava-users-the-app-just-reversed-a-hugely-unpopular-decision) · [Strava heatmaps raise privacy concerns](https://alternativeto.net/news/2023/6/strava-heatmaps-raise-privacy-concerns-by-exposing-home-addresses/)
- [Strava Revenue and Usage Statistics 2026 — Business of Apps](https://www.businessofapps.com/data/strava-statistics/) · [Strava confidential IPO filing — SiliconANGLE](https://siliconangle.com/2026/01/08/strava-makes-confidential-ipo-filing-amid-subscription-revenue-growth/) · [Strava leaderboard accuracy and club event updates — endurance.biz](https://endurance.biz/2026/industry-news/strava-targets-leaderboard-accuracy-and-rolls-out-navigation-and-club-event-updates/)
