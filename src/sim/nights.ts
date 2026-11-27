import { hourOf } from '../core/time';
import { NIGHTS } from '../data/catalog';
import { addLog, newId, showTip } from './state';
import { adjustSatisfaction } from './crm';
import { contractLabel } from './naming';
import type { GameState, Tech } from './types';

export const isNightHour = (minute: number): boolean => {
  const h = hourOf(minute);
  return h >= NIGHTS.startHour || h < NIGHTS.endHour;
};

/** From 22:00 to 06:00 only the rota (and you) are on site. */
export function offDuty(s: GameState, t: Tech): boolean {
  if (!s.features.includes('nights') || t.role === 'manager') return false;
  if (!isNightHour(s.minute)) return false;
  return !(s.nightCrew ?? []).includes(t.id) && s.pager?.answered !== 'now';
}

export function rotaPremiumPerDay(s: GameState): number {
  const crew = (s.nightCrew ?? []).map((id) => s.techs.find((t) => t.id === id)).filter((t): t is Tech => !!t);
  return Math.round(crew.reduce((n, t) => n + t.salaryPerDay * NIGHTS.rotaPremiumShare, 0));
}

export function openIncident(s: GameState): void {
  if (!s.features.includes('nights') || (s.incident && s.incident.status === 'open')) return;
  s.incident = { id: newId(s, 'inc'), startedAt: s.minute, commanderId: null, update: 'none', status: 'open', quietSince: null };
  addLog(s, 'alarm', '🚨 Major incident declared. Assign a commander and tell your customers what is happening.');
  showTip(s, 'incident');
}

export function raisePager(s: GameState, text: string): void {
  if (!s.features.includes('nights')) return;
  s.pager = { id: newId(s, 'pg'), raisedAt: s.minute, text, answered: null };
  s.attention = { severity: 3, text: `📟 Pager: ${text}` };
  addLog(s, 'alarm', `📟 The pager goes off at ${String(hourOf(s.minute)).padStart(2, '0')}:00: ${text}`);
  showTip(s, 'pager');
}

export function answerPager(s: GameState, how: 'now' | 'hold'): boolean {
  const p = s.pager;
  if (!p || p.answered) return false;
  p.answered = how;
  if (how === 'now') {
    for (const t of s.techs) if (t.role !== 'manager') t.fatigue = Math.min(100, t.fatigue + NIGHTS.pagerWakeFatigue);
    const me = s.techs.find((t) => t.role === 'manager');
    if (me) me.fatigue = Math.min(100, me.fatigue + NIGHTS.pagerWakeFatigue);
    addLog(s, 'info', '📟 You called everybody in. They will be tired tomorrow.');
  } else {
    addLog(s, 'info', '📟 You held it until morning. Whatever broke stays broken for now.');
  }
  return true;
}

export function setCommander(s: GameState, techId: string | null): boolean {
  const inc = s.incident;
  if (!inc || inc.status !== 'open') return false;
  inc.commanderId = techId;
  return true;
}

export function sendUpdate(s: GameState, kind: 'honest' | 'vague' | 'silent'): boolean {
  const inc = s.incident;
  if (!inc || inc.status !== 'open') return false;
  inc.update = kind;
  addLog(s, 'info', kind === 'honest' ? '📣 You told customers exactly what is wrong and when to expect a fix.' : kind === 'vague' ? '📣 You sent a vague “we are looking into it”.' : '📣 You decided to say nothing for now.');
  return true;
}

/** Scores a closed incident 0..3: a commander, an honest update, a fast resolution. */
export function scoreIncident(s: GameState): number {
  const inc = s.incident!;
  return (inc.commanderId ? 1 : 0) + (inc.update === 'honest' ? 1 : 0) + (s.minute - inc.startedAt <= NIGHTS.goodResolveMin ? 1 : 0);
}

export function updateNights(s: GameState): void {
  if (!s.features.includes('nights')) return;
  const inc = s.incident;
  if (inc && inc.status === 'open') {
    if (s.alarms.some((a) => a.severity === 3)) inc.quietSince = null;
    else {
      inc.quietSince ??= s.minute;
      if (s.minute - inc.quietSince >= NIGHTS.incidentQuietMin) closeIncident(s);
    }
  }
  // a held page makes things worse by morning
  const p = s.pager;
  if (p && p.answered === 'hold' && s.minute - p.raisedAt === NIGHTS.pagerHoldEscalation) {
    for (const a of s.alarms) if (a.severity < 3) a.severity = (a.severity + 1) as 1 | 2 | 3;
    addLog(s, 'fail', '📟 An hour on, the problem you held has got worse.');
  }
  if (p && s.minute - p.raisedAt > 12 * 60) s.pager = null;
}

function closeIncident(s: GameState): void {
  const inc = s.incident!;
  const score = scoreIncident(s);
  inc.status = 'closed';
  (s.incidentScores ??= []).push(score);
  s.reputation = Math.min(5, s.reputation + score * NIGHTS.scoreRep);
  for (const c of s.contracts) {
    if (c.status !== 'active' || (c.minutesToday === 0 || c.okMinutesToday >= c.minutesToday)) continue;
    adjustSatisfaction(c, inc.update === 'honest' ? NIGHTS.updateHonest : inc.update === 'silent' || inc.update === 'none' ? NIGHTS.updateSilent : 0);
  }
  addLog(s, score >= 2 ? 'success' : 'info', `📋 Incident review: score ${score}/3 (${inc.commanderId ? 'commander' : 'no commander'}, ${inc.update === 'honest' ? 'honest updates' : inc.update === 'none' ? 'no updates' : 'weak updates'}).`);
  void contractLabel;
}
