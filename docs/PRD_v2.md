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
| **v1.2 "Two Legs"** ✅ shipped | Redundancy | Dual PSU, A/B feeds, SPOF view (F1); cross-connect tickets (F7 partial); Chapter 6 arrives early with redundancy only | SPOF property tests ✓; bot feed-failure test ✓ (see §13) |
| **v1.3 "Change Advisory Board"** ✅ shipped | Risk | Change management (F2), supply chain events (F12), long-lead equipment (P2), resilience levels (P14), Chapter 6 gets its second system | Change-risk tests ✓; guardrails hold in Ch6 ✓ (see §15) |
| **v1.4 "Efficiency Drive"** ✅ shipped | Planning | DCIM capacity (F4), live PUE, free cooling, cooling modes, two water meters, grid cap and queue (F5, P1, P3), out-of-band link (P8), heat reuse (P12), Chapter 7, Black Friday event | PUE property tests ✓; Ch7 ★★★ bot-gated ✓ (see §16) |
| **v1.5 "AI Factory"** ✅ shipped | Density | Liquid cooling and GPU racks (F6), effective training time (P6), density ladder (P5), battery buffer (P10), liquid training (P13), Chapter 8 | Thermal runaway tests ✓ (see §17) |
| **v1.6 "The Long Night"** ✅ shipped | People | Customer 2.0 (F7), nights, on-call and incident command (F8), Chapter 9 | Renewal/churn tests ✓; ≤ 1 pager per night ✓ (see §18) |
| **v2.0 "Hyperscale"** ✅ shipped (see §19 for what was cut) | Scale | Campus layer (F10), economy 2.0 and board (F11), goodwill (P4), training vs inference (P7), Chapter 10, Sandbox 2.0 with Campus and Frontier floors, hand-over codes, eras (P16) | Summary-model results tested; §10 metrics still need a 20-player playtest |

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

## 13. v1.2 "Two Legs" results

- **Legs model (F1).** Every rack has feeds A and B. A server is *single-corded* (leg A only) or *dual-corded* (A and B). A dead power supply takes out leg A. A server is up if any leg works, so: single-corded dies with feed A or its PSU, dual-corded survives one failure and goes down only when both legs are gone. The chain "one leg fails, nobody fixes it, then the other goes" is scripted in Chapter 6 (Wednesday 15:00 feed B, 17:00 feed A on the same rack).
- **Chapter 6 "Grown-up Infrastructure"** (unlocked by Enterprise DC): the existing servers are single-corded; six spare power supplies are in stock; a *Dual-cord* job (hardware tech, 25 min, one PSU) gives a server two legs; new installs arrive dual-corded. An electrician repairs a failed feed (40 min). ★ 97% and $2,000, ★★ 99.5% and $6,000, ★★★ every serving server dual-corded, no blackout and $20,000 profit (the default bot gets it in 0 of 2 seeds; the dual-cord bot reaches about $17k).
- **SPOF view.** A third map overlay (key `O`, or the overlay button cycles heat → power → SPOF → off): red racks lose servers if one feed fails, amber racks have fewer than two coolers in reach, green racks are safe. It is computed honestly: each feed is taken down in turn and the servers that stop are counted (a property test checks it against a brute-force copy on 25 random layouts).
- **UI.** Rack view: feed A/B lamps with a repair button, a *one leg / two legs* chip per server and a *Dual-cord* button. The Infra tab gets a Redundancy card (dual-corded count, single points of failure, spare PSUs, one-tap *Dual-cord next server*, failed feeds with repair).
- **Ticket queue v1.** Where the network exists, 30% of customer requests are *cross-connect orders*: triple reward, 120 minutes, only a network engineer (the Shift Lead sends one). Satisfaction, renewals and tours stay for v1.6.
- **Handbook** gains *A/B feeds and dual power supplies* and *Single point of failure*; French translations for everything new.
- **Deferred**: N+1 cooling as an explicit setting (the SPOF view already flags single-cooler racks), dual top-of-rack switches, simulation message keys (now v1.3).
- **Tests**: 377 unit tests (new: legs, feeds, dual-cording, scripted chain, bot with and without dual-cording, SPOF property test, overlay cycle, cross-connect tickets) and the phone e2e (new session).

## 14. Field-guide proposals (pending decision)

A second review, inspired by the *Data Centers: Today and Tomorrow* field guide, produced 16 proposals (site power cap and grid queue, long-lead equipment, water ↔ power slider, community goodwill, a density tech tree, effective training time for AI customers, training vs inference, out-of-band network, event cards and more). They are scored and placed in the release plan in [`PRD_v2_field_guide_proposals.md`](PRD_v2_field_guide_proposals.md). It also resolves open question 1 of §11: liquid cooling becomes a **skill gained by training an existing technician**, not a new role.

**Decisions recorded (27 Nov 2026):** power labels move to MW by *row scale* from Chapter 7/8; a queue day is one game day (about 6–9 real minutes), with major items taking 2–5 days; off-site water is modelled next to on-site water; the orbital epilogue is a late Sandbox *Frontier* mode, not a release. Details in §5 of the addendum.

## 15. v1.3 "Change Advisory Board" results

- **Change cards (F2)** in the Alarms tab, from Chapter 6. Four kinds: *Firmware upgrade* (a rack's servers hang 60% less), *PDU maintenance* (that rack's feed failures become far rarer), *Cooler overhaul* (cooler back to full health), *Vendor capacity drop* (a spare server). Two cards arrive every morning (never more than three open) and expire after two days.
- **Risk model** (pure, unit-tested): base risk × named factors. Night window ×0.6, rollback plan ×0.6 (costs 30 extra minutes), rested specialist ×0.85 or tired / no specialist ×1.3, PDU work on a rack where every server has two legs ×0.4, labels or tidy cables ×0.85; clamped to 1–95%. Each card shows its factors, and the *Now* and *Tonight 23:00* buttons show the risk of each option, so the lesson is visible.
- **Outcomes.** A failed change causes a real incident (hung server, feed A down, cooler broken, or a damaged delivery) and says so in the log ("Cause: a planned change"). Careful scheduling (night plus rollback) fails less than reckless scheduling (tested on the bot).
- **Change freeze**: one switch. Scheduled work waits, *Now* is refused, and unanswered requests expire with a small reputation cost.
- **Incident budget**: Chapter 6's random failure rate drops from 0.8 to 0.65, because planned work now supplies part of the incident load.
- **Long-lead equipment (P2)**: from Chapter 6, UPS units (2 queue days) and generators (3) are ordered, not bought; the Infra tab and the shift report show the ETA, and *Expedite* costs half the price and saves a day. Earlier chapters keep instant purchases and small parts keep their delivery times. A queue day is one game day (see the addendum).
- **Supply events (F12, first three)**: a chip shortage triples part deliveries for two days, a delivery delay slips equipment orders, and failed disks and PSUs earn a 40% RMA credit.
- **Resilience levels (P14)**: I to IV with a checklist in the Goals tab (II: every serving server has two legs; III: two planned changes done cleanly plus a tested generator and two UPS units; IV: no single point of failure, two coolers in reach, two uplinks and a serviced transfer switch). Chapter 6's ★★★ is now *Resilience level III, no blackout, $20,000 profit*.
- **Handbook** gains *Change management*, *Lead times and returns (RMA)* and *Resilience levels*; everything is translated into French.
- **Not done**: the remaining event cards (drought, moratorium, winter storm, new chip generation) wait for the systems they depend on; translatable simulation messages move to v1.4.
- **Tests**: 400 unit tests and the phone e2e (new session for the change cards).

## 16. v1.4 "Efficiency Drive" results

- **Chapter 7 "The Efficiency Drive"** (unlocked by Grown-up Infrastructure, five game days). Two new systems, as the rule says: *capacity* (grid connection cap, DCIM view, queue) and *energy* (PUE, cooling modes, water).
- **Live PUE.** Cooling electricity is now load-based: IT heat ÷ COP (evaporative 4.0, dry 2.8, dry in a hot spell ×0.8) plus fan power per cooler, minus free-cooling savings, plus 6% distribution losses. PUE lands between about 1.2 and 1.6 depending on choices (a property test checks 1.1 to 2.2 on random states). Chapters before 7 keep the old fixed-cooler model, so their balance is unchanged. Outside air follows a daily wave (about 8 to 20°C, hotter in a heatwave); the **free cooling** upgrade ($5,000) saves up to 80% of cooling electricity when it is cold.
- **Cooling mode and water.** *Evaporative* (cheap electricity, on-site water) or *Dry* (almost no water, more electricity). Two meters, per addendum §5.3: **on-site** water (cooling) and **off-site** water (embedded in the electricity, 8 litres per kWh on the grid mix, 1 with a renewable contract). With evaporative cooling off-site water is about 4 to 5 times on-site; dry cooling cuts the first and raises the second. A **drought** (Chapter 7, day 3) bans evaporative cooling and switches the site to dry automatically. A **renewable contract** costs 15% more electricity.
- **Grid connection and queue (P1).** The facility cannot draw more than its connection (10 kW at the start). A warning at 90%, and after 5 minutes over the cap the **main breaker trips** and everything is down until an electrician resets it (and it trips again if load is not shed). Upgrades ($4,000, +4 kW, up to three) take **2 queue days** and can be expedited. In the bot test, the unplanned bot trips the breaker or loses stars, the planned one never does.
- **Capacity card and fit preview (F4).** Space, power, cooling and network with the resource that runs out first, **stranded space** (free U in racks without power headroom), and a **fit line on every contract offer** (fits, or what it would exhaust).
- **ESG customer.** *Verdant Cloud* (Chapter 7, day 1) pays well, but its SLA fails for every minute the site PUE is above 1.55 (heat reuse counts as a 0.1 credit).
- **Out-of-band link (P8).** A cut management link (Chapter 7, day 2) blocks remote reboots until a network engineer repairs it.
- **Heat reuse (P12).** $6,000, earns about 50 cents per kWh of IT heat and gives the ESG credit.
- **Black Friday.** Day 4 morning: demand ×1.8 for 20 hours and a change freeze.
- **Units (decision 1).** Row scale: from Chapter 7 power is displayed at ×10 (a tile is a row of racks), through one `formatPower` function (W, kW, MW). The simulation is untouched.
- **Goals.** ★ 97% uptime and $2,000; ★★ 99.5%, average PUE ≤ 1.5 and $5,000; ★★★ average PUE ≤ 1.35, no breaker trip and $12,000 (the default bot gets ★★ on most seeds and ★★★ on none).
- **Handbook** gains PUE, on-site and off-site water, free cooling and heat reuse, grid connection and the queue, and out-of-band management; all translated into French.
- **Not done**: setpoint and containment settings, goodwill and moratoriums (campus), translatable simulation messages (now v1.5).
- **Tests**: 425 unit tests (new: formatting, PUE and water model, breaker, grid queue, drought, out-of-band, ESG, capacity, UI, bot balance) and the phone e2e (new session).

## 17. v1.5 "AI Factory" results

- **Chapter 8 "AI Factory"** (unlocked by The Efficiency Drive). Two new systems: *liquid cooling* and *AI customers*.
- **Liquid loop.** Racks can be converted to a coolant loop; each **coolant unit** carries 8 kW of heat. While the loop keeps up, liquid racks sit near 35°C. With too little capacity the target temperature climbs by 12°C per missing kW with a 4-minute time constant, so a pump failure with no spare shuts GPU racks down within a few minutes (tested). With a spare unit (N+1) nothing happens. A **leak** isolates and shuts down its rack until repaired. Pump and leak repairs by an untrained specialist take twice as long; a *Train* action (a few hundred dollars, a few hours) fixes that, resolving open question 1 as a skill, not a role.
- **GPU servers.** A *Fit GPUs* job turns a 2U server in a liquid rack into a GPU server: five times the power, two and a half times the compute (no new model or art needed, so the slot layout and installs stay unchanged).
- **Effective training time (P6).** The AI contract (*Neuron Labs*, $12,000 a day) is judged on the share of time the cluster did useful work. Interruptions arrive faster than linearly with cluster size and each costs 20 minutes. **Checkpointing** cuts the cost to 6 minutes, **auto-restart** makes interruptions 40% rarer.
- **Density ladder (P5, first tiers).** *Rear-door coolers* (air racks carry 40% more) then *Cold plates* (unlocks liquid racks), plus *Checkpointing*, *Auto-restart* and the **Battery buffer** (soaks up 60% of a synchronized power spike, P10).
- **Events.** A coolant pump seizes (day 2), a synchronized spike (day 2 and 4), a winter storm leaks a liquid line (day 3), and silent data corruption on a GPU server (day 3): remote diagnostics (NOC level 2) catches it, otherwise the customer finds it first and reputation drops. Reboot clears it. A new chip generation event is deferred.
- **UI.** The Infra tab gets a *Liquid loop and AI* card (units, heat against capacity, effective time, interruptions, repair banners, coolant-unit order with ETA and expedite, the ladder, training), rack view shows *On the liquid loop* with *Convert* and *Fit GPUs*, and GPU or corrupted chips on servers.
- **Goals.** ★ take the AI contract with 97% uptime and 85% training time; ★★ 90% training time and $6,000; ★★★ 95%, no thermal shutdown, two coolant units and $40,000 profit (the planned bot gets ★★ and never ★★★; a bot that ignores the AI customer loses).
- **Handbook** gains *Liquid cooling*, *Training, inference and effective time*, *Synchronized power spikes* and *Silent data corruption*; all in French.
- **Balance note.** The default "manual" bot earns far more profit than the Shift-Lead bot, so the ★★★ profit targets of Chapters 7 and 8 were raised ($25,000 and $40,000) to keep the ≤ 20% rule.
- **Tests**: 442 unit tests and the phone e2e (new session). Test chapter lists now derive from `CHAPTER_ORDER` so adding a chapter no longer churns the achievement and title tests.

## 18. v1.6 "The Long Night" results

- **Chapter 9 "The Long Night"** (unlocked by AI Factory), cumulative with the earlier systems. Two new systems: *customer relationships* and *nights*.
- **Satisfaction (0 to 100).** Each customer starts at 70. A day with the SLA met gives +3, a breach −12; finishing a customer request +4, letting one expire −6. Moods show as faces on the contract cards.
- **Renewals and churn.** At the end of a term the chance to renew is (satisfaction − 40) ÷ 50, clamped to 0..1: a renewing customer stays 4 more days at a 10% higher price; one that leaves costs reputation. Two Chapter 9 contracts end after 3 days so the decision is felt.
- **Compliance audit** (Thursday morning): four checks (generator tested, every serving server dual-corded, no failed change, two UPS units and a serviced transfer switch). Three or more pass: reputation up. Fewer: reputation down and every customer −10 satisfaction. The result and checklist are shown in the Alarms tab.
- **Nights.** Add people to the **night rota** in the Team tab (they cost 50% more); everybody else is off duty from 22:00 to 06:00 and cannot take jobs. You (the manager) always can.
- **Pager.** Scripted for 03:00 on days 2 and 3 (one per night): *Call everybody in* (they are tired next day) or *Hold until morning* (the problem gets worse after an hour).
- **Incident command.** Any critical alarm opens a major incident: assign a **commander** and send an **honest / vague / silent** update. When critical alarms stay clear for 10 minutes the incident closes with a score 0 to 3 (commander, honest update, fixed within 2 hours). The score earns reputation, honest updates calm the customers who suffered (+3) and silence upsets them (−5).
- **Goals.** ★ uptime ≥ 97% and $2,000; ★★ pass the audit and average satisfaction ≥ 65; ★★★ audit passed, satisfaction ≥ 75, incident score ≥ 2 on average and $45,000 profit (the bot gets ★★).
- **Handbook** gains customer satisfaction and renewals, compliance audits, night shifts and on-call, and incident command; all in French. The Alarms tab shows the pager and incident cards, and the Team tab the rota toggle.
- **Not done**: SLA tiers priced by redundancy, customer tours, and cross-connect orders feeding satisfaction beyond the +4 request bonus.
- **Tests**: 460 unit tests (new: satisfaction, renewals, audit, rota gating, pager, incident scoring, UI, bot balance) and the phone e2e (new session).

## 19. v2.0 "Hyperscale" results, and what was cut

**Shipped**
- **Chapter 10 "Campus"** (unlocked by The Long Night; eight game days, two board reviews). Every system of Chapters 0 to 9 is on, plus two new ones: the *campus* and *finance*. Your hall is the headquarters; up to four other sites can be built.
- **Sites (F10, P7).** Four site types with their own climate (PUE), power price and latency: Nordic Fjord, Metro Edge, Desert Solar, Harbour Hub. Three tiers (edge 4 MW, enterprise 12 MW, regional 40 MW) with a build time in days and a capital cost. **Latency decides what a site sells**: only sites under 20 ms sell inference (60% of the mix, at a higher rate); far sites sell training. Utilisation fills up gradually; a *tenant walks away* event (day 4) knocks a young site back (P11).
- **Summary model.** Each remote site is simulated once a day: revenue from capacity, utilisation and customer mix; costs from power (climate × price × spot swing), staff and rent; incident chance cut by a bigger local team; an incident costs 65% of the day's revenue unless you *Send help* ($1,500, halves the damage).
- **Goodwill (P4).** A 0 to 100 meter: thirsty desert and noisy metro sites cost it daily, local staff and heat reuse in the hall earn it, a *community fund* buys 15 points. Below 25 the county declares a **moratorium** (no new builds) until 35; above 75 permits take a day less.
- **Economy 2.0 (F11).** Capex is booked and depreciated over 20 days; a loan ($50,000, 1.5% a day); an investor ($80,000, targets ×1.5); fixed or **spot** power (cheaper on average, swinging ±daily). Board profit is computed without capex, loans and grants.
- **Board review every three days**: profit ≥ $15,000, uptime ≥ 99%, PUE ≤ 1.45 or three live sites. All three: $15,000 grant. Two: patience. Fewer: a strike; two strikes end the run ("the board replaced you").
- **Goals.** ★ survive the first review with a live site; ★★ both reviews with two or more targets met and goodwill ≥ 40; ★★★ every target in both reviews, three live sites and no moratorium (the expanding bot gets ★ to ★★, never ★★★; an idle bot earns nothing).
- **Sandbox 2.0.** Two new floors: **Campus** (every system, endless, score adds live sites) and the speculative **Frontier** floor (addendum §5.4): an orbital cluster with **no technicians** (every physical command is refused), **launched spares** priced per kilogram (15 kg per repair at a launch price that starts at $2,700 and falls 4% a day to a $200 floor), and double the failure rate from radiation.
- **Hand-over codes (F14).** *Copy hand-over code* in the pause menu and *Resume from a hand-over code* on the start screen: the save, gzip-compressed when the browser allows, then base64url. A friend pastes it and continues the same deterministic game (tested to continue identically).
- **Eras (P16).** The chapter list is grouped into *Cloud warehouse* (0 to 5), *The AI factory approaches* (6 to 8) and *Energy-integrated compute* (9 to 10).
- **Handbook** gains site selection and latency, community goodwill, capex and the board, and fixed versus spot power; all in French.
- **Tests**: 486 unit tests and the phone e2e (new session).

**Deliberately cut or changed from the plan (honest list)**
- **No hands-on switching between sites.** The plan had one detailed site at a time with instant switching and a ±10% calibration against the full simulation. v2.0 ships the campus as a *management layer* over one fully simulated hall: remote sites use the summary model only. Switching and calibration would need the state split described in §7 and is the first item for v2.1.
- **No Web Worker.** Measured halls of 15 to 30 racks stay at 60 fps, so the worker was not needed yet. It stays in the plan for bigger halls.
- **No save v7.** The campus fields are optional, so existing saves load unchanged.
- **Not built**: a gigawatt site tier, the full density tech tree beyond the first tiers, setpoint and containment settings, translatable simulation messages, and the 20-player playtest that gates the §10 metrics.

## 20. v2.1 "Site Visit" results

- **Hands-on switching, in the form that fits the architecture.** Each live campus site now has a **Visit: play a shift** button. It flies you to a full simulated hall for that site: one shift (06:00 to 22:00), shaped by the site's climate (desert halls run hotter, Nordic ones cooler), its local team (each staff level cuts incident pressure), and sharing your cash. The headquarters is **frozen** while you are away (its clock does not move), so there is no two-timeline merge. The autosave always stores the headquarters, never the temporary hall.
- **Result.** Up to three stars: ★ uptime above 95%, ★★ uptime ≥ 99% with no critical alarm, ★★★ uptime ≥ 99.8% with no critical alarm and every incident fixed. On return the money you spent or earned carries over, the site is **tuned up** for one day per star (half the incident risk), its utilisation rises 3 points per star, goodwill rises, and pending incident alerts there are cleared. A bad shift changes nothing but your cash. *Come back early* from the pause menu leaves everything as it was.
- **Calibration against the full simulation.** The plan asked the summary model to match the full simulation. The measurable quantity is the chance of a serious incident per day: in a full hall played by the bot (6 seeds, 7 game days, no local team) 29% of days contain a critical alarm, while the summary model used 12%. It is now **29%**, and a test fails if the two ever drift apart by more than 10%. Revenue per megawatt is not calibrated, because the game-scale hall and the campus MW units are different scales by design.
- **Balance check.** With the higher incident rate the campus bot still wins Chapter 10 (staff upgrades and sending help matter more now).
- **Still not done**: a worker thread (not needed at current hall sizes), translatable simulation messages, a gigawatt tier, and the 20-player playtest.
- **Tests**: 493 unit tests (new: visit shape, isolation of the headquarters, result and tune-up, bad shift, tuned incidents, calibration, UI).

