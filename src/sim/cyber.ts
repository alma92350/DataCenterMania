/**
 * Cyber layer (PRD §9, v0.7): cartoon villains attack, the player defends in a 10-second
 * micro-game (or skips it for a half-strength auto-defence), and the result becomes damage.
 *  - Flood (Script Kiddies): traffic overload for a while, hurting every SLA
 *  - Phish (Captain Phish): technicians locked out of their accounts; a bad phish brings the worm
 *  - Worm: infected racks are quarantined (servers down) until someone cleans and re-images them
 */
import { chance, pick, randInt } from '../core/rng';
import { DIFFICULTIES } from '../data/difficulty';
import { clearAlarms, escalationDelay, raiseAlarm } from './alarms';
import { PHISH_COUNT } from './minigames';
import { addLog, newId } from './state';
import type { Attack, AttackKind, GameState, Tech, Villain } from './types';

export const CYBER = {
  windowMin: 120, // how long an attack waits for a response before it lands at full strength
  lockMin: 120, // a phished technician is locked out this long
  followUpMin: 45, // a successful phish brings the worm this much later
  bounty: 400, // bug bounty for spotting every phishing email
  floodMinutes: 75,
  floodMax: 0.9, // extra traffic at zero defence
  blockedAt: 0.7, // a score at or above this counts as "blocked"
  perfectAt: 0.9,
  randomPerDay: 3, // average attacks per day in Sandbox with cyber on
  maxIgnoredShare: 0.7,
} as const;

/** Auto-defend (skipping the micro-game) always works at half effect. */
export const AUTO_SCORE = 0.5;

export const TAUNTS: Record<Villain, string[]> = {
  kiddies: ['Your firewall is a joke! — Script Kiddies', 'lol n00bs, prepare to be flooded! — Script Kiddies', 'We saw your admin password. It was "admin". — Script Kiddies'],
  phish: ['Ahoy! Fancy a free coffee machine licence? Just click here… — Captain Phish', 'Yarr, your password be mine! — Captain Phish', 'Nothing to see here, matey. Open the attachment. — Captain Phish'],
};

export const VILLAIN_NAME: Record<Villain, string> = { kiddies: 'Script Kiddies', phish: 'Captain Phish' };

export const KIND_NAME: Record<AttackKind, string> = { flood: 'Traffic flood', phish: 'Phishing campaign', worm: 'Worm outbreak' };

export const villainFor = (kind: AttackKind): Villain => (kind === 'phish' ? 'phish' : 'kiddies');

export const attackPending = (s: GameState): boolean => s.cyber.attack !== null;

/** Is this person locked out of their account (phished)? */
export const isLocked = (s: GameState, t: Tech): boolean => (t.lockedUntil ?? 0) > s.minute;

export function launchAttack(s: GameState, kind: AttackKind, villain: Villain = villainFor(kind)): Attack | null {
  if (!s.features.includes('cyber')) return null;
  if (s.cyber.attack) {
    s.cyber.queue.push({ kind, villain });
    return null;
  }
  // worm targets: racks with servers, padded with office machines so there is always a network to cut
  const real = s.racks.filter((r) => s.devices.some((d) => d.rackId === r.id)).slice(0, 9).map((r) => r.id);
  const rackIds: (string | null)[] = [...real];
  while (rackIds.length < 5) rackIds.push(null);
  const attack: Attack = {
    id: newId(s, 'atk'), kind, villain, startedAt: s.minute, expiresAt: s.minute + CYBER.windowMin,
    payload: { seed: randInt(s.rng, 1, 1_000_000_000), rackIds },
  };
  s.cyber.attack = attack;
  addLog(s, 'alarm', `🛡️ ${KIND_NAME[kind]} from ${VILLAIN_NAME[villain]}! ${pick(s.rng, TAUNTS[villain])}`);
  s.attention = { severity: 3, text: `${KIND_NAME[kind]}: ${VILLAIN_NAME[villain]} is attacking!`, kind: 'attack' };
  return attack;
}

function infectRack(s: GameState, rackId: string): void {
  let any = false;
  for (const d of s.devices) {
    if (d.rackId !== rackId) continue;
    if (!d.faults.includes('malware')) d.faults.push('malware');
    any = true;
  }
  if (any) raiseAlarm(s, 'malware', rackId, null, 2, escalationDelay(s, 2));
}

export function clearMalware(s: GameState, rackId: string): void {
  for (const d of s.devices) if (d.rackId === rackId) d.faults = d.faults.filter((f) => f !== 'malware');
  clearAlarms(s, (a) => a.kind === 'malware' && a.rackId === rackId);
}

export type Mode = 'played' | 'auto' | 'ignored';

/** Applies the outcome of the pending attack and starts the next queued one. */
export function resolveAttack(s: GameState, rawScore: number, mode: Mode, infected?: number[]): void {
  const attack = s.cyber.attack;
  if (!attack) return;
  const score = mode === 'auto' ? AUTO_SCORE : mode === 'ignored' ? 0 : Math.max(0, Math.min(1, rawScore));
  const name = KIND_NAME[attack.kind];
  const hold = score >= CYBER.blockedAt;

  switch (attack.kind) {
    case 'flood': {
      const strength = CYBER.floodMax * (1 - score);
      if (strength > 0.05) {
        s.floodUntil = s.minute + CYBER.floodMinutes;
        s.floodStrength = Math.max(s.minute < s.floodUntil - CYBER.floodMinutes ? 0 : s.floodStrength, strength);
        addLog(s, 'fail', `The flood got through: ${Math.round(strength * 100)}% extra traffic for ${CYBER.floodMinutes} minutes.`);
      } else addLog(s, 'success', 'Flood blocked! The bots went home.');
      break;
    }
    case 'phish': {
      const wrong = Math.max(0, Math.min(PHISH_COUNT, Math.round((1 - score) * PHISH_COUNT)));
      const pool = s.techs.filter((t) => t.role !== 'manager' && !isLocked(s, t));
      for (let i = 0; i < wrong && pool.length; i++) {
        const t = pool.splice(randInt(s.rng, 0, pool.length - 1), 1)[0]!;
        t.lockedUntil = s.minute + CYBER.lockMin;
        addLog(s, 'fail', `${t.name} clicked the link! Locked out of their account for ${CYBER.lockMin / 60} hours.`);
      }
      if (wrong > 0) {
        s.cyber.followUp = { at: s.minute + CYBER.followUpMin, kind: 'worm', villain: 'phish' };
        addLog(s, 'alarm', 'Captain Phish is inside the network… expect trouble soon.');
      } else {
        s.cash += CYBER.bounty;
        s.reputation = Math.min(5, s.reputation + 0.05);
        addLog(s, 'success', `Every email spotted! Captain Phish walks the plank. Bug bounty: +$${CYBER.bounty}.`);
      }
      break;
    }
    case 'worm': {
      const real = attack.payload.rackIds.map((id, i) => ({ id, i })).filter((x): x is { id: string; i: number } => x.id !== null);
      let hit: string[];
      if (mode === 'played' && infected) hit = real.filter((x) => infected.includes(x.i)).map((x) => x.id);
      else {
        const count = Math.min(Math.round((1 - score) * real.length), mode === 'ignored' ? Math.ceil(CYBER.maxIgnoredShare * real.length) : real.length);
        const bag = [...real];
        hit = [];
        for (let i = 0; i < count; i++) hit.push(bag.splice(randInt(s.rng, 0, bag.length - 1), 1)[0]!.id);
      }
      for (const id of hit) infectRack(s, id);
      if (hit.length) addLog(s, 'fail', `Worm outbreak: ${hit.length} rack${hit.length > 1 ? 's' : ''} quarantined. Clean and re-image them.`);
      else addLog(s, 'success', 'Worm contained! Not a single server infected.');
      break;
    }
  }

  if (hold) {
    s.cyber.blocked++;
    s.reputation = Math.min(5, s.reputation + 0.03);
  } else {
    s.cyber.hits++;
    s.reputation = Math.max(0, s.reputation - 0.1);
  }
  if (mode === 'played' && score >= CYBER.perfectAt) s.cyber.perfect++;
  s.cyber.history.push({ kind: attack.kind, score, mode, minute: s.minute });
  if (s.cyber.history.length > 40) s.cyber.history.shift();
  s.cyber.attack = null;
  void name;
  const next = s.cyber.queue.shift();
  if (next) launchAttack(s, next.kind, next.villain);
}

/** Per game minute: lapse unanswered attacks, run follow-ups and (in Sandbox) random attacks. */
export function updateCyber(s: GameState): void {
  if (!s.features.includes('cyber')) return;
  const c = s.cyber;
  if (c.attack && s.minute >= c.attack.expiresAt) {
    addLog(s, 'fail', `You did not respond to ${VILLAIN_NAME[c.attack.villain]} in time!`);
    resolveAttack(s, 0, 'ignored');
  }
  if (c.followUp && s.minute >= c.followUp.at) {
    const f = c.followUp;
    c.followUp = null;
    launchAttack(s, f.kind, f.villain);
  }
  if (!c.attack && c.queue.length) {
    const next = c.queue.shift()!;
    launchAttack(s, next.kind, next.villain);
  }
  if (s.cyberRandom && !c.attack && !c.queue.length && !c.followUp) {
    const ramp = 1 + (s.rampPerDay ?? 0) * Math.floor(s.minute / 1440);
    const rate = (CYBER.randomPerDay / 1440) * DIFFICULTIES[s.difficulty].incidentRate * (s.incidentMult ?? 1) * ramp;
    if (chance(s.rng, rate)) launchAttack(s, pick(s.rng, ['flood', 'flood', 'phish', 'phish', 'worm'] as const));
  }
}
