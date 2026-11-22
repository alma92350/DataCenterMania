import { at } from '../src/core/time';
import { applyCommand } from '../src/sim/commands';
import { failPdu, repairPdu } from '../src/sim/feeds';
import { devicePowerW } from '../src/sim/power';
import { deviceUp, onOneLeg, overallUptimePct } from '../src/sim/selectors';
import { raiseAlarm } from '../src/sim/alarms';
import { advance } from '../src/sim/sim';
import { createGame } from '../src/sim/state';
import { applyFault } from '../src/sim/failures';
import type { GameState } from '../src/sim/types';
import { autopilot } from './autopilot';
import { measure } from './engagement';

function ch6(seed = 1): GameState {
  const s = createGame('ch6', 'sysadmin', seed);
  s.failuresEnabled = false;
  return s;
}
const rackOf = (s: GameState, i = 0) => s.racks[i]!;
const devOf = (s: GameState, rack = rackOf(s)) => s.devices.find((d) => d.rackId === rack.id)!;

describe('redundant power: legs', () => {
  it('a single-corded server dies with feed A and ignores feed B', () => {
    const s = ch6();
    const r = rackOf(s);
    const d = devOf(s, r);
    expect(deviceUp(s, d)).toBe(true);
    failPdu(s, r, 'B');
    expect(deviceUp(s, d)).toBe(true);
    repairPdu(s, r, 'B');
    failPdu(s, r, 'A');
    expect(deviceUp(s, d)).toBe(false);
    expect(devicePowerW(s, d)).toBe(0);
  });

  it('a dual-corded server survives one feed, and dies only when both fail', () => {
    const s = ch6();
    const r = rackOf(s);
    const d = devOf(s, r);
    d.psus = 2;
    failPdu(s, r, 'A');
    expect(deviceUp(s, d)).toBe(true);
    expect(onOneLeg(s, d)).toBe(true);
    expect(devicePowerW(s, d)).toBeGreaterThan(0);
    failPdu(s, r, 'B');
    expect(deviceUp(s, d)).toBe(false);
    repairPdu(s, r, 'A');
    expect(deviceUp(s, d)).toBe(true);
    expect(onOneLeg(s, d)).toBe(true);
    repairPdu(s, r, 'B');
    expect(onOneLeg(s, d)).toBe(false);
  });

  it('a dead PSU is an outage for a single-corded server and a warning for a dual-corded one', () => {
    const s = ch6();
    const [a, b] = s.devices.filter((d) => d.rackId === rackOf(s).id).slice(0, 2) as [typeof s.devices[0], typeof s.devices[0]];
    b!.psus = 2;
    applyFault(s, a!, 'psu');
    applyFault(s, b!, 'psu');
    expect(deviceUp(s, a!)).toBe(false);
    expect(deviceUp(s, b!)).toBe(true);
    expect(onOneLeg(s, b!)).toBe(true);
    expect(s.alarms.find((x) => x.kind === 'psu' && x.deviceId === a!.id)!.severity).toBe(2);
    expect(s.alarms.find((x) => x.kind === 'psu' && x.deviceId === b!.id)!.severity).toBe(1);
    b!.psus = 1;
    expect(deviceUp(s, b!)).toBe(false);
  });

  it('before Chapter 6 nothing changes: every server is single-corded on feed A', () => {
    const s = createGame('ch4', 'sysadmin', 1);
    expect(s.features).not.toContain('redundancy');
    expect(s.devices.every((d) => (d.psus ?? 1) === 1)).toBe(true);
    expect(s.devices.every((d) => deviceUp(s, d))).toBe(true);
  });
});

describe('redundant power: feed failures, repair and dual-cording', () => {
  it('a feed failure raises an alarm: critical when servers go down, a warning when every server has two legs', () => {
    const s = ch6();
    const r = rackOf(s, 1);
    failPdu(s, r, 'A');
    expect(s.alarms.find((a) => a.kind === 'feed' && a.rackId === r.id)!.severity).toBe(3);
    const t = ch6();
    for (const d of t.devices) d.psus = 2;
    failPdu(t, rackOf(t, 1), 'A');
    expect(t.alarms.find((a) => a.kind === 'feed')!.severity).toBe(1);
  });

  it('an electrician repairs the feed and the alarm clears', () => {
    const s = ch6();
    const r = rackOf(s, 1);
    failPdu(s, r, 'A');
    const cand = s.candidates.find((c) => c.role === 'elec')!;
    expect(applyCommand(s, { type: 'hire', candidateId: cand.id }).ok).toBe(true);
    expect(applyCommand(s, { type: 'dispatch', job: 'repairPdu', rackId: r.id, techId: 'best' }).ok).toBe(true);
    expect(applyCommand(s, { type: 'dispatch', job: 'repairPdu', rackId: r.id, techId: 'best' }).ok).toBe(false);
    advance(s, 120);
    expect(r.pduA).toBe('ok');
    expect(s.alarms.some((a) => a.kind === 'feed')).toBe(false);
    expect(applyCommand(s, { type: 'dispatch', job: 'repairPdu', rackId: r.id, techId: 'best' }).ok).toBe(false);
  });

  it('dual-cording consumes a spare PSU and gives the server two legs', () => {
    const s = ch6();
    const d = devOf(s);
    const stock = s.inventory.psu;
    expect(applyCommand(s, { type: 'dispatch', job: 'dualCord', deviceId: d.id, techId: 'best' }).ok).toBe(true);
    expect(s.inventory.psu).toBe(stock - 1);
    advance(s, 120);
    expect(d.psus).toBe(2);
    expect(applyCommand(s, { type: 'dispatch', job: 'dualCord', deviceId: d.id, techId: 'best' }).ok).toBe(false);
    s.inventory.psu = 0;
    const e = s.devices.find((x) => (x.psus ?? 1) === 1)!;
    expect(applyCommand(s, { type: 'dispatch', job: 'dualCord', deviceId: e.id, techId: 'best' }).ok).toBe(false);
    expect(applyCommand(createGame('ch5', 'sysadmin', 1), { type: 'dispatch', job: 'dualCord', deviceId: 'd1', techId: 'best' }).ok).toBe(false);
  });

  it('new servers installed in Chapter 6 arrive dual-corded', () => {
    const s = ch6();
    const r = rackOf(s, 2);
    const slot = [...Array(40).keys()].find((u) => !s.devices.some((d) => d.rackId === r.id && d.slot === u))!;
    s.inventory.server1u = 1;
    expect(applyCommand(s, { type: 'install', rackId: r.id, slot, model: 'server1u', contractId: null, techId: 'best' }).ok).toBe(true);
    advance(s, 200);
    expect(s.devices.find((d) => d.rackId === r.id && d.slot === slot)!.psus).toBe(2);
  });

  it('the scripted chain: an unrepaired second feed takes a dual-corded rack down on Wednesday evening', () => {
    const s = createGame('ch6', 'sysadmin', 3);
    s.failuresEnabled = false;
    for (const d of s.devices) d.psus = 2;
    advance(s, at(2, 16) - s.minute);
    const r = s.racks[3]!;
    expect(r.pduB).toBe('failed');
    expect(s.devices.filter((d) => d.rackId === r.id).every((d) => deviceUp(s, d) && onOneLeg(s, d))).toBe(true);
    advance(s, 120);
    expect(r.pduA).toBe('failed');
    expect(s.devices.filter((d) => d.rackId === r.id).every((d) => !deviceUp(s, d))).toBe(true);
  });

  it('a prepared bot dual-cords everything and wins; a bot that never dual-cords loses uptime', () => {
    const play = (legs: 'dual' | 'single', seed: number) => {
      const s = createGame('ch6', 'sysadmin', seed);
      while (s.progress.status === 'playing') {
        if (s.minute % 5 === 0) autopilot(s, { auto: true, legs });
        advance(s, 1);
      }
      return s;
    };
    const dual = [1, 2, 3].map((seed) => play('dual', seed));
    const single = [1, 2, 3].map((seed) => play('single', seed));
    expect(dual.filter((s) => s.progress.status === 'won').length).toBeGreaterThanOrEqual(2);
    const avg = (xs: GameState[]) => xs.reduce((n, s) => n + overallUptimePct(s), 0) / xs.length;
    expect(avg(dual)).toBeGreaterThan(avg(single));
  });

  it('keeps the bot engagement guardrails in Chapter 6', () => {
    const m = measure('ch6', 1, 'sysadmin', true);
    expect(m.shiftRealMinutes.every((x) => x >= 3 && x <= 10)).toBe(true);
    expect(m.quietDaytimePct).toBeLessThanOrEqual(70);
  });

  it('is deterministic', () => {
    const run = () => { const s = createGame('ch6', 'sysadmin', 7); advance(s, 2 * 1440); return JSON.stringify(s); };
    expect(run()).toBe(run());
    void raiseAlarm;
  });
});
