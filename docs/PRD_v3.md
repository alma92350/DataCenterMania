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

## 3.1 "For Everyone" results

- **Four settings** under *Accessibility* in the pause-menu Settings, saved with the other settings and applied at start-up: **text size** (normal 15 px, large 17, extra large 20; all sizes scale from the root), **reduce motion** (stops every animation and transition, and the screen shake; on top of the browser's own reduced-motion preference, which was already honoured), **high contrast** (black background, white text and borders), and **colour-blind safe colours** (blue, yellow, orange and pink for OK, warning, major and critical instead of green, amber, orange and red).
- **Tested, not just styled**: a WCAG contrast function checks that the default palette has text at 7:1 or better and status colours at 4.5:1 on both surfaces, and that high contrast plus colour-blind colours reaches 7:1 for text, muted text and every status colour; a test applies and reverts the settings on the page.
- All labels in French. Severity is also carried by icons and badges (not colour alone), unchanged from v1.0.
- 6 new tests.

## 3.2 "The Advisor" results

- **`advice(state)`** (`src/sim/advisor.ts`) reads the reports the game already keeps and returns up to three suggestions, most urgent first, each with the tab where it is done: untested generator, low fuel, worn batteries, no electrician (backup power); servers on a single power cord (redundancy); the most loaded of space, power, cooling and network at 90% or more; dirty cooler filters; high PUE with free cooling affordable or the setpoint at its default; unhappy customers; low community goodwill. Rules only fire when their system exists, so the first chapters show nothing. It is a pure function with no new simulation state.
- **UI**: an *Advisor* card at the top of the Alarms tab, with ❗ for urgent items and a *Go* button that opens the tab. Numbers and labels are translated through the wildcard templates of v2.2; all text has French.
- 7 new tests (silence early on, each rule, fixes clearing advice, rendering, French).

## 3.3 "Save Slots" results

- **Three save slots** next to the autosave, stored in the browser as a small meta record (chapter, game time, date) and the full game. The pause menu's *Save slots and files* section can save, overwrite, load and delete a slot; the start screen lists the same slots to load. A full browser storage is reported instead of silently failing.
- **Save files**: *Download save file* in the pause menu writes the game as JSON; *Load a save file* (pause menu and start screen) reads one. It is the same format as a slot, validated on load (a non-save file shows a message and changes nothing). Together with the hand-over codes of v2.0 this covers moving a game between devices.
- Not offered during a site visit (the headquarters is saved instead, never the temporary hall).
- 5 new tests: slots are independent of the autosave, a loaded slot continues identically to the original, bad slot numbers, full storage and corrupt data, round-trip of the file format, UI on both screens, French.

## 3.4 "Four Seasons" results

- **Sandbox seasons** (a *Seasons* On/Off option on the Sandbox card, off by default so existing sandboxes do not change): a 28-day year of four 7-day seasons. The hall's air is the floor's own air plus the season: spring −1°C, summer +4°C, autumn −2°C, winter −7°C. Because coolers lose capacity in hot air and free cooling needs cool outside air, summer squeezes the hall and winter and autumn reward efficiency work.
- **Events from the dice** (seeded, so saves replay identically): in summer a heatwave (+7°C for two days, 18% a day) and in winter a holiday rush (1.5× traffic for ten hours, 25% a day), using the existing heat and surge machinery. A season icon sits next to the chapter label on the clock, and each new season is announced in the log.
- No new system for the campaign: the state gains one optional field (`season`), saves load unchanged.
- 7 new tests: off by default, the turn of the seasons, temperatures by season, events only in their season, save and reload continuing identically, a chosen starting season, UI and French.
