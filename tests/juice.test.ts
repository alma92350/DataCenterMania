import { at } from '../src/core/time';
import { createGame } from '../src/sim/state';
import { step } from '../src/sim/sim';
import { applyCommand } from '../src/sim/commands';
import { applyFault } from '../src/sim/failures';
import { updateTechs } from '../src/sim/jobs';
import { bubbleLine, BUBBLE_LIFE } from '../src/sim/bubbles';
import { earnedAchievements } from '../src/sim/achievements';
import { shiftReportModal, goalBar } from '../src/ui/views';
import type { GameState, ShiftReport } from '../src/sim/types';

function quiet(ch: GameState['chapter'] = 'ch1'): GameState {
  const s = createGame(ch, 'sysadmin', 1);
  s.failuresEnabled = false;
  s.progress.firedEvents = ['*all*'];
  s.minute = at(0, 9);
  return s;
}

const says = (s: GameState) => s.fx.filter((f) => f.kind === 'say');

describe('speech bubbles', () => {
  it('a tech says something when starting work and when done, and "Oops" when botching', () => {
    const s = quiet();
    applyFault(s, s.devices[0]!, 'hung');
    applyCommand(s, { type: 'dispatch', job: 'reboot', deviceId: s.devices[0]!.id, techId: 'manager' });
    const tech = s.techs[0]!;
    const seen: string[] = [];
    for (let m = 0; m < 200 && s.jobs.length; m++) {
      updateTechs(s, 1);
      s.minute++;
      for (const f of says(s)) if (f.techId === tech.id && f.text && !seen.includes(f.text)) seen.push(f.text);
    }
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(seen.every((t) => t.length > 1 && t.length < 40)).toBe(true);
  });

  it('only one bubble per person at a time, and bubbles expire', () => {
    const s = quiet();
    applyFault(s, s.devices[0]!, 'hung');
    applyCommand(s, { type: 'dispatch', job: 'reboot', deviceId: s.devices[0]!.id, techId: 'manager' });
    for (let m = 0; m < 200 && s.jobs.length; m++) {
      updateTechs(s, 1);
      s.minute++;
      expect(says(s).filter((f) => f.techId === s.techs[0]!.id).length).toBeLessThanOrEqual(1);
    }
    s.minute += BUBBLE_LIFE + 200;
    step(s);
    expect(says(s)).toHaveLength(0);
  });

  it('lines are deterministic (no RNG) and vary by job', () => {
    const a = bubbleLine('swapDisk', 'start', 'j1');
    expect(bubbleLine('swapDisk', 'start', 'j1')).toBe(a);
    const lines = new Set(['reboot', 'swapDisk', 'replacePsu', 'resetBreaker', 'serviceCooler', 'repairUplink'].map((k) => bubbleLine(k as 'reboot', 'start', 'j1')));
    expect(lines.size).toBeGreaterThan(2);
    expect(bubbleLine('reboot', 'done', 'j1').length).toBeGreaterThan(1);
    expect(bubbleLine('reboot', 'oops', 'j1').length).toBeGreaterThan(1);
  });
});

describe('SLA-perfect streak', () => {
  it('counts clean hours in a row and resets on a miss, keeping the best', () => {
    const s = quiet();
    for (let m = 0; m < 3 * 60; m++) step(s);
    expect(s.streak.hours).toBeGreaterThanOrEqual(2);
    const before = s.streak.hours;
    const c = s.contracts[0]!;
    const devices = s.devices.filter((d) => d.contractId === c.id);
    for (const d of devices) d.faults.push('psu');
    for (let m = 0; m < 70; m++) step(s);
    expect(s.streak.hours).toBe(0);
    expect(s.streak.best).toBeGreaterThanOrEqual(before);
    for (const d of devices) d.faults = [];
    for (let m = 0; m < 3 * 60; m++) step(s);
    expect(s.streak.hours).toBeGreaterThanOrEqual(1);
    expect(s.streak.best).toBeGreaterThanOrEqual(before);
  });

  it('shows in the HUD from two hours, and earns the Hot Streak achievement at twelve', () => {
    const s = quiet();
    s.streak = { hours: 1, best: 1, hit: false };
    expect(goalBar(s)).not.toContain('Streak');
    s.streak = { hours: 5, best: 5, hit: false };
    expect(goalBar(s)).toContain('Streak 5h');
    s.streak.best = 12;
    expect(earnedAchievements(s, {})).toContain('hotStreak');
    s.streak.best = 11;
    expect(earnedAchievements(s, {})).not.toContain('hotStreak');
  });
});

describe('confetti', () => {
  const report = (stars: number): ShiftReport => ({ day: 0, goalLabel: 'g', goalMet: stars > 0, bonus: 100, stars, net: 500, uptimePct: 100, incidents: 0, resolved: 0, criticals: 0, highlights: [] });

  it('rains on a three-star shift only', () => {
    const s = quiet();
    expect(shiftReportModal(s, report(3))).toContain('confetti');
    expect(shiftReportModal(s, report(2))).not.toContain('confetti');
  });
});
