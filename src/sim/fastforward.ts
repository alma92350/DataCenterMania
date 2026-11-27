import { step } from './sim';
import type { GameState } from './types';

export interface WakeUp {
  minute: number;
  text: string;
}

/**
 * Runs the world forward until the next shift starts, the day is over, or a critical alarm wakes the player.
 * Pure state in, state out: the browser runs it in a Web Worker (`worker.ts`) so a long night never
 * freezes the page, and runs the very same function on the main thread when workers are unavailable.
 */
export function fastForward(s: GameState, maxMinutes = 1440): WakeUp | null {
  s.attention = null;
  for (let i = 0; i < maxMinutes && s.progress.status === 'playing' && !s.shift; i++) {
    step(s);
    const att = s.attention as GameState['attention']; // step() may raise one
    if (att && att.severity >= 3) {
      s.attention = null;
      return { minute: s.minute, text: att.text };
    }
    s.attention = null;
  }
  return null;
}
