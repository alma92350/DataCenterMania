import { chance } from '../core/rng';
import { COOLERS, MAINTENANCE } from '../data/catalog';
import { clearAlarms, raiseAlarm } from './alarms';
import { addLog, showTip } from './state';
import type { GameState } from './types';

/** Filters clog while a cooler runs; a fully clogged unit can break down (PRD §7, maintain tasks). */
export function updateCoolers(s: GameState, dt: number): void {
  if (!s.features.includes('maintenance')) return;
  for (const c of s.coolers) {
    if (c.kind === 'officeAc' || !c.on || c.broken) continue;
    c.health = Math.max(0, c.health - (MAINTENANCE.filterWearPerDay * dt) / 1440);
    if (c.health < MAINTENANCE.filterAlarmBelow) {
      raiseAlarm(s, 'filter', null, null, 1, null, { coolerId: c.id });
      showTip(s, 'maintenance');
    }
    const breakChance = (1 - c.health / MAINTENANCE.filterAlarmBelow) * MAINTENANCE.breakPerDayAtZero * (dt / 1440);
    if (c.health < MAINTENANCE.filterAlarmBelow && chance(s.rng, breakChance)) breakCooler(s, c.id);
  }
}

export function breakCooler(s: GameState, coolerId: string): void {
  const c = s.coolers.find((x) => x.id === coolerId);
  if (!c || c.broken) return;
  c.broken = true;
  clearAlarms(s, (a) => a.kind === 'filter' && a.coolerId === c.id);
  raiseAlarm(s, 'coolerDown', null, null, 3, null, { coolerId: c.id });
  addLog(s, 'fail', `${COOLERS[c.kind].name} broke down! The floor is heating up.`);
}
