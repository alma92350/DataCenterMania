import { at } from '../src/core/time';
import { createGame } from '../src/sim/state';
import { applyCommand } from '../src/sim/commands';
import { updateTechs } from '../src/sim/jobs';
import { updateThermal, computeRecirculation, coolingByRack } from '../src/sim/thermal';
import { updatePower } from '../src/sim/power';
import { updateDemand } from '../src/sim/demand';
import { updateCoolers } from '../src/sim/maintenance';
import { cutUplink, bandwidthCapacity, failSwitch, updateNetwork } from '../src/sim/network';
import { updateFatigue } from '../src/sim/fatigue';
import { settleDay } from '../src/sim/economy';
import { deviceUp } from '../src/sim/selectors';
import { advance } from '../src/sim/sim';
import { CHAPTERS } from '../src/data/chapters';
import { EXTRA_UPLINK, FATIGUE } from '../src/data/catalog';
import { isDifficultyUnlocked } from '../src/ui/storage';
import type { GameState } from '../src/sim/types';

function ch3(): GameState {
  const s = createGame('ch3', 'sysadmin', 1);
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

function hire(s: GameState, role: 'hw' | 'hvac' | 'net') {
  const c = s.candidates[0]!;
  c.role = role;
  c.trait = null;
  applyCommand(s, { type: 'hire', candidateId: c.id });
  return s.techs[s.techs.length - 1]!;
}

describe('chapter 3 setup', () => {
  it('builds the colocation floor', () => {
    const s = createGame('ch3', 'sysadmin', 1);
    expect(s.racks).toHaveLength(15);
    expect(s.racks.every((r) => r.facing === 'S')).toBe(true);
    expect(s.coolers.map((c) => c.kind).sort()).toEqual(['crac', 'wallAc']);
    expect(s.uplinks).toHaveLength(1);
    expect(s.uplinks[0]!.capacityGbps).toBe(8);
    expect(s.techs.map((t) => t.role)).toEqual(['manager', 'hw']);
    expect(s.candidates.some((c) => c.role !== 'hw')).toBe(true);
    expect(s.contracts.filter((c) => c.status === 'active').every((c) => c.bandwidthPerUnit > 0)).toBe(true);
  });

  it('chapter 2 now leads to chapter 3', () => {
    expect(CHAPTERS.ch2.next).toBe('ch3');
  });
});

describe('hot / cold aisles', () => {
  it('a rack breathing another rack’s exhaust gets recirculation heat', () => {
    const s = ch3();
    updatePower(s);
    const rec = computeRecirculation(s);
    // row 2 (racks 5..9) faces south, blowing exhaust north into row 1's intake
    expect(rec.get(s.racks[0]!.id)).toBeGreaterThan(0);
    // row 3 racks are empty (no heat), so row 2 is not affected
    expect(rec.get(s.racks[5]!.id)).toBe(0);
  });

  it('facing rows front-to-front fixes it', () => {
    const s = ch3();
    for (const r of s.racks.slice(5, 10)) r.facing = 'N';
    updatePower(s);
    const rec = computeRecirculation(s);
    expect([...rec.values()].every((v) => v === 0)).toBe(true);
  });

  it('recirculation raises rack temperature', () => {
    const bad = ch3();
    const good = ch3();
    for (const r of good.racks.slice(5, 10)) r.facing = 'N';
    for (const s of [bad, good]) {
      s.minute = at(0, 12);
      for (let i = 0; i < 200; i++) {
        updateDemand(s, 1);
        updatePower(s);
        updateThermal(s, 1);
      }
    }
    expect(bad.racks[0]!.temp).toBeGreaterThan(good.racks[0]!.temp + 3);
    expect(bad.racks[0]!.recirculation).toBeGreaterThan(0);
  });

  it('rotating a rack takes it offline while the tech works, then flips it', () => {
    const s = ch3();
    const rack = s.racks[5]!;
    expect(applyCommand(s, { type: 'dispatch', job: 'rotateRack', rackId: rack.id, techId: 'best' }).ok).toBe(true);
    let sawOffline = false;
    for (let m = 0; m < 1000 && s.jobs.length; m++) {
      updateTechs(s, 1);
      s.minute++;
      if (rack.maintenance) {
        sawOffline = true;
        const dev = s.devices.find((d) => d.rackId === rack.id)!;
        expect(deviceUp(s, dev)).toBe(false);
      }
    }
    expect(sawOffline).toBe(true);
    expect(rack.facing).toBe('N');
    expect(rack.maintenance).toBe(false);
  });

  it('new racks can be built facing north', () => {
    const s = ch3();
    s.inventory.rack = 1;
    expect(applyCommand(s, { type: 'buildRack', pos: { x: 15, y: 5 }, facing: 'N', techId: 'best' }).ok).toBe(true);
    runJobs(s);
    expect(s.racks[s.racks.length - 1]!.facing).toBe('N');
  });
});

describe('cooler maintenance', () => {
  it('filters clog over time, reducing capacity and raising an alarm', () => {
    const s = ch3();
    const crac = s.coolers.find((c) => c.kind === 'crac')!;
    updatePower(s);
    const before = [...coolingByRack(s).values()].reduce((a, c) => a + c.kw, 0);
    for (let m = 0; m < 1440 * 1.6; m++) updateCoolers(s, 1);
    expect(crac.health).toBeLessThan(0.4);
    expect(s.alarms.some((a) => a.kind === 'filter' && a.coolerId === crac.id)).toBe(true);
    const after = [...coolingByRack(s).values()].reduce((a, c) => a + c.kw, 0);
    expect(after).toBeLessThan(before);
  });

  it('a clogged cooler eventually breaks down and stops cooling', () => {
    const s = ch3();
    const crac = s.coolers.find((c) => c.kind === 'crac')!;
    crac.health = 0;
    for (let m = 0; m < 1440 && !crac.broken; m++) updateCoolers(s, 1);
    expect(crac.broken).toBe(true);
    expect(s.alarms.find((a) => a.kind === 'coolerDown')?.severity).toBe(3);
  });

  it('an HVAC tech changes the filter; HW techs cannot', () => {
    const s = ch3();
    const crac = s.coolers.find((c) => c.kind === 'crac')!;
    crac.health = 0.2;
    const hw = s.techs.find((t) => t.role === 'hw')!;
    expect(applyCommand(s, { type: 'serviceCooler', coolerId: crac.id, techId: hw.id }).ok).toBe(false);
    const hvac = hire(s, 'hvac');
    expect(applyCommand(s, { type: 'serviceCooler', coolerId: crac.id, techId: 'best' }).ok).toBe(true);
    expect(s.jobs[0]!.techId).toBe(hvac.id);
    runJobs(s);
    expect(crac.health).toBe(1);
  });

  it('broken coolers need a repair job', () => {
    const s = ch3();
    const crac = s.coolers.find((c) => c.kind === 'crac')!;
    crac.broken = true;
    crac.health = 0;
    hire(s, 'hvac');
    expect(applyCommand(s, { type: 'repairCooler', coolerId: crac.id, techId: 'best' }).ok).toBe(true);
    runJobs(s);
    expect(crac.broken).toBe(false);
    expect(s.alarms.some((a) => a.kind === 'coolerDown')).toBe(false);
  });
});

describe('network', () => {
  it('a failed top-of-rack switch takes the rack offline until a network engineer replaces it', () => {
    const s = ch3();
    const rack = s.racks[0]!;
    failSwitch(s, rack);
    const dev = s.devices.find((d) => d.rackId === rack.id)!;
    expect(deviceUp(s, dev)).toBe(false);
    expect(s.alarms.find((a) => a.kind === 'switch')?.severity).toBe(2);
    expect(applyCommand(s, { type: 'dispatch', job: 'replaceSwitch', rackId: rack.id, techId: s.techs[1]!.id }).ok).toBe(false);
    hire(s, 'net');
    expect(applyCommand(s, { type: 'dispatch', job: 'replaceSwitch', rackId: rack.id, techId: 'best' }).ok).toBe(true);
    runJobs(s);
    expect(rack.switchFailed).toBe(false);
    expect(deviceUp(s, dev)).toBe(true);
  });

  it('bandwidth demand above uplink capacity breaks every bandwidth-using contract', () => {
    const s = ch3();
    s.minute = at(0, 20);
    updateDemand(s, 1);
    expect(s.bandwidthUsed).toBeGreaterThan(0);
    expect(s.contracts.filter((c) => c.status === 'active').every((c) => c.okMinutesToday === 1)).toBe(true);
    s.uplinks[0]!.capacityGbps = 0.5;
    updateDemand(s, 1);
    expect(s.contracts.filter((c) => c.status === 'active').every((c) => c.okMinutesToday === 1)).toBe(true);
    expect(s.alarms.find((a) => a.kind === 'bandwidth')?.severity).toBe(3);
  });

  it('a fiber cut drops capacity; the ISP repairs it eventually, a network engineer faster', () => {
    const s = ch3();
    cutUplink(s, s.uplinks[0]!);
    expect(bandwidthCapacity(s)).toBe(0);
    expect(s.alarms.find((a) => a.kind === 'uplink')?.severity).toBe(3);
    const net = hire(s, 'net');
    expect(applyCommand(s, { type: 'dispatch', job: 'repairUplink', uplinkId: s.uplinks[0]!.id, techId: 'best' }).ok).toBe(true);
    expect(s.jobs[0]!.techId).toBe(net.id);
    runJobs(s);
    expect(s.uplinks[0]!.up).toBe(true);

    const t = ch3();
    cutUplink(t, t.uplinks[0]!);
    t.minute = t.uplinks[0]!.repairAt!;
    updateNetwork(t);
    expect(t.uplinks[0]!.up).toBe(true);
    expect(t.alarms.some((a) => a.kind === 'uplink')).toBe(false);
  });

  it('buying a second uplink adds capacity and a daily cost', () => {
    const s = ch3();
    const cash = s.cash;
    expect(applyCommand(s, { type: 'buyUplink' }).ok).toBe(true);
    expect(s.cash).toBe(cash - EXTRA_UPLINK.setupCost);
    expect(bandwidthCapacity(s)).toBe(8 + EXTRA_UPLINK.capacityGbps);
    expect(applyCommand(s, { type: 'buyUplink' }).ok).toBe(false); // only one extra route
    s.minute += 1440;
    const report = settleDay(s);
    expect(report.network).toBe(150 + EXTRA_UPLINK.costPerDay);
  });
});

describe('fatigue & morale', () => {
  it('working tires techs; resting in the staff room recovers them', () => {
    const s = ch3();
    const t = s.techs[1]!;
    s.jobs.push({ id: 'jx', kind: 'install', rackId: s.racks[4]!.id, deviceId: null, techId: t.id, stage: 'working', workLeft: 999, workTotal: 999, part: null, site: s.racks[4]!.pos, model: 'server1u', slot: 9 });
    t.jobId = 'jx';
    for (let m = 0; m < 300; m++) updateFatigue(s, 1);
    expect(t.fatigue).toBeGreaterThan(25);
    s.jobs = [];
    t.jobId = null;
    t.pos = { x: 1, y: 10 }; // staff room
    const tired = t.fatigue;
    for (let m = 0; m < 60; m++) updateFatigue(s, 1);
    expect(t.fatigue).toBeLessThan(tired - 10);
  });

  it('exhausted techs take a break and refuse new jobs until rested', () => {
    const s = ch3();
    const t = s.techs[1]!;
    t.fatigue = FATIGUE.breakAt + 1;
    updateFatigue(s, 1);
    expect(t.onBreak).toBe(true);
    s.devices[0]!.faults.push('hung');
    applyCommand(s, { type: 'dispatch', job: 'reboot', deviceId: s.devices[0]!.id, techId: 'best' });
    expect(s.jobs[0]!.techId).not.toBe(t.id);
  });

  it('miserable staff may quit at midnight', () => {
    const s = ch3();
    while (s.candidates.length) hire(s, 'hw');
    for (const t of s.techs) if (t.role !== 'manager') t.morale = 0;
    const before = s.techs.length;
    s.minute += 1440;
    settleDay(s);
    expect(s.techs.length).toBeLessThan(before);
    expect(s.techs.some((t) => t.role === 'manager')).toBe(true);
  });

  it('the coffee machine upgrade raises morale', () => {
    const s = ch3();
    applyCommand(s, { type: 'order', part: 'coffee', qty: 1 });
    advance(s, 120);
    expect(s.coffeeLevel).toBe(1);
  });
});

describe('roles', () => {
  it('the manager can do specialist jobs, but slowly', () => {
    const s = ch3();
    const crac = s.coolers.find((c) => c.kind === 'crac')!;
    crac.health = 0.2;
    expect(applyCommand(s, { type: 'serviceCooler', coolerId: crac.id, techId: 'manager' }).ok).toBe(true);
    runJobs(s);
    expect(crac.health).toBe(1);
  });
});

describe('On-Call Nightmare', () => {
  it('unlocks after beating chapter 3', () => {
    expect(isDifficultyUnlocked({}, 'nightmare')).toBe(false);
    expect(isDifficultyUnlocked({}, 'sysadmin')).toBe(true);
    expect(isDifficultyUnlocked({ ch3: { sysadmin: 1 } }, 'nightmare')).toBe(true);
  });
});
