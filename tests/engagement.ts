import { createGame } from '../src/sim/state';
import { step } from '../src/sim/sim';
import { isNight } from '../src/core/time';
import { autopilot, type Defend } from './autopilot';
import type { ChapterId, DifficultyId, GameState } from '../src/sim/types';

export interface EngagementStats {
  state: GameState;
  realMinutes: number; // at 1x, nights fast-forwarded when quiet
  quietDaytimePct: number;
  longestQuietRealSec: number;
  shiftRealMinutes: number[];
  /** Successful player commands per real minute at 1x (the workload metric, PRD §21.6). */
  actionsPerMinute: number;
}

/** Plays a chapter with the bot and measures pacing (PRD §19, §21.10). */
export function measure(chapter: ChapterId, seed: number, difficulty: DifficultyId = 'sysadmin', auto = false, defend: Defend = 'auto', noc = false): EngagementStats {
  const s = createGame(chapter, difficulty, seed);
  let realSec = 0;
  let dayMin = 0;
  let quietDay = 0;
  let run = 0;
  let longest = 0;
  let shiftSec = 0;
  const shiftRealMinutes: number[] = [];
  let reports = 0;
  while (s.progress.status === 'playing') {
    if (s.minute % 5 === 0) autopilot(s, { auto, defend, noc });
    const night = isNight(s.minute);
    const calm = !s.alarms.some((a) => a.kind !== 'powerHigh' && a.kind !== 'bandwidth') && s.jobs.length === 0;
    if (!night) {
      dayMin++;
      if (calm) quietDay++;
    }
    run = calm && !night ? run + 1 : 0;
    longest = Math.max(longest, run);
    const sec = night && calm ? 1 / 12 : 1 / 3;
    realSec += sec;
    if (s.shift) shiftSec += sec;
    step(s);
    if (s.shiftReports.length > reports) {
      reports = s.shiftReports.length;
      shiftRealMinutes.push(shiftSec / 60);
      shiftSec = 0;
    }
  }
  return {
    state: s, realMinutes: realSec / 60, quietDaytimePct: (quietDay / Math.max(1, dayMin)) * 100,
    longestQuietRealSec: longest / 3, shiftRealMinutes,
    actionsPerMinute: (s.stats.commands ?? 0) / Math.max(1, realSec / 60),
  };
}
