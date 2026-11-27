import { BASE_PUE, ELECTRICITY_PER_KWH, RACK_RENT_PER_DAY, SERVER_MODELS } from '../data/catalog';
import { devicePowerW } from './power';
import type { Contract, Device, GameState, Rack, Tech } from './types';

export const rackById = (s: GameState, id: string | null): Rack | undefined => s.racks.find((r) => r.id === id);
export const deviceById = (s: GameState, id: string | null): Device | undefined => s.devices.find((d) => d.id === id);
export const techById = (s: GameState, id: string | null): Tech | undefined => s.techs.find((t) => t.id === id);
export const contractById = (s: GameState, id: string | null): Contract | undefined => s.contracts.find((c) => c.id === id);

export const devicesInRack = (s: GameState, rackId: string): Device[] => s.devices.filter((d) => d.rackId === rackId);

const BLOCKING_FAULTS = new Set(['hung', 'dataloss', 'malware']);

export const feedOk = (r: Rack | undefined, feed: 'A' | 'B'): boolean => (feed === 'A' ? r?.pduA : r?.pduB) !== 'failed';

/** Leg A: feed A through power supply 1. Leg B (dual-corded only): feed B through power supply 2. A dead PSU takes out leg A. */
export function legsUp(s: GameState, d: Device): { a: boolean; b: boolean } {
  const rack = rackById(s, d.rackId);
  return { a: feedOk(rack, 'A') && !d.faults.includes('psu'), b: (d.psus ?? 1) === 2 && feedOk(rack, 'B') };
}

/** A dual-corded server that has lost one leg is still up, but one failure away from an outage. */
export function onOneLeg(s: GameState, d: Device): boolean {
  if ((d.psus ?? 1) !== 2) return false;
  const l = legsUp(s, d);
  return l.a !== l.b;
}

/** Is the device serving traffic right now? */
export function deviceUp(s: GameState, d: Device): boolean {
  if (!d.poweredOn || d.thermalShutdown || s.backup?.source === 'none' || s.site?.mainTripped) return false;
  if (d.faults.some((f) => BLOCKING_FAULTS.has(f))) return false;
  const legs = legsUp(s, d);
  if (!legs.a && !legs.b) return false;
  const rack = rackById(s, d.rackId);
  return !!rack && !rack.tripped && !rack.switchFailed && !rack.maintenance;
}

export const unitsOf = (d: Device): number => SERVER_MODELS[d.model].units;

/** Slots [slot, slot+u) are inside the rack and not used by another device. */
export function slotFree(s: GameState, rack: Rack, slot: number, u: number, ignoreDeviceId?: string): boolean {
  if (slot < 0 || slot + u > rack.capacityU) return false;
  const pendingInstalls = s.jobs.filter((j) => j.kind === 'install' && j.rackId === rack.id && j.stage !== 'done');
  const occupied: [number, number][] = [
    ...devicesInRack(s, rack.id).filter((d) => d.id !== ignoreDeviceId).map((d) => [d.slot, d.slot + SERVER_MODELS[d.model].u] as [number, number]),
    ...pendingInstalls.map((j) => [j.slot ?? 0, (j.slot ?? 0) + SERVER_MODELS[j.model ?? 'server1u'].u] as [number, number]),
  ];
  return occupied.every(([a, b]) => slot + u <= a || slot >= b);
}

export function firstFreeSlot(s: GameState, rack: Rack, u: number): number | null {
  for (let slot = 0; slot + u <= rack.capacityU; slot++) if (slotFree(s, rack, slot, u)) return slot;
  return null;
}

export const activeContracts = (s: GameState): Contract[] => s.contracts.filter((c) => c.status === 'active');
export const offeredContracts = (s: GameState): Contract[] => s.contracts.filter((c) => c.status === 'offered');

export const contractDevices = (s: GameState, contractId: string): Device[] => s.devices.filter((d) => d.contractId === contractId);

export function contractCapacity(s: GameState, contractId: string): number {
  return contractDevices(s, contractId).filter((d) => deviceUp(s, d)).reduce((sum, d) => sum + unitsOf(d), 0);
}

export function contractAssignedUnits(s: GameState, contractId: string): number {
  return contractDevices(s, contractId).reduce((sum, d) => sum + unitsOf(d), 0);
}

/** Devices assigned to an active contract. */
export function servingDeviceCount(s: GameState): number {
  const active = new Set(activeContracts(s).map((c) => c.id));
  return s.devices.filter((d) => d.contractId !== null && active.has(d.contractId)).length;
}

/** Weighted SLA uptime across all contracts since the chapter started (100 when nothing measured). */
export function overallUptimePct(s: GameState): number {
  let total = 0;
  let ok = 0;
  for (const c of s.contracts) {
    total += c.totalMinutes + c.minutesToday;
    ok += c.totalOkMinutes + c.okMinutesToday;
  }
  return total === 0 ? 100 : (ok / total) * 100;
}

export function contractUptimeTodayPct(c: Contract): number {
  return c.minutesToday === 0 ? 100 : (c.okMinutesToday / c.minutesToday) * 100;
}

export const isIdle = (s: GameState, t: Tech): boolean => t.jobId === null && !s.jobs.some((j) => j.techId === t.id && j.stage !== 'done');

export function techQueueLength(s: GameState, t: Tech): number {
  return s.jobs.filter((j) => j.techId === t.id && j.stage !== 'done').length;
}

export const blockedTiles = (s: GameState): Set<number> =>
  new Set([...s.racks.map((r) => r.pos), ...s.coolers.map((c) => c.pos)].map((p) => p.y * s.grid.w + p.x));

export const hasFeature = (s: GameState, f: GameState['features'][number]): boolean => s.features.includes(f);

/** Revenue minus the power its servers draw and their share of rack rent, per day (PRD §21.3). */
export function contractMarginPerDay(s: GameState, c: Contract): number {
  let cost = 0;
  for (const d of contractDevices(s, c.id)) {
    cost += (devicePowerW(s, d) / 1000) * 24 * ELECTRICITY_PER_KWH * BASE_PUE;
    cost += RACK_RENT_PER_DAY / Math.max(1, devicesInRack(s, d.rackId).length);
  }
  return Math.round(c.revenuePerDay - cost);
}
