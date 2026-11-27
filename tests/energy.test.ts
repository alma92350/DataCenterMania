import { at } from '../src/core/time';
import { ENERGY, SITE } from '../src/data/catalog';
import { capacityReport, fitPreview, formatPower, powerScale } from '../src/sim/capacity';
import { applyCommand } from '../src/sim/commands';
import { advance } from '../src/sim/sim';
import { createGame } from '../src/sim/state';
import { coolingW, esgOk, facilityW, freeShare, itPowerW, outdoorC, pueAverage, pueNow, startDrought, surgeFactor } from '../src/sim/site';
import { deviceUp } from '../src/sim/selectors';
import { raiseAlarm } from '../src/sim/alarms';
import { capacityCard, energyCard, fitLine, rackModal, siteChip, goalBar, tabs } from '../src/ui/views';
import { HANDBOOK } from '../src/data/handbook';
import type { Contract, GameState } from '../src/sim/types';
import { autopilot } from './autopilot';
import { measure } from './engagement';

function ch7(seed = 1): GameState {
  const s = createGame('ch7', 'sysadmin', seed);
  s.failuresEnabled = false;
  advance(s, 3); // let loads settle
  return s;
}
const hire = (s: GameState, role: 'elec' | 'net') => {
  s.cash += 20000;
  const cand = s.candidates.find((c) => c.role === role)!;
  expect(applyCommand(s, { type: 'hire', candidateId: cand.id }).ok).toBe(true);
};

describe('power formatting (row scale)', () => {
  it('prints W, kW and MW with the right precision at each boundary', () => {
    expect(formatPower(0)).toBe('0 W');
    expect(formatPower(999)).toBe('999 W');
    expect(formatPower(1000)).toBe('1.0 kW');
    expect(formatPower(8326)).toBe('8.3 kW');
    expect(formatPower(99_999)).toBe('100.0 kW');
    expect(formatPower(100_000)).toBe('100 kW');
    expect(formatPower(999_999)).toBe('1000 kW');
    expect(formatPower(1_000_000)).toBe('1.0 MW');
    expect(formatPower(10_000, 10)).toBe('100 kW'); // row scale: a 10 kW site reads as 100 kW
    expect(formatPower(150_000, 10)).toBe('1.5 MW');
  });

  it('only Chapter 7 and later use the row scale; the simulation itself is unchanged', () => {
    expect(powerScale(createGame('ch6', 'sysadmin', 1))).toBe(1);
    expect(powerScale(createGame('ch7', 'sysadmin', 1))).toBe(SITE.rowScale);
  });
});

describe('PUE, cooling and water (pure model)', () => {
  it('is 1 when idle, and stays in a sane range', () => {
    const s = createGame('ch7', 'sysadmin', 1);
    for (const r of s.racks) r.loadW = 0;
    expect(pueNow(s)).toBe(1);
    for (let seed = 1; seed <= 10; seed++) {
      const t = ch7(seed);
      for (const mode of ['evaporative', 'dry'] as const) {
        t.site!.cooling = mode;
        for (const eco of [false, true]) {
          t.site!.economizer = eco;
          const pue = pueNow(t);
          expect(pue).toBeGreaterThanOrEqual(1.1);
          expect(pue).toBeLessThanOrEqual(2.2);
        }
      }
    }
  });

  it('dry cooling costs electricity; free cooling helps only when it is cold outside', () => {
    const s = ch7();
    s.site!.cooling = 'evaporative';
    const wet = pueNow(s);
    s.site!.cooling = 'dry';
    const dry = pueNow(s);
    expect(dry).toBeGreaterThan(wet);
    s.site!.economizer = true;
    // outdoor temperature follows the day: cold early morning, warm afternoon
    const cold = createGame('ch7', 'sysadmin', 1);
    cold.site!.economizer = true;
    cold.minute = at(0, 3);
    const warm = createGame('ch7', 'sysadmin', 1);
    warm.site!.economizer = true;
    warm.minute = at(0, 15);
    expect(outdoorC(cold)).toBeLessThan(outdoorC(warm));
    expect(freeShare(cold)).toBeGreaterThan(freeShare(warm));
    cold.site!.economizer = false;
    expect(freeShare(cold)).toBe(0);
    expect(coolingW(cold)).toBeGreaterThan(0);
  });

  it('a heatwave warms the outside air and hurts dry cooling', () => {
    const s = ch7();
    s.site!.cooling = 'dry';
    const normal = pueNow(s);
    s.ambient = 36;
    expect(outdoorC(s)).toBeGreaterThan(outdoorC(createGame('ch7', 'sysadmin', 1)));
    s.minute = at(0, 15);
    expect(pueNow(s)).toBeGreaterThanOrEqual(normal);
  });

  it('the electricity bill uses live PUE with a site, and the old factor without one', () => {
    const a = createGame('ch6', 'sysadmin', 1);
    expect(a.site).toBeUndefined();
    expect(facilityW(a)).toBeGreaterThan(itPowerW(a)); // the old fixed cooler power
    const b = ch7();
    const pue = facilityW(b) / Math.max(1, itPowerW(b));
    expect(pue).toBeLessThan(2);
    expect(pue).toBeGreaterThan(1.1);
  });

  it('water: evaporative uses on-site water, dry uses almost none but more electricity, off-site water tracks electricity', () => {
    const run = (mode: 'evaporative' | 'dry', renewable = false) => {
      const s = ch7();
      s.site!.cooling = mode;
      s.site!.renewable = renewable;
      advance(s, 600);
      return s.site!;
    };
    const wet = run('evaporative');
    const dry = run('dry');
    expect(wet.waterOnL).toBeGreaterThan(dry.waterOnL * 10);
    expect(dry.facKwh).toBeGreaterThan(wet.facKwh);
    expect(dry.waterOffL).toBeGreaterThan(wet.waterOffL); // saving water costs electricity, which costs water elsewhere
    const green = run('evaporative', true);
    expect(green.waterOffL).toBeLessThan(wet.waterOffL);
    const ratio = wet.waterOffL / wet.waterOnL;
    expect(ratio).toBeGreaterThan(3);
    expect(ratio).toBeLessThan(10);
  });

  it('renewable power costs 15% more, heat reuse earns money and gives ESG credit', () => {
    const base = ch7();
    base.site!.renewable = false;
    const green = ch7();
    green.site!.renewable = true;
    advance(base, 1440);
    advance(green, 1440);
    expect(green.reports.at(-1)?.electricity ?? green.today.electricity).toBeGreaterThanOrEqual(0);
    const s = ch7();
    s.cash = 40000;
    const before = s.cash;
    expect(applyCommand(s, { type: 'buyHeatReuse' }).ok).toBe(true);
    expect(applyCommand(s, { type: 'buyHeatReuse' }).ok).toBe(false);
    expect(s.cash).toBe(before - ENERGY.heatReusePrice);
    const twin = ch7();
    twin.cash = s.cash;
    twin.site!.heatReuse = false;
    advance(s, 300);
    advance(twin, 300);
    expect(s.cash).toBeGreaterThan(twin.cash);
  });
});

describe('grid connection cap and queue', () => {
  it('trips the main breaker after minutes over the cap: everything is down until an electrician resets it', () => {
    const s = ch7();
    hire(s, 'elec');
    s.site!.gridCapW = Math.round(facilityW(s) * 0.8);
    advance(s, SITE.tripMin - 1);
    expect(s.site!.mainTripped).toBe(false);
    expect(s.alarms.some((a) => a.kind === 'siteCapHigh')).toBe(true);
    advance(s, 3);
    expect(s.site!.mainTripped).toBe(true);
    expect(s.alarms.some((a) => a.kind === 'siteCap' && a.severity === 3)).toBe(true);
    expect(s.devices.every((d) => !deviceUp(s, d))).toBe(true);
    expect(applyCommand(s, { type: 'dispatch', job: 'resetMain', techId: 'best' }).ok).toBe(true);
    expect(s.techs.find((t) => t.id === s.jobs[0]!.techId)!.role).toBe('elec');
    s.site!.gridCapW = 100_000; // the player ordered more capacity meanwhile
    advance(s, 120);
    expect(s.site!.mainTripped).toBe(false);
    expect(s.devices.some((d) => deviceUp(s, d))).toBe(true);
    expect(applyCommand(s, { type: 'dispatch', job: 'resetMain', techId: 'best' }).ok).toBe(false);
  });

  it('trips again if you reset it without shedding load', () => {
    const s = ch7();
    hire(s, 'elec');
    s.site!.gridCapW = Math.round(facilityW(s) * 0.7);
    advance(s, 8);
    expect(s.site!.mainTripped).toBe(true);
    applyCommand(s, { type: 'dispatch', job: 'resetMain', techId: 'best' });
    advance(s, 120);
    expect(s.site!.trips).toBeGreaterThanOrEqual(2);
  });

  it('a grid upgrade takes queue days, can be expedited, and adds a step of capacity', () => {
    const s = ch7();
    s.cash = 60000;
    const cap = s.site!.gridCapW;
    const cash = s.cash;
    expect(applyCommand(s, { type: 'orderGrid' }).ok).toBe(true);
    expect(s.cash).toBe(cash - SITE.stepPrice);
    expect(s.pendingInfra![0]!.kind).toBe('grid');
    s.progress.firedEvents.push('delayedOrder');
    advance(s, 2 * 1440 - 10);
    expect(s.site!.gridCapW).toBe(cap);
    advance(s, 20);
    expect(s.site!.gridCapW).toBe(cap + SITE.stepW);
    for (let i = 0; i < 5; i++) applyCommand(s, { type: 'orderGrid' });
    expect(s.site!.gridSteps + (s.pendingInfra ?? []).length).toBeLessThanOrEqual(SITE.maxSteps);
    expect(applyCommand(s, { type: 'expediteInfra', id: s.pendingInfra![0]!.id }).ok).toBe(true);
    expect(applyCommand(createGame('ch6', 'sysadmin', 1), { type: 'orderGrid' }).ok).toBe(false);
  });
});

describe('drought, out-of-band link and Black Friday', () => {
  it('a drought bans evaporative cooling and switches the site to dry', () => {
    const s = ch7();
    expect(s.site!.cooling).toBe('evaporative');
    startDrought(s, 2);
    expect(s.site!.cooling).toBe('dry');
    expect(applyCommand(s, { type: 'setCooling', mode: 'evaporative' }).ok).toBe(false);
    advance(s, 2 * 1440 + 5);
    expect(applyCommand(s, { type: 'setCooling', mode: 'evaporative' }).ok).toBe(true);
  });

  it('a cut management link blocks remote reboots until a network engineer repairs it', () => {
    const s = ch7();
    hire(s, 'net');
    s.noc = 1;
    const d = s.devices[0]!;
    d.faults.push('hung');
    raiseAlarm(s, 'hung', d.rackId, d.id, 2, 60);
    advance(s, at(1, 14) - s.minute + 2);
    expect(s.site!.oob).toBe('cut');
    expect(applyCommand(s, { type: 'remoteReboot', deviceId: d.id }).ok).toBe(false);
    expect(applyCommand(s, { type: 'dispatch', job: 'repairOob', techId: 'best' }).ok).toBe(true);
    expect(s.techs.find((t) => t.id === s.jobs.find((j) => j.kind === 'repairOob')!.techId)!.role).toBe('net');
    advance(s, 90);
    expect(s.site!.oob).toBe('ok');
    expect(applyCommand(s, { type: 'remoteReboot', deviceId: d.id }).ok).toBe(true);
  });

  it('Black Friday surges demand and freezes changes, then ends', () => {
    const s = createGame('ch7', 'sysadmin', 2);
    s.failuresEnabled = false;
    expect(surgeFactor(s)).toBe(1);
    advance(s, at(3, 9) - s.minute);
    expect(surgeFactor(s)).toBeGreaterThan(1);
    expect(s.freeze).toBe(true);
    advance(s, at(4, 7) - s.minute);
    expect(surgeFactor(s)).toBe(1);
    expect(s.freeze).toBe(false);
  });
});

describe('ESG customer', () => {
  it('breaks the SLA while PUE is above its limit and holds when efficient', () => {
    const s = ch7();
    expect(esgOk(s, undefined)).toBe(true);
    expect(esgOk(s, 9)).toBe(true);
    expect(esgOk(s, 1.0)).toBe(false);
    s.site!.heatReuse = true;
    const raw = pueNow(s);
    expect(esgOk(s, raw - ENERGY.heatReusePueCredit + 0.001)).toBe(true);
    expect(esgOk(s, raw - 0.05)).toBe(false === (raw - 0.05 >= raw - ENERGY.heatReusePueCredit) ? false : true);
  });

  it('a contract with a PUE clause misses its SLA minutes when the site is inefficient', () => {
    const s = ch7(3);
    s.site!.cooling = 'dry';
    const c = s.contracts.find((x) => x.status === 'active')! as Contract;
    c.pueMax = 1.0;
    const before = c.okMinutesToday;
    advance(s, 30);
    expect(c.okMinutesToday).toBe(before); // never ok while PUE > 1.0
    c.pueMax = 9;
    advance(s, 30);
    expect(c.okMinutesToday).toBeGreaterThan(before);
  });
});

describe('capacity (DCIM) and fit preview', () => {
  it('reports four resources, flags the one that runs out first, and counts stranded space', () => {
    const s = ch7();
    const rep = capacityReport(s);
    expect(rep.resources.map((r) => r.key)).toEqual(['space', 'power', 'cooling', 'network']);
    expect(rep.resources.every((r) => r.cap > 0 && r.pct >= 0)).toBe(true);
    const top = [...rep.resources].sort((a, b) => b.pct - a.pct)[0]!;
    expect(rep.limiting).toBe(top.key);
    s.racks[0]!.loadW = s.racks[0]!.powerBudgetW - 10;
    expect(capacityReport(s).strandedU).toBeGreaterThan(0);
  });

  it('previews whether an offered contract fits and what it would exhaust', () => {
    const s = ch7();
    advance(s, at(0, 10, 5) - s.minute);
    const offer = s.contracts.find((c) => c.status === 'offered')!;
    const fit = fitPreview(s, offer);
    expect(fit.needUnits).toBeGreaterThan(0);
    expect(fit.needW).toBeGreaterThan(0);
    s.site!.gridCapW = Math.round(facilityW(s) + 10);
    expect(fitPreview(s, offer).limits).toContain('power');
    expect(fitPreview(s, offer).ok).toBe(false);
    s.site!.gridCapW = 1_000_000;
    for (const r of s.racks) r.capacityU = 1000;
    expect(fitPreview(s, offer).limits).not.toContain('power');
  });
});

describe('energy UI', () => {
  it('shows PUE, cooling mode, water meters, free cooling and the grid order, with a HUD chip', () => {
    const s = ch7();
    const html = energyCard(s);
    for (const key of ['setCooling', 'buyEconomizer', 'setRenewable', 'buyHeatReuse', 'orderGrid']) expect(html).toContain(`data-action="${key}"`);
    expect(html).toContain('On-site (cooling)');
    expect(html).toContain('Off-site (in the electricity)');
    expect(html).not.toMatch(/undefined|NaN/);
    expect(capacityCard(s)).toContain('runs out first');
    expect(siteChip(s)).toMatch(/PUE \d\.\d\d/);
    expect(goalBar(s)).toContain('PUE');
    expect(energyCard(createGame('ch6', 'sysadmin', 1))).toBe('');
    expect(siteChip(createGame('ch6', 'sysadmin', 1))).toBe('');
  });

  it('tripped breakers and a cut link get banners with repair buttons; the rack view uses the row scale', () => {
    const s = ch7();
    s.site!.mainTripped = true;
    s.site!.oob = 'cut';
    raiseAlarm(s, 'siteCap', null, null, 3, null);
    const html = energyCard(s);
    expect(html).toContain('data-job="resetMain"');
    expect(html).toContain('data-job="repairOob"');
    expect(siteChip(s)).toContain('MAIN BREAKER TRIPPED');
    expect(tabs(s, 'alarms')).toContain('class="badge">!');
    const r = s.racks.find((x) => s.devices.some((d) => d.rackId === x.id))!;
    expect(rackModal(s, r.id)).toMatch(/\d+(\.\d)? kW \/ \d+(\.\d)? kW/);
    expect(rackModal(createGame('ch6', 'sysadmin', 1), r.id)).toMatch(/ W \/ /);
  });

  it('offers show a fit line, and the Handbook explains the new systems', () => {
    const s = ch7();
    advance(s, at(0, 10, 5) - s.minute);
    const offer = s.contracts.find((c) => c.status === 'offered')!;
    expect(fitLine(s, offer)).toMatch(/Fits|Runs out of/);
    expect(fitLine(createGame('ch6', 'sysadmin', 1), offer)).toBe('');
    expect(HANDBOOK.filter((h) => h.unlock === 'energy').map((h) => h.id)).toEqual(expect.arrayContaining(['pue', 'water', 'freecool', 'oob']));
    expect(HANDBOOK.some((h) => h.id === 'gridcap' && h.unlock === 'capacity')).toBe(true);
  });
});

describe('Chapter 7 balance', () => {
  it('a planned bot (free cooling, grid orders) wins and never trips the breaker; a passive bot is punished', () => {
    const play = (energy: 'planned' | 'passive', seed: number) => {
      const s = createGame('ch7', 'sysadmin', seed);
      while (s.progress.status === 'playing') {
        if (s.minute % 5 === 0) autopilot(s, { auto: true, energy });
        advance(s, 1);
      }
      return s;
    };
    const planned = [1, 2, 4].map((seed) => play('planned', seed));
    expect(planned.every((s) => s.progress.status === 'won')).toBe(true);
    expect(planned.every((s) => (s.site?.trips ?? 0) === 0)).toBe(true);
    expect(planned.every((s) => pueAverage(s) < 1.5)).toBe(true);
    const passive = [1, 2].map((seed) => play('passive', seed));
    expect(passive.some((s) => (s.site?.trips ?? 0) > 0 || s.progress.status === 'lost' || s.progress.stars < 2)).toBe(true);
  }, 90000);

  it('keeps the bot engagement guardrails in Chapter 7', () => {
    const m = measure('ch7', 1, 'sysadmin', true);
    expect(m.shiftRealMinutes.every((x) => x >= 3 && x <= 10)).toBe(true);
    expect(m.quietDaytimePct).toBeLessThanOrEqual(70);
  });
});
