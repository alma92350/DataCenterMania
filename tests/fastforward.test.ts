import { at } from '../src/core/time';
import { applyCommand } from '../src/sim/commands';
import { fastForward } from '../src/sim/fastforward';
import { advance } from '../src/sim/sim';
import { createGame } from '../src/sim/state';
import { raiseAlarm } from '../src/sim/alarms';
import { corruptNode } from '../src/sim/ai';
import type { GameState } from '../src/sim/types';
import { autopilot } from './autopilot';

const clone = (s: GameState): GameState => JSON.parse(JSON.stringify(s)) as GameState;

describe('fast-forward (what the Web Worker runs)', () => {
  it('stops at the next shift or after a day, and reports no wake-up on a quiet night', () => {
    const s = createGame('ch1', 'sysadmin', 4);
    s.failuresEnabled = false;
    const woke = fastForward(s);
    expect(woke).toBeNull();
    expect(s.minute).toBeGreaterThan(0);
    expect(s.minute).toBeLessThanOrEqual(1440);
  });

  it('gives the same result on a structured-clone copy as on the original (nothing hides outside the state)', () => {
    for (const chapter of ['ch4', 'ch8', 'ch10'] as const) {
      const a = createGame(chapter, 'sysadmin', 9);
      a.aiForce = true;
      for (let i = 0; i < 400; i++) {
        if (a.minute % 5 === 0) autopilot(a, { auto: true });
        advance(a, 1);
      }
      if (chapter === 'ch8') corruptNode(a);
      const b = clone(a); // what a worker receives
      const wa = fastForward(a, 600);
      const wb = fastForward(b, 600);
      expect(wb).toEqual(wa);
      expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    }
  }, 60000);

  it('keeps the silent-corruption timer in the state, so a saved or cloned game still discovers it', () => {
    const s = createGame('ch8', 'sysadmin', 5);
    s.failuresEnabled = false;
    s.aiForce = true;
    s.progress.firedEvents.push('pump', 'spike1', 'winter', 'sdc', 'spike2');
    const rack = s.racks.find((r) => !s.devices.some((d) => d.rackId === r.id))!;
    rack.liquid = true;
    advance(s, at(0, 9, 5));
    const offer = s.contracts.find((c) => c.kind === 'ai')!;
    applyCommand(s, { type: 'acceptContract', contractId: offer.id });
    s.devices.push({ id: 'gpu0', model: 'server2u', rackId: rack.id, slot: 0, faults: [], poweredOn: true, thermalShutdown: false, contractId: offer.id, load: 0, psus: 2, gpu: true });
    advance(s, 5);
    corruptNode(s);
    expect(Object.keys(s.corruptSince ?? {}).length).toBe(1);
    const copy = clone(s);
    advance(copy, 400);
    expect(Object.keys(copy.corruptSince ?? {}).length).toBe(0); // found by a customer after the timeout
  });

  it('wakes the player for a critical alarm', () => {
    const s = createGame('ch5', 'sysadmin', 2);
    s.failuresEnabled = false;
    s.shift = null;
    s.minute = 22 * 60; // after the shift: the night
    raiseAlarm(s, 'oob', null, null, 2, 5); // escalates to critical after five minutes
    const woke = fastForward(s, 1440);
    expect(woke).not.toBeNull();
    expect(woke!.minute).toBeLessThan(22 * 60 + 60);
    expect(s.minute).toBe(woke!.minute);
  });
});
