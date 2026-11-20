import { COOLERS, THERMAL } from '../data/catalog';
import { clearAlarms, raiseAlarm } from './alarms';
import { addLog, showTip } from './state';
import { devicesInRack } from './selectors';
import type { GameState, Rack } from './types';

const dist = (a: Rack['pos'], b: Rack['pos']) => Math.hypot(a.x - b.x, a.y - b.y);

/** Coolers lose capacity in hot weather. */
export function coolerCapacityKw(s: GameState, nominalKw: number): number {
  return nominalKw * Math.max(0.3, 1 - Math.max(0, s.ambient - THERMAL.derateFrom) * THERMAL.deratePerDeg);
}

/** Cooling (kW) each rack receives, plus whether any cooler reaches it. */
export function coolingByRack(s: GameState): Map<string, { kw: number; reached: boolean }> {
  const out = new Map(s.racks.map((r) => [r.id, { kw: 0, reached: false }]));
  for (const c of s.coolers) {
    if (!c.on) continue;
    const radius = COOLERS[c.kind].radius;
    const inRange = s.racks.filter((r) => dist(r.pos, c.pos) <= radius);
    const weights = inRange.map((r) => (1 / (1 + dist(r.pos, c.pos))) * (r.loadW / 1000));
    const total = weights.reduce((a, b) => a + b, 0);
    inRange.forEach((r, i) => {
      const entry = out.get(r.id)!;
      entry.reached = true;
      if (total > 0) {
        const efficiency = 1 - (dist(r.pos, c.pos) / (radius + 1)) * 0.4;
        entry.kw += coolerCapacityKw(s, c.capacityKw) * (weights[i]! / total) * efficiency;
      }
    });
  }
  return out;
}

export function rackTargetTemp(s: GameState, rack: Rack, cooling: { kw: number; reached: boolean }): number {
  const heatKw = rack.loadW / 1000;
  const excess = Math.max(0, heatKw - cooling.kw);
  const base = cooling.reached ? Math.min(THERMAL.coolTarget, s.ambient) : s.ambient;
  return base + THERMAL.kPerKw * excess;
}

export function updateThermal(s: GameState, dt: number): void {
  const cooling = coolingByRack(s);
  const alpha = 1 - Math.exp(-dt / THERMAL.tau);
  for (const rack of s.racks) {
    const target = rackTargetTemp(s, rack, cooling.get(rack.id)!);
    rack.temp += (target - rack.temp) * alpha;
    const devices = devicesInRack(s, rack.id);
    const rackNo = s.racks.indexOf(rack) + 1;

    if (rack.temp >= THERMAL.shutdown && devices.some((d) => !d.thermalShutdown && d.poweredOn)) {
      for (const d of devices) d.thermalShutdown = true;
      s.stats.thermalShutdowns++;
      addLog(s, 'fail', `Rack ${rackNo} hit ${rack.temp.toFixed(0)}°C. Servers shut down to protect themselves!`);
    } else if (rack.temp < THERMAL.restart && devices.some((d) => d.thermalShutdown)) {
      for (const d of devices) d.thermalShutdown = false;
      addLog(s, 'success', `Rack ${rackNo} cooled down. Servers are booting again.`);
    }

    const shutdown = devices.some((d) => d.thermalShutdown);
    if (shutdown || rack.temp >= THERMAL.shutdown) raiseAlarm(s, 'overheat', rack.id, null, 3, null);
    else if (rack.temp >= THERMAL.major) raiseAlarm(s, 'overheat', rack.id, null, 2, null);
    else if (rack.temp >= THERMAL.warn) {
      raiseAlarm(s, 'overheat', rack.id, null, 1, null);
      showTip(s, 'heat');
    } else if (rack.temp < THERMAL.warn - 1) clearAlarms(s, (a) => a.kind === 'overheat' && a.rackId === rack.id);
  }
}
