import { chance } from '../core/rng';
import { NETWORK } from '../data/catalog';
import { DIFFICULTIES } from '../data/difficulty';
import { clearAlarms, escalationDelay, raiseAlarm } from './alarms';
import { addLog, showTip } from './state';
import type { GameState, Rack, Uplink } from './types';

export function bandwidthCapacity(s: GameState): number {
  return s.uplinks.filter((u) => u.up).reduce((sum, u) => sum + u.capacityGbps, 0);
}

export function failSwitch(s: GameState, rack: Rack): void {
  if (rack.switchFailed) return;
  rack.switchFailed = true;
  raiseAlarm(s, 'switch', rack.id, null, 2, escalationDelay(s, 2));
  showTip(s, 'switchDown');
}

export function cutUplink(s: GameState, u: Uplink): void {
  if (!u.up) return;
  u.up = false;
  u.repairAt = s.minute + NETWORK.ispRepairMin;
  raiseAlarm(s, 'uplink', null, null, 3, null, { uplinkId: u.id });
  showTip(s, 'uplinkCut');
}

export function restoreUplink(s: GameState, u: Uplink, byIsp: boolean): void {
  u.up = true;
  u.repairAt = null;
  clearAlarms(s, (a) => a.kind === 'uplink' && a.uplinkId === u.id);
  addLog(s, 'success', `${u.name} is back online${byIsp ? ' (fixed by the ISP)' : ''}.`);
}

/** ISP repairs, plus random switch failures and fiber cuts. */
export function updateNetwork(s: GameState, dt = 1): void {
  if (!s.features.includes('network')) return;
  for (const u of s.uplinks) if (!u.up && u.repairAt !== null && s.minute >= u.repairAt) restoreUplink(s, u, true);
  if (!s.failuresEnabled) return;
  const rate = DIFFICULTIES[s.difficulty].incidentRate * (dt / 1440);
  for (const r of s.racks) {
    if (!r.switchFailed && s.devices.some((d) => d.rackId === r.id) && chance(s.rng, NETWORK.switchFailPerDay * rate)) failSwitch(s, r);
  }
  for (const u of s.uplinks) if (u.up && chance(s.rng, NETWORK.uplinkCutPerDay * rate)) cutUplink(s, u);
}
