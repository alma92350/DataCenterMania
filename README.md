# DataCenterMania

A top-down data center management game for desktop and mobile browsers. You start with one rack in a broom closet and keep machines alive, keep customers happy, and send the right technician to the right rack at the right moment.

**Play it:** https://alma92350.github.io/DataCenterMania/ (redeployed automatically: every push runs the tests, builds, and publishes to the `gh-pages` branch)

Free, no ads, works offline (PWA). See the full design in [`docs/PRD.md`](docs/PRD.md).

## Play / develop

```bash
npm install
```

```bash
npm run dev        # local dev server
```

```bash
npm test           # unit + simulation + balance tests (Vitest)
```

```bash
npm run build      # typecheck + production build into dist/
```

```bash
npm run e2e        # builds, then drives the real game in Chromium (desktop + phone)
```

```bash
node e2e/perf-probe.mjs   # mobile responsiveness probe: frame times and slow-finger taps on a throttled phone
```

**Kindle Scribe / e-ink:** the game switches to a black-and-white, motion-free display on e-ink screens (auto-detected). Force it with `?eink=1` or under Settings → Display.

Controls: tap/click a rack to open it, drag to pan, pinch/scroll to zoom. Keys: `Space` pause, `1`/`2`/`3` speed, `H` heat map, `P` power map, `Esc` close.

## What's in this version (PRD MVP)

| Area | Implemented |
|------|-------------|
| Chapters | 0 *The Closet* (a 6-minute, one-shift tutorial), 1 *Server Room*, 2 *Startup Colo*, 3 *Colocation Floor* (aisles, HVAC), 4 *Launch Week* (network, fatigue), each with ★/★★/★★★ goals; at most two new systems per chapter (tested) |
| Shifts (v0.4) | Each game day is a shift with a goal and bonus, a 22:00 report card, and "Sleep until 06:00" with a night recap; progress autosaves at every shift |
| Live money (v0.4) | Revenue and costs credited every game hour with +$ pops, per-contract margin, HUD goal chip and today's earnings |
| Calm-time play (v0.4) | Walk-in customer requests (timed favours) and ops projects (cable tidy, labels, firmware) with lasting bonuses |
| Mastery (v0.5) | Hard ★★★ constraints per chapter, 14 achievements, career title (Intern → CTO), date-seeded Daily Challenge with a modifier and a share line, outage post-mortems with one-tap remedies |
| Automation (v0.6) | Hire a Shift Lead from Chapter 2: auto-dispatch of routine alarms and requests; idle specialists do preventive work; the bot's workload stays flat from Ch2 to Ch4 |
| Juice (v0.6) | Speech bubbles, SLA-perfect streak, confetti on a clean shift, screen shake on criticals (off for reduced motion and e-ink) |
| Enterprise DC (v0.8) | Chapter 5: storms cut the grid; UPS batteries, a generator you must test, and a new Electrician role keep the lights on |
| Hackers (v0.7) | Hacker Weekend event after Startup Colo: Script Kiddies and Captain Phish attack, you defend in three touch micro-games (or auto-defend at half strength) |
| Sandbox (v0.7) | Endless mode after Startup Colo: pick floor and pressure, play until bankruptcy, beat your high score |
| Art (v0.6) | Hand-drawn SVG portraits for the manager and every hire role, illustrations for every part, cooler and place; pure-greys versions for e-ink; unique project names for every contract |
| Mobile | Taps survive live refreshes (DOM morphing + press guard), finger-sized map zoom with forgiving taps, landscape side panel, tips always reachable |
| Display | Colour (desktop/phone) and e-ink (Kindle Scribe): monochrome palette, shapes and patterns for meaning, no animation, throttled redraws |
| Difficulty | Intern, Sysadmin, Senior Engineer, On-Call Nightmare (unlocked by beating Ch3); multipliers in `src/data/difficulty.ts` |
| Simulation | Demand curves, SLA with onboarding grace + setup fee, rack power budgets and breakers, thermal model with hot-weather cooler derating, temperature-driven failures (×2 per +10 °C), escalating alarms (disk → data loss), incident director |
| Chapter 3 systems | Hot/cold aisles (rack facing, exhaust recirculation, rotate racks), CRAC units with clogging filters and breakdowns, top-of-rack switch failures, ISP uplinks with bandwidth limits and fiber cuts, second-route uplink |
| Technicians | Roles (HW, HVAC, network) with the manager as a slow generalist, fatigue, breaks, morale, quitting, coffee machine upgrades, hire/fire, skills, traits, A* pathfinding, visible job chain (storage → rack → work), botched jobs, job queues |
| Economy | Daily settlement (revenue, penalties, salaries, electricity with PUE, rent), shop with delivery times, contract offers that scale with reputation |
| UX | Progressive disclosure, mentor tips, colour-blind-safe alarm shapes, auto-pause, night skip, heat/power overlays, responsive desktop sidebar / mobile bottom sheet, autosave + continue |

## Architecture

```
src/
  core/      seeded serializable RNG, time model (1 real s = 3 game min at 1×)
  data/      content as data: catalog, difficulty table, chapters (maps, events, objectives), customers, tips
  sim/       pure deterministic simulation, no DOM
    types.ts        GameState: plain JSON, so save/load/replay is trivial
    sim.ts          step(): fixed 1-game-minute tick, system order is part of the contract
    demand, power, thermal, failures, alarms, director, jobs, economy, events, objectives
    commands.ts     the only way the player changes the world: validated, returns {ok|error}
    selectors.ts    derived read-only queries
  render/    camera math + Canvas 2D renderer (reads state, never writes it)
  ui/        app shell, views (state → HTML strings), clock pacing, persistence, WebAudio
tests/       Vitest suites, written test-first, plus an autopilot bot used for balance tests
e2e/         Playwright smoke test against the production build
```

Design rules:

- **The simulation is headless and deterministic.** Same seed and same commands give the same world. That is tested, so bugs reproduce and balance is measurable.
- **One write path.** UI → `applyCommand` → state. Renderer and views only read.
- **Pacing is a test too.** `tests/engagement.test.ts` fails the build if the tutorial gets long, shifts stop fitting a session, or quiet time grows (PRD §19).
- **Balance is a test.** `tests/sim.test.ts` plays every chapter with an autopilot "competent player" bot across seeds and difficulties, and asserts it can win (and that doing nothing loses). Tuning numbers live in `src/data`.
- **Progressive disclosure is data.** Chapters declare feature flags (`hire`, `contracts`, `power`, `buildRack`, …). Commands and panels respect them.
