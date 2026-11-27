import { createBackup } from './backup';
import { createSite } from './site';
import { createLoop } from './liquid';
import { createRng, pick, randInt, rand } from '../core/rng';
import { dayOf } from '../core/time';
import { COOLERS, MORALE, RACK_CAPACITY_U } from '../data/catalog';
import { CHAPTERS, type ContractSeed } from '../data/chapters';
import { FIRST_NAMES, LAST_NAMES, TIPS, TRAITS, availableRoles } from '../data/content';
import { DIFFICULTIES } from '../data/difficulty';
import { parseMap } from './grid';
import { nextContractName } from './naming';
import type {
  Candidate, ChapterId, Contract, Cooler, DayReport, DifficultyId, Facing, Fx, GameState, LogKind, PartId, Rack, Tech, Vec,
} from './types';

export const SAVE_VERSION = 6;
const LOG_CAP = 200;

export function emptyReport(day: number): DayReport {
  return { day, revenue: 0, penalties: 0, salaries: 0, electricity: 0, rent: 0, network: 0, net: 0, slaMet: 0, slaBreached: 0 };
}

const FX_CAP = 80;

export function addFx(s: GameState, kind: Fx['kind'], rackId: string | null, amount: number): void {
  s.fx.push({ id: s.fxSeq++, kind, rackId, amount, minute: s.minute });
  if (s.fx.length > FX_CAP) s.fx.splice(0, s.fx.length - FX_CAP);
}

export function newId(s: GameState, prefix: string): string {
  return `${prefix}${s.nextId++}`;
}

export function addLog(s: GameState, kind: LogKind, text: string): void {
  s.log.push({ id: s.logSeq++, minute: s.minute, kind, text });
  if (s.log.length > LOG_CAP) s.log.splice(0, s.log.length - LOG_CAP);
}

export function showTip(s: GameState, key: string): void {
  if (s.seenTips.includes(key)) return;
  const text = TIPS[key];
  if (!text) return;
  s.seenTips.push(key);
  if (DIFFICULTIES[s.difficulty].hints) addLog(s, 'tip', text);
}

export function makeContract(s: GameState, seed: ContractSeed, status: Contract['status']): Contract {
  const day = dayOf(s.minute);
  return {
    id: newId(s, 'c'),
    ...seed,
    name: nextContractName(s.contracts, seed.customer, seed.name),
    bandwidthPerUnit: seed.bandwidthPerUnit ?? 0,
    status,
    startDay: status === 'active' ? day : null,
    liveFrom: status === 'active' ? s.minute : null,
    graceUntil: null,
    expiresDay: status === 'active' ? day + seed.durationDays : day + 2,
    minutesToday: 0,
    okMinutesToday: 0,
    breaches: 0,
    totalMinutes: 0,
    totalOkMinutes: 0,
  };
}

export function makeCandidate(s: GameState): Candidate {
  const skill = randInt(s.rng, 1, 4);
  const trait = rand(s.rng) < 0.6 ? pick(s.rng, TRAITS).id : null;
  return {
    id: newId(s, 'cand'),
    name: `${pick(s.rng, FIRST_NAMES)} ${pick(s.rng, LAST_NAMES)}`,
    skill,
    speed: Math.round((1.1 + rand(s.rng) * 0.5) * 100) / 100,
    salaryPerDay: 90 + skill * 45 + randInt(s.rng, 0, 30),
    trait,
    role: s.features.includes('roles') ? pick(s.rng, availableRoles(s.features)) : 'hw',
  };
}

export function techFromCandidate(c: Candidate, pos: Vec): Tech {
  return {
    id: c.id.replace('cand', 't'), name: c.name, role: c.role, skill: c.skill, speed: c.speed,
    salaryPerDay: c.salaryPerDay, pos: { ...pos }, path: [], jobId: null, carrying: null, trait: c.trait,
    fatigue: 0, morale: MORALE.base, onBreak: false,
  };
}

export function makeRack(s: GameState, pos: Vec, powerBudgetW: number, facing: Facing = 'S'): Rack {
  return {
    id: newId(s, 'r'), pos: { ...pos }, capacityU: RACK_CAPACITY_U, powerBudgetW, tripped: false, temp: s.ambient, loadW: 0,
    facing, switchFailed: false, maintenance: false, recirculation: 0,
  };
}

export function makeCooler(s: GameState, kind: Cooler['kind'], pos: Vec): Cooler {
  const def = COOLERS[kind];
  return { id: newId(s, 'ac'), kind, pos: { ...pos }, capacityKw: def.capacityKw, on: true, powerW: def.powerW, health: 1, broken: false };
}

const EMPTY_INVENTORY: Record<PartId, number> = {
  disk: 0, psu: 0, server1u: 0, server2u: 0, rack: 0, portableAc: 0, wallAc: 0, crac: 0, filter: 0, switch: 0, coffee: 0,
};

/** Staff-room spot for the n-th person, so people do not stack on one tile. */
export function homeSpot(s: GameState, who: Tech | number): Vec {
  const spots: Vec[] = [];
  s.grid.tiles.forEach((k, i) => {
    if (k === 'noc') spots.push({ x: i % s.grid.w, y: Math.floor(i / s.grid.w) });
  });
  if (!spots.length) return homeTile(s);
  const idx = typeof who === 'number' ? who : s.techs.indexOf(who);
  return spots[Math.max(0, idx) % spots.length]!;
}

export function homeTile(s: GameState): Vec {
  const i = s.grid.tiles.indexOf('noc');
  const j = i >= 0 ? i : s.grid.tiles.indexOf('floor');
  return { x: j % s.grid.w, y: Math.floor(j / s.grid.w) };
}

export function createGame(chapterId: ChapterId, difficulty: DifficultyId, seed: number): GameState {
  const ch = CHAPTERS[chapterId];
  const diff = DIFFICULTIES[difficulty];
  const map = parseMap(ch.map);
  const s: GameState = {
    version: SAVE_VERSION,
    seed,
    rng: createRng(seed),
    minute: ch.startMinute,
    nextId: 1,
    chapter: chapterId,
    difficulty,
    features: [...ch.features],
    grid: map.grid,
    ambient: ch.ambient,
    racks: [],
    devices: [],
    coolers: [],
    uplinks: [],
    bandwidthUsed: 0,
    coffeeLevel: 0,
    techs: [],
    candidates: [],
    jobs: [],
    alarms: [],
    contracts: [],
    inventory: { ...EMPTY_INVENTORY, ...ch.inventory },
    orders: [],
    cash: ch.startCash * diff.startingCash,
    reputation: 3,
    log: [],
    logSeq: 1,
    seenTips: [],
    reports: [],
    progress: { status: 'playing', stars: 0, firedEvents: [], negativeCashDays: 0, maxTechs: 1, peakCash: 0, startCash: 0 },
    stats: { incidents: 0, resolved: 0, criticals: 0, thermalShutdowns: 0, peakTemp: 0 },
    energyTodayKwh: 0,
    today: emptyReport(dayOf(ch.startMinute)),
    pendingRevenue: {},
    fx: [],
    fxSeq: 1,
    shift: null,
    shiftReports: [],
    pendingShiftReport: null,
    walkins: [],
    projects: [],
    autoDispatch: false,
    cyber: { attack: null, queue: [], followUp: null, blocked: 0, hits: 0, perfect: 0, history: [] },
    floodUntil: 0,
    floodStrength: 0,
    streak: { hours: 0, best: 0, hit: false },
    auditUntil: 0,
    outages: {},
    postMortems: [],
    pendingPostMortem: null,
    alarmHistory: [],
    failuresEnabled: ch.failuresEnabled,
    ...(ch.incidentMult !== undefined ? { incidentMult: ch.incidentMult } : {}),
    attention: null,
  };
  s.progress.peakCash = s.cash;
  s.progress.startCash = s.cash;
  if (ch.siteCapW) s.site = createSite(ch.siteCapW);
  if (ch.loopCdus) s.loop = createLoop(ch.loopCdus);
  if (ch.backup) s.backup = createBackup(ch.backup.ups, ch.backup.health, ch.backup.generator, ch.backup.fuelMin);

  map.racks.forEach((pos, i) => s.racks.push(makeRack(s, pos, ch.rackPowerBudgetW, ch.rackFacing?.[i] ?? 'S')));
  for (const pos of map.cracs) s.coolers.push(makeCooler(s, 'crac', pos));
  for (const pos of map.coolers) s.coolers.push(makeCooler(s, ch.mapCooler, pos));
  for (const u of ch.uplinks ?? []) s.uplinks.push({ ...u, id: newId(s, 'u'), up: true, repairAt: null });
  for (const c of ch.contracts) s.contracts.push(makeContract(s, c.seed, c.active ? 'active' : 'offered'));
  // initial offers in chapters with a contract board stay open longer
  for (const c of s.contracts) if (c.status === 'offered') c.expiresDay = dayOf(s.minute) + 3;

  for (const d of ch.devices) {
    const rack = s.racks[d.rack];
    if (!rack) throw new Error(`chapter ${chapterId}: device references missing rack ${d.rack}`);
    s.devices.push({
      id: newId(s, 'd'), model: d.model, rackId: rack.id, slot: d.slot, faults: [], poweredOn: true,
      thermalShutdown: false, contractId: d.contract === null ? null : s.contracts[d.contract]!.id, load: 0,
    });
  }

  s.techs.push({
    id: 'manager', name: 'You (Manager)', role: 'manager', skill: 2, speed: 1, salaryPerDay: 0,
    pos: { ...homeSpot(s, 0) }, path: [], jobId: null, carrying: null, trait: null, fatigue: 0, morale: MORALE.base, onBreak: false,
  });
  for (let i = 0; i < ch.hwTechs; i++) {
    const t = techFromCandidate({ ...makeCandidate(s), skill: 3, trait: null, role: ch.startingRoles?.[i] ?? 'hw' }, homeSpot(s, s.techs.length));
    s.techs.push(t);
  }
  s.progress.maxTechs = s.techs.length;
  if (s.features.includes('hire')) for (let i = 0; i < 3; i++) s.candidates.push(makeCandidate(s));
  // with specialists, the first candidates always include one of each new role
  if (s.features.includes('roles')) availableRoles(s.features).filter((r) => r !== 'hw').forEach((role, i) => (s.candidates[i]!.role = role));

  addLog(s, 'story', `${ch.event ? 'Event' : `Chapter ${ch.number}`}: ${ch.title}. ${ch.intro}`);
  return s;
}
