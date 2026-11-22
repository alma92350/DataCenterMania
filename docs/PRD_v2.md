# DataCenterMania PRD v2.0: "Hyperscale"

*Status: draft for decision · Date: 2026-11-22 · Supersedes nothing: v1 (`docs/PRD.md`) stays the reference for everything shipped up to v1.0.*

## How this document was made

Two reviewers looked at the full project: the live build, the code (≈16,900 lines of TypeScript, 33 test files, 333 unit tests, a phone e2e suite), the PRD v1 with its results sections, and the bot measurements.

- **Morgan Reyes**, data center operations expert (fictional persona): 20 years running colocation and enterprise halls, from a single server room up to a 40 MW campus. Morgan reviews the game against real operations.
- **Camille Laurent**, game product manager (fictional persona): owns the roadmap, the retention numbers and the "is it fun on a phone in 8 minutes" question.

Part I is Morgan's review. Part II is a condensed record of their working session, with each decision. Part III is the PRD v2.0 that came out of it.

---

# Part I: Expert review (Morgan Reyes)

## 1. Verdict

"I would let a junior ops engineer play this. It teaches the right instincts: watch the alarms, keep spares, respect the power budget, fix the airflow, test your generator. That is rare. But it teaches **one generation of data center**: the 2010 enterprise room, where one power supply dying takes a server down and the biggest worry is a backhoe. The industry has moved to redundancy everywhere, change control, remote management, AI racks that draw as much as a small house, and the question of where the electricity comes from. v2 should take the player there."

| Area | Realism | Fun today | Notes |
|---|:-:|:-:|---|
| Alarm → dispatch → fix loop | B+ | A− | Correct instinct. Real NOCs triage the same way. |
| Spares and logistics | B | B+ | Good. Missing: lead-time shocks, RMAs, vendor choice. |
| Power | C | B | Per-rack budget and breakers are right. **Single-corded servers and no A/B feeds are wrong.** UPS runtime is far too long. |
| Cooling | B− | B | Aisles and filter wear are a great teaching moment. Missing: N+1 cooling, inlet temperature, free cooling, liquid. |
| Network | C+ | B | Uplinks and fiber cuts are real. Missing: redundant switching (dual ToR), cross-connects. |
| Backup power (Ch5) | B | B+ | "Untested generator fails" is the best lesson in the game. Missing: ATS, fuel, load tests. |
| Staff | B | B+ | Roles and fatigue are good. Missing: shift rota, on-call, handovers. Real outages are mostly human error. |
| Cyber | C (cartoon, on purpose) | A− | Fine as a cartoon layer. Phishing lesson is accurate. |
| Customers & SLA | C+ | B | SLA math is right. Missing: tickets, SLA tiers, renewals, churn, contract negotiation. |
| Economy | C | B | Fixed PUE of 1.8, no capex/opex, no depreciation. Fine for v1, thin for a "manager" game. |
| Sustainability | D | n/a | Absent. It is now one of the top three topics in the industry. |
| Scale | C | B− | One floor, 15 racks. The fantasy of "growing an empire" stops at Ch5. |

## 2. What the game gets right (keep it)

1. **"Every outage is traceable to an ignored signal."** That is exactly how real post-incident reviews read. The post-mortem cards are the best teaching tool in the game.
2. **Untested generator fails to start.** The single most important lesson in facilities operations, taught in one storm.
3. **Hot/cold aisles as a puzzle.** Visual, spatial, correct.
4. **Filters clog, coolers derate in heat.** Maintenance as prevention is real ops, and the "proactive specialist" mechanic rewards it.
5. **Shift structure and the 22:00 report.** Data centers are run in shifts. The report card mirrors a real shift handover.
6. **The manager as a slow generalist.** In reality the ops manager can do anything, badly, and should not.

## 3. What is wrong or missing, ranked

Ranked by "would an operator wince" × "could it be fun".

| # | Gap | Why it matters in real life | Game opportunity |
|---|---|---|---|
| R1 | **Servers have one power supply and racks have one feed** | Real servers are dual-corded on A and B feeds. A dead PSU is a warning, not an outage. "Single-corded load" is a classic audit finding. | Redundancy becomes a choice with a cost: N, N+1, 2N for power and cooling. Turns PSU failures from "outage" into "risk". |
| R2 | **No change management** | Industry surveys attribute a large share of outages (often quoted at 60–80%) to human error and process failures, mostly during planned work. | Maintenance windows, change tickets, "Read-only Friday". Planned work you choose to risk, not only random failures. |
| R3 | **UPS runtime of ~40–60 minutes** | Real UPS systems bridge 5–15 minutes. The generator is the plan, the UPS is the bridge. | Makes the 3-minute generator start a real nail-biter and the ATS a new failure point. |
| R4 | **No remote management** | Most reboots are done remotely (out-of-band management, IPMI/iDRAC style). Walking to a rack to reboot is the exception. | A NOC upgrade: remote reboot and diagnostics, so technicians do physical work only. The `remote` feature flag already exists, unused. |
| R5 | **Fixed PUE of 1.8, no sustainability** | Efficiency (PUE), water use and carbon are board-level topics. Modern halls run around 1.2–1.5. | A live PUE you can improve: free cooling, higher setpoints, containment, heat reuse. Customers with green requirements. |
| R6 | **No high-density AI racks** | GPU racks draw 40–130 kW and need liquid cooling. It is the defining change of the decade. | A late-game chapter with liquid loops, coolant leaks, huge revenue and huge risk. |
| R7 | **No capacity planning** | The core job of a DC manager is forecasting power, cooling and space headroom and avoiding "stranded capacity". | A DCIM panel: what fits where, what you will run out of first. Signing a contract becomes a planning puzzle. |
| R8 | **Customers are SLA meters only** | Real customers open tickets, order cross-connects, renew or leave, audit you. | Ticket queue, satisfaction, renewals, churn, compliance audits. |
| R9 | **No on-call or night operations** | Nights are when the skeleton crew meets the worst incidents. | Night shift rota, on-call pager, a real "3 a.m." moment instead of skipping every night. |
| R10 | **Infinite generator fuel, no ATS** | Fuel lasts 24–72 h and needs refuelling contracts. The automatic transfer switch (ATS) is a common failure point. | Long outage chapters, refuelling logistics, ATS faults. |
| R11 | **One floor, one site** | Growth is the fantasy. Real operators run campuses and several regions. | Campus and multi-site meta map (parked in v1 as "good for later"). |
| R12 | **Economy without capex** | Building capacity is a capital decision with years of payback. | Capex vs opex, financing, a quarterly board review. |

## 4. Accepted simplifications (do not "fix")

- **Time compression.** A disk failing every few game days is ~100× real life. That is the genre. v2 states it openly in an in-game "Ops Handbook" note.
- **Cartoon cyber villains.** Keep them. Real security is boring to play. The lessons (phishing, isolation, patching) are right.
- **Rack temperature instead of inlet temperature.** One number per rack is readable. The Handbook can explain inlet vs exhaust.

---

# Part II: Working session (condensed)

*Morgan (M) and Camille (C). Each topic ends with a decision.*

### Topic 1: Redundancy

**M:** First thing I would change: dual power supplies. Today a PSU death is an outage. In my world it is a ticket.
**C:** Then the PSU alarm stops being exciting.
**M:** It becomes a *risk*. One PSU dead on a dual-corded server is fine until feed B trips. That is how real outages chain.
**C:** I like that: the chain is the drama. But it has to be visible. Players must see "this server is running on one leg".
**M:** And redundancy has to cost something: a second PDU, a second CRAC, a second switch. N+1 or 2N becomes a strategy.
**C:** And a ★★★ goal: "survive a feed failure with zero downtime".

> **Decision D1.** v2 introduces A/B power feeds, dual-PSU servers, redundant cooling and dual ToR switches, with N / N+1 / 2N as player choices. Single points of failure are highlighted on the map ("SPOF view"). Introduced in its own chapter, never all at once.

### Topic 2: Human error and change management

**M:** The biggest gap. Most outages I lived through were caused by us, during planned work.
**C:** Random failures are getting old after five chapters anyway. Planned work gives the player agency.
**M:** Firmware upgrades, power maintenance, cooler swaps. Each one has a risk, and the risk drops if you do it in a maintenance window, with a rollback plan and a rested technician.
**C:** So a "change card": what, when, who, risk %. The player schedules it. That fits the calm-time problem we fixed in v0.4.
**M:** And a "Read-only Friday" policy toggle. It is from your parking lot. It is real.

> **Decision D2.** Change management system: change cards with risk, maintenance windows, freeze policies. Botched planned work replaces part of the random failure rate, so the total incident load stays within the pacing guardrails.

### Topic 3: Remote hands and the NOC

**M:** Nobody walks to a rack to reboot a server any more.
**C:** Walking is our core visual. Tiny people running is the charm.
**M:** Keep walking for physical work: disks, PSUs, cables, coolers. Make the NOC an upgrade: remote reboot, remote diagnostics, then remote firmware. It removes busywork, which is what your automation layer is for anyway.
**C:** That is also a mobile win: fewer taps per incident.

> **Decision D3.** NOC upgrade tree (uses the existing `remote` flag): out-of-band reboot and diagnostics, then remote firmware campaigns. Physical jobs keep the walking.

### Topic 4: The AI era

**M:** The 2026 story is GPU racks. 80 kW in a rack. Air cannot cool that.
**C:** Big numbers are fun. What is the gameplay?
**M:** Liquid cooling loops with a coolant distribution unit (CDU). Leaks. Pump failures. A thermal runaway in minutes instead of hours. And customers who pay ten times more.
**C:** That is the endgame fantasy: "I run an AI factory". It needs its own chapter and its own look: glowing blue pipes.
**M:** Plus power: an AI customer can eat your whole feed. You may have to say no.

> **Decision D4.** Chapter 8 "AI Factory": high-density racks, direct-to-chip liquid cooling, CDUs, leak and pump incidents, minute-scale thermal events. Contracts so big they force capacity decisions.

### Topic 5: Sustainability

**M:** PUE is fixed at 1.8 in your code. A modern hall is around 1.3. Every operator is measured on it now, plus water and carbon.
**C:** Sustainability games can feel like homework.
**M:** Make it money. Better PUE cuts the electricity bill. Free cooling on a cold night saves money. Some customers only sign if you buy renewable power.
**C:** Then a live PUE gauge in the HUD, and green contracts as a new customer type. And a goal like "PUE below 1.4" for ★★★.

> **Decision D5.** Live PUE (computed from IT load, cooling and losses), free cooling by outside temperature, setpoint and containment upgrades, renewable power purchase, heat reuse. Green customers with ESG clauses. No moralising, just money and contracts.

### Topic 6: Scale: campus and sites

**C:** Players ask "what next" after Ch5. The single floor was the right v1 call. Is v2 the time?
**M:** Yes. Real growth goes: room, floor, building, campus, regions. Each site has a climate (free cooling in the north, cheap power in one place, storms in another).
**C:** Performance is the risk: our target is 60 fps at 200 racks on a mid-range phone. We have 15 today.
**M:** You only simulate the site you look at in detail. Other sites run a cheap model.
**C:** A meta map with 3–5 sites, one detailed site at a time, and a summary model for the others.

> **Decision D6.** Campus and multi-site meta layer for v2.0: a world map with sites, climates and power prices. Full simulation only for the active site; other sites run a statistical model. Floors inside a building are the step before.

### Topic 7: Customers who talk back

**M:** Customers today are uptime meters. Real ones open tickets, order cross-connects, visit, audit you, renew or leave.
**C:** A ticket queue is a great calm-time activity, and it is our walk-in feature grown up.
**M:** And SLA tiers: 99.9% is cheap, 99.99% needs 2N. That ties redundancy to money.
**C:** Renewals give a mid-term goal across shifts. Churn gives loss without bankruptcy.

> **Decision D7.** Customer 2.0: ticket queue (cross-connects, remote hands, tours, audits), SLA tiers tied to the redundancy level, satisfaction, renewals and churn, compliance audits (ISO 27001 / SOC 2 style, simplified) as contract gates.

### Topic 8: Nights, on-call, and incident command

**M:** You skip every night. In real life the night shift is where heroes are made.
**C:** Night skip exists because nights were boring. We can make *one* night per chapter matter.
**M:** On-call pager: something wakes you at 03:00, you have a skeleton crew, you decide: fix now, or hold until morning. Then a proper incident flow: declare, assign an incident commander, communicate to customers, resolve, write the review.
**C:** As a short, scripted-feeling sequence, not a new full system. And the post-mortem we already have becomes the last step.

> **Decision D8.** Night rota and on-call: a night crew you staff, a pager event at most once per night, and a light incident-command flow (declare → assign → update customers → resolve → review). Night skip stays for quiet nights.

### Topic 9: Economy and the board

**M:** A manager game without capex feels thin. Building a hall is a ten-year bet.
**C:** Spreadsheets kill phones. One screen, once a quarter.
**M:** Capex for infrastructure with depreciation, opex for staff and power, a loan or investor option. A board review every game month: hit the targets or lose budget.
**C:** The board review is a great "report card" beat, like the shift report one level up.

> **Decision D9.** Economy 2.0: capex vs opex, depreciation, financing, power contract choice (fixed vs spot), and a monthly board review with three targets. One screen, readable on a phone.

### Topic 10: What we will not do

**C:** Scope check. What do we refuse?
**M:** Real vendor names. Real security exploits. Tier certification paperwork.
**C:** Multiplayer with servers: we stay serverless. Async only, via shared codes.
**M:** And never more than two new systems per chapter. That guardrail saved v1.

> **Decision D10.** Out of scope for v2: real brands, real exploit techniques, real-time multiplayer, accounts or a backend. The "≤ 2 new systems per chapter" rule and the bot pacing guardrails stay mandatory.

---

# Part III: PRD v2.0

## 1. Vision

**From the server room to the AI factory.** You start in a closet and end up running a campus of halls in several climates, including a liquid-cooled AI hall. You make the decisions a real data center manager makes: redundancy, risk, capacity, people, power and money. You still feel it on a phone in an 8-minute shift.

### 1.1 Pillars (v1 pillars kept, two added)

1. **Readable chaos.** Every problem is visible, every outage traceable to a signal. *(v1)*
2. **Send the right person.** The core verb stays dispatching people. *(v1)*
3. **Prevention beats cure.** Maintenance, tests and redundancy pay off. *(v1)*
4. **One new idea at a time.** At most two new systems per chapter, enforced by tests. *(v1)*
5. **Plays in 8 minutes on a phone.** Shifts of 4–9 real minutes. *(v1)*
6. **Risk is a choice.** *(new)* Planned work, redundancy levels and contracts are bets the player makes, not only random events.
7. **Real lessons, honest simplifications.** *(new)* Every mechanic maps to a real practice, explained in the Ops Handbook. Simplifications are stated, not hidden.

### 1.2 Audience

- **Core (v1):** casual management players on phones and desktops, 12+.
- **New in v2:** IT and data center professionals and students, who want a game that respects the job. They are the word-of-mouth engine (team channels, training sessions).

## 2. Scope overview

| ID | System | Expert gap | Arrives in | New systems in that chapter |
|---|---|---|---|---|
| F1 | Redundancy: A/B feeds, dual PSU, N/N+1/2N, SPOF view | R1 | Ch6 | 1 |
| F2 | Change management: change cards, windows, freezes | R2 | Ch6 | 1 |
| F3 | NOC and remote hands | R4 | v1.1 (all chapters from Ch2) | upgrade, not a system |
| F4 | Capacity planning (DCIM panel) | R7 | Ch7 | 1 |
| F5 | Sustainability: live PUE, free cooling, green power | R5 | Ch7 | 1 |
| F6 | AI racks and liquid cooling | R6 | Ch8 | 1 |
| F7 | Customer 2.0: tickets, SLA tiers, renewals, audits | R8 | Ch9 (tickets from v1.2) | 1 |
| F8 | Nights, on-call, incident command | R9 | Ch9 | 1 |
| F9 | Backup power 2.0: realistic UPS, ATS, fuel | R3, R10 | v1.1 (Ch5 rebalanced) | refinement |
| F10 | Campus and multi-site meta map | R11 | Ch10 / v2.0 | 2 (sites, summary model) |
| F11 | Economy 2.0: capex, financing, board review | R12 | Ch10 / v2.0 | (paired with F10) |
| F12 | Supply chain: lead-time shocks, RMA, vendors | n/a | events from v1.3 | refinement |
| F13 | Ops Handbook (in-game glossary and lessons) | education | v1.1 | content |
| F14 | Platform: sim message keys, worker sim, scenario files | tech | v1.1–v1.3 | tech |

## 3. Feature specifications

Each feature lists: why (expert), the fun hook (PM), mechanics, UI, acceptance criteria. Numbers are starting points for tuning with the bot and playtests.

### F1. Redundancy done right

**Why.** Real servers are dual-corded and real halls have A/B feeds. Redundancy is the central design choice of a data center.
**Fun hook.** Outages become chains you can see coming ("running on one leg"). Redundancy is a visible investment with a visible payoff.

**Mechanics**
- Each rack gets two power feeds (A and B) from PDUs. Each server has 1 or 2 PSUs (models in the catalog). Dual-PSU servers stay up if one PSU or one feed fails.
- PDU failures and feed maintenance can take a whole feed down. Single-corded servers on that feed go down.
- Cooling redundancy: a cooling zone is N (just enough), N+1 (one spare unit) or 2N. Losing a unit in N+1 is a warning, in N it is heat.
- Dual top-of-rack switches (optional upgrade per rack): one switch failure no longer isolates the rack.
- **SPOF view** (new map overlay, next to heat and power): highlights anything whose single failure causes an outage.
- **Carry-over.** Existing PSU failures in Ch0–Ch5 stay as they are. Redundancy arrives in Ch6 as "the upgrade to grown-up infrastructure", explained by the mentor.

**UI.** Rack view shows feed A/B lamps and PSU count per server. A "1 leg" badge on servers with a failed PSU or feed. SPOF overlay button.

**Acceptance**
- A dual-PSU server survives a single PSU failure and a single feed loss (tests).
- The SPOF overlay marks exactly the components whose removal reduces live capacity (property test on random layouts).
- Bot: with N+1 power and cooling, a scripted feed failure causes zero SLA minutes; with N it causes an outage.

### F2. Change management

**Why.** Most real outages happen during planned work. Managing risk of change is a core competence.
**Fun hook.** The player chooses when to take risks. Calm time gets meaningful planning.

**Mechanics**
- **Change cards** appear from customers, vendors and the player: firmware upgrades, PDU maintenance, cooler replacement, capacity installs. Each has a benefit (e.g. fewer hangs, more capacity), a duration, a required role, and a **risk %**.
- Risk drops with: a maintenance window (night or weekend), a rested and skilled technician, a rollback plan (costs time), redundancy (N+1 makes PDU work safe), and the ops projects (labels, cable tidy).
- A failed change produces an incident linked to the change ("caused by change #12"), and the post-mortem says so.
- **Freeze policies:** "Read-only Friday" and "Launch freeze" toggles: fewer change incidents, but changes pile up and customers wait.
- Planned-work incidents replace part of the random failure rate, so total incident load stays inside the pacing guardrails (§8).

**UI.** A "Changes" section in the Alarms tab (calendar strip for today and tonight). Change card: what, benefit, risk %, risk factors with checkmarks, schedule buttons ("now", "tonight 23:00", "Saturday").

**Acceptance**
- Risk formula is a pure function with unit tests for every factor.
- Bot that schedules changes in windows with rollback has ≥ 50% fewer change-caused incidents than one that runs them immediately.
- Engagement guardrails hold: quiet daytime ≤ 50% target, no stretch > 90 real seconds.

### F3. NOC and remote hands

**Why.** Remote management handles most soft failures without walking.
**Fun hook.** Fewer taps per incident on phones. A satisfying upgrade tree.

**Mechanics** (activates the unused `remote` feature flag)
- NOC level 1: remote reboot of hung servers from the alarm card (no walk). Costs a licence per day.
- Level 2: remote diagnostics: a degraded disk shows which disk, which reduces swap time.
- Level 3: remote firmware: firmware projects and change cards run from the NOC, risk unchanged.
- Physical work (disks, PSUs, cables, coolers, generator) still needs a person on site.

**Acceptance.** Remote reboot clears a hang in ≤ 2 game minutes without a technician job. Actions per minute drop by ≥ 15% in Ch3–Ch5 with NOC level 1 (bot measurement).

### F4. Capacity planning (DCIM panel)

**Why.** Forecasting headroom and avoiding stranded capacity is the manager's main job.
**Fun hook.** Signing a contract becomes a spatial and power puzzle with a clear preview.

**Mechanics**
- Headroom per resource: space (U), power (per feed and per room), cooling (per zone), network (Gbps). The first resource to run out is flagged.
- **Contract fit preview:** before signing, the DCIM shows where the servers would go and which resource it would exhaust.
- **Stranded capacity:** power or space that cannot be used because another resource ran out (e.g. empty U with no power left). Shown in the panel, costs rent.
- Forecast line: demand growth of current customers over the next 7 game days.

**UI.** New "Capacity" view inside the Infra tab (no new tab: the phone tab bar stays at 6). A bar per resource, a "fit" overlay on the map when previewing a contract.

**Acceptance.** Fit preview placement equals what an automatic install would do (test). Stranded capacity is computed and unit tested.

### F5. Sustainability

**Why.** PUE, water and carbon are measured at board level.
**Fun hook.** Efficiency saves money; green customers pay more.

**Mechanics**
- **Live PUE** = total facility power / IT power. Cooling power depends on load, outside temperature and setpoint. UPS and distribution losses added. Replaces the fixed 1.8.
- **Free cooling:** an economiser upgrade uses outside air when it is cold, cutting cooling power (site climate matters, see F10).
- **Setpoint:** raise the cold-aisle setpoint (saves energy, raises failure risk slightly; ASHRAE-style safe range explained in the Handbook).
- **Containment:** hot-aisle containment upgrade (builds on the aisles system): fewer recirculation losses.
- **Green power:** sign a renewable power contract (fixed price, higher or lower than grid depending on site). **Heat reuse** to a neighbour (late upgrade, small income).
- **Green customers:** contracts with an ESG clause (PUE below X, renewable share above Y), better pay.

**UI.** PUE gauge in the HUD from Ch7. Energy section in the Infra tab.

**Acceptance.** PUE between 1.1 and 2.2 for any valid state (property test). Free cooling lowers PUE only when outside temperature is below the threshold. The ★★★ goal "PUE ≤ 1.35" is reachable by the bot with upgrades and not without.

### F6. AI racks and liquid cooling

**Why.** High-density GPU racks are the defining shift of the decade.
**Fun hook.** Huge revenue, huge risk, a new look.

**Mechanics**
- GPU rack model: 40–100 kW, needs direct-to-chip liquid cooling. Air cooling cannot hold it.
- **CDU** (coolant distribution unit) feeds a loop of racks. Incidents: pump failure (loop loses flow → thermal runaway in minutes), leak (must isolate the loop: shuts the racks), filter/strainer clog.
- New role: **Mechanical/liquid technician** (or extend HVAC tech with a "liquid" skill; decided in tuning).
- AI customers: training jobs (steady 100% load) and inference (spiky). Penalties per minute are huge, but so is revenue.
- Power interplay: one AI contract can use a full feed. The fit preview (F4) becomes essential.

**UI.** Blue glowing pipe overlay, flow and temperature on the loop, isolate valve button.

**Acceptance.** Pump failure without redundancy leads to thermal shutdown within 5–10 game minutes; with an N+1 CDU there is no shutdown. Performance: 60 fps on a throttled phone with the full Ch8 map.

### F7. Customer 2.0

**Why.** Real customers open tickets, renew, leave and audit.
**Fun hook.** Calm-time work with relationships; loss without bankruptcy.

**Mechanics**
- **Ticket queue** (grows out of walk-in requests): cross-connect orders (network engineer, earns a fee), remote-hands requests, customer tours (need escort), audit evidence requests.
- **SLA tiers:** 99.9% (cheap), 99.95%, 99.99% (needs N+1 power and cooling for that customer's racks). The tier sets price and penalty.
- **Satisfaction** per customer (0–100): moves with SLA, ticket speed and incidents. Drives **renewal** (at contract end) and **churn**.
- **Compliance audits** (simplified, generic names): an auditor visits, checks logs, access and maintenance records. Passing unlocks enterprise contracts.

**Acceptance.** Satisfaction and renewal are pure functions with tests. A customer with satisfaction ≥ 70 renews in ≥ 80% of seeds; ≤ 30 churns in ≥ 80%.

### F8. Nights, on-call, incident command

**Why.** Night operations and incident handling are core ops.
**Fun hook.** One memorable "3 a.m." moment per chapter instead of skipping every night.

**Mechanics**
- **Night rota:** choose who stays on nights (costs a premium). Empty nights are allowed: then everything waits for the pager.
- **Pager:** at most one night event per night (director-controlled). Choice: wake up and handle it now (fatigue next day) or hold until 06:00 (risk grows).
- **Incident command flow** (for major incidents): declare → assign commander (a person, removed from other work) → update customers (three message choices, affect satisfaction) → resolve → review (the existing post-mortem, now with a quality score).
- Night skip stays automatic when there is no pager event.

**Acceptance.** No more than one pager event per night (test). Average night still costs ≤ 30 real seconds at night-skip speed when no event fires.

### F9. Backup power 2.0

**Why.** UPS runtime is 5–15 minutes in reality; the ATS and fuel are classic failure points.
**Fun hook.** A tighter, scarier storm.

**Mechanics**
- UPS runtime retuned to 8–15 minutes at full load. Generator start (3 min) becomes tense.
- **ATS** (automatic transfer switch): can fail to transfer (more likely when not maintained). Manual transfer by an electrician.
- **Fuel:** 24–48 game hours of fuel. Refuelling contract (cost per day) or emergency delivery during long outages.
- **Load test** as a change card (F2): a monthly test under load, with a small risk of causing a transfer problem.

**Acceptance.** Ch5 remains winnable by the prepared bot and blackout-prone for the negligent bot (existing tests updated).

### F10. Campus and multi-site

**Why.** Growth from room to campus to regions is the operator's career and the player's fantasy.
**Fun hook.** "What next" after Ch5 has a big answer.

**Mechanics**
- **World map** with 3–5 site slots. Each site: climate (free-cooling hours, heatwave and storm risk), power price and carbon intensity, land cost, latency to customer regions.
- **Active site** runs the full simulation. **Other sites** run a summary model: daily revenue, an incident probability based on their redundancy and staffing levels, and automatic Shift Lead handling. Major incidents at other sites raise a pager alert and let you jump there.
- **Floors and halls:** within a site, unlock new halls (the "single floor" of v1 becomes "a hall").
- Customers can ask for **multi-site** contracts (two sites for disaster recovery), which ties sites together.

**Acceptance.** Switching sites is instant (≤ 100 ms) and deterministic. The summary model's revenue and incident rate stay within ±10% of the full simulation over 7 game days for the same configuration (calibration test using the bot).

### F11. Economy 2.0

**Mechanics**
- **Capex** for infrastructure (racks, coolers, UPS, generators, halls) with straight-line depreciation; **opex** for staff, power, network, licences.
- **Financing:** a loan (interest) or investor money (higher board targets).
- **Power contract:** fixed price or spot (cheaper on average, spikes during heatwaves).
- **Board review** every game month (about every 4–5 shifts): three targets (EBITDA, uptime, PUE or growth). Hitting them unlocks budget and the next site. Missing them twice ends the run (replaces "bankruptcy" as the main fail state in late chapters).

**UI.** One board-review screen, phone-first, styled like the shift report.

**Acceptance.** Depreciation and financing are unit tested. The board review never needs more than one screen at 375 × 667.

### F12. Supply chain

- Lead-time shocks as events ("chip shortage: server deliveries ×3 for 2 days").
- RMA: failed parts can be returned for credit (a small logistics task).
- Two vendors per part class: cheaper with more failures vs dearer and reliable (generic names).

### F13. Ops Handbook

- An in-game glossary that unlocks entries as systems appear: RAID, PUE, N+1, ATS, hot/cold aisles, change freeze, MTTR, and so on. Each entry has a one-line "in the game" and a one-line "in real life", including the stated simplifications (Part I §4).
- Linked from mentor tips and post-mortems ("Learn more").
- Educational packs: a "classroom" mode with chosen chapters and no failures from random seeds (deterministic scenarios) for trainers.

### F14. Platform work

- **Sim message keys.** Simulation log lines move from English sentences to `{key, params}`. The v0.9 fragment translator stays as a fallback. Required before adding a third language.
- **Simulation in a Web Worker** once the active site exceeds ~60 racks, keeping the UI thread free. The deterministic step contract does not change.
- **Save v7** with migrations from v6. Multi-site state is a list of sites; the v1 save becomes "site 1".
- **Scenario files** (JSON): maps, events, objectives. Used for chapters, the classroom mode and a later scenario editor.
- **Opt-in local telemetry** (no backend): session length, chapter funnel, quit points, kept in the browser and exportable for playtests. Nothing is sent anywhere.
- **Share codes** for async co-op "on-call handover": export a save as a compact code, a friend continues the shift.

## 4. Campaign v2

v1 chapters 0–5 stay (light retuning for F3 and F9). Five new chapters, each with at most two new systems.

| Ch | Title | New systems | Signature event | ★★★ idea |
|---|---|---|---|---|
| 6 | **Grown-up Infrastructure** | Redundancy (F1), change management (F2) | A PDU fails during planned maintenance on feed B | Zero downtime through a feed failure and no change-caused incident |
| 7 | **The Efficiency Drive** | Capacity planning (F4), sustainability (F5) | A green customer will sign only if PUE drops below 1.4 by Friday | PUE ≤ 1.35 and no stranded capacity |
| 8 | **AI Factory** | Liquid cooling and GPU racks (F6) | A CDU pump fails during a training run | No thermal shutdown on the liquid loop |
| 9 | **The Long Night** | Customer 2.0 (F7), on-call and incident command (F8) | A 03:00 pager cascade during a compliance audit week | Pass the audit and keep every customer above 70 satisfaction |
| 10 | **Campus** | Multi-site (F10), economy 2.0 (F11) | Two sites, one heatwave, one board review | Hit all three board targets |

Events and modes:
- **New event: "Black Friday"** (after Ch7): demand ×3, change freeze in force, a flood of tickets.
- **Sandbox 2.0:** pick a site climate, redundancy level and AI on/off; endless with board reviews.
- **Daily Challenge 2.0:** adds Ch6–Ch9 maps and new modifiers (chip shortage, frozen changes, green customer).

## 5. Progression and meta

- **Career titles** extended: Intern → Junior Sysadmin → Sysadmin → Senior Engineer → Ops Manager → Director of Operations → VP Infrastructure → CTO (with the existing nightmare-win gate).
- **Achievements:** +15 tied to the new systems (e.g. "Two Legs Good": survive a feed loss with zero downtime; "Frozen Solid": a whole week with a change freeze and no incident; "1.2 Club": PUE ≤ 1.2).
- **Handbook completion** as a light collection goal.
- **Prestige:** after Ch10, "new campus" restarts with a perk (e.g. a pre-tested generator, one free site).

## 6. UX

- **Tab bar stays at 6 tabs on phones.** New systems live inside existing tabs: Changes in Alarms, Capacity and Energy in Infra, Tickets in Clients, Board in Goals.
- **Overlays:** heat, power, SPOF, liquid loop, fit preview. One button cycles; long-press opens a picker.
- **World map** as a new full-screen view from the pause menu and the top bar site name.
- **Every new interaction passes the phone touch test** (controls ≥ 44 px, taps survive live refreshes), as v0.7 micro-games did.
- **E-ink:** all new overlays get pattern-based variants.
- **Accessibility:** axe-core clean on every new screen (keep the v1.0 bar); colour is never the only signal.

## 7. Technical architecture changes

| Area | Change | Why |
|---|---|---|
| State | `GameState` gains `sites[]`; current fields become `sites[0]` | Multi-site (F10) |
| Simulation | Optional Web Worker host for `step()`; same deterministic contract | Performance at 60–200 racks |
| Content | Chapters and scenarios as JSON files validated at build time | Classroom mode, editor later |
| i18n | Message keys + params in the sim; fragment translator kept as fallback | Third language, fewer gaps |
| Save | v7 migration; save size budget ≤ 500 KB | Larger state |
| Tests | New property tests (SPOF, PUE range, risk formula), calibration test for the summary model | Correctness of new systems |
| Telemetry | Local, opt-in, exportable JSON | Playtests without a backend |

## 8. Pacing and difficulty guardrails (extended)

All v1 guardrails stay in CI. New ones:

| Guardrail | Target |
|---|---|
| Shift length (1×, Sysadmin) | 4–9 real minutes in every chapter |
| Quiet daytime | ≤ 50% target, ≤ 70% hard limit |
| Actions per minute with automation | ≤ 1.6× the Ch2 baseline, all chapters |
| Change-caused + random incidents per game day | within ±20% of the Ch5 level in Ch6–Ch9 |
| Bot ★★★ rate | ≤ 20% per chapter |
| Pager events | ≤ 1 per night |
| Board review screen | fits 375 × 667 without scrolling |
| Performance | 60 fps on a 4× CPU-throttled phone profile with the biggest map |

## 9. Release plan

| Release | Theme | Contents | Exit criteria |
|---|---|---|---|
| **v1.1 "Remote Hands"** ✅ shipped (message keys deferred) | Quick wins | NOC and remote reboot (F3), backup power 2.0 retune (F9), Ops Handbook v1 (F13), local telemetry (F14); sim message keys moved to v1.2 | Ch5 tests updated ✓; Handbook covers every v1 system ✓ (see §12) |
| **v1.2 "Two Legs"** | Redundancy | Dual PSU, A/B feeds, N+1 cooling, SPOF view (F1); ticket queue v1 (F7 partial) | SPOF property tests; bot feed-failure test |
| **v1.3 "Change Advisory Board"** | Risk | Change management (F2), supply chain events (F12), Chapter 6 | Change-risk tests; guardrails hold in Ch6 |
| **v1.4 "Efficiency Drive"** | Planning | DCIM capacity (F4), live PUE and free cooling (F5), Chapter 7, Black Friday event | PUE property tests; Ch7 ★★★ bot-gated |
| **v1.5 "AI Factory"** | Density | Liquid cooling and GPU racks (F6), Chapter 8 | Thermal runaway tests; 60 fps on throttled phone |
| **v1.6 "The Long Night"** | People | Customer 2.0 complete (F7), nights and incident command (F8), Chapter 9 | Renewal/churn tests; ≤ 1 pager per night |
| **v2.0 "Hyperscale"** | Scale | Campus and multi-site (F10), economy 2.0 (F11), Chapter 10, Sandbox 2.0, share codes, worker sim | Summary-model calibration ±10%; §10 metrics in a 20-player playtest |

Each release keeps the v1 discipline: tests first, bot guardrails in CI, phone e2e, auto-deploy, PRD results section.

## 10. Success metrics (v2)

| Metric | Target |
|---|---|
| Tutorial completion | > 80% (unchanged) |
| Ch5 → Ch6 continuation | > 60% of players who finish Ch5 |
| Median session length (mobile) | 8–12 minutes |
| D7 / D30 return (PWA installs) | 20% / 8% |
| Ch10 completion | > 15% of starters |
| "Unfair" outages (no prior signal) | ~0, now including change-caused incidents (always shown with their risk %) |
| Handbook entries opened | ≥ 5 per player who reaches Ch6 |
| Expert credibility | ≥ 4 / 5 average from a panel of 5 data center professionals ("feels like the job") |
| Performance | 60 fps at 200 racks on a mid-range phone |

All playtest metrics come from the opt-in local telemetry export, gathered by hand from testers (no backend).

## 11. Risks and open questions

| Risk | Mitigation |
|---|---|
| Realism turns into homework | Every system ships with a fun hook and a money consequence; bot guardrails on quiet time and APM; cut anything that fails a playtest |
| Complexity overload in late game | ≤ 2 new systems per chapter (test), automation for routine work (Shift Lead, NOC), SPOF and fit overlays do the analysis visually |
| Phone performance with bigger maps | Worker sim, summary model for inactive sites, sprite bitmaps (as in v0.6) |
| Save migration bugs | Migration tests for every save version from v1 onward |
| Scope creep (v2 is large) | Releases v1.1–v1.6 ship standalone value; v2.0 multi-site is the only "big bang" |
| No human playtest so far | v1.1 ships local telemetry first; a 20-player test gates v2.0 |

**Open questions**
1. Liquid cooling: a new role, or a skill on the HVAC tech? (Decide in v1.5 tuning.)
2. Does the board review replace bankruptcy entirely in late chapters, or add to it?
3. Should a third language (Spanish or German) come before or after v2.0?
4. Classroom mode: free for everyone, or a separate "training" entry point?
5. Multi-site: 3 sites or 5? (Performance and phone readability decide.)

## Appendix A: v1 → v2 mapping of expert gaps

| Gap | Feature | Release |
|---|---|---|
| R1 single PSU / single feed | F1 | v1.2 |
| R2 no change management | F2 | v1.3 |
| R3 UPS runtime too long | F9 | v1.1 |
| R4 no remote management | F3 | v1.1 |
| R5 fixed PUE, no sustainability | F5 | v1.4 |
| R6 no AI racks | F6 | v1.5 |
| R7 no capacity planning | F4 | v1.4 |
| R8 customers are SLA meters | F7 | v1.2 (tickets), v1.6 (full) |
| R9 no nights or on-call | F8 | v1.6 |
| R10 infinite fuel, no ATS | F9 | v1.1 |
| R11 one site | F10 | v2.0 |
| R12 no capex | F11 | v2.0 |

## Appendix B: parked for v2.x

Office cat in the data center (morale), visitor tours as a reputation event, weather forecast panel, second-hand hardware market, robots for disk swaps, scenario editor UI, seasonal events, a third language.

## 12. v1.1 "Remote Hands" results

- **NOC (F3)**, available from Chapter 2 and in Sandbox, three levels bought in the Shop tab: remote reboot ($1,500 + $60/day: a hung server reboots from the alarm card in 2 game minutes, no walking, and the Shift Lead uses it by itself), remote diagnostics ($2,500: disk swaps a third faster), remote firmware ($4,000: ops projects take half the time). Licences are charged daily.
- **Correction to the plan.** The plan expected actions per minute to drop by 15%. In practice a remote reboot is still one tap, so the tap count does not fall. The real gain is technician time and downtime (nobody has to walk to the rack), and the test now checks that the bot loses no uptime and still clears every hang.
- **Backup power 2.0 (F9)**: UPS batteries now bridge about 5 to 15 minutes (was about an hour); an **automatic transfer switch** can stick (15% if never exercised, 2% after a generator test) so the generator runs while the racks stay on battery until an electrician transfers the load; **fuel** burns while the generator carries the load (Ch5 starts with a half-empty tank, so the storm needs a refuel), low-fuel alarm, $400 refuel job, empty tank stops the generator.
- **Ops Handbook (F13)**: 18 entries, each with *In the game* and *In real life*, unlocking as systems appear; shown on the start screen (by progress) and in the pause menu (by chapter features); English and French; the tests require every system of the campaign to have an entry.
- **Local telemetry (F14)**: an opt-in play log (session, chapter start, chapter end with result and minutes) kept only in the browser, capped at 500 events, exportable as JSON from Settings; nothing is sent anywhere.
- **Deferred to v1.2**: simulation message keys (the v0.9 fragment translator stays).
- **Tests**: 353 unit tests (new: NOC, backup 2.0, Handbook, telemetry, translation coverage of the new texts) and the phone e2e (new session for the NOC, Handbook and fuel).
