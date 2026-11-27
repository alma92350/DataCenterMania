// @vitest-environment happy-dom
import { createGame } from '../src/sim/state';
import { ACHIEVEMENTS, earnedAchievements } from '../src/sim/achievements';
import { buildSite } from '../src/sim/campus';
import { advance } from '../src/sim/sim';
import { FR } from '../src/ui/i18n';
import type { ChapterId, GameState } from '../src/sim/types';

const won = (ch: ChapterId): GameState => {
  const s = createGame(ch, 'sysadmin', 1);
  s.progress.status = 'won';
  s.progress.stars = 1;
  return s;
};
const got = (s: GameState) => earnedAchievements(s, {});

describe('achievements for the v1.x and v2.x chapters (v2.8)', () => {
  it('every one has French text', () => {
    for (const a of ACHIEVEMENTS) {
      expect([a.name, a.name in FR]).toEqual([a.name, true]);
      expect([a.description, a.description in FR]).toEqual([a.description, true]);
    }
  });

  it('Green Machine needs a site and a low average PUE', () => {
    const s = won('ch7');
    s.site!.itKwh = 100;
    s.site!.facKwh = 130;
    expect(got(s)).toContain('greenMachine');
    s.site!.facKwh = 160;
    expect(got(s)).not.toContain('greenMachine');
    expect(got(won('ch2'))).not.toContain('greenMachine');
  });

  it('Circular Economy needs free cooling, heat reuse and renewable power together', () => {
    const s = createGame('ch7', 'sysadmin', 1);
    Object.assign(s.site!, { economizer: true, heatReuse: true, renewable: false });
    expect(got(s)).not.toContain('circularEconomy');
    s.site!.renewable = true;
    expect(got(s)).toContain('circularEconomy');
  });

  it('The Lights Stayed On needs an outage and no blackout; By the Book needs five clean changes', () => {
    const s = createGame('ch5', 'sysadmin', 1);
    expect(got(s)).not.toContain('lightsStayedOn');
    s.stats.outages = 1;
    s.stats.blackoutMin = 0;
    expect(got(s)).toContain('lightsStayedOn');
    s.stats.blackoutMin = 3;
    expect(got(s)).not.toContain('lightsStayedOn');
    s.stats.changeDone = 5;
    s.stats.changeFailed = 0;
    expect(got(s)).toContain('byTheBook');
    s.stats.changeFailed = 1;
    expect(got(s)).not.toContain('byTheBook');
  });

  it('Cool Commander needs a perfect incident score', () => {
    const s = createGame('ch9', 'sysadmin', 1);
    s.incidentScores = [2, 1];
    expect(got(s)).not.toContain('coolCommander');
    s.incidentScores.push(3);
    expect(got(s)).toContain('coolCommander');
  });

  it('Good Neighbour, World Tour and the gigawatt one come from the campus', () => {
    const s = won('ch10');
    s.failuresEnabled = false;
    s.endMinute = 999_999;
    s.cash = 5_000_000;
    s.campus!.board.nextDay = 999;
    s.campus!.goodwill = 90;
    expect(got(s)).toContain('goodNeighbour');
    s.campus!.moratorium = true;
    expect(got(s)).not.toContain('goodNeighbour');
    s.campus!.moratorium = false;
    s.progress.status = 'playing';
    for (const k of ['nordic', 'metro', 'desert', 'harbour'] as const) buildSite(s, k, k === 'nordic' ? 'gigawatt' : 'edge');
    advance(s, 9 * 1440);
    s.campus!.goodwill = 90;
    expect(got(s)).toEqual(expect.arrayContaining(['worldTour', 'gigawatt']));
  });
});
