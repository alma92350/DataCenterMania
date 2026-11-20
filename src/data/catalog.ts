import type { Cooler, JobKind, PartId, ServerModelId } from '../sim/types';

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
};

export const COOLERS: Record<Cooler['kind'], { capacityKw: number; powerW: number; radius: number; name: string }> = {
  officeAc: { capacityKw: 1.6, powerW: 0, radius: 8, name: 'Office AC' },
  portableAc: { capacityKw: 2, powerW: 700, radius: 4, name: 'Portable AC' },
  wallAc: { capacityKw: 8, powerW: 2500, radius: 7, name: 'Wall AC' },
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
};

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

/** Base failure probability per server per game day at reference temperature. */
export const FAILURE_PER_DAY = { disk: 0.12, psu: 0.05, hung: 0.08 } as const;

/** Onboarding grace: SLA starts when provisioned, or after this many game minutes. */
export const CONTRACT_GRACE_MIN = 720;

/** Alarm escalation delays in game minutes. */
export const ESCALATION_MIN = { warningToMajor: 120, majorToCritical: 45 } as const;
