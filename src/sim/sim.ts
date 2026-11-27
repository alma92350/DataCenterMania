import { MINUTES_PER_DAY } from '../core/time';
import { updateDemand } from './demand';
import { escalateAlarms } from './alarms';
import { accrueMinute, settleDay, settleHour, updateOrders } from './economy';
import { updateShift } from './shifts';
import { updateCyber } from './cyber';
import { runAutomation } from './automation';
import { expireBubbles } from './bubbles';
import { updateWalkins } from './walkins';
import { runScriptedEvents } from './events';
import { rollFailures } from './failures';
import { updateTechs } from './jobs';
import { checkEnd, checkLose } from './objectives';
import { updateBackup } from './backup';
import { facilityPowerW, updatePower } from './power';
import { updateThermal } from './thermal';
import { updateCoolers } from './maintenance';
import { updateNetwork } from './network';
import { updateNoc } from './noc';
import { rollFeeds } from './feeds';
import { updateChanges } from './changes';
import { updateFatigue } from './fatigue';
import type { GameState } from './types';

/** Advances the world by exactly one game minute. Order matters and is part of the contract. */
export function step(s: GameState): void {
  if (s.progress.status !== 'playing') return;
  const dt = 1;
  runScriptedEvents(s);
  updateShift(s);
  updateChanges(s);
  updateCyber(s);
  updateWalkins(s, dt);
  updateNetwork(s, dt);
  updateDemand(s, dt);
  updateBackup(s);
  updatePower(s);
  updateCoolers(s, dt);
  updateThermal(s, dt);
  rollFailures(s, dt);
  rollFeeds(s, dt);
  escalateAlarms(s);
  updateNoc(s);
  runAutomation(s);
  updateTechs(s, dt);
  expireBubbles(s);
  updateFatigue(s, dt);
  updateOrders(s);
  accrueMinute(s);
  s.energyTodayKwh += (facilityPowerW(s) / 1000) * (dt / 60);

  s.minute += dt;
  s.progress.peakCash = Math.max(s.progress.peakCash, s.cash);
  if (s.minute % 60 === 0) settleHour(s);
  if (s.minute % MINUTES_PER_DAY === 0) {
    settleDay(s);
    s.progress.negativeCashDays = s.cash < 0 ? s.progress.negativeCashDays + 1 : 0;
    if (checkLose(s)) return;
  }
  checkEnd(s);
}

export function advance(s: GameState, minutes: number): void {
  for (let i = 0; i < minutes && s.progress.status === 'playing'; i++) step(s);
}
