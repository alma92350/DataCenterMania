import { SAVE_VERSION } from './state';
import type { GameState } from './types';

export function serialize(s: GameState): string {
  return JSON.stringify(s);
}

/** Parses and validates a save. Future versions add migrations here. */
export function deserialize(json: string): GameState {
  const data = JSON.parse(json) as Partial<GameState>;
  if (typeof data !== 'object' || data === null) throw new Error('Invalid save');
  if (data.version !== SAVE_VERSION) throw new Error(`Unsupported save version ${String(data.version)}`);
  for (const key of ['grid', 'racks', 'devices', 'techs', 'contracts', 'rng', 'progress'] as const) {
    if (!(key in data)) throw new Error(`Invalid save: missing ${key}`);
  }
  return data as GameState;
}
