# DataCenterMania: Product Review (build v0.3, Chapters 0–3)

*Reviewer stance: game product manager. Reviewed: the live build, the PRD v0.1, and simulation measurements. Date: 2026-11-20.*

## 1. Verdict

The foundation is strong. The simulation is deterministic and tested, the core verb (spot an alarm, dispatch the right person) is readable on desktop and phone, and the setting is fresh. **But the game currently asks too little of the player for too long, and rewards them too vaguely.** A sim fan will appreciate the systems. A casual player will drift away in the long quiet stretches, long before the interesting layers arrive.

| Area | Grade | One-line reason |
|------|:----:|-----------------|
| Concept & theme | **A** | Original, funny, teaches real DC concepts |
| Core loop clarity | **B+** | Alarm → dispatch → fix reads instantly; colour-blind-safe |
| Moment-to-moment engagement | **C** | 80–89% of daytime has nothing to react to |
| Session fit (mobile) | **C−** | Chapters run 18–32 real minutes; PRD target is 5–15 |
| Learning curve | **B−** | Smooth to Ch2, then Ch3 adds 5 systems at once |
| Reward & feedback ("juice") | **C** | Money arrives once a day at midnight; few celebrations |
| Challenge & mastery | **C** | A competent player gets ★★★ on almost every chapter |
| Retention / meta | **D** | No achievements, daily challenge, sandbox or career |
| Tech & performance | **A** | 35 KB gz, offline, 135 tests, e2e on phone |

## 2. Evidence

Measured with the autopilot "competent player" bot on Sysadmin, 3 seeds per chapter, at 1× speed with night skip. "Quiet" means no open alarm and no job in progress during daytime (06:00–22:00).

| Chapter | New systems | Real min at 1× | Incidents / game day | Quiet daytime | Longest quiet stretch | Bot ★ |
|---|---|---:|---:|---:|---:|---|
| 0 The Closet | shop | **23.7** | 1.2 | 23%¹ | 2.8 min | 3, 3, 3 |
| 1 Server Room | hiring, contracts | 18.2 | 3.7 | **88%** | 3.7 min | 3, 3, 3 |
| 2 Startup Colo | power, build racks, coolers | **31.8** | 3.6 | **89%** | **4.9 min** | 0, 3, 2 |
| 3 Colocation Floor | aisles, network, roles, fatigue, maintenance | **32.1** | 7.2 | 80% | 4.5 min | 3, 3, 3 |

¹ Ch0 looks "busy" only because the weekend overheat alarm stays open. Player decisions there are very sparse (about 0.14 actions per real minute).

What the numbers say:

1. **Too long for the tutorial.** Ch0 is a 24-minute tutorial with roughly 3 meaningful decisions.
2. **Long dead air.** Typically 4–5 real minutes pass with nothing to do. That is longer than the attention span of the mobile audience the PRD targets.
3. **One session no longer fits a chapter.** At 18–32 minutes per chapter, the PRD's "one session = one shift" is broken.
4. **Ch3 breaks pillar #4** (*"Each chapter adds 1–2 new systems"*). It adds five.
5. **Stars do not separate players.** ★★★ comes almost for free. Mastery has no target.
6. **Ch1's economy is meaningless.** The bot ends Ch1 about $5k in the red and still gets ★★★, so money teaches nothing there.

## 3. What works (keep and amplify)

- **The dispatch verb.** A big "Swap disk" button with "Best tech" pre-selected is 2 taps. This is the right core.
- **The job is visible.** Watching the tech walk to storage, grab a part, walk to the rack and work explains why fixes take time, so layout matters without a tutorial.
- **Mentor tips that pause the world.** Low pressure, and they teach just in time.
- **Real-world grounding** (RAID warning before data loss, breakers, aisles, the backhoe). It is the game's personality and its educational hook.
- **The backhoe story beat in Ch3.** Scripted drama on top of a systemic sim is the best moment in the build. We need more of these.
- **Tech quality.** Determinism plus the bot harness lets us measure every design change. Few indie games have this; it should drive our balancing culture.

## 4. Problems, ranked by impact

| # | Problem | Impact | Evidence |
|---|---------|--------|----------|
| P1 | **Dead air.** Nothing to do between incidents | Churn in first session | 80–89% quiet daytime, 4–5 min stretches |
| P2 | **Chapters too long for a session.** No natural stopping points | Mobile churn; "I'll finish later" never happens | 18–32 min per chapter |
| P3 | **Tutorial too long and thin** | Players quit before Ch1, where the real game starts | Ch0 24 min, 1.2 incidents/day |
| P4 | **Money is invisible until midnight**, and there is no per-contract profitability | Players cannot learn the economy; decisions feel random | Cash changes about once per 8 real minutes |
| P5 | **Ch3 overload** (5 systems), plus a tip storm in its first game hour | Confusion, "too much stuff" | Features diff; 4 tips in the first 5 hours |
| P6 | **No mastery or meta progression** | No reason to replay or come back tomorrow | ★★★ for everyone; no achievements, daily challenge or sandbox |
| P7 | **Micromanagement grows before automation arrives.** Auto-dispatch is planned for Ch4 | Busywork in Ch3 at 7 incidents/day with 4 roles | Actions/min rising 0.14 → 1.66 |
| P8 | **Specialists idle most of the time** (HVAC and network techs) | Salaries feel wasted; hiring feels like a tax | Most Ch3 incidents are hardware |
| P9 | **Weak juice.** No money pops, streaks, combos or celebrations; mostly text toasts | Game feels like a dashboard | UI review |
| P10 | **No fail-forward learning.** Outages end in a log line, not a lesson | Players blame RNG instead of learning | PRD post-mortem idea not built |
| P11 | **Cyber villains (the marketing hook) not built yet** | Screenshots and trailer lack the fun, colourful hook | PRD §9 |
| P12 | **No playtest data from humans** | We are tuning to a bot that reacts in 5 game minutes | Bot ≠ human |

## 5. Proposals (prioritised)

### P0: Fix the first hour (next release)

1. **Shift-based chapters (fixes P2).** Each game day is a **Shift** with its own mini-goal ("Keep ByteBank above 99.5% today", "Install 3 servers before 18:00"). It ends at 22:00 with an **end-of-shift report card** (stars, money, highlights), then autosaves. Nights become an optional **"Sleep" fast-forward** with a 15-second recap ("While you slept: 1 disk swapped by Mia, ISP fixed the fiber"). Target: **6–9 real minutes per shift**, with chapters as 3–5 shifts.
2. **Tutorial rebuilt as a 6–8 minute Ch0 (fixes P3).** Friday 09:00 to Friday 22:00 only. Scripted beats every 60–90 seconds: disk, contract, install, power warning, AC-off, choice (portable AC or power-off). The weekend part becomes the first **Shift challenge** of Ch1 (optional).
3. **Live money (fixes P4).**
   - Revenue accrues per game hour, with floating "+$" pops above racks of paying customers and "−$" when an SLA minute is missed.
   - A **contract card shows margin** (revenue − servers' power − share of rent).
   - A **projection chip** in the HUD: "On track: $6.2k / goal $5k ✓".
4. **Always-visible goal chip (fixes P4 and P6).** The current ★ objective with live progress, tappable to open Goals. This replaces "goals are checked at the end".
5. **Calm-time activities (fixes P1).** Things to do when nothing is burning, all optional, short and rewarding:
   - **Ops projects:** 1–3 minute jobs that pay back later. Cable tidy-up (fewer "wrong cable" mistakes), labelling (faster repairs), firmware campaign (fewer hangs), preventive filter change.
   - **Contract negotiation:** a 3-choice card when an offer arrives (price, SLA, duration trade-offs).
   - **Walk-ins:** small timed requests from customers ("ByteBank needs a server rebooted in 20 min: +$300").
   - **Target:** quiet daytime **≤ 50%** and no quiet stretch longer than **90 real seconds** on Sysadmin.

### P1: Depth, mastery and a reason to return

6. **Re-sequence the chapters to respect "1–2 systems per chapter" (fixes P5).** Ch3 keeps aisles, CRAC and HVAC. Network and fiber move to a new **Ch4 "Launch Week"**. Fatigue and morale move to the Enterprise chapter together with shifts, where they matter most. Tips are spaced by **teaching moments**, not by clock time.
7. **Auto-dispatch rules unlock in Ch2 (fixes P7).** It starts as one toggle, "Auto-send best tech to hardware alarms", that costs a **Shift Lead's salary**. Rule cards follow in Ch4 and runbooks in Ch5. Players buy back their attention with money, which is a clear economic decision.
8. **Specialists get proactive work (fixes P8).** HVAC techs auto-run preventive maintenance when idle. Network engineers run cable audits that reduce "wrong cable" incidents. Both show up as small badges ("prevented 2 incidents today").
9. **Make ★★★ hard (fixes P6).** Each chapter gets a **constraint challenge** the bot does *not* hit by default (e.g. "Finish with ≤ 2 techs", "Never pause", "PUE < 1.5", "No server ever above 30°C"). Aim for **★ for 80% of players, ★★ for 40%, ★★★ for 10%** (to be measured).
10. **Meta progression.**
    - **Career profile:** a title that grows with total stars (Intern → Sysadmin → Architect → CTO).
    - **Achievements:** "It Was DNS", "Survived the Backhoe", "Five Nines Week", and so on.
    - **Cosmetics:** technician outfits, rack LED colours, office pets for the NOC.
    - Nothing that adds power.
11. **Daily Challenge (seeded).** The same 1-shift scenario for everyone each day, with a shareable result card ("DataCenterMania #42: ★★☆ · 99.93% · 🔥🔥"). It works with zero backend because the simulation is deterministic and keyed by date.

### P2: Delight and differentiation

12. **Juice pass.** Money pops, an alarm "whoosh" into the list, confetti for a clean shift, technician speech bubbles ("Found it!", "Who labelled this?!"), a streak counter for consecutive SLA-perfect hours, and screen shake for criticals (respecting reduced motion).
13. **Incident post-mortem (fixes P10).** After every outage longer than 10 game minutes, show a 3-step timeline card: *what happened → why → how to prevent it*. It includes a one-tap fix where possible ("Order 2 spare disks"). Learning becomes the reward for failing.
14. **Cyber villains as a weekend event (fixes P11).** Ship *Script Kiddies* and *Captain Phish* as a self-contained "Hacker Weekend" scenario before the full Ch5 cyber layer. It gives screenshots and marketing a colourful hook early.
15. **Sandbox / Endless mode.** Unlocked after Ch2. Pick a floor size, seed and difficulty sliders, then play until bankruptcy, with a high score. This serves long-tail sim fans.

### Measurement (fixes P12)

16. **Opt-in, privacy-friendly telemetry.** Off by default and anonymous. It counts things like chapter starts and completions, shift length, quits mid-shift, and time-to-first-dispatch. It is sent to a tiny endpoint or simply exported as JSON from the settings screen. Add an in-game **"Send feedback"** link.
17. **Human playtests.** 5 players per milestone: think-aloud on desktop and phone. Record first-session length, the first confusion point, and the moment they smile.
18. **Bot-driven guardrails in CI.** Keep the balance tests and add **engagement assertions**: quiet daytime ≤ 50%, longest quiet ≤ 90 s, shift length 6–9 min, ★★★ not reached by the default bot. Design regressions then fail the build like bugs do.

## 6. Proposed roadmap

| Release | Theme | Contents | Exit criteria |
|---|---|---|---|
| **v0.4 "First Hour"** | Fix onboarding and pacing | Shifts and report cards, 8-minute Ch0, live money and projection chip, goal chip, ops projects, walk-ins | Ch0 ≤ 9 min; quiet ≤ 50%; 5/5 testers finish Ch0, 4/5 start Ch1 |
| **v0.5 "Mastery"** | Reasons to replay | Hard ★★★ constraints, achievements, career title, daily challenge and share card, post-mortems | Bot ★★★ rate ≤ 20%; daily-challenge share card works offline |
| **v0.6 "Launch Week"** | Re-sequence and automation | Split Ch3/Ch4 (network to Ch4), auto-dispatch in Ch2, proactive specialists, juice pass | ≤ 2 new systems per chapter; actions/min flat from Ch2 to Ch4 |
| **v0.7 "Hackers"** | Differentiator | Hacker Weekend event (2 villains, 3 micro-games), sandbox mode | Event playable in ≤ 10 min; 3 micro-games pass phone touch tests |
| **v1.0** | Enterprise and polish | UPS/generator/shifts chapter, fatigue moves here, accessibility audit, localisation (FR) | KPIs in PRD §19 met in a 20-player test |

## 7. Decisions needed from you

1. **Shift structure.** Approve splitting chapters into ~8-minute shifts with report cards? *(Recommended: yes, this is the biggest lever.)*
2. **Chapter re-sequencing.** OK to move network to a new Ch4 and fatigue to the Enterprise chapter, which renumbers later chapters? *(Recommended: yes.)*
3. **Telemetry.** Allow an opt-in anonymous endpoint, or JSON export only? *(Recommended: export-only first; it keeps "no accounts, no tracking".)*
4. **Daily challenge share text.** Fine to include an emoji result line meant for social posts? *(Recommended: yes; it is free marketing.)*
