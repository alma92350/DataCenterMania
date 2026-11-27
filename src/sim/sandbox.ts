import { TIPS } from '../data/content';
import { CHAPTERS, type Objective } from '../data/chapters';
import { MINUTES_PER_DAY } from '../core/time';
import { FRONTIER } from '../data/catalog';
import { addLog, createGame } from './state';
import { createSeasons } from './seasons';
import type { ChapterId, DifficultyId, FeatureFlag, GameState } from './types';

/**
 * Sandbox / Endless mode (PRD §21, v0.7): pick the floor and the pressure, play until bankruptcy,
 * chase a high score. Unlocks after Chapter 2.
 */
export type SandboxFloor = 'small' | 'medium' | 'large' | 'campus' | 'frontier';

export interface SandboxConfig {
  floor: SandboxFloor;
  /** Starting cash multiplier. */
  cash: 0.5 | 1 | 2;
  /** Incident rate multiplier. */
  incidents: 0.5 | 1 | 2;
  /** Random cyberattacks (Script Kiddies and Captain Phish drop by). */
  cyber: boolean;
  /** Incident rate grows every day. */
  ramp: boolean;
  /** Four seasons of seven days: air temperature, heatwaves and holiday rushes (v3.4). */
  seasons?: boolean;
}

export const DEFAULT_SANDBOX: SandboxConfig = { floor: 'medium', cash: 1, incidents: 1, cyber: true, ramp: true };

export const SANDBOX_FLOORS: Record<SandboxFloor, { chapter: ChapterId; name: string; blurb: string }> = {
  small: { chapter: 'ch2', name: 'Small colo', blurb: 'Two racks, cosy.' },
  medium: { chapter: 'ch3', name: 'Colocation floor', blurb: 'Aisles and room to grow.' },
  large: { chapter: 'ch4', name: 'Big hall', blurb: 'Fiber, bandwidth and long nights.' },
  campus: { chapter: 'ch10', name: 'Campus', blurb: 'Every system at once: sites, board and county.' },
  frontier: { chapter: 'ch2', name: 'Frontier (speculative)', blurb: 'Orbital cluster: no technicians, radiators, launched spares.' },
};

export const SANDBOX_RAMP = 0.08; // +8% incidents per day
const EVER = 999_999_999;

export const sandboxDays = (s: GameState): number => Math.max(0, Math.floor((s.minute - CHAPTERS[s.chapter].startMinute) / MINUTES_PER_DAY));

export function createSandbox(cfg: SandboxConfig, difficulty: DifficultyId, seed: number): GameState {
  const s = createGame(SANDBOX_FLOORS[cfg.floor].chapter, difficulty, seed);
  const extra: FeatureFlag[] = ['shop', 'hire', 'contracts', 'power', 'buildRack', 'coolers', 'projects', 'walkins', 'autodispatch', 'roles', 'maintenance', 'remote'];
  if (cfg.cyber) extra.push('cyber');
  s.features = [...new Set([...s.features, ...extra])];
  s.sandbox = { ...cfg };
  if (cfg.floor === 'frontier') {
    s.frontier = { launchPerKg: FRONTIER.startPricePerKg, startMin: s.minute };
    s.features = s.features.filter((f) => f !== 'hire');
  }
  s.endMinute = EVER;
  s.seenTips = Object.keys(TIPS);
  s.cash = Math.round(s.cash * cfg.cash);
  s.progress.startCash = s.cash;
  s.progress.peakCash = s.cash;
  s.failuresEnabled = true;
  s.incidentMult = cfg.incidents * (cfg.floor === 'frontier' ? FRONTIER.radiationMult : 1);
  if (cfg.cyber) s.cyberRandom = true;
  if (cfg.ramp) s.rampPerDay = SANDBOX_RAMP;
  if (cfg.seasons) createSeasons(s);
  addLog(s, 'story', `Sandbox: ${SANDBOX_FLOORS[cfg.floor].name}. No deadline. Play until the bank pulls the plug. How many days can you last?`);
  return s;
}

export function sandboxScore(s: GameState): number {
  return sandboxDays(s) * 1000 + Math.round(Math.max(0, s.progress.peakCash) / 20) + s.cyber.blocked * 100 + (s.campus?.sites.filter((x) => x.status === 'live').length ?? 0) * 500;
}

export const SANDBOX_OBJECTIVES: [Objective, Objective, Objective] = [
  { label: 'Survive a week', check: (s) => sandboxDays(s) >= 7, progress: (s) => `Day ${sandboxDays(s)} / 7` },
  { label: 'Survive two weeks', check: (s) => sandboxDays(s) >= 14, progress: (s) => `Day ${sandboxDays(s)} / 14` },
  { label: 'Survive a month', check: (s) => sandboxDays(s) >= 30, progress: (s) => `Day ${sandboxDays(s)} / 30` },
];
