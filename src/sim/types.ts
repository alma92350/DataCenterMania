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

export type DifficultyId = 'intern' | 'sysadmin' | 'senior';
export type ChapterId = 'ch0' | 'ch1' | 'ch2';
export type FeatureFlag = 'hire' | 'contracts' | 'power' | 'buildRack' | 'coolers' | 'shop' | 'remote';

export type PartId = 'disk' | 'psu' | 'server1u' | 'server2u' | 'rack' | 'portableAc' | 'wallAc';
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

export interface Rack {
  id: string;
  pos: Vec;
  capacityU: number;
  powerBudgetW: number;
  tripped: boolean;
  temp: number;
  loadW: number; // computed
}

export interface Cooler {
  id: string;
  kind: 'officeAc' | 'portableAc' | 'wallAc';
  pos: Vec;
  capacityKw: number;
  on: boolean;
  powerW: number;
}

export type TechRole = 'manager' | 'hw';

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
}

export interface Candidate {
  id: string;
  name: string;
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
  | 'placeCooler';

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
  botched?: boolean;
}

export type AlarmKind = 'disk' | 'dataloss' | 'psu' | 'hung' | 'overheat' | 'breaker' | 'powerHigh';

export interface Alarm {
  id: string;
  kind: AlarmKind;
  severity: Severity;
  rackId: string;
  deviceId: string | null;
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
