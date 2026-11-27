/**
 * Domain model. GameState is plain JSON (no classes, no Maps) so that it can be
 * saved, loaded, diffed and replayed deterministically.
 */
import type { RngState } from '../core/rng';

export type Severity = 0 | 1 | 2 | 3; // info, warning, major, critical
export const SEVERITY_LABEL = ['Info', 'Warning', 'Major', 'Critical'] as const;

export interface Vec {
  x: number;
  y: number;
}

export type TileKind = 'void' | 'wall' | 'floor' | 'locked' | 'storage' | 'dock' | 'noc';

export interface Grid {
  w: number;
  h: number;
  tiles: TileKind[]; // row-major, index = y * w + x
}

export type DifficultyId = 'intern' | 'sysadmin' | 'senior' | 'nightmare';
export type ChapterId = 'ch0' | 'ch1' | 'ch2' | 'ch3' | 'ch4' | 'ch5' | 'ch6' | 'ch7' | 'ch8' | 'ch9' | 'ch10' | 'hack';
export type FeatureFlag =
  | 'hire' | 'contracts' | 'power' | 'buildRack' | 'coolers' | 'shop' | 'remote'
  | 'aisles' | 'network' | 'roles' | 'fatigue' | 'maintenance'
  | 'projects' | 'walkins' | 'autodispatch' | 'cyber' | 'backup' | 'redundancy' | 'changes' | 'capacity' | 'energy' | 'liquid' | 'ai' | 'crm' | 'nights' | 'campus' | 'finance';

export type PartId =
  | 'disk' | 'psu' | 'server1u' | 'server2u' | 'rack' | 'portableAc' | 'wallAc'
  | 'crac' | 'filter' | 'switch' | 'coffee';
export type ServerModelId = 'server1u' | 'server2u';

export type FaultKind = 'disk' | 'dataloss' | 'psu' | 'hung' | 'malware' | 'corrupt';

export interface Device {
  id: string;
  model: ServerModelId;
  rackId: string;
  slot: number; // lowest U position (0-based from bottom)
  faults: FaultKind[];
  poweredOn: boolean;
  thermalShutdown: boolean;
  /** Power supplies: 1 = single-corded on feed A, 2 = dual-corded on A and B. Missing means 1. */
  psus?: 1 | 2;
  /** GPU server: five times the power, two and a half times the compute (v1.5). */
  gpu?: boolean;
  contractId: string | null;
  load: number; // 0..1, computed each tick
}

/** Direction the rack's front (cold-air intake) faces. Exhaust leaves the back. */
export type Facing = 'N' | 'S';

export interface Rack {
  id: string;
  pos: Vec;
  capacityU: number;
  powerBudgetW: number;
  tripped: boolean;
  temp: number;
  loadW: number; // computed
  facing: Facing;
  /** Top-of-rack switch failed: every server in the rack loses network. */
  switchFailed: boolean;
  /** Being rotated / serviced: servers are offline. */
  maintenance: boolean;
  /** °C of hot exhaust recirculated into this rack's intake (computed). */
  recirculation: number;
  /** Power feeds A and B (PRD v2 F1). Missing means working. */
  pduA?: 'ok' | 'failed';
  pduB?: 'ok' | 'failed';
  /** A firmware change was applied: servers here hang far less (v1.3). */
  fw?: boolean;
  /** PDU maintenance was done: feed failures are much rarer here (v1.3). */
  pduHardened?: boolean;
  /** Direct-to-chip liquid cooling on the loop (v1.5). */
  liquid?: boolean;
}

export type ChangeKind = 'firmware' | 'pduMaintenance' | 'coolerSwap' | 'capacityInstall';

/** Planned work (PRD v2 F2): a card with a benefit and a risk the player chooses when to take. */
export interface Change {
  id: string;
  kind: ChangeKind;
  rackId: string | null;
  coolerId: string | null;
  status: 'offered' | 'scheduled' | 'running' | 'done' | 'failed' | 'skipped' | 'expired';
  scheduledAt: number | null;
  rollback: boolean;
  expiresDay: number;
  /** Risk shown on the card when it was last computed. */
  riskPct: number;
}

/** The site as a whole (PRD v2 F4/F5): grid connection, cooling mode, water, efficiency. */
export interface Site {
  /** Grid connection capacity in watts: the facility cannot draw more than this. */
  gridCapW: number;
  gridSteps: number;
  cooling: 'evaporative' | 'dry';
  economizer: boolean;
  renewable: boolean;
  heatReuse: boolean;
  /** Out-of-band management link: remote reboots need it. */
  oob: 'ok' | 'cut';
  mainTripped: boolean;
  overMin: number;
  droughtUntil: number;
  trips: number;
  /** Cumulative energy (kWh) and water (litres): on-site (cooling) and off-site (embedded in the electricity). */
  itKwh: number;
  facKwh: number;
  waterOnL: number;
  waterOffL: number;
  waterOnToday: number;
  waterOffToday: number;
}

/** Coolant loop for liquid racks (PRD v2 F6). */
export type SiteKind = 'nordic' | 'metro' | 'desert' | 'harbour';
export type SiteTier = 'edge' | 'enterprise' | 'regional';

/** Another site on the campus: simulated by a summary model (PRD v2 F10). */
export interface CampusSite {
  id: string;
  kind: SiteKind;
  tier: SiteTier;
  mw: number;
  status: 'building' | 'live';
  readyAt: number;
  staff: 0 | 1 | 2;
  util: number;
  capex: number;
  shockUntil?: number;
  incident?: boolean;
  /** A recent visit made this site run better until this minute (v2.1). */
  tunedUntil?: number;
}

export interface Campus {
  sites: CampusSite[];
  goodwill: number;
  loan: number;
  investor: boolean;
  power: 'fixed' | 'spot';
  spotMult: number;
  board: { everyDays: number; nextDay: number; strikes: number; reviews: { day: number; met: number; targets: boolean[] }[] };
  flows: { capex: number; proceeds: number; repaid: number; grants: number };
  cashAtReview: number;
  alerts: { id: string; siteId: string; day: number; text: string; helped: boolean }[];
  depreciationToday: number;
  moratorium: boolean;
}

export interface Audit {
  at: number;
  done: boolean;
  passed: boolean;
  checks: { label: string; ok: boolean }[];
}

export interface Pager {
  id: string;
  raisedAt: number;
  text: string;
  answered: 'now' | 'hold' | null;
}

export interface Incident {
  id: string;
  startedAt: number;
  commanderId: string | null;
  update: 'none' | 'honest' | 'vague' | 'silent';
  status: 'open' | 'closed';
  quietSince: number | null;
}

export interface Loop {
  cdus: number;
  /** Working coolant distribution units. */
  cdusOk: number;
  /** A leak: this rack is isolated (shut down) until repaired. */
  leakRackId: string | null;
}

export interface AiTech {
  rearDoor: boolean;
  coldPlates: boolean;
  checkpoint: boolean;
  autoRestart: boolean;
  battery: boolean;
}

export interface PendingInfra {
  id: string;
  kind: 'ups' | 'generator' | 'grid' | 'cdu';
  at: number;
  expedited: boolean;
}

export interface Cooler {
  id: string;
  kind: 'officeAc' | 'portableAc' | 'wallAc' | 'crac';
  pos: Vec;
  capacityKw: number;
  on: boolean;
  powerW: number;
  /** Filter condition 1 (clean) .. 0 (clogged). Only degrades with the 'maintenance' feature. */
  health: number;
  broken: boolean;
}

/** Where the racks get their power right now. */
export type PowerSource = 'grid' | 'ups' | 'generator' | 'none';

export interface Backup {
  grid: boolean;
  /** When the utility comes back (null while the grid is up). */
  gridBackAt: number | null;
  outageStart: number | null;
  source: PowerSource;
  upsUnits: number;
  /** Stored energy in kWh and battery condition 0..1. */
  upsKwh: number;
  health: number;
  generator: 'none' | 'idle' | 'running' | 'failed';
  testedAt: number | null;
  /** The automatic transfer switch: a running generator does nothing if it does not transfer the load. */
  ats?: 'ok' | 'failed';
  /** When the transfer switch was last exercised (a generator test does it). */
  atsServicedAt?: number | null;
  /** Minutes of fuel left in the tank. */
  fuelMin?: number;
}

export type TechRole = 'manager' | 'hw' | 'hvac' | 'net' | 'lead' | 'elec';

export interface Tech {
  id: string;
  name: string;
  role: TechRole;
  skill: number; // 1..5
  speed: number; // tiles per game minute
  salaryPerDay: number;
  pos: Vec;
  path: Vec[];
  jobId: string | null;
  carrying: PartId | null;
  trait: string | null;
  /** 0 (fresh) .. 100 (exhausted). */
  fatigue: number;
  /** 0 (miserable) .. 100 (happy). */
  morale: number;
  onBreak: boolean;
  /** Phished: locked out of their account until this minute (v0.7). */
  lockedUntil?: number;
  /** Trained on liquid cooling (v1.5). */
  liquid?: boolean;
}

export interface Candidate {
  id: string;
  name: string;
  role: TechRole;
  skill: number;
  speed: number;
  salaryPerDay: number;
  trait: string | null;
}

export type JobKind =
  | 'swapDisk'
  | 'startGenerator' | 'testGenerator' | 'replaceBattery' | 'transferAts' | 'refuel'
  | 'repairPdu' | 'dualCord' | 'crossConnect' | 'change' | 'resetMain' | 'repairOob' | 'convertLiquid' | 'gpuUpgrade' | 'repairPump' | 'repairLeak'
  | 'replacePsu'
  | 'reboot'
  | 'resetBreaker'
  | 'install'
  | 'remove'
  | 'buildRack'
  | 'placeCooler'
  | 'rotateRack'
  | 'serviceCooler'
  | 'repairCooler'
  | 'replaceSwitch'
  | 'repairUplink'
  | 'project'
  | 'favor'
  | 'audit'
  | 'reimage';

export type JobStage = 'queued' | 'toStorage' | 'toSite' | 'working' | 'done';

export interface Job {
  id: string;
  kind: JobKind;
  rackId: string | null;
  deviceId: string | null;
  techId: string | null;
  stage: JobStage;
  workLeft: number; // game minutes of hands-on work remaining
  workTotal: number;
  part: PartId | null; // part reserved from inventory (null = no part needed)
  site: Vec; // tile where the work happens (rack, cooler or build tile)
  // install / build specifics
  model?: ServerModelId;
  slot?: number;
  contractId?: string | null;
  coolerKind?: Cooler['kind'];
  coolerId?: string;
  uplinkId?: string;
  facing?: Facing;
  projectId?: ProjectId;
  walkinId?: string;
  feed?: 'A' | 'B';
  changeId?: string;
  /** Liquid work by someone not trained on it takes twice as long. */
  slowed?: boolean;
  /** Started by an idle specialist on their own initiative. */
  proactive?: boolean;
  botched?: boolean;
}

export type AlarmKind =
  | 'disk' | 'dataloss' | 'psu' | 'hung' | 'overheat' | 'breaker' | 'powerHigh'
  | 'filter' | 'coolerDown' | 'switch' | 'uplink' | 'bandwidth' | 'malware' | 'gridDown' | 'generator' | 'battery' | 'ats' | 'fuel' | 'feed' | 'siteCap' | 'siteCapHigh' | 'oob' | 'pump' | 'leak' | 'corrupt';

export interface Alarm {
  id: string;
  kind: AlarmKind;
  severity: Severity;
  rackId: string | null;
  deviceId: string | null;
  coolerId?: string | null;
  uplinkId?: string | null;
  raisedAt: number;
  escalateAt: number | null;
  acknowledged: boolean;
}

export type DemandProfileId = 'flat' | 'office' | 'lunchDinner' | 'evening';

export interface Contract {
  id: string;
  customer: string;
  /** Project name, unique among the customer's contracts. */
  name: string;
  description: string;
  units: number; // compute units required at 100% demand
  slaPct: number;
  revenuePerDay: number;
  penaltyPerBreach: number;
  durationDays: number;
  profile: DemandProfileId;
  /** Gbps of uplink bandwidth per compute unit at full demand. */
  bandwidthPerUnit: number;
  status: 'offered' | 'active' | 'ended';
  startDay: number | null;
  /** Minute SLA measurement started (null = still onboarding). */
  liveFrom: number | null;
  graceUntil: number | null;
  expiresDay: number; // offers expire, actives end
  // daily SLA bookkeeping
  minutesToday: number;
  okMinutesToday: number;
  breaches: number;
  totalMinutes: number;
  totalOkMinutes: number;
  /** ESG clause: the SLA also fails while the site PUE is above this (v1.4). */
  pueMax?: number;
  /** AI training contract: the SLA is effective training time (v1.5). */
  kind?: 'ai';
  /** Customer satisfaction 0..100 (v1.6). Missing means 70. */
  satisfaction?: number;
  renewals?: number;
  /** The cluster is restarting from an interruption until this minute. */
  pausedUntil?: number;
  aiInterrupts?: number;
}

export interface Uplink {
  id: string;
  name: string;
  capacityGbps: number;
  costPerDay: number;
  up: boolean;
  /** When the ISP fixes a cut on its own (null = not cut). */
  repairAt: number | null;
}

/** Ops projects: optional calm-time jobs with lasting bonuses (PRD §21.4). */
/** Cyber attacks (PRD §9, v0.7). */
export type AttackKind = 'flood' | 'phish' | 'worm';
export type Villain = 'kiddies' | 'phish';

export interface Attack {
  id: string;
  kind: AttackKind;
  villain: Villain;
  startedAt: number;
  expiresAt: number;
  /** Seed for the micro-game, and the worm's targets (null = an office machine, not a rack). */
  payload: { seed: number; rackIds: (string | null)[] };
}

export interface CyberState {
  attack: Attack | null;
  queue: { kind: AttackKind; villain: Villain }[];
  followUp: { at: number; kind: AttackKind; villain: Villain } | null;
  blocked: number;
  hits: number;
  perfect: number;
  history: { kind: AttackKind; score: number; mode: string; minute: number }[];
}

export type ProjectId = 'cableTidy' | 'labels' | 'firmware';

/** A walk-in request: a timed customer favour (PRD §21.4). */
export interface Walkin {
  id: string;
  customer: string;
  rackId: string;
  text: string;
  reward: number;
  deadline: number;
  status: 'open' | 'done' | 'expired';
  /** A cross-connect order needs a network engineer and pays more (ticket queue v1). */
  kind?: 'favor' | 'crossConnect';
}

export type ShiftGoalKind = 'sla' | 'noCritical' | 'fastFix';

export interface Shift {
  day: number;
  startMinute: number;
  endMinute: number;
  goal: ShiftGoalKind;
  goalLabel: string;
  bonus: number;
  /** For goals that can fail during the shift. */
  goalFailed: boolean;
  criticalsAtStart: number;
  incidentsAtStart: number;
  resolvedAtStart: number;
  cashAtStart: number;
  preventedAtStart?: number;
}

export interface ShiftReport {
  day: number;
  goalLabel: string;
  goalMet: boolean;
  bonus: number;
  stars: number;
  net: number;
  uptimePct: number;
  incidents: number;
  resolved: number;
  criticals: number;
  highlights: string[];
}

/** Short-lived visual effects emitted by the simulation (money pops). */
export interface Fx {
  id: number;
  kind: 'money' | 'miss' | 'bonus' | 'say';
  /** Speech bubbles: who says what. */
  techId?: string;
  text?: string;
  rackId: string | null;
  amount: number;
  minute: number;
}

export interface Order {
  part: PartId;
  qty: number;
  arriveAt: number;
}

export type LogKind = 'info' | 'alarm' | 'money' | 'tip' | 'story' | 'success' | 'fail';

export interface LogEntry {
  id: number;
  minute: number;
  kind: LogKind;
  text: string;
}

export interface DayReport {
  day: number;
  revenue: number;
  penalties: number;
  salaries: number;
  electricity: number;
  rent: number;
  network: number;
  net: number;
  slaMet: number;
  slaBreached: number;
}

export interface ChapterProgress {
  status: 'playing' | 'won' | 'lost';
  stars: number;
  firedEvents: string[];
  negativeCashDays: number;
  maxTechs: number;
  peakCash: number;
  startCash: number;
}

export interface GameState {
  version: number;
  seed: number;
  rng: RngState;
  minute: number;
  nextId: number;
  chapter: ChapterId;
  difficulty: DifficultyId;
  features: FeatureFlag[];
  grid: Grid;
  ambient: number; // °C of the building air without our coolers
  racks: Rack[];
  devices: Device[];
  coolers: Cooler[];
  uplinks: Uplink[];
  /** Gbps used right now (computed). */
  bandwidthUsed: number;
  coffeeLevel: number; // 0 = sad office coffee, 1+ = upgrades
  techs: Tech[];
  candidates: Candidate[];
  jobs: Job[];
  alarms: Alarm[];
  contracts: Contract[];
  inventory: Record<PartId, number>;
  orders: Order[];
  cash: number;
  reputation: number; // 0..5
  log: LogEntry[];
  logSeq: number;
  seenTips: string[];
  reports: DayReport[];
  progress: ChapterProgress;
  stats: {
    incidents: number; resolved: number; criticals: number; thermalShutdowns: number; peakTemp: number;
    walkinsDone?: number; reboots?: number;
    /** Game minutes during which at least one rack breathed hot exhaust (aisles). */
    airflowMinutes?: number;
    /** Successful player commands (the 'actions per minute' workload metric). */
    commands?: number;
    /** Problems caught early by idle specialists. */
    prevented?: number;
    autoDispatched?: number;
    /** Game minutes with no power at all (grid down, battery empty, generator off). */
    blackoutMin?: number;
    outages?: number;
    /** Planned changes that finished cleanly / went wrong (v1.3). */
    changeDone?: number;
    changeFailed?: number;
    rmaCredit?: number;
  };
  /** A site visit in progress: this state is the remote hall, the headquarters is frozen elsewhere. */
  visit?: { siteId: string; hqCash: number; startCash: number };
  /** Frontier floor: orbital cluster with no technicians (Sandbox only). */
  frontier?: { launchPerKg: number; startMin: number };
  /** The campus: other sites, finance and the board (Chapter 10). */
  campus?: Campus;
  /** Customer relationships (Chapter 9): the latest compliance audit. */
  audit?: Audit;
  /** Technicians on the night rota; the others are off duty from 22:00 to 06:00. */
  nightCrew?: string[];
  /** A page that woke the manager: handle it now or hold until morning. */
  pager?: Pager | null;
  /** The open major incident, with its commander and customer update. */
  incident?: Incident | null;
  incidentScores?: number[];
  /** Liquid loop and the AI technology ladder (Chapter 8). */
  loop?: Loop;
  aiTech?: AiTech;
  /** Tests: run AI interruptions even when other failures are off. */
  aiForce?: boolean;
  /** A synchronized power spike from a big training run starting. */
  spike?: { mult: number; until: number };
  /** Site power, cooling mode, water and efficiency (Chapter 7+). */
  site?: Site;
  /** A demand surge such as Black Friday. */
  surge?: { mult: number; until: number };
  /** Change management (v1.3): offered and scheduled planned work, and a freeze policy. */
  changes?: Change[];
  freeze?: boolean;
  /** Big equipment on order: arrives after a number of game days (queue days). */
  pendingInfra?: PendingInfra[];
  /** Supply shock: part deliveries are slower until this minute. */
  supplyShockUntil?: number;
  /** NOC level 0..3 (remote hands) and reboots in flight. */
  noc?: number;
  remoteReboots?: { deviceId: string; at: number }[];
  /** UPS, generator and the utility feed (Chapter 5). */
  backup?: Backup;
  /** The Shift Lead sends specialists to alarms automatically. */
  autoDispatch: boolean;
  cyber: CyberState;
  /** Extra traffic from a successful flood, until floodUntil. */
  floodUntil: number;
  floodStrength: number;
  /** Sandbox settings (Endless mode). */
  sandbox?: import('./sandbox').SandboxConfig;
  /** Sandbox: attacks arrive at random. */
  cyberRandom?: boolean;
  /** Sandbox: incident rate grows by this fraction per day. */
  rampPerDay?: number;
  /** Hours in a row in which every live contract met its SLA. */
  streak: { hours: number; best: number; hit: boolean };
  /** Cable audit protection lasts until this minute. */
  auditUntil: number;
  /** Set when this game is a Daily Challenge (e.g. '2026-11-20'). */
  dailyId?: string | null;
  dailyModifier?: string;
  /** Overrides the chapter's end (Daily Challenge = one shift). */
  endMinute?: number;
  /** Extra multipliers set by Daily Challenge modifiers. */
  incidentMult?: number;
  demandMult?: number;
  /** Outage tracking and post-mortems (PRD §21.8). */
  outages: Record<string, number>;
  postMortems: import('./postmortem').PostMortem[];
  pendingPostMortem: import('./postmortem').PostMortem | null;
  alarmHistory: { kind: AlarmKind; rackId: string | null; deviceId: string | null; minute: number }[];
  energyTodayKwh: number;
  /** Today's money so far: revenue and costs are credited every game hour (PRD §21.3). */
  today: DayReport;
  /** Revenue earned but not yet credited, by rack (for the hourly money pops). */
  pendingRevenue: Record<string, number>;
  fx: Fx[];
  fxSeq: number;
  shift: Shift | null;
  shiftReports: ShiftReport[];
  /** Set at the end of a shift; the UI shows the report card and clears it. */
  pendingShiftReport: ShiftReport | null;
  walkins: Walkin[];
  projects: ProjectId[];
  failuresEnabled: boolean;
  /** Set when something needs the player's attention (used by the UI for auto-pause). */
  attention: { severity: Severity; text: string; /** Attacks open their own pause-and-defend prompt, so they never auto-pause. */ kind?: 'attack' } | null;
}
