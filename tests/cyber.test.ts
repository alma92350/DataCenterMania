import { at } from '../src/core/time';
import { createGame } from '../src/sim/state';
import { step } from '../src/sim/sim';
import { applyCommand } from '../src/sim/commands';
import { updateTechs } from '../src/sim/jobs';
import { launchAttack, AUTO_SCORE, CYBER } from '../src/sim/cyber';
import { updateDemand } from '../src/sim/demand';
import { deviceUp } from '../src/sim/selectors';
import { serialize, deserialize } from '../src/sim/save';
import { CHAPTERS } from '../src/data/chapters';
import type { GameState } from '../src/sim/types';

function cyberGame(ch: GameState['chapter'] = 'ch2'): GameState {
  const s = createGame(ch, 'sysadmin', 1);
  s.failuresEnabled = false;
  s.progress.firedEvents = ['*all*'];
  s.features.push('cyber');
  s.minute = at(0, 10);
  return s;
}

const resolve = (s: GameState, score: number, extra: object = {}) =>
  applyCommand(s, { type: 'resolveAttack', score, mode: 'played', ...extra } as never);

describe('attack lifecycle', () => {
  it('needs the cyber feature; otherwise nothing happens', () => {
    const s = createGame('ch2', 'sysadmin', 1);
    expect(launchAttack(s, 'flood')).toBeNull();
    expect(s.cyber.attack).toBeNull();
  });

  it('flags attention for the sound and shake, but never asks to auto-pause (the prompt pauses by itself)', () => {
    const s = cyberGame();
    launchAttack(s, 'flood');
    expect(s.attention?.kind).toBe('attack');
  });

  it('launches one pending attack at a time, queues the rest, and flags attention', () => {
    const s = cyberGame();
    const a = launchAttack(s, 'flood')!;
    expect(a.villain).toBe('kiddies');
    expect(a.expiresAt).toBe(s.minute + CYBER.windowMin);
    expect(a.payload.rackIds.length).toBeGreaterThanOrEqual(3);
    expect(s.attention?.severity).toBe(3);
    expect(launchAttack(s, 'phish')).toBeNull();
    expect(s.cyber.queue).toHaveLength(1);
    resolve(s, 1);
    expect(s.cyber.attack?.kind).toBe('phish'); // the queued one starts when the first is dealt with
    expect(s.cyber.attack?.villain).toBe('phish');
  });

  it('an ignored attack hits at full strength when its window closes', () => {
    const s = cyberGame();
    launchAttack(s, 'flood');
    for (let i = 0; i < CYBER.windowMin + 2; i++) step(s);
    expect(s.cyber.attack).toBeNull();
    expect(s.cyber.hits).toBe(1);
    expect(s.floodStrength).toBeGreaterThan(0.5);
  });

  it('validates the resolve command', () => {
    const s = cyberGame();
    expect(resolve(s, 1).ok).toBe(false); // nothing pending
    launchAttack(s, 'flood');
    expect(applyCommand(s, { type: 'resolveAttack', score: Number.NaN, mode: 'played' }).ok).toBe(false);
    expect(resolve(s, 7).ok).toBe(true); // clamped to 1
    expect(s.cyber.blocked).toBe(1);
  });

  it('auto-defend is capped at half effect, and a perfect played game is counted separately', () => {
    const s = cyberGame();
    launchAttack(s, 'flood');
    applyCommand(s, { type: 'resolveAttack', score: 1, mode: 'auto' });
    expect(s.cyber.history[0]!.score).toBe(AUTO_SCORE);
    expect(s.cyber.perfect).toBe(0);
    launchAttack(s, 'flood');
    resolve(s, 0.95);
    expect(s.cyber.perfect).toBe(1);
    expect(s.cyber.blocked).toBe(1); // 0.5 is not enough to count as blocked
    expect(s.cyber.hits).toBe(1);
  });
});

describe('flood', () => {
  it('a blocked flood does nothing; an unblocked one overloads customers for a while', () => {
    const calm = cyberGame();
    launchAttack(calm, 'flood');
    resolve(calm, 1);
    expect(calm.floodStrength).toBe(0);

    const s = cyberGame();
    const c = s.contracts.find((x) => x.status === 'active')!;
    // give the customer exactly enough servers for normal demand
    s.minute = at(0, 13);
    updateDemand(s, 1);
    expect(c.okMinutesToday).toBe(c.minutesToday);
    launchAttack(s, 'flood');
    resolve(s, 0);
    expect(s.floodStrength).toBeGreaterThan(0.5);
    expect(s.floodUntil).toBeGreaterThan(s.minute);
    const before = c.minutesToday - c.okMinutesToday;
    for (let i = 0; i < 20; i++) {
      s.minute++;
      updateDemand(s, 1);
    }
    expect(c.minutesToday - c.okMinutesToday).toBeGreaterThan(before); // SLA minutes were lost
    s.minute = s.floodUntil + 10;
    const missed = c.minutesToday - c.okMinutesToday;
    updateDemand(s, 1);
    expect(c.minutesToday - c.okMinutesToday).toBe(missed); // over: back to normal
  });
});

describe('phishing', () => {
  it('every wrong answer locks a technician out of their account for a while', () => {
    const s = cyberGame('ch3');
    while (s.candidates.length) applyCommand(s, { type: 'hire', candidateId: s.candidates[0]!.id });
    launchAttack(s, 'phish');
    resolve(s, 1 / 3); // 2 of 3 wrong
    const locked = s.techs.filter((t) => (t.lockedUntil ?? 0) > s.minute);
    expect(locked).toHaveLength(2);
    expect(locked.every((t) => t.role !== 'manager')).toBe(true);
    expect(locked.every((t) => (t.lockedUntil ?? 0) === s.minute + CYBER.lockMin)).toBe(true);
  });

  it('a locked tech takes no jobs until the lock ends', () => {
    const s = cyberGame();
    const hw = s.techs.find((t) => t.role === 'hw')!;
    hw.lockedUntil = s.minute + 100;
    s.devices[0]!.faults.push('hung');
    const res = applyCommand(s, { type: 'dispatch', job: 'reboot', deviceId: s.devices[0]!.id, techId: hw.id });
    expect(res.ok).toBe(false);
    expect((res as { error: string }).error).toMatch(/locked/i);
    // 'best' falls back to the manager while the specialist is locked out
    expect(applyCommand(s, { type: 'dispatch', job: 'reboot', deviceId: s.devices[0]!.id, techId: 'best' }).ok).toBe(true);
    expect(s.jobs[0]!.techId).toBe('manager');
    s.jobs = [];
    s.techs.forEach((t) => (t.jobId = null));
    s.minute += 101;
    expect(applyCommand(s, { type: 'dispatch', job: 'reboot', deviceId: s.devices[0]!.id, techId: hw.id }).ok).toBe(true);
  });

  it('getting phished brings the worm in a little later; spotting every email earns a bounty', () => {
    const s = cyberGame();
    launchAttack(s, 'phish');
    resolve(s, 0);
    expect(s.cyber.followUp?.kind).toBe('worm');
    for (let i = 0; i < CYBER.followUpMin + 2; i++) step(s);
    expect(s.cyber.attack?.kind).toBe('worm');
    expect(s.cyber.attack?.villain).toBe('phish');

    const t = cyberGame();
    const cash = t.cash;
    const rep = t.reputation;
    launchAttack(t, 'phish');
    resolve(t, 1);
    expect(t.cash).toBe(cash + CYBER.bounty);
    expect(t.reputation).toBeGreaterThan(rep);
    expect(t.cyber.followUp).toBeNull();
  });
});

describe('malware', () => {
  it('infected racks quarantine their servers and raise a malware alarm per rack', () => {
    const s = cyberGame('ch3');
    launchAttack(s, 'worm');
    const rackIds = s.cyber.attack!.payload.rackIds;
    resolve(s, 0.5, { infected: [0, 1] });
    const infected = rackIds.slice(0, 2);
    for (const id of infected) {
      const devs = s.devices.filter((d) => d.rackId === id);
      expect(devs.length).toBeGreaterThan(0);
      expect(devs.every((d) => d.faults.includes('malware') && !deviceUp(s, d))).toBe(true);
      expect(s.alarms.some((a) => a.kind === 'malware' && a.rackId === id)).toBe(true);
    }
    expect(s.devices.filter((d) => !infected.includes(d.rackId)).every((d) => !d.faults.includes('malware'))).toBe(true);
  });

  it('a clean-and-re-image job fixes the whole rack', () => {
    const s = cyberGame('ch3');
    launchAttack(s, 'worm');
    const rackId = s.cyber.attack!.payload.rackIds[0]!;
    resolve(s, 0.8, { infected: [0] });
    expect(applyCommand(s, { type: 'dispatch', job: 'reimage', rackId: s.racks[1]!.id, techId: 'best' }).ok).toBe(false); // clean rack
    expect(applyCommand(s, { type: 'dispatch', job: 'reimage', rackId, techId: 'best' }).ok).toBe(true);
    expect(applyCommand(s, { type: 'dispatch', job: 'reimage', rackId, techId: 'best' }).ok).toBe(false); // already on it
    for (let m = 0; m < 600 && s.jobs.length; m++) {
      updateTechs(s, 1);
      s.minute++;
    }
    expect(s.devices.filter((d) => d.rackId === rackId).every((d) => !d.faults.includes('malware'))).toBe(true);
    expect(s.alarms.some((a) => a.kind === 'malware')).toBe(false);
  });

  it('auto-defend infects roughly half of the targets the player did not protect', () => {
    const s = cyberGame('ch3');
    launchAttack(s, 'worm');
    const n = s.cyber.attack!.payload.rackIds.filter(Boolean).length;
    applyCommand(s, { type: 'resolveAttack', score: 1, mode: 'auto' });
    const sick = new Set(s.devices.filter((d) => d.faults.includes('malware')).map((d) => d.rackId));
    expect(sick.size).toBe(Math.round((1 - AUTO_SCORE) * n));
  });

  it('a perfectly cut spread leaves everything clean', () => {
    const s = cyberGame('ch3');
    launchAttack(s, 'worm');
    resolve(s, 1, { infected: [] });
    expect(s.devices.some((d) => d.faults.includes('malware'))).toBe(false);
  });
});

describe('scripted and random attacks', () => {
  it('chapter events can launch attacks', () => {
    const s = cyberGame();
    s.progress.firedEvents = [];
    const ev = { id: 'x', at: s.minute, actions: [{ type: 'attack' as const, kind: 'flood' as const }] };
    CHAPTERS.ch2.events.push(ev);
    step(s);
    CHAPTERS.ch2.events.pop();
    expect(s.cyber.attack?.kind).toBe('flood');
  });

  it('random attacks happen only when switched on, deterministically by seed', () => {
    const run = (on: boolean) => {
      const s = cyberGame();
      s.cyberRandom = on;
      s.failuresEnabled = true;
      const kinds: string[] = [];
      for (let m = 0; m < 1440 * 6; m++) {
        step(s);
        if (s.cyber.attack) {
          kinds.push(`${s.cyber.attack.kind}@${s.minute}`);
          applyCommand(s, { type: 'resolveAttack', score: 1, mode: 'auto' });
        }
      }
      return kinds;
    };
    expect(run(false)).toEqual([]);
    const a = run(true);
    expect(a.length).toBeGreaterThanOrEqual(3);
    expect(a).toEqual(run(true));
  });
});

describe('saves', () => {
  it('older saves get the cyber defaults', () => {
    const s = createGame('ch2', 'sysadmin', 3);
    const old = JSON.parse(serialize(s));
    old.version = 5;
    delete old.cyber;
    delete old.floodUntil;
    delete old.floodStrength;
    for (const t of old.techs) delete t.lockedUntil;
    const loaded = deserialize(JSON.stringify(old));
    expect(loaded.cyber.attack).toBeNull();
    expect(loaded.cyber.blocked).toBe(0);
    expect(loaded.floodStrength).toBe(0);
  });
});
