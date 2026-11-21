import { pick } from '../core/rng';
import { MINUTES_PER_DAY, dayOf, hourOf } from '../core/time';
import { SHIFT } from '../data/catalog';
import { CHAPTERS } from '../data/chapters';
import { chapterEnd } from './objectives';
import { DIFFICULTIES } from '../data/difficulty';
import { suggestedCoolerJob, suggestedJob } from './commands';
import { addFx, addLog } from './state';
import { activeContracts, contractUptimeTodayPct } from './selectors';
import type { GameState, ShiftGoalKind, ShiftReport } from './types';

export const SHIFT_GOAL_LABEL: Record<ShiftGoalKind, string> = {
  sla: 'Every customer meets their SLA today',
  noCritical: 'No critical alarm all shift',
  fastFix: `Send someone to every alarm within ${SHIFT.fastFixMin} minutes`,
};

function startShift(s: GameState): void {
  const ch = CHAPTERS[s.chapter];
  const day = dayOf(s.minute);
  const endMinute = Math.min(chapterEnd(s), day * MINUTES_PER_DAY + SHIFT.endHour * 60);
  const goal: ShiftGoalKind = ch.shiftGoal ?? (activeContracts(s).length ? pick(s.rng, ['sla', 'noCritical', 'fastFix'] as const) : 'fastFix');
  s.shift = {
    day, startMinute: s.minute, endMinute, goal, goalLabel: SHIFT_GOAL_LABEL[goal],
    bonus: Math.round((SHIFT.baseBonus + SHIFT.bonusPerChapter * ch.number) * DIFFICULTIES[s.difficulty].startingCash), goalFailed: false,
    criticalsAtStart: s.stats.criticals, incidentsAtStart: s.stats.incidents, resolvedAtStart: s.stats.resolved, cashAtStart: s.cash, preventedAtStart: s.stats.prevented ?? 0,
  };
  addLog(s, 'story', `Shift ${s.shiftReports.length + 1} begins. Goal: ${s.shift.goalLabel} (+$${s.shift.bonus}).`);
}

/** Opens shifts at 06:00 (or the chapter start), tracks the goal, closes them at 22:00 (or the chapter end). */
export function updateShift(s: GameState): void {
  const ch = CHAPTERS[s.chapter];
  if (!s.shift) {
    const h = hourOf(s.minute);
    const day = dayOf(s.minute);
    const already = s.shiftReports.some((r) => r.day === day);
    if (!already && h >= SHIFT.startHour && h < SHIFT.endHour && s.minute < chapterEnd(s)) startShift(s);
    return;
  }
  const sh = s.shift;
  if (!sh.goalFailed) {
    if (sh.goal === 'noCritical' && s.stats.criticals > sh.criticalsAtStart) sh.goalFailed = true;
    if (sh.goal === 'fastFix') {
      const waiting = s.alarms.some((a) => {
        const fixable = suggestedJob(a.kind) !== null || suggestedCoolerJob(a.kind) !== null;
        const handled = s.jobs.some((j) =>
          (a.deviceId && j.deviceId === a.deviceId) || (a.coolerId && j.coolerId === a.coolerId) ||
          (a.uplinkId && j.uplinkId === a.uplinkId) || (!a.deviceId && a.rackId && j.rackId === a.rackId));
        return fixable && !handled && s.minute - a.raisedAt > SHIFT.fastFixMin;
      });
      if (waiting) sh.goalFailed = true;
    }
  }
  if (s.minute >= sh.endMinute) endShift(s);
}

export function endShift(s: GameState): ShiftReport | null {
  const sh = s.shift;
  if (!sh) return null;
  const contracts = activeContracts(s).filter((c) => c.minutesToday > 0);
  const slaOk = contracts.every((c) => contractUptimeTodayPct(c) + 1e-9 >= c.slaPct);
  const goalMet = sh.goal === 'sla' ? slaOk : !sh.goalFailed;
  let total = 0;
  let ok = 0;
  for (const c of contracts) {
    total += c.minutesToday;
    ok += c.okMinutesToday;
  }
  const uptimePct = total ? (ok / total) * 100 : 100;
  const criticals = s.stats.criticals - sh.criticalsAtStart;
  if (goalMet) {
    s.cash += sh.bonus;
    addFx(s, 'bonus', null, sh.bonus);
  }
  const incidents = s.stats.incidents - sh.incidentsAtStart;
  const resolved = s.stats.resolved - sh.resolvedAtStart;
  const highlights: string[] = [];
  if (resolved) highlights.push(`${resolved} incident${resolved > 1 ? 's' : ''} fixed`);
  const prevented = (s.stats.prevented ?? 0) - (sh.preventedAtStart ?? 0);
  if (prevented > 0) highlights.push(`Specialists prevented ${prevented} problem${prevented > 1 ? 's' : ''}`);
  if (criticals === 0) highlights.push('No critical alarm');
  if (uptimePct >= SHIFT.goodUptime) highlights.push(`Uptime ${uptimePct.toFixed(2)}%`);
  const rep: ShiftReport = {
    day: sh.day, goalLabel: sh.goalLabel, goalMet, bonus: goalMet ? sh.bonus : 0,
    stars: (goalMet ? 1 : 0) + (uptimePct >= SHIFT.goodUptime ? 1 : 0) + (criticals === 0 ? 1 : 0),
    net: s.cash - sh.cashAtStart, uptimePct, incidents, resolved, criticals, highlights,
  };
  s.shiftReports.push(rep);
  s.pendingShiftReport = rep;
  s.shift = null;
  addLog(s, goalMet ? 'success' : 'info', `Shift over: ${'★'.repeat(rep.stars)}${'☆'.repeat(3 - rep.stars)}${goalMet ? `, goal met (+$${sh.bonus})` : ', goal missed'}.`);
  return rep;
}
