import { chance } from '../core/rng';
import { CHAPTERS } from '../data/chapters';
import { MINUTES_PER_DAY } from '../core/time';
import { surge } from './site';
import { addLog } from './state';
import type { GameState } from './types';

/** Sandbox seasons (v3.4): a 28-day year of four 7-day seasons that move the air temperature and the traffic. */
export const SEASONS = [
  { id: 'spring', icon: '🌸', name: 'Spring', ambientDelta: -1, blurb: 'Mild air. A good time to fix things.' },
  { id: 'summer', icon: '🌞', name: 'Summer', ambientDelta: 4, blurb: 'Hotter air weakens your coolers, and heatwaves are possible.' },
  { id: 'autumn', icon: '🍂', name: 'Autumn', ambientDelta: -2, blurb: 'Cool air: free cooling works well.' },
  { id: 'winter', icon: '❄️', name: 'Winter', ambientDelta: -7, blurb: 'Cold air, and holiday traffic rushes are possible.' },
] as const;

export const SEASON = { daysPer: 7, heatwaveChancePerDay: 0.18, heatwaveDays: 2, heatwaveDelta: 7, rushChancePerDay: 0.25, rushMult: 1.5, rushHours: 10 } as const;

export interface Seasonal {
  /** Absolute game day the year started on. */
  day0: number;
  heatUntil: number;
}

export const dayNumber = (minute: number): number => Math.floor(minute / MINUTES_PER_DAY);

export function seasonOf(s: GameState): { index: number; season: (typeof SEASONS)[number]; dayInSeason: number } | null {
  if (!s.season) return null;
  const d = Math.max(0, dayNumber(s.minute) - s.season.day0);
  const index = Math.floor(d / SEASON.daysPer) % SEASONS.length;
  return { index, season: SEASONS[index]!, dayInSeason: d % SEASON.daysPer };
}

export function createSeasons(s: GameState, startIndex = 0): void {
  s.season = { day0: dayNumber(s.minute) - startIndex * SEASON.daysPer, heatUntil: 0 };
  applySeason(s);
}

export const heatwaveActive = (s: GameState): boolean => !!s.season && s.minute < s.season.heatUntil;

function applySeason(s: GameState): void {
  const info = seasonOf(s);
  if (!info || !s.season) return;
  s.ambient = CHAPTERS[s.chapter].ambient + info.season.ambientDelta + (heatwaveActive(s) ? SEASON.heatwaveDelta : 0);
}

/** At midnight: the season turns over, the air follows it, and summer and winter roll their dice. */
export function updateSeasons(s: GameState): void {
  if (!s.season || s.minute % MINUTES_PER_DAY !== 0) return;
  const info = seasonOf(s)!;
  if (info.dayInSeason === 0 && s.minute > 0) addLog(s, 'story', `${info.season.icon} ${info.season.name} begins. ${info.season.blurb}`);
  if (info.season.id === 'summer' && !heatwaveActive(s) && chance(s.rng, SEASON.heatwaveChancePerDay)) {
    s.season.heatUntil = s.minute + SEASON.heatwaveDays * MINUTES_PER_DAY;
    addLog(s, 'alarm', `🔥 Heatwave! The air is ${SEASON.heatwaveDelta} degrees hotter for ${SEASON.heatwaveDays} days.`);
  }
  if (info.season.id === 'winter' && chance(s.rng, SEASON.rushChancePerDay)) surge(s, SEASON.rushMult, SEASON.rushHours, '🎁 Holiday rush! Customers need more traffic today.');
  applySeason(s);
}
