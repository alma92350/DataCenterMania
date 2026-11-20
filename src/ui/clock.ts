import { gameMinutesPerRealSecond, isNight, type Speed } from '../core/time';
import { DIFFICULTIES } from '../data/difficulty';
import type { GameState } from '../sim/types';

const MAX_MINUTES_PER_FRAME = 60;

/** Real seconds elapsed -> whole game minutes to simulate, keeping the fraction for the next frame. */
export function minutesToAdvance(realDt: number, speed: Speed, carry: number): { minutes: number; carry: number } {
  if (speed === 0) return { minutes: 0, carry };
  const total = carry + Math.min(realDt, 1) * gameMinutesPerRealSecond(speed);
  const minutes = Math.min(MAX_MINUTES_PER_FRAME, Math.floor(total));
  return { minutes, carry: total - minutes };
}

/** Night skip: nights run at 4x while nothing needs attention (PRD §3.1). */
export function effectiveSpeed(speed: Speed, s: GameState, nightSkip: boolean): Speed {
  if (speed === 0 || !nightSkip) return speed;
  if (isNight(s.minute) && !s.alarms.some((a) => a.severity >= 2) && !s.jobs.length) return 4;
  return speed;
}

export type AutoPauseSetting = 'off' | 'major' | 'critical';

export function shouldAutoPause(s: GameState, setting: AutoPauseSetting): boolean {
  if (!s.attention) return false;
  const effective: AutoPauseSetting = DIFFICULTIES[s.difficulty].forceAutoPause && setting === 'off' ? 'critical' : setting;
  if (effective === 'off') return false;
  return s.attention.severity >= (effective === 'major' ? 2 : 3);
}
