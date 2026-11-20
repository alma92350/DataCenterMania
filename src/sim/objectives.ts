import { CHAPTERS } from '../data/chapters';
import { addLog } from './state';
import { settleDay, settleHour } from './economy';
import { endShift } from './shifts';
import { MINUTES_PER_DAY } from '../core/time';
import type { GameState } from './types';

export function objectiveStatus(s: GameState): boolean[] {
  return CHAPTERS[s.chapter].objectives.map((o) => o.check(s));
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
  if (s.minute < CHAPTERS[s.chapter].endMinute) return;
  if (s.minute % 60 !== 0) settleHour(s);
  if (s.shift) endShift(s);
  if (s.minute % MINUTES_PER_DAY !== 0) settleDay(s, true);
  const results = objectiveStatus(s);
  const stars = countStars(results);
  s.progress.stars = stars;
  if (stars >= 1) end(s, 'won', `Chapter complete! ${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}`);
  else end(s, 'lost', `Time is up and the goal was not met: ${CHAPTERS[s.chapter].objectives[0].label}.`);
}

function end(s: GameState, status: 'won' | 'lost', text: string): void {
  s.progress.status = status;
  addLog(s, status === 'won' ? 'success' : 'fail', text);
  s.attention = { severity: 3, text };
}
