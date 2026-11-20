import { at, MINUTES_PER_DAY } from '../src/core/time';
import { createGame } from '../src/sim/state';
import { advance, step } from '../src/sim/sim';
import { applyCommand } from '../src/sim/commands';
import { serialize, deserialize } from '../src/sim/save';
import { CHAPTERS } from '../src/data/chapters';
import { autopilot } from './autopilot';
import type { ChapterId, DifficultyId, GameState } from '../src/sim/types';

function play(chapter: ChapterId, difficulty: DifficultyId, seed: number, bot = true): GameState {
  const s = createGame(chapter, difficulty, seed);
  while (s.progress.status === 'playing') {
    if (bot && s.minute % 5 === 0) autopilot(s);
    step(s);
  }
  return s;
}

describe('simulation loop', () => {
  it('advances time and settles each midnight', () => {
    const s = createGame('ch1', 'sysadmin', 3);
    const start = s.minute;
    advance(s, MINUTES_PER_DAY);
    expect(s.minute).toBe(start + MINUTES_PER_DAY);
    expect(s.reports).toHaveLength(1);
    expect(s.reports[0]!.revenue).toBeGreaterThan(0);
  });

  it('fires scripted chapter events once, at their time', () => {
    const s = createGame('ch0', 'sysadmin', 1);
    advance(s, at(4, 9, 41) - s.minute);
    expect(s.progress.firedEvents).toContain('tutorialDisk');
    expect(s.devices[0]!.faults).toContain('disk');
    expect(s.log.some((l) => l.kind === 'tip')).toBe(true);
    advance(s, at(4, 18, 1) - s.minute);
    expect(s.ambient).toBe(34);
    expect(s.coolers[0]!.on).toBe(false);
  });

  it('chapter 0 offers a contract during the tutorial', () => {
    const s = createGame('ch0', 'sysadmin', 1);
    advance(s, at(4, 12) - s.minute);
    expect(s.contracts.some((c) => c.status === 'offered')).toBe(true);
  });

  it('generates daily offers in chapter 2', () => {
    const s = createGame('ch2', 'sysadmin', 1);
    const before = s.contracts.length;
    advance(s, MINUTES_PER_DAY);
    expect(s.contracts.length).toBeGreaterThan(before - 1);
    expect(s.log.some((l) => l.text.startsWith('New contract offer'))).toBe(true);
  });

  it('stops at the chapter end and evaluates objectives', () => {
    const s = play('ch0', 'sysadmin', 1);
    expect(s.minute).toBe(CHAPTERS.ch0.endMinute);
    expect(['won', 'lost']).toContain(s.progress.status);
    const before = s.minute;
    step(s);
    expect(s.minute).toBe(before);
  });

  it('is fully deterministic for a seed (same inputs -> same world)', () => {
    const a = play('ch1', 'sysadmin', 77);
    const b = play('ch1', 'sysadmin', 77);
    expect(serialize(a)).toEqual(serialize(b));
  });

  it('loses when cash stays negative for two midnights', () => {
    const s = createGame('ch1', 'sysadmin', 1);
    s.cash = -100000;
    advance(s, MINUTES_PER_DAY * 2 + 10);
    expect(s.progress.status).toBe('lost');
  });

  it('flags attention for auto-pause on serious alarms', () => {
    const s = createGame('ch1', 'sysadmin', 1);
    s.devices[0]!.faults.push('psu');
    s.failuresEnabled = false;
    step(s);
    expect(s.attention).toBeNull(); // fault without alarm: nothing raised
    s.racks[0]!.powerBudgetW = 1;
    step(s);
    expect(s.attention?.severity).toBe(3);
  });
});

describe('balance: a competent player beats every chapter (autopilot bot)', () => {
  const cases: [ChapterId, DifficultyId][] = [
    ['ch0', 'intern'], ['ch0', 'sysadmin'], ['ch1', 'sysadmin'], ['ch1', 'senior'], ['ch2', 'sysadmin'],
  ];
  it.each(cases)('%s on %s', (chapter, difficulty) => {
    let wins = 0;
    for (const seed of [1, 2, 3]) if (play(chapter, difficulty, seed).progress.status === 'won') wins++;
    expect(wins).toBeGreaterThanOrEqual(2);
  });

  it('doing nothing in chapter 1 does not win', () => {
    const s = play('ch1', 'sysadmin', 1, false);
    expect(s.progress.status).toBe('lost');
  });
});

describe('save / load', () => {
  it('round-trips a game mid-chapter and keeps simulating identically', () => {
    const a = createGame('ch2', 'sysadmin', 11);
    advance(a, 700);
    const b = deserialize(serialize(a));
    advance(a, 900);
    advance(b, 900);
    expect(serialize(b)).toEqual(serialize(a));
  });

  it('rejects garbage and wrong versions', () => {
    expect(() => deserialize('not json')).toThrow();
    expect(() => deserialize(JSON.stringify({ version: 999 }))).toThrow(/version/);
  });

  it('commands after the end are refused', () => {
    const s = play('ch0', 'intern', 1);
    expect(applyCommand(s, { type: 'order', part: 'disk', qty: 1 }).ok).toBe(false);
  });
});
