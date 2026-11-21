import { at } from '../src/core/time';
import { createGame } from '../src/sim/state';
import { step } from '../src/sim/sim';
import { applyFault } from '../src/sim/failures';
import { applyCommand } from '../src/sim/commands';
import { cutUplink } from '../src/sim/network';
import { contractLabel } from '../src/sim/naming';
import type { GameState } from '../src/sim/types';

function quiet(ch: GameState['chapter'] = 'ch1'): GameState {
  const s = createGame(ch, 'sysadmin', 1);
  s.failuresEnabled = false;
  s.progress.firedEvents = ['*all*'];
  s.minute = at(0, 10);
  return s;
}

function run(s: GameState, minutes: number) {
  for (let i = 0; i < minutes; i++) step(s);
}

describe('outage post-mortems', () => {
  it('a long outage produces a post-mortem with cause, prevention and a remedy', () => {
    const s = quiet();
    const c = s.contracts[0]!;
    const devices = s.devices.filter((d) => d.contractId === c.id);
    for (const d of devices) applyFault(s, d, 'psu');
    run(s, 20);
    for (const d of devices) d.faults = [];
    run(s, 2);
    const pm = s.postMortems.at(-1)!;
    expect(pm).toBeDefined();
    expect(pm.customer).toBe(contractLabel(c));
    expect(pm.minutes).toBeGreaterThanOrEqual(20);
    expect(pm.kind).toBe('psu');
    expect(pm.cause).toMatch(/power supply/i);
    expect(pm.prevent.length).toBeGreaterThan(10);
    expect(pm.remedy?.cmd).toEqual({ type: 'order', part: 'psu', qty: 2 });
    expect(s.pendingPostMortem?.id).toBe(pm.id);
  });

  it('short blips do not produce one', () => {
    const s = quiet();
    const devices = s.devices.filter((d) => d.contractId === s.contracts[0]!.id);
    for (const d of devices) applyFault(s, d, 'psu');
    run(s, 5);
    for (const d of devices) d.faults = [];
    run(s, 2);
    expect(s.postMortems).toHaveLength(0);
  });

  it('blames capacity when no hardware alarm explains it', () => {
    const s = quiet();
    const c = s.contracts[0]!;
    const devices = s.devices.filter((d) => d.contractId === c.id);
    for (const d of devices) d.contractId = null; // nobody serving the customer
    run(s, 15);
    for (const d of devices) d.contractId = c.id;
    run(s, 2);
    expect(s.postMortems.at(-1)?.kind).toBe('capacity');
  });

  it('a fiber cut suggests a second uplink, and the remedy works as a command', () => {
    const s = quiet('ch4');
    cutUplink(s, s.uplinks[0]!);
    run(s, 15);
    s.uplinks[0]!.up = true;
    run(s, 2);
    const pm = s.postMortems.at(-1)!;
    expect(pm.kind).toBe('uplink');
    expect(pm.remedy?.cmd).toEqual({ type: 'buyUplink' });
    expect(applyCommand(s, pm.remedy!.cmd).ok).toBe(true);
  });
});
