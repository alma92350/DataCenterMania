import { createGame } from '../src/sim/state';
import { ACHIEVEMENTS, earnedAchievements, careerTitle } from '../src/sim/achievements';
import { Persistence, type KeyValueStore } from '../src/ui/storage';
import type { GameState } from '../src/sim/types';

class MemoryStore implements KeyValueStore {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

function won(ch: GameState['chapter'], stars = 1, diff: GameState['difficulty'] = 'sysadmin'): GameState {
  const s = createGame(ch, diff, 1);
  s.progress.status = 'won';
  s.progress.stars = stars;
  return s;
}

describe('achievements', () => {
  it('has a dozen-plus distinct achievements with names and icons', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(12);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    for (const a of ACHIEVEMENTS) expect(a.name && a.icon && a.description).toBeTruthy();
  });

  it('nothing is earned by just starting a game', () => {
    expect(earnedAchievements(createGame('ch1', 'sysadmin', 1), {})).toEqual([]);
  });

  it('awards chapter, skill and quirky achievements from the game state', () => {
    const s = won('ch0', 3);
    s.stats.peakTemp = 30;
    s.stats.resolved = 2;
    const got = earnedAchievements(s, {});
    expect(got).toContain('closetSurvivor');
    expect(got).toContain('coolHead');
    expect(got).toContain('firstFix');

    const t = won('ch1');
    t.projects = ['cableTidy', 'labels', 'firmware'];
    t.stats.walkinsDone = 10;
    t.stats.reboots = 5;
    const got2 = earnedAchievements(t, {});
    expect(got2).toEqual(expect.arrayContaining(['cableWhisperer', 'customerDarling', 'itWasDns']));
  });

  it('nightmare and architect need the right conditions', () => {
    expect(earnedAchievements(won('ch2', 1, 'nightmare'), {})).toContain('onCallLegend');
    expect(earnedAchievements(won('ch2'), {})).not.toContain('onCallLegend');
    const all3 = { ch0: { sysadmin: 3 }, ch1: { senior: 3 }, ch2: { sysadmin: 3 }, ch3: { intern: 3 } };
    expect(earnedAchievements(won('ch3', 3), all3)).toContain('architect');
  });

  it('a Daily Challenge does not count as a chapter win', () => {
    const s = won('ch2');
    s.dailyId = '2026-12-03';
    const got = earnedAchievements(s, {});
    expect(got).toContain('dailyGrind');
    expect(got).not.toContain('lean');
  });

  it('lost games still count skill moments, but not wins', () => {
    const s = createGame('ch0', 'sysadmin', 1);
    s.progress.status = 'lost';
    s.stats.resolved = 1;
    const got = earnedAchievements(s, {});
    expect(got).toContain('firstFix');
    expect(got).not.toContain('closetSurvivor');
  });
});

describe('career title', () => {
  it('grows with total stars, and CTO needs a nightmare win', () => {
    expect(careerTitle({}).title).toBe('Intern');
    expect(careerTitle({ ch0: { sysadmin: 3 } }).title).toBe('Junior Sysadmin');
    expect(careerTitle({ ch0: { sysadmin: 3 }, ch1: { sysadmin: 3 } }).title).toBe('Sysadmin');
    const twelve = { ch0: { sysadmin: 3 }, ch1: { sysadmin: 3 }, ch2: { sysadmin: 3 }, ch3: { sysadmin: 3 } };
    expect(careerTitle(twelve).title).toBe('Architect');
    expect(careerTitle({ ...twelve, ch3: { sysadmin: 3, nightmare: 1 } }).title).toBe('CTO');
    expect(careerTitle({}).next).toBe('Junior Sysadmin');
    expect(careerTitle({}).starsToNext).toBe(3);
  });
});

describe('achievement persistence', () => {
  it('unlocks once and reports only new ones', () => {
    const p = new Persistence(new MemoryStore());
    expect(p.unlockAchievements(['firstFix', 'coolHead'])).toEqual(['firstFix', 'coolHead']);
    expect(p.unlockAchievements(['firstFix', 'architect'])).toEqual(['architect']);
    expect(Object.keys(p.loadAchievements()).sort()).toEqual(['architect', 'coolHead', 'firstFix']);
  });
});
