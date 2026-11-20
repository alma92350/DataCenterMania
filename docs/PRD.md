# DataCenterMania — Product Requirements Document (brainstorm draft v0.1)

> A management/sim game for the browser (desktop and mobile) where you run a data center: you start in a server closet and end up running a hyperscale AI campus. You keep machines alive, keep customers happy, and keep the attackers out, mostly by sending the right technician to the right rack at the right moment.

---

## 1. Vision & Pillars

**Elevator pitch:** *Theme Hospital meets on-call duty.* You are the data center manager. Alarms go off, demand spikes, a disk fails, the cooling unit coughs, someone tries ransomware on you. You don't fix things yourself for long. You hire, dispatch, train and automate a team of technicians, and you grow from 1 rack to thousands.

**Design pillars**

| # | Pillar | What it means in practice |
|---|--------|---------------------------|
| 1 | **Readable chaos** | Many things happen at once, but you can always see *what's wrong, where, and how urgent* in under 2 seconds. |
| 2 | **Dispatch is the core verb** | Most interactions are *select problem → pick technician → confirm*. It must be fast on a touchscreen. |
| 3 | **Systems that interact** | Power, heat, network, load and security are all connected. Overloading a rack heats it, heat raises the failure rate, a failure trips the SLA, and the SLA hits revenue. |
| 4 | **Learn by layering** | Each level adds 1–2 new systems. No system is shown before the player needs it. |
| 5 | **Micro → Macro** | Early game: you click on every disk swap. Late game: you design runbooks and automation, and only step in on the hard incidents. |
| 6 | **Funny, never cynical** | IT humour (the intern, "it's always DNS", Friday deploys), with mechanics that are actually grounded in how data centers work. |

**Target audience:** Casual-to-midcore management sim players (Two Point / Game Dev Tycoon / Mini Metro crowd), IT workers who'll enjoy the in-jokes, and students who'll learn real DC concepts (PUE, hot/cold aisle, N+1, RAID).

**Session shape:** 5–15 min on mobile (one "shift" or one level), 30–90 min on desktop. Can be paused at any time.

**Business model: free.** No ads, no in-app purchases, no energy timers, no accounts. The game is static and runs entirely in the browser.

### 1.1 Decisions log
| Topic | Decision |
|-------|----------|
| Map view | **Top-down** 2D tile grid. Racks get a light faux-3D front face for readability. |
| Game speed | **1 real second = 3 game minutes at 1×.** One game day ≈ 8 real minutes, which is one mobile session. See §3.1. |
| Cyber layer | **Fun and arcade-like, not a security simulator.** Short, readable, humorous. See §9. |
| Monetisation | **Free.** |

---

## 2. Platform & Technical Constraints

- **SPA, pure HTML/CSS/JS** (TypeScript optional), with no backend for the MVP. Static hosting (GitHub Pages).
- **Rendering:** Canvas 2D for the floor map (or PixiJS if we need sprite batching), and DOM/CSS for panels and menus, because DOM is easier for accessibility and responsive layout.
- **Input:** Mouse plus keyboard shortcuts on desktop. Tap, long-press, pinch-zoom and drag-pan on mobile. **No hover-only information.**
- **Performance budget:** 60 fps on a mid-range 2022 Android phone. Initial load under 3 MB. Simulation tick decoupled from rendering.
- **Saves:** localStorage/IndexedDB autosave every in-game hour and on `visibilitychange`. Export/import save as JSON (enables cross-device play without a backend).
- **PWA:** Installable and works offline.
- **Orientation:** Portrait-first on mobile (one-handed), with landscape supported. Desktop uses a multi-panel layout.
- **Localization-ready:** All strings in JSON. EN first, FR second.

---

## 3. Core Loops

```
MICRO (seconds)   Alarm fires → inspect → dispatch tech → tech walks, fetches part, works → resolved / escalated
MID   (minutes)   Accept contract → install capacity → balance power/cooling → meet SLA → get paid
MACRO (hours)     Unlock level → expand hall/site → research tech → hire & train team → automate → reputation tier
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

**Calendar.** Contracts are measured in **game days**, not months: a small contract runs 3–10 days, a big one 15–30. Billing happens daily at midnight, with a short end-of-day report. A campaign level lasts 3–7 game days, so 25–55 real minutes at 1× and less with fast-forward. Week structure (Mon–Sun) matters for demand curves and "Friday" events.

**Job durations** (game minutes, with real seconds at 1× in brackets):
- Quick: reboot 5 (≈2 s), patch a cable 10 (≈3 s)
- Standard: swap a disk or PSU 15 (5 s), install a server 30 (10 s)
- Long: CRAC service 60 (20 s), generator test 60 (20 s)
- Heavy: install a rack 180 (60 s), fiber repair 120 (40 s)
- Walking speed: about 4 tiles per real second at 1×, so crossing a 40-tile hall takes about 10 s. That makes the layout and the position of the storage room matter.

**Alarm escalation timers** (game time): Warning to Major in 2 h (40 s at 1×). Major to Critical/outage in 45 min (15 s).

**Incident rate target** (tuned through MTBF scaling): L0–L1 about 2–4 incidents per game day, L3 about 8–12, L5+ 20+ but with most handled by automation. Players should never wait more than about 60 real seconds with nothing to do at 1×. If they would, they can fast-forward.

**Failure state:** Bankruptcy (cash < 0 for N days), or reputation collapse (lost all contracts). Levels also have **objective-based wins** (e.g. "Reach 99.9% uptime for 7 days while hosting 20 servers").

---

## 4. World Model

### 4.1 Spatial hierarchy
```
Campus
 └─ Site (city/climate: affects free cooling, power price, disasters)
     └─ Building / Hall (a "level" in the floor sense: Hall A, Hall B, rooftop, basement)
         └─ Row / Aisle (hot aisle / cold aisle orientation matters)
             └─ Rack (42U, power budget kW, weight, PDUs A+B)
                 └─ Device (server 1U/2U/4U, switch, storage array, GPU node, patch panel)
                     └─ Components (disks, PSUs, fans, RAM, NICs) — abstracted to "health" + named failure
```
The **floor map** is a top-down tile grid. Tiles: floor, rack slot, CRAC unit, PDU, UPS room, generator yard, loading dock, storage room, NOC (staff room), corridor, door (with access control), fire suppression zone.

### 4.2 Infrastructure subsystems

| Subsystem | Elements | Key stat | Introduced |
|-----------|----------|----------|-----------|
| **Compute** | Servers, storage, GPU nodes | Load %, health, age, firmware version | L1 |
| **Power** | Utility feed, PDUs, UPS, generator, ATS, (later) solar/battery | kW used vs capacity, redundancy (N, N+1, 2N) | L1 (basic), L4 (full) |
| **Cooling** | Wall AC → CRAC/CRAH → in-row → liquid/immersion | Zone temperature, airflow, PUE | L2 (basic), L3 (aisles), L6 (liquid) |
| **Network** | ToR switches, core/spine, uplinks/ISPs, cabling | Bandwidth, latency, link redundancy | L3 |
| **Security (physical)** | Badge doors, cameras, guards, visitor escort | Intrusion risk | L4 |
| **Security (cyber)** | Firewall, IDS, patch level, MFA, SOC analyst | Threat level, vuln count | L5 |
| **Logistics** | Loading dock, storage room, parts inventory, vendors | Stock, delivery ETA | L2 |

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
| **You (Manager avatar)** | Can do any basic task slowly. Tutorial only, then becomes a "boost" ability. | L1 |
| **Hardware Technician** | Install/remove servers, swap disks/PSUs/RAM, racking, cabling | L1–L2 |
| **HVAC Technician** | CRAC maintenance, filters, coolant, leaks | L3 |
| **Electrician** | PDU, UPS batteries, generator tests, breaker resets | L4 |
| **Network Engineer** | Switches, fiber, uplinks, cabling audits, DDoS mitigation | L3–L4 |
| **Security Guard** | Patrols, visitor escort, intrusion response | L4 |
| **SOC / SecOps Analyst** | Patching, incident response, threat hunting (works from NOC, no walking) | L5 |
| **Site Reliability Engineer** | Writes automation/runbooks. Reduces manual task frequency. | L5 |
| **Shift Lead** | Auto-dispatches a team per your rules | L4 |
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
Techs path-find on the floor map. A job is a chain of steps: **walk to storage → pick up part → walk to rack → work (progress bar) → test → return the old part / e-waste.** Steps are visible, so the player understands *why* a job takes time. That makes layout matter: put the storage room near the halls.

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

## 11. Progressive Disclosure: Level / Campaign Structure

Each level teaches with **Introduce → Practise → Twist**: a safe tutorial moment, then a normal task, then a complication that combines the new mechanic with older ones.

| Lvl | Name | Setting | New mechanics introduced | Twist / Final challenge | Win condition (example) |
|-----|------|---------|--------------------------|-------------------------|-------------------------|
| 0 | **Tutorial: "The Closet"** | 1 rack in an office broom closet | Tap device, inspect, *you* swap a disk, install a server | The office AC is switched off on Friday evening | Survive a weekend |
| 1 | **Server Room** | 4 racks, small company | Hire 1st HW tech, dispatch, parts inventory, orders and delivery, money | Two disks fail at once. One tech → prioritise | 99% uptime, 10 servers |
| 2 | **Startup Colo** | 10 racks, first customers | Contracts and SLAs, demand curves, power budget per rack, breaker trips, basic cooling (zone temp) | Pizza Rocket lunch spike + hot day | Earn $X, keep 3 clients |
| 3 | **Colocation Floor** | 1 hall, 40 racks | Hot/cold aisle layout, CRAC units, HVAC tech, network (ToR, uplinks), Net engineer, technician fatigue and morale | Fiber cut during the GameStudio launch | Hit 99.9% SLA for 7 days |
| 4 | **Enterprise DC** | 2 halls + power room | UPS / generator / redundancy (N+1), electrician, shifts (day/night), Shift Lead + simple auto-dispatch rules, physical security and guards | Storm: utility outage + generator not tested | Survive outage with zero SLA breach |
| 5 | **Cloud Region** | 3 halls, multi-floor building | Cyberattacks full system, SOC, patching, SRE + runbooks, research tree fully open, DCIM alarm grouping | Zero-day + DDoS on Black Friday | Reputation 4★ |
| 6 | **AI Campus** | Multi-building campus, choose site/climate | GPU racks (40–100 kW), liquid cooling, leaks, grid demand response, green score, robots | Heatwave + ViralAI ×3 demand + power cap from grid | PUE < 1.3 with 99.99% |
| ∞ | **Sandbox / Endless** | Any site | Everything, custom difficulty sliders | Escalating director | High score |

**Within-level disclosure rules**
- The UI shows **only unlocked panels** (e.g., no "Power" tab until L2). New tabs pulse once with a 1-line tooltip.
- **Contextual "first time" tips** trigger on first occurrence (first overheating: "Racks hate heat. Every +10 °C doubles failure risk.") and can be replayed in the **Handbook**.
- **Mentor character** ("Sam, the retiring old-school sysadmin") delivers tips in short, funny lines, not walls of text. Skippable.
- After L1, players can **skip the campaign** to sandbox, with all tutorials available in the Handbook.

**Learning curve target**
```
Complexity
  ▲                                          ┌──── L6 (automation absorbs complexity)
  │                                ┌─────────┘
  │                      ┌─────────┘ L5
  │             ┌────────┘ L4
  │      ┌──────┘ L3
  │  ┌───┘ L2
  │──┘ L0-L1
  └──────────────────────────────────────────────► Time
Player *workload* (taps/minute) should stay roughly flat: new complexity
is balanced by new automation (auto-dispatch, runbooks, DCIM, robots).
```

---

## 12. Difficulty & Pacing

**Difficulty presets** (tunable sliders underneath):
- 🎓 **Intern:** slow time, generous cash, few incidents, alarms auto-pause the game.
- 🧑‍💻 **Sysadmin:** default.
- 🔥 **On-Call Nightmare:** more incidents, stricter SLAs, attackers adapt.
- ⚙️ **Custom:** incident frequency, economy, cyber threat on/off (for players who just want the cozy building game).

**Incident Director** (dynamic pacing, inspired by "AI director" systems): tracks player stress (open alarms, cash trend, recent outages) and alternates **calm → build-up → peak → relief** phases. It never stacks 3 criticals on a player who is already drowning, unless they're on Nightmare.

**Time controls:** Pause / 1× / 2× / 4×. Optional **auto-pause on Critical** (default ON for mobile). Keyboard: `Space` pause, `1-3` speed.

**Assist features:** "Suggested tech" highlight on dispatch (nearest and qualified), "Why did this happen?" explainer on every incident post-mortem (reinforces learning).

---

## 13. Automation Layer (key to late-game fun)

1. **Manual dispatch** (L1): tap alarm → tap tech.
2. **Suggested dispatch** (L2): one-tap "Send best".
3. **Auto-dispatch rules** (L4, Shift Lead): simple IF/THEN cards, e.g. `IF Disk alarm AND severity ≥ Warning → nearest HW tech`.
4. **Runbooks** (L5, SRE): sequences, e.g. `On CVE: patch Tier-3 customers first, then rolling patch others at night`.
5. **Predictive maintenance** (L5): DCIM schedules jobs before failures.
6. **Robots** (L6): disk-swap robots, but they need maintenance too.

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
  data/        JSON content: devices, parts, incidents, customers, levels, traits, research tree, strings
  render/      canvas map renderer, sprites, overlays, camera (pan/zoom)
  ui/          DOM panels (vanilla components or Preact), responsive CSS, input abstraction (mouse/touch)
  save/        serialize/deserialize, versioned save migrations
  audio/       WebAudio synth sfx
```
- **Sim/render separation** keeps the simulation headless-testable (unit tests with Vitest), and makes fast-forward and auto-balance scripts possible.
- **Data-driven content** so designers can add incidents and customers without code.
- **Build:** Vite. Deploy: GitHub Pages. No external runtime dependencies beyond an optional small renderer.
- **Telemetry (opt-in, later):** level completion, failure causes, to tune difficulty.

---

## 18. Scope & Milestones

### MVP (vertical slice): Levels 0–2
- Floor map, rack view, 1–3 HW techs, dispatch, pathfinding, inventory and deliveries
- Devices: 1U/2U servers. Failures: disk, PSU, overheating. Basic zone temp and power budget
- Contracts with SLA and demand curves, economy, reputation
- Alarm feed with severity, countdown and auto-pause
- Tutorial (mentor tips), save/load, mobile + desktop layouts, PWA

### v1.0: Levels 3–5
- Aisles and CRACs, network, HVAC/Electrician/Net/Guard/SOC roles, fatigue and morale, traits, shifts
- UPS/generator/redundancy, cyberattacks, research tree, auto-dispatch rules, DCIM, achievements, daily challenge

### v1.x: Level 6 and beyond
- GPU/liquid cooling, multi-building campus, sites and climates, robots, runbooks, sandbox sliders, scenario editor, leaderboards

---

## 19. Success Metrics

| Metric | Target |
|--------|--------|
| Tutorial completion | > 80% |
| L2 completion | > 50% of starters |
| Median session length (mobile) | ≥ 8 min |
| D1 / D7 return (PWA installs) | 35% / 15% |
| "Unfair" deaths: failures with no prior warning | ~0 (every outage traceable to an ignored signal) |
| Performance | 60 fps at 200 racks on mid-range phone |

---

## 20. Open Questions & Risks

1. ~~Map perspective~~ **Decided:** top-down.
2. ~~Time scale~~ **Decided:** 1 s = 3 game min at 1× (§3.1). Validate in playtest that standard jobs (5 s) don't feel too fast to follow.
3. **Multi-floor buildings:** Separate floor tabs with elevator travel time for techs, or one flat map per hall? *Tabs, with elevator travel time.*
4. ~~Cyber layer depth~~ **Decided:** fun and arcade-like with cartoon villains (§9), always tied to physical consequences on the map.
5. **Mobile density:** At 200+ racks the map gets busy. Need aggressive LOD (rows collapse into blocks when zoomed out) and alarm grouping.
6. **Micro-management fatigue:** Mitigated by the automation layer (§13). Needs playtesting at L4–L5.
7. ~~Monetisation~~ **Decided:** free, with no ads and no purchases.
8. **Branding:** All customers, vendors and products fictional. No real company names or logos.

---

## Appendix A: Example "first 5 minutes"

1. Sam the mentor: *"Welcome to the closet. That humming box is our whole company's IT. Don't let it die."*
2. A disk LED blinks amber. **Tap the rack**, the rack view opens, and you **tap the disk** and see "Disk 2 failing, RAID degraded."
3. **Tap "Replace"**. Your manager avatar walks to the shelf, grabs a spare, and swaps it (progress bar). +XP, alarm cleared. Tip: *"RAID gives you a second chance. Not a third."*
4. Bakery Webshop asks for 1 more server. Tap the contract, **order a server** (delivery in 30 s), then **drag/tap it into U12**.
5. Power bar turns yellow: *"Each rack has a power budget. Go over and the breaker trips."*
6. Friday 18:00 event: *"Facilities turned off the office AC for the weekend."* The temp gauge rises. You learn to **cut load**, **open the door** (free cooling, but a security risk later!), or **buy a portable AC**.
7. Survive until Monday, win Level 0. The reward unlocks **Hire Technician**.

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
