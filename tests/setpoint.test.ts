import { ENERGY } from '../src/data/catalog';
import { applyCommand } from '../src/sim/commands';
import { advance } from '../src/sim/sim';
import { createGame } from '../src/sim/state';
import { computeRecirculation, rackTargetTemp, coolingByRack } from '../src/sim/thermal';
import { coolingW, freeShare, pueNow, setpointOf } from '../src/sim/site';
import { energyCard } from '../src/ui/views';
import { HANDBOOK } from '../src/data/handbook';
import type { GameState } from '../src/sim/types';

function ch7(seed = 1): GameState {
  const s = createGame('ch7', 'sysadmin', seed);
  s.failuresEnabled = false;
  advance(s, 3);
  return s;
}

describe('setpoint and containment (v2.3)', () => {
  it('starts at the default setpoint with open aisles', () => {
    const s = ch7();
    expect(setpointOf(s)).toBe(ENERGY.setpointDefault);
    expect(s.site!.containment ?? 0).toBe(0);
  });

  it('warmer supply air saves cooling energy and lowers PUE, colder costs more', () => {
    const s = ch7();
    const base = coolingW(s);
    const pue = pueNow(s);
    expect(applyCommand(s, { type: 'setSetpoint', c: 26 }).ok).toBe(true);
    expect(coolingW(s)).toBeLessThan(base);
    expect(pueNow(s)).toBeLessThan(pue);
    applyCommand(s, { type: 'setSetpoint', c: 19 });
    expect(coolingW(s)).toBeGreaterThan(base);
  });

  it('warmer supply air raises rack temperature and extends free cooling', () => {
    const s = ch7();
    s.site!.economizer = true;
    const rack = s.racks[0]!;
    const cooling = coolingByRack(s).get(rack.id)!;
    const before = rackTargetTemp(s, rack, cooling);
    const free = freeShare(s);
    applyCommand(s, { type: 'setSetpoint', c: 26 });
    expect(rackTargetTemp(s, rack, cooling)).toBeCloseTo(before + 4, 5);
    expect(freeShare(s)).toBeGreaterThanOrEqual(free);
  });

  it('refuses a setpoint outside the safe range', () => {
    const s = ch7();
    expect(applyCommand(s, { type: 'setSetpoint', c: 30 }).ok).toBe(false);
    expect(applyCommand(s, { type: 'setSetpoint', c: 15 }).ok).toBe(false);
    expect(setpointOf(s)).toBe(ENERGY.setpointDefault);
  });

  it('containment costs money, in order, and cuts recirculation and fan energy', () => {
    const s = ch7();
    s.features.push('aisles');
    for (const r of s.racks) r.facing = 'S'; // everyone faces the same way: worst case
    const open = Math.max(...computeRecirculation(s).values());
    const cooling = coolingW(s);
    s.cash = 0;
    expect(applyCommand(s, { type: 'buyContainment' }).ok).toBe(false);
    s.cash = 20000;
    expect(applyCommand(s, { type: 'buyContainment' }).ok).toBe(true);
    expect(s.cash).toBe(20000 - ENERGY.containmentPrice[1]);
    const part = Math.max(...computeRecirculation(s).values());
    expect(applyCommand(s, { type: 'buyContainment' }).ok).toBe(true);
    const full = Math.max(...computeRecirculation(s).values());
    if (open > 0) {
      expect(part).toBeLessThan(open);
      expect(full).toBeLessThan(part);
    }
    expect(coolingW(s)).toBeLessThan(cooling);
    expect(applyCommand(s, { type: 'buyContainment' }).ok).toBe(false);
  });

  it('a hot setpoint with a failing cooler overheats sooner than the default', () => {
    const run = (c: number) => {
      const s = ch7(3);
      applyCommand(s, { type: 'setSetpoint', c });
      advance(s, 200);
      return Math.max(...s.racks.map((r) => r.temp));
    };
    expect(run(27)).toBeGreaterThan(run(22));
  });

  it('shows up in the energy card and the Handbook, and old saves work without the fields', () => {
    const s = ch7();
    const html = energyCard(s);
    for (const a of ['setSetpoint', 'buyContainment']) expect(html).toContain(`data-action="${a}"`);
    expect(html).not.toMatch(/undefined|NaN/);
    expect(HANDBOOK.some((h) => h.id === 'setpoint')).toBe(true);
    delete s.site!.setpointC;
    delete s.site!.containment;
    expect(() => advance(s, 30)).not.toThrow();
  });
});
