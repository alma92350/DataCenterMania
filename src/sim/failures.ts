import { chance } from '../core/rng';
import { CHANGE, FAILURE_PER_DAY, PROJECT_EFFECT, THERMAL } from '../data/catalog';
import { DIFFICULTIES } from '../data/difficulty';
import { escalationDelay, raiseAlarm } from './alarms';
import { directorMultiplier } from './director';
import { deviceUp, rackById } from './selectors';
import type { Device, FaultKind, GameState, Severity } from './types';

/** Every +10°C above the reference doubles the failure rate (PRD §4.3). */
export function failureMultiplier(temp: number): number {
  return temp <= THERMAL.failRef ? 1 : 2 ** ((temp - THERMAL.failRef) / 10);
}

const FAULT_SEVERITY: Record<FaultKind, Severity> = { disk: 1, psu: 2, hung: 2, dataloss: 3, malware: 2 };

export function hungRateMultiplier(s: GameState): number {
  return s.projects.includes('firmware') ? PROJECT_EFFECT.firmwareHungMult : 1;
}

export function applyFault(s: GameState, d: Device, fault: FaultKind): void {
  if (d.faults.includes(fault) || (fault === 'disk' && d.faults.includes('dataloss'))) return;
  d.faults.push(fault);
  const severity = fault === 'psu' && (d.psus ?? 1) === 2 ? 1 : FAULT_SEVERITY[fault];
  raiseAlarm(s, fault, d.rackId, d.id, severity, fault === 'dataloss' ? null : escalationDelay(s, severity));
}

export function rollFailures(s: GameState, dt: number): void {
  if (!s.failuresEnabled) return;
  const rate = DIFFICULTIES[s.difficulty].incidentRate * directorMultiplier(s) * (s.incidentMult ?? 1);
  for (const d of s.devices) {
    if (!deviceUp(s, d) && !d.faults.includes('disk')) continue;
    const rack = rackById(s, d.rackId);
    const mult = rate * failureMultiplier(rack?.temp ?? 20) * (0.6 + d.load * 0.8) * (dt / 1440);
    for (const fault of ['disk', 'psu', 'hung'] as const) {
      if (d.faults.includes(fault) || (fault === 'disk' && d.faults.includes('dataloss'))) continue;
      const extra = fault === 'hung' ? hungRateMultiplier(s) * (rack?.fw ? CHANGE.fwHungMult : 1) : 1;
      if (chance(s.rng, FAILURE_PER_DAY[fault] * mult * extra)) {
        applyFault(s, d, fault);
        break;
      }
    }
  }
}
