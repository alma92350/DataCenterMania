import { DIFFICULTIES } from '../data/difficulty';
import type { GameState } from './types';

/** Calm -> build-up -> peak -> relief, repeating every 8 game hours (PRD §12.3). */
const PHASES = [0.6, 1.0, 1.7, 0.7] as const;
const PHASE_LEN = 120;

export function directorPhase(minute: number): number {
  return Math.floor(minute / PHASE_LEN) % PHASES.length;
}

export function directorMultiplier(s: GameState): number {
  const intensity = DIFFICULTIES[s.difficulty].directorIntensity;
  const base = PHASES[directorPhase(s.minute)]!;
  let m = 1 + (base - 1) * intensity;
  const serious = s.alarms.filter((a) => a.severity >= 2).length;
  if (serious >= 2) m *= 0.3; // never pile on a player who is already drowning
  else if (serious === 1) m *= 0.7;
  return m;
}
