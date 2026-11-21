import { applyCommand } from '../src/sim/commands';
import { updateTechs } from '../src/sim/jobs';
import { applyFault } from '../src/sim/failures';
import { deviceUp } from '../src/sim/selectors';
import { homeSpot } from '../src/sim/state';
import { tileAt } from '../src/sim/grid';
import { JOB_WORK_MIN } from '../src/data/catalog';
import type { GameState } from '../src/sim/types';
import { quietGame } from './helpers';

function runTechs(s: GameState, maxMinutes = 600): number {
  let m = 0;
  while (m < maxMinutes && s.jobs.some((j) => j.stage !== 'done')) {
    updateTechs(s, 1);
    s.minute++;
    m++;
  }
  return m;
}

describe('technician jobs', () => {
  it('swapping a disk: fetch part from storage, walk to rack, work, fix', () => {
    const s = quietGame('ch1');
    const d = s.devices[0]!;
    applyFault(s, d, 'disk');
    const stock = s.inventory.disk;
    const res = applyCommand(s, { type: 'dispatch', job: 'swapDisk', deviceId: d.id, techId: 'best' });
    expect(res.ok).toBe(true);
    expect(s.inventory.disk).toBe(stock - 1);
    const job = s.jobs[0]!;
    expect(job.stage).toBe('toStorage');

    let sawCarrying = false;
    let m = 0;
    while (job.stage !== 'done' && m < 600) {
      updateTechs(s, 1);
      s.minute++;
      m++;
      if (s.techs[0]!.carrying === 'disk') sawCarrying = true;
    }
    expect(sawCarrying).toBe(true);
    expect(m).toBeGreaterThan(JOB_WORK_MIN.swapDisk);
    expect(d.faults).toEqual([]);
    expect(s.alarms).toHaveLength(0);
    expect(s.techs[0]!.jobId).toBeNull();
    expect(s.stats.resolved).toBe(1);
  });

  it('jobs without parts go straight to the site', () => {
    const s = quietGame('ch1');
    const d = s.devices[0]!;
    applyFault(s, d, 'hung');
    applyCommand(s, { type: 'dispatch', job: 'reboot', deviceId: d.id, techId: 'manager' });
    expect(s.jobs[0]!.stage).toBe('toSite');
    runTechs(s);
    expect(deviceUp(s, d)).toBe(true);
  });

  it('a tech handles a queue of jobs one after another', () => {
    const s = quietGame('ch1');
    applyFault(s, s.devices[0]!, 'hung');
    applyFault(s, s.devices[1]!, 'hung');
    applyCommand(s, { type: 'dispatch', job: 'reboot', deviceId: s.devices[0]!.id, techId: 'manager' });
    applyCommand(s, { type: 'dispatch', job: 'reboot', deviceId: s.devices[1]!.id, techId: 'manager' });
    runTechs(s);
    expect(s.devices[0]!.faults).toEqual([]);
    expect(s.devices[1]!.faults).toEqual([]);
  });

  it('resetting a breaker brings the rack back', () => {
    const s = quietGame('ch1');
    s.racks[0]!.tripped = true;
    applyCommand(s, { type: 'dispatch', job: 'resetBreaker', rackId: s.racks[0]!.id, techId: 'best' });
    runTechs(s);
    expect(s.racks[0]!.tripped).toBe(false);
  });

  it('installing a server creates the device assigned to a contract', () => {
    const s = quietGame('ch1');
    const rack = s.racks[2]!;
    const before = s.devices.length;
    const contractId = s.contracts[0]!.id;
    const res = applyCommand(s, { type: 'install', rackId: rack.id, slot: 5, model: 'server1u', contractId, techId: 'best' });
    expect(res.ok).toBe(true);
    runTechs(s);
    expect(s.devices).toHaveLength(before + 1);
    const dev = s.devices[s.devices.length - 1]!;
    expect(dev.rackId).toBe(rack.id);
    expect(dev.slot).toBe(5);
    expect(dev.contractId).toBe(contractId);
  });

  it('removing a server returns it to stock', () => {
    const s = quietGame('ch1');
    const d = s.devices[0]!;
    const stock = s.inventory.server1u;
    applyCommand(s, { type: 'dispatch', job: 'remove', deviceId: d.id, techId: 'best' });
    runTechs(s);
    expect(s.devices.find((x) => x.id === d.id)).toBeUndefined();
    expect(s.inventory.server1u).toBe(stock + 1);
  });

  it('building a rack and placing a cooler change the floor', () => {
    const s = quietGame('ch2');
    s.inventory.rack = 1;
    s.inventory.portableAc = 1;
    const racks = s.racks.length;
    expect(applyCommand(s, { type: 'buildRack', pos: { x: 4, y: 6 }, techId: 'best' }).ok).toBe(true);
    expect(applyCommand(s, { type: 'placeCooler', coolerKind: 'portableAc', pos: { x: 8, y: 6 }, techId: 'best' }).ok).toBe(true);
    runTechs(s, 2000);
    expect(s.racks).toHaveLength(racks + 1);
    expect(s.coolers.some((c) => c.kind === 'portableAc')).toBe(true);
  });

  it('hired techs with more skill work faster than the manager', () => {
    const time = (techId: string) => {
      const s = quietGame('ch1');
      const cand = s.candidates[0]!;
      cand.skill = 5;
      cand.trait = null;
      applyCommand(s, { type: 'hire', candidateId: cand.id });
      const tech = s.techs.find((t) => t.role === 'hw')!;
      tech.pos = { ...s.techs[0]!.pos };
      applyFault(s, s.devices[0]!, 'hung');
      applyCommand(s, { type: 'dispatch', job: 'reboot', deviceId: s.devices[0]!.id, techId: techId === 'hw' ? tech.id : 'manager' });
      return runTechs(s);
    };
    expect(time('hw')).toBeLessThan(time('manager'));
  });

  it('cancelling a job returns its part', () => {
    const s = quietGame('ch1');
    applyFault(s, s.devices[0]!, 'disk');
    const stock = s.inventory.disk;
    applyCommand(s, { type: 'dispatch', job: 'swapDisk', deviceId: s.devices[0]!.id, techId: 'best' });
    expect(applyCommand(s, { type: 'cancelJob', jobId: s.jobs[0]!.id }).ok).toBe(true);
    expect(s.inventory.disk).toBe(stock);
    expect(s.jobs).toHaveLength(0);
    expect(s.techs[0]!.jobId).toBeNull();
  });
});

describe('staff room spots', () => {
  it('each person gets their own staff-room tile instead of stacking on one', () => {
    const s = quietGame('ch3');
    while (s.candidates.length) applyCommand(s, { type: 'hire', candidateId: s.candidates[0]!.id });
    const spots = s.techs.map((t) => `${Math.round(t.pos.x)},${Math.round(t.pos.y)}`);
    const tiles = s.grid.tiles.filter((k) => k === 'noc').length;
    expect(new Set(spots).size).toBe(Math.min(s.techs.length, tiles)); // as many distinct spots as the room has
    for (const t of s.techs) expect(tileAt(s.grid, Math.round(t.pos.x), Math.round(t.pos.y))).toBe('noc');
  });

  it('after a job, a tech walks back to their own spot', () => {
    const s = quietGame('ch3');
    const hw = s.techs.find((t) => t.role === 'hw')!;
    const mine = homeSpot(s, hw);
    applyFault(s, s.devices[0]!, 'hung');
    applyCommand(s, { type: 'dispatch', job: 'reboot', deviceId: s.devices[0]!.id, techId: hw.id });
    runTechs(s);
    for (let i = 0; i < 200; i++) updateTechs(s, 1);
    expect({ x: Math.round(hw.pos.x), y: Math.round(hw.pos.y) }).toEqual(mine);
  });
});
