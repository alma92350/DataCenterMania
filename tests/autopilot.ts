import { applyCommand, suggestedCoolerJob, suggestedJob } from '../src/sim/commands';
import { hourOf } from '../src/core/time';
import { firstFreeSlot, activeContracts, contractAssignedUnits } from '../src/sim/selectors';
import { BACKUP, PARTS, PROJECTS } from '../src/data/catalog';
import type { GameState } from '../src/sim/types';

/** A simple bot standing in for a competent player: fix every alarm, keep spares, fill contracts. */
export type Defend = 'auto' | 'perfect' | 'ignore';

export function autopilot(s: GameState, opts: { auto?: boolean; defend?: Defend; power?: 'prepared' | 'negligent'; noc?: boolean; legs?: 'dual' | 'single'; changes?: 'careful' | 'reckless' } = {}): void {
  // cyber attacks: skip the micro-game (half strength), play it perfectly, or never answer
  if (s.cyber.attack && opts.defend !== 'ignore') {
    if (opts.defend === 'perfect') applyCommand(s, { type: 'resolveAttack', score: 1, mode: 'played', infected: [] });
    else applyCommand(s, { type: 'resolveAttack', score: 1, mode: 'auto' });
  }
  // a player who trusts the Shift Lead hires one early and lets them handle routine alarms and requests
  if (opts.auto && s.features.includes('autodispatch')) {
    if (!s.techs.some((t) => t.role === 'lead') && s.cash > 4000) applyCommand(s, { type: 'hireLead' });
    if (s.techs.some((t) => t.role === 'lead') && !s.autoDispatch) applyCommand(s, { type: 'setAutoDispatch', on: true });
  }
  const delegated = !!opts.auto && s.autoDispatch;
  for (const a of s.alarms) {
    if (delegated) break;
    const job = suggestedJob(a.kind);
    if (!job) continue;
    if (s.jobs.some((j) => (a.deviceId ? j.deviceId === a.deviceId : j.rackId === a.rackId) && j.kind === job)) continue;
    applyCommand(s, { type: 'dispatch', job, deviceId: a.deviceId ?? undefined, rackId: a.rackId ?? undefined, uplinkId: a.uplinkId ?? undefined, techId: 'best' });
  }
  for (const a of s.alarms) {
    if (delegated) break;
    const job = suggestedCoolerJob(a.kind);
    if (!job || !a.coolerId || s.jobs.some((j) => j.coolerId === a.coolerId)) continue;
    applyCommand(s, { type: job, coolerId: a.coolerId, techId: 'best' });
  }
  const spares: ('disk' | 'psu' | 'filter' | 'switch')[] = ['disk', 'psu'];
  if (s.features.includes('maintenance')) spares.push('filter');
  if (s.features.includes('network')) spares.push('switch');
  for (const part of spares) {
    const incoming = s.orders.filter((o) => o.part === part).reduce((n, o) => n + o.qty, 0);
    if (s.inventory[part] + incoming < 2 && s.cash > 2000) applyCommand(s, { type: 'order', part, qty: 2 });
  }
  if (s.features.includes('hire') && s.techs.length < 2 && s.candidates[0]) {
    applyCommand(s, { type: 'hire', candidateId: s.candidates[0].id });
  }
  if (s.features.includes('roles')) {
    for (const role of ['hvac', 'net', 'elec'] as const) {
      const cand = s.candidates.find((c) => c.role === role);
      if (!s.techs.some((t) => t.role === role) && cand) applyCommand(s, { type: 'hire', candidateId: cand.id });
    }
  }
  // change management: careful players use the night window and a rollback plan; reckless ones run everything now
  if (s.features.includes('changes')) {
    for (const c of s.changes ?? []) {
      if (c.status !== 'offered') continue;
      if (opts.changes === 'reckless') applyCommand(s, { type: 'scheduleChange', changeId: c.id, when: 'now' });
      else {
        applyCommand(s, { type: 'setRollback', changeId: c.id, on: true });
        applyCommand(s, { type: 'scheduleChange', changeId: c.id, when: 'tonight' });
      }
    }
    for (const p of s.pendingInfra ?? []) void p;
  }
  // redundancy: dual-cord the servers that serve customers, one at a time
  if (s.features.includes('redundancy') && opts.legs !== 'single' && !s.jobs.some((j) => j.kind === 'dualCord')) {
    const d = s.devices.find((x) => x.contractId !== null && (x.psus ?? 1) !== 2);
    if (d) applyCommand(s, { type: 'dispatch', job: 'dualCord', deviceId: d.id, techId: 'best' });
  }
  // NOC: buy remote reboot early, then use it instead of walking to hung servers
  if (opts.noc && s.features.includes('remote')) {
    if ((s.noc ?? 0) < 1 && s.cash > 3000) applyCommand(s, { type: 'upgradeNoc' });
    if ((s.noc ?? 0) >= 1) {
      for (const a of s.alarms) if (a.kind === 'hung' && a.deviceId) applyCommand(s, { type: 'remoteReboot', deviceId: a.deviceId });
    }
  }
  // backup power: test the generator while the grid is up, change worn batteries, add a second UPS
  if (s.backup && opts.power !== 'negligent') {
    const b = s.backup;
    const tested = b.testedAt !== null && s.minute - b.testedAt < BACKUP.genTestValidMin - 360;
    if (b.grid && b.generator === 'idle' && !tested && !s.jobs.some((j) => j.kind === 'testGenerator')) applyCommand(s, { type: 'dispatch', job: 'testGenerator', techId: 'best' });
    if (b.grid && b.health < 0.6) applyCommand(s, { type: 'dispatch', job: 'replaceBattery', techId: 'best' });
    if (b.upsUnits < 2 && s.cash > 9000) applyCommand(s, { type: 'buyUps' });
    if (b.grid && (b.fuelMin ?? 1440) < 1000 && !s.jobs.some((j) => j.kind === 'refuel')) applyCommand(s, { type: 'dispatch', job: 'refuel', techId: 'best' });
  }
  if (s.features.includes('fatigue') && s.coffeeLevel === 0 && s.cash > 9000 && !s.orders.some((o) => o.part === 'coffee')) {
    applyCommand(s, { type: 'order', part: 'coffee', qty: 1 });
  }
  if (s.features.includes('network') && s.uplinks.length < 2 && s.cash > 6000) {
    const fullTraffic = s.contracts
      .filter((c) => c.status !== 'ended')
      .reduce((sum, c) => sum + c.units * c.bandwidthPerUnit, 0);
    const cap = s.uplinks.reduce((sum, u) => sum + u.capacityGbps, 0);
    if (fullTraffic > cap * 0.8 || s.alarms.some((a) => a.kind === 'bandwidth' || a.kind === 'uplink')) applyCommand(s, { type: 'buyUplink' });
  }
  for (const w of s.walkins) {
    if (!delegated && w.status === 'open' && !s.jobs.some((j) => j.walkinId === w.id)) applyCommand(s, { type: 'dispatch', job: 'favor', walkinId: w.id, techId: 'best' });
  }
  if (s.features.includes('projects') && !s.alarms.some((x) => x.severity >= 2)) {
    for (const p of ['labels', 'firmware', 'cableTidy'] as const) {
      if (!s.projects.includes(p) && !s.jobs.some((j) => j.projectId === p) && s.cash > PROJECTS[p].cost + 6000) {
        applyCommand(s, { type: 'startProject', project: p });
        break;
      }
    }
  }
  // fix the airflow at night, when rotating a rack hurts least
  if (s.features.includes('aisles') && hourOf(s.minute) < 5) {
    for (const a of s.racks) {
      if (a.recirculation <= 0) continue;
      const d = a.facing === 'S' ? 1 : -1;
      const offender = [1, 2].map((k) => s.racks.find((r) => r.pos.x === a.pos.x && r.pos.y === a.pos.y + d * k)).find(Boolean);
      if (offender && !s.jobs.some((j) => j.kind === 'rotateRack')) {
        applyCommand(s, { type: 'dispatch', job: 'rotateRack', rackId: offender.id, techId: 'best' });
      }
    }
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
