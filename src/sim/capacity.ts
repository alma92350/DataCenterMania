import { SERVER_MODELS, SITE } from '../data/catalog';
import { bandwidthCapacity } from './network';
import { coolerKw, facilityW, itPowerW, pueNow } from './site';
import { contractAssignedUnits } from './selectors';
import type { Contract, GameState } from './types';

export type ResourceKey = 'space' | 'power' | 'cooling' | 'network';

export interface Resource {
  key: ResourceKey;
  label: string;
  /** Watts for power, kW for cooling, U for space, Gbps for network. */
  used: number;
  cap: number;
  pct: number;
}

export interface CapacityReport {
  resources: Resource[];
  /** The resource that will run out first (highest share used). */
  limiting: ResourceKey;
  /** Free rack units that cannot be used because the rack has no power headroom left. */
  strandedU: number;
}

/** Display scale: from Chapter 7 a tile stands for a row of racks (PRD v2 addendum §5.1). Display only. */
export const powerScale = (s: GameState): number => (s.site ? SITE.rowScale : 1);

/** Watts to a readable string at a scale: W, kW, MW. */
export function formatPower(watts: number, scale = 1): string {
  const w = watts * scale;
  if (w >= 1_000_000) return `${(w / 1_000_000).toFixed(1)} MW`;
  if (w >= 1000) return `${(w / 1000).toFixed(w >= 100_000 ? 0 : 1)} kW`;
  return `${Math.round(w)} W`;
}

export function capacityReport(s: GameState): CapacityReport {
  const usedU = s.devices.reduce((n, d) => n + SERVER_MODELS[d.model].u, 0);
  const capU = s.racks.reduce((n, r) => n + r.capacityU, 0);
  const powerCap = s.site ? s.site.gridCapW : s.racks.reduce((n, r) => n + r.powerBudgetW, 0);
  const powerUsed = s.site ? facilityW(s) : itPowerW(s);
  const coolCap = coolerKw(s);
  const heatKw = itPowerW(s) / 1000;
  const netCap = bandwidthCapacity(s);
  const mk = (key: ResourceKey, label: string, used: number, cap: number): Resource => ({ key, label, used, cap, pct: cap > 0 ? Math.min(999, (used / cap) * 100) : 100 });
  const resources = [
    mk('space', 'Space', usedU, capU),
    mk('power', 'Power', powerUsed, powerCap),
    mk('cooling', 'Cooling', heatKw, coolCap),
    mk('network', 'Network', s.bandwidthUsed, netCap),
  ];
  const limiting = [...resources].sort((a, b) => b.pct - a.pct)[0]!.key;
  let strandedU = 0;
  for (const r of s.racks) {
    const used = s.devices.filter((d) => d.rackId === r.id).reduce((n, d) => n + SERVER_MODELS[d.model].u, 0);
    const free = r.capacityU - used;
    if (free > 0 && r.powerBudgetW - r.loadW < SITE.strandedBelowW) strandedU += free;
  }
  return { resources, limiting, strandedU };
}

export interface FitPreview {
  ok: boolean;
  needUnits: number;
  needW: number;
  needU: number;
  needGbps: number;
  /** Resources that this contract would exhaust. */
  limits: ResourceKey[];
}

const AVG_UNIT_W = (() => {
  const m = SERVER_MODELS.server1u;
  return m.idleW + (m.maxW - m.idleW) * 0.5;
})();

/** Will this contract fit? Estimates the extra servers' power, space and bandwidth against what is left. */
export function fitPreview(s: GameState, c: Contract): FitPreview {
  const needUnits = Math.max(0, c.units - contractAssignedUnits(s, c.id));
  const heatFactor = s.site ? pueNow(s) : 1;
  const needW = Math.round(needUnits * AVG_UNIT_W * heatFactor);
  const needU = needUnits; // 1U servers
  const needGbps = Math.round(needUnits * c.bandwidthPerUnit * 10) / 10;
  const rep = capacityReport(s);
  const by = Object.fromEntries(rep.resources.map((r) => [r.key, r])) as Record<ResourceKey, Resource>;
  const limits: ResourceKey[] = [];
  if (by.power.used + needW > by.power.cap) limits.push('power');
  if (by.space.used + needU > by.space.cap) limits.push('space');
  if (by.network.cap > 0 && needGbps > 0 && by.network.used + needGbps > by.network.cap) limits.push('network');
  if (by.cooling.used + (needUnits * AVG_UNIT_W) / 1000 > by.cooling.cap) limits.push('cooling');
  return { ok: limits.length === 0, needUnits, needW, needU, needGbps, limits };
}
