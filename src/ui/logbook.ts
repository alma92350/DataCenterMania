import type { ChapterId, DifficultyId, GameState } from '../sim/types';
import { overallUptimePct } from '../sim/selectors';
import { sandboxDays, sandboxScore } from '../sim/sandbox';
import { dailyScore } from '../sim/daily';
import { CHAPTERS } from '../data/chapters';

/** The career logbook (v3.5): one line per finished run, kept in this browser. */
export interface RunEntry {
  /** Wall-clock time the run ended. */
  t: number;
  chapter: ChapterId;
  difficulty: DifficultyId;
  mode: 'chapter' | 'daily' | 'sandbox';
  won: boolean;
  stars: number;
  /** SLA uptime in percent. */
  uptime: number;
  profit: number;
  /** Game days played. */
  days: number;
  /** Sandbox and daily score. */
  score?: number;
}

export const LOGBOOK_MAX = 100;

export function entryFor(s: GameState, now: number): RunEntry {
  const mode: RunEntry['mode'] = s.sandbox ? 'sandbox' : s.dailyId ? 'daily' : 'chapter';
  const won = s.progress.status === 'won';
  return {
    t: now, chapter: s.chapter, difficulty: s.difficulty, mode, won, stars: won ? s.progress.stars : 0,
    uptime: Math.round(overallUptimePct(s) * 100) / 100, profit: Math.round(s.cash - s.progress.startCash),
    days: s.sandbox ? sandboxDays(s) : Math.max(1, Math.round((s.minute - CHAPTERS[s.chapter].startMinute) / 1440)),
    ...(s.sandbox ? { score: sandboxScore(s) } : s.dailyId ? { score: dailyScore(s) } : {}),
  };
}

export interface LogbookStats {
  runs: number;
  wins: number;
  winRate: number | null;
  totalStars: number;
  bestUptime: number | null;
  bestProfit: number | null;
  bestSandboxDays: number | null;
  /** Average stars of the last five chapter runs against the five before: positive means improving. */
  trend: number | null;
  streak: number;
}

const avg = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Records, win rate, trend and the current winning streak. Entries are oldest first. */
export function logbookStats(entries: RunEntry[]): LogbookStats {
  const chapter = entries.filter((e) => e.mode === 'chapter');
  const wins = entries.filter((e) => e.won);
  const sandbox = entries.filter((e) => e.mode === 'sandbox');
  const last = chapter.slice(-5).map((e) => e.stars);
  const before = chapter.slice(-10, -5).map((e) => e.stars);
  let streak = 0;
  for (let i = entries.length - 1; i >= 0 && entries[i]!.won; i--) streak++;
  return {
    runs: entries.length, wins: wins.length, winRate: entries.length ? Math.round((wins.length / entries.length) * 100) : null,
    totalStars: entries.reduce((n, e) => n + e.stars, 0),
    bestUptime: wins.length ? Math.max(...wins.map((e) => e.uptime)) : null,
    bestProfit: wins.length ? Math.max(...wins.map((e) => e.profit)) : null,
    bestSandboxDays: sandbox.length ? Math.max(...sandbox.map((e) => e.days)) : null,
    trend: last.length >= 2 && before.length >= 2 ? Math.round((avg(last) - avg(before)) * 10) / 10 : null,
    streak,
  };
}
