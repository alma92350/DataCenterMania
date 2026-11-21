import { chance } from '../core/rng';
import { AUDIT, JOB_LABEL, JOB_ROLES, JOB_WORK_MIN, MANAGER_SPECIALIST_RATE, PROJECTS, PROJECT_EFFECT, RACK_CAPACITY_U } from '../data/catalog';
import { completeWalkin } from './walkins';
import { say } from './bubbles';
import { clearMalware } from './cyber';
import { traitOf } from '../data/content';
import { DIFFICULTIES } from '../data/difficulty';
import { clearAlarms } from './alarms';
import { accessTile, findPath, isWalkable, nearestTile } from './grid';
import { mistakeFactor, staminaFactor } from './fatigue';
import { restoreUplink } from './network';
import { addLog, homeSpot, makeCooler, makeRack, newId, showTip } from './state';
import { blockedTiles, deviceById, isIdle, rackById, techById, techQueueLength } from './selectors';
import type { GameState, Job, JobKind, PartId, ServerModelId, Tech, Vec } from './types';

export interface JobSpec {
  kind: JobKind;
  rackId?: string | null;
  deviceId?: string | null;
  part: PartId | null;
  site: Vec;
  model?: ServerModelId;
  slot?: number;
  contractId?: string | null;
  coolerKind?: Job['coolerKind'];
  coolerId?: string;
  uplinkId?: string;
  facing?: Job['facing'];
  projectId?: Job['projectId'];
  walkinId?: string;
  proactive?: boolean;
  workMin?: number;
}

export function createJob(s: GameState, spec: JobSpec): Job {
  const job: Job = {
    id: newId(s, 'j'), kind: spec.kind, rackId: spec.rackId ?? null, deviceId: spec.deviceId ?? null,
    techId: null, stage: 'queued', workLeft: spec.workMin ?? JOB_WORK_MIN[spec.kind], workTotal: spec.workMin ?? JOB_WORK_MIN[spec.kind], part: spec.part,
    site: { ...spec.site }, model: spec.model, slot: spec.slot, contractId: spec.contractId, coolerKind: spec.coolerKind,
    coolerId: spec.coolerId, uplinkId: spec.uplinkId, facing: spec.facing, projectId: spec.projectId, walkinId: spec.walkinId, proactive: spec.proactive,
  };
  if (spec.part) s.inventory[spec.part]--;
  s.jobs.push(job);
  return job;
}

const tile = (p: Vec): Vec => ({ x: Math.round(p.x), y: Math.round(p.y) });
const manhattan = (a: Vec, b: Vec) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** On a break, or locked out of their account after a phishing click (v0.7). */
export const unavailable = (s: GameState, t: Tech): boolean => t.onBreak || (t.lockedUntil ?? 0) > s.minute;

/** Specialists only take their own kind of job; the manager can do anything (PRD §6.1). */
export function canDo(t: Tech, kind: JobKind): boolean {
  return t.role === 'manager' || JOB_ROLES[kind].includes(t.role);
}

/** Prefer rested specialists close to the site with a short queue; the manager is the fallback. */
export function bestTech(s: GameState, site: Vec, kind: JobKind = 'reboot'): Tech {
  const able = s.techs.filter((t) => canDo(t, kind) && !unavailable(s, t));
  const pool = able.length ? able : s.techs.filter((t) => t.role === 'manager');
  const score = (t: Tech) =>
    techQueueLength(s, t) * 40 + manhattan(t.pos, site) + (t.role === 'manager' ? (kind in SPECIALIST ? 30 : 3) : 0) + t.fatigue * 0.2;
  return [...pool].sort((a, b) => score(a) - score(b))[0]!;
}

const SPECIALIST: Partial<Record<JobKind, true>> = { serviceCooler: true, repairCooler: true, replaceSwitch: true, repairUplink: true };

export function assignJob(s: GameState, job: Job, techId: string | 'best'): Tech {
  const tech = techId === 'best' ? bestTech(s, job.site, job.kind) : techById(s, techId);
  if (!tech) throw new Error(`unknown tech ${techId}`);
  job.techId = tech.id;
  if (tech.jobId === null) startJob(s, tech, job);
  return tech;
}

function routeTo(s: GameState, tech: Tech, target: Vec): boolean {
  const path = findPath(s.grid, blockedTiles(s), tile(tech.pos), target);
  if (path === null) return false;
  tech.path = path;
  return true;
}

/** Rack work happens at the rack's front; everything else at any free neighbouring tile. */
function siteAccess(s: GameState, job: Job): Vec | null {
  const blocked = blockedTiles(s);
  const rack = rackById(s, job.rackId);
  if (rack && job.kind !== 'buildRack') {
    const front = { x: rack.pos.x, y: rack.pos.y + (rack.facing === 'S' ? 1 : -1) };
    if (isWalkable(s.grid, blocked, front.x, front.y)) return front;
  }
  if (job.kind === 'repairUplink' && isWalkable(s.grid, blocked, job.site.x, job.site.y)) return job.site;
  return accessTile(s.grid, blocked, job.site);
}

function startJob(s: GameState, tech: Tech, job: Job): void {
  tech.jobId = job.id;
  if (job.part) {
    const storage = nearestTile(s.grid, 'storage', tech.pos);
    job.stage = 'toStorage';
    if (!storage || !routeTo(s, tech, storage)) return failJob(s, tech, job, 'cannot reach the storage room');
  } else {
    job.stage = 'toSite';
    const target = siteAccess(s, job);
    if (!target || !routeTo(s, tech, target)) return failJob(s, tech, job, 'cannot reach the site');
  }
}

function failJob(s: GameState, tech: Tech, job: Job, why: string): void {
  addLog(s, 'fail', `${tech.name}: ${JOB_LABEL[job.kind]} cancelled (${why}).`);
  removeJob(s, job, true);
}

function removeJob(s: GameState, job: Job, refund: boolean): void {
  if (refund && job.part) s.inventory[job.part]++;
  if (job.kind === 'rotateRack') {
    const rack = rackById(s, job.rackId);
    if (rack) rack.maintenance = false;
  }
  s.jobs = s.jobs.filter((j) => j.id !== job.id);
  const tech = techById(s, job.techId);
  if (tech && tech.jobId === job.id) {
    tech.jobId = null;
    tech.carrying = null;
    tech.path = [];
  }
}

export function cancelJob(s: GameState, jobId: string): boolean {
  const job = s.jobs.find((j) => j.id === jobId);
  if (!job) return false;
  removeJob(s, job, true);
  return true;
}

let labelsBonus = 1;

function workRate(t: Tech, kind: JobKind): number {
  const trait = traitOf(t.trait);
  const offRole = t.role === 'manager' && kind in SPECIALIST ? MANAGER_SPECIALIST_RATE : 1;
  return (0.6 + 0.2 * t.skill) * (trait?.workMult ?? 1) * staminaFactor(t) * offRole * labelsBonus;
}

/** Puts a not-yet-started job back in the shared queue (e.g. its tech went on a break). */
function releaseJob(s: GameState, tech: Tech, job: Job): void {
  job.techId = null;
  job.stage = 'queued';
  tech.jobId = null;
  tech.carrying = null;
  routeTo(s, tech, homeSpot(s, tech));
}

function walkSpeed(t: Tech): number {
  return t.speed * (traitOf(t.trait)?.speedMult ?? 1);
}

/** Moves along the path; returns the unused movement budget (in minutes). */
function walk(t: Tech, dt: number): number {
  let budget = walkSpeed(t) * dt;
  while (budget > 0 && t.path.length) {
    const next = t.path[0]!;
    const dx = next.x - t.pos.x;
    const dy = next.y - t.pos.y;
    const d = Math.hypot(dx, dy);
    if (d <= budget) {
      t.pos = { x: next.x, y: next.y };
      t.path.shift();
      budget -= d;
    } else {
      t.pos = { x: t.pos.x + (dx / d) * budget, y: t.pos.y + (dy / d) * budget };
      budget = 0;
    }
  }
  return budget / walkSpeed(t);
}

export function updateTechs(s: GameState, dt: number): void {
  labelsBonus = s.projects.includes('labels') ? PROJECT_EFFECT.labelsWorkMult : 1;
  for (const tech of s.techs) {
    let time = dt;
    const current = s.jobs.find((j) => j.id === tech.jobId);
    const away = unavailable(s, tech);
    if (away) {
      // finish what is in your hands, hand back everything else, then rest
      if (current && current.stage !== 'working') releaseJob(s, tech, current);
      for (const j of s.jobs) if (j.techId === tech.id && j.stage === 'queued') j.techId = null;
    }
    if (tech.jobId === null && !away) {
      const next =
        s.jobs.find((j) => j.techId === tech.id && j.stage === 'queued') ??
        s.jobs.find((j) => j.techId === null && j.stage === 'queued' && canDo(tech, j.kind));
      if (next) {
        next.techId = tech.id;
        startJob(s, tech, next);
      }
    }
    const job = s.jobs.find((j) => j.id === tech.jobId);
    if (!job) {
      walk(tech, dt); // idle techs walk home
      continue;
    }
    if (job.stage === 'toStorage' || job.stage === 'toSite') {
      time = walk(tech, time);
      if (tech.path.length) continue;
      if (job.stage === 'toStorage') {
        tech.carrying = job.part;
        job.stage = 'toSite';
        const target = siteAccess(s, job);
        if (!target || !routeTo(s, tech, target)) {
          failJob(s, tech, job, 'cannot reach the site');
          continue;
        }
        time = walk(tech, time);
        if (tech.path.length) continue;
      }
      job.stage = 'working';
      say(s, tech, job.kind, 'start', job.id);
      if (job.kind === 'rotateRack') {
        const rack = rackById(s, job.rackId);
        if (rack) rack.maintenance = true;
      }
    }
    if (job.stage === 'working' && time > 0) {
      job.workLeft -= time * workRate(tech, job.kind);
      if (job.workLeft <= 0) finishWork(s, tech, job);
    }
  }
}

function finishWork(s: GameState, tech: Tech, job: Job): void {
  const diff = DIFFICULTIES[s.difficulty];
  const tidy = s.projects.includes('cableTidy') ? PROJECT_EFFECT.cableTidyMistakeMult : 1;
  const mistake = diff.mistakeChance * (traitOf(tech.trait)?.mistakeMult ?? 1) * mistakeFactor(tech) * tidy;
  if (!job.botched && chance(s.rng, mistake)) {
    job.botched = true;
    job.workLeft = JOB_WORK_MIN[job.kind] * 0.5;
    job.workTotal = job.workLeft;
    addLog(s, 'fail', `${tech.name} botched the job (${JOB_LABEL[job.kind]}) and has to redo part of it.`);
    showTip(s, 'botched');
    say(s, tech, job.kind, 'oops', job.id);
    return;
  }
  completeJob(s, job);
  say(s, tech, job.kind, 'done', job.id);
  addLog(s, 'success', `${tech.name}: ${JOB_LABEL[job.kind]} done.`);
  job.stage = 'done';
  s.jobs = s.jobs.filter((j) => j.id !== job.id);
  tech.jobId = null;
  tech.carrying = null;
  const home = homeSpot(s, tech);
  const next = s.jobs.find((j) => j.techId === tech.id && j.stage === 'queued');
  if (next && !unavailable(s, tech)) startJob(s, tech, next);
  else routeTo(s, tech, home);
}

const REPAIRS: ReadonlySet<JobKind> = new Set(['swapDisk', 'replacePsu', 'reboot', 'resetBreaker', 'replaceSwitch', 'repairCooler', 'repairUplink', 'reimage']);

/** Applies a finished job's effect on the world. */
export function completeJob(s: GameState, job: Job): void {
  const dev = deviceById(s, job.deviceId);
  const clearFor = (kinds: string[]) =>
    clearAlarms(s, (a) => kinds.includes(a.kind) && (job.deviceId ? a.deviceId === job.deviceId : a.rackId === job.rackId));
  if (REPAIRS.has(job.kind)) s.stats.resolved++;
  switch (job.kind) {
    case 'swapDisk':
      if (dev) dev.faults = dev.faults.filter((f) => f !== 'disk' && f !== 'dataloss');
      clearFor(['disk', 'dataloss']);
      break;
    case 'replacePsu':
      if (dev) dev.faults = dev.faults.filter((f) => f !== 'psu');
      clearFor(['psu']);
      break;
    case 'reboot':
      s.stats.reboots = (s.stats.reboots ?? 0) + 1;
      if (dev) dev.faults = dev.faults.filter((f) => f !== 'hung');
      clearFor(['hung']);
      break;
    case 'resetBreaker': {
      const rack = rackById(s, job.rackId);
      if (rack) rack.tripped = false;
      clearFor(['breaker']);
      break;
    }
    case 'install': {
      const rack = rackById(s, job.rackId);
      if (rack && job.model !== undefined && job.slot !== undefined) {
        s.devices.push({
          id: newId(s, 'd'), model: job.model, rackId: rack.id, slot: job.slot, faults: [], poweredOn: true,
          thermalShutdown: false, contractId: job.contractId ?? null, load: 0,
        });
      }
      break;
    }
    case 'remove':
      if (dev) {
        s.devices = s.devices.filter((d) => d.id !== dev.id);
        s.inventory[dev.model]++;
        clearAlarms(s, (a) => a.deviceId === dev.id);
      }
      break;
    case 'buildRack': {
      const budget = s.racks[0]?.powerBudgetW ?? 3000;
      s.racks.push({ ...makeRack(s, job.site, budget, job.facing ?? 'S'), capacityU: RACK_CAPACITY_U });
      break;
    }
    case 'placeCooler':
      s.coolers.push(makeCooler(s, job.coolerKind ?? 'portableAc', job.site));
      break;
    case 'rotateRack': {
      const rack = rackById(s, job.rackId);
      if (rack) {
        rack.facing = rack.facing === 'S' ? 'N' : 'S';
        rack.maintenance = false;
      }
      break;
    }
    case 'serviceCooler':
    case 'repairCooler': {
      const c = s.coolers.find((x) => x.id === job.coolerId);
      if (c) {
        c.health = 1;
        c.broken = false;
      }
      if (job.proactive) {
        s.stats.prevented = (s.stats.prevented ?? 0) + 1;
        addLog(s, 'success', '🛡️ A filter was changed before it clogged. Trouble prevented.');
      }
      clearAlarms(s, (a) => (a.kind === 'filter' || a.kind === 'coolerDown') && a.coolerId === job.coolerId);
      break;
    }
    case 'replaceSwitch': {
      const rack = rackById(s, job.rackId);
      if (rack) rack.switchFailed = false;
      clearFor(['switch']);
      break;
    }
    case 'repairUplink': {
      const u = s.uplinks.find((x) => x.id === job.uplinkId);
      if (u && !u.up) restoreUplink(s, u, false);
      break;
    }
    case 'project':
      if (job.projectId && !s.projects.includes(job.projectId)) {
        s.projects.push(job.projectId);
        addLog(s, 'success', `${PROJECTS[job.projectId].name} finished. ${PROJECTS[job.projectId].effect}`);
      }
      break;
    case 'favor':
      completeWalkin(s, job.walkinId);
      break;
    case 'reimage':
      if (job.rackId) clearMalware(s, job.rackId);
      break;
    case 'audit':
      s.auditUntil = s.minute + AUDIT.durationMin;
      s.stats.prevented = (s.stats.prevented ?? 0) + 1;
      addLog(s, 'success', '🛡️ Cable audit done: switches and fiber are less likely to fail for a day.');
      break;
  }
}

export { isIdle };
