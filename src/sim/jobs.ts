import { chance } from '../core/rng';
import { JOB_LABEL, JOB_WORK_MIN, RACK_CAPACITY_U } from '../data/catalog';
import { traitOf } from '../data/content';
import { DIFFICULTIES } from '../data/difficulty';
import { clearAlarms } from './alarms';
import { accessTile, findPath, nearestTile } from './grid';
import { addLog, homeTile, makeCooler, makeRack, newId, showTip } from './state';
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
  workMin?: number;
}

export function createJob(s: GameState, spec: JobSpec): Job {
  const job: Job = {
    id: newId(s, 'j'), kind: spec.kind, rackId: spec.rackId ?? null, deviceId: spec.deviceId ?? null,
    techId: null, stage: 'queued', workLeft: spec.workMin ?? JOB_WORK_MIN[spec.kind], workTotal: spec.workMin ?? JOB_WORK_MIN[spec.kind], part: spec.part,
    site: { ...spec.site }, model: spec.model, slot: spec.slot, contractId: spec.contractId, coolerKind: spec.coolerKind,
  };
  if (spec.part) s.inventory[spec.part]--;
  s.jobs.push(job);
  return job;
}

const tile = (p: Vec): Vec => ({ x: Math.round(p.x), y: Math.round(p.y) });
const manhattan = (a: Vec, b: Vec) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** Prefer idle techs close to the site, then the shortest queue. */
export function bestTech(s: GameState, site: Vec): Tech {
  const ranked = [...s.techs].sort((a, b) => {
    const qa = techQueueLength(s, a);
    const qb = techQueueLength(s, b);
    if (qa !== qb) return qa - qb;
    const skill = (t: Tech) => (t.role === 'manager' ? 0 : 3);
    return manhattan(a.pos, site) - skill(a) - (manhattan(b.pos, site) - skill(b));
  });
  return ranked[0]!;
}

export function assignJob(s: GameState, job: Job, techId: string | 'best'): Tech {
  const tech = techId === 'best' ? bestTech(s, job.site) : techById(s, techId);
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

function siteAccess(s: GameState, job: Job): Vec | null {
  return accessTile(s.grid, blockedTiles(s), job.site);
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

function workRate(t: Tech): number {
  const trait = traitOf(t.trait);
  return (0.6 + 0.2 * t.skill) * (trait?.workMult ?? 1);
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
  for (const tech of s.techs) {
    let time = dt;
    if (tech.jobId === null) {
      const next = s.jobs.find((j) => j.techId === tech.id && j.stage === 'queued');
      if (next) startJob(s, tech, next);
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
    }
    if (job.stage === 'working' && time > 0) {
      job.workLeft -= time * workRate(tech);
      if (job.workLeft <= 0) finishWork(s, tech, job);
    }
  }
}

function finishWork(s: GameState, tech: Tech, job: Job): void {
  const diff = DIFFICULTIES[s.difficulty];
  const mistake = diff.mistakeChance * (traitOf(tech.trait)?.mistakeMult ?? 1);
  if (!job.botched && chance(s.rng, mistake)) {
    job.botched = true;
    job.workLeft = JOB_WORK_MIN[job.kind] * 0.5;
    job.workTotal = job.workLeft;
    addLog(s, 'fail', `${tech.name} botched the job (${JOB_LABEL[job.kind]}) and has to redo part of it.`);
    showTip(s, 'botched');
    return;
  }
  completeJob(s, job);
  addLog(s, 'success', `${tech.name}: ${JOB_LABEL[job.kind]} done.`);
  job.stage = 'done';
  s.jobs = s.jobs.filter((j) => j.id !== job.id);
  tech.jobId = null;
  tech.carrying = null;
  const home = homeTile(s);
  const next = s.jobs.find((j) => j.techId === tech.id && j.stage === 'queued');
  if (next) startJob(s, tech, next);
  else routeTo(s, tech, home);
}

const REPAIRS: ReadonlySet<JobKind> = new Set(['swapDisk', 'replacePsu', 'reboot', 'resetBreaker']);

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
      s.racks.push({ ...makeRack(s, job.site, budget), capacityU: RACK_CAPACITY_U });
      break;
    }
    case 'placeCooler':
      s.coolers.push(makeCooler(s, job.coolerKind ?? 'portableAc', job.site));
      break;
  }
}

export { isIdle };
