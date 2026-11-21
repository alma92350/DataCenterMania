import { createSandbox, DEFAULT_SANDBOX, sandboxDays, sandboxScore, SANDBOX_OBJECTIVES } from '../src/sim/sandbox';
import { advance } from '../src/sim/sim';
import { deserialize, serialize } from '../src/sim/save';
import { DEFAULT_SETTINGS, Persistence, isSandboxUnlocked } from '../src/ui/storage';
import { endScreen, sandboxCard, startScreen } from '../src/ui/views';
import { autopilot } from './autopilot';

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

describe('Sandbox / Endless mode', () => {
  it('has no end date and applies the chosen pressure', () => {
    const base = createSandbox({ ...DEFAULT_SANDBOX, cash: 1, incidents: 1 }, 'sysadmin', 1);
    const rich = createSandbox({ ...DEFAULT_SANDBOX, cash: 2, incidents: 2, cyber: false, ramp: false }, 'sysadmin', 1);
    expect(rich.cash).toBe(base.cash * 2);
    expect(rich.incidentMult).toBe(2);
    expect(rich.cyberRandom).toBeUndefined();
    expect(rich.features).not.toContain('cyber');
    expect(base.features).toContain('cyber');
    expect(base.cyberRandom).toBe(true);
    expect(base.rampPerDay).toBeGreaterThan(0);
    expect(base.endMinute).toBeGreaterThan(1_000_000);
  });

  it.each(['small', 'medium', 'large'] as const)('the %s floor starts and runs a week without crashing', (floor) => {
    const s = createSandbox({ ...DEFAULT_SANDBOX, floor }, 'sysadmin', 3);
    for (let i = 0; i < 7 * 1440 && s.progress.status === 'playing'; i++) {
      if (i % 30 === 0) autopilot(s, { auto: true });
      advance(s, 1);
    }
    expect(s.progress.status === 'playing' || s.progress.status === 'lost').toBe(true);
    expect(s.progress.status).not.toBe('won');
  });

  it('only ends by bankruptcy or reputation, never by the calendar', () => {
    const s = createSandbox(DEFAULT_SANDBOX, 'sysadmin', 5);
    advance(s, 20 * 1440, );
    expect(s.progress.status === 'playing' || s.progress.status === 'lost').toBe(true);
    if (s.progress.status === 'lost') expect(s.log.some((l) => /Bankrupt|reputation/.test(l.text))).toBe(true);
  });

  it('scores days, peak cash and attacks blocked, and has survival milestones', () => {
    const s = createSandbox(DEFAULT_SANDBOX, 'sysadmin', 1);
    const start = sandboxScore(s);
    s.cyber.blocked = 3;
    s.progress.peakCash += 2000;
    expect(sandboxScore(s)).toBe(start + 300 + 100);
    expect(SANDBOX_OBJECTIVES.map((o) => o.check(s))).toEqual([false, false, false]);
    s.minute += 8 * 1440;
    expect(sandboxDays(s)).toBeGreaterThanOrEqual(8);
    expect(SANDBOX_OBJECTIVES[0].check(s)).toBe(true);
  });

  it('is deterministic and survives save and load', () => {
    const run = () => { const s = createSandbox(DEFAULT_SANDBOX, 'sysadmin', 9); advance(s, 2 * 1440); return s; };
    expect(serialize(run())).toBe(serialize(run()));
    const back = deserialize(serialize(run()));
    expect(back.sandbox).toEqual(DEFAULT_SANDBOX);
  });

  it('random attacks arrive with hackers on, never with them off', () => {
    const on = createSandbox(DEFAULT_SANDBOX, 'sysadmin', 2);
    let hit = false;
    for (let i = 0; i < 6 * 1440 && !hit; i++) { advance(on, 1); hit = on.cyber.attack !== null || on.cyber.history.length > 0; }
    expect(hit).toBe(true);
    const off = createSandbox({ ...DEFAULT_SANDBOX, cyber: false }, 'sysadmin', 2);
    advance(off, 6 * 1440);
    expect(off.cyber.history.length + (off.cyber.attack ? 1 : 0)).toBe(0);
  });

  it('unlocks after Startup Colo, remembers settings and the high score', () => {
    expect(isSandboxUnlocked({})).toBe(false);
    expect(isSandboxUnlocked({ ch2: { sysadmin: 1 } })).toBe(true);
    const store = new Persistence(mem());
    expect(store.recordSandbox({ score: 5000, days: 4 })).toBe(true);
    expect(store.recordSandbox({ score: 3000, days: 3 })).toBe(false);
    expect(store.loadSandboxBest()).toEqual({ score: 5000, days: 4 });
    const a = store.loadSettings();
    a.sandbox.cash = 2;
    expect(DEFAULT_SETTINGS.sandbox.cash).toBe(1); // defaults are never mutated
  });

  it('the start card lets you pick the floor and the sliders; the end screen shows the score', () => {
    expect(sandboxCard(DEFAULT_SANDBOX, false, null)).toContain('🔒');
    const html = sandboxCard(DEFAULT_SANDBOX, true, null);
    for (const k of ['floor', 'cash', 'incidents', 'cyber', 'ramp']) expect(html).toContain(`data-key="${k}"`);
    expect(html).toContain('data-action="sandbox"');
    expect(startScreen({ ch2: { sysadmin: 1 } }, DEFAULT_SETTINGS, false, { daily: { id: '2026-12-03', number: 14, chapter: 'ch1', modifier: 'viral', seed: 1 }, dailyBest: null, achievements: {} })).toContain('Sandbox');
    const s = createSandbox(DEFAULT_SANDBOX, 'sysadmin', 1);
    s.progress.status = 'lost';
    const end = endScreen(s, { newAchievements: [], newBest: true });
    expect(end).toContain('Sandbox over');
    expect(end).toContain('New high score');
    expect(end).not.toMatch(/undefined|NaN/);
  });
});
