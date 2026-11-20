import { at } from '../core/time';
import type { ChapterId, Contract, Facing, FaultKind, FeatureFlag, GameState, PartId, ServerModelId, TechRole, Uplink } from '../sim/types';
import { overallUptimePct, servingDeviceCount, activeContracts } from '../sim/selectors';

export type ContractSeed = Pick<
  Contract,
  'customer' | 'description' | 'units' | 'slaPct' | 'revenuePerDay' | 'penaltyPerBreach' | 'durationDays' | 'profile'
> & Partial<Pick<Contract, 'bandwidthPerUnit'>>;

export type ScriptedAction =
  | { type: 'say'; text: string }
  | { type: 'tip'; key: string }
  | { type: 'fault'; rack: number; device: number; fault: FaultKind }
  | { type: 'ambient'; value: number; officeAc?: boolean; text?: string }
  | { type: 'offer'; contract: ContractSeed }
  | { type: 'failures'; enabled: boolean }
  | { type: 'filter'; cooler: number; health: number }
  | { type: 'cutUplink'; uplink: number; text?: string };

export interface ScriptedEvent {
  id: string;
  at: number;
  actions: ScriptedAction[];
}

export interface Objective {
  label: string;
  check: (s: GameState) => boolean;
}

export interface ChapterDef {
  id: ChapterId;
  number: number;
  title: string;
  subtitle: string;
  intro: string;
  map: string[];
  startMinute: number;
  endMinute: number;
  features: FeatureFlag[];
  startCash: number;
  ambient: number;
  rackPowerBudgetW: number;
  /** Cooler kind for 'A' tiles in the map. */
  mapCooler: 'officeAc' | 'wallAc';
  /** Facing of the map's racks, in map order (default: all 'S'). */
  rackFacing?: Facing[];
  uplinks?: Omit<Uplink, 'id' | 'up' | 'repairAt'>[];
  /** Roles of the starting technicians, besides the manager (default: hardware techs). */
  startingRoles?: TechRole[];
  devices: { rack: number; model: ServerModelId; slot: number; contract: number | null }[];
  contracts: { seed: ContractSeed; active: boolean }[];
  inventory: Partial<Record<PartId, number>>;
  hwTechs: number;
  failuresEnabled: boolean;
  dailyOffers: boolean;
  events: ScriptedEvent[];
  objectives: [Objective, Objective, Objective]; // ★ pass, ★★ pro, ★★★ legend
  next: ChapterId | null;
}

const BAKERY: ContractSeed = {
  customer: "Grandma's Bakery", description: 'Website and till system. Busy in office hours.',
  units: 2, slaPct: 95, revenuePerDay: 240, penaltyPerBreach: 150, durationDays: 30, profile: 'office',
};

export const CHAPTERS: Record<ChapterId, ChapterDef> = {
  ch0: {
    id: 'ch0', number: 0, title: 'The Closet', subtitle: 'Tutorial',
    intro: 'Your company’s entire IT lives in one rack in a broom closet. Keep it alive until Monday morning.',
    map: [
      '##########',
      '#SS..A...#',
      '#........#',
      '#...R....#',
      '#........#',
      '#N.......#',
      '##########',
    ],
    startMinute: at(4, 9), // Friday 09:00
    endMinute: at(7, 8), // Monday 08:00
    features: ['shop'],
    startCash: 3000,
    ambient: 23,
    rackPowerBudgetW: 2500,
    mapCooler: 'officeAc',
    devices: [
      { rack: 0, model: 'server1u', slot: 0, contract: 0 },
      { rack: 0, model: 'server1u', slot: 1, contract: 0 },
      { rack: 0, model: 'server1u', slot: 2, contract: null },
    ],
    contracts: [{ seed: BAKERY, active: true }],
    inventory: { disk: 1, server1u: 1 },
    hwTechs: 0,
    failuresEnabled: false,
    dailyOffers: false,
    events: [
      { id: 'welcome', at: at(4, 9, 1), actions: [{ type: 'tip', key: 'welcome' }] },
      { id: 'tutorialDisk', at: at(4, 9, 40), actions: [{ type: 'fault', rack: 0, device: 0, fault: 'disk' }, { type: 'tip', key: 'firstAlarm' }] },
      {
        id: 'bakeryOnline', at: at(4, 11, 30), actions: [
          { type: 'say', text: 'Grandma wants an online shop! Install a server and accept the new contract.' },
          { type: 'offer', contract: { customer: "Grandma's Bakery", description: 'Online cake orders.', units: 1, slaPct: 95, revenuePerDay: 140, penaltyPerBreach: 80, durationDays: 30, profile: 'office' } },
          { type: 'tip', key: 'install' },
        ],
      },
      { id: 'failuresOn', at: at(4, 14), actions: [{ type: 'failures', enabled: true }, { type: 'tip', key: 'shop' }] },
      { id: 'acOff', at: at(4, 18), actions: [{ type: 'ambient', value: 34, officeAc: false, text: 'Friday 18:00: the office AC turns off for the weekend…' }, { type: 'tip', key: 'acOff' }] },
      { id: 'acOn', at: at(7, 6), actions: [{ type: 'ambient', value: 23, officeAc: true, text: 'Monday 06:00: the office AC is back on. Phew.' }] },
    ],
    objectives: [
      { label: 'Keep SLA uptime ≥ 90% and cash ≥ $0 until Monday 08:00', check: (s) => overallUptimePct(s) >= 90 && s.cash >= 0 },
      { label: 'No SLA breach all weekend', check: (s) => s.contracts.every((c) => c.breaches === 0) },
      { label: 'Zero critical alarms', check: (s) => s.stats.criticals === 0 },
    ],
    next: 'ch1',
  },
  ch1: {
    id: 'ch1', number: 1, title: 'Server Room', subtitle: 'Hire your first technician',
    intro: 'The company moved IT into a real server room. Customers are calling. Grow to 10 servers in service, and get some help!',
    map: [
      '##############',
      '#SS....A.....#',
      '#S...........#',
      '#...R.R.R.R..#',
      '#............#',
      '#............#',
      '#NN..........#',
      '#NN.........D#',
      '##############',
    ],
    startMinute: at(0, 8),
    endMinute: at(3, 8),
    features: ['shop', 'hire', 'contracts'],
    startCash: 9000,
    ambient: 23,
    rackPowerBudgetW: 4000,
    mapCooler: 'wallAc',
    devices: [
      { rack: 0, model: 'server1u', slot: 0, contract: 0 },
      { rack: 0, model: 'server1u', slot: 1, contract: 0 },
      { rack: 0, model: 'server1u', slot: 2, contract: 0 },
      { rack: 1, model: 'server1u', slot: 0, contract: 1 },
      { rack: 1, model: 'server1u', slot: 1, contract: 1 },
    ],
    contracts: [
      { seed: { ...BAKERY, units: 2, durationDays: 20 }, active: true },
      { seed: { customer: 'Law & Order Mail', description: 'Email for a law firm. Office hours only.', units: 2, slaPct: 98, revenuePerDay: 260, penaltyPerBreach: 200, durationDays: 20, profile: 'office' }, active: true },
      { seed: { customer: 'Nightly News', description: 'News site, busy in the evening.', units: 3, slaPct: 97, revenuePerDay: 380, penaltyPerBreach: 250, durationDays: 20, profile: 'evening' }, active: false },
      { seed: { customer: 'Pixel Forge Games', description: 'Game servers for an indie studio.', units: 3, slaPct: 97, revenuePerDay: 420, penaltyPerBreach: 300, durationDays: 20, profile: 'evening' }, active: false },
    ],
    inventory: { disk: 2, psu: 1, server1u: 2 },
    hwTechs: 0,
    failuresEnabled: true,
    dailyOffers: false,
    events: [
      { id: 'hireTip', at: at(0, 8, 2), actions: [{ type: 'tip', key: 'hire' }] },
      { id: 'contractsTip', at: at(0, 8, 30), actions: [{ type: 'tip', key: 'contracts' }] },
      { id: 'doubleTrouble', at: at(1, 11), actions: [
        { type: 'say', text: 'Uh oh, two failures at once. Who goes first?' },
        { type: 'fault', rack: 0, device: 0, fault: 'disk' },
        { type: 'fault', rack: 1, device: 0, fault: 'psu' },
      ] },
    ],
    objectives: [
      { label: '≥ 10 servers serving customers and SLA uptime ≥ 97%', check: (s) => servingDeviceCount(s) >= 10 && overallUptimePct(s) >= 97 },
      { label: 'SLA uptime ≥ 99%', check: (s) => overallUptimePct(s) >= 99 },
      { label: 'Hire at most one technician', check: (s) => s.progress.maxTechs <= 2 },
    ],
    next: 'ch2',
  },
  ch2: {
    id: 'ch2', number: 2, title: 'Startup Colo', subtitle: 'Contracts, power and heat',
    intro: 'You now rent space to paying customers. Choose your contracts, watch power budgets and keep the floor cool.',
    map: [
      '######################',
      '#SSS.....A.......~~~~#',
      '#S...............~~~~#',
      '#..R.R.R.R.R.R...~~~~#',
      '#................~~~~#',
      '#................~~~~#',
      '#................~~~~#',
      '#................~~~~#',
      '#NN..............~~~~#',
      '#NN.............D~~~~#',
      '######################',
    ],
    startMinute: at(0, 8),
    endMinute: at(5, 8),
    features: ['shop', 'hire', 'contracts', 'power', 'buildRack', 'coolers'],
    startCash: 14000,
    ambient: 24,
    rackPowerBudgetW: 3000,
    mapCooler: 'wallAc',
    devices: [
      { rack: 0, model: 'server2u', slot: 0, contract: 0 },
      { rack: 0, model: 'server2u', slot: 2, contract: 0 },
      { rack: 1, model: 'server1u', slot: 0, contract: 1 },
      { rack: 1, model: 'server1u', slot: 1, contract: 1 },
      { rack: 1, model: 'server1u', slot: 2, contract: 1 },
    ],
    contracts: [
      { seed: { customer: 'ByteBank', description: 'Fintech. Strict SLA, pays a lot.', units: 3, slaPct: 99.5, revenuePerDay: 1100, penaltyPerBreach: 900, durationDays: 10, profile: 'office' }, active: true },
      { seed: { customer: 'Law & Order Mail', description: 'Email for a law firm.', units: 2, slaPct: 98, revenuePerDay: 450, penaltyPerBreach: 350, durationDays: 10, profile: 'office' }, active: true },
      { seed: { customer: 'Pizza Rocket', description: 'Food delivery: big peaks at lunch and dinner.', units: 5, slaPct: 98, revenuePerDay: 1300, penaltyPerBreach: 900, durationDays: 8, profile: 'lunchDinner' }, active: false },
    ],
    inventory: { disk: 2, psu: 1, server1u: 2, server2u: 1 },
    hwTechs: 1,
    failuresEnabled: true,
    dailyOffers: true,
    events: [
      { id: 'demandTip', at: at(0, 8, 2), actions: [{ type: 'tip', key: 'demand' }] },
      { id: 'powerTip', at: at(0, 9), actions: [{ type: 'tip', key: 'power' }] },
      { id: 'buildTip', at: at(0, 12), actions: [{ type: 'tip', key: 'buildRack' }] },
      { id: 'heatwave', at: at(2, 10), actions: [{ type: 'ambient', value: 31, text: 'Heatwave! The building air is up to 31°C. Your coolers have to work harder.' }, { type: 'tip', key: 'heat' }] },
      { id: 'heatwaveEnd', at: at(3, 22), actions: [{ type: 'ambient', value: 24, text: 'The heatwave breaks. Cooler air at last.' }] },
    ],
    objectives: [
      { label: 'Make $5,000 profit with ≥ 3 active contracts', check: (s) => s.cash - s.progress.startCash >= 5000 && activeContracts(s).length >= 3 },
      { label: 'SLA uptime ≥ 98%', check: (s) => overallUptimePct(s) >= 98 },
      { label: 'Reputation ≥ 4.5★', check: (s) => s.reputation >= 4.5 },
    ],
    next: 'ch3',
  },

  ch3: {
    id: 'ch3', number: 3, title: 'Colocation Floor', subtitle: 'Aisles, specialists and the backhoe',
    intro: 'A real colocation floor with three rows of racks, a CRAC unit and a fiber uplink. Launch week is coming. Get the airflow right, hire specialists and keep the bits flowing.',
    map: [
      '#########################',
      '#SSS....C...........~~~~#',
      '#S..................~~~~#',
      '#..R.R.R.R.R........~~~~#',
      '#...................~~~~#',
      '#..R.R.R.R.R........~~~~#',
      '#...................~~~~#',
      '#..R.R.R.R.R........~~~~#',
      '#...................~~~~#',
      '#...........A.......~~~~#',
      '#NN.................~~~~#',
      '#NN................D~~~~#',
      '#########################',
    ],
    startMinute: at(0, 8),
    endMinute: at(5, 8),
    features: ['shop', 'hire', 'contracts', 'power', 'buildRack', 'coolers', 'aisles', 'network', 'roles', 'fatigue', 'maintenance'],
    startCash: 16000,
    ambient: 24,
    rackPowerBudgetW: 3000,
    mapCooler: 'wallAc',
    uplinks: [{ name: 'MetroFiber A', capacityGbps: 8, costPerDay: 150 }],
    startingRoles: ['hw'],
    devices: [
      { rack: 0, model: 'server1u', slot: 0, contract: 0 }, { rack: 0, model: 'server1u', slot: 1, contract: 0 },
      { rack: 1, model: 'server1u', slot: 0, contract: 0 }, { rack: 1, model: 'server1u', slot: 1, contract: 0 },
      { rack: 2, model: 'server1u', slot: 0, contract: 0 }, { rack: 2, model: 'server1u', slot: 1, contract: 1 },
      { rack: 3, model: 'server1u', slot: 0, contract: 1 }, { rack: 3, model: 'server1u', slot: 1, contract: 1 },
      { rack: 5, model: 'server1u', slot: 0, contract: 2 }, { rack: 5, model: 'server1u', slot: 1, contract: 2 },
      { rack: 6, model: 'server1u', slot: 0, contract: 2 }, { rack: 6, model: 'server1u', slot: 1, contract: 2 },
      { rack: 7, model: 'server1u', slot: 0, contract: 2 }, { rack: 7, model: 'server1u', slot: 1, contract: 3 },
      { rack: 8, model: 'server1u', slot: 0, contract: 3 }, { rack: 8, model: 'server1u', slot: 1, contract: 3 },
    ],
    contracts: [
      { seed: { customer: 'ByteBank', description: 'Fintech. Strict SLA, pays a lot.', units: 4, slaPct: 99.5, revenuePerDay: 1800, penaltyPerBreach: 1100, durationDays: 10, profile: 'office', bandwidthPerUnit: 0.3 }, active: true },
      { seed: { customer: 'Law & Order Mail', description: 'Email for a law firm.', units: 3, slaPct: 98, revenuePerDay: 750, penaltyPerBreach: 400, durationDays: 10, profile: 'office', bandwidthPerUnit: 0.2 }, active: true },
      { seed: { customer: 'Nightly News', description: 'News site, busy in the evening.', units: 4, slaPct: 98, revenuePerDay: 1250, penaltyPerBreach: 700, durationDays: 10, profile: 'evening', bandwidthPerUnit: 0.6 }, active: true },
      { seed: { ...BAKERY, units: 2, revenuePerDay: 350, durationDays: 10, bandwidthPerUnit: 0.1 }, active: true },
    ],
    inventory: { disk: 2, psu: 1, server1u: 2, filter: 1, switch: 1 },
    hwTechs: 1,
    failuresEnabled: true,
    dailyOffers: true,
    events: [
      { id: 'aislesTip', at: at(0, 8, 2), actions: [{ type: 'tip', key: 'aisles' }] },
      { id: 'rolesTip', at: at(0, 8, 20), actions: [{ type: 'tip', key: 'roles' }] },
      { id: 'networkTip', at: at(0, 10), actions: [{ type: 'tip', key: 'network' }] },
      { id: 'fatigueTip', at: at(0, 13), actions: [{ type: 'tip', key: 'fatigue' }] },
      { id: 'launchOffer', at: at(1, 9), actions: [
        { type: 'say', text: 'Pixel Forge Games is launching their big game on Wednesday evening and wants servers here. Bandwidth-hungry gamers incoming!' },
        { type: 'offer', contract: { customer: 'Pixel Forge Launch', description: 'Game launch servers: huge evening traffic.', units: 6, slaPct: 98, revenuePerDay: 3000, penaltyPerBreach: 1500, durationDays: 6, profile: 'evening', bandwidthPerUnit: 0.9 } },
      ] },
      { id: 'filterWorn', at: at(1, 14), actions: [{ type: 'filter', cooler: 0, health: 0.35 }, { type: 'tip', key: 'maintenance' }] },
      { id: 'backhoe', at: at(2, 19, 30), actions: [{ type: 'cutUplink', uplink: 0, text: 'Wednesday 19:30, launch night: a backhoe outside just dug through MetroFiber A!' }, { type: 'tip', key: 'uplinkCut' }] },
    ],
    objectives: [
      { label: 'SLA uptime ≥ 98% and a profit', check: (s) => overallUptimePct(s) >= 98 && s.cash > s.progress.startCash },
      { label: 'SLA uptime ≥ 99.8%', check: (s) => overallUptimePct(s) >= 99.8 },
      { label: 'Perfect airflow: no rack breathing hot exhaust at the end', check: (s) => s.racks.every((r) => r.recirculation === 0) },
    ],
    next: null,
  },
};

export const CHAPTER_ORDER: ChapterId[] = ['ch0', 'ch1', 'ch2', 'ch3'];
