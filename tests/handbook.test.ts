import { CHAPTERS, CHAPTER_ORDER } from '../src/data/chapters';
import { HANDBOOK, handbookFor } from '../src/data/handbook';
import { Telemetry, TELEMETRY_MAX } from '../src/ui/telemetry';
import { DEFAULT_SETTINGS } from '../src/ui/storage';
import { handbookSection, pauseMenu, settingsForm, startScreen, unlockedFeatures } from '../src/ui/views';
import { dailySpec } from '../src/sim/daily';
import { createGame } from '../src/sim/state';

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

describe('Ops Handbook', () => {
  it('every entry teaches both sides: in the game and in real life', () => {
    expect(new Set(HANDBOOK.map((h) => h.id)).size).toBe(HANDBOOK.length);
    for (const h of HANDBOOK) {
      expect(h.term.length).toBeGreaterThan(2);
      expect(h.game.length).toBeGreaterThan(30);
      expect(h.real.length).toBeGreaterThan(30);
    }
  });

  it('covers every system of the campaign (each chapter feature that matters has an entry)', () => {
    const all = new Set(CHAPTER_ORDER.flatMap((id) => CHAPTERS[id].features));
    for (const f of ['contracts', 'power', 'coolers', 'aisles', 'maintenance', 'network', 'fatigue', 'remote', 'backup'] as const) {
      expect(all.has(f)).toBe(true);
      expect(HANDBOOK.some((h) => h.unlock === f)).toBe(true);
    }
    expect(HANDBOOK.some((h) => h.unlock === 'cyber')).toBe(true);
  });

  it('unlocks as systems appear', () => {
    const early = handbookFor(createGame('ch0', 'sysadmin', 1).features).map((h) => h.id);
    const late = handbookFor(createGame('ch5', 'sysadmin', 1).features).map((h) => h.id);
    expect(early).toContain('sla');
    expect(early).not.toContain('ups');
    expect(late).toContain('ups');
    expect(late).toContain('noc');
    expect(late.length).toBeGreaterThan(early.length);
  });

  it('is shown on the start screen (by progress) and in the pause menu (by features)', () => {
    const extras = { daily: dailySpec('2026-12-03'), dailyBest: null, achievements: {} };
    const fresh = startScreen({}, DEFAULT_SETTINGS, false, extras);
    const veteran = startScreen({ ch0: { sysadmin: 3 }, ch1: { sysadmin: 3 }, ch2: { sysadmin: 3 }, ch3: { sysadmin: 3 }, ch4: { sysadmin: 3 } }, DEFAULT_SETTINGS, false, extras);
    expect(fresh).toContain('Ops Handbook');
    expect(veteran.match(/class="hb-list"/g)?.length).toBe(1);
    expect((veteran.match(/<details><summary><span class="pi">/g) ?? []).length).toBeGreaterThan((fresh.match(/<details><summary><span class="pi">/g) ?? []).length);
    expect(pauseMenu(createGame('ch5', 'sysadmin', 1), DEFAULT_SETTINGS)).toContain('Transfer switch (ATS)');
    expect(unlockedFeatures({})).toContain('shop');
    expect(handbookSection(['backup'])).not.toMatch(/undefined|NaN/);
  });
});

describe('opt-in local telemetry', () => {
  it('records nothing unless enabled, and nothing leaves the device', () => {
    let on = false;
    const store = mem();
    const tel = new Telemetry(store, () => on, () => 1000);
    tel.record('chapterStart', { chapter: 'ch1' });
    expect(tel.load()).toEqual([]);
    on = true;
    tel.record('chapterStart', { chapter: 'ch1' });
    tel.record('chapterEnd', { chapter: 'ch1', won: true, stars: 2 });
    expect(tel.load()).toHaveLength(2);
    const out = JSON.parse(tel.export());
    expect(out.summary).toEqual({ sessions: 0, chapterStarts: 1, chapterEnds: 1, wins: 1 });
    tel.clear();
    expect(tel.load()).toEqual([]);
  });

  it('keeps only the most recent events and survives broken storage', () => {
    const store = mem();
    const tel = new Telemetry(store, () => true);
    for (let i = 0; i < TELEMETRY_MAX + 20; i++) tel.record('tick', { i });
    const events = tel.load();
    expect(events).toHaveLength(TELEMETRY_MAX);
    expect(events[events.length - 1]!.data).toEqual({ i: TELEMETRY_MAX + 19 });
    const broken = new Telemetry({ getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); }, removeItem: () => { throw new Error('x'); } }, () => true);
    expect(() => broken.record('x')).not.toThrow();
    expect(broken.load()).toEqual([]);
    expect(() => broken.clear()).not.toThrow();
  });

  it('the settings form offers the play log and an export button only when on', () => {
    expect(settingsForm(DEFAULT_SETTINGS)).toContain('data-key="telemetry"');
    expect(settingsForm(DEFAULT_SETTINGS)).not.toContain('exportTelemetry');
    expect(settingsForm({ ...DEFAULT_SETTINGS, telemetry: true })).toContain('exportTelemetry');
  });
});
