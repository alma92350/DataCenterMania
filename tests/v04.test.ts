import { at } from '../src/core/time';
import { createGame } from '../src/sim/state';
import { advance, step } from '../src/sim/sim';
import { applyCommand } from '../src/sim/commands';
import { applyFault } from '../src/sim/failures';
import { updateTechs } from '../src/sim/jobs';
import { spawnWalkin, updateWalkins } from '../src/sim/walkins';
import { hungRateMultiplier } from '../src/sim/failures';
import { contractMarginPerDay } from '../src/sim/selectors';
import { PROJECTS } from '../src/data/catalog';
import type { GameState } from '../src/sim/types';

function quiet(ch: GameState['chapter'] = 'ch1'): GameState {
  const s = createGame(ch, 'sysadmin', 1);
  s.failuresEnabled = false;
  s.progress.firedEvents = ['*all*'];
  return s;
}

function runJobs(s: GameState, max = 2000): void {
  for (let m = 0; m < max && s.jobs.length; m++) {
    updateTechs(s, 1);
    s.minute++;
  }
}

describe('live money (hourly accrual)', () => {
  it('credits revenue every game hour, with money pops on paying racks', () => {
    const s = quiet();
    const cash = s.cash;
    advance(s, 60 - (s.minute % 60)); // to the next full hour
    expect(s.cash).not.toBe(cash);
    expect(s.today.revenue).toBeGreaterThan(0);
    expect(s.fx.some((f) => f.kind === 'money' && f.rackId !== null && f.amount > 0)).toBe(true);
  });

  it('costs are charged hourly too, and the day report adds up to the cash change', () => {
    const s = quiet();
    advance(s, at(1, 0) - s.minute); // to midnight
    const cashAtMidnight = s.cash;
    advance(s, 1440);
    const r = s.reports[s.reports.length - 1]!;
    expect(r.revenue).toBeGreaterThan(0);
    expect(r.salaries + r.rent + r.electricity).toBeGreaterThan(0);
    expect(r.net).toBe(r.revenue - r.penalties - r.salaries - r.electricity - r.rent - r.network);
    expect(Math.abs(s.cash - cashAtMidnight - r.net)).toBeLessThanOrEqual(s.shiftReports.filter((x) => x.day === r.day && x.goalMet).reduce((a, x) => a + x.bonus, 0) + 2);
  });

  it('a failing contract shows red SLA pops', () => {
    const s = quiet();
    s.minute = at(0, 11);
    const c = s.contracts[0]!;
    for (const d of s.devices.filter((x) => x.contractId === c.id)) d.faults.push('psu');
    step(s);
    expect(s.fx.some((f) => f.kind === 'miss')).toBe(true);
  });

  it('computes a per-contract daily margin below revenue', () => {
    const s = quiet();
    advance(s, 30);
    const c = s.contracts[0]!;
    const m = contractMarginPerDay(s, c);
    expect(m).toBeLessThan(c.revenuePerDay);
    expect(m).toBeGreaterThan(0);
  });
});

describe('shifts', () => {
  it('a shift with a goal starts with the chapter', () => {
    const s = quiet();
    step(s);
    expect(s.shift).not.toBeNull();
    expect(s.shift!.goalLabel.length).toBeGreaterThan(5);
    expect(s.shift!.endMinute).toBe(at(0, 22));
  });

  it('ends at 22:00 with a report card, pays the bonus if met, and the next shift starts at 06:00', () => {
    const s = quiet();
    advance(s, at(0, 22) - s.minute + 1);
    const rep = s.pendingShiftReport!;
    expect(rep).not.toBeNull();
    expect(rep.day).toBe(0);
    expect(rep.stars).toBeGreaterThanOrEqual(0);
    expect(rep.stars).toBeLessThanOrEqual(3);
    expect(s.shiftReports).toHaveLength(1);
    expect(s.shift).toBeNull();
    advance(s, at(1, 6) - s.minute + 1);
    expect(s.shift?.day).toBe(1);
  });

  it('"fast fix" fails when an alarm waits more than 30 minutes without anyone dispatched', () => {
    const s = quiet();
    step(s);
    s.shift!.goal = 'fastFix';
    applyFault(s, s.devices[0]!, 'disk');
    advance(s, 32);
    expect(s.shift!.goalFailed).toBe(true);
  });

  it('"no critical" fails on a critical alarm', () => {
    const s = quiet();
    step(s);
    s.shift!.goal = 'noCritical';
    s.racks[0]!.powerBudgetW = 1; // breaker trips: critical
    step(s);
    step(s);
    expect(s.shift!.goalFailed).toBe(true);
  });
});

describe('walk-in requests', () => {
  it('spawns a timed favour; doing it in time pays the reward', () => {
    const s = quiet();
    const w = spawnWalkin(s)!;
    expect(w.status).toBe('open');
    const cash = s.cash;
    expect(applyCommand(s, { type: 'dispatch', job: 'favor', walkinId: w.id, techId: 'best' }).ok).toBe(true);
    runJobs(s);
    expect(w.status).toBe('done');
    expect(s.cash).toBe(cash + w.reward);
  });

  it('expires after its deadline', () => {
    const s = quiet();
    const w = spawnWalkin(s)!;
    s.minute = w.deadline + 1;
    updateWalkins(s, 1);
    expect(w.status).toBe('expired');
    expect(applyCommand(s, { type: 'dispatch', job: 'favor', walkinId: w.id, techId: 'best' }).ok).toBe(false);
  });

  it('only appear in calm daytime and not before chapter 1', () => {
    const ch0 = quiet('ch0');
    for (let i = 0; i < 2000; i++) updateWalkins(ch0, 1);
    expect(ch0.walkins).toHaveLength(0);
    const s = quiet();
    s.minute = at(0, 9);
    for (let i = 0; i < 600; i++) {
      updateWalkins(s, 1);
      s.minute++;
    }
    expect(s.walkins.length).toBeGreaterThan(0);
  });
});

describe('ops projects', () => {
  it('cost money and tech time, then stay done', () => {
    const s = quiet();
    const cash = s.cash;
    expect(applyCommand(s, { type: 'startProject', project: 'firmware' }).ok).toBe(true);
    expect(s.cash).toBe(cash - PROJECTS.firmware.cost);
    expect(applyCommand(s, { type: 'startProject', project: 'firmware' }).ok).toBe(false);
    runJobs(s, 3000);
    expect(s.projects).toContain('firmware');
    expect(applyCommand(s, { type: 'startProject', project: 'firmware' }).ok).toBe(false);
  });

  it('firmware makes hangs rarer; labels make jobs faster', () => {
    const s = quiet();
    expect(hungRateMultiplier(s)).toBe(1);
    s.projects.push('firmware');
    expect(hungRateMultiplier(s)).toBeLessThan(1);

    const time = (labels: boolean) => {
      const g = quiet();
      if (labels) g.projects.push('labels');
      applyFault(g, g.devices[0]!, 'hung');
      applyCommand(g, { type: 'dispatch', job: 'reboot', deviceId: g.devices[0]!.id, techId: 'manager' });
      g.techs[0]!.pos = { x: g.racks[0]!.pos.x, y: g.racks[0]!.pos.y + 1 };
      let m = 0;
      while (g.jobs.length && m < 500) {
        updateTechs(g, 1);
        m++;
      }
      return m;
    };
    expect(time(true)).toBeLessThanOrEqual(time(false));
  });

  it('are locked in the tutorial', () => {
    expect(applyCommand(quiet('ch0'), { type: 'startProject', project: 'labels' }).ok).toBe(false);
  });
});
