import { chance, pick } from '../core/rng';
import { hourOf } from '../core/time';
import { WALKINS } from '../data/catalog';
import { CHAPTERS } from '../data/chapters';
import { DIFFICULTIES } from '../data/difficulty';
import { addFx, addLog, newId } from './state';
import { activeContracts } from './selectors';
import type { GameState, Walkin } from './types';

const ASKS = [
  'says a light is blinking oddly on',
  'wants a visual check of their servers in',
  'needs a cable re-seated in',
  'asks for a photo of their kit in',
  'needs a USB stick plugged into a server in',
];

export function spawnWalkin(s: GameState): Walkin | null {
  const contract = pick(s.rng, activeContracts(s).length ? activeContracts(s) : s.contracts);
  const dev = contract ? s.devices.find((d) => d.contractId === contract.id) : undefined;
  const rack = s.racks.find((r) => r.id === dev?.rackId) ?? s.racks[0];
  if (!contract || !rack) return null;
  const w: Walkin = {
    id: newId(s, 'w'), customer: contract.customer, rackId: rack.id,
    text: `${contract.customer} ${pick(s.rng, ASKS)} Rack ${s.racks.indexOf(rack) + 1}`,
    reward: Math.round((WALKINS.baseReward + WALKINS.rewardPerChapter * CHAPTERS[s.chapter].number) * DIFFICULTIES[s.difficulty].startingCash),
    deadline: s.minute + WALKINS.deadlineMin, status: 'open',
  };
  s.walkins.push(w);
  if (s.walkins.length > 20) s.walkins.splice(0, s.walkins.length - 20);
  addLog(s, 'info', `Walk-in request: ${w.text}. $${w.reward} if done within ${WALKINS.deadlineMin} min.`);
  return w;
}

export function completeWalkin(s: GameState, id: string | undefined): void {
  const w = s.walkins.find((x) => x.id === id);
  if (!w || w.status !== 'open') return;
  w.status = 'done';
  s.cash += w.reward;
  s.today.revenue += w.reward;
  s.reputation = Math.min(5, s.reputation + 0.05);
  addFx(s, 'money', w.rackId, w.reward);
  addLog(s, 'success', `${w.customer} is delighted: +$${w.reward}.`);
}

/** Expires overdue requests; spawns new ones in calm daytime (PRD §21.4). */
export function updateWalkins(s: GameState, dt: number): void {
  if (!s.features.includes('walkins')) return;
  for (const w of s.walkins) {
    if (w.status === 'open' && s.minute > w.deadline) {
      w.status = 'expired';
      s.jobs = s.jobs.filter((j) => {
        if (j.walkinId !== w.id) return true;
        const t = s.techs.find((x) => x.id === j.techId);
        if (t && t.jobId === j.id) {
          t.jobId = null;
          t.path = [];
        }
        return false;
      });
      addLog(s, 'info', `${w.customer} gave up waiting.`);
    }
  }
  const h = hourOf(s.minute);
  const calm = !s.alarms.some((a) => a.severity >= 2);
  const open = s.walkins.filter((w) => w.status === 'open').length >= WALKINS.maxOpen;
  if (!open && calm && h >= WALKINS.fromHour && h < WALKINS.toHour && chance(s.rng, dt / WALKINS.meanGapMin)) spawnWalkin(s);
}
