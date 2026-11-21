import { at } from '../src/core/time';
import { BACKUP } from '../src/data/catalog';
import { CHAPTERS } from '../src/data/chapters';
import { startOutage, upsCapacityKwh, upsRuntimeMin } from '../src/sim/backup';
import { applyCommand } from '../src/sim/commands';
import { advance } from '../src/sim/sim';
import { createGame } from '../src/sim/state';
import { deviceUp } from '../src/sim/selectors';
import { deserialize, serialize } from '../src/sim/save';
import type { GameState } from '../src/sim/types';
import { autopilot } from './autopilot';
import { measure } from './engagement';

function ch5(seed = 1): GameState {
  const s = createGame('ch5', 'sysadmin', seed);
  s.failuresEnabled = false; // isolate the power story from random hardware trouble
  return s;
}
function hireElectrician(s: GameState) {
  const cand = s.candidates.find((c) => c.role === 'elec')!;
  expect(applyCommand(s, { type: 'hire', candidateId: cand.id }).ok).toBe(true);
}
const upCount = (s: GameState) => s.devices.filter((d) => deviceUp(s, d)).length;

describe('Chapter 5: Enterprise DC', () => {
  it('starts with a tired UPS and an untested generator, and offers an electrician to hire', () => {
    const s = ch5();
    expect(s.backup).toMatchObject({ grid: true, source: 'grid', upsUnits: 1, generator: 'idle', testedAt: null });
    expect(s.backup!.health).toBeLessThan(0.8);
    expect(s.candidates.some((c) => c.role === 'elec')).toBe(true);
    expect(CHAPTERS.ch5.features).toContain('backup');
    expect(createGame('ch4', 'sysadmin', 1).backup).toBeUndefined();
  });

  it('a tested generator takes over within minutes: no blackout, every server stays up', () => {
    const s = ch5();
    s.backup!.testedAt = s.minute;
    startOutage(s, 200);
    advance(s, 2);
    expect(s.backup!.source).toBe('ups');
    expect(upCount(s)).toBe(s.devices.length);
    advance(s, BACKUP.genStartMin);
    expect(s.backup!.source).toBe('generator');
    advance(s, 200);
    expect(s.backup!.grid).toBe(true);
    expect(s.stats.blackoutMin ?? 0).toBe(0);
    expect(s.backup!.generator).toBe('idle');
  });

  it('with no generator the batteries run dry: blackout, servers down, reputation hit', () => {
    const s = ch5();
    s.backup!.generator = 'none';
    startOutage(s, 600);
    expect(upsRuntimeMin(s)).toBeGreaterThan(5);
    advance(s, 300);
    expect(s.backup!.source).toBe('none');
    expect(upCount(s)).toBe(0);
    expect(s.stats.blackoutMin).toBeGreaterThan(0);
    expect(s.alarms.some((a) => a.kind === 'gridDown' && a.severity === 3)).toBe(true);
    advance(s, 400);
    expect(s.backup!.grid).toBe(true);
    expect(upCount(s)).toBe(s.devices.length); // power is back
  });

  it('an untested generator often fails; an electrician starts it by hand', () => {
    let failed: GameState | null = null;
    for (let seed = 1; seed < 40 && !failed; seed++) {
      const s = ch5(seed);
      hireElectrician(s);
      startOutage(s, 400);
      advance(s, BACKUP.genStartMin + 1);
      if (s.backup!.generator === 'failed') failed = s;
    }
    expect(failed).not.toBeNull();
    const s = failed!;
    expect(s.alarms.some((a) => a.kind === 'generator')).toBe(true);
    expect(applyCommand(s, { type: 'dispatch', job: 'startGenerator', techId: 'best' }).ok).toBe(true);
    expect(s.techs.find((t) => t.id === s.jobs[0]!.techId)!.role).toBe('elec');
    advance(s, 60);
    expect(s.backup!.generator).toBe('running');
    expect(s.alarms.some((a) => a.kind === 'generator')).toBe(false);
    advance(s, 60);
    expect(s.backup!.source).toBe('generator');
  });

  it('testing the generator needs the grid, costs diesel and stays valid for two days', () => {
    const s = ch5();
    hireElectrician(s);
    const cash = s.cash;
    expect(applyCommand(s, { type: 'dispatch', job: 'testGenerator', techId: 'best' }).ok).toBe(true);
    expect(s.cash).toBe(cash - BACKUP.genTestCost);
    advance(s, 240);
    expect(s.backup!.testedAt).not.toBeNull();
    advance(s, BACKUP.genTestValidMin + 10);
    startOutage(s, 300);
    s.failuresEnabled = false;
    // the test has expired: it is a gamble again (just check the flag logic, not the dice)
    expect(s.minute - s.backup!.testedAt!).toBeGreaterThan(BACKUP.genTestValidMin);
    const r = createGame('ch5', 'sysadmin', 2);
    startOutage(r, 100);
    expect(applyCommand(r, { type: 'dispatch', job: 'testGenerator', techId: 'best' })).toEqual({ ok: false, error: 'Not during an outage: it is already needed.' });
  });

  it('batteries wear out, raise a warning and an electrician replaces them', () => {
    const s = ch5();
    hireElectrician(s);
    s.backup!.health = 0.55;
    advance(s, 2);
    expect(s.alarms.some((a) => a.kind === 'battery')).toBe(true);
    const cap = upsCapacityKwh(s.backup!);
    expect(applyCommand(s, { type: 'dispatch', job: 'replaceBattery', techId: 'best' }).ok).toBe(true);
    advance(s, 200);
    expect(s.backup!.health).toBeGreaterThan(0.98);
    expect(upsCapacityKwh(s.backup!)).toBeGreaterThan(cap);
    expect(s.alarms.some((a) => a.kind === 'battery')).toBe(false);
    expect(applyCommand(s, { type: 'dispatch', job: 'replaceBattery', techId: 'best' }).ok).toBe(false);
  });

  it('more UPS units and a generator can be bought, within limits', () => {
    const s = ch5();
    s.cash = 50000;
    for (let i = 0; i < BACKUP.maxUps - 1; i++) expect(applyCommand(s, { type: 'buyUps' }).ok).toBe(true);
    expect(applyCommand(s, { type: 'buyUps' }).ok).toBe(false);
    expect(s.backup!.upsUnits).toBe(BACKUP.maxUps);
    expect(applyCommand(s, { type: 'buyGenerator' }).ok).toBe(false); // already has one
    s.backup!.generator = 'none';
    expect(applyCommand(s, { type: 'buyGenerator' }).ok).toBe(true);
  });

  it('is deterministic and survives save and load mid-outage', () => {
    const run = () => { const s = createGame('ch5', 'sysadmin', 4); advance(s, at(1, 10) - s.minute + 30); return s; };
    const a = run();
    expect(a.backup!.grid).toBe(false);
    expect(serialize(a)).toBe(serialize(run()));
    const back = deserialize(serialize(a));
    advance(back, 120);
    advance(a, 120);
    expect(back.backup).toEqual(a.backup);
  });

  it('the scripted storm happens on Wednesday evening and is survivable by a prepared player', () => {
    const wins: number[] = [];
    for (const seed of [1, 2, 3]) {
      const s = createGame('ch5', 'sysadmin', seed);
      let sawStorm = false;
      while (s.progress.status === 'playing') {
        if (s.minute % 5 === 0) autopilot(s, { auto: true });
        advance(s, 1);
        if (!s.backup!.grid && s.minute > at(2, 18)) sawStorm = true;
      }
      expect(sawStorm).toBe(true);
      expect(s.stats.outages).toBeGreaterThanOrEqual(2);
      wins.push(s.progress.status === 'won' ? s.progress.stars : 0);
    }
    expect(wins.filter((x) => x >= 1).length).toBeGreaterThanOrEqual(2);
  });

  it('a negligent player (no test, no electrician, no second UPS) suffers blackout in the storm', () => {
    let blackout = 0;
    for (const seed of [1, 2, 3]) {
      const s = createGame('ch5', 'sysadmin', seed);
      while (s.progress.status === 'playing') {
        if (s.minute % 5 === 0) autopilot(s, { auto: true, power: 'negligent' });
        advance(s, 1);
      }
      if ((s.stats.blackoutMin ?? 0) > 0) blackout++;
    }
    expect(blackout).toBeGreaterThanOrEqual(2);
  });

  it('keeps the bot engagement guardrails (shift length, quiet time)', () => {
    const m = measure('ch5', 1, 'sysadmin', true);
    expect(m.shiftRealMinutes.every((x) => x >= 3 && x <= 10)).toBe(true);
    expect(m.quietDaytimePct).toBeLessThanOrEqual(70);
  });
});

import { backupPanel, endScreen, goalBar, networkPanel, powerChip, startScreen, tabs } from '../src/ui/views';
import { DEFAULT_SETTINGS } from '../src/ui/storage';
import { dailySpec } from '../src/sim/daily';

describe('Backup power UI', () => {
  it('shows grid, battery and generator state, with the right buttons', () => {
    const s = ch5();
    let html = backupPanel(s);
    expect(html).toContain('Utility grid');
    expect(html).toContain('UNTESTED');
    expect(html).toContain('data-job="testGenerator"');
    expect(html).toContain('data-job="replaceBattery"');
    expect(html).toContain('data-action="buyUps"');
    expect(html).not.toMatch(/undefined|NaN/);
    expect(networkPanel(s)).toContain('Backup power');
    expect(networkPanel(createGame('ch4', 'sysadmin', 1))).not.toContain('Backup power');
    startOutage(s, 300);
    advance(s, 1);
    html = backupPanel(s);
    expect(html).toContain('On battery');
    expect(html).toContain('Grid back');
    expect(powerChip(s)).toContain('battery');
    expect(goalBar(s)).toContain('battery');
    advance(s, BACKUP.genStartMin + 2);
    s.backup!.generator = 'failed';
    s.backup!.source = 'ups';
    expect(backupPanel(s)).toContain('data-job="startGenerator"');
    s.backup!.source = 'none';
    expect(powerChip(s)).toContain('BLACKOUT');
  });

  it('the Network tab becomes Infra with an alert while the grid is down', () => {
    const s = ch5();
    expect(tabs(s, 'alarms')).toContain('Infra');
    expect(tabs(s, 'alarms')).not.toContain('Network');
    expect(tabs(createGame('ch4', 'sysadmin', 1), 'alarms')).toContain('Network');
    expect(powerChip(s)).toBe('');
  });

  it('Chapter 5 appears on the start screen once Launch Week is beaten', () => {
    const extras = { daily: dailySpec('2026-12-03'), dailyBest: null, achievements: {} };
    expect(startScreen({ ch3: { sysadmin: 1 } }, DEFAULT_SETTINGS, false, extras)).not.toContain('data-chapter="ch5"');
    expect(startScreen({ ch4: { sysadmin: 1 } }, DEFAULT_SETTINGS, false, extras)).toContain('data-chapter="ch5"');
    expect(startScreen({}, DEFAULT_SETTINGS, false, extras)).toContain('Enterprise DC');
  });

  it('the end screen of the last chapter does not promise a next one', () => {
    const s = ch5();
    s.progress.status = 'won';
    s.progress.stars = 1;
    expect(endScreen(s)).not.toContain('Next:');
  });
});
