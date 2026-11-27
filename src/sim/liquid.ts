import { AI } from '../data/catalog';
import { clearAlarms, escalationDelay, raiseAlarm } from './alarms';
import { addLog, showTip } from './state';
import { devicesInRack } from './selectors';
import type { GameState, Loop, Rack } from './types';

export const createLoop = (cdus: number): Loop => ({ cdus, cdusOk: cdus, leakRackId: null });

export const liquidRacks = (s: GameState): Rack[] => s.racks.filter((r) => r.liquid);

/** Heat (kW) the coolant loop must remove: every liquid rack that is not isolated. */
export const loopHeatKw = (s: GameState): number => liquidRacks(s).filter((r) => r.id !== s.loop?.leakRackId).reduce((kw, r) => kw + r.loadW / 1000, 0);

export const loopCapacityKw = (s: GameState): number => (s.loop ? s.loop.cdusOk * AI.cduKw : 0);

/** Liquid racks sit near 35 degrees while the loop keeps up, and run away within minutes when it does not. */
export function liquidTarget(s: GameState, rack: Rack): number {
  if (!s.loop) return 80;
  if (rack.id === s.loop.leakRackId) return AI.liquidBaseC;
  const excess = Math.max(0, loopHeatKw(s) - loopCapacityKw(s));
  return AI.liquidBaseC + excess * AI.loopRunawayPerKw;
}

export function failPump(s: GameState, text?: string): void {
  const loop = s.loop;
  if (!loop || loop.cdusOk <= 0) return;
  loop.cdusOk--;
  if (text) addLog(s, 'story', text);
  raiseAlarm(s, 'pump', null, null, 3, null);
  addLog(s, 'fail', `💧 A coolant pump failed: the loop now carries ${loop.cdusOk * AI.cduKw} kW for ${Math.round(loopHeatKw(s))} kW of heat.`);
  showTip(s, 'pumpFail');
}

export function repairPump(s: GameState): void {
  const loop = s.loop;
  if (!loop) return;
  loop.cdusOk = Math.min(loop.cdus, loop.cdusOk + 1);
  if (loop.cdusOk >= loop.cdus) clearAlarms(s, (a) => a.kind === 'pump');
  addLog(s, 'success', '💧 The pump is repaired: the loop is back to full capacity.');
}

export function leak(s: GameState, rackIndex: number, text?: string): void {
  const loop = s.loop;
  const rack = s.racks.filter((r) => r.liquid)[rackIndex] ?? s.racks.find((r) => r.liquid);
  if (!loop || !rack || loop.leakRackId) return;
  loop.leakRackId = rack.id;
  if (text) addLog(s, 'story', text);
  for (const d of devicesInRack(s, rack.id)) d.thermalShutdown = true;
  raiseAlarm(s, 'leak', rack.id, null, 3, null);
  addLog(s, 'fail', `💧 Coolant leak on Rack ${s.racks.indexOf(rack) + 1}: it is isolated and shut down until a technician repairs it.`);
  showTip(s, 'leak');
}

export function repairLeak(s: GameState): void {
  const loop = s.loop;
  if (!loop?.leakRackId) return;
  const rack = s.racks.find((r) => r.id === loop.leakRackId);
  loop.leakRackId = null;
  if (rack) {
    for (const d of devicesInRack(s, rack.id)) d.thermalShutdown = false;
    rack.temp = AI.liquidBaseC;
  }
  clearAlarms(s, (a) => a.kind === 'leak');
  addLog(s, 'success', '💧 The leak is sealed and the rack is back on the loop.');
}

export function spike(s: GameState, mult: number, minutes: number, text?: string): void {
  const k = s.aiTech?.battery ? 1 + (mult - 1) * AI.spikeBatteryMult : mult;
  s.spike = { mult: k, until: s.minute + minutes };
  addLog(s, 'alarm', text ?? `⚡ A big training run starts: GPU power jumps ×${k.toFixed(2)} for ${minutes} minutes.${s.aiTech?.battery ? ' The battery buffer soaks up most of it.' : ''}`);
  showTip(s, 'spike');
}

/** A leak or pump failure on its own raises a critical alarm: keep the escalation helper imported for later tuning. */
export const _unused = escalationDelay;
