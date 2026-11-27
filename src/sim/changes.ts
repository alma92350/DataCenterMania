import { chance, pick } from '../core/rng';
import { dayOf, hourOf } from '../core/time';
import { CHANGE, CHANGES, COOLERS, LEAD_TIME, PARTS, SITE, SUPPLY } from '../data/catalog';
import { DIFFICULTIES } from '../data/difficulty';
import { raiseAlarm } from './alarms';
import { failPdu } from './feeds';
import { applyFault } from './failures';
import { assignJob, createJob } from './jobs';
import { addLog, newId, showTip } from './state';
import { devicesInRack } from './selectors';
import type { Change, ChangeKind, GameState, Tech } from './types';

export interface RiskFactor {
  key: string;
  label: string;
  mult: number;
}

export interface RiskBreakdown {
  pct: number;
  factors: RiskFactor[];
}

/** The technician who would do the work: the best rested specialist for the job, else the manager. */
export function changeCrew(s: GameState, c: Change): Tech {
  const roles = CHANGES[c.kind].roles as readonly string[];
  const able = s.techs.filter((t) => roles.includes(t.role) && !t.onBreak && (t.lockedUntil ?? 0) <= s.minute);
  if (!able.length) return s.techs.find((t) => t.role === 'manager')!;
  return [...able].sort((a, b) => a.fatigue + s.jobs.filter((j) => j.techId === a.id).length * 30 - (b.fatigue + s.jobs.filter((j) => j.techId === b.id).length * 30))[0]!;
}

/** Pure risk model (PRD v2 F2): base risk times the factors that apply. Every factor is shown on the card. */
export function changeRisk(s: GameState, c: Change, at: number = c.scheduledAt ?? s.minute): RiskBreakdown {
  const def = CHANGES[c.kind];
  const factors: RiskFactor[] = [];
  const h = hourOf(at);
  if (h >= 22 || h < 6) factors.push({ key: 'window', label: 'Maintenance window (night)', mult: CHANGE.nightRiskMult });
  if (c.rollback) factors.push({ key: 'rollback', label: 'Rollback plan', mult: CHANGE.rollbackRiskMult });
  const crew = changeCrew(s, c);
  if (crew.role === 'manager') factors.push({ key: 'crew', label: 'No specialist: you do it yourself', mult: CHANGE.tiredMult });
  else if (crew.fatigue >= CHANGE.tiredFatigue) factors.push({ key: 'crew', label: 'Tired technician', mult: CHANGE.tiredMult });
  else factors.push({ key: 'crew', label: 'Rested specialist', mult: CHANGE.restedMult });
  if (c.kind === 'pduMaintenance' && c.rackId) {
    const devices = devicesInRack(s, c.rackId);
    if (devices.length && devices.every((d) => (d.psus ?? 1) === 2)) factors.push({ key: 'dual', label: 'Every server has two legs', mult: CHANGE.dualRackMult });
  }
  if (s.projects.includes('labels') || s.projects.includes('cableTidy')) factors.push({ key: 'projects', label: 'Labels and tidy cables', mult: CHANGE.projectMult });
  const raw = def.riskBase * factors.reduce((m, f) => m * f.mult, 1) * DIFFICULTIES[s.difficulty].incidentRate ** 0.5;
  const pct = Math.round(Math.max(CHANGE.minRisk, Math.min(CHANGE.maxRisk, raw)) * 100);
  return { pct, factors };
}

export const openChanges = (s: GameState): Change[] => (s.changes ?? []).filter((c) => c.status === 'offered' || c.status === 'scheduled' || c.status === 'running');

export function makeChange(s: GameState, kind: ChangeKind): Change | null {
  let rackId: string | null = null;
  let coolerId: string | null = null;
  const racks = s.racks.filter((r) => devicesInRack(s, r.id).length > 0);
  if (kind === 'firmware') rackId = pick(s.rng, racks.filter((r) => !r.fw).length ? racks.filter((r) => !r.fw) : racks)?.id ?? null;
  else if (kind === 'pduMaintenance') rackId = pick(s.rng, racks.filter((r) => !r.pduHardened).length ? racks.filter((r) => !r.pduHardened) : racks)?.id ?? null;
  else if (kind === 'coolerSwap') {
    const c = s.coolers.filter((x) => x.kind !== 'officeAc');
    if (!c.length) return null;
    coolerId = pick(s.rng, c).id;
  }
  if ((kind === 'firmware' || kind === 'pduMaintenance') && !rackId) return null;
  const change: Change = {
    id: newId(s, 'chg'), kind, rackId, coolerId, status: 'offered', scheduledAt: null, rollback: false,
    expiresDay: dayOf(s.minute) + CHANGE.expireDays, riskPct: 0,
  };
  change.riskPct = changeRisk(s, change, s.minute).pct;
  (s.changes ??= []).push(change);
  if ((s.changes?.length ?? 0) > 30) s.changes!.splice(0, s.changes!.length - 30);
  return change;
}

export function offerChange(s: GameState, kind: ChangeKind): void {
  const c = makeChange(s, kind);
  if (c) {
    addLog(s, 'info', `📝 Change request: ${CHANGES[kind].title}. ${CHANGES[kind].benefit}`);
    showTip(s, 'changes');
  }
}

const rackNumber = (s: GameState, id: string | null) => (id ? s.racks.findIndex((r) => r.id === id) + 1 : 0);

export const changeTitle = (s: GameState, c: Change): string => {
  const d = CHANGES[c.kind];
  return c.rackId ? `${d.title} · Rack ${rackNumber(s, c.rackId)}` : d.title;
};

/** Every morning, a couple of new requests arrive; unanswered ones expire after two days. */
export function updateChanges(s: GameState): void {
  if (!s.features.includes('changes')) return;
  const day = dayOf(s.minute);
  for (const c of s.changes ?? []) {
    if (c.status === 'offered' && day > c.expiresDay) {
      c.status = 'expired';
      if (s.freeze) s.reputation = Math.max(0, s.reputation - CHANGE.freezeRepPenalty);
      addLog(s, 'info', `📝 ${changeTitle(s, c)} expired unanswered.`);
    }
  }
  if (s.minute % 1440 === 360 && openChanges(s).length < CHANGE.maxOpen) {
    const kinds = Object.keys(CHANGES) as ChangeKind[];
    for (let i = 0; i < CHANGE.offerPerDay; i++) if (openChanges(s).length < CHANGE.maxOpen) offerChange(s, pick(s.rng, kinds));
  }
  // scheduled work starts at its time, unless a freeze is in force
  if (!s.freeze) {
    for (const c of s.changes ?? []) {
      if (c.status !== 'scheduled' || c.scheduledAt === null || s.minute < c.scheduledAt) continue;
      startChange(s, c);
    }
  }
  const infra = s.pendingInfra ?? [];
  if (infra.length) {
    const due = infra.filter((p) => s.minute >= p.at);
    if (due.length) {
      s.pendingInfra = infra.filter((p) => s.minute < p.at);
      for (const p of due) deliverInfra(s, p.kind);
    }
  }
}

function startChange(s: GameState, c: Change): void {
  const crew = changeCrew(s, c);
  const rack = c.rackId ? s.racks.find((r) => r.id === c.rackId) : undefined;
  const cooler = c.coolerId ? s.coolers.find((x) => x.id === c.coolerId) : undefined;
  const site = rack?.pos ?? cooler?.pos ?? s.racks[0]?.pos ?? { x: 0, y: 0 };
  const work = CHANGES[c.kind].workMin + (c.rollback ? CHANGE.rollbackMin : 0);
  const job = createJob(s, { kind: 'change', changeId: c.id, rackId: rack?.id ?? null, part: null, site, workMin: work });
  c.status = 'running';
  c.riskPct = changeRisk(s, c, s.minute).pct;
  assignJob(s, job, crew.id);
  addLog(s, 'info', `📝 ${changeTitle(s, c)} starts (${c.riskPct}% risk).`);
}

/** The next 23:00 (maintenance window). */
export const tonight = (s: GameState): number => {
  let at = dayOf(s.minute) * 1440 + 23 * 60;
  if (at <= s.minute) at += 1440;
  return at;
};

export function scheduleChange(s: GameState, c: Change, when: 'now' | 'tonight'): void {
  c.scheduledAt = when === 'now' ? s.minute : tonight(s);
  c.status = 'scheduled';
  c.riskPct = changeRisk(s, c).pct;
}

/** Called when the technician finishes: roll the risk, then apply the benefit or the damage. */
export function finishChange(s: GameState, changeId: string | undefined): void {
  const c = (s.changes ?? []).find((x) => x.id === changeId);
  if (!c || c.status !== 'running') return;
  const risk = changeRisk(s, c, s.minute).pct / 100;
  const rack = c.rackId ? s.racks.find((r) => r.id === c.rackId) : undefined;
  const label = changeTitle(s, c);
  if (chance(s.rng, risk)) {
    c.status = 'failed';
    s.stats.changeFailed = (s.stats.changeFailed ?? 0) + 1;
    addLog(s, 'fail', `📝 ${label} went wrong (${Math.round(risk * 100)}% risk).`);
    switch (c.kind) {
      case 'firmware': {
        const d = rack ? devicesInRack(s, rack.id)[0] : undefined;
        if (d) applyFault(s, d, 'hung');
        break;
      }
      case 'pduMaintenance':
        if (rack) failPdu(s, rack, 'A');
        break;
      case 'coolerSwap': {
        const cooler = s.coolers.find((x) => x.id === c.coolerId);
        if (cooler) {
          cooler.broken = true;
          raiseAlarm(s, 'coolerDown', null, null, 3, null, { coolerId: cooler.id });
        }
        break;
      }
      case 'capacityInstall':
        addLog(s, 'fail', 'The vendor drop arrived damaged. No server this time.');
        break;
    }
    addLog(s, 'info', `📋 Cause: a planned change (${label}). ${c.rollback ? 'The rollback plan limited the damage.' : 'No rollback plan was prepared.'}`);
    return;
  }
  c.status = 'done';
  s.stats.changeDone = (s.stats.changeDone ?? 0) + 1;
  addLog(s, 'success', `📝 ${label} done: ${CHANGES[c.kind].benefit}`);
  switch (c.kind) {
    case 'firmware':
      if (rack) rack.fw = true;
      break;
    case 'pduMaintenance':
      if (rack) rack.pduHardened = true;
      break;
    case 'coolerSwap': {
      const cooler = s.coolers.find((x) => x.id === c.coolerId);
      if (cooler) {
        cooler.health = 1;
        cooler.broken = false;
      }
      break;
    }
    case 'capacityInstall':
      s.inventory.server1u++;
      break;
  }
}

// ---------------------------------------------------------------- long-lead equipment, supply events

export function orderInfra(s: GameState, kind: 'ups' | 'generator' | 'grid' | 'cdu'): void {
  const days = LEAD_TIME[kind].days;
  (s.pendingInfra ??= []).push({ id: newId(s, 'inf'), kind, at: s.minute + days * 1440, expedited: false });
}

export function deliverInfra(s: GameState, kind: 'ups' | 'generator' | 'grid' | 'cdu'): void {
  if (kind === 'cdu') {
    if (s.loop) {
      s.loop.cdus++;
      s.loop.cdusOk++;
      addLog(s, 'success', `📦 A coolant distribution unit arrived: the loop now has ${s.loop.cdus}.`);
    }
    return;
  }
  if (kind === 'grid') {
    if (s.site) {
      s.site.gridCapW += SITE.stepW;
      s.site.gridSteps++;
      addLog(s, 'success', `📦 The utility finished the upgrade: the grid connection grew to ${Math.round(s.site.gridCapW / 1000)} kW.`);
    }
    return;
  }
  const b = s.backup;
  if (!b) return;
  if (kind === 'ups') {
    b.upsUnits++;
    addLog(s, 'success', `📦 A UPS unit arrived and is installed: ${b.upsUnits} now.`);
  } else {
    b.generator = 'idle';
    addLog(s, 'success', '📦 The generator arrived and is installed. Have an electrician test it!');
  }
}

export function supplyShock(s: GameState, days: number, text?: string): void {
  s.supplyShockUntil = Math.max(s.supplyShockUntil ?? 0, s.minute + days * 1440);
  addLog(s, 'alarm', text ?? `📦 Supply shock: part deliveries take ${SUPPLY.shockMult}× longer for ${days} days.`);
}

export function delayInfra(s: GameState, days: number, text?: string): void {
  const list = s.pendingInfra ?? [];
  for (const p of list) p.at += days * 1440;
  addLog(s, 'alarm', text ?? (list.length ? `📦 Delivery delayed: your equipment order slips by ${days} day${days > 1 ? 's' : ''}.` : '📦 A supplier warns of delays, but nothing of yours is on order.'));
}

/** Failed parts go back for credit once the books track them. */
export function rmaCredit(s: GameState, part: 'disk' | 'psu'): void {
  if (!s.features.includes('changes')) return;
  const credit = Math.round(PARTS[part].price * SUPPLY.rmaShare);
  s.cash += credit;
  s.today.revenue += credit;
  s.stats.rmaCredit = (s.stats.rmaCredit ?? 0) + credit;
  addLog(s, 'money', `↩️ RMA credit for the returned ${PARTS[part].name.toLowerCase()}: +$${credit}.`);
}

export const coolerName = (kind: keyof typeof COOLERS): string => COOLERS[kind].name;
