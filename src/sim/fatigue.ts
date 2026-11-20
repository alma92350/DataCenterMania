import { FATIGUE, MORALE } from '../data/catalog';
import { tileAt } from './grid';
import { addLog } from './state';
import type { GameState, Tech } from './types';

const atHome = (s: GameState, t: Tech) => tileAt(s.grid, Math.round(t.pos.x), Math.round(t.pos.y)) === 'noc';

/** Fatigue rises with work, falls with rest in the staff room; morale drifts with fatigue and coffee. */
export function updateFatigue(s: GameState, dt: number): void {
  if (!s.features.includes('fatigue')) return;
  for (const t of s.techs) {
    const job = s.jobs.find((j) => j.id === t.jobId);
    if (job?.stage === 'working') t.fatigue += FATIGUE.workPerMin * dt;
    else if (job || t.path.length) t.fatigue += FATIGUE.walkPerMin * dt;
    else t.fatigue -= (atHome(s, t) ? FATIGUE.restPerMin * (1 + s.coffeeLevel * 0.5) : FATIGUE.idlePerMin) * dt;
    t.fatigue = Math.max(0, Math.min(100, t.fatigue));

    if (!t.onBreak && t.fatigue >= FATIGUE.breakAt && t.role !== 'manager') {
      t.onBreak = true;
      addLog(s, 'info', `${t.name} is exhausted and takes a break in the staff room.`);
    } else if (t.onBreak && t.fatigue <= FATIGUE.backToWorkBelow) {
      t.onBreak = false;
      addLog(s, 'info', `${t.name} is back from the break.`);
    }

    const target = MORALE.base + s.coffeeLevel * MORALE.perCoffee - t.fatigue * MORALE.fatiguePenalty;
    t.morale += (target - t.morale) * Math.min(1, MORALE.driftPerMin * dt);
    t.morale = Math.max(0, Math.min(100, t.morale));
  }
}

/** Work speed multiplier from fatigue and morale. */
export function staminaFactor(t: Tech): number {
  const tired = t.fatigue > FATIGUE.tiredAbove ? FATIGUE.tiredWorkMult : 1;
  const mood = t.morale > 75 ? 1.1 : t.morale < 35 ? 0.9 : 1;
  return tired * mood;
}

export function mistakeFactor(t: Tech): number {
  return t.fatigue > FATIGUE.tiredAbove ? FATIGUE.tiredMistakeMult : 1;
}
