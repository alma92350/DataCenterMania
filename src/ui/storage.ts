import { CHAPTER_ORDER } from '../data/chapters';
import { deserialize, serialize } from '../sim/save';
import type { ChapterId, DifficultyId, GameState } from '../sim/types';
import { DEFAULT_SANDBOX, type SandboxConfig } from '../sim/sandbox';
import type { AutoPauseSetting } from './clock';
import type { DisplaySetting } from './display';

const SAVE_KEY = 'dcm.save.v1';
const PROGRESS_KEY = 'dcm.progress.v1';
const SETTINGS_KEY = 'dcm.settings.v1';
const ACHIEVEMENTS_KEY = 'dcm.achievements.v1';
const DAILY_KEY = 'dcm.daily.v1';
const SANDBOX_KEY = 'dcm.sandbox.v1';

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
  /** Colour screen or e-ink (Kindle Scribe); auto-detected by default. */
  display: DisplaySetting;
  /** Last Sandbox setup. */
  sandbox: SandboxConfig;
}

export const DEFAULT_SETTINGS: Settings = { autoPause: 'critical', nightSkip: true, sound: true, difficulty: 'sysadmin', display: 'auto', sandbox: { ...DEFAULT_SANDBOX } };

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
      const saved = JSON.parse(read(this.store, SETTINGS_KEY) ?? '{}') as Partial<Settings>;
      return { ...DEFAULT_SETTINGS, ...saved, sandbox: { ...DEFAULT_SANDBOX, ...saved.sandbox } };
    } catch {
      return { ...DEFAULT_SETTINGS, sandbox: { ...DEFAULT_SANDBOX } };
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

  loadAchievements(): Record<string, number> {
    try {
      return JSON.parse(read(this.store, ACHIEVEMENTS_KEY) ?? '{}') as Record<string, number>;
    } catch {
      return {};
    }
  }

  /** Stores newly earned achievements; returns only the ones unlocked just now. */
  unlockAchievements(ids: string[], when = Date.now()): string[] {
    const have = this.loadAchievements();
    const fresh = ids.filter((id) => !(id in have));
    for (const id of fresh) have[id] = when;
    if (fresh.length) write(this.store, ACHIEVEMENTS_KEY, JSON.stringify(have));
    return fresh;
  }

  /** Best Daily Challenge result per date. */
  loadDaily(): Record<string, { stars: number; score: number; share: string }> {
    try {
      return JSON.parse(read(this.store, DAILY_KEY) ?? '{}') as Record<string, { stars: number; score: number; share: string }>;
    } catch {
      return {};
    }
  }

  recordDaily(id: string, result: { stars: number; score: number; share: string }): boolean {
    const all = this.loadDaily();
    const prev = all[id];
    if (prev && prev.score >= result.score) return false;
    all[id] = result;
    write(this.store, DAILY_KEY, JSON.stringify(all));
    return true;
  }

  loadSandboxBest(): { score: number; days: number } | null {
    try {
      return JSON.parse(read(this.store, SANDBOX_KEY) ?? 'null') as { score: number; days: number } | null;
    } catch {
      return null;
    }
  }

  /** Returns true when this run is a new high score. */
  recordSandbox(result: { score: number; days: number }): boolean {
    const prev = this.loadSandboxBest();
    if (prev && prev.score >= result.score) return false;
    write(this.store, SANDBOX_KEY, JSON.stringify(result));
    return true;
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
/** Sandbox opens after Startup Colo, like the events. */
export const isSandboxUnlocked = (p: Progress): boolean => bestStars(p, 'ch2') > 0;

export function isUnlocked(p: Progress, chapter: ChapterId): boolean {
  if (chapter === 'hack') return bestStars(p, 'ch2') > 0; // events open after Startup Colo
  const i = CHAPTER_ORDER.indexOf(chapter);
  if (i <= 0) return true;
  const prev = p[CHAPTER_ORDER[i - 1]!];
  return !!prev && Object.values(prev).some((stars) => (stars ?? 0) > 0);
}

export function bestStars(p: Progress, chapter: ChapterId): number {
  return Math.max(0, ...Object.values(p[chapter] ?? {}).map((v) => v ?? 0));
}

/** On-Call Nightmare unlocks once Chapter 3 is won on any difficulty (PRD §12.1). */
export function isDifficultyUnlocked(p: Progress, d: DifficultyId): boolean {
  return d !== 'nightmare' || bestStars(p, 'ch3') > 0;
}
