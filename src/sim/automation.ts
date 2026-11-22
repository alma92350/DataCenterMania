import { AUDIT, JOB_LABEL, PROACTIVE } from '../data/catalog';
import { alarmLabel } from './alarms';
import { applyCommand, suggestedCoolerJob, suggestedJob, type Command } from './commands';
import { assignJob, canDo, createJob } from './jobs';
import { nearestTile } from './grid';
import { addLog, homeSpot } from './state';
import { hasFeature, isIdle, rackById } from './selectors';
import type { Alarm, GameState, JobKind, Tech, Vec } from './types';

/** PRD §13 / §21.6: the Shift Lead absorbs routine dispatching; idle specialists do preventive work. */
export const AUTO = { reactMin: 8, everyMin: 5 } as const;

export const leadOf = (s: GameState): Tech | undefined => s.techs.find((t) => t.role === 'lead');

const isSpecialist = (t: Tech) => t.role !== 'manager' && t.role !== 'lead';

function alarmJob(a: Alarm): JobKind | null {
  return suggestedJob(a.kind) ?? suggestedCoolerJob(a.kind);
}

function alarmSite(s: GameState, a: Alarm): Vec | null {
  if (a.coolerId) return s.coolers.find((c) => c.id === a.coolerId)?.pos ?? null;
  if (a.uplinkId) return nearestTile(s.grid, 'dock', homeSpot(s, 0)) ?? homeSpot(s, 0);
  return rackById(s, a.rackId)?.pos ?? null;
}

const handled = (s: GameState, a: Alarm): boolean =>
  s.jobs.some((j) =>
    (a.deviceId !== null && j.deviceId === a.deviceId) || (a.coolerId != null && j.coolerId === a.coolerId) ||
    (a.uplinkId != null && j.uplinkId === a.uplinkId) || (a.deviceId === null && a.coolerId == null && a.uplinkId == null && j.rackId === a.rackId && j.deviceId === null));

/** The idle-first, closest specialist who can do the job: never the manager (you) or the lead. */
function pickSpecialist(s: GameState, kind: JobKind, site: Vec, requireIdle = false): Tech | null {
  const able = s.techs.filter((t) => isSpecialist(t) && canDo(t, kind) && !t.onBreak && (!requireIdle || isIdle(s, t)));
  if (!able.length) return null;
  const score = (t: Tech) => s.jobs.filter((j) => j.techId === t.id && j.stage !== 'done').length * 40 + Math.abs(t.pos.x - site.x) + Math.abs(t.pos.y - site.y) + t.fatigue * 0.2;
  return [...able].sort((a, b) => score(a) - score(b))[0]!;
}

function autoDispatch(s: GameState, lead: Tech): void {
  const alarms = [...s.alarms].sort((a, b) => b.severity - a.severity || a.raisedAt - b.raisedAt);
  for (const a of alarms) {
    if (a.kind === 'hung' && (s.noc ?? 0) >= 1 && a.deviceId && s.minute - a.raisedAt >= AUTO.reactMin && applyCommand(s, { type: 'remoteReboot', deviceId: a.deviceId }, { auto: true }).ok) {
      s.stats.autoDispatched = (s.stats.autoDispatched ?? 0) + 1;
      continue;
    }
    const kind = alarmJob(a);
    if (!kind || s.minute - a.raisedAt < AUTO.reactMin || handled(s, a)) continue;
    const site = alarmSite(s, a);
    if (!site) continue;
    const tech = pickSpecialist(s, kind, site);
    if (!tech) continue;
    const cmd: Command = a.coolerId
      ? { type: kind as 'serviceCooler' | 'repairCooler', coolerId: a.coolerId, techId: tech.id }
      : { type: 'dispatch', job: kind as 'swapDisk', deviceId: a.deviceId ?? undefined, rackId: a.rackId ?? undefined, uplinkId: a.uplinkId ?? undefined, techId: tech.id };
    if (applyCommand(s, cmd, { auto: true }).ok) {
      s.stats.autoDispatched = (s.stats.autoDispatched ?? 0) + 1;
      addLog(s, 'info', `🧑‍💼 ${lead.name} sent ${tech.name}: ${JOB_LABEL[kind]} (${alarmLabel(s, a)}).`);
    }
  }
  for (const w of s.walkins) {
    if (w.status !== 'open' || s.jobs.some((j) => j.walkinId === w.id)) continue;
    const rack = rackById(s, w.rackId);
    const tech = rack ? pickSpecialist(s, 'favor', rack.pos, true) : null;
    if (tech) applyCommand(s, { type: 'dispatch', job: 'favor', walkinId: w.id, techId: tech.id }, { auto: true });
  }
}

/** Idle specialists look after their own systems before things break (PRD §21.6). */
function proactive(s: GameState): void {
  for (const t of s.techs) {
    if (t.onBreak || !isIdle(s, t)) continue;
    if (t.role === 'hvac' && hasFeature(s, 'maintenance') && s.inventory.filter >= 1) {
      const cooler = s.coolers.find((c) => c.kind !== 'officeAc' && !c.broken && c.health < PROACTIVE.filterBelow && !s.jobs.some((j) => j.coolerId === c.id));
      if (cooler) assignJob(s, createJob(s, { kind: 'serviceCooler', coolerId: cooler.id, part: 'filter', site: cooler.pos, proactive: true }), t.id);
    } else if (t.role === 'net' && hasFeature(s, 'network') && s.minute >= s.auditUntil - AUDIT.renewBeforeMin && !s.jobs.some((j) => j.kind === 'audit')) {
      const rack = s.racks.find((r) => s.devices.some((d) => d.rackId === r.id));
      if (rack) assignJob(s, createJob(s, { kind: 'audit', rackId: rack.id, part: null, site: rack.pos, proactive: true }), t.id);
    }
  }
}

export function runAutomation(s: GameState): void {
  const lead = leadOf(s);
  if (s.autoDispatch && !lead) s.autoDispatch = false;
  if (s.autoDispatch && lead && s.minute % AUTO.everyMin === 0) autoDispatch(s, lead);
  if (s.minute % PROACTIVE.everyMin === 0) proactive(s);
}
