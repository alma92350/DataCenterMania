import { at } from '../core/time';
import { DIFFICULTIES } from './difficulty';
import type { AttackKind, ChapterId, Contract, Facing, FaultKind, FeatureFlag, GameState, PartId, ServerModelId, TechRole, Uplink, Villain } from '../sim/types';
import { resilience } from '../sim/resilience';
import { pueAverage } from '../sim/site';
import { spofReport } from '../sim/spof';
import { aiEffective } from '../sim/ai';
import { averageSatisfaction } from '../sim/crm';
import { overallUptimePct, servingDeviceCount, activeContracts } from '../sim/selectors';

/** Money goals shrink with the difficulty's starting cash, so harder levels stay fair. */
const profitGoal = (s: GameState, base: number) => Math.round(base * DIFFICULTIES[s.difficulty].startingCash);

const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.round(Math.abs(n)).toLocaleString('en-US')}`;

export type ContractSeed = Pick<
  Contract,
  'customer' | 'description' | 'units' | 'slaPct' | 'revenuePerDay' | 'penaltyPerBreach' | 'durationDays' | 'profile'
> & Partial<Pick<Contract, 'bandwidthPerUnit' | 'name' | 'pueMax' | 'kind'>>;

export type ScriptedAction =
  | { type: 'say'; text: string }
  | { type: 'tip'; key: string }
  | { type: 'fault'; rack: number; device: number; fault: FaultKind }
  | { type: 'ambient'; value: number; officeAc?: boolean; text?: string }
  | { type: 'offer'; contract: ContractSeed }
  | { type: 'failures'; enabled: boolean }
  | { type: 'filter'; cooler: number; health: number }
  | { type: 'cutUplink'; uplink: number; text?: string }
  | { type: 'attack'; kind: AttackKind; villain?: Villain }
  | { type: 'outage'; minutes: number; text?: string }
  | { type: 'pduFail'; rack: number; feed: 'A' | 'B'; text?: string }
  | { type: 'offerChange'; kind: 'firmware' | 'pduMaintenance' | 'coolerSwap' | 'capacityInstall' }
  | { type: 'supplyShock'; days: number; text?: string }
  | { type: 'delayInfra'; days: number; text?: string }
  | { type: 'drought'; days: number; text?: string }
  | { type: 'pumpFail'; text?: string }
  | { type: 'audit' }
  | { type: 'tenantLeaves'; text?: string }
  | { type: 'pager'; what: 'feed' | 'cooler'; text: string }
  | { type: 'leak'; rack: number; text?: string }
  | { type: 'spike'; mult: number; minutes: number; text?: string }
  | { type: 'corrupt'; text?: string }
  | { type: 'oobCut'; text?: string }
  | { type: 'surge'; mult: number; hours: number; text?: string }
  | { type: 'freeze'; on: boolean; text?: string };

export interface ScriptedEvent {
  id: string;
  at: number;
  actions: ScriptedAction[];
}

export interface Objective {
  label: string;
  check: (s: GameState) => boolean;
  /** Live progress shown in the HUD goal chip. */
  progress?: (s: GameState) => string;
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
  /** A self-contained event: reachable from the start screen, not part of the campaign order. */
  event?: boolean;
  /** Scales random incidents for the whole chapter. */
  incidentMult?: number;
  /** Fixed shift goal for every shift of this chapter (default: random). */
  shiftGoal?: 'sla' | 'noCritical' | 'fastFix';
  /** Roles of the starting technicians, besides the manager (default: hardware techs). */
  startingRoles?: TechRole[];
  devices: { rack: number; model: ServerModelId; slot: number; contract: number | null }[];
  contracts: { seed: ContractSeed; active: boolean }[];
  inventory: Partial<Record<PartId, number>>;
  hwTechs: number;
  failuresEnabled: boolean;
  /** Starting backup power: UPS units, their health and the generator. */
  backup?: { ups: number; health: number; generator: 'none' | 'idle'; fuelMin?: number };
  /** Grid connection in watts (Chapter 7+). */
  siteCapW?: number;
  /** A campus with other sites (Chapter 10). */
  campus?: boolean;
  /** Era the chapter belongs to (campaign frame). */
  era?: 'cloud' | 'ai' | 'energy';
  /** Coolant distribution units at the start (Chapter 8). */
  loopCdus?: number;
  dailyOffers: boolean;
  events: ScriptedEvent[];
  objectives: [Objective, Objective, Objective]; // ★ pass, ★★ pro, ★★★ legend
  next: ChapterId | null;
}

const BAKERY: ContractSeed = {
  customer: "Grandma's Bakery", name: 'Till System', description: 'Website and till system. Busy in office hours.',
  units: 2, slaPct: 95, revenuePerDay: 240, penaltyPerBreach: 150, durationDays: 30, profile: 'office',
};

/** The 25x13 colocation floor shared by Colocation Floor, Launch Week and Hacker Weekend. */
const COLO_MAP = [
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
];

const COLO_DEVICES: ChapterDef['devices'] = [
  { rack: 0, model: 'server1u', slot: 0, contract: 0 }, { rack: 0, model: 'server1u', slot: 1, contract: 0 },
  { rack: 1, model: 'server1u', slot: 0, contract: 0 }, { rack: 1, model: 'server1u', slot: 1, contract: 0 },
  { rack: 2, model: 'server1u', slot: 0, contract: 0 }, { rack: 2, model: 'server1u', slot: 1, contract: 1 },
  { rack: 3, model: 'server1u', slot: 0, contract: 1 }, { rack: 3, model: 'server1u', slot: 1, contract: 1 },
  { rack: 5, model: 'server1u', slot: 0, contract: 2 }, { rack: 5, model: 'server1u', slot: 1, contract: 2 },
  { rack: 6, model: 'server1u', slot: 0, contract: 2 }, { rack: 6, model: 'server1u', slot: 1, contract: 2 },
  { rack: 7, model: 'server1u', slot: 0, contract: 2 }, { rack: 7, model: 'server1u', slot: 1, contract: 3 },
  { rack: 8, model: 'server1u', slot: 0, contract: 3 }, { rack: 8, model: 'server1u', slot: 1, contract: 3 },
];

const COLO_CONTRACTS: ChapterDef['contracts'] = [
  { seed: { customer: 'ByteBank', description: 'Fintech. Strict SLA, pays a lot.', units: 4, slaPct: 99.5, revenuePerDay: 1800, penaltyPerBreach: 1100, durationDays: 10, profile: 'office' }, active: true },
  { seed: { customer: 'Law & Order Mail', description: 'Email for a law firm.', units: 3, slaPct: 98, revenuePerDay: 750, penaltyPerBreach: 400, durationDays: 10, profile: 'office' }, active: true },
  { seed: { customer: 'Nightly News', description: 'News site, busy in the evening.', units: 4, slaPct: 98, revenuePerDay: 1250, penaltyPerBreach: 700, durationDays: 10, profile: 'evening' }, active: true },
  { seed: { ...BAKERY, units: 2, revenuePerDay: 350, durationDays: 10 }, active: true },
];

const LAUNCH_CONTRACTS: { seed: ContractSeed; active: boolean }[] = [
  { seed: { customer: 'ByteBank', description: 'Fintech. Strict SLA, pays a lot.', units: 4, slaPct: 99.5, revenuePerDay: 1800, penaltyPerBreach: 1100, durationDays: 10, profile: 'office', bandwidthPerUnit: 0.3 }, active: true },
  { seed: { customer: 'Law & Order Mail', description: 'Email for a law firm.', units: 3, slaPct: 98, revenuePerDay: 750, penaltyPerBreach: 400, durationDays: 10, profile: 'office', bandwidthPerUnit: 0.2 }, active: true },
  { seed: { customer: 'Nightly News', description: 'News site, busy in the evening.', units: 4, slaPct: 98, revenuePerDay: 1250, penaltyPerBreach: 700, durationDays: 10, profile: 'evening', bandwidthPerUnit: 0.6 }, active: true },
  { seed: { ...BAKERY, units: 2, revenuePerDay: 350, durationDays: 10, bandwidthPerUnit: 0.1 }, active: true },
];

export type ScenarioId = 'sc1' | 'sc2' | 'sc3';
const CORE: Record<Exclude<ChapterId, ScenarioId>, ChapterDef> = {
  ch0: {
    id: 'ch0', number: 0, title: 'The Closet', subtitle: 'Tutorial',
    intro: 'Your company’s entire IT lives in one rack in a broom closet. It is Friday. Keep it alive until 22:00.',
    map: [
      '##########',
      '#SS..A...#',
      '#........#',
      '#...R....#',
      '#........#',
      '#N.......#',
      '##########',
    ],
    startMinute: at(4, 8), // Friday 08:00
    endMinute: at(4, 22), // Friday 22:00: one shift
    shiftGoal: 'fastFix',
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
      { id: 'welcome', at: at(4, 8, 1), actions: [{ type: 'tip', key: 'welcome' }] },
      { id: 'tutorialDisk', at: at(4, 8, 30), actions: [{ type: 'fault', rack: 0, device: 0, fault: 'disk' }, { type: 'tip', key: 'raid' }] },
      {
        id: 'bakeryOnline', at: at(4, 9, 40), actions: [
          { type: 'say', text: 'Grandma wants an online shop! Sign the new contract (Clients tab), then install the server from your stock for it.' },
          { type: 'offer', contract: { customer: "Grandma's Bakery", name: 'Online Shop', description: 'Online cake orders.', units: 1, slaPct: 95, revenuePerDay: 140, penaltyPerBreach: 80, durationDays: 30, profile: 'office' } },
          { type: 'tip', key: 'install' },
        ],
      },
      { id: 'websiteFrozen', at: at(4, 11), actions: [{ type: 'say', text: 'Grandma calls: "The website is frozen!" A server hung. A quick reboot will do.' }, { type: 'fault', rack: 0, device: 1, fault: 'hung' }] },
      { id: 'acBreaks', at: at(4, 12, 30), actions: [{ type: 'ambient', value: 29, officeAc: false, text: '12:30: the office AC just broke down. Facilities promise a fix by 17:00…' }, { type: 'tip', key: 'acOff' }] },
      { id: 'psuDies', at: at(4, 15, 30), actions: [{ type: 'say', text: 'Pop! A power supply died, and there is no spare on the shelf.' }, { type: 'fault', rack: 0, device: 0, fault: 'psu' }, { type: 'tip', key: 'shop' }, { type: 'tip', key: 'spare' }] },
      { id: 'acFixed', at: at(4, 17), actions: [{ type: 'ambient', value: 23, officeAc: true, text: '17:00: facilities fixed the AC. Phew.' }] },
      { id: 'evening', at: at(4, 19), actions: [{ type: 'say', text: 'The office is empty. Only you and the hum of the servers. Almost done!' }] },
    ],
    objectives: [
      { label: 'SLA uptime ≥ 95% and cash ≥ $0 at 22:00', check: (s) => overallUptimePct(s) >= 95 && s.cash >= 0, progress: (s) => `Uptime ${overallUptimePct(s).toFixed(1)}% / 95%` },
      { label: 'SLA uptime ≥ 99%', check: (s) => overallUptimePct(s) >= 99 },
      { label: 'Keep every rack below 35°C all day', check: (s) => s.stats.peakTemp < 35 },
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
    endMinute: at(2, 22),
    features: ['shop', 'hire', 'contracts', 'projects', 'walkins'],
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
      { label: '≥ 10 servers serving customers and SLA uptime ≥ 97%', check: (s) => servingDeviceCount(s) >= 10 && overallUptimePct(s) >= 97, progress: (s) => `${servingDeviceCount(s)}/10 servers · uptime ${overallUptimePct(s).toFixed(1)}%` },
      { label: 'SLA uptime ≥ 99%', check: (s) => overallUptimePct(s) >= 99 },
      { label: 'Lean team: hire at most one technician and finish in profit', check: (s) => s.progress.maxTechs <= 2 && s.cash > s.progress.startCash },
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
    endMinute: at(4, 22),
    features: ['shop', 'hire', 'contracts', 'power', 'buildRack', 'coolers', 'projects', 'walkins', 'autodispatch', 'remote'],
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
      { id: 'autoTip', at: at(0, 11), actions: [{ type: 'tip', key: 'autodispatch' }] },
      { id: 'powerTip', at: at(0, 9), actions: [{ type: 'tip', key: 'power' }] },
      { id: 'buildTip', at: at(0, 12), actions: [{ type: 'tip', key: 'buildRack' }] },
      { id: 'heatwave', at: at(2, 10), actions: [{ type: 'ambient', value: 31, text: 'Heatwave! The building air is up to 31°C. Your coolers have to work harder.' }, { type: 'tip', key: 'heat' }] },
      { id: 'heatwaveEnd', at: at(3, 22), actions: [{ type: 'ambient', value: 24, text: 'The heatwave breaks. Cooler air at last.' }] },
    ],
    objectives: [
      { label: 'Make $12,000 profit (scaled by difficulty) with ≥ 3 active contracts', check: (s) => s.cash - s.progress.startCash >= profitGoal(s, 12000) && activeContracts(s).length >= 3, progress: (s) => `Profit ${money(s.cash - s.progress.startCash)} / ${money(profitGoal(s, 12000))} · ${activeContracts(s).length}/3 clients` },
      { label: 'SLA uptime ≥ 98%', check: (s) => overallUptimePct(s) >= 98 },
      { label: 'Cool operator: no rack ever above 28°C', check: (s) => s.stats.peakTemp < 28 },
    ],
    next: 'ch3',
  },

  ch3: {
    id: 'ch3', number: 3, title: 'Colocation Floor', subtitle: 'Hot aisles, cold aisles and the HVAC specialist',
    intro: 'A real colocation floor: three rows of racks and a CRAC unit. Get the airflow right, keep the filters clean with an HVAC specialist, and survive the heatwave.',
    map: COLO_MAP,
    startMinute: at(0, 8),
    endMinute: at(3, 22),
    features: ['shop', 'hire', 'contracts', 'power', 'buildRack', 'coolers', 'aisles', 'maintenance', 'roles', 'projects', 'walkins', 'autodispatch', 'remote'],
    startCash: 16000,
    ambient: 24,
    rackPowerBudgetW: 3000,
    mapCooler: 'wallAc',
    startingRoles: ['hw'],
    devices: COLO_DEVICES,
    contracts: COLO_CONTRACTS,
    inventory: { disk: 2, psu: 1, server1u: 2, filter: 1 },
    hwTechs: 1,
    failuresEnabled: true,
    dailyOffers: true,
    events: [
      { id: 'aislesTip', at: at(0, 8, 2), actions: [{ type: 'tip', key: 'aisles' }] },
      { id: 'rolesTip', at: at(0, 8, 20), actions: [{ type: 'tip', key: 'roles' }] },
      { id: 'filterWorn', at: at(0, 14), actions: [{ type: 'filter', cooler: 0, health: 0.35 }, { type: 'tip', key: 'maintenance' }] },
      { id: 'heatwave', at: at(1, 11), actions: [{ type: 'ambient', value: 31, text: 'Heatwave! The building air is up to 31°C. Aisles and clean filters matter now.' }, { type: 'tip', key: 'heat' }] },
      { id: 'heatwaveEnd', at: at(2, 21), actions: [{ type: 'ambient', value: 24, text: 'The heatwave breaks. Cooler air at last.' }] },
    ],
    objectives: [
      { label: 'SLA uptime ≥ 98% and $8,000 profit (scaled by difficulty)', check: (s) => overallUptimePct(s) >= 98 && s.cash - s.progress.startCash >= profitGoal(s, 8000), progress: (s) => `Uptime ${overallUptimePct(s).toFixed(1)}% / 98% · profit ${money(s.cash - s.progress.startCash)} / ${money(profitGoal(s, 8000))}` },
      { label: 'SLA uptime ≥ 99.8%', check: (s) => overallUptimePct(s) >= 99.8 },
      { label: 'Fix the airflow within 10 hours, keep it fixed, and no critical alarm', check: (s) => (s.stats.airflowMinutes ?? 0) <= 600 && s.racks.every((r) => r.recirculation === 0) && s.stats.criticals === 0 },
    ],
    next: 'ch4',
  },
  ch4: {
    id: 'ch4', number: 4, title: 'Launch Week', subtitle: 'Fiber, bandwidth and a long week',
    intro: 'A big game launches on Wednesday and every customer is online at once. Watch your uplink, keep spare switches, look after your people, and brace for a backhoe.',
    map: COLO_MAP,
    startMinute: at(0, 8),
    endMinute: at(4, 22),
    features: ['shop', 'hire', 'contracts', 'power', 'buildRack', 'coolers', 'aisles', 'maintenance', 'roles', 'projects', 'walkins', 'autodispatch', 'network', 'fatigue', 'remote'],
    startCash: 16000,
    ambient: 24,
    rackPowerBudgetW: 3000,
    mapCooler: 'wallAc',
    // rows already face front-to-front / back-to-back: you learned that in Colocation Floor
    rackFacing: ['S', 'S', 'S', 'S', 'S', 'N', 'N', 'N', 'N', 'N', 'S', 'S', 'S', 'S', 'S'],
    uplinks: [{ name: 'MetroFiber A', capacityGbps: 8, costPerDay: 150 }],
    startingRoles: ['hw'],
    devices: COLO_DEVICES,
    contracts: LAUNCH_CONTRACTS,
    inventory: { disk: 2, psu: 1, server1u: 2, filter: 1, switch: 1 },
    hwTechs: 1,
    failuresEnabled: true,
    dailyOffers: true,
    events: [
      { id: 'networkTip', at: at(0, 8, 5), actions: [{ type: 'tip', key: 'network' }] },
      { id: 'fatigueTip', at: at(0, 13), actions: [{ type: 'tip', key: 'fatigue' }] },
      { id: 'launchOffer', at: at(1, 9), actions: [
        { type: 'say', text: 'Pixel Forge Games is launching their big game on Wednesday evening and wants servers here. Bandwidth-hungry gamers incoming!' },
        { type: 'offer', contract: { customer: 'Pixel Forge Launch', description: 'Game launch servers: huge evening traffic.', units: 6, slaPct: 98, revenuePerDay: 3000, penaltyPerBreach: 1500, durationDays: 6, profile: 'evening', bandwidthPerUnit: 0.9 } },
      ] },
      { id: 'filterWorn', at: at(1, 14), actions: [{ type: 'filter', cooler: 0, health: 0.35 }] },
      { id: 'backhoe', at: at(2, 19, 30), actions: [{ type: 'cutUplink', uplink: 0, text: 'Wednesday 19:30, launch night: a backhoe outside just dug through MetroFiber A!' }, { type: 'tip', key: 'uplinkCut' }] },
    ],
    objectives: [
      { label: 'SLA uptime ≥ 98% and $10,000 profit (scaled by difficulty)', check: (s) => overallUptimePct(s) >= 98 && s.cash - s.progress.startCash >= profitGoal(s, 10000), progress: (s) => `Uptime ${overallUptimePct(s).toFixed(1)}% / 98% · profit ${money(s.cash - s.progress.startCash)} / ${money(profitGoal(s, 10000))}` },
      { label: 'SLA uptime ≥ 99.8%', check: (s) => overallUptimePct(s) >= 99.8 },
      { label: 'A second uplink route and not a single critical alarm all week', check: (s) => s.uplinks.length >= 2 && s.stats.criticals === 0 },
    ],
    next: 'ch5',
  },
  ch5: {
    id: 'ch5', number: 5, title: 'Enterprise DC', subtitle: 'UPS, generators and a very long storm',
    intro: 'A real enterprise hall needs power that never blinks. You have one tired UPS and a generator nobody has ever started. Test it, hire an electrician, and be ready before the storm hits.',
    map: COLO_MAP,
    startMinute: at(0, 8),
    endMinute: at(3, 22),
    features: ['shop', 'hire', 'contracts', 'power', 'buildRack', 'coolers', 'aisles', 'maintenance', 'roles', 'projects', 'walkins', 'autodispatch', 'network', 'fatigue', 'backup', 'remote'],
    startCash: 18000,
    ambient: 24,
    rackPowerBudgetW: 3000,
    mapCooler: 'wallAc',
    rackFacing: ['S', 'S', 'S', 'S', 'S', 'N', 'N', 'N', 'N', 'N', 'S', 'S', 'S', 'S', 'S'],
    uplinks: [{ name: 'MetroFiber A', capacityGbps: 8, costPerDay: 150 }, { name: 'SkyLink Fiber B (separate route)', capacityGbps: 15, costPerDay: 220 }],
    startingRoles: ['hw'],
    devices: COLO_DEVICES,
    contracts: LAUNCH_CONTRACTS,
    inventory: { disk: 2, psu: 1, server1u: 2, filter: 1, switch: 1 },
    hwTechs: 1,
    failuresEnabled: true,
    dailyOffers: true,
    incidentMult: 0.8,
    backup: { ups: 1, health: 0.7, generator: 'idle', fuelMin: 300 },
    events: [
      { id: 'backupTip', at: at(0, 8, 5), actions: [{ type: 'tip', key: 'backup' }] },
      { id: 'elecTip', at: at(0, 9), actions: [{ type: 'tip', key: 'electrician' }] },
      { id: 'drill', at: at(1, 10), actions: [{ type: 'outage', minutes: 50, text: '⚡ 10:00: the utility drops out for a while (a transformer upgrade nobody warned you about). A fine drill for your backup power…' }] },
      { id: 'stormWarning', at: at(2, 9), actions: [{ type: 'say', text: 'Weather service: a severe storm hits tonight. Long power cuts are likely. Is your generator tested?' }] },
      { id: 'storm', at: at(2, 18, 30), actions: [{ type: 'outage', minutes: 300, text: '⛈️ 18:30: the storm took down the substation! Utility power is out for hours.' }] },
    ],
    objectives: [
      { label: 'SLA uptime ≥ 97% and $2,000 profit (scaled by difficulty)', check: (s) => overallUptimePct(s) >= 97 && s.cash - s.progress.startCash >= profitGoal(s, 2000), progress: (s) => `Uptime ${overallUptimePct(s).toFixed(1)}% / 97% · profit ${money(s.cash - s.progress.startCash)} / ${money(profitGoal(s, 2000))}` },
      { label: 'SLA uptime ≥ 99.8% and $6,500 profit', check: (s) => overallUptimePct(s) >= 99.8 && s.cash - s.progress.startCash >= profitGoal(s, 6500) },
      { label: 'No blackout, a tested generator, a second UPS and $10,000 profit', check: (s) => (s.stats.blackoutMin ?? 0) === 0 && s.cash - s.progress.startCash >= profitGoal(s, 10000) && !!s.backup && s.backup.testedAt !== null && s.backup.upsUnits >= 2, progress: (s) => `Blackout ${s.stats.blackoutMin ?? 0} min` },
    ],
    next: 'ch6',
  },
  ch6: {
    id: 'ch6', number: 6, title: 'Grown-up Infrastructure', subtitle: 'Two feeds, two legs, no single points of failure',
    intro: 'Your servers each hang by a single power cord. Real data centers feed every rack from two independent sources and give every server two power supplies. Dual-cord your critical servers before a feed fails.',
    map: COLO_MAP,
    startMinute: at(0, 8),
    endMinute: at(3, 22),
    features: ['shop', 'hire', 'contracts', 'power', 'buildRack', 'coolers', 'aisles', 'maintenance', 'roles', 'projects', 'walkins', 'autodispatch', 'network', 'fatigue', 'backup', 'remote', 'redundancy', 'changes'],
    startCash: 20000,
    ambient: 24,
    rackPowerBudgetW: 3000,
    mapCooler: 'wallAc',
    rackFacing: ['S', 'S', 'S', 'S', 'S', 'N', 'N', 'N', 'N', 'N', 'S', 'S', 'S', 'S', 'S'],
    uplinks: [{ name: 'MetroFiber A', capacityGbps: 8, costPerDay: 150 }, { name: 'SkyLink Fiber B (separate route)', capacityGbps: 15, costPerDay: 220 }],
    startingRoles: ['hw'],
    devices: COLO_DEVICES,
    contracts: LAUNCH_CONTRACTS,
    inventory: { disk: 2, psu: 6, server1u: 2, filter: 1, switch: 1 },
    hwTechs: 1,
    failuresEnabled: true,
    dailyOffers: true,
    incidentMult: 0.65,
    backup: { ups: 2, health: 1, generator: 'idle', fuelMin: 1440 },
    events: [
      { id: 'redundancyTip', at: at(0, 8, 5), actions: [{ type: 'tip', key: 'redundancy' }] },
      { id: 'dualTip', at: at(0, 9), actions: [{ type: 'tip', key: 'dualCord' }] },
      { id: 'firstChanges', at: at(0, 8, 20), actions: [{ type: 'offerChange', kind: 'firmware' }, { type: 'offerChange', kind: 'pduMaintenance' }] },
      { id: 'supplyShock', at: at(1, 8, 30), actions: [{ type: 'supplyShock', days: 2, text: '📦 A chip shortage hits the market: part deliveries now take 3× longer for two days. Check your spares!' }] },
      { id: 'delayedOrder', at: at(2, 9), actions: [{ type: 'delayInfra', days: 1 }] },
      { id: 'feedDrill', at: at(1, 10), actions: [{ type: 'pduFail', rack: 1, feed: 'A', text: '⚡ 10:00: the utility electrician is testing a PDU and drops feed A on one rack. A planned test, but nobody told you…' }] },
      { id: 'feedChain', at: at(2, 15), actions: [{ type: 'pduFail', rack: 3, feed: 'B', text: '⚡ 15:00: feed B fails on another rack. Servers with two legs keep running, but now they hang by a single thread…' }] },
      { id: 'feedChain2', at: at(2, 17), actions: [{ type: 'pduFail', rack: 3, feed: 'A', text: '⚡ 17:00: feed A trips on that same rack. If you did not fix B, this is the chain reaction.' }] },
    ],
    objectives: [
      { label: 'SLA uptime ≥ 97% and $2,000 profit (scaled by difficulty)', check: (s) => overallUptimePct(s) >= 97 && s.cash - s.progress.startCash >= profitGoal(s, 2000), progress: (s) => `Uptime ${overallUptimePct(s).toFixed(1)}% / 97% · profit ${money(s.cash - s.progress.startCash)} / ${money(profitGoal(s, 2000))}` },
      { label: 'SLA uptime ≥ 99.5% and $6,000 profit', check: (s) => overallUptimePct(s) >= 99.5 && s.cash - s.progress.startCash >= profitGoal(s, 6000) },
      { label: 'Resilience level III, no blackout, $20,000 profit', check: (s) => (s.stats.blackoutMin ?? 0) === 0 && s.cash - s.progress.startCash >= profitGoal(s, 20000) && resilience(s).level >= 3, progress: (s) => `Resilience level ${resilience(s).level} / 3 · dual-corded ${s.devices.filter((d) => (d.psus ?? 1) === 2).length} / ${s.devices.length}` },
    ],
    next: 'ch7',
  },
  ch7: {
    id: 'ch7', number: 7, title: 'The Efficiency Drive', subtitle: 'PUE, water and a grid connection that will not grow overnight',
    intro: 'The utility caps your grid connection, a green customer will only sign if your efficiency is good, and Black Friday is coming. Watch PUE and water, plan your capacity, and order the grid upgrade before you need it.',
    map: COLO_MAP,
    startMinute: at(0, 8),
    endMinute: at(4, 22),
    features: ['shop', 'hire', 'contracts', 'power', 'buildRack', 'coolers', 'aisles', 'maintenance', 'roles', 'projects', 'walkins', 'autodispatch', 'network', 'fatigue', 'backup', 'remote', 'redundancy', 'changes', 'capacity', 'energy'],
    startCash: 22000,
    ambient: 24,
    rackPowerBudgetW: 3000,
    mapCooler: 'wallAc',
    rackFacing: ['S', 'S', 'S', 'S', 'S', 'N', 'N', 'N', 'N', 'N', 'S', 'S', 'S', 'S', 'S'],
    uplinks: [{ name: 'MetroFiber A', capacityGbps: 8, costPerDay: 150 }, { name: 'SkyLink Fiber B (separate route)', capacityGbps: 15, costPerDay: 220 }],
    startingRoles: ['hw'],
    devices: COLO_DEVICES,
    contracts: LAUNCH_CONTRACTS,
    inventory: { disk: 2, psu: 4, server1u: 4, filter: 1, switch: 1 },
    hwTechs: 1,
    failuresEnabled: true,
    dailyOffers: true,
    incidentMult: 0.65,
    backup: { ups: 2, health: 1, generator: 'idle', fuelMin: 1440 },
    siteCapW: 10000,
    events: [
      { id: 'energyTip', at: at(0, 8, 5), actions: [{ type: 'tip', key: 'energy' }] },
      { id: 'capacityTip', at: at(0, 8, 40), actions: [{ type: 'tip', key: 'capacity' }] },
      { id: 'greenOffer', at: at(0, 10), actions: [
        { type: 'say', text: 'Verdant Cloud is a green customer: it will sign only if your PUE stays at 1.55 or better. It pays well.' },
        { type: 'offer', contract: { customer: 'Verdant Cloud', name: 'Green Workloads', description: 'ESG customer: PUE must stay at or below 1.55.', units: 4, slaPct: 98, revenuePerDay: 2200, penaltyPerBreach: 900, durationDays: 5, profile: 'office', bandwidthPerUnit: 0.2, pueMax: 1.55 } },
      ] },
      { id: 'oobCut', at: at(1, 14), actions: [{ type: 'oobCut', text: '🖥️ 14:00: a router upgrade cut your out-of-band management link. Remote reboots will not work until a network engineer fixes it.' }] },
      { id: 'drought', at: at(2, 9), actions: [{ type: 'drought', days: 2 }] },
      { id: 'blackFridayWarning', at: at(2, 18), actions: [{ type: 'say', text: 'Black Friday starts tomorrow morning. Expect double traffic and a freeze on changes. Is your grid connection ready?' }] },
      { id: 'blackFriday', at: at(3, 8), actions: [{ type: 'surge', mult: 1.8, hours: 20, text: '🛍️ Black Friday! Customers need almost double the traffic for 20 hours.' }, { type: 'freeze', on: true, text: '🧊 Change freeze: no planned work during Black Friday.' }] },
      { id: 'blackFridayEnd', at: at(3, 22), actions: [{ type: 'freeze', on: false }] },
    ],
    objectives: [
      { label: 'SLA uptime ≥ 97% and $2,000 profit (scaled by difficulty)', check: (s) => overallUptimePct(s) >= 97 && s.cash - s.progress.startCash >= profitGoal(s, 2000), progress: (s) => `Uptime ${overallUptimePct(s).toFixed(1)}% / 97% · PUE ${pueAverage(s).toFixed(2)} · profit ${money(s.cash - s.progress.startCash)} / ${money(profitGoal(s, 2000))}` },
      { label: 'SLA uptime ≥ 99.5%, average PUE ≤ 1.5 and $5,000 profit', check: (s) => overallUptimePct(s) >= 99.5 && pueAverage(s) <= 1.5 && s.cash - s.progress.startCash >= profitGoal(s, 5000) },
      { label: 'Average PUE ≤ 1.35, the main breaker never trips and $25,000 profit', check: (s) => pueAverage(s) <= 1.35 && (s.site?.trips ?? 0) === 0 && s.cash - s.progress.startCash >= profitGoal(s, 25000), progress: (s) => `PUE ${pueAverage(s).toFixed(2)} / 1.35 · trips ${s.site?.trips ?? 0}` },
    ],
    next: 'ch8',
  },
  ch8: {
    id: 'ch8', number: 8, title: 'AI Factory', subtitle: 'Liquid cooling, GPU racks and clusters that fail every few hours',
    intro: 'An AI lab wants to train on your floor. GPU racks draw several times the power and need liquid cooling. Their contract is not about uptime but about effective training time: every interruption costs them minutes. Build the loop, keep it redundant, and keep the cluster running.',
    map: COLO_MAP,
    startMinute: at(0, 8),
    endMinute: at(4, 22),
    features: ['shop', 'hire', 'contracts', 'power', 'buildRack', 'coolers', 'aisles', 'maintenance', 'roles', 'projects', 'walkins', 'autodispatch', 'network', 'fatigue', 'backup', 'remote', 'redundancy', 'changes', 'capacity', 'energy', 'liquid', 'ai'],
    startCash: 32000,
    ambient: 24,
    rackPowerBudgetW: 3000,
    mapCooler: 'wallAc',
    rackFacing: ['S', 'S', 'S', 'S', 'S', 'N', 'N', 'N', 'N', 'N', 'S', 'S', 'S', 'S', 'S'],
    uplinks: [{ name: 'MetroFiber A', capacityGbps: 8, costPerDay: 150 }, { name: 'SkyLink Fiber B (separate route)', capacityGbps: 15, costPerDay: 220 }],
    startingRoles: ['hw'],
    devices: COLO_DEVICES,
    contracts: LAUNCH_CONTRACTS,
    inventory: { disk: 2, psu: 4, server1u: 2, server2u: 4, filter: 1, switch: 1 },
    hwTechs: 1,
    failuresEnabled: true,
    dailyOffers: true,
    incidentMult: 0.65,
    backup: { ups: 2, health: 1, generator: 'idle', fuelMin: 1440 },
    siteCapW: 24000,
    loopCdus: 1,
    events: [
      { id: 'liquidTip', at: at(0, 8, 5), actions: [{ type: 'tip', key: 'liquid' }] },
      { id: 'aiOffer', at: at(0, 9), actions: [
        { type: 'say', text: 'Neuron Labs wants two GPU servers for a training run. They pay a fortune, but they judge you on effective training time: at least 90%.' },
        { type: 'offer', contract: { customer: 'Neuron Labs', name: 'Training Run', description: 'AI training cluster. Judged on effective training time.', units: 10, slaPct: 90, revenuePerDay: 12000, penaltyPerBreach: 4000, durationDays: 5, profile: 'flat', bandwidthPerUnit: 0.5, kind: 'ai' } },
      ] },
      { id: 'pump', at: at(1, 14), actions: [{ type: 'pumpFail', text: '💧 14:00: a coolant pump seizes. With no spare unit on the loop, the GPU racks start heating up fast.' }] },
      { id: 'spike1', at: at(1, 16), actions: [{ type: 'spike', mult: 1.5, minutes: 4 }] },
      { id: 'winter', at: at(2, 11), actions: [{ type: 'leak', rack: 0, text: '❄️ 11:00: a winter storm damaged an outdoor coolant line. A rack on the loop is leaking.' }] },
      { id: 'sdc', at: at(2, 16), actions: [{ type: 'corrupt', text: '🧠 16:00: a GPU server starts returning subtly wrong answers.' }] },
      { id: 'spike2', at: at(3, 15), actions: [{ type: 'spike', mult: 1.6, minutes: 5 }] },
    ],
    objectives: [
      { label: 'Take the AI contract, SLA uptime ≥ 97% and training time ≥ 85%', check: (s) => s.contracts.some((c) => c.kind === 'ai' && c.status !== 'offered') && overallUptimePct(s) >= 97 && aiEffective(s) >= 85, progress: (s) => `Uptime ${overallUptimePct(s).toFixed(1)}% / 97% · training ${aiEffective(s).toFixed(1)}% / 85%` },
      { label: 'Effective training time ≥ 90% and $6,000 profit', check: (s) => aiEffective(s) >= 90 && s.cash - s.progress.startCash >= profitGoal(s, 6000), progress: (s) => `Training ${aiEffective(s).toFixed(1)}% / 90% · profit ${money(s.cash - s.progress.startCash)} / ${money(profitGoal(s, 6000))}` },
      { label: 'Training ≥ 95%, no thermal shutdown, two coolant units and $40,000 profit', check: (s) => aiEffective(s) >= 95 && s.stats.thermalShutdowns === 0 && (s.loop?.cdus ?? 0) >= 2 && s.cash - s.progress.startCash >= profitGoal(s, 40000), progress: (s) => `Training ${aiEffective(s).toFixed(1)}% / 95% · shutdowns ${s.stats.thermalShutdowns}` },
    ],
    next: 'ch9',
  },
  ch9: {
    id: 'ch9', number: 9, title: 'The Long Night', subtitle: 'Customers who talk back, an audit, and a pager at 3 a.m.',
    intro: 'Customers now have moods: a missed SLA or an ignored request makes them nervous, and unhappy ones leave when their contract ends. An auditor arrives on Thursday. At night only your rota is on site, and the pager will wake you. Command the incident, tell customers the truth, and keep everybody happy.',
    map: COLO_MAP,
    startMinute: at(0, 8),
    endMinute: at(4, 22),
    features: ['shop', 'hire', 'contracts', 'power', 'buildRack', 'coolers', 'aisles', 'maintenance', 'roles', 'projects', 'walkins', 'autodispatch', 'network', 'fatigue', 'backup', 'remote', 'redundancy', 'changes', 'capacity', 'energy', 'liquid', 'ai', 'crm', 'nights'],
    startCash: 26000,
    ambient: 24,
    rackPowerBudgetW: 3000,
    mapCooler: 'wallAc',
    rackFacing: ['S', 'S', 'S', 'S', 'S', 'N', 'N', 'N', 'N', 'N', 'S', 'S', 'S', 'S', 'S'],
    uplinks: [{ name: 'MetroFiber A', capacityGbps: 8, costPerDay: 150 }, { name: 'SkyLink Fiber B (separate route)', capacityGbps: 15, costPerDay: 220 }],
    startingRoles: ['hw'],
    devices: COLO_DEVICES,
    contracts: LAUNCH_CONTRACTS.map((c, i) => (i < 2 ? { ...c, seed: { ...c.seed, durationDays: 3 } } : c)),
    inventory: { disk: 2, psu: 6, server1u: 2, filter: 1, switch: 1 },
    hwTechs: 1,
    failuresEnabled: true,
    dailyOffers: true,
    incidentMult: 0.65,
    backup: { ups: 2, health: 1, generator: 'idle', fuelMin: 1440 },
    siteCapW: 20000,
    loopCdus: 1,
    events: [
      { id: 'crmTip', at: at(0, 8, 5), actions: [{ type: 'tip', key: 'crm' }] },
      { id: 'nightsTip', at: at(0, 8, 30), actions: [{ type: 'tip', key: 'nights' }] },
      { id: 'auditNotice', at: at(1, 9), actions: [{ type: 'say', text: 'Notice: a compliance auditor visits on Thursday morning. They will check your generator tests, dual power legs, change record and UPS. Pass and enterprise customers will talk to you.' }] },
      { id: 'pager1', at: at(1, 3), actions: [{ type: 'pager', what: 'feed', text: 'a power feed failed on a rack' }] },
      { id: 'pager2', at: at(2, 3), actions: [{ type: 'pager', what: 'cooler', text: 'a cooler broke down' }] },
      { id: 'audit', at: at(3, 9), actions: [{ type: 'audit' }] },
    ],
    objectives: [
      { label: 'SLA uptime ≥ 97% and $2,000 profit (scaled by difficulty)', check: (s) => overallUptimePct(s) >= 97 && s.cash - s.progress.startCash >= profitGoal(s, 2000), progress: (s) => `Uptime ${overallUptimePct(s).toFixed(1)}% / 97% · mood ${Math.round(averageSatisfaction(s))} · profit ${money(s.cash - s.progress.startCash)} / ${money(profitGoal(s, 2000))}` },
      { label: 'Pass the compliance audit and keep average customer satisfaction ≥ 65', check: (s) => !!s.audit?.passed && averageSatisfaction(s) >= 65, progress: (s) => `Audit ${s.audit?.done ? (s.audit.passed ? 'passed' : 'failed') : 'pending'} · mood ${Math.round(averageSatisfaction(s))} / 65` },
      { label: 'Audit passed, satisfaction ≥ 75, incidents scored ≥ 2 on average and $45,000 profit', check: (s) => !!s.audit?.passed && averageSatisfaction(s) >= 75 && (s.incidentScores?.length ? s.incidentScores.reduce((n, x) => n + x, 0) / s.incidentScores.length >= 2 : false) && s.cash - s.progress.startCash >= profitGoal(s, 45000), progress: (s) => `Mood ${Math.round(averageSatisfaction(s))} / 75 · incident score ${(s.incidentScores?.length ? s.incidentScores.reduce((n, x) => n + x, 0) / s.incidentScores.length : 0).toFixed(1)} / 2` },
    ],
    next: 'ch10',
  },
  ch10: {
    id: 'ch10', number: 10, title: 'Campus', subtitle: 'Several sites, a board and a county that is watching',
    intro: 'Your hall is only the headquarters now. Build a campus: edge nodes near cities for inference, cold sites for training. Each site has its own climate, power price and latency. The county watches your water and noise, and every three days the board reviews your numbers. Miss them twice and you are out.',
    map: COLO_MAP,
    startMinute: at(0, 8),
    endMinute: at(7, 22),
    features: ['shop', 'hire', 'contracts', 'power', 'buildRack', 'coolers', 'aisles', 'maintenance', 'roles', 'projects', 'walkins', 'autodispatch', 'network', 'fatigue', 'backup', 'remote', 'redundancy', 'changes', 'capacity', 'energy', 'liquid', 'ai', 'crm', 'nights', 'campus', 'finance'],
    startCash: 60000,
    ambient: 24,
    rackPowerBudgetW: 3000,
    mapCooler: 'wallAc',
    rackFacing: ['S', 'S', 'S', 'S', 'S', 'N', 'N', 'N', 'N', 'N', 'S', 'S', 'S', 'S', 'S'],
    uplinks: [{ name: 'MetroFiber A', capacityGbps: 8, costPerDay: 150 }, { name: 'SkyLink Fiber B (separate route)', capacityGbps: 15, costPerDay: 220 }],
    startingRoles: ['hw'],
    devices: COLO_DEVICES,
    contracts: LAUNCH_CONTRACTS,
    inventory: { disk: 2, psu: 6, server1u: 2, filter: 1, switch: 1 },
    hwTechs: 1,
    failuresEnabled: true,
    dailyOffers: true,
    incidentMult: 0.65,
    backup: { ups: 2, health: 1, generator: 'idle', fuelMin: 1440 },
    siteCapW: 24000,
    loopCdus: 1,
    campus: true,
    era: 'energy',
    events: [
      { id: 'campusTip', at: at(0, 8, 5), actions: [{ type: 'tip', key: 'campus' }] },
      { id: 'financeTip', at: at(0, 8, 40), actions: [{ type: 'tip', key: 'finance' }] },
      { id: 'tenant', at: at(3, 10), actions: [{ type: 'tenantLeaves', text: '👋 A big tenant cancelled and moved out of your newest site: utilisation there falls for a few days.' }] },
    ],
    objectives: [
      { label: 'Survive the first board review with at least one live site', check: (s) => !!s.campus && s.campus.board.reviews.length >= 1 && (s.campus.sites.some((x) => x.status === 'live')) && s.campus.board.strikes < 2, progress: (s) => `Reviews ${s.campus?.board.reviews.length ?? 0} · live sites ${s.campus?.sites.filter((x) => x.status === 'live').length ?? 0}` },
      { label: 'Both reviews with two or more targets met, and goodwill ≥ 40', check: (s) => !!s.campus && s.campus.board.reviews.length >= 2 && s.campus.board.reviews.every((r) => r.met >= 2) && s.campus.goodwill >= 40, progress: (s) => `Goodwill ${Math.round(s.campus?.goodwill ?? 0)} / 40` },
      { label: 'Every target met in both reviews, three live sites and no moratorium', check: (s) => !!s.campus && s.campus.board.reviews.length >= 2 && s.campus.board.reviews.every((r) => r.met === 3) && s.campus.sites.filter((x) => x.status === 'live').length >= 3 && !s.campus.moratorium, progress: (s) => `Live sites ${s.campus?.sites.filter((x) => x.status === 'live').length ?? 0} / 3` },
    ],
    next: null,
  },
  hack: {
    id: 'hack', number: 3, event: true, title: 'Hacker Weekend', subtitle: 'Script Kiddies and Captain Phish are coming',
    intro: 'Two cartoon villains have picked your data center for the weekend. Flood, phishing and worms: defend in quick micro-games (or auto-defend at half strength) and keep the customers online.',
    map: COLO_MAP,
    startMinute: at(4, 9),
    endMinute: at(5, 20),
    features: ['shop', 'hire', 'contracts', 'power', 'buildRack', 'coolers', 'aisles', 'maintenance', 'roles', 'projects', 'walkins', 'autodispatch', 'cyber'],
    startCash: 16000,
    ambient: 24,
    rackPowerBudgetW: 3000,
    mapCooler: 'wallAc',
    // the aisles are already right: this weekend is about the hackers
    rackFacing: ['S', 'S', 'S', 'S', 'S', 'N', 'N', 'N', 'N', 'N', 'S', 'S', 'S', 'S', 'S'],
    startingRoles: ['hw'],
    devices: COLO_DEVICES,
    contracts: COLO_CONTRACTS,
    inventory: { disk: 2, psu: 1, server1u: 2, filter: 1 },
    hwTechs: 1,
    failuresEnabled: true,
    incidentMult: 0.6,
    dailyOffers: false,
    events: [
      { id: 'cyberTip', at: at(4, 9, 3), actions: [{ type: 'tip', key: 'cyber' }] },
      { id: 'atk1', at: at(4, 10), actions: [{ type: 'attack', kind: 'flood' }] },
      { id: 'atk2', at: at(4, 13), actions: [{ type: 'attack', kind: 'phish' }] },
      { id: 'atk3', at: at(4, 16), actions: [{ type: 'attack', kind: 'worm' }] },
      { id: 'atk4', at: at(4, 19), actions: [{ type: 'attack', kind: 'flood' }] },
      { id: 'atk5', at: at(5, 9), actions: [{ type: 'attack', kind: 'phish' }] },
      { id: 'atk6', at: at(5, 12), actions: [{ type: 'attack', kind: 'worm' }] },
      { id: 'atk7', at: at(5, 16), actions: [{ type: 'attack', kind: 'flood' }] },
    ],
    objectives: [
      { label: 'Survive the weekend: SLA uptime ≥ 90% and cash ≥ $0', check: (s) => overallUptimePct(s) >= 90 && s.cash >= 0, progress: (s) => `Uptime ${overallUptimePct(s).toFixed(1)}% / 90% · blocked ${s.cyber.blocked}` },
      { label: 'Block at least 5 attacks', check: (s) => s.cyber.blocked >= 5, progress: (s) => `Blocked ${s.cyber.blocked} / 5` },
      { label: 'Block every attack, five of them perfectly', check: (s) => s.cyber.hits === 0 && s.cyber.perfect >= 5 },
    ],
    next: null,
  },
};

/** The campaign, in order. Events (like the Hacker Weekend) are not part of it. */
export const CHAPTER_ORDER: ChapterId[] = ['ch0', 'ch1', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6', 'ch7', 'ch8', 'ch9', 'ch10'];

export const EVENT_ORDER: ChapterId[] = ['hack'];

/** Incident Replays (v3.0): short stand-alone scenarios built on a chapter's hall, each unlocked by that chapter. */
export const SCENARIO_ORDER: ScenarioId[] = ['sc1', 'sc2', 'sc3'];
export const SCENARIO_BASE: Record<ScenarioId, Exclude<ChapterId, ScenarioId | 'hack'>> = { sc1: 'ch6', sc2: 'ch5', sc3: 'ch7' };

const scenario = (id: ScenarioId, o: Pick<ChapterDef, 'title' | 'subtitle' | 'intro' | 'events' | 'objectives'> & Partial<ChapterDef>): ChapterDef => {
  const base = CORE[SCENARIO_BASE[id]];
  return { ...base, id, number: base.number, event: true, next: null, startMinute: at(0, 8), endMinute: at(1, 22), dailyOffers: false, ...o };
};
const profit = (s: GameState) => s.cash - s.progress.startCash;

export const CHAPTERS: Record<ChapterId, ChapterDef> = {
  ...CORE,
  sc1: scenario('sc1', {
    title: 'Dual-Feed Fiasco', subtitle: 'Replay: a power feed fails, then the utility does',
    intro: 'Your servers hang by single cords and two power feeds are about to prove why that is a problem. Dual-cord what you can before 10:00, keep the batteries healthy, and ride out two days.',
    features: [...CORE.ch6.features],
    incidentMult: 0.8,
    events: [
      { id: 'redundancyTip', at: at(0, 8, 5), actions: [{ type: 'tip', key: 'redundancy' }, { type: 'tip', key: 'dualCord' }] },
      { id: 'feedA', at: at(0, 10), actions: [{ type: 'pduFail', rack: 1, feed: 'A', text: '⚡ 10:00: the A feed on Rack 1 failed. Anything with a single cord on it is down.' }] },
      { id: 'utility1', at: at(0, 14), actions: [{ type: 'outage', minutes: 60, text: '⚡ 14:00: the utility drops out. Your backup power has to carry the hall.' }] },
      { id: 'feedB', at: at(1, 9), actions: [{ type: 'pduFail', rack: 3, feed: 'B', text: '⚡ 09:00: the B feed on Rack 3 failed.' }] },
      { id: 'utility2', at: at(1, 15), actions: [{ type: 'outage', minutes: 25, text: '⚡ 15:00: another short utility cut.' }] },
    ],
    objectives: [
      { label: 'Survive two days: SLA uptime ≥ 93%', check: (s) => overallUptimePct(s) >= 93, progress: (s) => `Uptime ${overallUptimePct(s).toFixed(1)}% / 93%` },
      { label: 'Uptime ≥ 98% and no blackout', check: (s) => overallUptimePct(s) >= 98 && (s.stats.blackoutMin ?? 0) === 0, progress: (s) => `Blackout ${s.stats.blackoutMin ?? 0} min` },
      { label: 'Uptime ≥ 99.7% and no server left on a single power cord', check: (s) => overallUptimePct(s) >= 99.7 && Object.values(spofReport(s)).every((r) => r.power.length === 0) },
    ],
  }),
  sc2: scenario('sc2', {
    title: 'Ransom Friday', subtitle: 'Replay: attackers strike while the power is out',
    intro: 'The attackers waited for a storm. Defend in the micro-games while the utility is down, and keep the batteries and the generator ready.',
    features: [...CORE.ch5.features, 'cyber'],
    incidentMult: 0.6,
    backup: { ups: 2, health: 1, generator: 'idle', fuelMin: 1440 },
    events: [
      { id: 'cyberTip', at: at(0, 8, 5), actions: [{ type: 'tip', key: 'cyber' }] },
      { id: 'a1', at: at(0, 10), actions: [{ type: 'attack', kind: 'phish' }] },
      { id: 'storm', at: at(0, 13), actions: [{ type: 'outage', minutes: 60, text: '⛈️ 13:00: a storm took the substation. Utility power is out.' }] },
      { id: 'a2', at: at(0, 13, 20), actions: [{ type: 'attack', kind: 'flood' }] },
      { id: 'a3', at: at(0, 16), actions: [{ type: 'attack', kind: 'worm' }] },
      { id: 'a4', at: at(1, 10), actions: [{ type: 'attack', kind: 'phish' }] },
      { id: 'a5', at: at(1, 14), actions: [{ type: 'attack', kind: 'flood' }] },
    ],
    objectives: [
      { label: 'Survive: SLA uptime ≥ 88% and cash ≥ $0', check: (s) => overallUptimePct(s) >= 88 && s.cash >= 0, progress: (s) => `Uptime ${overallUptimePct(s).toFixed(1)}% / 88% · blocked ${s.cyber.blocked}` },
      { label: 'Block at least 3 attacks and have no blackout', check: (s) => s.cyber.blocked >= 3 && (s.stats.blackoutMin ?? 0) === 0, progress: (s) => `Blocked ${s.cyber.blocked} / 3` },
      { label: 'Block every attack and finish with $2,000 profit', check: (s) => s.cyber.hits === 0 && s.cyber.blocked >= 5 && profit(s) >= 2000 },
    ],
  }),
  sc3: scenario('sc3', {
    title: 'Heat Dome', subtitle: 'Replay: a heatwave, a drought and a grid limit',
    intro: 'A heat dome sits over the region. Outside air is 36 degrees, evaporative cooling is about to be banned, and your grid connection is small. Cool the hall without tripping the main breaker.',
    features: [...CORE.ch7.features],
    siteCapW: 9000,
    incidentMult: 0.8,
    events: [
      { id: 'energyTip', at: at(0, 8, 5), actions: [{ type: 'tip', key: 'energy' }] },
      { id: 'dome', at: at(0, 10), actions: [{ type: 'ambient', value: 45, text: '🔥 10:00: a heat dome arrives. It is hot outside and your coolers are losing capacity.' }, { type: 'filter', cooler: 0, health: 0.05 }, { type: 'filter', cooler: 1, health: 0.05 }] },
      { id: 'drought', at: at(0, 12), actions: [{ type: 'drought', days: 2 }] },
      { id: 'peak', at: at(1, 12), actions: [{ type: 'surge', mult: 2.5, hours: 6, text: '📈 12:00: customers need 2.5× traffic during the peak.' }] },
      { id: 'cool', at: at(1, 20), actions: [{ type: 'ambient', value: 24, text: '🌤️ 20:00: the heat finally breaks.' }] },
    ],
    objectives: [
      { label: 'Survive: SLA uptime ≥ 94%', check: (s) => overallUptimePct(s) >= 94, progress: (s) => `Uptime ${overallUptimePct(s).toFixed(1)}% / 94%` },
      { label: 'Uptime ≥ 98% and the main breaker never trips', check: (s) => overallUptimePct(s) >= 98 && (s.site?.trips ?? 0) === 0, progress: (s) => `Breaker trips ${s.site?.trips ?? 0}` },
      { label: 'Uptime ≥ 99.5%, no breaker trip and an average PUE of 1.6 or better', check: (s) => overallUptimePct(s) >= 99.5 && (s.site?.trips ?? 0) === 0 && pueAverage(s) <= 1.6, progress: (s) => `PUE ${pueAverage(s).toFixed(2)} / 1.6` },
    ],
  }),
};
