import { applyCommand, suggestedJob } from '../src/sim/commands';
import { firstFreeSlot, activeContracts, contractAssignedUnits } from '../src/sim/selectors';
import { PARTS } from '../src/data/catalog';
import type { GameState } from '../src/sim/types';

/** A simple bot standing in for a competent player: fix every alarm, keep spares, fill contracts. */
export function autopilot(s: GameState): void {
  for (const a of s.alarms) {
    const job = suggestedJob(a.kind);
    if (!job) continue;
    if (s.jobs.some((j) => (a.deviceId ? j.deviceId === a.deviceId : j.rackId === a.rackId) && j.kind === job)) continue;
    applyCommand(s, { type: 'dispatch', job, deviceId: a.deviceId ?? undefined, rackId: a.rackId, techId: 'best' });
  }
  for (const part of ['disk', 'psu'] as const) {
    const incoming = s.orders.filter((o) => o.part === part).reduce((n, o) => n + o.qty, 0);
    if (s.inventory[part] + incoming < 2 && s.cash > 2000) applyCommand(s, { type: 'order', part, qty: 2 });
  }
  if (s.features.includes('hire') && s.techs.length < 2 && s.candidates[0]) {
    applyCommand(s, { type: 'hire', candidateId: s.candidates[0].id });
  }
  const unfilled = (c: GameState['contracts'][number]) =>
    c.units + 1 - contractAssignedUnits(s, c.id) - s.jobs.filter((j) => j.kind === 'install' && j.contractId === c.id).length;
  const offer = s.contracts.find((x) => x.status === 'offered');
  if (offer && activeContracts(s).every((c) => unfilled(c) <= 0) && s.cash >= (offer.units + 1) * PARTS.server1u.price + 1500 && activeContracts(s).length < 6) {
    applyCommand(s, { type: 'acceptContract', contractId: offer.id });
  }
  for (const c of activeContracts(s)) {
    let missing = unfilled(c);
    const free = s.devices.find((d) => d.contractId === null);
    if (missing > 0 && free) {
      applyCommand(s, { type: 'assign', deviceId: free.id, contractId: c.id });
      missing--;
    }
    if (missing <= 0) continue;
    if (s.inventory.server1u < 1) {
      const incoming = s.orders.filter((o) => o.part === 'server1u').reduce((n, o) => n + o.qty, 0);
      if (incoming < missing && s.cash > PARTS.server1u.price * missing + 500) applyCommand(s, { type: 'order', part: 'server1u', qty: missing - incoming });
      continue;
    }
    const rack = [...s.racks]
      .filter((r) => r.loadW + 400 < r.powerBudgetW * 0.85)
      .sort((a, b) => a.loadW - b.loadW)
      .find((r) => firstFreeSlot(s, r, 1) !== null);
    if (rack) applyCommand(s, { type: 'install', rackId: rack.id, slot: firstFreeSlot(s, rack, 1)!, model: 'server1u', contractId: c.id, techId: 'best' });
  }
}
