# Liftoff (GymBros Inc.) — Competitor Feature Inventory

**App identity confirmed:** "Liftoff — Ranked Gym Workouts", developer **GymBros Inc.** (Montreal, Canada), iOS `id6448081563`, Android `com.gymbros.app`, site `liftoffrank.com`. Formerly branded "GymBros — Workout Tracker" (community wiki still uses GymBros naming; the GSR metric is a legacy of this).

**Not to be confused with:** Liftoff Mobile (ad-tech, the CBInsights $4.3B valuation / IPO results are that company, not this app), "LIFT OFF – Health & Wellness" (`id1587121707`), or Liftoff drone-sim.

---

## 0. Scale, business, and why it matters

| Metric | Value | Source |
|---|---|---|
| iOS rating | 4.8 / 88K ratings (US); 4.8 across all major storefronts | App Store, fetched directly |
| Google Play | 4.65–4.8, 22K–73K reviews (sources conflict/stale) | trendapps, marlvel, grand-screen |
| Combined ratings | ~105K–155K | marlvel.ai / mwm.ai |
| Users | "1M+ lifters"; 1.3M total downloads | app marketing + aggregators |
| Downloads/mo | ~200K iOS + ~30–400K Android | tasu.ai, Sensor Tower, trendapps |
| Revenue | **~$500K/mo iOS, $540K+/mo combined (~$6.5M ARR)** | tasu.ai, Sensor Tower (Jun 2026) |
| Trajectory | $19K MRR late-2024 → $500K/mo 2026 = **~26x in <2 yrs** | Starter Story → tasu.ai |
| Funding | **Bootstrapped, zero outside capital, zero paid ads** | Tracxn |
| Team | Founder **Jason Lin** (built as a college student), team of 2–3 | ventureradar, tasu.ai |
| Launch | April 2023 (iOS), Nov 2023 (Android) | store listings |
| Current US rank | #37–40 Free Health & Fitness, **↓14 recently** | marlvel.ai, Similarweb |

**Growth mechanism (highly reusable):** 100% organic TikTok/Reels across multiple accounts. One black-screen text-hook video: 2.3M views / 58.5K likes / 4,331 comments. A Sam Sulek-partnered account: 9M views in 24 days. Plus in-product referral capture placed mid-onboarding.

**Critical strategic context:** On **21 May 2026 Strava overhauled its strength experience** — dedicated workout log (sets/reps/weight), auto-populated muscle maps, five strength shareables, and **14 partner integrations including Liftoff, Hevy, Fitbod, JEFIT, Garmin, COROS, WHOOP, Runna**. Strava reports **500M+ strength uploads in 2025** and 195M users. Analyst consensus (the5krunner): Strava's implementation is "little more than a front-and-back body-image generator," it has **no strength benchmarks, no ranking, no cross-user standards**, and its muscle maps are only as good as user logging discipline. **The whitespace — social platform for strength with credible normalized ranks — is explicitly unclaimed.**

---

## 1. Core Concept — The Ranking System

### 1.1 The metric stack
Three nested layers:

1. **GSR (GymBros Strength Rating)** — the underlying continuous score, ~0–900+. This is the real number; everything else is presentation.
2. **LP (Lift Points)** — the user-facing progress currency. Per the official FAQ: *"Each rank has a range from 0 to 100 LP and a rank up happens every 100 LP, except for the Olympian rank."* Rank-ups surface in-session as "+12 LP" toasts.
3. **Rank tier + division** — the badge.

### 1.2 Rank tiers (from the community wiki, "The basics")
**Ranked pyramid, low → high, each with 3 divisions:**

```
Wood (1,2,3) → Bronze (1,2,3) → Silver (1,2,3) → Gold (1,2,3)
→ Platinum (1,2,3) → Diamond (1,2,3) → Champion (1,2,3)
→ Titan (1,2,3) → Olympian (no divisions)
```

- 8 divisioned tiers × 3 = **24 divisions**, plus Olympian.
- **Olympian = everything above 900 GSR** — an open-ended apex tier with no divisions. This is deliberate: it removes the ceiling so top users never "finish."
- Some marketing/press simplify to "Bronze, Silver, Gold, Platinum, Diamond, Olympian" — treat the 9-tier wiki version as authoritative.
- Division width is ~37.5 GSR if 24 divisions span 0–900; the LP display (0–100 per division) is a normalized rendering, not raw GSR. **Flag: exact GSR→division boundary table is not publicly published.** The Fandom wiki returns HTTP 402 to fetchers; only search-snippet extracts were obtainable.

### 1.3 Three rank scopes
| Scope | Definition |
|---|---|
| **Peak rank (per exercise)** | Your best performance on that single exercise. This is "the primary measure of progress." |
| **Average rank / Liftoff Rank** | *"an accumulated score of your exercise ranks. The higher the exercise score, the more it counts"* (FAQ). Requires **10 different ranked exercises** to compute. **This is what appears on leaderboards.** |
| **Muscle rank / Bodygraph** | Per-muscle-group ranks rendered on an anatomical "Ranked Bodygraph" to "instantly identify muscles for improvement." |

Note the weighting: higher exercise scores count *more* toward the aggregate — a max-of-bests bias rather than a plain mean. This rewards specialization and is part of why the system is gameable.

### 1.4 Calculation inputs
Official FAQ: **"Ranks are calculated using your bodyweight and your 1RM."**

Wiki detail on logging inputs: *"you input your body weight, the amount of reps/duration/distance, and for most, the weight of the equipment, which will all affect your ranking."*

- **Bodyweight is mandatory** — no ranks are issued without it. Lighter bodyweight → higher rank for identical load (pure relative-strength model). Worked example from the wiki: 180 lb × 8 reps at 145 lb BW ranks differently from the same at 200 lb BW.
- **Estimated 1RM is derived from weight × reps.** The specific formula (Epley/Brzycki/etc.) is **not published**.
- **Cardio and duration/distance exercises are also ranked** — the input schema accepts duration and distance, not just load.
- **Sex:** standards are almost certainly sex-separated (universal in this category) but Liftoff does not document it.
- **Age:** no evidence of age normalization. Not mentioned in FAQ, wiki, or any listing.
- **Weight class:** explicitly **absent** — a documented user complaint ("Doesn't take into account weight class for powerlifting movements").

### 1.5 Exercise coverage
- Marketing: "400+ exercises" (older) → **"Get your rank on 500+ exercises for free"** (v2.15.0 release notes).
- Wiki: **330 currently publicly ranked exercises** — so ranked ⊂ loggable.
- Categories include assisted-bodyweight variants (Assisted Chin Ups, Dips, Pull Ups) and machine/cable/isolation movements. **Ranking everything is the design choice that generates the accuracy complaints** (see §8).

### 1.6 No verification layer
**There is no video verification, no lift proof, no anti-cheat.** Nothing in the FAQ, listings, or wiki. Ranks are entirely self-reported honor-system. One 5★ reviewer frames the honor system as self-enforcing — *"I am incentivized to not fake weights or anything because I want to be able to see the statistics over time"* — but there is no product mechanism. Combined with purchasable XP multipliers (§4), leaderboard integrity is structurally weak.

---

## 2. Workout Logging

| Capability | Status |
|---|---|
| Exercise library | 500+ exercises (330 ranked); GIF/image demos |
| Set / rep / weight logging | Yes — core loop |
| Duration / distance logging | Yes (cardio and timed movements are ranked) |
| Custom exercises | **Yes** — with custom images and descriptions |
| Routines / templates | **Yes** — reusable, user-built |
| Prebuilt programs / plans | Yes — purchasable with eggs in the Shop; AI-personalized plan promised during onboarding |
| Rest timers | **Yes** — "time your breaks between sets" |
| Supersets | **Not supported** — appears as a user feature request |
| Plate calculator | Not found |
| Progressive overload / auto-weight suggestions | **No** — a documented gap; logging fewer reps silently mutates the routine template |
| Offline logging | **No** — network required; repeated complaint |
| Data export / API | **No official export** |
| Bodyweight entry | Required for ranking |
| Nutrition | Calorie + macro tracking, camera/photo food recognition, barcode scanning |

**Known logging defects (from reviews):** cannot skip an incomplete exercise without falsifying completion; cannot log duplicate exercises as separate entries; set-by-set rep variation permanently alters the saved routine template, corrupting progressive-overload tracking.

---

## 3. Competitive / Social Features

- **Leaderboards:** global, **regional**, and friends. Ranked on **average rank** (aggregate), not raw weight. The "Ranks" tab is the leaderboard surface. **No gym-level or club-level leaderboards.**
- **Friend system:** follow-based. Invite-and-earn referral rewards for both parties. Complaint: no usable user search.
- **Social feed:** posts are the unit of logging — *you post a workout to receive your ranks*. **Posts are private-by-default** (you + friends); an explicit opt-in toggle publishes to "discovery." Founder framing: a feed "without performative elements" — support reactions rather than comment threads.
- **Forced posting:** you cannot earn ranks without posting. A recurring complaint (*"Don't like that you have to post your workouts"*).
- **Shareables / rank cards:** stylized social-share images for rank-ups and achievements; rank widgets showing live leaderboard position, rank-ups, and bodyrank.
- **Community challenges:** yes, tied to leaderboard climbing and egg rewards.
- **Avatars:** created during onboarding — customizable appearance and gear; **muscle growth is reflected on the avatar** as you progress.
- **Strava integration (official partner):** "Post to Strava" toggle; shares exercises performed + workout duration. Liftoff is one of Strava's 14 launch strength partners.
- **Apple Health / Google Fit:** yes.

---

## 4. Gamification (the actual product)

| Mechanic | Detail |
|---|---|
| **XP** | Earned per logged lift; feeds rank progression |
| **LP** | 0–100 per division, rank-up every 100 |
| **Streaks** | **Breaks after 3 consecutive days without a posted workout.** Rest days auto-count — no logging needed |
| **Streak restores (paid items)** | *Super Restore* (streaks ≤30), *Mega Restore* (≤60), *Streak Revive* (any length, but **only the streak you just broke**, ~1-week window). Recent patch: restores now auto-attach to the next valid workout |
| **Seasons** | **Reset every 4 months — Jan 1, May 1, Sep 1** (3 resets/year). Forces re-grind and creates recurring re-engagement spikes |
| **Eggs (soft currency)** | Earned by posting your **first workout of the day** and via challenges; **also directly purchasable**. Spent on cosmetics, gear, workout plans |
| **XP Shakes (consumable)** | Applied to a post before publishing; **only works on your first post of the day** |
| **Quests** | Daily and weekly, with rewards |
| **Shop** | Cosmetics, gear, plans, consumables; daily deals and bundles |
| **Mascot** | Animated elephant ("Jymbo") — reacts to onboarding answers, sets a warm/gamified tone vs. clinical trackers |
| **Achievements / badges** | Yes |

**The pay-to-win problem:** XP multipliers are purchasable, which means rank velocity is buyable. This is the sharpest structural critique in the review corpus (§8) because it attacks the app's only moat.

---

## 5. Analytics

- **Bodygraph / muscle heat map** — auto-populated per workout; ranked per muscle group; used as a weak-point finder. Frequently cited as a favorite feature ("my bodygraph not showing after a workout really bugs me as I look forward to seeing that").
- **GSR charts** — rank progression over time.
- **Detailed progress charts** per exercise.
- **Rank progression + muscle recovery analytics** (Pro).
- **1RM history** — implied via peak-rank history; not documented as a standalone view.
- **Body measurements** — not documented; bodyweight is tracked as a ranking input.
- **Volume tracking** — not explicitly surfaced as a headline metric (contrast: Hevy, Strong).

**Analytical gap (competitor-blog framing, discount accordingly but the mechanic is real):** *"A rank-up screen answers whether you leveled up but doesn't answer what's lagging, what to train next, or whether you're stronger than three months ago."* No weak-point prescription, no adaptive progression, no cross-lifter standardized benchmark view.

---

## 6. Monetization

**Model:** freemium subscription (**Liftoff Pro**) + parallel in-app soft-currency economy.

**iOS IAP tiers:** $3.99 / $12.99 / $14.99 / $39.99 / $79.99. **Play IAP range:** $0.99–$99.99. Effective pricing ~**$12.99/mo**, **$39.99–$79.99/yr** with heavy regional variation and offer-dependent prices. 7-day free trial, annual positioned as default.

**Free tier (genuinely usable — repeatedly confirmed):** log workouts, build routines, **ranks on 500+ exercises**, leaderboards, streaks, social feed.

**Pro unlocks:** advanced analysis / in-depth per-muscle-group analysis, unlimited tracking, recovery metrics, extended bodygraphs, exclusive cosmetics.

**Onboarding funnel (tasu.ai teardown — the most valuable single artifact found):** **42 screens** (a competitor counts 61 steps), in this order:
1. Elephant mascot intro
2. **Rank system framed *before any tracking feature*** — "You're about to get your first rank"
3. Personalization quiz (frequency, goals, level, exercise prefs) with mascot reactions
4. **Hold-to-commit gesture** — sustained press to confirm commitment
5. Avatar creation (appearance + gear)
6. Notification permission framed as "how lifting becomes a habit"
7. **Mid-onboarding referral prompt**
8. **First rank assigned from quiz answers, before any real lifting** — Bronze/Silver/Gold reveal with animation
9. Loading screen + App Store review request, with 4.7★ social proof displayed
10. "Rank-in-life" screen positioning rank as an identity marker visible to friends
11. **Hard paywall with no exit button** — closing it returns the identical "Try free for 7 days" screen indefinitely. A "trust screen" promises a reminder 3 days before billing.

**The thesis:** the onboarding installs an identity ("I am a Bronze II") before the user opens a workout log. Churning then feels like losing social standing, not closing an app. Third-party analysts call this the mechanism behind both the retention *and* the "predatory" backlash.

---

## 7. Platform Surface

| Platform | Status |
|---|---|
| iOS (iPhone) | Yes — iOS 15.1+, ~231 MB, 13+, English only, 179 countries |
| iPad | Yes |
| Android | Yes — Android 8.0+, package `com.gymbros.app` |
| **Web app** | **No.** `liftoffrank.com` is marketing/FAQ/legal only. (One roundup claims web — unsupported by any primary source.) |
| **Apple Watch** | **No.** The single most-requested missing feature (6 coded mentions) |
| Wear OS | No |
| Widgets | Rank widgets exist (live leaderboard position, rank-ups, bodyrank); users still request more home-screen widgets |
| Integrations | **Strava (official partner)**, Apple Health, Google Fit |
| Localization | English only — a notable expansion gap given traffic in Slovakia (#9) and Czechia (#11) |
| Release cadence | Very fast — v2.15.0 shipped within a day of research |

---

## 8. User Sentiment

### 8.1 Read the headline rating skeptically
Store average is **4.8**. But mwm.ai's coded 3,000-review sample reports **3.8/5** with distribution 5★ 1,671 / 4★ 390 / 3★ 184 / 2★ 151 / **1★ 604** — a **~20% one-star share**. Combined with the documented **US rank drop to #37 (↓14)**, recent sentiment is materially worse than the lifetime average. Complaint frequency in that sample: **subscription cost (48) > paywall (27) > trial/cancellation (20) > exercise database (13) > Apple Watch (6)**.

### 8.2 What they love

**A. Gamification produces actual behavior change** (52 coded mentions — the dominant theme). Praise is behavioral, not feature-focused:
> "I feel like every gym session makes me want to push slightly more so I can rank up and I am incentivized to not fake weights... Been lifting for 15 years and I'm impressed." — App Store AU, 5★

> "Tried for two years to get motivated to work out again... Liftoff helped me convert what I loved about competitive video games into motivation to workout. Streaks, chasing higher ranks, earning profile cosmetics, and leveling up." — App Store NZ

> "Hitting Gold 1 felt like a genuine achievement. The ranking system provides that extra 5% of motivation."

> "This app is a lot of fun and does an effective job of making lifting weights a form of 'gaming.'"

**B. The free tier is genuinely good** — a consistent counterweight to paywall anger:
> "I think the free tier gives you everything you need." · "the free version is more then enough to be a great app alone." · "I've been more consistent than ever in the gym, just with the free version."

**C. Exercise breadth + bodygraph visualization.** **D. All-in-one (lifting + macros + social + avatar).**

### 8.3 What they complain about

**A. Paywall & onboarding — #1, most emotionally charged.**
> "I hate paywalls I hate paywalls I hate paywalls [×9] seriously, I would've taken a lot of ads over this expensive membership." — App Store CA

> "Makes u go through a tedious setup process, then after everything they mention how you must pay" · "Wasted my 15 minutes and later everything is paid" · "It feels like all the app features are hidden behind the pay wall now for an ABSURD price."

Analysts note users label the flow **"predatory"**, damaging brand trust. GymBros replies to these publicly ("The app is free to use, while some optional features are available with Pro").

**B. Trial cancellation → unexpected charges** (20 mentions). Chargeback-service pages exist for the "Liftoff Fitness"/"Liftoff Rankings" card descriptors — a signal of nontrivial dispute volume.

**C. Rank accuracy on machines/cables/isolation — the substantive lifter critique:**
> "some lifts I've done that's considered Olympian or Titan when I don't think it should be" — specifically **Hex Bar Shrugs** and **glute kickback machines** ranking absurdly high "despite requiring less effort compared to lifts like bench press that have more data."

> "Doesn't take into account weight class for powerlifting movements."

Standards reported "very off" on rare movements — **planche pushups rank Bronze**. Competitor framing (discount, but the mechanic is real): *"the number on the stack isn't the force your body produced... the fastest way up isn't getting stronger; it's finding the movement with the softest standards."*

**D. Pay-to-win rank economy — the sharpest under-covered complaint:**
> "Since you can buy Exp. Multipliers, the Rank system is essentially **pay-to-win**, which doesn't actually affect your workouts, but it affects the selling point of the app — the fun ranked system." — App Store IE

**E. Technical instability — called the #1 complaint theme by marlvel.ai, and the cause of the ranking drop.** Mid-workout crashes, keyboard bugs, severe lag, **sessions disappearing on completion**, all-white screens after finishing, blank "Go Pro" screens, a phantom "Home" profile appearing during logging, bodygraph failing to render, wrong workout launching ("arm day launching leg day"), gym-gear section crashing, network errors on working connections. **This breaks the one loop the entire product depends on.**

**F. Support unresponsive:** *"Support does not respond. No way of calling it's only email."*

**G. Missing features:** no Apple Watch · **no offline mode** · no data export/API · no weight classes · no supersets · limited widgets · no user search · no water tracking · can't log duplicate exercises separately.

**H. Nutrition module is the weak link:** *"food database and barcode scanning features are both seriously lacking"*; can't edit macros or serving sizes.

**I. Pro feels worse than free:** *"Why is the paid version worse?...missing features like recovery and some body graphs."*

**J. Forced social posting + frequent UI churn.**

**K. Streak anxiety:** 3-day break window, 1-week restore window, only the most recent streak recoverable. One user lost half a streak by completing a workout but forgetting to *end* it.

**L. Experienced lifters churn out:**
> "The app works fine but to an experienced gym goer it seems useless. To me it seemed like fixing a problem I don't have."

> "Lacks options for skipping incomplete exercises without falsifying completion. Set-by-set rep variation logging alters routine templates, complicating progressive overload tracking."

Notable negative signal: established "Reddit's favorite tracker" roundups discuss Strong, Hevy, FitNotes, Setgraph and **do not mention Liftoff at all**.

### 8.4 ⚠️ Coverage gap
**Reddit could not be retrieved** — reddit.com, old.reddit.com, and domain-filtered searches all hard-blocked the research user agent. No r/weightroom, r/naturalbodybuilding, r/fitness, r/GYM threads were obtainable. **No Reddit sentiment has been paraphrased or invented.** If serious-lifter Reddit consensus is load-bearing, it needs a browser session (claude-in-chrome) or a Reddit API pull. Likewise the **Fandom wiki returns HTTP 402** to fetchers — exact GSR threshold tables would need browser access.

**No mainstream tech press exists** (no TechCrunch/Verge). Coverage is confined to app-analytics platforms, AI-generated ASO/sentiment reports, competitor comparison blogs, and TikTok.

---

# COMPARABLES — how to actually build the standards engine

*Everything below §9 is from comparable products, not Liftoff. Liftoff does not publish its formulas, so this is the implementable substitute.*

## 9. StrengthLevel.com — the de-facto reference

**Tier ladder, with explicit on-page percentiles:**

| Tier | Page label | Percentile |
|---|---|---|
| Beginner | "Stronger than 5% of lifters" | 5th |
| Novice | "Stronger than 20% of lifters" | 20th |
| Intermediate | "Stronger than 50% of lifters" | 50th |
| Advanced | "Stronger than 80% of lifters" | 80th |
| Elite | "Stronger than 95% of lifters" | 95th |

Origin claimed as 2007 (founder Michael Clark) — **the earliest use of this exact ladder**. Gravitus copies it identically. This is effectively an industry standard; deviating costs comprehension for no gain.

**Scale:** 287 exercises · **195,513,376 lifts** from **27,893,268 users** · bench press alone: 48.7M lifts. They "exclude unrealistic lifts, automated entries and unusual submission patterns."

**Methodology (published approach, not the numbers) — the most useful architectural finding:**
1. 2007: seeded from Lon Kilgore PhD's ExRx standards; **regression-transformed into continuous formulas**, storing **four coefficients per exercise per sex** in a "continuous two-variable model, **including a bodyweight-by-level interaction**."
2. 2015: refit on >500,000 community lifts.
3. 2026: every exercise fitted directly from its own male and female data.

**The published tables are rendered from the regression model, not stored lookup rows.** The artifact is a small coefficient set per (exercise × sex). Build it that way.

**No public API. ToS explicitly prohibits scraping, bots, scripts, and unauthorized API usage.** Not licensable.

**Page structure (4 tables per exercise per sex):** bodyweight table · **age table (15–90, flat plateau 25–40, monotonic decline outside)** · bodyweight-ratio table · sets/reps popularity table. All standards are **1RM**, and **barbell weights include the 20kg/44lb bar** — easy-to-miss normalization detail.

**Male bench press, lb:**

| BW | Beg | Nov | Int | Adv | Elite |
|---|---|---|---|---|---|
| 110 | 60 | 90 | 128 | 172 | 221 |
| 130 | 80 | 114 | 156 | 205 | 258 |
| 150 | 99 | 137 | 183 | 236 | 292 |
| 170 | 118 | 158 | 208 | 264 | 324 |
| 180 | 127 | 169 | 220 | 277 | 339 |
| 200 | 144 | 189 | 243 | 303 | 367 |
| 220 | 161 | 208 | 265 | 327 | 394 |
| 250 | 185 | 236 | 295 | 361 | 431 |
| 280 | 208 | 261 | 324 | 393 | 465 |
| 310 | 229 | 285 | 351 | 422 | 497 |

**Female bench press, lb:**

| BW | Beg | Nov | Int | Adv | Elite |
|---|---|---|---|---|---|
| 90 | 23 | 44 | 73 | 110 | 152 |
| 110 | 32 | 56 | 88 | 128 | 173 |
| 130 | 40 | 67 | 102 | 145 | 192 |
| 150 | 48 | 77 | 114 | 159 | 209 |
| 170 | 55 | 86 | 126 | 173 | 224 |
| 190 | 63 | 95 | 136 | 185 | 238 |
| 220 | 73 | 107 | 151 | 202 | 258 |
| 260 | 85 | 122 | 168 | 222 | 280 |

Male kg spot-checks: BW 50 → 27/41/58/78/101 · BW 75 → 51/70/92/117/144 · BW 100 → 73/95/120/149/179 · BW 125 → 93/117/145/176/209. Male age-table peak (25–40) → 49/70/96/127/160 kg.

**Bodyweight-ratio rules of thumb (male bench):** Beginner 0.50× · Novice 1.00× · Intermediate 1.25× · Advanced 1.50× · Elite 2.00×.

**Curve shape — important:** tier curves are **concave in bodyweight** (diminishing returns). Male Elite/Beginner ratio is **3.7× at BW 110 lb but only 2.2× at BW 310 lb**. Female standards run ~55–60% of male at matched bodyweight and flatten faster. **A single multiplicative sex factor will not reproduce these tables — fit each sex separately.**

## 10. Symmetric Strength — the two-axis model

- Strength score measures "how well you would fare in a strength competition against lifters at your sex and bodyweight." Adjusts for **bodyweight, sex, and age**.
- **The score is ¼ of the lifter's hypothetical powerlifting Wilks**, plus an age adjustment for lifters **under 23 or over 40**. (So Wilks ~400 → score ~100. The 0–100 scale isn't arbitrary — it's Wilks/4.) Note: **Wilks-1 specifically**, not Wilks-2 or DOTS.
- Overall score = average of best performance in **five lift categories**:

| Category | Qualifying lifts |
|---|---|
| Squat | back squat, front squat, sumo deadlift |
| Floor pull | conventional DL, sumo DL, power clean |
| Pull-up | chin-up, pull-up |
| Horizontal press | bench, incline bench, dip |
| Vertical press | OHP, push press, snatch press |

(Sumo counts in two categories. Per-muscle strength = weighted average of lifts involving that muscle.)

- **Symmetry score — a separate second axis.** Quantifies variance across your lifts. **100 = all lifts equal to those of an average lifter at your strength level; can go negative** for pronounced imbalance. Site cautions low symmetry ≠ deficiency (leverages differ).
- Tiers Beginner→Elite, benchmarked against **strength athletes, not average gymgoers** — markedly harsher than StrengthLevel. **Exact numeric cutoffs are not published; treat any cited band numbers as unverified.**

## 11. Bodyweight normalization

**Recommendation: use DOTS.** IPF GL is the official IPF standard (adopted 1 May 2020) but requires classic/equipped and full/bench-only categories that are meaningless in gym tracking. Wilks is legacy (IPF dropped it end-2018). DOTS is the de-facto standard on OpenPowerlifting, most non-IPF federations, and consumer apps — **Boostcamp already ships DOTS to consumers, proving acceptance.**

**DOTS** — 4th-degree polynomial on total in kg:
```
DOTS = Total_kg × 500 / (a·BW⁴ + b·BW³ + c·BW² + d·BW + e)

Male:   a = -0.000001093,  b = 0.0007391293, c = -0.1918759221, d = 24.0900756, e = -307.75076
Female: a = -0.0000010706, b = 0.0005158568, c = -0.1126655495, d = 13.6175032, e = -57.96288
```
**Clamp BW before evaluating** — roughly 40–210 kg men, 40–150 kg women. Outside those bounds the polynomial misbehaves (it's a fit, not a law).

⚠️ **Data-quality trap:** several calculator sites publish a **5th-degree female DOTS formula**. That is wrong — it conflates DOTS with Wilks. `-0.0000010706` is the female **BW⁴** coefficient. **DOTS is 4th-degree for both sexes.**

**DOTS interpretation bands** (community convention, not official):

| Level | Men | Women |
|---|---|---|
| Beginner | <300 | <250 |
| Novice | 300–400 | 250–350 |
| Intermediate | 400–450 | 350–400 |
| Advanced | 450–500 | 400–450 |
| Elite | 500–600 | 450–550 |
| World Class | 600+ | 550+ |

**IPF GL Points** — `GL = Total_kg × 100 / (A − B·e^(−C·BW_kg))`, round coefficient to 6dp, result to 6dp:

| Category | A | B | C |
|---|---|---|---|
| Men Classic 3-lift | 1199.72839 | 1025.18162 | 0.00921 |
| Men Classic Bench | 320.98041 | 281.40258 | 0.01008 |
| Men Equipped 3-lift | 1236.25115 | 1449.21864 | 0.01644 |
| Men Equipped Bench | 381.22073 | 733.79378 | 0.02398 |
| Women Classic 3-lift | 610.32796 | 1045.59282 | 0.03048 |
| Women Classic Bench | 142.40398 | 442.52671 | 0.04724 |
| Women Equipped 3-lift | 758.63878 | 949.31382 | 0.02435 |
| Women Equipped Bench | 221.82209 | 357.00377 | 0.02937 |

Exponential-decay form asymptotes cleanly at high BW instead of turning over — why the IPF preferred it.

**Wilks-1** (needed only to replicate Symmetric Strength): `Coeff = 500 / (a + bx + cx² + dx³ + ex⁴ + fx⁵)`, x = BW kg
- Men: a=−216.0475144, b=16.2606339, c=−0.002388645, d=−0.00113732, e=7.01863e−6, f=−1.291e−8
- Women: a=594.31747775582, b=−27.23842536447, c=0.82112226871, d=−0.00930733913, e=4.731582e−5, f=−9.054e−8

**Wilks-2** (Mar 2020, `600 /` numerator): Men a=47.46178854, b=8.472061379, c=0.07369410346, d=−0.001395833811, e=7.07665973e−6, f=−1.20804336e−8 · Women a=−125.4255398, b=13.71219419, c=−0.03307250631, d=−0.001050400051, e=9.38773881e−6, f=−2.3334613884954e−8

**Sinclair** (Olympic lifts only): `Coeff = 10^(A·(log₁₀(BW/B))²)` if BW<B else 1.0. 2021–2024: Men A=0.722762521 B=193.609 kg; Women A=0.787004341 B=153.757 kg. **Do not hardcode** — the IWF's Dec 2024 weight-class revision (effective Jun 2025) forces recalibration for 2025–2028.

## 12. Estimated 1RM formulas

`w` = weight, `r` = reps.

| Formula | Equation | Character |
|---|---|---|
| **Epley** (1985) | `w × (1 + r/30)` | Linear. Over-estimates above 10 reps. Most recognized. |
| **Brzycki** (1993) | `w × 36 / (37 − r)` | Best-cited at 1–10 reps. **Divides by zero at r=37 — guard it.** |
| **Lombardi** (1989) | `w × r^0.10` | Power law, conservative |
| **O'Conner** (1989) | `w × (1 + 0.025r)` | Most conservative (+2.5%/rep) |
| **Wathan** (1994) | `100w / (48.8 + 53.8·e^(−0.075r))` | Exponential, balanced, asymptotes properly |
| **Lander** (1985) | `100w / (101.3 − 2.67123r)` | **Breaks near r=38**; unreliable >15 reps |
| **Mayhew** (1992) | `100w / (52.2 + 41.9·e^(−0.055r))` | From NFL bench data; best for upper-body pressing |

- **1–5 reps:** all formulas agree within 2–3%.
- **6–10 reps:** Brzycki and Mayhew best (<5% error).
- **>10–11 reps:** all degrade materially; Epley/Lombardi/O'Conner diverge from Brzycki/Wathan by up to 15–20 kg on a single estimate.
- Epley and Brzycki are **identical at r=10** (both 1.333w); Epley higher below, lower above.
- No single equation is universally superior (validation study, *Measurement in Physical Education and Exercise Science* 6(2)). Practical consensus: **use 3–6 rep sets, average multiple formulas.**

**Implementation recommendation:** hard-cut ranking eligibility at **≤10 reps** (don't merely downweight), display Epley as the default, and either average Epley+Brzycki+Wathan or apply a confidence penalty as reps rise. Guard the Brzycki and Lander denominators.

## 13. Competitive landscape for ranking features

| Product | Standards / ranking | Social | Notes |
|---|---|---|---|
| **Hevy** | **None.** Leaderboards rank **raw heaviest lift on 38 exercises** among people you follow — no sex, BW, or age adjustment | **Strongest social set of any mainstream tracker, and free** — feed, follow, like/comment, shared routines, PRs | Their Jul 2026 update flags **single vs. double dumbbell logging ambiguity corrupting leaderboards** — normalize dumbbell semantics at the schema level from day one. Roadmap: "strengthening the social side" |
| **Gravitus** | **Best public blueprint.** Identical 5/20/50/80/95 ladder. 8 lifts. Method **published**: all-time best → e1RM → **percentile within bodyweight brackets** → **allometric scaling** to fill sparse ranges → separate male/female calibration. 10M+ workouts, 300K+ lifters | Feed, per-exercise leaderboards vs friends **and** whole community, PR reactions | Sample 180 lb male Intermediate: bench 225, squat 275, DL 320 lb. Smaller dataset than StrengthLevel but they explain the method |
| **Boostcamp** | **"Strength Score," single 0–100**, across squat/bench/DL/OHP/rows, **bodyweight-adjusted via IPF DOTS**. Pro feature | No leaderboard/percentiles found | The one mainstream app explicitly building its consumer score on DOTS. 1M+ users, 300M+ workouts, 11,000+ free programs |
| **Fitbod** | **"Muscle Strength Score" (mSTRENGTH)**, 0–100+, **50 = average Fitbod user**, ~1.67% exceed 100. ML-trained: normalize exercises via population stats → learn per-exercise muscle-importance weights → weighted average per muscle group → iteratively refine. Scores are **relative per muscle group** | **None** — no sharing, no following | ⏰ **Explicitly states they "plan to roll out rankings and percentiles" segmented by age, gender, height, weight.** This is the competitive clock. #1 workout app by rating volume (4.81 / 278K) |
| **JuggernautAI** | Weak-point assessment drives programming; no published consumer tier ladder | **Has a leaderboard** (`my.juggernautai.app/leaderboard/`, auth-gated — ranked metric unconfirmed), private FB community, weekly coach Q&As | Powerlifting-focused; DOTS or total-based leaderboard likely |
| **Strong** | None | **None, deliberately** — "no social features, no AI recommendations, just a clean logging tool" | Differentiators are CSV export and data control. The opposite strategy |
| **KeyLifts** | **None** — pure 5/3/1 / percentage program calculator | None | Confirmed negative; not a comparable |
| **WeLift** (direct Liftoff clone) | **Normalizes by age, weight, AND experience** — more sophisticated than Liftoff on paper. Auto e1RM → ranking algorithm on log | Friends, direct challenges, global/nearby/friends filters | Tiny: 4.5★ / 54 ratings. Has **HealthKit + data export + auto weight suggestions + video demos** — all Liftoff gaps. $9.99/mo, $59.99/yr, **$199.99 lifetime** |
| **GymLevels** (Android), **Gym Rank** (iOS) | Per-exercise rankings, friend leaderboards; Gym Rank uses "AI-assigned" ranks | Basic | Free Liftoff alternatives; low traction |

## 14. Age adjustment

- **StrengthLevel:** ages **25–40 flat baseline**, adjusted down below 25 and above 40, published as a discrete 15–90 age table baked into the same regression.
- **Symmetric Strength:** adjustment applied only **under 23 or over 40**, on top of the ¼-Wilks base.
- **Federation coefficients (rigorous, sport-derived).** Both are **multipliers applied after** the BW-normalized score: `final = DOTS × age_coeff`. Integer-age lookup tables, not closed form.
  - **McCulloch** — Masters, **age 40+**. **1.00 at 40 → 1.511 at 66 → 2.190 at 83.** Applied **identically to men and women** (relative decline rates are statistically similar). Used by USAPL, WRPF for Best Lifter. [WRPF PDF](https://wrpf-latvia.net/downloads/McCulloch%20Coefficients%20WRPF.pdf) · [USAPL PDF](https://www.usapowerlifting.com/wp-content/uploads/2021/01/USAPL-Age-Coefficients.pdf)
  - **Foster** — youth counterpart, **ages 14–23**. **1.23 at 14 → 1.00 at 23.** Same PDF.
- Foster + McCulloch together give a continuous lifespan multiplier with a **flat 1.00 plateau from 23–40**, closely matching StrengthLevel's 25–40 plateau.

---

## 15. Synthesis — the convergent design and the whitespace

**The dominant design four independent products converged on:**
1. Convert every logged set to **e1RM** (hard-cap at ≤10 reps).
2. Take the user's **all-time best e1RM per exercise**.
3. Rank it as a **percentile within a (sex × bodyweight) cohort**, using **allometric scaling / regression** to smooth sparse bodyweight ranges rather than raw bucketing.
4. Map percentile onto the **5 / 20 / 50 / 80 / 95 → Beginner / Novice / Intermediate / Advanced / Elite** ladder.
5. Store **a small coefficient set per (exercise × sex)**; generate tables on the fly. Never store lookup rows.
6. Apply an **age multiplier** — flat 1.00 from ~23–40, Foster below, McCulloch above.

**Whitespace, ranked by defensibility:**

1. **Nobody has combined a social graph with bodyweight normalization.** Hevy has the graph but ranks raw weight — a 60 kg woman cannot meaningfully compete with a 100 kg man. StrengthLevel has the normalization but no graph. Liftoff has both but normalizes on bodyweight only, with no age, no weight class, and a soft-standards exploit on machines. **A DOTS- or percentile-normalized social leaderboard is a real, ownable differentiator**, and Boostcamp has already proven consumers accept DOTS.
2. **Strava just opened the door and left the room empty.** It shipped strength logging + muscle maps + 14 partners in May 2026 with **explicitly no benchmarks, standards, or ranking**, on 500M annual strength uploads. For a Strava-style endurance app, lifting ranks are the missing layer Strava itself declined to build.
3. **Symmetry / balance scoring is nearly unclaimed.** Symmetric Strength owns the concept but is a dated web tool with no app-grade social layer; Fitbod has per-muscle scores but no balance metric and no social features at all.
4. **Liftoff's own moat is eroding from three directions simultaneously** — machine/cable/isolation lifts with soft standards, no weight-class or age normalization, and **purchasable XP multipliers**. Each one independently tells a serious lifter the number is not real. Its L-theme churn ("useless to an experienced gym goer") is the direct consequence.
5. **Reliability as positioning.** The top complaint cluster is mid-workout crashes and disappearing sessions — the loop the whole product depends on. A rock-solid logger with credible ranks beats a gamified one that loses your session.

**Constraints to plan around:**
- **StrengthLevel's data is not licensable** — no API, ToS bars scraping outright. Build your own corpus (**Gravitus reached credible standards at ~10M workouts / 300K lifters** — the bar is far lower than StrengthLevel's 195M lifts suggests) or bootstrap from **OpenPowerlifting** (openly licensed, but skews competitive and covers only SBD).
- **Normalize dumbbell single-vs-pair semantics at the schema level from day one** — Hevy publicly identifies this as what corrupts their leaderboards.
- **Liftoff's monetization is the anti-pattern to avoid**: the 42-screen hard paywall generates the revenue *and* the 20% one-star share. The reviews are unambiguous that people love the concept and resent the funnel.

**Unclosed research gaps:** Reddit (hard-blocked to the fetcher — needs a browser session), exact GSR→division threshold tables (Fandom returns HTTP 402), Liftoff's specific e1RM formula (never published), and whether Liftoff sex-separates its standards (undocumented).
