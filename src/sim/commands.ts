import { contractLabel } from './naming';
import { BACKUP, CONTRACT_GRACE_MIN, ENERGY, EXTRA_UPLINK, JOB_WORK_MIN, LEAD, LEAD_TIME, NOC, PARTS, SITE, PROJECTS, ROLE_LABEL, SERVER_MODELS } from '../data/catalog';
import { dayOf, formatClock } from '../core/time';
import { deliveryTime } from './economy';
import { assignJob, canDo, cancelJob, createJob, type JobSpec } from './jobs';
import { upsCapacityKwh } from './backup';
import { droughtActive } from './site';
import { changeRisk, changeTitle, orderInfra, scheduleChange } from './changes';
import { resolveAttack } from './cyber';
import { isWalkable, nearestTile, tileAt } from './grid';
import { addLog, homeSpot, homeTile, makeCandidate, newId, showTip, techFromCandidate } from './state';
import { blockedTiles, contractById, deviceById, hasFeature, rackById, slotFree, techById } from './selectors';
import type { AlarmKind, Cooler, Facing, GameState, JobKind, PartId, ProjectId, ServerModelId, Vec } from './types';

type TechChoice = string | 'best';

export type Command =
  | { type: 'dispatch'; job: DispatchJob; deviceId?: string; rackId?: string; uplinkId?: string; walkinId?: string; feed?: 'A' | 'B'; techId: TechChoice }
  | { type: 'install'; rackId: string; slot: number; model: ServerModelId; contractId: string | null; techId: TechChoice }
  | { type: 'buildRack'; pos: Vec; facing?: Facing; techId: TechChoice }
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
  | { type: 'ackAlarm'; alarmId: string }
  | { type: 'serviceCooler'; coolerId: string; techId: TechChoice }
  | { type: 'repairCooler'; coolerId: string; techId: TechChoice }
  | { type: 'buyUplink' }
  | { type: 'scheduleChange'; changeId: string; when: 'now' | 'tonight' }
  | { type: 'setRollback'; changeId: string; on: boolean }
  | { type: 'skipChange'; changeId: string }
  | { type: 'setFreeze'; on: boolean }
  | { type: 'expediteInfra'; id: string }
  | { type: 'setCooling'; mode: 'evaporative' | 'dry' }
  | { type: 'buyEconomizer' }
  | { type: 'setRenewable'; on: boolean }
  | { type: 'buyHeatReuse' }
  | { type: 'orderGrid' }
  | { type: 'upgradeNoc' }
  | { type: 'remoteReboot'; deviceId: string }
  | { type: 'buyUps' }
  | { type: 'buyGenerator' }
  | { type: 'hireLead' }
  | { type: 'resolveAttack'; score: number; mode: 'played' | 'auto'; infected?: number[] }
  | { type: 'setAutoDispatch'; on: boolean }
  | { type: 'startProject'; project: ProjectId; techId?: TechChoice };

export type DispatchJob = Extract<JobKind, 'swapDisk' | 'replacePsu' | 'reboot' | 'resetBreaker' | 'remove' | 'rotateRack' | 'replaceSwitch' | 'repairUplink' | 'favor' | 'reimage' | 'startGenerator' | 'testGenerator' | 'replaceBattery' | 'transferAts' | 'refuel' | 'repairPdu' | 'dualCord' | 'resetMain' | 'repairOob'>;

export type CommandResult = { ok: true } | { ok: false; error: string };

const ok = (): CommandResult => ({ ok: true });
const fail = (error: string): CommandResult => ({ ok: false, error });

export function suggestedJob(kind: AlarmKind): DispatchJob | null {
  switch (kind) {
    case 'switch':
      return 'replaceSwitch';
    case 'malware':
      return 'reimage';
    case 'uplink':
      return 'repairUplink';
    case 'disk':
    case 'dataloss':
      return 'swapDisk';
    case 'psu':
      return 'replacePsu';
    case 'hung':
      return 'reboot';
    case 'breaker':
      return 'resetBreaker';
    case 'generator':
      return 'startGenerator';
    case 'battery':
      return 'replaceBattery';
    case 'ats':
      return 'transferAts';
    case 'feed':
      return 'repairPdu';
    case 'siteCap':
      return 'resetMain';
    case 'oob':
      return 'repairOob';
    case 'fuel':
      return 'refuel';
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

/** Cooler alarms are fixed with cooler commands rather than dispatch jobs. */
export function suggestedCoolerJob(kind: AlarmKind): 'serviceCooler' | 'repairCooler' | null {
  return kind === 'filter' ? 'serviceCooler' : kind === 'coolerDown' ? 'repairCooler' : null;
}

function dispatchJob(s: GameState, spec: JobSpec, techId: TechChoice): CommandResult {
  if (techId !== 'best') {
    const tech = techById(s, techId);
    if (!tech) return fail('Unknown technician.');
    if ((tech.lockedUntil ?? 0) > s.minute) return fail(`${tech.name} is locked out of their account (phished) for ${Math.ceil((tech.lockedUntil ?? 0) - s.minute)} more minutes.`);
    if (!canDo(tech, spec.kind)) return fail(`${tech.name} is a ${ROLE_LABEL[tech.role]} and can\u2019t do that. Pick someone else.`);
  }
  assignJob(s, createJob(s, spec), techId);
  return ok();
}

/**
 * The single write path for player actions. Successful commands are counted (the "actions per
 * minute" workload metric); `auto` marks work done by the Shift Lead, which is not.
 */
export function applyCommand(s: GameState, cmd: Command, opts: { auto?: boolean } = {}): CommandResult {
  const res = exec(s, cmd);
  if (res.ok && !opts.auto) s.stats.commands = (s.stats.commands ?? 0) + 1;
  return res;
}

function exec(s: GameState, cmd: Command): CommandResult {
  if (s.progress.status !== 'playing') return fail('The chapter is over.');
  switch (cmd.type) {
    case 'dispatch': {
      if (cmd.job === 'favor') {
        const w = s.walkins.find((x) => x.id === cmd.walkinId);
        if (!w || w.status !== 'open') return fail('That request is no longer open.');
        if (s.jobs.some((j) => j.walkinId === w.id)) return fail('Someone is already on it.');
        const rack = rackById(s, w.rackId);
        if (!rack) return fail('Unknown rack.');
        const kind = w.kind === 'crossConnect' ? 'crossConnect' : 'favor';
        return dispatchJob(s, { kind, rackId: rack.id, walkinId: w.id, part: null, site: rack.pos }, cmd.techId);
      }
      if (cmd.job === 'reimage') {
        const rack = rackById(s, cmd.rackId ?? null);
        if (!rack) return fail('Unknown rack.');
        if (!s.devices.some((d) => d.rackId === rack.id && d.faults.includes('malware'))) return fail('Nothing to clean there.');
        if (pendingFor(s, 'reimage', rack.id)) return fail('Someone is already on it.');
        return dispatchJob(s, { kind: 'reimage', rackId: rack.id, part: null, site: rack.pos }, cmd.techId);
      }
      if (cmd.job === 'rotateRack') {
        const rack = rackById(s, cmd.rackId ?? null);
        if (!rack) return fail('Unknown rack.');
        if (pendingFor(s, 'rotateRack', rack.id)) return fail('Someone is already on it.');
        const flipped = { x: rack.pos.x, y: rack.pos.y + (rack.facing === 'S' ? -1 : 1) };
        if (!isWalkable(s.grid, blockedTiles(s), flipped.x, flipped.y)) return fail('No room in front of the rack once rotated.');
        return dispatchJob(s, { kind: 'rotateRack', rackId: rack.id, part: null, site: rack.pos }, cmd.techId);
      }
      if (cmd.job === 'replaceSwitch') {
        const rack = rackById(s, cmd.rackId ?? null);
        if (!rack) return fail('Unknown rack.');
        if (!rack.switchFailed) return fail('That switch is fine.');
        if (pendingFor(s, 'replaceSwitch', rack.id)) return fail('Someone is already on it.');
        if (s.inventory.switch < 1) return fail('No spare switch in stock. Order one from the Shop.');
        return dispatchJob(s, { kind: 'replaceSwitch', rackId: rack.id, part: 'switch', site: rack.pos }, cmd.techId);
      }
      if (cmd.job === 'repairUplink') {
        const u = s.uplinks.find((x) => x.id === cmd.uplinkId);
        if (!u) return fail('Unknown uplink.');
        if (u.up) return fail('That uplink is working.');
        if (s.jobs.some((j) => j.kind === 'repairUplink' && j.uplinkId === u.id)) return fail('Someone is already on it.');
        const site = nearestTile(s.grid, 'dock', homeTile(s)) ?? homeTile(s);
        return dispatchJob(s, { kind: 'repairUplink', uplinkId: u.id, part: null, site }, cmd.techId);
      }
      if (cmd.job === 'resetMain' || cmd.job === 'repairOob') {
        const site = s.site;
        if (!site) return fail('This site has no grid connection to manage.');
        if (cmd.job === 'resetMain' && !site.mainTripped) return fail('The main breaker is fine.');
        if (cmd.job === 'repairOob' && site.oob !== 'cut') return fail('The management link is fine.');
        if (s.jobs.some((j) => j.kind === cmd.job)) return fail('Someone is already on it.');
        const where = nearestTile(s.grid, 'dock', homeTile(s)) ?? homeTile(s);
        return dispatchJob(s, { kind: cmd.job, part: null, site: where }, cmd.techId);
      }
      if (cmd.job === 'startGenerator' || cmd.job === 'testGenerator' || cmd.job === 'replaceBattery' || cmd.job === 'transferAts' || cmd.job === 'refuel') {
        const b = s.backup;
        if (!b) return fail('This site has no backup power system.');
        const site = nearestTile(s.grid, 'dock', homeTile(s)) ?? homeTile(s);
        if (s.jobs.some((j) => j.kind === cmd.job)) return fail('Someone is already on it.');
        if (cmd.job === 'startGenerator') {
          if (b.generator !== 'failed') return fail('The generator is fine.');
        } else if (cmd.job === 'transferAts') {
          if (b.ats !== 'failed') return fail('The transfer switch is fine.');
        } else if (cmd.job === 'refuel') {
          if (b.generator === 'none') return fail('You have no generator yet.');
          if ((b.fuelMin ?? BACKUP.fuelFullMin) > BACKUP.fuelFullMin * 0.9) return fail('The tank is nearly full.');
          if (s.cash < BACKUP.refuelCost) return fail('Not enough cash for the diesel.');
          s.cash -= BACKUP.refuelCost;
        } else if (cmd.job === 'testGenerator') {
          if (b.generator === 'none') return fail('You have no generator yet.');
          if (!b.grid) return fail('Not during an outage: it is already needed.');
          if (s.cash < BACKUP.genTestCost) return fail('Not enough cash for the diesel.');
          s.cash -= BACKUP.genTestCost;
        } else {
          if (b.upsUnits < 1) return fail('You have no UPS yet.');
          if (b.health >= 0.95) return fail('The batteries are still good.');
          if (s.cash < BACKUP.batteryJobCost) return fail('Not enough cash for the batteries.');
          s.cash -= BACKUP.batteryJobCost;
        }
        return dispatchJob(s, { kind: cmd.job, part: null, site }, cmd.techId);
      }
      if (cmd.job === 'repairPdu') {
        const rack = rackById(s, cmd.rackId ?? null);
        if (!rack) return fail('Unknown rack.');
        const feed = cmd.feed ?? (rack.pduA === 'failed' ? 'A' : rack.pduB === 'failed' ? 'B' : null);
        if (!feed || (feed === 'A' ? rack.pduA : rack.pduB) !== 'failed') return fail('That power feed is fine.');
        if (s.jobs.some((j) => j.kind === 'repairPdu' && j.rackId === rack.id)) return fail('Someone is already on it.');
        return dispatchJob(s, { kind: 'repairPdu', rackId: rack.id, feed, part: null, site: rack.pos }, cmd.techId);
      }
      if (cmd.job === 'dualCord') {
        if (!hasFeature(s, 'redundancy')) return fail('Redundant power unlocks in Chapter 6.');
        const dev = deviceById(s, cmd.deviceId ?? null);
        if (!dev) return fail('Unknown server.');
        if ((dev.psus ?? 1) === 2) return fail('That server already has two legs.');
        if (pendingFor(s, 'dualCord', dev.id)) return fail('Someone is already on it.');
        if (s.inventory.psu < 1) {
          showTip(s, 'shop');
          return fail('No power supply in stock. Order one from the Shop.');
        }
        const rack = rackById(s, dev.rackId)!;
        return dispatchJob(s, { kind: 'dualCord', rackId: rack.id, deviceId: dev.id, part: 'psu', site: rack.pos }, cmd.techId);
      }
      if (cmd.job === 'resetBreaker') {
        const rack = rackById(s, cmd.rackId ?? null);
        if (!rack) return fail('Unknown rack.');
        if (!rack.tripped) return fail('That breaker is not tripped.');
        if (pendingFor(s, 'resetBreaker', rack.id)) return fail('Someone is already on it.');
        return dispatchJob(s, { kind: 'resetBreaker', rackId: rack.id, part: null, site: rack.pos }, cmd.techId);
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
      const workMin = cmd.job === 'swapDisk' && dev.faults.includes('dataloss') ? 60 : cmd.job === 'swapDisk' && (s.noc ?? 0) >= 2 ? Math.round(JOB_WORK_MIN.swapDisk * 0.67) : undefined;
      return dispatchJob(s, { kind: cmd.job, rackId: rack.id, deviceId: dev.id, part: need.part, site: rack.pos, workMin }, cmd.techId);
    }
    case 'install': {
      const rack = rackById(s, cmd.rackId);
      if (!rack) return fail('Unknown rack.');
      const model = SERVER_MODELS[cmd.model];
      if (!slotFree(s, rack, cmd.slot, model.u)) return fail('Those rack slots are not free.');
      if (s.inventory[cmd.model] < 1) return fail(`No ${model.name} in stock.`);
      if (cmd.contractId !== null && contractById(s, cmd.contractId)?.status !== 'active') return fail('Unknown contract.');
      return dispatchJob(s, {
        kind: 'install', rackId: rack.id, part: cmd.model, site: rack.pos, model: cmd.model, slot: cmd.slot, contractId: cmd.contractId,
      }, cmd.techId);
    }
    case 'buildRack': {
      if (!hasFeature(s, 'buildRack')) return fail('Building racks unlocks in a later chapter.');
      if (s.inventory.rack < 1) return fail('Buy a rack in the Shop first.');
      const why = buildable(s, cmd.pos);
      if (why) return fail(why);
      return dispatchJob(s, { kind: 'buildRack', part: 'rack', site: cmd.pos, facing: cmd.facing ?? 'S' }, cmd.techId);
    }
    case 'placeCooler': {
      if (s.inventory[cmd.coolerKind] < 1) return fail(`Buy a ${PARTS[cmd.coolerKind].name} in the Shop first.`);
      const why = buildable(s, cmd.pos);
      if (why) return fail(why);
      return dispatchJob(s, { kind: 'placeCooler', part: cmd.coolerKind, site: cmd.pos, coolerKind: cmd.coolerKind }, cmd.techId);
    }
    case 'cancelJob':
      return cancelJob(s, cmd.jobId) ? ok() : fail('Unknown job.');
    case 'order': {
      if (!hasFeature(s, 'shop')) return fail('The shop is closed.');
      if (!Number.isInteger(cmd.qty) || cmd.qty < 1) return fail('Quantity must be at least 1.');
      const gated: Partial<Record<PartId, Parameters<typeof hasFeature>[1]>> = {
        rack: 'buildRack', wallAc: 'coolers', crac: 'maintenance', filter: 'maintenance', switch: 'network', coffee: 'fatigue',
      };
      const need = gated[cmd.part];
      if (need && !hasFeature(s, need)) {
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
      s.techs.push(techFromCandidate(cand, homeSpot(s, s.techs.length)));
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
      addLog(s, 'success', `Contract signed: ${contractLabel(c)}! Assign ${c.units} units of servers to it.`);
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
    case 'serviceCooler':
    case 'repairCooler': {
      const c = s.coolers.find((x) => x.id === cmd.coolerId);
      if (!c || c.kind === 'officeAc') return fail('Facilities look after that unit.');
      if (cmd.type === 'repairCooler' && !c.broken) return fail('That cooler is not broken.');
      if (cmd.type === 'serviceCooler' && c.broken) return fail('That cooler is broken: repair it instead.');
      if (s.jobs.some((j) => (j.kind === 'serviceCooler' || j.kind === 'repairCooler') && j.coolerId === c.id)) return fail('Someone is already on it.');
      const part = cmd.type === 'serviceCooler' ? 'filter' : null;
      if (part && s.inventory.filter < 1) return fail('No spare filter in stock. Order one from the Shop.');
      return dispatchJob(s, { kind: cmd.type, coolerId: c.id, part, site: c.pos }, cmd.techId);
    }
    case 'startProject': {
      if (!hasFeature(s, 'projects')) return fail('Ops projects unlock in Chapter 1.');
      const def = PROJECTS[cmd.project];
      if (s.projects.includes(cmd.project)) return fail('Already done.');
      if (s.jobs.some((j) => j.projectId === cmd.project)) return fail('Already in progress.');
      if (s.cash < def.cost) return fail('Not enough cash.');
      const rack = s.racks[0];
      if (!rack) return fail('No racks to work on.');
      const res = dispatchJob(s, { kind: 'project', projectId: cmd.project, rackId: rack.id, part: null, site: rack.pos, workMin: (s.noc ?? 0) >= 3 ? Math.round(def.workMin / 2) : def.workMin }, cmd.techId ?? 'best');
      if (res.ok) {
        s.cash -= def.cost;
        addLog(s, 'money', `Started ${def.name} ($${def.cost}).`);
      }
      return res;
    }
    case 'resolveAttack': {
      if (!s.cyber.attack) return fail('There is no attack to defend against.');
      if (!Number.isFinite(cmd.score)) return fail('Invalid result.');
      resolveAttack(s, cmd.score, cmd.mode, cmd.infected);
      return ok();
    }
    case 'hireLead': {
      if (!hasFeature(s, 'autodispatch')) return fail('A Shift Lead unlocks in Chapter 2.');
      if (s.techs.some((t) => t.role === 'lead')) return fail('You already have a Shift Lead.');
      const lead = techFromCandidate({ ...makeCandidate(s), role: 'lead', skill: 3, trait: null, salaryPerDay: LEAD.salaryPerDay }, homeSpot(s, s.techs.length));
      s.techs.push(lead);
      s.progress.maxTechs = Math.max(s.progress.maxTechs, s.techs.length);
      addLog(s, 'success', `${lead.name} joined as Shift Lead. Switch on auto-dispatch in the Team tab.`);
      return ok();
    }
    case 'setAutoDispatch': {
      if (cmd.on && !s.techs.some((t) => t.role === 'lead')) return fail('Hire a Shift Lead first.');
      s.autoDispatch = cmd.on;
      addLog(s, 'info', cmd.on ? 'Auto-dispatch is ON: the Shift Lead sends specialists to routine alarms.' : 'Auto-dispatch is OFF.');
      return ok();
    }
    case 'buyUplink': {
      if (!hasFeature(s, 'network')) return fail('Networking unlocks in Chapter 3.');
      if (s.uplinks.some((u) => u.name === EXTRA_UPLINK.name)) return fail('You already have a second route.');
      if (s.cash < EXTRA_UPLINK.setupCost) return fail('Not enough cash.');
      s.cash -= EXTRA_UPLINK.setupCost;
      s.uplinks.push({ id: newId(s, 'u'), name: EXTRA_UPLINK.name, capacityGbps: EXTRA_UPLINK.capacityGbps, costPerDay: EXTRA_UPLINK.costPerDay, up: true, repairAt: null });
      addLog(s, 'success', `${EXTRA_UPLINK.name} is live: +${EXTRA_UPLINK.capacityGbps} Gbps on a separate route.`);
      return ok();
    }
    case 'setFreeze': {
      if (!hasFeature(s, 'changes')) return fail('Change management unlocks in Chapter 6.');
      s.freeze = cmd.on;
      addLog(s, 'info', cmd.on ? '🧊 Change freeze ON: no planned work will start. Requests pile up.' : '🧊 Change freeze OFF: scheduled work can start again.');
      return ok();
    }
    case 'setRollback': {
      const c = s.changes?.find((x) => x.id === cmd.changeId);
      if (!c || c.status !== 'offered') return fail('That change can no longer be edited.');
      c.rollback = cmd.on;
      c.riskPct = changeRisk(s, c, s.minute).pct;
      return ok();
    }
    case 'skipChange': {
      const c = s.changes?.find((x) => x.id === cmd.changeId);
      if (!c || (c.status !== 'offered' && c.status !== 'scheduled')) return fail('That change is not waiting.');
      c.status = 'skipped';
      return ok();
    }
    case 'scheduleChange': {
      const c = s.changes?.find((x) => x.id === cmd.changeId);
      if (!c || c.status !== 'offered') return fail('That change is not waiting for a decision.');
      if (s.freeze && cmd.when === 'now') return fail('A change freeze is in force. Lift it first, or pick tonight and lift the freeze before then.');
      scheduleChange(s, c, cmd.when);
      addLog(s, 'info', `📝 ${changeTitle(s, c)} scheduled ${cmd.when === 'now' ? 'now' : `for ${formatClock(c.scheduledAt ?? 0)}`} (${c.riskPct}% risk${c.rollback ? ', with rollback' : ''}).`);
      return ok();
    }
    case 'expediteInfra': {
      const p = s.pendingInfra?.find((x) => x.id === cmd.id);
      if (!p) return fail('That order is not pending.');
      if (p.expedited) return fail('Already expedited.');
      const price = Math.round((p.kind === 'ups' ? BACKUP.upsPrice : p.kind === 'grid' ? SITE.stepPrice : BACKUP.generatorPrice) * LEAD_TIME.expediteShare);
      if (s.cash < price) return fail('Not enough cash.');
      s.cash -= price;
      p.at = Math.max(s.minute + 60, p.at - LEAD_TIME.expediteDays * 1440);
      p.expedited = true;
      addLog(s, 'money', `📦 Expedited ${LEAD_TIME[p.kind].name} order: ${LEAD_TIME.expediteDays} day sooner for $${price}.`);
      return ok();
    }
    case 'setCooling': {
      const site = s.site;
      if (!site) return fail('Cooling modes unlock in Chapter 7.');
      if (cmd.mode === 'evaporative' && droughtActive(s)) return fail('A drought is on: evaporative cooling is banned.');
      site.cooling = cmd.mode;
      addLog(s, 'info', cmd.mode === 'evaporative' ? '💧 Evaporative cooling: cheap electricity, but it uses water.' : '🌬️ Dry cooling: almost no water, but more electricity.');
      return ok();
    }
    case 'buyEconomizer': {
      const site = s.site;
      if (!site) return fail('Free cooling unlocks in Chapter 7.');
      if (site.economizer) return fail('You already have free cooling.');
      if (s.cash < ENERGY.economizerPrice) return fail('Not enough cash.');
      s.cash -= ENERGY.economizerPrice;
      site.economizer = true;
      addLog(s, 'success', '❄️ Free cooling installed: on cool nights the outside air does the work.');
      return ok();
    }
    case 'setRenewable': {
      const site = s.site;
      if (!site) return fail('Power contracts unlock in Chapter 7.');
      site.renewable = cmd.on;
      addLog(s, 'info', cmd.on ? '🌱 Renewable power contract: electricity costs 15% more, off-site water use drops.' : 'Back to the standard grid mix.');
      return ok();
    }
    case 'buyHeatReuse': {
      const site = s.site;
      if (!site) return fail('Heat reuse unlocks in Chapter 7.');
      if (site.heatReuse) return fail('You already sell your heat.');
      if (s.cash < ENERGY.heatReusePrice) return fail('Not enough cash.');
      s.cash -= ENERGY.heatReusePrice;
      site.heatReuse = true;
      addLog(s, 'success', '♨️ Heat reuse is live: a neighbour buys your warm air, and green customers count it in your favour.');
      return ok();
    }
    case 'orderGrid': {
      const site = s.site;
      if (!site) return fail('The grid connection can only be upgraded in Chapter 7 and later.');
      const queued = (s.pendingInfra ?? []).filter((p) => p.kind === 'grid').length;
      if (site.gridSteps + queued >= SITE.maxSteps) return fail('The utility will not connect more than that.');
      if (s.cash < SITE.stepPrice) return fail('Not enough cash.');
      s.cash -= SITE.stepPrice;
      orderInfra(s, 'grid');
      addLog(s, 'success', `📦 Grid upgrade requested: +${SITE.stepW / 1000} kW in ${LEAD_TIME.grid.days} days (the utility queue).`);
      return ok();
    }
    case 'upgradeNoc': {
      if (!hasFeature(s, 'remote')) return fail('Remote management unlocks in Chapter 2.');
      const level = s.noc ?? 0;
      const next = NOC.levels[level];
      if (!next) return fail('The NOC is fully upgraded.');
      if (s.cash < next.price) return fail('Not enough cash.');
      s.cash -= next.price;
      s.noc = level + 1;
      addLog(s, 'success', `🖥️ NOC upgraded: ${next.name}. Licence $${next.perDay}/day extra.`);
      return ok();
    }
    case 'remoteReboot': {
      if ((s.noc ?? 0) < 1) return fail('You need the NOC remote reboot upgrade first.');
      if (s.site?.oob === 'cut') return fail('The out-of-band management link is down: someone has to walk to the rack.');
      const dev = deviceById(s, cmd.deviceId);
      if (!dev || !dev.faults.includes('hung')) return fail('That server is not hung.');
      s.remoteReboots ??= [];
      if (s.remoteReboots.some((r) => r.deviceId === dev.id)) return fail('A reboot is already running.');
      s.remoteReboots.push({ deviceId: dev.id, at: s.minute + NOC.rebootMin });
      addLog(s, 'info', `🖥️ Remote reboot sent to a server in Rack ${s.racks.findIndex((r) => r.id === dev.rackId) + 1}.`);
      return ok();
    }
    case 'buyUps': {
      const b = s.backup;
      if (!b) return fail('This site has no backup power system.');
      const queued = (s.pendingInfra ?? []).filter((p) => p.kind === 'ups').length;
      if (b.upsUnits + queued >= BACKUP.maxUps) return fail('The UPS room is full.');
      if (s.cash < BACKUP.upsPrice) return fail('Not enough cash.');
      s.cash -= BACKUP.upsPrice;
      if (hasFeature(s, 'changes')) {
        orderInfra(s, 'ups');
        addLog(s, 'success', `📦 UPS unit ordered: arrives in ${LEAD_TIME.ups.days} days.`);
        return ok();
      }
      b.upsUnits++;
      b.upsKwh = Math.min(upsCapacityKwh(b), b.upsKwh + BACKUP.upsKwhPerUnit);
      addLog(s, 'success', `Another UPS unit is online: ${b.upsUnits} now, ${Math.round(upsCapacityKwh(b))} kWh of battery.`);
      return ok();
    }
    case 'buyGenerator': {
      const b = s.backup;
      if (!b) return fail('This site has no backup power system.');
      if (b.generator !== 'none' || (s.pendingInfra ?? []).some((p) => p.kind === 'generator')) return fail('You already have a generator.');
      if (s.cash < BACKUP.generatorPrice) return fail('Not enough cash.');
      s.cash -= BACKUP.generatorPrice;
      if (hasFeature(s, 'changes')) {
        orderInfra(s, 'generator');
        addLog(s, 'success', `📦 Generator ordered: arrives in ${LEAD_TIME.generator.days} days.`);
        return ok();
      }
      b.generator = 'idle';
      addLog(s, 'success', 'A diesel generator is installed in the yard. Have an electrician test it!');
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
