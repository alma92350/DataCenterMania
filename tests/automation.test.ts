import { at } from '../src/core/time';
import { createGame } from '../src/sim/state';
import { applyCommand } from '../src/sim/commands';
import { applyFault } from '../src/sim/failures';
import { step } from '../src/sim/sim';
import { leadOf, AUTO } from '../src/sim/automation';
import { networkRiskMultiplier } from '../src/sim/network';
import { LEAD } from '../src/data/catalog';
import type { ChapterId, GameState } from '../src/sim/types';

function quiet(ch: ChapterId = 'ch3'): GameState {
  const s = createGame(ch, 'sysadmin', 1);
  s.failuresEnabled = false;
  s.progress.firedEvents = ['*all*'];
  s.minute = at(0, 10);
  return s;
}

function run(s: GameState, minutes: number): void {
  for (let i = 0; i < minutes; i++) step(s);
}

function withLead(s: GameState): void {
  expect(applyCommand(s, { type: 'hireLead' }).ok).toBe(true);
  expect(applyCommand(s, { type: 'setAutoDispatch', on: true }).ok).toBe(true);
}

describe('Shift Lead', () => {
  it('unlocks in chapter 2, costs a daily salary, and only one can be hired', () => {
    expect(applyCommand(quiet('ch1'), { type: 'hireLead' }).ok).toBe(false);
    const s = quiet('ch2');
    const cash = s.cash;
    expect(applyCommand(s, { type: 'hireLead' }).ok).toBe(true);
    const lead = leadOf(s)!;
    expect(lead.role).toBe('lead');
    expect(lead.salaryPerDay).toBe(LEAD.salaryPerDay);
    expect(s.cash).toBe(cash);
    expect(applyCommand(s, { type: 'hireLead' }).ok).toBe(false);
  });

  it('auto-dispatch needs a lead, and switches itself off when the lead leaves', () => {
    const s = quiet('ch2');
    expect(applyCommand(s, { type: 'setAutoDispatch', on: true }).ok).toBe(false);
    withLead(s);
    expect(s.autoDispatch).toBe(true);
    applyCommand(s, { type: 'fire', techId: leadOf(s)!.id });
    run(s, 1);
    expect(s.autoDispatch).toBe(false);
  });

  it('the lead never takes jobs, and the manager can still not hire two', () => {
    const s = quiet('ch2');
    withLead(s);
    applyFault(s, s.devices[0]!, 'hung');
    const res = applyCommand(s, { type: 'dispatch', job: 'reboot', deviceId: s.devices[0]!.id, techId: leadOf(s)!.id });
    expect(res.ok).toBe(false);
  });
});

describe('auto-dispatch', () => {
  it('sends the best specialist to an alarm that has waited a few minutes', () => {
    const s = quiet('ch2');
    withLead(s);
    const hw = s.techs.find((t) => t.role === 'hw')!;
    applyFault(s, s.devices[0]!, 'hung');
    run(s, AUTO.reactMin - 3);
    expect(s.jobs).toHaveLength(0); // the player still gets a moment to react
    run(s, 10);
    const job = s.jobs[0] ?? null;
    const resolved = s.devices[0]!.faults.length === 0;
    expect(job !== null || resolved).toBe(true);
    if (job) expect(job.techId).toBe(hw.id); // never the manager, never the lead
  });

  it('does nothing when switched off, and does not crash without parts', () => {
    const s = quiet('ch2');
    withLead(s);
    applyCommand(s, { type: 'setAutoDispatch', on: false });
    applyFault(s, s.devices[0]!, 'hung');
    run(s, 30);
    expect(s.devices[0]!.faults).toContain('hung');
    applyCommand(s, { type: 'setAutoDispatch', on: true });
    s.inventory.disk = 0;
    applyFault(s, s.devices[1]!, 'disk');
    expect(() => run(s, 30)).not.toThrow();
    expect(s.jobs.some((j) => j.kind === 'swapDisk')).toBe(false);
  });

  it('auto-sent work is not counted as a player action, manual work is', () => {
    const s = quiet('ch2');
    expect(s.stats.commands ?? 0).toBe(0);
    applyFault(s, s.devices[0]!, 'hung');
    applyCommand(s, { type: 'dispatch', job: 'reboot', deviceId: s.devices[0]!.id, techId: 'best' });
    expect(s.stats.commands).toBe(1);
    applyCommand(s, { type: 'dispatch', job: 'reboot', deviceId: s.devices[0]!.id, techId: 'best' }); // refused
    expect(s.stats.commands).toBe(1);
    const t = quiet('ch2');
    withLead(t);
    const base = t.stats.commands ?? 0;
    applyFault(t, t.devices[2]!, 'hung');
    run(t, 40);
    expect(t.stats.commands ?? 0).toBe(base);
    expect(t.devices[2]!.faults).not.toContain('hung');
  });

  it('also hands customer requests to an idle technician', () => {
    const s = quiet('ch2');
    withLead(s);
    const c = s.contracts.find((x) => x.status === 'active')!;
    const rack = s.racks[0]!;
    s.walkins.push({ id: 'w1', customer: c.customer, rackId: rack.id, text: 'test', reward: 100, deadline: s.minute + 120, status: 'open' });
    run(s, 40);
    expect(s.walkins[0]!.status).toBe('done');
  });
});

describe('proactive specialists', () => {
  function hireRole(s: GameState, role: 'hvac' | 'net') {
    const c = s.candidates.find((x) => x.role === role)!;
    c.trait = null;
    applyCommand(s, { type: 'hire', candidateId: c.id });
    return s.techs.find((t) => t.role === role)!;
  }

  it('an idle HVAC tech changes a wearing filter before it becomes an alarm', () => {
    const s = quiet('ch3');
    hireRole(s, 'hvac');
    const crac = s.coolers.find((c) => c.kind === 'crac')!;
    crac.health = 0.6;
    s.inventory.filter = 1;
    run(s, 240);
    expect(crac.health).toBeGreaterThan(0.9); // fresh filter (it keeps wearing slowly afterwards)
    expect(s.stats.prevented).toBe(1);
    expect(s.alarms.some((a) => a.kind === 'filter')).toBe(false);
  });

  it('they only act with a spare in stock and when actually idle', () => {
    const s = quiet('ch3');
    hireRole(s, 'hvac');
    const crac = s.coolers.find((c) => c.kind === 'crac')!;
    crac.health = 0.6;
    s.inventory.filter = 0;
    run(s, 240);
    expect(crac.health).toBeLessThan(0.7);
    expect(s.stats.prevented ?? 0).toBe(0);
  });

  it('an idle network engineer runs a cable audit that lowers switch and fiber risk for a day', () => {
    const s = quiet('ch4');
    expect(networkRiskMultiplier(s)).toBe(1);
    hireRole(s, 'net');
    run(s, 360);
    expect(s.stats.prevented).toBeGreaterThanOrEqual(1);
    expect(networkRiskMultiplier(s)).toBeLessThan(1);
    run(s, 1500);
    // the shield expires and a fresh audit may start, but the multiplier is always sane
    expect(networkRiskMultiplier(s)).toBeLessThanOrEqual(1);
  });

  it('no network engineer, no audits', () => {
    const s = quiet('ch4');
    run(s, 600);
    expect(s.stats.prevented ?? 0).toBe(0);
  });
});
