import { CHAPTER_ORDER } from '../data/chapters';
import { deserialize, serialize } from '../sim/save';
import type { ChapterId, DifficultyId, GameState } from '../sim/types';
import type { AutoPauseSetting } from './clock';

const SAVE_KEY = 'dcm.save.v1';
const PROGRESS_KEY = 'dcm.progress.v1';
const SETTINGS_KEY = 'dcm.settings.v1';

/** Storage can be missing or throw (private mode, blocked site data): every access is guarded. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStore(): KeyValueStore | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function read(store: KeyValueStore | null, key: string): string | null {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(store: KeyValueStore | null, key: string, value: string | null): void {
  try {
    if (value === null) store?.removeItem(key);
    else store?.setItem(key, value);
  } catch {
    /* storage full or blocked: the game keeps running */
  }
}

export interface Settings {
  autoPause: AutoPauseSetting;
  nightSkip: boolean;
  sound: boolean;
  difficulty: DifficultyId;
}

export const DEFAULT_SETTINGS: Settings = { autoPause: 'critical', nightSkip: true, sound: true, difficulty: 'sysadmin' };

/** Best stars per chapter and difficulty. */
export type Progress = Partial<Record<ChapterId, Partial<Record<DifficultyId, number>>>>;

export class Persistence {
  constructor(private readonly store: KeyValueStore | null = defaultStore()) {}

  saveGame(s: GameState): void {
    write(this.store, SAVE_KEY, serialize(s));
  }

  loadGame(): GameState | null {
    const raw = read(this.store, SAVE_KEY);
    if (!raw) return null;
    try {
      return deserialize(raw);
    } catch {
      return null;
    }
  }

  clearGame(): void {
    write(this.store, SAVE_KEY, null);
  }

  loadSettings(): Settings {
    try {
      return { ...DEFAULT_SETTINGS, ...(JSON.parse(read(this.store, SETTINGS_KEY) ?? '{}') as Partial<Settings>) };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  saveSettings(s: Settings): void {
    write(this.store, SETTINGS_KEY, JSON.stringify(s));
  }

  loadProgress(): Progress {
    try {
      return JSON.parse(read(this.store, PROGRESS_KEY) ?? '{}') as Progress;
    } catch {
      return {};
    }
  }

  recordResult(chapter: ChapterId, difficulty: DifficultyId, stars: number): Progress {
    const p = this.loadProgress();
    const entry = (p[chapter] ??= {});
    entry[difficulty] = Math.max(entry[difficulty] ?? 0, stars);
    write(this.store, PROGRESS_KEY, JSON.stringify(p));
    return p;
  }
}

/** A chapter is unlocked when it is the first, or the previous one was won on any difficulty. */
export function isUnlocked(p: Progress, chapter: ChapterId): boolean {
  const i = CHAPTER_ORDER.indexOf(chapter);
  if (i <= 0) return true;
  const prev = p[CHAPTER_ORDER[i - 1]!];
  return !!prev && Object.values(prev).some((stars) => (stars ?? 0) > 0);
}

export function bestStars(p: Progress, chapter: ChapterId): number {
  return Math.max(0, ...Object.values(p[chapter] ?? {}).map((v) => v ?? 0));
}
