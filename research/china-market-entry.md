# China Market Entry: Regulatory Research for a Strava-Style Fitness App

**Research current to August 2026.** Two independent research threads merged. Severity coding: 🔴 hard blocker (requires a different product or structure) · 🟡 expensive but solvable · 🟢 administrative.

---

## 0. Headline Finding — Verified Against Apple's China Storefront

Queried Apple's mainland-China (CN) storefront directly via the iTunes lookup API rather than relying on press reports. `resultCount: 0` means the app does not exist in the China App Store.

| App | Apple ID | In CN App Store? |
|---|---|---|
| Strava | 426826309 | **NO** |
| Nike Run Club | 387771637 | **NO** |
| Nike Training Club | 301521403 | **NO** |
| adidas Running (Runtastic) | 336599882 | **NO** |
| Under Armour Map My Run | 291890420 | **NO** |
| Peloton | 792750948 | **NO** |
| Fitbit (Google Health) | 462638897 | **NO** |
| WHOOP | 933944389 | **NO** |
| **Garmin Connect** | 583446403 | **YES** |
| **佳速度 (Garmin Sports, China-only)** | 985510139 | **YES** |
| Nike 耐克 (China shopping) | 1606462833 | **YES** — NIKE Commercial China Co., Ltd. |
| adidas 阿迪达斯官方购物 | 1413676670 | **YES** — adidas AG |
| Apple 健身 | 1208224953 | **YES** (rings only; Fitness+ not offered in China) |

**Every Western GPS activity-tracking app is absent. Every Western commerce app is present.** The dividing line maps exactly onto this product's feature set: GPS traces + map rendering + UGC social + personal data export.

Nike and adidas both hold Chinese entities and run full China operations — and still do not ship GPS tracking apps there. Nike deleted the feature and shipped a WeChat training mini-program instead. **Apple itself does not offer Fitness+ in mainland China** (49 markets including Hong Kong and Taiwan, but not the mainland).

Garmin is the sole Western survivor. It took **four wholly-owned Chinese entities, ~18 years, a separate `connect.garmin.cn` backend, and a China-only social app**.

**The most diagnostic single data point in this brief:** when Korea's KCC/KISA asked Strava for changes to a microphone-permission consent flow in March 2025 — a trivially small ask compared with anything China requires — Strava withdrew from Korea entirely, telling Korean media: *"We do not have the capability to create country-specific apps, so we decided to withdraw from the Korean market."* If your architecture is one global build, China is closed by construction.

---

## 1. iOS Distribution — Apple App Store China

### 1.1 The MIIT App Filing (移动互联网应用程序备案)

- **Legal basis:** MIIT *Notice on the Filing of Mobile Internet Applications* (关于开展移动互联网应用程序备案工作的通知), issued **21 July 2023**.
- **Timeline:** new apps must file before publication from **1 September 2023**; existing apps by **31 March 2024**; MIIT inspection sweep **April–July 2024**; provincial accuracy audits ongoing since.
- **Scope:** every app, mini-program and quick app serving mainland users — iOS, all Android stores, WeChat/Alipay/Baidu mini-programs. Explicitly captures offshore operators serving PRC users.
- **Filing obligor:** the "primary sponsor" (主办者) — must be a **PRC-incorporated entity or PRC national**, because the system requires a business licence or national ID.
- **Process:** submitted to the **provincial communications administration** *through* the ISP (Alibaba Cloud, Tencent Cloud) or the distribution platform, which pre-reviews. Decision in **20 working days**.
- **Information filed:** business licence; legal representative and network security officer ID; ICP representative; app name, package ID, MD5 signature, signing keys; **all domain levels (2nd/3rd/4th)**; SDK inventory; ISP name, server location, IP addresses; icon (JPEG <100KB).
- **Hard prerequisites:** PRC legal entity · **mainland-hosted backend** · valid **ICP Filing** on all domains, registered through a **China-based registrar** · **ICP Licence (B25)** if revenue-generating.
- **Consequences of no filing:** ISPs may not provide access; stores may not host; OEMs may not pre-install. Fines **RMB 5,000–50,000**.
- **Sector pre-approvals** (news, publishing, education, film/TV, religion) do not apply to fitness. 🟢

### 1.2 🔴 Apple enforcement — the conflict is resolved; enforcement is real

- Apple added the **App ICP Filing Number** field to App Store Connect for the CN territory. Required for new apps from **30 September 2023**; from **1 April 2024** apps without one **cannot ship updates and face mandatory removal**.
- ⚠️ **AppInChina's guidance that Apple "prompts but does not enforce" for international developers is stale.** The storefront evidence above is the enforcement. Strava's removal falls in the post-April-2024 window.
- **Android enforcement actually ran ahead of Apple:** Xiaomi, vivo and Huawei pulled deadlines forward to mid-December 2023 and began removals in early January 2024. **vivo announced it had purged 700+ unfiled apps** (April 2024).
- Precedent for how fast Apple moves once it enforces: **July 2020 — 29,800 apps removed from the China App Store in one month, including 26,000+ games** over missing ISBN/GRN licences.

**Separate Apple requirement:** under the **Anti-Telecom Fraud Law** and **Cybersecurity Law**, Apple displays the developer's **Chinese company name and Unified Social Credit Identifier (USCI)** on the China product page, sourced from the D-U-N-S profile. (Verified: Keep's CN listing displays USCC `911101053179472352`.) Another point where a China entity is visibly required.

**Net:** iOS spares you the *store-account* problem — you can publish from a global Apple Developer account — but not the *entity* problem. **Hong Kong does not qualify.**

### 1.3 Apple's own removal statistics

**2024 App Store Transparency Report:**
- Government takedown demands globally: 17,309 app removals
- **China mainland: 1,307 — the world's highest** (2023: 1,285); **1,131 were games missing GRN/ISBN.** Next: Russia 171, South Korea 79
- Appeals: 26,224 globally, **6,978 from China**; only **78 restored** in China

**2025 App Store Transparency Report:**
- Government takedowns: 2,045 globally. Russia 1,213; Vietnam 335; **China mainland 196**
- Appeals: 26,305; **China mainland 5,431 (highest)**; restorations in China: 71

⚠️ **Read the 1,307 → 196 drop correctly.** The 2023–24 spike was the one-off 备案 sweep plus the games-licence backlog clearing. By 2025 the gate operates *upstream* — non-compliant foreign apps never get listed, so there is nothing left to remove. **This is hardening, not relaxation.**

**Named Western removals:**
- **19 April 2024 — WhatsApp, Threads, Signal, Telegram.** Apple's statement: *"The Cyberspace Administration of China ordered the removal of these apps from the China storefront based on their national security concerns."*
- **June 2024 — Strava** (filing-related; **inferred, not documented** — Strava is not in the CAC batch and has never published a China explanation)
- **July 2022 — Nike Run Club** (voluntary withdrawal)

---

## 2. ICP Filing vs ICP Licence — The Central Structural Question

### 2.1 Two different things, both required

| | **ICP Filing (ICP备案)** | **Commercial ICP Licence (ICP证 / B25)** |
|---|---|---|
| Nature | Record-filing, per domain/app | Operating **permit**, per company |
| Question answered | *Where is it hosted?* | *Do you make money from it?* |
| Trigger | Anything on mainland servers | **Paid subscriptions, IAP, advertising, paid downloads** |
| Government fee | Free | Free |
| Timeline | ~20 business days (some report 20–30) | **60–90 business days** |
| Format | 京ICP备12345678号 | 京ICP证12345678号 |
| Renewal | — | **Annual review** |
| Mainland entity | **Required** | **Required** |
| Registered capital | — | **RMB 1m** single-province / **RMB 10m** cross-provincial |
| Staffing | Network security officer | 3 named employees with **3 consecutive months of PRC social-insurance records** |
| Infrastructure | China hosting | Servers within the **registered province**; MLPS grading |

**A subscription fitness app triggers the ICP证.** Advertising revenue triggers it too. Also mandatory: **PSB filing (公安备案)** within 30 days of ICP filing, plus the separate MIIT **App Filing**.

### 2.2 🔴 The 50% foreign ownership cap — confirmed

2024 Foreign Investment Negative List: *"The foreign equity ratio in value-added telecommunications services shall not exceed 50%"* — exceptions only for e-commerce, domestic multi-party communication, store-and-forward, and call centres. Derives from China's WTO accession commitments.

**Outside the pilot zones, a 100% foreign-owned WFOE cannot hold an ICP证.** You need a JV where the Chinese side holds ≥50%.

### 2.3 🟢 The VATS liberalisation pilot — and the sub-category trap

**MIIT 工信部通信函〔2024〕107号**, published **10 April 2024**; first approvals February 2025.

**Pilot zones (4):** Beijing Service Industry Zone · Shanghai FTZ **Lin-gang** · **Hainan** Free Trade Port · **Shenzhen**

**Caps fully lifted (100% WFOE permitted):** IDC, CDN, ISP, EDI (B21), and **B25 Information Service — but only two sub-categories:**
- 信息发布平台和递送服务 (information publishing platform & delivery)
- 信息保护和处理服务 (information protection & processing)

**Excluded:** internet news, online publishing, online audiovisual, internet cultural operations.

**Scope:** the entity must be registered in a pilot zone, but the service may reach **all of China** (except ISP).

**Uptake: 166 foreign-invested enterprises approved as of 3 June 2026** — up sharply from 13 in February 2025. The pilot is working.

🔴 **The decisive sub-category question.** A **social community / feed** product maps to B25 sub-categories **信息社区平台 (information community platform)** and **信息即时交互 (instant interaction)** — **neither is in the pilot list.** A content-delivery-shaped product maps to **信息发布平台和递送服务**, which **is**.

> **This single sub-category mapping determines whether you can be a 100% WFOE in Hainan/Shenzhen/Lin-gang/Beijing or must accept a ≤50% JV. It is the highest-value piece of pre-spend legal diligence available.** A Strava-clone social feed argues against you; a training-content or publishing-shaped product argues for you.

⚠️ **Source conflict:** China Briefing says the pilot covers "ICP, EDI, CDN, ISP, B22 and B24." The **MIIT primary text is narrower.** Trust MIIT.

### 2.4 Structures that do not work

- 🔴 **Hong Kong does not count.** HK, Macau and Taiwan sit outside the MIIT system. CEPA still caps HK capital at 50% for most VATS; since 1 March 2025 CEPA aligns HK with the pilot in the same four zones. HK is a useful holding layer above a WFOE (5% dividend treaty rate), never a substitute.
- 🔴 **VIE structures.** Not illegal, never affirmatively blessed. The 2019 Foreign Investment Law dropped the draft's "actual control" look-through; the 2025 Negative List retains the prohibitions VIEs exist to circumvent; CSRC's 2023 rules require VIE disclosure and case-by-case review. **Do not build one** — it is a capital-markets structure for Chinese founders raising offshore money, not an entry vehicle for a foreign operator with no political capital.
- 🔴 **Nominee / borrowed-entity ICP filings are being unwound.** Since 2024 regulators verify that the ICP holder is the actual operator. A publishing agent that genuinely operates the service is fine; a pure nominee arrangement is no longer viable.

---

## 3. Android Distribution

### 3.1 No Google Play

Blocked in mainland China **since 2012**: downloads, browsing, updates, Play Billing, and **Google Play Services** — so FCM push, Google Maps SDK, Google Sign-In, Firebase and Play Integrity all fail. A China Android build is a genuine fork.

### 3.2 Store landscape — third-party stores are ~79% of distribution

| Store | Share | MAU |
|---|---|---|
| **Huawei AppGallery** | **27.3%** | 344.1m |
| vivo App Store | 13.8% | 173.9m |
| Tencent MyApp 应用宝 | 13.7% | 173.4m |
| Xiaomi GetApps | 12.65% | 158.9m |
| OPPO Software Store | 11.0% | 139.3m |
| Honor App Market | ~7% | — |

Top 5 ≈ 78%; adding Honor ≈ 85%. Plus Baidu, 360, Meizu, Lenovo, Wandoujia in the tail.

### 3.3 Revenue share — the 50/50 figure is a **games** number

- **Games: 50%** is the 硬核联盟 ("Hardcore Alliance": Huawei, OPPO, vivo, Xiaomi) standard since 2014.
- **Non-game apps: ~30% typical published rate**, with aggressive promotional terms. Huawei has offered **100% of revenue for the first 12 months** on non-gaming apps, and a standing **70% to foreign developers**.
- Large-developer terms are **一事一议** (negotiated case by case).

**Each store has its own billing SDK.** Huawei **IAP Kit** supports subscriptions, bank cards, carrier billing and Huawei Points.

### 3.4 🔴 Foreign companies cannot publish Android directly

**Every Chinese Android store requires a Chinese business licence (营业执照) plus real-name entity verification** to open a developer account. Foreign business licences are rarely accepted. You need either a mainland entity or a local distribution partner publishing under theirs.

### 3.5 Software Copyright Certificate (软著 / SCC)

- Registrar: **China Copyright Protection Center**. Mandatory for Android store submission; now also required to run **Apple Search Ads** in mainland China.
- Deliverables: business licence (notarised and translated if foreign), **10–15 page Chinese user manual** with screenshots of every feature, **~3,000 lines of source code** (first and last 30 pages, min. 50 lines/page), development completion certificate, ownership declaration.
- Timeline: **2–4 weeks via a mainland entity**; **2–3 months for a foreign entity**. Cost: **CNY 2,200–3,200 (USD 300–450)**.
- 🟡 Practitioner report: *"I don't know of any overseas developer without a China Mainland entity that has successfully obtained a China Software Copyright Certificate."*
- **International copyright registrations are not recognised.** App name must match the SCC registration.

Other per-store items: ICP filing number, APK, Simplified Chinese listing, screenshots, demo video, in-app user agreement and privacy policy, feedback channel, permissions requested at point of use. Review **3–5 working days** typical, 2–6 weeks including iteration.

---

## 4. 🔴 GPS & Mapping Regulation — The Decisive Section

### 4.1 Legal framework

**Surveying and Mapping Law of the PRC** (2002, revised 2017) defines 测绘 as measuring, collecting and describing the shape, size, spatial position and attributes of geographic features. Chinese regulators apply this to hold that **collecting, storing, transmitting and processing spatial coordinates and trajectories is a surveying and mapping activity**. **A crowd of users recording precise GPS trajectories is functionally the same activity at national scale.**

- **Art. 22** — a **surveying and mapping qualification certificate (测绘资质)** is required.
- **Arts. 7, 26, 40, 42** — prohibits unauthorised publication of significant geographic information.
- Private surveying illegal since 2002. Fines **RMB 10,000–500,000**; serious cases criminal.
- Foreign organisations surveying in PRC territory need State Council approval **jointly with the armed forces' surveying department**, through a **JV or cooperative arrangement**.
- The **2023 amended Counter-Espionage Law** broadened espionage to reach unauthorised handling of geographic data linked to state secrets.

### 4.2 🔴 Foreign entities cannot hold the qualification

Mapping qualifications are **not issued to foreign LBS providers**. **Only ~19 entities hold the Class-A navigation electronic map qualification:** NavInfo 四维图新, Amap 高德, Tencent 腾讯大地通途, Baidu, Huawei, Meituan, plus provincial surveying institutes. (⚠️ roster weakly sourced.)

**Compilation of Navigation Digital Maps (CNDM)** is **prohibited to foreign investment** under the 2024 Negative List — WFOE and JV alike.

**Internet Map Service (IMS)** — three sub-categories a Strava-style product plausibly touches: geographic positioning · geographic information uploading & annotation · map database development. Class A/B personnel requirements; **servers holding map information must be physically in China**; IMS also requires an ICP licence, reimposing the 50% cap. Amap holds Class A IMS qualification no. 1100967.

### 4.3 GCJ-02 coordinate obfuscation

- **GCJ-02 ("Mars coordinates")** is a state-mandated non-linear offset from WGS-84, displacing points by **100–700 m**. Legal basis GB 20263-2006.
- **Baidu adds a further layer, BD-09.** Converting back to WGS-84 is **prohibited by law**; de-obfuscation is licensed and paid.
- Apple Maps works in China because it licenses AutoNavi/Amap data. Consumer hardware complies: Panasonic, Leica, Fujifilm, Nikon, Samsung all disable geotagging inside China.

### 4.4 The May 2024 joint notice — most directly applicable instrument

**自然资办函〔2024〕972号** (MNR + MIIT, 24 April 2024) on map display in mobile apps. App operators must: obtain **map review approval** and ICP registration before providing map services; accurately reflect China's territory; **display the map review number (审图号)** and note map source; **verify new map content added by users** (the UGC-route-upload obligation); act against violating users up to account closure and reporting to authorities. Review number validity: 2 years.

### 4.5 What this means concretely

1. 🔴 **Must use a licensed Chinese basemap** — Amap, Baidu or Tencent SDK. No OSM, Mapbox, Google or Apple international tiles in China.
2. 🔴 **Must convert every WGS-84 point to GCJ-02 before display** — else every trace is visibly wrong by up to 700 m.
3. 🔴 **Must store and process location data inside China** — a separate China backend, exactly Garmin's `connect.garmin.cn`.
4. 🔴 **Bulk export of high-precision WGS-84 track data out of China is the legally exposed act.** Map data must be stored in China unconditionally. Outbound transfer requires **MNR approval before a CAC export assessment can even be applied for.**

**Good news, narrowly:** Amap's Open Platform compliance terms confirm SDK consumers **do not need their own surveying qualification** — but must display the 审图号, not publish unreviewed maps, and complete map review if modifying map content.

**Reputational overhang:** the **2017–18 Strava Global Heatmap incident** (military bases exposed). **A foreign-operated app aggregating PRC citizens' movement trajectories into a heatmap is the single most legible national-security objection in this entire landscape.** In October 2024 Chinese authorities publicly admonished an unidentified foreign firm for illegal mapping services.

---

## 5. Data Regulation — PIPL, CSL, DSL

### 5.1 🔴 Both core data types are sensitive personal information

**PIPL Article 28** enumerates sensitive PI including **medical and health (医疗健康)** and **movement trajectory (行踪轨迹)** — two of the seven categories are this product's core data. Reinforced by **GB/T 45574-2025** (effective 1 Nov 2025), which requires assessing whether *combinations* of data become sensitive in aggregate.

Automatic consequences: **separate consent (单独同意)** unbundled from the privacy policy (Art. 29) · demonstrated "specific purpose and sufficient necessity" (Art. 28) · **PIPIA mandatory** before processing, cross-border transfer, and automated decision-making — **leaderboards and ranking algorithms qualify** (Arts. 55/56), records kept ≥3 years · guardian consent for under-14s (Art. 31).

### 5.2 Localization

**PIPL Art. 40** — CIIOs and handlers above **1,000,000 individuals** must store PRC-collected PI domestically. But localization is effectively mandatory from day one regardless: map/geospatial data must be on China servers **unconditionally**, and ICP + MIIT filings presuppose China hosting.

**Network Data Security Management Regulations** (effective 1 Jan 2025) — "large network platforms" = >50m registered users or >10m MAU, heightened duties.

### 5.3 Cross-border transfer thresholds

Framework: CAC *Provisions on Promoting and Regulating Cross-Border Data Flows* (22 March 2024).

| Data exported (cumulative from 1 Jan, non-CIIO) | Mechanism |
|---|---|
| Non-sensitive PI, <100,000 individuals | Exempt |
| Non-sensitive PI, 100,000–1,000,000 | SCC filing or certification |
| Non-sensitive PI, >1,000,000 | CAC security assessment |
| **Sensitive PI, <10,000** | **SCC filing or certification** |
| **Sensitive PI, ≥10,000** | **CAC security assessment** |
| Any important data | CAC security assessment |
| Any export by a CIIO | CAC security assessment |

⚠️ **Common misreading:** "sensitive PI <10,000 → exempt" is wrong — the <100,000 exemption applies **only to non-sensitive PI**. **Plan on: any sensitive PI export needs at least an SCC filing.**

- Security assessment validity: **3 years**. Certification route live since **1 January 2026**.
- ⚠️ **The SCC and assessment routes are only available to a PRC-established entity.** A purely offshore company has **no clean route to export at all.**
- **PIPL Art. 39** requires a *separate* cross-border consent — two distinct, unbundled opt-ins total.

### 5.4 Enforcement is real and hits this exact fact pattern

- **Guiyang 2025** — a company enabling **cloud data synchronization** without cross-border compliance got an administrative warning and **the sync function disabled**. The closest analogue to a fitness app's auto-sync.
- **Guangzhou Internet Court 2024** — bundling cross-border consent into a general privacy policy is invalid.
- **MIIT runs continuous named-and-shamed app inspections.** **Excessive location-permission requests are among the most frequently cited violations** — a direct product risk for always-on background location.

### 5.5 Governance appointments

| Obligation | Trigger |
|---|---|
| Domestic representative in PRC, filed with CAC | Any offshore processor targeting PRC individuals (Art. 53) |
| PIPO, filed with provincial CAC | >1,000,000 individuals (Art. 52) |
| Dedicated data security department + DPO | >10,000,000 |
| PIPIA, 3-year retention | Sensitive PI, cross-border, automated decision-making |
| Biennial PI compliance audit | >10,000,000 (effective 1 May 2025) |
| MLPS grading + PSB filing | All network operators; Level 3 typical at consumer scale |
| Network log retention ≥6 months | All network operators |

### 5.6 Penalties

**PIPL Art. 66:** up to **RMB 50,000,000 or 5% of prior-year turnover** in grave cases, app suspension, personal liability RMB 100k–1m plus officer bans; entered into social credit files (Art. 67).

**Amended Cybersecurity Law, effective 1 January 2026:** first-time fines apply immediately; CIIO max raised to RMB 10m; ⚠️ **extraterritorial scope broadened to any overseas activity endangering PRC cybersecurity.**

---

## 6. Content, Social & UGC Regulation

### 6.1 Real-name registration — hard requirement, administratively solvable 🟡

**CSL Art. 24** — no real identity, no service. Satisfied via **PRC mobile number verification**. Architecture: **"real name backstage, chosen name front stage" (后台实名、前台自愿)**. Anonymous or email-only signup is unavailable.

### 6.2 Security assessment for public-opinion services

Mandatory since 30 Nov 2018 for forums, groups, information sharing, etc. A follow-graph feed with clubs and comments is squarely in scope. Triggered when social functions launch, user scale increases significantly, or authorities demand. **2–3 months** for foreign entities via a local entity.

### 6.3 Licence stack

| Licence | Trigger | Foreign eligibility |
|---|---|---|
| ICP Filing | Any China-hosted app | PRC entity required |
| MIIT App Filing | Any app distributed in China | PRC entity required |
| ICP Licence (B25) | Subscriptions / IAP / ads | **≤50%**; community-platform sub-category **not** in pilot |
| Internet Culture Business Licence | Revenue-generating cultural activities | Restricted; applicability to fitness feed **grey** |
| **Online Audio-Visual Programme Transmission Licence** | **Any UGC video** | 🔴 **State-owned/controlled applicants only. Foreign investors categorically ineligible.** |
| Internet News Information Service Licence | News/public opinion platforms | 🔴 Effectively closed |

🔴 **Sharpest edge: UGC video.** If users can post workout clips, the NRTA licence is unobtainable by a foreign-invested entity. **Recommendation: launch photo-only; video is phase 2 contingent on a licensed local partner.**

### 6.4 IP-location display and account rules

- ⚠️ **IP location attribution must be displayed** — province-level domestic, country-level overseas — on profiles and every post/comment. **A UI requirement.**
- Account-name restrictions; public account operators must display entity, USCC, contact details.

### 6.5 Content moderation obligations 🟡

*Online Information Content Ecosystem Provisions* (effective 1 March 2020): pre-publication UGC review with assigned moderators · 6-month data logs · professional review team sized to service · reporting/complaint mechanism · graduated sanctions · special obligations for **hot lists and recommendation feeds — a leaderboard is a ranked, algorithmically generated list and falls in scope.** Comment Services Provisions additionally require pre-posting comment review. Budget a continuous Chinese-language moderation team.

### 6.6 Algorithmic recommendation filing 🟢

*Algorithmic Recommendation Provisions* (1 March 2022): file the algorithm with CAC, publish basic algorithm information, **offer users an off switch for algorithmic recommendation.** A ranked feed plus personalised leaderboards is likely in scope.

### 6.7 Health/fitness-specific rules 🟢

- **General wellness tracking is not a medical device.** Diagnosing/monitoring disease → Class II NMPA registration (precedent: Apple's AFib feature approved as Class II, 26 Dec 2025).
- **Rule:** present HR, pace, VO2max, training load as *fitness* metrics. **Avoid** AFib/arrhythmia detection, blood pressure, ECG, sleep-apnea flags, injury diagnosis, and the words medical/diagnose/treat/monitor.
- **Advertising Law:** no superlatives (最佳, "number one"), no guaranteed results; ads labelled 广告, one-click closable.

### 6.8 Minors protection 🟡

*Minors Online Protection Regulations* (1 Jan 2024) + *Minors' Mode Guidelines* (15 Nov 2024): minors' mode required; daily caps (under-8: 40 min · 8–16: 1 h · 16–18: 2 h); service blocked 22:00–06:00; stranger-contact and visibility controls over minors in social features; age gating at signup.

---

## 7. Payments & Monetization — The Easy Part

### 7.1 🟢 Apple IAP works, and pays foreign developers directly

Apple is merchant of record. Chinese users pay RMB via Alipay, WeChat Pay, UnionPay. Apple handles China taxes; proceeds pay to your **foreign bank account**. **No Chinese entity needed to receive Apple's payout.**

### 7.2 🔥 Apple China commission cut, effective 15 March 2026

| Transaction type | Was | Now |
|---|---|---|
| Standard IAP | 30% | **25%** |
| Small Business Program (<$1m/yr) | 15% | **12%** |
| Subscription renewals after year 1 | 15% | **12%** |

Still contested — 48 China-based developers filed a SAMR complaint 23 June 2026. **Commission risk is skewed downward. Model 25%, or 12% if Small Business.**

### 7.3 🟢 WeChat Pay / Alipay cross-border — available to foreign companies

Both offer cross-border merchant accounts with **no Chinese entity and no Chinese bank account**: RMB in, 16 settlement currencies out, FX handled by the rail (~1–3% fee). WeChat Pay supports In-App Payment; Alipay via Adyen/Stripe/Worldpay, with Auto Debit for subscriptions. Setup 1–2 weeks via authorised partner.

⚠️ **The trap:** having a payment rail ≠ permission to charge. Subscription revenue from PRC users is a compensatory internet information service requiring the **B25 licence** held by a PRC entity. Apple-as-merchant-of-record is **a risk position, not a compliance position.**

### 7.4 Android billing

No Google Play Billing. Each store has its own SDK (Huawei IAP Kit, Xiaomi, Tencent, OPPO, vivo).

### 7.5 🟡 Repatriating revenue from a Chinese entity

Dividends 10% WHT (5% HK treaty) · service fees CIT + 6% VAT · royalties ~10% WHT + 6% VAT + MOFCOM registration. 🟡 **Statutory reserve trap:** ≥10% of after-tax profits to surplus reserve until 50% of registered capital. **If revenue flows Apple → foreign bank, this section largely doesn't apply — a genuine argument for the agent/cross-border route.**

---

## 8. Market Entry Paths — Structures, Costs, Timelines

### 8.1 WFOE

- Professional fees **USD 8,500–20,000**, 8 weeks–5 months. Registered capital: no statutory minimum, but **RMB 1m for ICP证** (10m cross-provincial); 🟡 **5-year hard pay-in** (Company Law Art. 47, effective 1 July 2024).
- Requires legal rep + director + supervisor; **named staff with PRC social-insurance records for the VATS licence**; real commercial address.
- Annual maintenance USD 22,000–35,000 (10-person service WFOE); dormant shell USD 6–12k/yr.

### 8.2 Joint Venture (foreign ≤50%)

Plus 3–9 months partner search and USD 30–100k+ legal fees. **At ≤50% you do not control the board, licence, domain, store accounts, or user data — by design.** PRC courts will not enforce a foreign-favourable side letter contradicting the cap. Nonetheless the only path to a B25 community-platform licence *and* potentially an IMS mapping qualification.

### 8.3 Local publishing partner / agent

Agent becomes **publisher of record** under their B25 licence; SCC can stay in your name. **Real risk is dependency and switching cost** — if the relationship ends, filings and listings don't travel. 👉 **Negotiate an explicit transition/assignment clause** (store account handover, ICP re-filing cooperation, user-data portability). ⚠️ No agent publishes pricing — **model 15–30% of China net as a planning assumption.** Timeline compresses to **3–5 months**.

### 8.4 Licensing / IP deal

Cleanest legally — brand + product IP in, royalty out (typical software band 5–15% of net), no data or mapping exposure. Watch 10% WHT + 6% VAT, MOFCOM registration, and **trademark squatting — China is first-to-file; file immediately regardless of path.**

### 8.5 Published price ranges

ICP Filing service USD 300–2,000 · ICP Licence agent fees USD 700–2,800 · SCC USD 300–450 · WFOE professional fees USD 8.5–20k · translation/notarisation USD 500–1,500 · China hosting USD 200–1,500/yr entry · .cn domain USD 15–50/yr.

### 8.6 Realistic timeline

```
Month 0-1    China trademark filing (first-to-file!) + product/legal scoping
Month 0-3    WFOE incorporation in pilot zone (8-12 wks) ∥ bank account (4-6 wks)
Month 2-3    Software Copyright Certificate
Month 3-4    China hosting + .cn domain + ICP Filing (20-30 working days)
Month 4      PSB Filing + MIIT App Filing
Month 4-7    Commercial ICP Licence B25 (60-90 business days)   <- long pole
Month 4-6    Localisation, PIPL rework, map SDK integration, payments
Month 6-8    Android store accounts + submission to 5-6 stores (2-6 wks each)
Month 7-9    Launch
```

**Own-entity route: 9–12 months. Agent route: 3–5 months.**

### 8.7 Year-1 budget (USD)

| Line item | Low (agent-led) | Mid (own WFOE, pilot zone) | High (WFOE + local team) |
|---|---|---|---|
| **Year 1 excl. capital** | **≈ 40k–75k** | **≈ 210k–250k** | **≈ 735k–875k** |
| **Year 1 incl. capital** | ≈ 40k–75k | **≈ 350k–390k** | **≈ 1.02m–1.16m** |

(Full line-item breakdown in source research. Not included: China map SDK licence and coordinate-conversion engineering — product-specific, unpriced.)

**Revenue haircuts to model:** Apple China 25% / 12% · Chinese Android non-game ~30% · payment channel ~0.6% · cross-border FX 1–3%.

---

## 9. How the Comparables Actually Operate

- **Strava** — exited mainland China June 2024 (inferred ICP-filing enforcement; never had a Chinese entity, `.cn` domain, or ICP number). Also exited Korea March 2025 over a trivial consent-flow request: *"We do not have the capability to create country-specific apps."*
- **Nike Run Club** — withdrew July 2022 with 8m+ Chinese users; replaced by WeChat mini-programs **without GPS tracking**. Nike has a Chinese entity and still chose not to run a GPS app.
- **Garmin Connect** — the only Western survivor: four wholly-owned Chinese entities, ICP filing 沪ICP备19007569号, separate `connect.garmin.cn` backend with isolated Chinese accounts, and a China-only social app (佳速度). **Not a preference — the only lawful configuration.**
- **adidas Running, UA MapMyRun, Peloton, Fitbit, WHOOP, Apple Fitness+** — all absent from mainland China.

---

## 10. Local Competitive Landscape

### Keep (HKEX: 3650) — the incumbent

FY2025: revenue RMB 1,637m (−20.8%), **first-ever adjusted net profit (+RMB 25.2m)**, average MAU **21.8m** (−27.2%), 2.74m monthly subscribers. Pricing ¥19/mo, ¥58/quarter, ¥218/yr. Three revenue legs: self-branded hardware (largest), membership/content, **virtual sports events + physical medals (RMB 20–179 entry, #1 revenue contributor at peak)**. 2026 pillars: AI coach (卡卡) and hardware. Keep already has GPS running, 50+ sports, leaderboards, virtual races with medals, watch sync, social sharing.

**Monetization read-across: the Chinese fitness market monetises through goods and events, not software subscriptions.**

### Scale proxies (CN App Store rating counts, verified)

Keep **2.95m** · Mi Fitness 1.78m · Yuedongquan 803k · Huawei Health 680k · Codoon 336k (claims 200m users) · Joyrun 332k (claims 110m users, 29k running crews) · Garmin 佳速度 613.

OEM health apps (Xiaomi/Huawei/Honor) are pre-installed on hundreds of millions of handsets — **the single biggest structural obstacle to any independent tracker in China**, and they're pre-installed on the very devices whose stores you need.

**Nobody is the Strava of China** — the social-graph + segments + leaderboard layer is fragmented. Market size: China fitness app revenue ~USD 754m (2025), CAGR ~14%.

### 🎯 The weightlifting gap — and it sidesteps the hard blocker

The entire Chinese strength-logging category sums to roughly **50,000 App Store ratings against Keep's 2.95 million — a ~60× gap** (硬汗健身 30.6k · 训记 10.8k · 开练 6.4k · others tiny). These are single-user logbooks: **they do not rank people.** No Chinese app found operating national strength leaderboards — no 1RM rankings, no Wilks/DOTS boards, no gym-vs-gym competition. Keep's leaderboards attach to cardio, not lifts.

**Cardio has a social-competition layer; strength has a logging layer and no competition layer at all.** And critically: **a strength product needs no GPS, no basemap licence, and no coordinate transform — it sidesteps §4 entirely.**

⚠️ Open question: a Chinese powerlifting community may live inside WeChat groups or Xiaohongshu rather than a standalone app.

---

## 11. Risks and Go / No-Go Checklist

### 11.1 🔴 Hard blockers — a different product or structure, not more paperwork

1. **Map display + coordinate conversion** — licensed Chinese basemap + GCJ-02 required; foreign entities cannot hold the mapping qualification. Forces a forked China build.
2. **Trajectory collection and export** — route/segment/heatmap databases are map-data compilation (foreign-prohibited or JV-only); map data stored in China unconditionally; export needs MNR approval before CAC assessment.
3. **No mainland legal entity → no app.** ICP, MIIT filing, real-name, Android accounts, SCC, and data-export routes all presuppose one. **Hong Kong does not count.**
4. **Data localisation** — separate China backend, isolated account system. **A single global user graph is not achievable.**
5. **All core data is sensitive PI** (health + trajectory) — transfer mechanism required from user one, only open to a PRC entity.
6. **100% foreign ownership + ICP证 outside the four pilot zones** → not permitted.
7. **The likely B25 sub-category (community platform / instant interaction) is not in the pilot list.**
8. **UGC video** requires a state-owned-only licence.
9. **Nominee ICP filings are being unwound.**
10. **One-global-build architecture = China closed by construction** (Strava's own Korea statement).

### 11.2 🟡 Expensive but solvable

RMB 1m registered capital with 5-year pay-in · statutory reserve lock · named local staff with PRC social insurance · SCC via mainland entity · data-isolated China architecture + PIPL rework · staffed Chinese-language moderation · minors' mode · real-name verification.

### 11.3 🟢 Administrative — time and paperwork

- [ ] China trademark filing (**first-to-file — do this first regardless of path**)
- [ ] ICP Filing (~20 working days) + China-registered domain + China hosting
- [ ] PSB Filing (within 30 days of ICP)
- [ ] MIIT App Filing (20 working days)
- [ ] Software Copyright Certificate via mainland entity (2–4 weeks)
- [ ] Commercial ICP Licence B25 (60–90 business days; annual review)
- [ ] Security assessment filing for social functions (2–3 months)
- [ ] Algorithmic recommendation filing with CAC (feed + leaderboards)
- [ ] MLPS grading (Level 3 typical)
- [ ] PIPL Art. 53 domestic representative; PIPO at 1m users; DPO/dept at 10m
- [ ] PIPIAs with 3-year retention; biennial audit at 10m users
- [ ] SCC filing or certification for any cross-border flow
- [ ] Two separate unbundled consents (sensitive data; cross-border)
- [ ] IP-location display in the UI
- [ ] 6-month log retention
- [ ] 审图号 displayed; map source attributed; user-added map content verified
- [ ] Per-store Android submissions (2–6 weeks each × 6 stores)
- [ ] Annual SAMR report, statutory audit, SAFE/FDI reporting

### 11.4 Go / No-Go decision gates

**No-go if any of the following are non-negotiable:** single global backend serving Chinese users · Chinese GPS tracks syncing overseas · global leaderboards/heatmap including PRC territory · unified worldwide accounts · majority foreign ownership of a monetised community feed · UGC video at launch · anonymous signup · one global build.

**Viable architectures, descending practicality:**
1. **Strength-first product** — no GPS/basemap/coordinate issues; the category is empty.
2. **License to a Chinese operator** — brand + IP in, royalty out; no data or mapping exposure.
3. **JV with a qualified mapping entity** — fully China-resident data plane, foreign stake ≤50%.
4. **WFOE in a pilot zone** — licensed map SDK, photo-only feed, all PRC data in China; residual B25 sub-category risk.
5. **Local publisher, minimum footprint** — fastest (3–5 months), least control.

---

## 12. The Two Observations to Carry Forward

**1. Payments are the easy part; the regulatory gate is the hard part.** Apple IAP works, pays foreign developers directly, and just got cheaper (25%/12%). WeChat Pay and Alipay offer genuine cross-border merchant accounts. **None of that helps if the app cannot stay listed.**

**2. The regulatory burden falls almost entirely on the GPS/map dimension — exactly where the market is already saturated, while the un-blocked half is empty.** Keep owns cardio-social-competition; Chinese strength logging has no ranking layer at all, and a strength product needs no GPS, basemap, or coordinate transform.

**If there is a China thesis in this product, it is the weightlifting-rankings half, not the Strava half.**

---

## 13. Watch List for 2026

- Amended Cybersecurity Law in force 1 Jan 2026 — 10× CIIO penalties, broadened extraterritoriality
- GB/T 46068-2025 cross-border PI guidance effective 1 March 2026
- CAC certification route operational since 1 Jan 2026
- CAC's narrow construction of export exemptions (Oct 2025 FAQ)
- SAMR complaint against Apple (23 June 2026) — commission risk skewed downward
- VATS pilot expansion — 166 FIEs approved June 2026; watch for community-platform sub-categories being added
- FTZ negative lists — cross-FTZ effectiveness could change the CBDT calculus
- MIIT app inspection sweeps — excessive location-permission requests among most-cited violations

---

## 14. Research Limitations, Stated Plainly

- **Unverified:** exact withdrawal dates for adidas Runtastic and UA MapMyRun; Peloton/Fitbit China history; OEM health-app MAU; whether a Chinese powerlifting leaderboard community exists inside WeChat/Xiaohongshu; **publishing-agent pricing (15–30% is a planning assumption, not sourced)**; China IP royalty rates.
- **Inference, not documentation:** Strava's removal reason (ICP filing) — strong circumstantial case, never confirmed.
- **Weakly sourced:** the 地图管理条例 citation; the 19-company Class-A map roster; Internet Culture Licence applicability to a fitness feed.
- **Source conflicts (resolved inline):** pilot B25 sub-category scope (trust MIIT primary text); WFOE cost (MSA USD 8.5–20k is like-for-like professional fees); Apple ICP enforcement (AppInChina's "not enforced" guidance is stale — storefront evidence contradicts it).

---

## Sources

**App filing, ICP & VATS:** [MIIT 通信函〔2024〕107号](https://www.miit.gov.cn/zwgk/zcwj/wjfb/tg/art/2024/art_2326271e1b424e09b6e5924ad2948863.html) · [gov.cn — 166 FIEs approved](https://english.www.gov.cn/news/202606/04/content_WS6a20d716c6d00ca5f9a0b635.html) · [Linklaters TechInsights](https://techinsights.linklaters.com/post/102j72l/china-the-new-app-filing-regime-keeps-mobile-apps-under-tight-scrutiny) · [Norton Rose Fulbright](https://www.nortonrosefulbright.com/en/knowledge/publications/9a7191d2/new-record-filing-requirements-for-internet-application-programs) · [China Briefing — internet business licences](https://www.china-briefing.com/news/china-internet-business-licenses-foreign-companies/) · [AppInChina — ICP Licence](https://www.appinchina.co/how-can-i-get-an-icp-license-for-china/) · [DaHui — VATS pilot](https://www.dahuilawyers.com/en/news-insights/chinas-elimination-of-foreign-investment-restrictions-in-telecoms-services-under-pilot-policy-comes-to-fruition/) · [MSA — ICP licence](https://msadvisory.com/icp-license-china/) · [AppFilingChina](https://www.appfilingchina.com/blog/app-filing-number-is-needed-for-apps-to-be-listed-on-the-apple-app-store-in-china)

**Distribution & Apple:** [Apple — China commission cut](https://developer.apple.com/news/?id=dadukodv) · [AppleInsider — 25% commission](https://appleinsider.com/articles/26/03/13/apples-app-store-in-china-gets-lower-25-commission-to-appease-regulators) · [MacRumors — SAMR complaint](https://www.macrumors.com/2026/06/23/apple-faces-new-app-store-antitrust-complaint/) · [Apple 2024 Transparency Report](https://www.apple.com/legal/more-resources/docs/2024-App-Store-Transparency-Report.pdf) · [Apple 2025 Transparency Report](https://www.apple.com/legal/app-store/transparency/2025/) · [TechCrunch — WhatsApp/Threads removal](https://techcrunch.com/2024/04/19/threads-whatsapp-removed-from-china-app-store/) · [Tech Transparency Project](https://www.techtransparencyproject.org/articles/apple-censoring-its-app-store-china) · [Apple Censorship — Strava](https://applecensorship.com/app-store-monitor/app/426826309) · [AppInChina — top 15 app stores](https://www.appinchina.co/blog/the-top-15-app-stores-in-china/) · [Huawei IAP Kit](https://developer.huawei.com/consumer/en/hms/huawei-iap)

**Mapping & geodata:** [gov.cn — 自然资办函〔2024〕972号](https://www.gov.cn/zhengce/zhengceku/202405/content_6950568.htm) · [Zhong Lun — Regulation on Digital Maps](https://en.zhonglun.com/research/articles/52416.html) · [Wikipedia — Restrictions on geographic data in China](https://en.wikipedia.org/wiki/Restrictions_on_geographic_data_in_China) · [Intellias — map compilation for China](https://intellias.com/map-compilation-for-china-challenges-and-ways-to-overcome-them/) · [Amap Open Platform compliance](https://lbs.amap.com/agreement/compliance) · [China Justice Observer — Surveying and Mapping Law](https://www.chinajusticeobserver.com/law/x/surveying-and-mapping-law-20170427) · [Bird & Bird — geographic data & ICVs](https://www.twobirds.com/en/insights/2022/china-strengthens-control-over-geographic-data-processing-by-icvs)

**Payments & repatriation:** [WeChat Pay Cross-Border](https://act.weixin.qq.com/static/merchant_overseas/introduction_en.html) · [Alipay Global](https://global.alipay.com/platform/site/merchant) · [EY — China VAT Law](https://www.ey.com/en_gl/technical/tax-alerts/china-officially-enacts-vat-law-ushering-in-a-new-era-of-tax-governance) · [MSA — WFOE cost](https://msadvisory.com/wfoe-cost-china/) · [AppInChina publishing](https://www.appinchina.co/services/publishing/)

**Data regulation:** [PIPL Art. 28](https://chinadataregulation.com/laws/pipl/articles/article-28/) · [DLA Piper — China transfer](https://www.dlapiperdataprotection.com/countries/china/transfer.html) · [Arnold & Porter — CBDT clarifications](https://www.arnoldporter.com/en/perspectives/advisories/2025/06/china-clarifies-cross-border-data-transfer-rules) · [Morgan Lewis — certification measures](https://www.morganlewis.com/pubs/2025/10/chinas-data-outbound-rules-update-measures-for-the-certification) · [Morgan Lewis — GB/T 45574-2025](https://www.morganlewis.com/pubs/2025/09/chinas-new-standard-on-sensitive-personal-information-goes-into-effect-november-1) · [Latham — CSL amendments](https://www.lw.com/en/insights/chinas-cybersecurity-law-amendments-increase-penalties-broaden-extraterritorial-enforcement) · [Bird & Bird — PI audit](https://www.twobirds.com/en/insights/2025/china/chinas-pi-audit-regulation-finally-released-what-you-need-to-know) · [China Briefing — Network Data Security Regs](https://www.china-briefing.com/news/china-issues-new-regulations-on-network-data-security-management-effective-january-1-2025/)

**Content & social:** [AppInChina — social functions](https://appinchina.co/blog/how-to-deploy-social-functions-for-your-platform-in-china/) · [China Law Translate — Account Information Provisions](https://www.chinalawtranslate.com/en/user-account-information/) · [China Law Translate — Comment Services](https://www.chinalawtranslate.com/en/comments-section-2022/) · [China Law Translate — Minors' Modes](https://www.chinalawtranslate.com/en/minors-modes/) · [Content Ecosystem Provisions](https://appinchina.co/government-documents/provisions-on-the-ecological-governance-of-network-information-contents/) · [Jun He — medical software](https://www.junhe.com/legal-updates/2036) · [Morgan Lewis — internet advertising](https://www.morganlewis.com/pubs/2023/04/new-measures-for-online-advertising-in-china-what-you-need-to-know)

**Competitors:** [Strava — availability](https://support.strava.com/en-us/articles/15401978-strava-availability-in-certain-countries) · [Asiae — Strava Korea exit](https://view.asiae.co.kr/en/article/2025032119222191954) · [GreatFire — strava.com](https://en.greatfire.org/strava.com) · [CNN — Nike Run Club China shutdown](https://www.cnn.com/2022/06/08/business/nike-run-club-app-china-shutting-intl-hnk/index.html) · [Garmin China — about](https://www.garmin.com.cn/company/about/) · [Keep IR](https://ir.keep.com/en/index.php) · [Keep FY2025 HKEX filing](https://www1.hkexnews.hk/listedco/listconews/sehk/2026/0325/2026032500119.pdf) · [Codoon](https://www.codoon.com/h5/codoon-welcome/about.html) · [Joyrun](https://www.thejoyrun.com/about.php) · [Grand View Research — China fitness app market](https://www.grandviewresearch.com/horizon/outlook/fitness-app-market/china)
