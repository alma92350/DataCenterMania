import { AI } from '../data/catalog';
import { liquidTarget } from './liquid';
import { AISLES, COOLERS, MAINTENANCE, THERMAL } from '../data/catalog';
import { clearAlarms, raiseAlarm } from './alarms';
import { addLog, showTip } from './state';
import { devicesInRack } from './selectors';
import type { Cooler, GameState, Rack } from './types';

const dist = (a: Rack['pos'], b: Rack['pos']) => Math.hypot(a.x - b.x, a.y - b.y);

/** Coolers lose capacity in hot weather. */
export function coolerCapacityKw(s: GameState, nominalKw: number): number {
  return nominalKw * Math.max(0.3, 1 - Math.max(0, s.ambient - THERMAL.derateFrom) * THERMAL.deratePerDeg);
}

/** Dirty filters cut capacity; broken or switched-off coolers give nothing. */
export function coolerEffectiveKw(s: GameState, c: Cooler): number {
  if (!c.on || c.broken) return 0;
  const condition = MAINTENANCE.minEfficiency + (1 - MAINTENANCE.minEfficiency) * c.health;
  return coolerCapacityKw(s, c.capacityKw) * condition;
}

const frontDir = (r: Rack) => (r.facing === 'S' ? 1 : -1);

/**
 * Hot/cold aisles (PRD §4.2): a rack whose intake faces the back of another (heat-producing) rack
 * within reach breathes its exhaust. Rows should face front-to-front and back-to-back.
 */
export function computeRecirculation(s: GameState): Map<string, number> {
  const out = new Map<string, number>(s.racks.map((r) => [r.id, 0]));
  if (!s.features.includes('aisles')) return out;
  for (const a of s.racks) {
    const d = frontDir(a);
    let deg = 0;
    for (let k = 1; k <= AISLES.reach; k++) {
      const b = s.racks.find((r) => r.pos.x === a.pos.x && r.pos.y === a.pos.y + d * k);
      if (!b) continue;
      // b's back points at a when both face the same way
      if (b.facing === a.facing && b.loadW > 0) deg += AISLES.baseDeg + AISLES.perKwDeg * (b.loadW / 1000);
      break; // the nearest rack blocks anything behind it
    }
    out.set(a.id, Math.min(AISLES.maxDeg, deg));
  }
  return out;
}

/** Cooling (kW) each rack receives, plus whether any cooler reaches it. */
export function coolingByRack(s: GameState): Map<string, { kw: number; reached: boolean }> {
  const out = new Map(s.racks.map((r) => [r.id, { kw: 0, reached: false }]));
  for (const c of s.coolers) {
    if (!c.on || c.broken) continue;
    const radius = COOLERS[c.kind].radius;
    const inRange = s.racks.filter((r) => dist(r.pos, c.pos) <= radius);
    const weights = inRange.map((r) => (1 / (1 + dist(r.pos, c.pos))) * (r.loadW / 1000));
    const total = weights.reduce((a, b) => a + b, 0);
    inRange.forEach((r, i) => {
      const entry = out.get(r.id)!;
      entry.reached = true;
      if (total > 0) {
        const efficiency = 1 - (dist(r.pos, c.pos) / (radius + 1)) * 0.4;
        entry.kw += coolerEffectiveKw(s, c) * (weights[i]! / total) * efficiency;
      }
    });
  }
  return out;
}

export function rackTargetTemp(s: GameState, rack: Rack, cooling: { kw: number; reached: boolean }): number {
  const heatKw = rack.loadW / 1000;
  const excess = Math.max(0, heatKw - cooling.kw);
  const base = cooling.reached ? Math.min(THERMAL.coolTarget, s.ambient) : s.ambient;
  return base + THERMAL.kPerKw * excess + rack.recirculation;
}

export function updateThermal(s: GameState, dt: number): void {
  const cooling = coolingByRack(s);
  const recirculation = computeRecirculation(s);
  if ([...recirculation.values()].some((v) => v > 0)) s.stats.airflowMinutes = (s.stats.airflowMinutes ?? 0) + dt;
  const alpha = 1 - Math.exp(-dt / THERMAL.tau);
  for (const rack of s.racks) {
    rack.recirculation = recirculation.get(rack.id) ?? 0;
    if (rack.liquid) rack.temp += (liquidTarget(s, rack) - rack.temp) * (1 - Math.exp(-dt / AI.loopTau));
    else rack.temp += (rackTargetTemp(s, rack, cooling.get(rack.id)!) - rack.temp) * alpha;
    s.stats.peakTemp = Math.max(s.stats.peakTemp, rack.temp);
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
