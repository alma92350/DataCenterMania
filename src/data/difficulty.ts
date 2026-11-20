import type { DifficultyId } from '../sim/types';

/** PRD §12.1. All multipliers live here so balancing is a data change. */
export interface DifficultyDef {
  id: DifficultyId;
  name: string;
  emoji: string;
  blurb: string;
  startingCash: number;
  incidentRate: number;
  escalation: number; // multiplier on escalation delays (>1 = slower)
  slaPenalty: number;
  deliveryTime: number; // 0 = instant
  mistakeChance: number;
  directorIntensity: number; // 0..1
  forceAutoPause: boolean;
  hints: boolean;
  scoreMultiplier: number;
}

export const DIFFICULTIES: Record<DifficultyId, DifficultyDef> = {
  intern: {
    id: 'intern', name: 'Intern', emoji: '🎓', blurb: 'Relaxed. Extra cash, fewer incidents, instant deliveries.',
    startingCash: 2, incidentRate: 0.5, escalation: 2, slaPenalty: 0.5, deliveryTime: 0,
    mistakeChance: 0, directorIntensity: 0.3, forceAutoPause: true, hints: true, scoreMultiplier: 0.5,
  },
  sysadmin: {
    id: 'sysadmin', name: 'Sysadmin', emoji: '🧑‍💻', blurb: 'The intended experience.',
    startingCash: 1, incidentRate: 1, escalation: 1, slaPenalty: 1, deliveryTime: 1,
    mistakeChance: 0.03, directorIntensity: 0.6, forceAutoPause: false, hints: true, scoreMultiplier: 1,
  },
  senior: {
    id: 'senior', name: 'Senior Engineer', emoji: '🛠️', blurb: 'Tighter money, more incidents, faster alarms.',
    startingCash: 0.8, incidentRate: 1.3, escalation: 0.8, slaPenalty: 1.25, deliveryTime: 1.5,
    mistakeChance: 0.08, directorIntensity: 0.8, forceAutoPause: false, hints: true, scoreMultiplier: 1.5,
  },
  nightmare: {
    id: 'nightmare', name: 'On-Call Nightmare', emoji: '🔥', blurb: 'Everything breaks, fast. Unlocked by beating Chapter 3.',
    startingCash: 0.6, incidentRate: 1.7, escalation: 0.6, slaPenalty: 1.5, deliveryTime: 2,
    mistakeChance: 0.12, directorIntensity: 1, forceAutoPause: false, hints: false, scoreMultiplier: 2,
  },
};

export const difficultyOf = (id: DifficultyId): DifficultyDef => DIFFICULTIES[id];
