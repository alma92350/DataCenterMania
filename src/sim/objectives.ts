import { CHAPTERS, type Objective } from '../data/chapters';
import { DAILY_OBJECTIVES } from './daily';
import { SANDBOX_OBJECTIVES } from './sandbox';
import { addLog } from './state';
import { settleDay, settleHour } from './economy';
import { endShift } from './shifts';
import { MINUTES_PER_DAY } from '../core/time';
import type { GameState } from './types';

/** The chapter's end, or a Daily Challenge's one-shift end. */
export function chapterEnd(s: GameState): number {
  return s.endMinute ?? CHAPTERS[s.chapter].endMinute;
}

/** Chapter objectives, or the Daily Challenge's. */
export function objectivesFor(s: GameState): readonly Objective[] {
  if (s.sandbox) return SANDBOX_OBJECTIVES;
  return s.dailyId ? DAILY_OBJECTIVES : CHAPTERS[s.chapter].objectives;
}

export function objectiveStatus(s: GameState): boolean[] {
  return objectivesFor(s).map((o) => o.check(s));
}

/** Stars are cumulative: ★★ requires ★, ★★★ requires ★★. */
export function countStars(results: boolean[]): number {
  let stars = 0;
  for (const r of results) {
    if (!r) break;
    stars++;
  }
  return stars;
}

export function checkLose(s: GameState): boolean {
  if (s.progress.negativeCashDays >= 2) {
    end(s, 'lost', 'Bankrupt! The bank pulled the plug.');
    return true;
  }
  if (s.reputation <= 0) {
    end(s, 'lost', 'Your reputation hit rock bottom. All customers left.');
    return true;
  }
  return false;
}

export function checkEnd(s: GameState): void {
  if (s.minute < chapterEnd(s)) return;
  if (s.minute % 60 !== 0) settleHour(s);
  if (s.shift) endShift(s);
  if (s.minute % MINUTES_PER_DAY !== 0) settleDay(s, true);
  const results = objectiveStatus(s);
  const stars = countStars(results);
  s.progress.stars = stars;
  if (stars >= 1) end(s, 'won', `Chapter complete! ${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}`);
  else end(s, 'lost', `Time is up and the goal was not met: ${objectivesFor(s)[0]!.label}.`);
}

function end(s: GameState, status: 'won' | 'lost', text: string): void {
  s.progress.status = status;
  addLog(s, status === 'won' ? 'success' : 'fail', text);
  s.attention = { severity: 3, text };
}
