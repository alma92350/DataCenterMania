import { esgOk, surgeFactor } from './site';
import { contractLabel } from './naming';
import { minuteOfDay, weekdayOf } from '../core/time';
import { NETWORK } from '../data/catalog';
import { clearAlarms, raiseAlarm } from './alarms';
import { bandwidthCapacity } from './network';
import { addFx, addLog } from './state';
import { trackOutage } from './postmortem';
import { activeContracts, contractDevices, deviceUp, unitsOf } from './selectors';
import type { DemandProfileId, GameState } from './types';

const bump = (h: number, center: number, width: number) => Math.exp(-((h - center) ** 2) / (2 * width * width));

/** Fraction (0,1] of a contract's units that is needed at a given minute. */
export function demandFactor(profile: DemandProfileId, minute: number): number {
  const h = minuteOfDay(minute) / 60;
  const weekend = weekdayOf(minute) >= 5;
  let v: number;
  switch (profile) {
    case 'flat':
      v = 0.85;
      break;
    case 'office':
      v = weekend ? 0.25 : 0.3 + 0.62 * Math.min(1, bump(h, 13, 3.2) * 1.6);
      break;
    case 'lunchDinner':
      v = 0.3 + 0.7 * Math.max(bump(h, 12.25, 0.9), bump(h, 19.25, 1.1)) * (weekend ? 1 : 0.95);
      break;
    case 'evening':
      v = 0.3 + 0.7 * bump(h, 20.5, 2.2);
      break;
  }
  return Math.min(1, Math.max(0.05, v));
}

const IDLE_LOAD = 0.05;

/** A successful flood multiplies everyone's traffic until it ends (v0.7). */
export function floodFactor(s: GameState): number {
  return s.minute < s.floodUntil ? 1 + s.floodStrength : 1;
}

/** Spreads each contract's demand over its live servers and books SLA minutes. */
export function updateDemand(s: GameState, dt: number): void {
  for (const d of s.devices) d.load = IDLE_LOAD;
  const bandwidthOk = updateBandwidth(s);
  for (const c of activeContracts(s)) {
    const needed = c.units * Math.min(1, demandFactor(c.profile, s.minute) * (s.demandMult ?? 1) * surgeFactor(s)) * floodFactor(s);
    const live = contractDevices(s, c.id).filter((d) => deviceUp(s, d));
    const capacity = live.reduce((sum, d) => sum + unitsOf(d), 0);
    if (c.liveFrom === null) {
      const provisioned = capacity >= c.units;
      if (!provisioned && s.minute < (c.graceUntil ?? 0)) continue;
      c.liveFrom = s.minute;
      if (provisioned) {
        s.cash += c.revenuePerDay;
        addLog(s, 'money', `Setup fee from ${contractLabel(c)}: +$${c.revenuePerDay}.`);
      }
      addLog(s, provisioned ? 'success' : 'fail', provisioned
        ? `${contractLabel(c)} is live! SLA measurement starts now.`
        : `${contractLabel(c)}: setup time is over. SLA measurement starts now, ready or not!`);
    }
    const ok = capacity + 1e-9 >= needed && (bandwidthOk || c.bandwidthPerUnit === 0) && esgOk(s, c.pueMax) && !((c.pausedUntil ?? 0) > s.minute);
    const load = capacity > 0 ? Math.min(1, needed / capacity) : 0;
    for (const d of live) d.load = Math.max(IDLE_LOAD, load);
    c.minutesToday += dt;
    trackOutage(s, c, ok);
    if (!ok) s.streak.hit = true;
    if (ok) c.okMinutesToday += dt;
    else {
      const rackId = contractDevices(s, c.id)[0]?.rackId ?? null;
      if (!s.fx.some((f) => f.kind === 'miss' && f.rackId === rackId && s.minute - f.minute < 30)) addFx(s, 'miss', rackId, 0);
    }
  }
}

/** Total traffic of live contracts vs. uplink capacity. Returns false when traffic exceeds capacity. */
export function updateBandwidth(s: GameState): boolean {
  let used = 0;
  for (const c of activeContracts(s)) {
    if (c.liveFrom === null) continue;
    used += c.units * demandFactor(c.profile, s.minute) * c.bandwidthPerUnit * floodFactor(s);
  }
  s.bandwidthUsed = used;
  if (!s.features.includes('network')) return true;
  const cap = bandwidthCapacity(s);
  const ok = used <= cap + 1e-9;
  const severity = !ok ? 3 : used > cap * NETWORK.warnRatio ? 1 : 0;
  const open = s.alarms.find((a) => a.kind === 'bandwidth');
  if (open && open.severity !== severity) clearAlarms(s, (a) => a.kind === 'bandwidth');
  if (severity > 0) raiseAlarm(s, 'bandwidth', null, null, severity as 1 | 3, null);
  return ok;
}
