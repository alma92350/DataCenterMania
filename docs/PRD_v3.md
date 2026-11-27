# DataCenterMania PRD v3: Phase 3 "Mastery"

Phase 2 (v2.0 to v2.9) built the deep simulation, the campus, localisation, tooling and polish. Phase 3 is about **mastery and reach**: more reasons to replay, more ways in for more players, and more ways for a player to see how they are doing. No new core simulation system is planned; every release reuses what exists.

Discipline unchanged: tests first, bot guardrails in CI, phone e2e, French, release notes, a PRD results section per release, `package.json` version bump.

| Release | Theme | Scope |
|---|---|---|
| **3.0 "Incident Replays"** | Replayability | Three stand-alone scenarios inspired by real outages (Dual-Feed Fiasco, Ransom Friday, Heat Dome), unlocked by the chapter they build on, with three-star goals |
| **3.1 "For Everyone"** | Access | Text size, reduced motion, high contrast and a colour-blind-safe palette in Settings, with a contrast test |
| **3.2 "The Advisor"** | Guidance | An Advisor card that reads the capacity, SPOF, backup and energy reports and suggests the next best action in plain words |
| **3.3 "Save Slots"** | Ownership | Three named save slots plus export and import of a save as a file |
| **3.4 "Four Seasons"** | Variety | Sandbox seasons: outdoor temperature, demand and heatwave odds change with the calendar |
| **3.5 "The Logbook"** | Progress | A career logbook: every finished run with chapter, difficulty, stars, uptime and profit, with records and trends |

Out of scope for Phase 3: a backend, accounts, real multiplayer, and anything that needs the 20-player playtest to decide.

Results sections follow, one per release.

## 3.0 "Incident Replays" results

- **Three scenarios**, each two days (two shifts) built on the hall of an existing chapter with a scripted run of incidents, and three-star goals:
  - *Dual-Feed Fiasco* (Chapter 6 hall): the A feed on Rack 1 fails at 10:00, the utility drops for an hour at 14:00, then the B feed on Rack 3 and another cut on day two. Stars: uptime 93%; uptime 98% with no blackout; uptime 99.7% with no server left on a single cord.
  - *Ransom Friday* (Chapter 5 hall plus cyber): phishing, a flood and a worm while a storm takes the utility for an hour. Stars: uptime 88%; three attacks blocked with no blackout; every attack blocked with $2,000 profit.
  - *Heat Dome* (Chapter 7 hall, 9 kW grid connection): 45°C outside, two dirty coolers, a drought that bans evaporative cooling, a 2.5× peak. Stars: uptime 94%; uptime 98% with no breaker trip; uptime 99.5% with no trip and an average PUE of 1.6 or better, which needs the setpoint and containment controls of v2.3.
- **Start screen**: an *Incident Replays* section with best stars; each card is locked until the chapter it replays is won. They are events, not part of the campaign order, so campaign unlocks and the *Architect* achievement are unchanged.
- **Balance**: with the default bot, 3 seeds each, every scenario is won in at least two of three runs and none reaches three stars (tested). All titles, intros, goals and incident messages have French.
- 5 new tests and an e2e.
