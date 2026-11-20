import { at } from '../core/time';
import { CHAPTERS, type Objective } from '../data/chapters';
import { TIPS } from '../data/content';
import { createGame, addLog } from './state';
import { overallUptimePct } from './selectors';
import type { ChapterId, GameState } from './types';

/**
 * Daily Challenge (PRD §21.7): one shift, the same for everyone, derived only from the date.
 * No backend needed because the simulation is deterministic.
 */
export const DAILY_EPOCH = { y: 2026, m: 10, d: 20 }; // 2026-11-20 is Daily #1

export const DAILY_MODIFIERS = {
  heatwave: { icon: '🌡️', name: 'Heatwave', description: 'The building air is 6°C hotter. Coolers struggle.' },
  gremlins: { icon: '👹', name: 'Gremlins', description: 'Hardware fails 80% more often today.' },
  shoestring: { icon: '🪙', name: 'Shoestring', description: 'You start with half the usual cash.' },
  viral: { icon: '📈', name: 'Gone Viral', description: 'Every customer gets 25% more traffic.' },
} as const;
export type DailyModifier = keyof typeof DAILY_MODIFIERS;

const DAILY_CHAPTERS: ChapterId[] = ['ch1', 'ch2', 'ch3'];

export interface DailySpec {
  id: string;
  number: number;
  chapter: ChapterId;
  modifier: DailyModifier;
  seed: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function dailyIdFor(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function dailyNumber(id: string): number {
  const [y, m, d] = id.split('-').map(Number) as [number, number, number];
  const days = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(DAILY_EPOCH.y, DAILY_EPOCH.m, DAILY_EPOCH.d)) / 86_400_000);
  return days + 1;
}

/** FNV-1a: a stable 32-bit seed from the date string. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function dailySpec(id: string): DailySpec {
  const seed = hash(`dcm-daily-${id}`);
  const mods = Object.keys(DAILY_MODIFIERS) as DailyModifier[];
  return {
    id, number: dailyNumber(id), seed,
    chapter: DAILY_CHAPTERS[seed % DAILY_CHAPTERS.length]!,
    modifier: mods[(seed >>> 8) % mods.length]!,
  };
}

export const DAILY_OBJECTIVES: [Objective, Objective, Objective] = [
  { label: 'SLA uptime ≥ 98% by 22:00', check: (s) => overallUptimePct(s) >= 98, progress: (s) => `Uptime ${overallUptimePct(s).toFixed(2)}% / 98%` },
  { label: 'SLA uptime ≥ 99.5% and the shift goal met', check: (s) => overallUptimePct(s) >= 99.5 && s.shiftReports.some((r) => r.goalMet) },
  { label: 'No critical alarm and at least $1,000 profit', check: (s) => s.stats.criticals === 0 && s.cash - s.progress.startCash >= 1000 },
];

export function createDaily(id: string, modifierOverride?: DailyModifier): GameState {
  const spec = dailySpec(id);
  const modifier = modifierOverride ?? spec.modifier;
  const s = createGame(spec.chapter, 'sysadmin', spec.seed);
  s.dailyId = id;
  s.dailyModifier = modifier;
  s.endMinute = Math.min(CHAPTERS[spec.chapter].endMinute, at(0, 22));
  s.seenTips = Object.keys(TIPS); // veterans: skip the tutorial tips
  switch (modifier) {
    case 'heatwave':
      s.ambient += 6;
      break;
    case 'gremlins':
      s.incidentMult = 1.8;
      break;
    case 'shoestring':
      s.cash = Math.round(s.cash * 0.5);
      break;
    case 'viral':
      s.demandMult = 1.25;
      break;
  }
  s.progress.startCash = s.cash;
  s.progress.peakCash = s.cash;
  const m = DAILY_MODIFIERS[modifier];
  addLog(s, 'story', `Daily Challenge #${spec.number}: ${CHAPTERS[spec.chapter].title}, ${m.icon} ${m.name}. ${m.description} One shift, until 22:00.`);
  return s;
}

/** Stars dominate; then uptime; then profit. */
export function dailyScore(s: GameState): number {
  const profit = Math.max(-9999, Math.min(9999, s.cash - s.progress.startCash));
  return s.progress.stars * 100_000 + Math.round(overallUptimePct(s) * 100) * 2 + profit + 10_000;
}

export function shareLine(s: GameState, url: string): string {
  const spec = dailySpec(s.dailyId ?? '');
  const m = DAILY_MODIFIERS[(s.dailyModifier ?? spec.modifier) as DailyModifier];
  const profit = s.cash - s.progress.startCash;
  const stars = '★'.repeat(s.progress.stars) + '☆'.repeat(3 - s.progress.stars);
  return `DataCenterMania Daily #${spec.number} ${stars} · ${m.icon} ${m.name} · ${overallUptimePct(s).toFixed(2)}% uptime · ${profit >= 0 ? '+' : '-'}$${Math.abs(Math.round(profit)).toLocaleString('en-US')}\n${url}`;
}
