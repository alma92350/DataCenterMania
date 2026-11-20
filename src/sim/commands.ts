import { CONTRACT_GRACE_MIN, PARTS, SERVER_MODELS } from '../data/catalog';
import { dayOf } from '../core/time';
import { deliveryTime } from './economy';
import { assignJob, cancelJob, createJob } from './jobs';
import { isWalkable, tileAt } from './grid';
import { addLog, homeTile, showTip, techFromCandidate } from './state';
import { blockedTiles, contractById, deviceById, hasFeature, rackById, slotFree } from './selectors';
import type { AlarmKind, Cooler, GameState, JobKind, PartId, ServerModelId, Vec } from './types';

type TechChoice = string | 'best';

export type Command =
  | { type: 'dispatch'; job: Extract<JobKind, 'swapDisk' | 'replacePsu' | 'reboot' | 'resetBreaker' | 'remove'>; deviceId?: string; rackId?: string; techId: TechChoice }
  | { type: 'install'; rackId: string; slot: number; model: ServerModelId; contractId: string | null; techId: TechChoice }
  | { type: 'buildRack'; pos: Vec; techId: TechChoice }
  | { type: 'placeCooler'; coolerKind: Exclude<Cooler['kind'], 'officeAc'>; pos: Vec; techId: TechChoice }
  | { type: 'cancelJob'; jobId: string }
  | { type: 'order'; part: PartId; qty: number }
  | { type: 'hire'; candidateId: string }
  | { type: 'fire'; techId: string }
  | { type: 'acceptContract'; contractId: string }
  | { type: 'declineContract'; contractId: string }
  | { type: 'assign'; deviceId: string; contractId: string | null }
  | { type: 'setPower'; deviceId: string; on: boolean }
  | { type: 'toggleCooler'; coolerId: string; on: boolean }
  | { type: 'ackAlarm'; alarmId: string };

export type CommandResult = { ok: true } | { ok: false; error: string };

const ok = (): CommandResult => ({ ok: true });
const fail = (error: string): CommandResult => ({ ok: false, error });

export function suggestedJob(kind: AlarmKind): Extract<Command, { type: 'dispatch' }>['job'] | null {
  switch (kind) {
    case 'disk':
    case 'dataloss':
      return 'swapDisk';
    case 'psu':
      return 'replacePsu';
    case 'hung':
      return 'reboot';
    case 'breaker':
      return 'resetBreaker';
    default:
      return null;
  }
}

const REPAIR_NEEDS: Record<string, { fault?: string[]; part: PartId | null }> = {
  swapDisk: { fault: ['disk', 'dataloss'], part: 'disk' },
  replacePsu: { fault: ['psu'], part: 'psu' },
  reboot: { fault: ['hung'], part: null },
  remove: { part: null },
};

const pendingFor = (s: GameState, kind: JobKind, targetId: string) =>
  s.jobs.some((j) => j.kind === kind && (j.deviceId === targetId || (j.deviceId === null && j.rackId === targetId)));

function buildable(s: GameState, pos: Vec): string | null {
  if (tileAt(s.grid, pos.x, pos.y) !== 'floor') return 'You can only build on free floor tiles.';
  const blocked = blockedTiles(s);
  if (!isWalkable(s.grid, blocked, pos.x, pos.y)) return 'That tile is occupied.';
  if (s.jobs.some((j) => (j.kind === 'buildRack' || j.kind === 'placeCooler') && j.site.x === pos.x && j.site.y === pos.y)) {
    return 'Something is already being built there.';
  }
  const home = homeTile(s);
  if (home.x === pos.x && home.y === pos.y) return 'Keep the staff room free.';
  return null;
}

export function applyCommand(s: GameState, cmd: Command): CommandResult {
  if (s.progress.status !== 'playing') return fail('The chapter is over.');
  switch (cmd.type) {
    case 'dispatch': {
      if (cmd.job === 'resetBreaker') {
        const rack = rackById(s, cmd.rackId ?? null);
        if (!rack) return fail('Unknown rack.');
        if (!rack.tripped) return fail('That breaker is not tripped.');
        if (pendingFor(s, 'resetBreaker', rack.id)) return fail('Someone is already on it.');
        assignJob(s, createJob(s, { kind: 'resetBreaker', rackId: rack.id, part: null, site: rack.pos }), cmd.techId);
        return ok();
      }
      const dev = deviceById(s, cmd.deviceId ?? null);
      if (!dev) return fail('Unknown server.');
      const need = REPAIR_NEEDS[cmd.job]!;
      if (need.fault && !dev.faults.some((f) => need.fault!.includes(f))) {
        return fail(`This server has no ${need.fault[0] === 'hung' ? 'hang' : need.fault[0]} problem.`);
      }
      if (pendingFor(s, cmd.job, dev.id)) return fail('Someone is already on it.');
      if (need.part && s.inventory[need.part] < 1) {
        showTip(s, 'shop');
        return fail(`No ${PARTS[need.part].name.toLowerCase()} in stock. Order one from the Shop.`);
      }
      const rack = rackById(s, dev.rackId)!;
      const workMin = cmd.job === 'swapDisk' && dev.faults.includes('dataloss') ? 60 : undefined;
      assignJob(s, createJob(s, { kind: cmd.job, rackId: rack.id, deviceId: dev.id, part: need.part, site: rack.pos, workMin }), cmd.techId);
      return ok();
    }
    case 'install': {
      const rack = rackById(s, cmd.rackId);
      if (!rack) return fail('Unknown rack.');
      const model = SERVER_MODELS[cmd.model];
      if (!slotFree(s, rack, cmd.slot, model.u)) return fail('Those rack slots are not free.');
      if (s.inventory[cmd.model] < 1) return fail(`No ${model.name} in stock.`);
      if (cmd.contractId !== null && contractById(s, cmd.contractId)?.status !== 'active') return fail('Unknown contract.');
      assignJob(s, createJob(s, {
        kind: 'install', rackId: rack.id, part: cmd.model, site: rack.pos, model: cmd.model, slot: cmd.slot, contractId: cmd.contractId,
      }), cmd.techId);
      return ok();
    }
    case 'buildRack': {
      if (!hasFeature(s, 'buildRack')) return fail('Building racks unlocks in a later chapter.');
      if (s.inventory.rack < 1) return fail('Buy a rack in the Shop first.');
      const why = buildable(s, cmd.pos);
      if (why) return fail(why);
      assignJob(s, createJob(s, { kind: 'buildRack', part: 'rack', site: cmd.pos }), cmd.techId);
      return ok();
    }
    case 'placeCooler': {
      if (s.inventory[cmd.coolerKind] < 1) return fail(`Buy a ${PARTS[cmd.coolerKind].name} in the Shop first.`);
      const why = buildable(s, cmd.pos);
      if (why) return fail(why);
      assignJob(s, createJob(s, { kind: 'placeCooler', part: cmd.coolerKind, site: cmd.pos, coolerKind: cmd.coolerKind }), cmd.techId);
      return ok();
    }
    case 'cancelJob':
      return cancelJob(s, cmd.jobId) ? ok() : fail('Unknown job.');
    case 'order': {
      if (!hasFeature(s, 'shop')) return fail('The shop is closed.');
      if (!Number.isInteger(cmd.qty) || cmd.qty < 1) return fail('Quantity must be at least 1.');
      if ((cmd.part === 'rack' && !hasFeature(s, 'buildRack')) || (cmd.part === 'wallAc' && !hasFeature(s, 'coolers'))) {
        return fail('Not available yet.');
      }
      const cost = PARTS[cmd.part].price * cmd.qty;
      if (s.cash < cost) return fail('Not enough cash.');
      s.cash -= cost;
      s.orders.push({ part: cmd.part, qty: cmd.qty, arriveAt: s.minute + deliveryTime(s, cmd.part) });
      addLog(s, 'money', `Ordered ${cmd.qty} × ${PARTS[cmd.part].name} for $${cost}.`);
      return ok();
    }
    case 'hire': {
      if (!hasFeature(s, 'hire')) return fail('Hiring unlocks in Chapter 1.');
      const cand = s.candidates.find((c) => c.id === cmd.candidateId);
      if (!cand) return fail('Unknown candidate.');
      s.candidates = s.candidates.filter((c) => c.id !== cand.id);
      s.techs.push(techFromCandidate(cand, homeTile(s)));
      s.progress.maxTechs = Math.max(s.progress.maxTechs, s.techs.length);
      addLog(s, 'success', `${cand.name} joined the team!`);
      return ok();
    }
    case 'fire': {
      const tech = s.techs.find((t) => t.id === cmd.techId);
      if (!tech) return fail('Unknown technician.');
      if (tech.role === 'manager') return fail('You cannot fire yourself.');
      for (const j of s.jobs.filter((x) => x.techId === tech.id)) cancelJob(s, j.id);
      s.techs = s.techs.filter((t) => t.id !== tech.id);
      addLog(s, 'info', `${tech.name} left the company.`);
      return ok();
    }
    case 'acceptContract': {
      const c = contractById(s, cmd.contractId);
      if (!c || c.status !== 'offered') return fail('That offer is not available.');
      c.status = 'active';
      c.startDay = dayOf(s.minute);
      c.expiresDay = c.startDay + c.durationDays;
      c.liveFrom = null;
      c.graceUntil = s.minute + CONTRACT_GRACE_MIN;
      addLog(s, 'success', `Contract signed with ${c.customer}! Assign ${c.units} units of servers to it.`);
      showTip(s, 'contracts');
      return ok();
    }
    case 'declineContract': {
      const c = contractById(s, cmd.contractId);
      if (!c || c.status !== 'offered') return fail('That offer is not available.');
      s.contracts = s.contracts.filter((x) => x.id !== c.id);
      return ok();
    }
    case 'assign': {
      const dev = deviceById(s, cmd.deviceId);
      if (!dev) return fail('Unknown server.');
      if (cmd.contractId !== null && contractById(s, cmd.contractId)?.status !== 'active') return fail('Unknown contract.');
      dev.contractId = cmd.contractId;
      return ok();
    }
    case 'setPower': {
      const dev = deviceById(s, cmd.deviceId);
      if (!dev) return fail('Unknown server.');
      dev.poweredOn = cmd.on;
      return ok();
    }
    case 'toggleCooler': {
      const c = s.coolers.find((x) => x.id === cmd.coolerId);
      if (!c) return fail('Unknown cooler.');
      c.on = cmd.on;
      return ok();
    }
    case 'ackAlarm': {
      const a = s.alarms.find((x) => x.id === cmd.alarmId);
      if (!a) return fail('Unknown alarm.');
      a.acknowledged = true;
      return ok();
    }
  }
}
