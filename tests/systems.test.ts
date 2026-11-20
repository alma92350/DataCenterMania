import { at } from '../src/core/time';
import { applyCommand } from '../src/sim/commands';
import { CONTRACT_GRACE_MIN } from '../src/data/catalog';
import { demandFactor, updateDemand } from '../src/sim/demand';
import { devicePowerW, updatePower } from '../src/sim/power';
import { updateThermal, coolerCapacityKw } from '../src/sim/thermal';
import { applyFault, failureMultiplier, rollFailures } from '../src/sim/failures';
import { escalateAlarms, raiseAlarm } from '../src/sim/alarms';
import { directorMultiplier } from '../src/sim/director';
import { deviceUp, contractCapacity } from '../src/sim/selectors';
import { THERMAL } from '../src/data/catalog';
import { quietGame } from './helpers';

describe('demand & SLA accounting', () => {
  it('office demand is high on weekday mornings and low at night/weekends', () => {
    expect(demandFactor('office', at(0, 10))).toBeGreaterThan(0.8);
    expect(demandFactor('office', at(0, 3))).toBeLessThan(0.4);
    expect(demandFactor('office', at(5, 10))).toBeLessThan(0.4);
  });

  it('lunchDinner peaks at 12:00 and 19:00', () => {
    const lunch = demandFactor('lunchDinner', at(0, 12));
    const dinner = demandFactor('lunchDinner', at(0, 19));
    const afternoon = demandFactor('lunchDinner', at(0, 16));
    expect(lunch).toBeGreaterThan(0.9);
    expect(dinner).toBeGreaterThan(0.9);
    expect(afternoon).toBeLessThan(0.6);
  });

  it('every profile stays within (0,1]', () => {
    for (const p of ['flat', 'office', 'lunchDinner', 'evening'] as const) {
      for (let m = 0; m < 1440 * 7; m += 37) {
        const v = demandFactor(p, m);
        expect(v).toBeGreaterThan(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('counts OK minutes when capacity covers demand, and spreads load', () => {
    const s = quietGame('ch1');
    s.minute = at(0, 10);
    const c = s.contracts[0]!; // bakery, 2 units, 3 servers assigned
    updateDemand(s, 1);
    expect(c.minutesToday).toBe(1);
    expect(c.okMinutesToday).toBe(1);
    const loads = s.devices.filter((d) => d.contractId === c.id).map((d) => d.load);
    expect(loads.every((l) => l > 0 && l < 1)).toBe(true);
  });

  it('fails the minute when too many servers are down', () => {
    const s = quietGame('ch1');
    s.minute = at(0, 10);
    const c = s.contracts[0]!;
    for (const d of s.devices.filter((d) => d.contractId === c.id)) d.faults.push('psu');
    updateDemand(s, 1);
    expect(contractCapacity(s, c.id)).toBe(0);
    expect(c.okMinutesToday).toBe(0);
    expect(c.minutesToday).toBe(1);
  });
});

describe('power', () => {
  it('draws idle..max watts by load and nothing when off', () => {
    const s = quietGame('ch1');
    const d = s.devices[0]!;
    d.load = 0;
    expect(devicePowerW(s, d)).toBe(120);
    d.load = 1;
    expect(devicePowerW(s, d)).toBe(350);
    d.poweredOn = false;
    expect(devicePowerW(s, d)).toBe(0);
  });

  it('trips the breaker when a rack exceeds its budget, taking devices down', () => {
    const s = quietGame('ch1');
    const rack = s.racks[0]!;
    rack.powerBudgetW = 500;
    for (const d of s.devices.filter((x) => x.rackId === rack.id)) d.load = 1;
    updatePower(s);
    expect(rack.tripped).toBe(true);
    expect(s.devices.filter((x) => x.rackId === rack.id).every((d) => !deviceUp(s, d))).toBe(true);
    const alarm = s.alarms.find((a) => a.kind === 'breaker');
    expect(alarm?.severity).toBe(3);
    updatePower(s);
    expect(rack.loadW).toBe(0);
  });

  it('warns at 90% of budget only when the power feature is unlocked', () => {
    const s = quietGame('ch2');
    const rack = s.racks[0]!;
    for (const d of s.devices.filter((x) => x.rackId === rack.id)) d.load = 1;
    rack.powerBudgetW = 1250; // 2 x 600W = 1200W -> 96%
    updatePower(s);
    expect(rack.tripped).toBe(false);
    expect(s.alarms.some((a) => a.kind === 'powerHigh' && a.rackId === rack.id)).toBe(true);
    rack.powerBudgetW = 5000;
    updatePower(s);
    expect(s.alarms.some((a) => a.kind === 'powerHigh')).toBe(false);
  });
});

describe('thermal', () => {
  it('a cooled rack converges to the cool target', () => {
    const s = quietGame('ch1');
    const rack = s.racks[0]!;
    rack.temp = 30;
    for (let i = 0; i < 300; i++) {
      updatePower(s);
      updateThermal(s, 1);
    }
    expect(rack.temp).toBeCloseTo(THERMAL.coolTarget, 0);
  });

  it('without cooling, hot racks climb above ambient, alarm, then shut down and recover', () => {
    const s = quietGame('ch0');
    s.coolers[0]!.on = false;
    s.ambient = 40;
    const rack = s.racks[0]!;
    for (const d of s.devices) d.load = 1;
    for (let i = 0; i < 400; i++) {
      for (const d of s.devices) d.load = 1;
      updatePower(s);
      updateThermal(s, 1);
    }
    expect(s.devices.every((d) => d.thermalShutdown)).toBe(true);
    expect(s.alarms.find((a) => a.kind === 'overheat')?.severity).toBe(3);
    expect(s.stats.thermalShutdowns).toBeGreaterThan(0);

    s.coolers[0]!.on = true;
    s.ambient = 22;
    for (let i = 0; i < 400; i++) {
      updatePower(s);
      updateThermal(s, 1);
    }
    expect(rack.temp).toBeLessThan(THERMAL.warn);
    expect(s.devices.every((d) => !d.thermalShutdown)).toBe(true);
    expect(s.alarms.some((a) => a.kind === 'overheat')).toBe(false);
  });
});

describe('failures & alarms', () => {
  it('failure rate doubles every +10°C above 27°C', () => {
    expect(failureMultiplier(20)).toBe(1);
    expect(failureMultiplier(27)).toBe(1);
    expect(failureMultiplier(37)).toBeCloseTo(2);
    expect(failureMultiplier(47)).toBeCloseTo(4);
  });

  it('a disk fault is a warning and the server stays up (RAID)', () => {
    const s = quietGame();
    const d = s.devices[0]!;
    applyFault(s, d, 'disk');
    expect(deviceUp(s, d)).toBe(true);
    const a = s.alarms.find((x) => x.deviceId === d.id)!;
    expect(a.kind).toBe('disk');
    expect(a.severity).toBe(1);
    expect(a.escalateAt).toBe(s.minute + 120);
    expect(s.stats.incidents).toBe(1);
  });

  it('an un-fixed disk fault escalates to data loss', () => {
    const s = quietGame();
    const d = s.devices[0]!;
    applyFault(s, d, 'disk');
    s.minute += 119;
    escalateAlarms(s);
    expect(d.faults).toEqual(['disk']);
    s.minute += 1;
    escalateAlarms(s);
    expect(d.faults).toEqual(['dataloss']);
    expect(deviceUp(s, d)).toBe(false);
    const a = s.alarms.find((x) => x.deviceId === d.id)!;
    expect(a.kind).toBe('dataloss');
    expect(a.severity).toBe(3);
    expect(s.stats.criticals).toBe(1);
  });

  it('a PSU fault takes the server down and escalates from Major to Critical', () => {
    const s = quietGame();
    const d = s.devices[0]!;
    applyFault(s, d, 'psu');
    expect(deviceUp(s, d)).toBe(false);
    const a = s.alarms.find((x) => x.deviceId === d.id)!;
    expect(a.severity).toBe(2);
    s.minute += 45;
    escalateAlarms(s);
    expect(a.severity).toBe(3);
    expect(a.escalateAt).toBeNull();
  });

  it('escalation delay scales with difficulty', () => {
    const s = quietGame('ch1', 'intern');
    applyFault(s, s.devices[0]!, 'disk');
    expect(s.alarms[0]!.escalateAt).toBe(s.minute + 240);
  });

  it('does not duplicate faults or alarms', () => {
    const s = quietGame();
    const d = s.devices[0]!;
    applyFault(s, d, 'disk');
    applyFault(s, d, 'disk');
    expect(d.faults).toEqual(['disk']);
    raiseAlarm(s, 'disk', d.rackId, d.id, 1, 100);
    expect(s.alarms).toHaveLength(1);
  });

  it('rollFailures does nothing when failures are disabled and something when enabled', () => {
    const s = quietGame();
    for (let i = 0; i < 2000; i++) rollFailures(s, 1);
    expect(s.alarms).toHaveLength(0);
    s.failuresEnabled = true;
    for (let i = 0; i < 1440 * 5; i++) rollFailures(s, 1);
    expect(s.stats.incidents).toBeGreaterThan(0);
  });

  it('rollFailures is deterministic for a seed', () => {
    const run = () => {
      const s = quietGame('ch1', 'sysadmin', 99);
      s.failuresEnabled = true;
      for (let i = 0; i < 1440 * 3; i++) {
        rollFailures(s, 1);
        s.minute++;
      }
      return s.alarms.map((a) => `${a.kind}@${a.raisedAt}`);
    };
    expect(run()).toEqual(run());
  });
});

describe('incident director', () => {
  it('stays within bounds and backs off when the player is overwhelmed', () => {
    const s = quietGame();
    for (let m = 0; m < 1440; m += 30) {
      s.minute = m;
      const v = directorMultiplier(s);
      expect(v).toBeGreaterThan(0.1);
      expect(v).toBeLessThan(2.5);
    }
    const calm = directorMultiplier(s);
    applyFault(s, s.devices[0]!, 'psu');
    applyFault(s, s.devices[1]!, 'psu');
    expect(directorMultiplier(s)).toBeLessThan(calm);
  });
});

describe('contract onboarding grace period', () => {
  it('does not measure SLA until the contract is provisioned (or grace expires)', () => {
    const s = quietGame('ch1');
    s.minute = at(0, 10);
    const offer = s.contracts.find((c) => c.status === 'offered')!;
    applyCommand(s, { type: 'acceptContract', contractId: offer.id });
    expect(offer.liveFrom).toBeNull();
    updateDemand(s, 1);
    expect(offer.minutesToday).toBe(0);
    // provision enough servers -> goes live
    const free = s.devices.filter((d) => d.contractId === s.contracts[0]!.id).slice(0, 3);
    for (const d of free) d.contractId = offer.id;
    updateDemand(s, 1);
    expect(offer.liveFrom).toBe(s.minute);
    expect(offer.minutesToday).toBe(1);
  });

  it('goes live anyway when the grace period runs out', () => {
    const s = quietGame('ch1');
    const offer = s.contracts.find((c) => c.status === 'offered')!;
    applyCommand(s, { type: 'acceptContract', contractId: offer.id });
    s.minute += CONTRACT_GRACE_MIN;
    updateDemand(s, 1);
    expect(offer.liveFrom).not.toBeNull();
    expect(offer.minutesToday).toBe(1);
    expect(offer.okMinutesToday).toBe(0);
  });
});

describe('hot weather', () => {
  it('derates cooler capacity above 25°C ambient', () => {
    const s = quietGame('ch2');
    expect(coolerCapacityKw(s, 8)).toBe(8); // 24°C: no derating
    s.ambient = 31;
    expect(coolerCapacityKw(s, 8)).toBeCloseTo(8 * (1 - 6 * 0.06));
    s.ambient = 60;
    expect(coolerCapacityKw(s, 8)).toBeCloseTo(8 * 0.3);
  });
});

describe('setup fee', () => {
  it('pays one day of revenue when a contract goes live fully provisioned', () => {
    const s = quietGame('ch1');
    s.minute = at(0, 10);
    const offer = s.contracts.find((c) => c.status === 'offered')!;
    applyCommand(s, { type: 'acceptContract', contractId: offer.id });
    for (const d of s.devices.filter((d) => d.contractId === s.contracts[0]!.id)) d.contractId = offer.id;
    const cash = s.cash;
    updateDemand(s, 1);
    expect(s.cash).toBe(cash + offer.revenuePerDay);
  });
});
