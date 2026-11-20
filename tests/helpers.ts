import { createGame } from '../src/sim/state';
import type { ChapterId, DifficultyId, GameState } from '../src/sim/types';

/** A game with random failures off so tests control every incident. */
export function quietGame(chapter: ChapterId = 'ch1', difficulty: DifficultyId = 'sysadmin', seed = 1): GameState {
  const s = createGame(chapter, difficulty, seed);
  s.failuresEnabled = false;
  s.progress.firedEvents = ['*all*']; // disable scripted events
  return s;
}
