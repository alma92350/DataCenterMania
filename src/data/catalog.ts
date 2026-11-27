import type { Cooler, JobKind, PartId, ProjectId, ServerModelId, TechRole } from '../sim/types';

export interface ServerModel {
  id: ServerModelId;
  name: string;
  u: number;
  units: number; // compute units provided
  idleW: number;
  maxW: number;
}

export const SERVER_MODELS: Record<ServerModelId, ServerModel> = {
  server1u: { id: 'server1u', name: 'Pizza Box 1U', u: 1, units: 1, idleW: 120, maxW: 350 },
  server2u: { id: 'server2u', name: 'Workhorse 2U', u: 2, units: 2, idleW: 200, maxW: 600 },
};

export interface PartInfo {
  id: PartId;
  name: string;
  price: number;
  deliveryMin: number; // game minutes
  icon: string;
}

export const PARTS: Record<PartId, PartInfo> = {
  disk: { id: 'disk', name: 'Spare disk', price: 120, deliveryMin: 90, icon: '💽' },
  psu: { id: 'psu', name: 'Power supply', price: 180, deliveryMin: 120, icon: '🔌' },
  server1u: { id: 'server1u', name: 'Pizza Box 1U server', price: 900, deliveryMin: 120, icon: '🖥️' },
  server2u: { id: 'server2u', name: 'Workhorse 2U server', price: 1600, deliveryMin: 180, icon: '🗄️' },
  rack: { id: 'rack', name: '42U rack', price: 2000, deliveryMin: 240, icon: '🗃️' },
  portableAc: { id: 'portableAc', name: 'Portable AC (2 kW)', price: 600, deliveryMin: 60, icon: '❄️' },
  wallAc: { id: 'wallAc', name: 'Wall AC unit (8 kW)', price: 4000, deliveryMin: 240, icon: '🧊' },
  crac: { id: 'crac', name: 'CRAC unit (15 kW)', price: 9000, deliveryMin: 360, icon: '🏭' },
  filter: { id: 'filter', name: 'CRAC air filter', price: 90, deliveryMin: 90, icon: '🧻' },
  switch: { id: 'switch', name: 'Top-of-rack switch', price: 450, deliveryMin: 120, icon: '🔀' },
  coffee: { id: 'coffee', name: 'Coffee machine upgrade', price: 1500, deliveryMin: 60, icon: '☕' },
};

export const COOLERS: Record<Cooler['kind'], { capacityKw: number; powerW: number; radius: number; name: string }> = {
  officeAc: { capacityKw: 1.6, powerW: 0, radius: 8, name: 'Office AC' },
  portableAc: { capacityKw: 2, powerW: 700, radius: 4, name: 'Portable AC' },
  wallAc: { capacityKw: 8, powerW: 2500, radius: 7, name: 'Wall AC' },
  crac: { capacityKw: 15, powerW: 4500, radius: 9, name: 'CRAC unit' },
};

/** Hands-on work duration in game minutes (PRD §3.1 buckets). */
export const JOB_WORK_MIN: Record<JobKind, number> = {
  reboot: 5,
  resetBreaker: 10,
  swapDisk: 15,
  replacePsu: 15,
  install: 30,
  remove: 20,
  placeCooler: 30,
  buildRack: 180,
  rotateRack: 60,
  serviceCooler: 20,
  repairCooler: 90,
  replaceSwitch: 20,
  repairUplink: 90,
  project: 120,
  favor: 15,
  audit: 45,
  reimage: 45,
  startGenerator: 10,
  testGenerator: 60,
  replaceBattery: 40,
  transferAts: 15,
  refuel: 20,
  repairPdu: 40,
  dualCord: 25,
  crossConnect: 45,
  change: 60,
  resetMain: 20,
  repairOob: 30,
};

export const JOB_LABEL: Record<JobKind, string> = {
  reboot: 'Reboot server',
  resetBreaker: 'Reset breaker',
  swapDisk: 'Swap disk',
  replacePsu: 'Replace PSU',
  install: 'Install server',
  remove: 'Remove server',
  placeCooler: 'Set up cooling',
  buildRack: 'Build rack',
  rotateRack: 'Rotate rack',
  serviceCooler: 'Change filter',
  repairCooler: 'Repair cooler',
  replaceSwitch: 'Replace switch',
  repairUplink: 'Splice fiber',
  project: 'Ops project',
  favor: 'Customer favour',
  audit: 'Cable audit',
  reimage: 'Clean & re-image',
  startGenerator: 'Start generator',
  testGenerator: 'Test generator',
  replaceBattery: 'Replace UPS batteries',
  transferAts: 'Transfer to generator',
  refuel: 'Refuel generator',
  repairPdu: 'Repair power feed',
  dualCord: 'Dual-cord server',
  crossConnect: 'Patch cross-connect',
  change: 'Planned change',
  resetMain: 'Reset main breaker',
  repairOob: 'Repair management link',
};

/**
 * Which specialists may take a job (PRD §6.1). The manager can do anything,
 * but works slower outside basic hardware jobs.
 */
export const JOB_ROLES: Record<JobKind, TechRole[]> = {
  reboot: ['hw'], resetBreaker: ['hw', 'elec'], swapDisk: ['hw'], replacePsu: ['hw'], install: ['hw'], remove: ['hw'],
  buildRack: ['hw'], rotateRack: ['hw'], placeCooler: ['hw', 'hvac'],
  serviceCooler: ['hvac'], repairCooler: ['hvac'], replaceSwitch: ['net'], repairUplink: ['net'],
  project: ['hw', 'net'], favor: ['hw', 'hvac', 'net'], audit: ['net'], reimage: ['hw', 'net'],
  startGenerator: ['elec'], testGenerator: ['elec'], replaceBattery: ['elec'], transferAts: ['elec'], refuel: ['elec', 'hw'], repairPdu: ['elec'], dualCord: ['hw', 'elec'], crossConnect: ['net'], change: ['hw', 'hvac', 'elec'], resetMain: ['elec'], repairOob: ['net'],
};

export const ROLE_LABEL: Record<TechRole, string> = { manager: 'Manager', hw: 'HW tech', hvac: 'HVAC tech', net: 'Network engineer', lead: 'Shift Lead', elec: 'Electrician' };
/** Manager work-speed factor on specialist (non-hardware) jobs. */
export const MANAGER_SPECIALIST_RATE = 0.5;

export const RACK_CAPACITY_U = 42;
export const RACK_RENT_PER_DAY = 40;
export const ELECTRICITY_PER_KWH = 0.25;
/** Facility overhead factor applied to the electricity bill (simplified PUE). */
export const BASE_PUE = 1.8;

export const THERMAL = {
  coolTarget: 20, // °C target for well-cooled racks
  kPerKw: 9, // °C per kW of uncooled heat
  tau: 25, // game minutes time constant
  warn: 32,
  major: 38,
  shutdown: 45,
  restart: 35,
  failRef: 27, // failure rate doubles every +10°C above this
  derateFrom: 25, // coolers lose capacity above this ambient temperature...
  deratePerDeg: 0.06, // ...6% per °C
};

/** Hot/cold aisles: exhaust of a rack blowing into another rack's intake (PRD §4.3). */
export const AISLES = { reach: 2, baseDeg: 3, perKwDeg: 2.5, maxDeg: 15 } as const;

/** Cooler filters clog over time; dirty coolers lose capacity and eventually break. */
export const MAINTENANCE = { filterWearPerDay: 0.4, filterAlarmBelow: 0.4, minEfficiency: 0.5, breakPerDayAtZero: 2 } as const;

export const NETWORK = { switchFailPerDay: 0.03, uplinkCutPerDay: 0.04, ispRepairMin: 480, warnRatio: 0.9 } as const;

/** Second ISP uplink, bought from the Network tab. */
export const EXTRA_UPLINK = { name: 'SkyLink Fiber B (separate route)', capacityGbps: 15, setupCost: 3500, costPerDay: 220 } as const;

export const FATIGUE = {
  workPerMin: 0.11, walkPerMin: 0.06, restPerMin: 0.35, idlePerMin: 0.05,
  tiredAbove: 60, breakAt: 90, backToWorkBelow: 25, tiredWorkMult: 0.8, tiredMistakeMult: 2,
} as const;

export const MORALE = { base: 65, perCoffee: 12, fatiguePenalty: 0.4, driftPerMin: 0.02, quitBelow: 20, quitChance: 0.4 } as const;

/** Base failure probability per server per game day at reference temperature. */
export const FAILURE_PER_DAY = { disk: 0.12, psu: 0.05, hung: 0.08 } as const;

/** Onboarding grace: SLA starts when provisioned, or after this many game minutes. */
export const CONTRACT_GRACE_MIN = 720;

/** Alarm escalation delays in game minutes. */
export const ESCALATION_MIN = { warningToMajor: 120, majorToCritical: 45 } as const;

/** Ops projects (PRD §21.4): optional calm-time work with a lasting bonus for the chapter. */
export const PROJECTS: Record<ProjectId, { name: string; icon: string; cost: number; workMin: number; effect: string }> = {
  cableTidy: { name: 'Cable tidy-up', icon: '🧶', cost: 400, workMin: 120, effect: 'Halves botched jobs: no more pulling the wrong cable.' },
  labels: { name: 'Label everything', icon: '🏷️', cost: 300, workMin: 90, effect: 'Every job goes 15% faster.' },
  firmware: { name: 'Firmware campaign', icon: '💾', cost: 600, workMin: 120, effect: 'Servers hang 60% less often.' },
};

export const PROJECT_EFFECT = { cableTidyMistakeMult: 0.5, labelsWorkMult: 1.15, firmwareHungMult: 0.4 } as const;

/** Walk-in requests (PRD §21.4). */
export const WALKINS = { fromHour: 8, toHour: 20, meanGapMin: 40, deadlineMin: 60, maxOpen: 2, baseReward: 40, rewardPerChapter: 15 } as const;

/** Shifts (PRD §21.1). */
export const SHIFT = { startHour: 6, endHour: 22, fastFixMin: 30, baseBonus: 300, bonusPerChapter: 200, goodUptime: 99.5 } as const;

/** The Shift Lead (PRD §13): dispatches for you, for a daily salary. */
export const LEAD = { salaryPerDay: 170 } as const;

/** Preventive work by idle specialists (PRD §21.6). */
export const PROACTIVE = { everyMin: 30, filterBelow: 0.8 } as const;

/** A cable audit cuts switch failures and fiber trouble for a day. */
export const AUDIT = { riskMult: 0.4, durationMin: 1440, renewBeforeMin: 120 } as const;

/** Backup power (PRD §10, v0.8): UPS bridges the gap, the generator takes over, and must have been tested. */
export const BACKUP = {
  upsKwhPerUnit: 1.5, upsPrice: 3500, maxUps: 3, rechargeKwhPerMin: 0.05,
  batteryWearPerDay: 0.06, batteryWarnBelow: 0.6, batteryJobCost: 700, minHealthCapacity: 0.25,
  generatorPrice: 9000, genStartMin: 3, genTestCost: 150, genTestValidMin: 2 * 1440, untestedStartChance: 0.35,
  randomOutagePerDay: 0.12, outageMin: [45, 150],
  atsFailUntested: 0.15, atsFailServiced: 0.02, fuelFullMin: 1440, fuelLowMin: 180, refuelCost: 400, transferMin: 15,
} as const;

/** Network operations centre (PRD v2 F3): remote hands for soft failures. Each level includes the ones below. */
export const NOC = {
  rebootMin: 2,
  levels: [
    { price: 1500, perDay: 60, name: 'Remote reboot', blurb: 'Hung servers reboot from the alarm card in 2 minutes. Nobody walks to the rack.' },
    { price: 2500, perDay: 60, name: 'Remote diagnostics', blurb: 'Disk swaps take a third less time: the technician arrives knowing which disk it is.' },
    { price: 4000, perDay: 80, name: 'Remote firmware', blurb: 'Ops projects (labels, firmware, cable tidy) take half the time.' },
  ],
} as const;

/** Redundancy (PRD v2 F1): feeds fail rarely but hit a whole rack leg. */
export const REDUNDANCY = { pduFailPerDay: 0.05, repairMin: 40, dualCordMin: 25 } as const;

/** Ticket queue v1: cross-connect orders pay more than favours and need a network engineer. */
export const TICKETS = { crossConnectShare: 0.3, rewardMult: 3, deadlineMin: 120 } as const;

/** Change management (PRD v2 F2). Risk is the chance the change goes wrong when the work finishes. */
export interface ChangeDef {
  title: string;
  icon: string;
  roles: ('hw' | 'hvac' | 'elec')[];
  workMin: number;
  riskBase: number;
  benefit: string;
}

export const CHANGES: Record<'firmware' | 'pduMaintenance' | 'coolerSwap' | 'capacityInstall', ChangeDef> = {
  firmware: { title: 'Firmware upgrade', icon: '💾', roles: ['hw'], workMin: 60, riskBase: 0.2, benefit: 'Servers in this rack hang 60% less often.' },
  pduMaintenance: { title: 'PDU maintenance', icon: '🔌', roles: ['elec'], workMin: 90, riskBase: 0.3, benefit: 'Power feed failures on this rack become far rarer.' },
  coolerSwap: { title: 'Cooler overhaul', icon: '🧊', roles: ['hvac'], workMin: 75, riskBase: 0.15, benefit: 'The cooler is restored to full health.' },
  capacityInstall: { title: 'Vendor capacity drop', icon: '📦', roles: ['hw'], workMin: 45, riskBase: 0.12, benefit: 'A new server for your stock, ready to install.' },
};

export const CHANGE = {
  rollbackMin: 30, nightRiskMult: 0.6, rollbackRiskMult: 0.6, restedMult: 0.85, tiredMult: 1.3, tiredFatigue: 50,
  dualRackMult: 0.4, projectMult: 0.85, offerPerDay: 2, maxOpen: 3, expireDays: 2, freezeRepPenalty: 0.02, minRisk: 0.01, maxRisk: 0.95,
  fwHungMult: 0.4, hardenedFeedMult: 0.3,
} as const;

/** Long-lead equipment (PRD v2 addendum P2): ordered in game days ("queue days"), shown as an ETA. */
export const LEAD_TIME = {
  ups: { days: 2, name: 'UPS unit' },
  generator: { days: 3, name: 'Generator' },
  grid: { days: 2, name: 'Grid connection upgrade' },
  expediteShare: 0.5,
  expediteDays: 1,
} as const;

/** Supply shocks and returns (PRD v2 F12). */
export const SUPPLY = { shockMult: 3, rmaShare: 0.4 } as const;

/** Energy and water (PRD v2 F5, addendum P3). Game values, ordered like the real trade-offs, not exact. */
export const ENERGY = {
  copEvaporative: 4.0, copDry: 2.8, fanW: 400, lossShare: 0.06,
  economizerPrice: 5000, freeStartC: 20, freeSpanC: 10, freeMax: 0.8,
  dryHotC: 28, dryHotPenalty: 1.25, renewablePriceMult: 1.15,
  waterOnPerKwh: { evaporative: 1.8, dry: 0.05 }, waterOffPerKwh: { grid: 8, renewable: 1 },
  heatReusePrice: 6000, heatReuseEarnPerKwh: 0.5, heatReusePueCredit: 0.1,
  droughtDays: 2,
} as const;

/** Site power cap and the grid-connection queue (addendum P1). Display only: row scale x10 (a tile counts as a row of racks). */
export const SITE = { startW: 10000, stepW: 4000, stepPrice: 4000, maxSteps: 3, warnShare: 0.9, tripMin: 5, rowScale: 10, strandedBelowW: 150 } as const;
