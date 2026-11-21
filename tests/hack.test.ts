import { at } from '../src/core/time';
import { CHAPTERS, CHAPTER_ORDER, EVENT_ORDER } from '../src/data/chapters';
import { createGame } from '../src/sim/state';
import { advance } from '../src/sim/sim';
import { isUnlocked } from '../src/ui/storage';
import { measure } from './engagement';

describe('Hacker Weekend (event)', () => {
  it('is an event off the campaign path, unlocked by Startup Colo, with the cyber layer on', () => {
    expect(EVENT_ORDER).toEqual(['hack']);
    expect(CHAPTER_ORDER).not.toContain('hack');
    expect(CHAPTERS.hack.event).toBe(true);
    expect(CHAPTERS.hack.features).toContain('cyber');
    expect(isUnlocked({}, 'hack')).toBe(false);
    expect(isUnlocked({ ch1: { sysadmin: 3 } }, 'hack')).toBe(false);
    expect(isUnlocked({ ch2: { sysadmin: 1 } }, 'hack')).toBe(true);
  });

  it('runs two shifts, Friday and Saturday, and schedules seven attacks by both villains', () => {
    const ch = CHAPTERS.hack;
    expect(Math.ceil((ch.endMinute - ch.startMinute) / 1440)).toBe(2); // Friday and Saturday
    const attacks = ch.events.flatMap((e) => e.actions).filter((a) => a.type === 'attack');
    expect(attacks).toHaveLength(7);
    expect(new Set(attacks.map((a) => (a.type === 'attack' ? a.kind : ''))).size).toBe(3); // flood, phish and worm
  });

  it('the first attack arrives on Friday at 10:00 and waits for the player', () => {
    const s = createGame('hack', 'sysadmin', 1);
    advance(s, at(4, 9, 59) - s.minute);
    expect(s.cyber.attack).toBeNull();
    advance(s, 2);
    expect(s.cyber.attack?.kind).toBe('flood');
    expect(s.cyber.attack?.villain).toBe('kiddies');
    expect(s.log.some((l) => l.text.includes('Script Kiddies'))).toBe(true);
  });

  it('both villains show up over the weekend', () => {
    const s = createGame('hack', 'sysadmin', 1);
    const seen = new Set<string>();
    while (s.progress.status === 'playing') {
      advance(s, 5);
      if (s.cyber.attack) {
        seen.add(s.cyber.attack.villain);
        s.cyber.attack.expiresAt = s.minute; // let it lapse; this test only watches who comes
      }
    }
    expect(seen).toEqual(new Set(['kiddies', 'phish']));
  });
});

describe('Hacker Weekend balance (bot)', () => {
  it('a bot that only auto-defends still survives the weekend on Sysadmin', () => {
    for (const seed of [1, 2, 3]) {
      const m = measure('hack', seed, 'sysadmin', false, 'auto');
      expect(m.state.progress.status, `seed ${seed}`).toBe('won');
      expect(m.state.cyber.blocked + m.state.cyber.hits).toBeGreaterThanOrEqual(7);
    }
  });

  it('perfect play earns three stars, ignoring the hackers does not', () => {
    const perfect = measure('hack', 1, 'sysadmin', false, 'perfect').state;
    expect(perfect.progress.status).toBe('won');
    expect(perfect.progress.stars).toBe(3);
    const ignored = measure('hack', 1, 'sysadmin', false, 'ignore').state;
    expect(ignored.progress.stars).toBeLessThan(3);
    expect(ignored.cyber.hits).toBeGreaterThanOrEqual(7);
  });

  it('auto-defending alone never earns the mastery star', () => {
    for (const seed of [1, 2, 3]) expect(measure('hack', seed, 'sysadmin', false, 'auto').state.progress.stars).toBeLessThan(3);
  });

  it('the event fits in ten minutes at 1x, and every shift fits a session', () => {
    const m = measure('hack', 1, 'sysadmin', false, 'perfect');
    expect(m.realMinutes).toBeLessThanOrEqual(10);
    expect(m.shiftRealMinutes).toHaveLength(2);
    for (const minutes of m.shiftRealMinutes) expect(minutes).toBeLessThanOrEqual(6);
  });
});
