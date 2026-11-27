# PRD v2 addendum: proposals from "Data Centers: Today and Tomorrow"

*Source: the Game Design Field Guide dated 27 Nov 2026 (attached by the project owner). Reviewers: Morgan Reyes (data center operations) and Camille Laurent (product manager), same personas as `docs/PRD_v2.md`. Status: proposals for decision. Nothing here is built yet.*

**A note on the numbers.** Every real-world figure below comes from the attached guide and has not been re-checked by us. Forecasts (IEA, McKinsey, JLL) disagree with each other, so the game and the in-game Handbook should say "about" and "in 2026", and never present a projection as fact. Game values stay compressed and tuned for fun.

---

## 1. What the report changes in our thinking

| Report idea | Where the game is today (v1.2) | Gap |
|---|---|---|
| **Power is the master resource, heat the master waste** | Power exists as per-rack budgets, UPS, generator, feeds. Cooling is separate. No site-level cap. | Power is a puzzle per rack, not the **strategic constraint** of the whole game. |
| **Equipment queues are years long** (transformers, turbines) | Parts arrive in minutes to hours. | No planning ahead. Nothing you order today can matter next chapter. |
| **Water vs electricity trade-off** | Not modelled. PUE fixed in code (planned F5). | Missing the most-discussed local trade-off of the decade. |
| **Local opposition** (utility bills, water, noise) | No neighbours. | No social limit on growth. |
| **Density treadmill**: every upgrade raises density, then heat, then forces the next cooling tier | Chapters teach cooling in steps but there is no ongoing upgrade loop. | No long-run progression that feels earned. |
| **Failure scales with cluster size**; effective training time is the real KPI | Failures are per server. SLA uptime is the only KPI. | AI customers (F6) need a different success metric. |
| **Training vs inference** (far and cheap vs near and fast) | One kind of customer demand profile family. | Site choice has no reason beyond price. |
| **Three networks**: back-end, front-end, out-of-band | One network (uplinks). NOC upgrade (v1.1) is not tied to anything physical. | OOB management is a real thing that makes the NOC credible. |
| **Boom and bust**: tenants walk away, financing collapses | Contracts end on time; no counterparty risk. | No financial drama (planned F11 board review). |
| **Event cards from real incidents** | Scripted events per chapter plus a director. | A big library of ready-made, credible events. |
| **Eras** (cloud warehouse → AI factory → energy-integrated → frontier) | Chapters are tutorials of systems. | No story arc that explains *why* the next chapter exists. |

---

## 2. Proposals

Each has: what, why it is fun, how it fits the rules (≤ 2 new systems per chapter, phone-first, money consequence), and acceptance.

### P1. Site power capacity and the grid-connection queue *(master resource)*

**What.** The facility gets a **grid connection capacity** (in game kW, labelled MW at higher chapters). Total IT + cooling draw cannot exceed it, or the main breaker trips the whole hall (the existing breaker mechanic, one level up). Growing the connection is a **queued order**: you request more capacity, a utility "study" and a transformer build take game days, and you can be told the queue is longer than hoped.

**Fun.** Every expansion decision becomes "do I have the power?" first. Signing a big customer without headroom is a gamble you can see coming (pairs with the DCIM capacity view F4).

**Fits.** Uses the existing capacity preview. It is the single new idea of Chapter 7 alongside live PUE (cap is on total facility power, so efficiency literally buys growth).

**Acceptance.** The cap and queue are pure functions with tests. A bot that never orders more capacity stalls its growth; one that orders early does not. Phone: one card in the Infra tab.

### P2. Long-lead equipment

**What.** Big-ticket items (generators, UPS units, CRAC/chillers, transformers) have **lead times in game days**, not minutes. A premium "expedite/import" costs more. Some chapters hand you a *forecast* ("the launch is in 5 days") so planning matters.

**Fun.** The calm-time activity becomes "what will I need next week?", which is exactly the real job and gives the shift loop a strategic layer. Scarcity events ("transformer delayed") become fair: you saw the lead time.

**Fits.** This is the supply-chain feature F12 given a clear shape. Small parts (disks, PSUs) keep fast delivery so the tutorial chapters do not change.

**Acceptance.** Orders show an ETA; a delayed order is shown with its reason. Existing balance tests stay green because small-part timing is untouched.

### P3. Water ↔ power slider *(extends F5)*

**What.** A cooling-mode choice per site: **evaporative** (low electricity, uses water, neighbours notice), **closed-loop/dry** (almost no water, more electricity, worse in hot weather). A **drought** event can ban evaporative for a season.

**Fun.** A genuine trade-off with no right answer: cheap-and-thirsty vs expensive-and-quiet. PUE, the water bill and the neighbours (P4) all move together.

**Fits.** One setting inside the Energy section planned for Chapter 7. Handbook entry: "saving water usually costs electricity, and the other way round".

**Acceptance.** Mode changes PUE and water use deterministically; the drought event forces a mode; tests cover both extremes.

### P4. Community goodwill *(new soft resource)*

**What.** A 0–100 meter driven by noise, water use, power-bill impact and visible good deeds (**heat reuse**, jobs, a quiet generator test schedule). Low goodwill brings **permit delays and moratoriums** on new builds; high goodwill speeds permits and unlocks heat contracts.

**Fun.** A reason to be a good neighbour that is not a lecture: it is a gate on growth. Also gives the campus chapter (F10) its political layer.

**Fits.** One meter on the campus screen; events adjust it. Introduced only at campus scale (Chapter 10), so it never competes with earlier chapters.

**Acceptance.** Meter is a pure function of recorded actions. A moratorium blocks only new-build orders, never running operations.

### P5. The density treadmill: a cooling and power tech tree

**What.** A visible **upgrade ladder** across three tracks:
- Cooling: air aisles → rear-door coolers → cold plates → immersion.
- Power: grid tie → diesel backup → batteries → gas microgrid → nuclear power agreement.
- Network: copper → pluggable optics → co-packaged optics.

Each upgrade **raises the rack density you can sell**, which raises heat, which demands the next tier. New **chip generations** arrive as events: double the performance for double the rack power.

**Fun.** A long-run "one more upgrade" loop with a clear shape, matching the real treadmill. It also finally uses the "research tree" idea that sat in the v1 PRD.

**Fits.** Starts in Chapter 8 (AI Factory) where liquid cooling arrives; earlier tiers map to what the player already unlocked, so the tree explains the campaign retroactively.

**Acceptance.** Each tier has a density cap and a cost; a tier skipped means throttling or failure; tests assert the ladder is monotonic.

### P6. AI customers measured by *effective training time*

**What.** AI customers do not care about SLA uptime alone. Their contract measures **effective training time** (share of time the cluster did useful work). Failures scale with cluster size (the guide cites one interruption every few hours on a very large run), and **checkpointing** (an upgrade) plus fast automated recovery keeps the number high.

**Fun.** A second KPI that rewards a different skill: spares, automation and fast restarts. A big cluster is a high-reward, high-risk contract.

**Fits.** One new contract type inside Chapter 8; reuses the failure engine with a cluster-size multiplier.

**Acceptance.** Effective time falls as cluster size grows, recovers with checkpoint and automation upgrades; the bot reaches the target only with both.

### P7. Training vs inference and the latency rule

**What.** Two AI demand families. **Training**: huge, steady, tolerant of distance (wants cheap power). **Inference**: spiky, **latency-sensitive**, wants a site near the city. A site's distance to a customer region adds latency (light in fibre is about 200 km per millisecond), and some customers will only sign below a latency limit.

**Fun.** Gives multi-site (F10) a reason beyond price: a cheap remote site for training, a pricier metro site for inference.

**Fits.** Ships with the campus release; a site attribute and a customer requirement. No new simulation loop.

### P8. Out-of-band network as the NOC's backbone

**What.** The report's three networks make a neat teaching and gameplay link: remote hands (the v1.1 NOC) rely on a separate **out-of-band management network**. If it is cut or not built, remote reboot fails and technicians must walk. AI clusters add a **back-end fabric**: GPU racks must sit in the same hall to get full speed (a placement puzzle).

**Fits.** The OOB link is a small prerequisite for NOC level 1, not a new tab. The back-end fabric belongs to Chapter 8.

### P9. Event card library

Adopt these as director-controlled or scripted events, each with its lesson in the Handbook:

| Event | Effect in game | Lesson |
|---|---|---|
| Transformer delayed | Capacity order slips; pay for an import or wait | Long-lead planning (P1, P2) |
| Drought declared | Evaporative cooling banned for a season | Water vs power (P3) |
| County moratorium | No new builds for N shifts | Goodwill (P4) |
| Winter storm | Liquid-cooling lines damaged | Climate risk, new-skill repairs |
| Synchronized power spike | A training start trips a breaker; batteries soften it | Grid shock, battery buffers (P10) |
| Silent data corruption | A node returns wrong answers; penalty unless diagnostics catch it | Detection and NOC level 2 |
| Tenant walks away | Big customer cancels, leaving a half-built hall | Demand risk (P11) |
| New chip generation | Double performance, double rack power | Treadmill (P5) |
| Heat contract offered | A city pays for your waste heat in exchange for a permit | Heat reuse (P12) |

### P10. Batteries as buffers

Big training runs change power draw all at once. A **battery buffer** upgrade smooths the spike and can also support the grid. This reuses the UPS model built in v0.8 and v1.1 and turns it into a long-term investment, not only an outage bridge.

### P11. Boom, bust and stranded assets *(sharpens F11)*

Customers can **walk away** and financing can **dry up**. A half-built hall becomes a stranded asset costing rent. The monthly board review (F11) gets a real counterparty-risk dimension: sign too few big tenants and growth stalls, too many and one departure hurts.

### P12. Heat reuse as a second product

Server waste heat is warm but not hot, so a **heat pump** is needed before a city can use it. Offer **heat contracts** (small income, large goodwill and permit speed). Already planned as a late F5 upgrade; the report makes it a first-class link between P3, P4 and money.

### P13. Skills as a scarce, trainable resource *(answers an open question)*

The report says liquid-cooling expertise is rare. **Decision:** liquid cooling is a **skill gained by training an existing HVAC or electrician technician** (a time and money cost, a day away from the floor), not a new hireable role. This resolves open question 1 of PRD v2 and keeps the roster readable on a phone.

### P14. Resilience levels (Tier-style) as goals and contract gates

The Uptime-style tier ladder (maintain anything without a shutdown; survive any single fault) fits our stars and customer gates. Use **generic names** ("Resilience level I to IV") to stay clear of real-brand and certification paperwork, which PRD v2 already excludes. Level III needs the change-management system (F2); level IV needs the redundancy built in v1.2.

### P15. Factions and story voices

Light narrative through **offers and events**, not cutscenes: a utility ("your request is 14th in the queue"), a reactor startup ("firm power in five years"), the county board, a chip vendor, a hyperscaler tenant. The **two-stage unlock** from the report (gas turbines now, reactors later) is a ready-made campaign arc for the campus chapter.

### P16. Eras as the campaign frame

Frame chapters by era, using only the grounded ones:
- Chapters 0–5: **Cloud warehouse**.
- Chapters 6–8: toward the **AI factory**.
- Chapters 9–10: **energy-integrated compute** (own power, heat sold, metro hubs).

The speculative eras (compute as a utility, off-world, thermodynamic limit) become an optional **Frontier epilogue** in Sandbox: orbital clusters with no technicians, radiator limits, a latency tier by distance. It is clearly labelled as speculative and never part of the core campaign.

---

## 3. Scorecard and recommendation

Impact on fun and credibility, effort (S ≈ days, M ≈ a release, L ≈ several), fit with the ≤ 2 systems rule.

| # | Proposal | Impact | Effort | Fit | Verdict |
|---|---|---|:-:|---|---|
| P1 | Site power cap and grid queue (row scale, MW labels) | Very high | M | Chapter 7, pairs with F4/F5 | **Adopt (§5.1, §5.2)** |
| P2 | Long-lead equipment | High | M | Folds into F12 | **Adopt** |
| P3 | Water ↔ power slider (now with off-site water) | High | S → M | Chapter 7 energy | **Adopt, two meters (§5.3)** |
| P9 | Event card library | High | S per card | Director, any chapter | **Adopt, incrementally** |
| P13 | Skills by training | Medium | S | Resolves an open question | **Adopt** |
| P6 | Effective training time | High | M | Chapter 8 | **Adopt** |
| P5 | Density tech tree | High | L | Chapter 8 onward | **Adopt, staged** |
| P8 | Out-of-band network | Medium | S | NOC prerequisite | **Adopt** |
| P10 | Battery buffers | Medium | S | Reuses UPS | **Adopt** |
| P14 | Resilience levels | Medium | S | Goals and gates | **Adopt** |
| P4 | Community goodwill | High | M | Chapter 10 only | **Adopt with campus** |
| P7 | Training vs inference, latency | High | M | Campus release | **Adopt with campus** |
| P11 | Boom/bust and stranded assets | Medium | M | Board review | **Adopt with F11** |
| P12 | Heat reuse | Medium | S | F5 late upgrade | **Adopt** |
| P15 | Factions | Medium | S | Writing, events | **Adopt, light** |
| P16 | Era framing and Frontier epilogue | Medium | S / M | Frame now, epilogue as late Sandbox mode | **Frame now; epilogue = Sandbox mode (§5.4)** |

**Not recommended now:** a full real-world site-selection map with real places and prices (brand and accuracy risk), per-chip hardware models by vendor name (real brands are out of scope), and the speculative eras as campaign content.

## 4. Where it lands in the release plan

| Release | Existing plan | Additions from this report |
|---|---|---|
| **v1.3** Change Advisory Board | Change management, supply-chain events, Chapter 6 | **P2** lead times for big items; **P9** first four event cards; **P14** resilience levels as goals |
| **v1.4** Efficiency Drive | DCIM capacity, live PUE, free cooling, Chapter 7 | **P1** site power cap and grid queue with **row scale** and `formatPower`; **P3** water with **on-site and off-site meters**; **P12** heat reuse; **P8** out-of-band network; Handbook entries for water and PUE (rounded, dated figures) |
| **v1.5** AI Factory | Liquid cooling and GPU racks, Chapter 8 | **P6** effective training time; **P5** density tree (first two tiers); **P10** battery buffers; **P13** liquid-cooling training; events: spike, silent corruption, winter storm, new chip generation |
| **v1.6** The Long Night | Customer 2.0, nights, Chapter 9 | **P15** factions as event voices; **P11** tenant walks away (early form) |
| **v2.0** Hyperscale | Campus, economy 2.0, Chapter 10 | **P4** goodwill and moratoriums; **P7** training vs inference and latency; **P11** stranded assets; **P16** era framing |
| **v2.x** | Parking lot | **Frontier floor in Sandbox 2.0** (orbital: radiators, launched spares, launch-price curve), full tech-tree breadth |

## 5. Decisions (owner, 27 Nov 2026)

| # | Question | Decision | What it means |
|---|---|---|---|
| 1 | Relabel kW as MW? | **Yes, relabel** | See §5.1 |
| 2 | How long is a queue day? | **Explained: one game day** | See §5.2 |
| 3 | Model off-site water? | **Yes, model it** | See §5.3 |
| 4 | Orbital epilogue | **A late Sandbox mode, not a release** | See §5.4 |

### 5.1 Power units: kW now, MW from Chapter 8, by *row scale*

Only the **display** changes: the simulation keeps one unit, so tests and saves are untouched.

- **Chapters 0 to 6** keep W and kW (closet, server room, colo floor).
- **Chapter 7 (Efficiency Drive)** introduces **row scale**: a map tile now stands for a *row* of 10 racks, and power, cooling and the site cap are shown at ×10. A 3 kW rack tile reads as 30 kW; the hall total reads in hundreds of kW, the site cap in MW with one decimal.
- **Chapter 8 (AI Factory)**: a dense AI tile reads in the hundreds of kW to about 1 MW, and the hall in single-digit MW.
- **Chapter 10 (Campus)**: sites are labelled by the guide's scale ladder: edge (under 10 MW), enterprise (about 10 to 25 MW), regional hub (about 20 to 100 MW), hyperscale (100 MW and up), gigawatt campus (1 GW and up, as a late unlock).
- A single `formatPower(value, scale)` function owns all formatting. The Handbook shows a "real scale" line: a typical 2026 rack is about 11 kW and an AI rack 100 to 250 kW (guide figures, approximate).
- **Acceptance:** one formatter, unit-tested at each scale boundary; a test fails if any view prints a raw watt value outside it; French uses the same units.

### 5.2 What a "queue day" is

A **queue day is one game day**: one shift (06:00 to 22:00) plus the night. At 1× speed that is about **6 to 9 real minutes**, and the night is fast-forwarded when quiet, so it costs seconds. It is *not* a real-world day.

- A lead time of **3 queue days** means the part arrives at the same hour three game days later: three shift reports and roughly 20 to 25 minutes of play.
- **Recommendation: major items take 2 to 5 queue days**, shown as an ETA ("arrives Thursday 08:00, 2 days") and as a line in each shift report ("Arriving: transformer in 1 day"). An expedite costs extra and saves about one day.
- **Constraint to respect:** each chapter is its own run of 3 to 5 game days, so a long-lead order cannot span chapters. In campaign chapters the planning layer is therefore days 0 to 2: a forecast on day 0 ("the launch is on day 3") tells you what to order now. Orders spanning many days belong to the persistent **Campus** run (v2.0) and to Sandbox, where the clock does not reset.
- **Acceptance:** every long-lead item has an ETA in game days; a test checks that in each chapter every item the objectives need can be ordered and delivered inside the chapter; small parts (disks, PSUs, filters) keep their existing minutes-to-hours delivery.

### 5.3 Off-site water: modelled, with two meters

The guide notes that far more water is used *generating* the electricity than *cooling* the site (possibly about ten times more), yet neighbours react to the water they can see. We model both, and let that gap be the lesson.

| Meter | What it counts | Who cares | Effect |
|---|---|---|---|
| **On-site water** | Evaporative cooling use | Neighbours | Drives **community goodwill** (P4), drought bans |
| **Off-site water** | Water embedded in the electricity: per kWh, set by the power source | Green and ESG customers, the board | Drives **ESG contract eligibility**, a **water footprint** line in the board review (F11) |

- **Mechanics (kept simple):** `on-site = heat rejected by evaporative cooling × factor`; `off-site = kWh × source factor`. Source factors (game values, ordered by the guide's logic, not exact): solar and wind lowest, grid mix medium, gas and nuclear higher. Calibrated so that with evaporative cooling on a grid-mix site, off-site is roughly 3 to 10 times on-site. The guide's "about ten times" is shown as "about" in the Handbook, the game uses a range.
- **The trade-off falls out honestly:** dry or closed-loop cooling cuts on-site water almost to zero but costs more electricity, which *raises* off-site water. The player can please the neighbours and still fail an ESG contract.
- **UI:** one Water card in the Energy section (two bars), plus a drought event that bans evaporative cooling for a season.
- **Acceptance:** both meters are pure functions with tests; switching to dry cooling lowers on-site and raises off-site water for the same load; a green contract can be failed by a low on-site / high off-site profile.

### 5.4 Orbital epilogue: a late Sandbox mode

Not a release. After v2.0 and the campus playtest, Sandbox 2.0 gains a **Frontier** floor type, unlocked by finishing Chapter 10. It is labelled speculative.

- **Site:** orbital cluster. Constant solar power; heat can only leave through **radiators**, so a **radiator area** limit replaces cooling units.
- **No technicians:** physical jobs do not exist. Repairs are spares **launched** at a price per kg; a robot arm upgrade handles simple swaps.
- **Launch price slider:** starts high and falls over the run (the guide cites break-even near $200/kg against about $2,700/kg today). It is the pacing mechanic.
- **Latency tier:** workloads that must be close (games, trading) are impossible; archives and training are fine. Round trips are tens of ms to the ground.
- **Radiation:** higher chip failure; shielding is an upgrade.
- **Score:** days survived, effective compute and cash, like Sandbox today; same engine (`createSandbox`), new floor and rules, so effort is **M**, not L.
- **Acceptance:** deterministic, tested like Sandbox; the mode is clearly marked "speculative, not a forecast".

---

## Appendix: guide figures worth quoting in the Handbook (with the guide's own caveats)

- Data centers used about 1.5% of world electricity in 2024; one projection for 2030 is about 945 TWh a year.
- Typical rack about 11 kW in 2026; the newest AI racks 100 to 250 kW; about 1 MW is discussed.
- PUE rule of thumb: about 1.1 for the best hyperscale sites, about 1.5 or more for older ones (the guide marks this as a rough guide, not a survey figure).
- Large transformer queues of up to four years.
- A 1 GW evaporative campus can use millions of gallons of water a day.
- One interruption about every three hours on a very large training run.
- Light in fibre: about 200 km per millisecond.
