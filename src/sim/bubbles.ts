import type { GameState, JobKind, Tech } from './types';

/** Speech bubbles over technicians (PRD §21.9). Deterministic: lines are picked from the job id, never from the RNG. */
export const BUBBLE_LIFE = 25; // game minutes

export type Moment = 'start' | 'done' | 'oops';

const GENERIC: Record<Moment, string[]> = {
  start: ['On it!', 'Let me look…', 'Got it, boss.', 'Hold my coffee.'],
  done: ['Done!', 'All good.', 'Easy.', 'Fixed!'],
  oops: ['Oops…', 'Wait, not that one!', 'Let me redo that.', 'Uh-oh.'],
};

const BY_JOB: Partial<Record<JobKind, Partial<Record<Moment, string[]>>>> = {
  reboot: { start: ['Have you tried turning it off and on?', 'Rebooting…'], done: ['It lives!', 'Back from the dead.'] },
  swapDisk: { start: ['Hot-swapping the disk.', 'Out with the old disk.'], done: ['New disk, who dis?', 'RAID rebuilding.'] },
  replacePsu: { start: ['Pulling the dead PSU.', 'That smells funny…'], done: ['Power is back!', 'Humming again.'] },
  resetBreaker: { start: ['Flipping the breaker…', 'Stand back!'], done: ['Lights on!', 'Breaker reset.'] },
  serviceCooler: { start: ['Swapping the filter.', 'That filter is filthy.'], done: ['Clean air!', 'Fresh filter in.'] },
  repairCooler: { start: ['Opening the cooler…', 'Where is that leak?'], done: ['Cooling again!', 'Chilly.'] },
  replaceSwitch: { start: ['Swapping the switch.', 'Which cable was it?'], done: ['Packets flowing!', 'Link lights green.'] },
  repairUplink: { start: ['Splicing fiber…', 'Steady hands…'], done: ['Fiber is back!', 'Spliced!'] },
  audit: { start: ['Auditing the cables.', 'Who labelled this?!'], done: ['Tidy!', 'Cables checked.'] },
  rotateRack: { start: ['Turning the rack around.', 'Heavy!'], done: ['Aisles aligned.', 'Cool air, hot air, sorted.'] },
  install: { start: ['Racking the server.', 'Rails first…'], done: ['Server racked!', 'Screws tight.'] },
  favor: { start: ['Happy to help!', 'Customer first!'], done: ['Customer happy!', 'Anything else?'] },
};

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function bubbleLine(kind: JobKind, moment: Moment, seed: string): string {
  const pool = BY_JOB[kind]?.[moment] ?? GENERIC[moment];
  return pool[hash(`${seed}:${moment}`) % pool.length]!;
}

/** One bubble per person: a new line replaces the old one. */
export function say(s: GameState, tech: Tech, kind: JobKind, moment: Moment, jobId: string): void {
  s.fx = s.fx.filter((f) => !(f.kind === 'say' && f.techId === tech.id));
  s.fx.push({ id: s.fxSeq++, kind: 'say', rackId: null, amount: 0, minute: s.minute, techId: tech.id, text: bubbleLine(kind, moment, jobId) });
}

export function expireBubbles(s: GameState): void {
  if (s.fx.some((f) => f.kind === 'say' && s.minute - f.minute > BUBBLE_LIFE)) {
    s.fx = s.fx.filter((f) => f.kind !== 'say' || s.minute - f.minute <= BUBBLE_LIFE);
  }
}
