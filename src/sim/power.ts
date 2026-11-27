import { SERVER_MODELS } from '../data/catalog';
import { clearAlarms, raiseAlarm } from './alarms';
import { addLog, showTip } from './state';
import { facilityW } from './site';
import { devicesInRack, hasFeature, legsUp, rackById } from './selectors';
import type { Device, GameState } from './types';

export function devicePowerW(s: GameState, d: Device): number {
  const rack = rackById(s, d.rackId);
  if (!d.poweredOn || d.thermalShutdown || !rack || rack.tripped || rack.maintenance || s.backup?.source === 'none' || s.site?.mainTripped) return 0;
  const legs = legsUp(s, d);
  if (!legs.a && !legs.b) return 0;
  const m = SERVER_MODELS[d.model];
  if (d.faults.includes('hung')) return m.idleW;
  return m.idleW + (m.maxW - m.idleW) * d.load;
}

export function updatePower(s: GameState): void {
  for (const rack of s.racks) {
    const load = devicesInRack(s, rack.id).reduce((w, d) => w + devicePowerW(s, d), 0);
    rack.loadW = load;
    if (rack.tripped) continue;
    if (load > rack.powerBudgetW) {
      rack.tripped = true;
      rack.loadW = 0;
      clearAlarms(s, (a) => a.kind === 'powerHigh' && a.rackId === rack.id);
      raiseAlarm(s, 'breaker', rack.id, null, 3, null);
      addLog(s, 'fail', `Rack ${s.racks.indexOf(rack) + 1} drew ${Math.round(load)} W of ${rack.powerBudgetW} W. Breaker tripped!`);
      showTip(s, 'power');
      continue;
    }
    if (hasFeature(s, 'power') && load > rack.powerBudgetW * 0.9) {
      raiseAlarm(s, 'powerHigh', rack.id, null, 1, null);
    } else {
      clearAlarms(s, (a) => a.kind === 'powerHigh' && a.rackId === rack.id);
    }
  }
}

/** Total facility IT + cooling power in watts. */
export function facilityPowerW(s: GameState): number {
  if (s.site) return facilityW(s);
  const it = s.racks.reduce((w, r) => w + r.loadW, 0);
  const cooling = s.coolers.filter((c) => c.on).reduce((w, c) => w + c.powerW, 0);
  return it + cooling;
}
