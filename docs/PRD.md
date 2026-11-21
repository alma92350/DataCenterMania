# DataCenterMania — Product Requirements Document (v0.2)

> **v0.2 (2026-11-20):** updated after the product review of build v0.3 (Chapters 0–3). The full review and its measurements are in [`PRODUCT_REVIEW.md`](PRODUCT_REVIEW.md). Changes are summarised in §21, and items marked *proposed* await a decision.

> A management/sim game for the browser (desktop and mobile) where you run a data center: you start in a server closet and end up running a whole floor of servers, AI wing included. You keep machines alive, keep customers happy, and keep the attackers out, mostly by sending the right technician to the right rack at the right moment.

---

## 1. Vision & Pillars

**Elevator pitch:** *Theme Hospital meets on-call duty.* You are the data center manager. Alarms go off, demand spikes, a disk fails, the cooling unit coughs, someone tries ransomware on you. You don't fix things yourself for long. You hire, dispatch, train and automate a team of technicians, and you grow from 1 rack to thousands.

**Design pillars**

| # | Pillar | What it means in practice |
|---|--------|---------------------------|
| 1 | **Readable chaos** | Many things happen at once, but you can always see *what's wrong, where, and how urgent* in under 2 seconds. |
| 2 | **Dispatch is the core verb** | Most interactions are *select problem → pick technician → confirm*. It must be fast on a touchscreen. |
| 3 | **Systems that interact** | Power, heat, network, load and security are all connected. Overloading a rack heats it, heat raises the failure rate, a failure trips the SLA, and the SLA hits revenue. |
| 4 | **Learn by layering** | Each chapter adds 1–2 new systems. No system is shown before the player needs it. |
| 5 | **Micro → Macro** | Early game: you click on every disk swap. Late game: you design runbooks and automation, and only step in on the hard incidents. |
| 6 | **Funny, never cynical** | IT humour (the intern, "it's always DNS", Friday deploys), with mechanics that are actually grounded in how data centers work. |

**Target audience:** Casual-to-midcore management sim players (Two Point / Game Dev Tycoon / Mini Metro crowd), IT workers who'll enjoy the in-jokes, and students who'll learn real DC concepts (PUE, hot/cold aisle, N+1, RAID).

**Session shape:** 5–15 min on mobile (one "shift" or one chapter), 30–90 min on desktop. Can be paused at any time.

**Business model: free.** No ads, no in-app purchases, no energy timers, no accounts. The game is static and runs entirely in the browser.

### 1.1 Decisions log
| Topic | Decision |
|-------|----------|
| Floors | **Single floor** for this game. Multiple floors and buildings are parked for later. |
| Difficulty | **Multiple difficulty levels** (Intern → Five Nines) plus ★/★★/★★★ chapter goals. See §12. |
| Map view | **Top-down** 2D tile grid. Racks get a light faux-3D front face for readability. |
| Game speed | **1 real second = 3 game minutes at 1×.** One game day ≈ 8 real minutes, which is one mobile session. See §3.1. |
| Cyber layer | **Fun and arcade-like, not a security simulator.** Short, readable, humorous. See §9. |
| Monetisation | **Free.** |
| Session unit | **Approved and shipped in v0.4:** the **Shift** (one game day) with an end-of-shift report card. Chapters are 1–5 shifts. See §21.1. |
| E-ink display | **Shipped in v0.4:** a Kindle Scribe / e-ink mode, auto-detected via `update: slow`, `monochrome` and the Kindle UA, or set manually. See §2. |
| Chapter order | **Shipped in v0.6:** at most two new systems per chapter (enforced by a test). Network and fatigue live in the new Ch4 "Launch Week". See §21.5. |
| Contracts | **Shipped:** every contract has its own project name, unique per customer ("ByteBank · Payments Gateway"). |
| Art | **Shipped:** hand-drawn SVG sprites (role portraits, parts, coolers, places) with e-ink greyscale versions; no emoji on the map. |
| Telemetry | *Proposed:* opt-in only, anonymous, export-as-JSON first. No accounts, no tracking by default. See §21.10. |

---

## 2. Platform & Technical Constraints

- **SPA, pure HTML/CSS/JS** (TypeScript optional), with no backend for the MVP. Static hosting (GitHub Pages).
- **Rendering:** Canvas 2D for the floor map (or PixiJS if we need sprite batching), and DOM/CSS for panels and menus, because DOM is easier for accessibility and responsive layout.
- **Input:** Mouse plus keyboard shortcuts on desktop. Tap, long-press, pinch-zoom and drag-pan on mobile. **No hover-only information.**
- **Performance budget:** 60 fps on a mid-range 2022 Android phone. Initial load under 3 MB. Simulation tick decoupled from rendering.
- **Saves:** localStorage/IndexedDB autosave every in-game hour and on `visibilitychange`. Export/import save as JSON (enables cross-device play without a backend).
- **PWA:** Installable and works offline.
- **Orientation:** Portrait-first on mobile (one-handed), with landscape supported. Desktop uses a multi-panel layout.
- **E-ink screens (Kindle Scribe):** a dedicated display mode. Pure black/white/grey palette; severity and status carried by shape, border style and pattern; no animation or transitions; the canvas redraws only on change (≤ 2 per second); larger text and 48 px+ targets; longer toasts. Auto-detected (`update: slow`, `monochrome`, Kindle/Silk UA), forced with `?eink=1`, or chosen in Settings.
- **Localization-ready:** All strings in JSON. EN first, FR second.

---

## 3. Core Loops

```
MICRO (seconds)   Alarm fires → inspect → dispatch tech → tech walks, fetches part, works → resolved / escalated
MID   (minutes)   Accept contract → install capacity → balance power/cooling → meet SLA → get paid
MACRO (hours)     Unlock chapter → expand floor area → research tech → hire & train team → automate → reputation tier
```

### 3.1 Time model

The goal is for one game day to fit one short mobile session, while every job stays long enough to watch.

| Speed | Real time → game time | 1 game day lasts | Use |
|-------|-----------------------|------------------|-----|
| ⏸ Pause | — | — | Planning, building and dispatching are all allowed while paused |
| 1× | 1 s → 3 min | **8 min** | Default |
| 2× | 1 s → 6 min | 4 min | Calm periods |
| 4× | 1 s → 12 min | 2 min | Nights, waiting for deliveries |
| Night skip | Auto 4× from 22:00 to 06:00 when no alarm is ≥ Major | — | Drops back to 1× (plus optional auto-pause) on a Major alarm |

**Calendar.** Contracts are measured in **game days**, not months: a small contract runs 3–10 days, a big one 15–30. Billing happens daily at midnight, with a short end-of-day report. A campaign chapter lasts 3–7 game days, so 25–55 real minutes at 1× and less with fast-forward. Week structure (Mon–Sun) matters for demand curves and "Friday" events.

**Job durations** (game minutes, with real seconds at 1× in brackets):
- Quick: reboot 5 (≈2 s), patch a cable 10 (≈3 s)
- Standard: swap a disk or PSU 15 (5 s), install a server 30 (10 s)
- Long: CRAC service 60 (20 s), generator test 60 (20 s)
- Heavy: install a rack 180 (60 s), fiber repair 120 (40 s)
- Walking speed: about 4 tiles per real second at 1×, so crossing a 40-tile floor takes about 10 s. That makes the layout and the position of the storage room matter.

**Alarm escalation timers** (game time): Warning to Major in 2 h (40 s at 1×). Major to Critical/outage in 45 min (15 s).

**Incident rate target** (tuned through MTBF scaling): Ch0–Ch1 about 2–4 incidents per game day, Ch3 about 8–12, Ch5+ 20+ but with most handled by automation. Players should never wait more than about 60 real seconds with nothing to do at 1×. If they would, they can fast-forward.

**Failure state:** Bankruptcy (cash < 0 for N days), or reputation collapse (lost all contracts). Chapters also have **objective-based wins** (e.g. "Reach 99.9% uptime for 7 days while hosting 20 servers").

---

## 4. World Model

### 4.1 Spatial hierarchy
```
Site (city/climate, chosen in sandbox: affects free cooling, power price, disasters)
 └─ Floor (single floor; grows by unlocking areas)
     └─ Zone / Room (server room, power room, storage, NOC, generator yard)
         └─ Row / Aisle (hot aisle / cold aisle orientation matters)
             └─ Rack (42U, power budget kW, weight, PDUs A+B)
                 └─ Device (server 1U/2U/4U, switch, storage array, GPU node, patch panel)
                     └─ Components (disks, PSUs, fans, RAM, NICs) — abstracted to "health" + named failure
```
The **floor map** is a top-down tile grid. Tiles: floor, rack slot, CRAC unit, PDU, UPS room, generator yard, loading dock, storage room, NOC (staff room), corridor, door (with access control), fire suppression zone.

### 4.2 Infrastructure subsystems

| Subsystem | Elements | Key stat | Introduced |
|-----------|----------|----------|-----------|
| **Compute** | Servers, storage, GPU nodes | Load %, health, age, firmware version | Ch1 |
| **Power** | Utility feed, PDUs, UPS, generator, ATS, (later) solar/battery | kW used vs capacity, redundancy (N, N+1, 2N) | Ch1 (basic), Ch4 (full) |
| **Cooling** | Wall AC → CRAC/CRAH → in-row → liquid/immersion | Zone temperature, airflow, PUE | Ch2 (basic), Ch3 (aisles), Ch6 (liquid) |
| **Network** | ToR switches, core/spine, uplinks/ISPs, cabling | Bandwidth, latency, link redundancy | Ch3 |
| **Security (physical)** | Badge doors, cameras, guards, visitor escort | Intrusion risk | Ch4 |
| **Security (cyber)** | Firewall, IDS, patch level, MFA, SOC analyst | Threat level, vuln count | Ch5 |
| **Logistics** | Loading dock, storage room, parts inventory, vendors | Stock, delivery ETA | Ch2 |

### 4.3 Simplified simulation rules (to tune)

- **Heat:** `rack_heat = Σ device_power × load_factor`. Zone temp = ambient + heat − cooling capacity (shared by nearby CRACs, falling off with distance). Without containment, hot-aisle air leaks into the cold aisle and adds a penalty.
- **Failure rate:** Base MTBF per device × age multiplier × **temperature multiplier (×2 for every +10 °C above 27 °C)** × maintenance multiplier (dusty filters, old firmware).
- **Power:** If rack kW exceeds its PDU rating, the breaker trips and the whole rack goes down. With single-corded devices, losing feed A kills the device; with dual-cord, the device survives on feed B.
- **PUE** = total facility power / IT power. It drives the electricity bill and the "green" score. Early wall AC gives PUE ≈ 2.2; late liquid cooling gets to ≈ 1.1.
- **Demand:** Each contract has a load curve (diurnal, weekly, event spikes). Load above capacity causes SLA breaches. Very high load raises heat and failures.
- **Deterministic seeded RNG,** for daily challenges, replays and bug reproduction.

---

## 5. Customers, Contracts & Demand

**Contract card:** Customer name/logo (fictional), required capacity (servers/U/kW), bandwidth, SLA tier (99%, 99.9%, 99.99%), monthly revenue, penalty per breach, duration, special requirements (e.g. "dedicated cage", "GPU", "no shared racks", "green power only").

**Customer archetypes (fun and mechanically distinct)**

| Customer | Behaviour |
|----------|-----------|
| *Grandma's Bakery Webshop* | Tiny, stable, forgiving. Tutorial customer. |
| *Pizza Rocket* (food delivery) | Huge spikes at 12:00 and 19:00. |
| *ByteBank* (fintech) | Strict 99.99% SLA, requires compliance audits, pays a lot. |
| *StreamFlix-like* (video) | Bandwidth-heavy, evening peaks. |
| *GameStudio launch* | Massive one-week spike at launch, then drops 70%. |
| *ViralAI startup* | Wants GPUs, grows ×2 every month… until it stops paying (risk). |
| *Gov Agency* | Physical security requirements, background-checked staff only. |
| *Crypto Bro* | Pays double. Max heat. Might vanish overnight. |

**Demand events:** Black Friday, sports final, a viral meme, an elections night, a competitor outage (clients flock to you if you have spare capacity), and holiday change freeze (no installs allowed).

---

## 6. Staff (Technicians)

### 6.1 Roles (unlocked progressively)

| Role | Does | Unlock |
|------|------|--------|
| **You (Manager avatar)** | Can do any basic task slowly. Tutorial only, then becomes a "boost" ability. | Ch1 |
| **Hardware Technician** | Install/remove servers, swap disks/PSUs/RAM, racking, cabling | Ch1–Ch2 |
| **HVAC Technician** | CRAC maintenance, filters, coolant, leaks | Ch3 |
| **Electrician** | PDU, UPS batteries, generator tests, breaker resets | Ch4 |
| **Network Engineer** | Switches, fiber, uplinks, cabling audits, DDoS mitigation | Ch3–Ch4 |
| **Security Guard** | Patrols, visitor escort, intrusion response | Ch4 |
| **SOC / SecOps Analyst** | Patching, incident response, threat hunting (works from NOC, no walking) | Ch5 |
| **Site Reliability Engineer** | Writes automation/runbooks. Reduces manual task frequency. | Ch5 |
| **Shift Lead** | Auto-dispatches a team per your rules | Ch4 |
| **The Intern** | Cheap, slow, random comic mishaps, can become a star | Event |

### 6.2 Technician stats
- **Skill** per domain (1–5 stars): affects speed and the chance of a botched job.
- **Speed** (walking) and **Stamina/Fatigue:** tired techs make mistakes. They need breaks in the staff room.
- **Morale:** affected by overtime, alarms per hour, coffee machine quality, salary vs market.
- **Salary** plus **Shift** (day/night/weekend). Night shift costs extra.
- **Traits** (1–2 random, to give staff personality):
  - *Cable Artist* (cable tasks +30% speed, rack airflow bonus)
  - *Coffee-Powered* (fast, but morale drops without a good coffee machine)
  - *Clumsy* (5% chance to unplug a neighbour cable)
  - *Night Owl* (no penalty on night shift)
  - *Paranoid* (spots phishing, +security)
  - *Old Timer* (slow, but never botches legacy hardware)
  - *Social Butterfly* (boosts team morale)
- **Progression:** XP from tasks → level-up → perk choice. Training courses (cost money and time off the floor) unlock certifications such as "Electrical safety" and "Liquid cooling".

### 6.3 Tech behaviour
Techs path-find on the floor map. A job is a chain of steps: **walk to storage → pick up part → walk to rack → work (progress bar) → test → return the old part / e-waste.** Steps are visible, so the player understands *why* a job takes time. That makes layout matter: put the storage room near the server zones.

---

## 7. Task Catalogue

| Category | Task | Role | Typical duration* | Needs | Trigger |
|----------|------|------|------|-------|---------|
| **Provision** | Install server | HW | 30 min | Server in stock, free U, power budget | Contract / player |
| | Decommission server (wipe + remove) | HW | 15 min | — (data wipe! skipping = data leak risk) | Contract end / EOL |
| | Install rack | HW ×2 | 1 h | Rack in stock, floor tile, power drop | Expansion |
| | Remove rack | HW ×2 | 45 min | Empty rack | Re-layout |
| | Cable/patch server | HW / Net | 5 min | Cables | After install |
| **Repair** | Swap disk | HW | 5 min | Disk | Disk alarm (RAID degraded: a 2nd failure means data loss!) |
| | Replace PSU | HW | 8 min | PSU | PSU alarm |
| | Replace fan / RAM / NIC | HW | 5–10 min | Part | Alarm |
| | Reboot hung server ("have you tried…") | HW / remote | 1 min | — | Alarm (cheap fix, may not stick) |
| | Breaker reset | Elec | 3 min | — | Overload trip |
| | Fix water leak | HVAC | 20 min | Seal kit | Leak sensor |
| | Fiber repair | Net | 30 min | Fiber kit | Link down |
| **Maintain** | Firmware update | HW / remote | 10 min | Maintenance window (brief downtime unless redundant) | Vulnerability / age |
| | CRAC filter change | HVAC | 10 min | Filter | Efficiency dropping |
| | Coolant refill | HVAC | 15 min | Coolant | Low coolant |
| | Generator load test | Elec | 30 min | Diesel | Monthly |
| | UPS battery replacement | Elec | 40 min | Battery pack | Battery health < 60% |
| | Dust cleaning | HW / Janitor | 20 min | — | Dust level |
| | Cable audit / tidy | Net | 1 h | — | Spaghetti score (affects airflow and mistake rate) |
| **Security** | Patch servers | SOC | Remote | — | CVE published |
| | Respond to intrusion | SOC (+Guard) | Varies | — | IDS alert |
| | Escort visitor / auditor | Guard | Duration of visit | — | Visit event |
| | Phishing training | All | 1 h off-floor | — | Policy |
| **Logistics** | Receive delivery | Any | 10 min | Dock free | Order arrives |
| | E-waste disposal | HW | 15 min | — | Storage clutter |

\*In-game time. At 1×, 3 game minutes = 1 real second (see §3.1). The durations in this table are rough. §3.1 holds the reference buckets (quick / standard / long / heavy), and the balancing pass will align every task to them.

**Smart remote tasks:** Some tasks (reboot, firmware, patch) can be done remotely once you have **Out-of-Band management (research unlock)**, so nobody has to walk there.

---

## 8. Alarms & Incidents

### 8.1 Alarm design
- **Severity:** 🟦 Info · 🟨 Warning · 🟧 Major · 🟥 Critical. Each has a **distinct shape icon and sound**, not just a colour (colour-blind safe).
- **Alarm feed** (sorted by severity × time-to-impact), plus **pins on the map**. On mobile it's a swipe-up bottom sheet.
- **Countdown ring** on each alarm showing time until it escalates (Warning → Major → outage).
- **Root-cause grouping:** "Rack B4 overheating" groups 12 server temperature alarms into one. This grouping is unlocked with a DCIM upgrade, so early game teaches *alarm fatigue* by feel, and the upgrade then feels great.
- **False positives** come from a cheap sensor tier. Upgrading sensors reduces them.
- **Acknowledge / Snooze / Dispatch / Auto-rule** actions.

### 8.2 Incident list

| Incident | Cause / chain | Counter-play |
|----------|---------------|--------------|
| Disk failure | Age, heat | Spares in stock, RAID, quick swap |
| Hot spot | Dense rack, poor airflow, blanking panels missing | Re-balance, blanking panels, containment |
| CRAC failure | Neglected maintenance | N+1 cooling, HVAC tech |
| Utility power outage | Storm / random | UPS bridges to generator. Generator must start (test it!) |
| Generator fails to start | Skipped tests, no diesel | Monthly tests, fuel contract |
| Breaker trip | Rack over kW | Power planning |
| Water leak | Old pipes, liquid cooling | Leak sensors, raised floor |
| Fire | Rare, battery/electrical | Suppression system (gas). Evacuate techs! |
| Fiber cut ("backhoe event") | Construction outside | Dual uplinks via different paths |
| Heatwave | Seasonal / climate | Extra cooling, load shedding |
| Rodent in cable tray | Random, funny | Pest control contract |
| "Someone unplugged the wrong cable" | Clumsy tech / fatigue / spaghetti cabling | Labelling, cable audits, rested staff |
| Cosmic-ray bit flip | Ultra-rare joke | ECC RAM research 😄 |
| Supply chain delay | Vendor | Keep stock, second vendor |
| Surprise audit | Compliance customer | Documentation, clean floor, logs |

---

## 9. Cybersecurity System

**Tone: fun first.** Abstract, readable and humorous. Not a hacking simulator, and no real security jargon needed to play. Think "Saturday-morning cartoon villains" attacking your servers.

**Fun rules for the cyber layer**
- **Cartoon villains.** Recurring fictional hacker crews, each with a personality and taunting messages that pop up on the NOC screen:
  - *The Script Kiddies*: frequent, weak, noisy attacks (tutorial for cyber).
  - *Captain Phish*: goes after your technicians with ever sillier fake emails ("Your coffee machine license has expired, click here").
  - *Lord DDoSius*: arrives with fanfare during big demand events.
  - *The Ransom Raccoons*: rare and dangerous, and they leave a raccoon emoji on infected servers.
- **Visible, physical, quick.** Every attack shows on the map: servers glow purple, a hooded icon walks the network cables, the bandwidth pipe bulges. It is always resolved by a tap or a technician, never by reading logs.
- **10-second micro-games** (optional, with auto-resolve at lower efficiency):
  - *Cut the Spread*: tap network segments to isolate a ransomware infection before it spreads.
  - *Phish or Legit?*: swipe left or right on 3 emails a technician received.
  - *Block the Flood*: tap the attacking traffic streams to block them during a DDoS.
- **Rewards, not only punishment.** Beating a crew drops loot such as Engineering Points, a "Hacker trophy" in the NOC, or a temporary security boost. Catching a villain chain gives an achievement.
- **Can be turned off** in Custom difficulty for players who want a calm building game.

Systems underneath (kept simple):

- **Threat Level** meter rises with company size, reputation, high-profile customers and world events.
- **Attack surface** = unpatched servers + open services + staff phishing susceptibility.
- **Defence stack** (research/purchase): Firewall → IDS → patch automation → MFA → SOC team → honeypot → DDoS scrubbing contract → zero-trust.

| Attack | What player sees | Effect if ignored | Response |
|--------|------------------|-------------------|----------|
| **Port scan** | Info alert | Raises next attack's success chance | Ignore / harden |
| **DDoS** | Bandwidth gauge red, customer X latency up | SLA breach | Rate-limit, scrubbing, add uplink |
| **Phishing** | A tech's portrait flashes ⚠ | Credentials stolen → enables intrusion | Training, MFA, lock account |
| **Ransomware** | Servers turn purple one by one (spreads through network segment) | Data loss, huge penalty | Isolate segment (quick tap), restore from backup (if you bought backup!) |
| **Crypto-jacking** | Mystery heat/load increase on a rack | Electricity bill, heat | SOC investigation |
| **Insider threat** | Badge used at 3 AM | Theft of hardware / data | Cameras, guards, access policy |
| **Zero-day** | Big news event, all servers on version X vulnerable | Mass intrusion | Patch race: prioritise critical customers |

The micro-games listed above are all mobile-friendly and take 10 seconds or less. Each is skippable and auto-resolved by the SOC analyst at lower efficiency.

---

## 10. Economy

- **Income:** contract monthly fees, one-off setup fees, demand-response payments (the grid pays you to cut power at peak, as a risk/reward choice), selling old hardware.
- **Costs:** electricity (scales with PUE and site price), salaries, parts, rent/land, insurance, SLA penalties, loans' interest.
- **Capex vs Opex choices:** buy vs lease servers, cheap vs premium parts (MTBF), refurbished components.
- **Reputation** (0–5 stars): earned by uptime, lost by breaches and outages. It gates contract quality.
- **Secondary scores:** Green score (PUE, renewables), Team happiness, Security posture.
- **Research / Upgrades tree** (paid with money + "Engineering Points" earned from resolved incidents):
  - *Monitoring:* basic sensors → DCIM → root-cause grouping → predictive failure (shows "likely to fail in 2 days")
  - *Cooling:* blanking panels → hot/cold containment → in-row → free-air cooling → liquid → immersion
  - *Power:* UPS → generator → 2N → battery storage → on-site solar
  - *Ops:* labelled cables → OOB management → runbooks → auto-dispatch rules → robots (late-game disk-swap robot)
  - *Security:* see §9
  - *Staff:* coffee machine tiers 😄, staff room, training center, on-call bonus

---

## 11. Progressive Disclosure: Chapters on One Floor

**Single floor.** The whole game takes place on **one floor**. Growth means unlocking more floor area: knock down walls, take over the neighbouring office, reclaim the parking area for the generator yard. The map grows from a 6×6 closet to about a 60×40 floor. *Multiple floors and buildings are parked for a later game or sequel (see §20).*

The campaign is a sequence of **chapters**. Each chapter teaches with **Introduce → Practise → Twist**: a safe tutorial moment, then a normal task, then a complication that combines the new mechanic with older ones. Every chapter can be played on any **difficulty level** (§12).

| Ch | Name | Floor area unlocked | New mechanics introduced | Twist / Final challenge | Win condition (example) |
|----|------|---------------------|--------------------------|-------------------------|-------------------------|
| 0 | **Tutorial: "The Closet"** | Broom closet, 1 rack | Tap device, inspect, *you* swap a disk, install a server | The office AC is switched off on Friday evening | Survive a weekend |
| 1 | **Server Room** | Old meeting room, 4 racks | Hire 1st HW tech, dispatch, parts inventory, orders and delivery, money | Two disks fail at once. One tech → prioritise | 99% uptime, 10 servers |
| 2 | **Startup Colo** | Half the office, 10 racks | Contracts and SLAs, demand curves, power budget per rack, breaker trips, basic cooling (zone temp) | Pizza Rocket lunch spike + hot day | Earn $X, keep 3 clients |
| 3 | **Colocation Floor** | Whole office cleared, 40 racks | Hot/cold aisle layout, CRAC units, HVAC tech, network (ToR, uplinks), Net engineer, technician fatigue and morale | Fiber cut during the GameStudio launch | Hit 99.9% SLA for 7 days |
| 4 | **Enterprise DC** | + power room & generator yard (ex-parking) | UPS / generator / redundancy (N+1), electrician, shifts (day/night), Shift Lead + simple auto-dispatch rules, physical security and guards | Storm: utility outage + generator not tested | Survive outage with zero SLA breach |
| 5 | **Cloud Region** | + neighbouring company's space, ~120 racks | Cyberattacks full system, SOC, patching, SRE + runbooks, research tree fully open, DCIM alarm grouping | Zero-day + DDoS on Black Friday | Reputation 4★ |
| 6 | **AI Wing** | Full floor, GPU zone | GPU racks (40–100 kW), liquid cooling, leaks, grid demand response, green score, robots | Heatwave + ViralAI ×3 demand + power cap from grid | PUE < 1.3 with 99.99% |
| ∞ | **Sandbox / Endless** | Full floor, pick a city/climate | Everything | Escalating director | High score |

**Chapter disclosure rules**
- The UI shows **only unlocked panels** (e.g., no "Power" tab until Ch2). New tabs pulse once with a 1-line tooltip.
- **Contextual "first time" tips** trigger on first occurrence (first overheating: "Racks hate heat. Every +10 °C doubles failure risk.") and can be replayed in the **Handbook**.
- **Mentor character** ("Sam, the retiring old-school sysadmin") delivers tips in short, funny lines, not walls of text. Skippable.
- After Ch1, players can **skip the campaign** to sandbox, with all tutorials available in the Handbook.

**Learning curve target**
```
Complexity
  ▲                                          ┌──── Ch6 (automation absorbs complexity)
  │                                ┌─────────┘
  │                      ┌─────────┘ Ch5
  │             ┌────────┘ Ch4
  │      ┌──────┘ Ch3
  │  ┌───┘ Ch2
  │──┘ Ch0-Ch1
  └──────────────────────────────────────────────► Time
Player *workload* (taps/minute) should stay roughly flat: new complexity
is balanced by new automation (auto-dispatch, runbooks, DCIM, robots).
```

---

## 12. Difficulty Levels & Pacing

Difficulty works on two axes that can be combined:
1. **Difficulty level**: chosen when starting a chapter or a sandbox game. It sets how hard the world is.
2. **Chapter stars** (★ / ★★ / ★★★): optional extra objectives inside each chapter, for players who want mastery without changing the difficulty level.

### 12.1 Difficulty levels

| | 🎓 **Intern** | 🧑‍💻 **Sysadmin** (default) | 🛠️ **Senior Engineer** | 🔥 **On-Call Nightmare** | 💀 **Five Nines** |
|---|---|---|---|---|---|
| Unlocked | Always | Always | Always | After finishing Ch3 on any difficulty | After finishing the campaign on Nightmare |
| Starting cash | ×2 | ×1 | ×0.8 | ×0.6 | ×0.5 |
| Incident frequency | ×0.5 | ×1 | ×1.3 | ×1.7 | ×2 |
| Alarm escalation timers | ×2 (slower) | ×1 | ×0.8 | ×0.6 | ×0.5 |
| SLA penalties | ×0.5 | ×1 | ×1.25 | ×1.5 | ×2, and any Critical outage costs a contract |
| Parts delivery time | Instant | Normal | ×1.5 | ×2, with occasional wrong parts | ×2, with occasional wrong parts |
| Technician mistakes (botched jobs) | Off | Low | Normal | High | High |
| Cyber villains | Script Kiddies only | All, slow escalation | All | All, and they adapt to your defences | All, combined attacks |
| Incident director | Gentle; never stacks Criticals | Balanced | Balanced | Aggressive peaks | Aggressive peaks, no relief guarantee |
| Auto-pause on Critical | Forced ON | ON by default (mobile) | Optional | Optional | Disabled |
| Hints / "suggested tech" | Always shown | Shown | Shown | Off by default | Off |
| Score multiplier | ×0.5 | ×1 | ×1.5 | ×2 | ×3 |

- **⚙️ Custom:** every row above is a slider, plus a "cyber on/off" toggle for a calm building game. Custom games don't count towards achievements that require a set difficulty level.
- The difficulty level can be **lowered** mid-game (never raised). This is shown on the end-of-chapter report, with no shaming.
- All multipliers live in one `difficulty.json` data file so they're easy to tune.

### 12.2 Chapter stars (in-chapter difficulty)
- ★ **Pass:** the chapter's main win condition.
- ★★ **Pro:** a tighter goal, e.g. "no SLA breach" or "finish with ≥ $X".
- ★★★ **Legend:** a constraint challenge, e.g. "max 2 technicians", "never pause", or "PUE < 1.5".
- Stars unlock cosmetics (technician outfits, rack LED colours, NOC trophies), never power.

### 12.3 Pacing tools

**Incident Director** (dynamic pacing, inspired by "AI director" systems): tracks player stress (open alarms, cash trend, recent outages) and alternates **calm → build-up → peak → relief** phases. Its intensity is set by the difficulty level (table above).

**Time controls:** Pause / 1× / 2× / 4×. Optional **auto-pause on Critical**. Keyboard: `Space` pause, `1-3` speed.

**Assist features:** "Suggested tech" highlight on dispatch (nearest and qualified), "Why did this happen?" explainer on every incident post-mortem (reinforces learning).

---

## 13. Automation Layer (key to late-game fun)

1. **Manual dispatch** (Ch1): tap alarm → tap tech.
2. **Suggested dispatch** (Ch2): one-tap "Send best".
3. **Auto-dispatch rules** (Ch4, Shift Lead): simple IF/THEN cards, e.g. `IF Disk alarm AND severity ≥ Warning → nearest HW tech`.
4. **Runbooks** (Ch5, SRE): sequences, e.g. `On CVE: patch Tier-3 customers first, then rolling patch others at night`.
5. **Predictive maintenance** (Ch5): DCIM schedules jobs before failures.
6. **Robots** (Ch6): disk-swap robots, but they need maintenance too.

The rules UI must be **card-based and touch-friendly**, not a code editor.

---

## 14. UX / UI

### 14.1 Main screens
- **Floor Map** (main): **top-down** tile grid. Racks are drawn as rectangles with a small front face and LED strip, and techs as round top-down characters. Pinch to zoom, drag to pan. Racks show a status LED colour plus a heat overlay toggle.
- **Rack View** (zoom into rack): front elevation with U-slots, devices, blinking LEDs, power/temperature bars. Drag a server from inventory into a slot (desktop), or tap a slot then tap the server (mobile).
- **Alarm Feed:** right sidebar on desktop, bottom sheet on mobile.
- **Team panel:** portraits, status (idle / walking / working / tired), current task, queue.
- **Contracts / Finance / Research / Handbook:** modal panels.
- **Overlays:** Heat, Power load, Network, Security, Staff paths (one at a time; toggle chips).

### 14.2 Layouts
```
DESKTOP (landscape)                         MOBILE (portrait)
┌────────────────────────────────────┐      ┌──────────────────┐
│ $ 12,400  ★★★☆  Uptime 99.92%  ⏸1×2×│      │ $12.4k ★3 99.9% ⏸│
├──────┬─────────────────────┬───────┤      ├──────────────────┤
│ Team │                     │Alarms │      │                  │
│ list │     FLOOR MAP       │ feed  │      │    FLOOR MAP     │
│      │                     │       │      │  (pinch/zoom)    │
│      │                     │       │      │                  │
├──────┴─────────────────────┴───────┤      ├──────────────────┤
│ [Build] [Hire] [Contracts] [Research]│     │ 🔔3  ▲ swipe up  │
└────────────────────────────────────┘      ├──────────────────┤
                                            │🏗 👷 📄 🔬 ☰      │
                                            └──────────────────┘
```
- Touch targets ≥ 44 px. Thumb zone for primary actions (bottom).
- **Dispatch in 2 taps** on mobile: tap alarm → tap "Send Alex (nearest, ★★★)". Long-press for other techs.
- Haptic feedback (Vibration API) on critical alarm (optional, off by default).

### 14.3 Accessibility
Colour-blind palette plus shapes, scalable UI text, reduced-motion option, all sounds have visual equivalents, full keyboard play on desktop.

---

## 15. Art & Audio Direction

- **Art:** Clean, flat/pixel-lite style with readable silhouettes. Racks with blinking LEDs ("blinkenlights"), techs as small expressive characters (sweat drops when tired, coffee cup when on break). Heat overlay as a soft red/blue gradient.
- **Audio:** Ambient server hum that grows with the size of the DC, distinct alarm tones per severity, satisfying "click-clunk" for racking a server, and a jingle when a contract is signed. Generated with WebAudio to keep downloads small.
- **Tone:** Light humour in item descriptions and event texts ("Ticket #4521: 'The internet is down.' It was not.").

---

## 16. Meta & Retention

- **Achievements:** "Five Nines", "It Was DNS", "Cable Whisperer" (zero spaghetti), "Survived the Backhoe", "Green Giant" (PUE < 1.15).
- **Daily Challenge:** seeded scenario, same for everyone (e.g., "Survive a ransomware outbreak with 2 techs"). Local best score. Online leaderboard later.
- **Scenario editor** (post-launch): share scenarios as JSON/URL.
- **End-of-day report:** a newspaper/tabloid-style summary ("Local DC survives storm! Uptime 99.98%"), shareable as an image.
- **No idle/offline progress** in MVP (keeps the simulation honest). The game pauses when the tab is hidden.

---

## 17. Technical Architecture (proposal)

```
/src
  core/        game loop (fixed timestep sim @ 10 ticks/s game-time), seeded RNG, event bus
  sim/         entities (ECS-lite): devices, racks, zones, techs, contracts; systems: power, thermal,
               failure, demand, network, security, economy, director, pathfinding (A* on tile grid), jobs
  data/        JSON content: devices, parts, incidents, customers, chapters, difficulty, traits, research tree, strings
  render/      canvas map renderer, sprites, overlays, camera (pan/zoom)
  ui/          DOM panels (vanilla components or Preact), responsive CSS, input abstraction (mouse/touch)
  save/        serialize/deserialize, versioned save migrations
  audio/       WebAudio synth sfx
```
- **Sim/render separation** keeps the simulation headless-testable (unit tests with Vitest), and makes fast-forward and auto-balance scripts possible.
- **Data-driven content** so designers can add incidents and customers without code.
- **Build:** Vite. Deploy: GitHub Pages. No external runtime dependencies beyond an optional small renderer.
- **Telemetry (opt-in, later):** chapter completion per difficulty level, failure causes, to tune difficulty.

---

## 18. Scope & Milestones

**Status (build v0.3):** MVP plus Chapter 3 and On-Call Nightmare shipped and deployed. The roadmap below has been **revised by the v0.2 review**. The original milestone lists are kept underneath for reference.

| Release | Theme | Contents | Exit criteria |
|---|---|---|---|
| **v0.4 "First Hour"** ✅ shipped | Onboarding and pacing | Shifts and report cards, one-shift Ch0, live money, goal chip, ops projects, walk-in requests, **e-ink mode** | Bot-measured: Ch0 4.7 sim-min (≈6–7 with tips); quiet daytime 58–65% (was 80–89%); longest quiet 53–112 s (was 4–5 min). Human playtest still to do. |
| **v0.5 "Mastery"** ✅ shipped | Replay reasons | Hard ★★★ constraints, 14 achievements, career title, seeded Daily Challenge (4 modifiers) with share line, outage post-mortems with one-tap remedies; **mobile responsiveness fixes** | Default bot ★★★ rate 6% (1/16 runs); guarded in CI at ≤ 20% |
| **v0.6 "Launch Week"** ✅ shipped | Re-sequence and automation | Ch3/Ch4 split, Shift Lead auto-dispatch from Ch2, proactive specialists, juice pass (speech bubbles, SLA streak, confetti, screen shake), contract names, new artwork | ≤ 2 new systems per chapter ✓ (tested); with a Shift Lead the bot's workload is 1.18 / 1.66 / 1.31 actions/min in Ch2 / Ch3 / Ch4 (≈ 4.5 by hand) ✓ |
| **v0.7 "Hackers"** ✅ shipped | Differentiator | Hacker Weekend event (2 villains, 3 micro-games), sandbox/endless mode | Event playable in ≤ 10 min ✓ (tested); micro-games pass phone touch tests (controls ≥ 44 px) ✓ |
| **v1.0** | Enterprise and polish | UPS/generator/shifts chapter (fatigue moves here), accessibility audit, FR localisation | §19 KPIs met in a 20-player test |

### MVP (vertical slice): Chapters 0–2 (shipped)
- Floor map, rack view, 1–3 HW techs, dispatch, pathfinding, inventory and deliveries
- Devices: 1U/2U servers. Failures: disk, PSU, overheating. Basic zone temp and power budget
- Contracts with SLA and demand curves, economy, reputation
- Alarm feed with severity, countdown and auto-pause
- Difficulty levels Intern / Sysadmin / Senior Engineer, plus chapter stars
- Tutorial (mentor tips), save/load, mobile + desktop layouts, PWA

### v1.0: Chapters 3–5
- Aisles and CRACs, network, HVAC/Electrician/Net/Guard/SOC roles, fatigue and morale, traits, shifts
- UPS/generator/redundancy, cyberattacks, research tree, auto-dispatch rules, DCIM, achievements, daily challenge

### v1.x: Chapter 6 and beyond
- GPU/liquid cooling, sites and climates, robots, runbooks, sandbox sliders, scenario editor, leaderboards

---

## 19. Success Metrics

| Metric | Target |
|--------|--------|
| Tutorial completion | > 80% |
| Ch2 completion | > 50% of starters |
| Median session length (mobile) | ≥ 8 min |
| D1 / D7 return (PWA installs) | 35% / 15% |
| "Unfair" deaths: failures with no prior warning | ~0 (every outage traceable to an ignored signal) |
| Performance | 60 fps at 200 racks on mid-range phone |
| Shift length (1×, Sysadmin) | 6–9 real minutes |
| Quiet daytime (no alarm, no job) | ≤ 50% of daytime game minutes, no stretch > 90 real seconds |
| ★ / ★★ / ★★★ rates | ≈ 80% / 40% / 10% of players per chapter |
| New systems per chapter | ≤ 2 |

*The engagement rows are also checked by the autopilot bot in CI (see §21.10), so design regressions fail the build.*

---

## 20. Open Questions & Risks

1. ~~Map perspective~~ **Decided:** top-down.
2. ~~Time scale~~ **Decided:** 1 s = 3 game min at 1× (§3.1). Validate in playtest that standard jobs (5 s) don't feel too fast to follow.
3. ~~Multi-floor buildings~~ **Decided:** single floor for this game. *Parked for later / a sequel:* multiple floors as tabs, with elevator travel time for techs, then multiple buildings and sites.
4. ~~Cyber layer depth~~ **Decided:** fun and arcade-like with cartoon villains (§9), always tied to physical consequences on the map.
5. **Mobile density:** At 200+ racks the map gets busy. Need aggressive LOD (rows collapse into blocks when zoomed out) and alarm grouping.
6. **Micro-management fatigue:** Mitigated by the automation layer (§13). Needs playtesting at Ch4–Ch5.
7. ~~Monetisation~~ **Decided:** free, with no ads and no purchases.
8. **Branding:** All customers, vendors and products fictional. No real company names or logos.

---

## 21. v0.2 Changes from the Product Review

Measured on build v0.3 with the autopilot bot (Sysadmin, 3 seeds, 1× with night skip):

| Chapter | Real minutes | Incidents / day | Quiet daytime | Longest quiet | New systems |
|---|---:|---:|---:|---:|---:|
| 0 | 23.7 | 1.2 | n/a¹ | 2.8 min | 1 |
| 1 | 18.2 | 3.7 | 88% | 3.7 min | 2 |
| 2 | 31.8 | 3.6 | 89% | 4.9 min | 3 |
| 3 | 32.1 | 7.2 | 80% | 4.5 min | **5** |

¹ The weekend overheat alarm stays open, so Ch0 never counts as quiet.

The main issues are dead air, chapters too long for a session, a thin tutorial, invisible money, the Ch3 overload, free ★★★, and no meta progression. The requirements below address them.

### 21.1 Shifts (session unit), *proposed*
- A chapter is split into **Shifts** of one game day (06:00–22:00 by default), each with one **shift goal** (e.g. "ByteBank ≥ 99.5% today", "Install 3 servers before 18:00").
- At 22:00 an **end-of-shift report card** appears: shift stars, P&L, highlights, and "the incident of the day". Then the game autosaves. This is the natural place to stop.
- **Nights** become a "Sleep" fast-forward, followed by a recap of what happened ("Mia swapped a disk at 02:14; the ISP fixed the fiber").
- **Target:** 6–9 real minutes per shift.

### 21.2 Tutorial rebuilt (Ch0)
- Ch0 runs Friday 09:00 to 22:00 only, which is one shift, about 8 minutes.
- A scripted beat every 60–90 seconds: disk failure, new contract, install a server, power warning, the AC turns off, then a choice (portable AC or power servers off).
- The weekend becomes an optional **bonus shift** in Ch1.

### 21.3 Live money and goal visibility
- Revenue and costs accrue every game hour. Floating "+$" over paying racks and "−$" on missed SLA minutes. The midnight report stays as the daily summary.
- Each contract card shows its **margin**: revenue minus server power minus its share of rent.
- The HUD gets a **goal chip** (the current ★ objective with live progress) and a **projection** ("On track: $6.2k / $5k ✓").

### 21.4 Calm-time activities (fixing dead air)
- **Ops projects:** optional 1–3 minute jobs that pay back later. Cable tidy (fewer wrong-cable mistakes), labelling (faster repairs), firmware campaign (fewer hangs), preventive filter changes.
- **Walk-in requests:** timed customer favours for small rewards ("Reboot ByteBank's box within 20 min: +$300").
- **Contract negotiation:** when an offer arrives, choose one of 3 cards trading price, SLA and duration.

### 21.5 Chapter re-sequencing (respect pillar #4), shipped in v0.6

| # | Chapter | New systems |
|---|---|---|
| 0 | The Closet | Inspect, dispatch, install (tutorial) |
| 1 | Server Room | Hiring, contracts (with customer requests) |
| 2 | Startup Colo | Power budgets, building racks/coolers; **Shift Lead / auto-dispatch** (part of the team system) |
| 3 | Colocation Floor | Hot/cold aisles, CRAC filter maintenance and the HVAC specialist |
| 4 | **Launch Week** | Switches, uplinks, bandwidth and fiber cuts (network engineer); **fatigue and morale** |
| 5 | Enterprise DC *(planned)* | UPS/generator/redundancy, electrician, day/night shifts |
| 6 | Cloud Region *(planned)* | Cyber villains, SOC, runbooks |
| 7 | AI Wing *(planned)* | GPU racks, liquid cooling, demand response |

- **Deviation from the v0.2 plan:** fatigue and morale ship in Launch Week (a crunch week is when tired staff matter) instead of waiting for the Enterprise chapter, which is not built yet. The Enterprise chapter keeps day/night shift rotation.
- A test counts the systems each chapter introduces (feature flags mapped to systems) and fails above two, or if a chapter drops one.
- Tips fire at **teaching moments** (the first time a system matters), never as a timed burst.

### 21.6 Automation earlier
- In **Ch2**, a single toggle, *"Auto-send the best tech to hardware alarms"*, which requires hiring a Shift Lead (salary). Rule cards arrive in Ch4 and runbooks in Ch6.
- **Idle specialists do proactive work:** HVAC techs run preventive maintenance and network engineers run cable audits. Badges show the value ("prevented 2 incidents today").

### 21.7 Mastery and meta progression
- **★★★ becomes a constraint challenge** the default bot does not meet (e.g. "≤ 2 techs", "never pause", "no server above 30°C", "PUE < 1.5").
- **Career title** from total stars: Intern → Sysadmin → Architect → CTO.
- **Achievements** (PRD §16 list) and **cosmetics only**: technician outfits, rack LEDs, NOC pets.
- **Daily Challenge:** a date-seeded single-shift scenario that is the same for everyone. It needs no backend, thanks to the deterministic simulation. Results come as an emoji share line, e.g. "DataCenterMania #42 ★★☆ 99.93% 🔥🔥".
- **Sandbox / Endless** unlocks after Ch2.

### 21.8 Learning from failure
- **Incident post-mortem card** after any outage longer than 10 game minutes: a what / why / prevent timeline, with a one-tap remedy where possible ("Order 2 spare disks").

### 21.9 Juice
- Money pops, confetti for a clean shift, technician speech bubbles, a streak counter (SLA-perfect hours), and gentle screen shake on criticals (off with reduced motion).

### 21.10 Measurement
- **Opt-in anonymous telemetry**, export-as-JSON first: chapter and shift starts/completions, quits mid-shift, time to first dispatch. Plus an in-game "Send feedback" link.
- **5-player think-aloud playtests** per milestone, on desktop and phone.
- **CI engagement guardrails** using the bot: shift length, quiet-time ratio, longest quiet stretch, and ★★★ not reached by the default bot.

### 21.11 Early differentiator
- Ship the cyber villains (*Script Kiddies*, *Captain Phish*) first as a self-contained **Hacker Weekend** event with the 3 micro-games from §9, before the full Ch6 cyber layer.

---

### 21.12 v0.4 results and follow-ups
- **Quiet daytime is down to 58–65%**, not yet the 50% target. The CI guardrail is set at ≤ 70% for now. Next lever: contract negotiation cards (§21.4), plus proactive specialists (§21.6).
- **Economy:** walk-in rewards and shift bonuses scale with difficulty, and so do profit goals (Ch2 $12k, Ch3 $10k × the difficulty's starting-cash factor).
- **Bot results by difficulty:** Sysadmin wins every seed, Senior about 2 of 3, Nightmare about 2 of 3 with thin margins. Human playtests are needed, because the bot reacts within 5 game minutes and completes every walk-in.
- **Ch0 ★★★** ("keep every rack below 35°C") needs a deliberate action (power off idle servers or bring in a portable AC). The passive bot does not get it.

---

### 21.13 Mobile responsiveness (fixed alongside v0.5)
Player report: "UI not very responsive on mobile". The probe (`e2e/perf-probe.mjs`, Pixel 5 emulation with the CPU throttled 4×) found:
- **Lost taps:** live panels replaced their DOM up to 4×/s, and only 2/10 held presses survived on the Network panel. Fixed with in-place DOM morphing plus a press guard: 10/10, and an e2e regression check.
- **Game looked frozen:** a mentor tip (which pauses the game) could sit under the open bottom sheet. Tips and toasts now stack above it, and the top bar shows "⏸ Tip".
- **Racks too small to tap:** about 13 px on a 360 px phone. Touch screens now start at ≥ 30 px tiles centred on the racks, and taps pick the nearest rack or cooler within about a tile.
- **Layout:** compact map controls on phones, a single overlay button, scrollable goal chips, fewer and shorter toasts, and a side-panel layout for landscape phones.
- Frame rate was already fine (60 fps, ~70 ms tap-to-feedback).

### 21.14 v0.5 notes
- ★★★ per chapter: Ch0 below 35°C; Ch1 lean team and a profit; Ch2 no rack above 28°C; Ch3 perfect airflow and zero critical alarms.
- Daily Challenge: chapter, modifier (Heatwave, Gremlins, Shoestring, Gone Viral) and seed derive from the local date. One shift, its own ★ goals, score = stars, then uptime, then profit. Best result per day is kept locally. Dailies do not count as chapter wins for achievements.
- Post-mortems trigger after ≥ 10 game minutes of SLA failure for a customer. The cause is inferred from a 60-entry alarm history. They show as a card on the Alarms tab and in the Goals → Incident history list.

---

### 21.15 v0.6 results
- **Workload.** `applyCommand` counts successful player actions (Shift Lead work is excluded). Measured by the bot: by hand ≈ 4.5 actions/min in every chapter; delegating to a Shift Lead gives 1.18 (Ch2), 1.66 (Ch3), 1.31 (Ch4). CI guards that delegation keeps Ch3 and Ch4 within 1.6× of Ch2, and that it cuts workload by more than half.
- **Shift Lead.** Hired from Chapter 2 for a daily salary; with auto-dispatch on, alarms wait 8 game minutes for the player, then the best specialist is sent (never the manager or the lead). Idle technicians also get open customer requests.
- **Proactive specialists.** Idle HVAC techs change wearing filters (needs a spare); idle network engineers run cable audits that cut switch/fiber risk by 60% for a day. A "problems prevented" badge appears in the Team tab and the shift report.
- **Juice.** Speech bubbles over technicians (deterministic lines, one per person), an SLA-perfect-hours streak chip and the Hot Streak achievement, confetti on a three-star shift, and screen shake on critical alarms. Confetti and shake are off for reduced motion and on e-ink.
- **3★ goals.** Ch3: fix the airflow within 10 hours and no critical alarm. Ch4: a second uplink route and zero critical alarms. The bot's ★★★ rate stays ≤ 20% (CI).
- **Performance.** Sprites are pre-rendered to bitmaps: re-drawing SVG-backed images each frame dropped a throttled phone to 53–58 fps; with bitmaps it is a steady 60 fps (p95 16.8 ms).
- **Known gap.** The planned "contract negotiation" cards (§21.4) and the 50% quiet-time target are still open; quiet daytime remains 52–65%.

---

### 21.16 v0.7 results

- **Hacker Weekend** (event, unlocked by Startup Colo): Script Kiddies and Captain Phish launch seven attacks over two shifts. Three 10-second micro-games, each a pure state machine: *Block the Flood* (tap bots, spare users), *Phish or Legit?* (three emails, feedback teaches), *Cut the Spread* (isolate machines before the worm jumps). Skipping any of them auto-defends at half strength, so nobody is forced to play. An ignored attack lands at full force.
- **Damage**: a flood multiplies traffic for 75 min; phished technicians are locked out for 2 h and a bad phish brings the worm; infected racks go down until cleaned and re-imaged. Spotting every email pays a $400 bug bounty.
- **Guardrails**: event ≤ 10 min for the bot; the auto-defend bot wins but never earns 3★; perfect play does. Micro-game controls are ≥ 44 px (phone e2e). Attacks never trigger the generic auto-pause.
- **Sandbox / Endless** (unlocked by Startup Colo): choose floor (small / colo / big hall), starting cash ×0.5/1/2, incident rate ×0.5/1/2, random hackers on/off and a daily +8% ramp-up. No end date: the game ends on bankruptcy or zero reputation. Score = days × 1000 + peak cash / 20 + attacks blocked × 100; the high score is stored per browser.
- **Fix**: the app height is now measured in JS (`--app-h`) so the bottom tab bar stays on screen in phone browsers without `dvh` support.

## Appendix A: Example "first 5 minutes"

1. Sam the mentor: *"Welcome to the closet. That humming box is our whole company's IT. Don't let it die."*
2. A disk LED blinks amber. **Tap the rack**, the rack view opens, and you **tap the disk** and see "Disk 2 failing, RAID degraded."
3. **Tap "Replace"**. Your manager avatar walks to the shelf, grabs a spare, and swaps it (progress bar). +XP, alarm cleared. Tip: *"RAID gives you a second chance. Not a third."*
4. Bakery Webshop asks for 1 more server. Tap the contract, **order a server** (delivery in 30 s), then **drag/tap it into U12**.
5. Power bar turns yellow: *"Each rack has a power budget. Go over and the breaker trips."*
6. Friday 18:00 event: *"Facilities turned off the office AC for the weekend."* The temp gauge rises. You learn to **cut load**, **open the door** (free cooling, but a security risk later!), or **buy a portable AC**.
7. Survive until Monday, win Chapter 0. The reward unlocks **Hire Technician**.

## Appendix B: Brainstorm parking lot (ideas to evaluate)
- Coffee machine as a meaningful morale upgrade tree (drip → espresso → barista robot)
- Office cat that wanders into the DC. Petting boosts morale, and it occasionally sits on a keyboard
- "Read-only Friday" policy toggle: fewer incidents caused by changes, but slower installs
- Customer support tickets as flavour text that hint at hidden problems
- Visitor tours (school groups) for reputation, which need escorts
- Weather forecast panel to prepare for heatwaves and storms
- Second-hand hardware market with hidden defects (gamble)
- Post-mortem screen after big outages: timeline of what happened (great teaching moment)
- Co-op "on-call handover" via shared save JSON (async multiplayer lite)
