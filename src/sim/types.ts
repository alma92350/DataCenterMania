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
export type ChapterId = 'ch0' | 'ch1' | 'ch2' | 'ch3';
export type FeatureFlag =
  | 'hire' | 'contracts' | 'power' | 'buildRack' | 'coolers' | 'shop' | 'remote'
  | 'aisles' | 'network' | 'roles' | 'fatigue' | 'maintenance';

export type PartId =
  | 'disk' | 'psu' | 'server1u' | 'server2u' | 'rack' | 'portableAc' | 'wallAc'
  | 'crac' | 'filter' | 'switch' | 'coffee';
export type ServerModelId = 'server1u' | 'server2u';

export type FaultKind = 'disk' | 'dataloss' | 'psu' | 'hung';

export interface Device {
  id: string;
  model: ServerModelId;
  rackId: string;
  slot: number; // lowest U position (0-based from bottom)
  faults: FaultKind[];
  poweredOn: boolean;
  thermalShutdown: boolean;
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

export type TechRole = 'manager' | 'hw' | 'hvac' | 'net';

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
  | 'repairUplink';

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
  botched?: boolean;
}

export type AlarmKind =
  | 'disk' | 'dataloss' | 'psu' | 'hung' | 'overheat' | 'breaker' | 'powerHigh'
  | 'filter' | 'coolerDown' | 'switch' | 'uplink' | 'bandwidth';

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
  stats: { incidents: number; resolved: number; criticals: number; thermalShutdowns: number };
  energyTodayKwh: number;
  failuresEnabled: boolean;
  /** Set when something needs the player's attention (used by the UI for auto-pause). */
  attention: { severity: Severity; text: string } | null;
}
