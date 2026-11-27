import { CAMPUS } from '../src/data/catalog';
import { buildSite, SITE_TIERS } from '../src/sim/campus';
import { advance } from '../src/sim/sim';
import { createGame } from '../src/sim/state';
import { applyVisit, createVisit, VISIT, VISIT_OBJECTIVES, visitResult } from '../src/sim/visit';
import { objectivesFor } from '../src/sim/objectives';
import { campusPanel, endScreen, pauseMenu, visitEnd } from '../src/ui/views';
import { DEFAULT_SETTINGS } from '../src/ui/storage';
import type { GameState } from '../src/sim/types';
import { autopilot } from './autopilot';

function hq(seed = 1): GameState {
  const s = createGame('ch10', 'sysadmin', seed);
  s.failuresEnabled = false;
  s.cash = 400000;
  s.campus!.cashAtReview = s.cash;
  s.progress.firedEvents.push('tenant');
  buildSite(s, 'desert', 'edge');
  advance(s, SITE_TIERS.edge.days * 1440 + 5);
  return s;
}
const site = (s: GameState) => s.campus!.sites[0]!;

function playShift(v: GameState): void {
  while (v.progress.status === 'playing') {
    if (v.minute % 5 === 0) autopilot(v, { auto: true });
    advance(v, 1);
  }
}

describe('site visit: a full hall for one shift', () => {
  it('builds a hall shaped by the site: climate, local team, shared cash, no campus layer', () => {
    const s = hq();
    const desert = createVisit(s, site(s), 7);
    expect(desert.visit).toEqual({ siteId: site(s).id, hqCash: s.cash, startCash: s.cash });
    expect(desert.cash).toBe(s.cash);
    expect(desert.campus).toBeUndefined();
    expect(desert.ambient).toBeGreaterThan(24);
    expect(desert.devices.length).toBeGreaterThan(0);
    expect(desert.features).not.toContain('campus');
    const s2 = hq(2);
    s2.campus!.sites[0]!.staff = 2;
    const staffed = createVisit(s2, s2.campus!.sites[0]!, 7);
    expect(staffed.incidentMult!).toBeLessThan(desert.incidentMult!);
    expect(createVisit(hq(3), { ...site(hq(3)), kind: 'nordic' }, 1).ambient).toBeLessThan(24);
  });

  it('is one shift with its own goals, and the headquarters is untouched while you are away', () => {
    const s = hq();
    const minute = s.minute;
    const v = createVisit(s, site(s), 3);
    expect(objectivesFor(v)).toBe(VISIT_OBJECTIVES);
    advance(v, 600);
    expect(s.minute).toBe(minute);
    expect(v.minute).toBeGreaterThan(minute === v.minute ? -1 : 0);
  });

  it('the result is 0 to 3 stars from uptime, criticals and incidents; a good shift tunes the site up', () => {
    const s = hq(4);
    const v = createVisit(s, site(s), 11);
    playShift(v);
    const res = visitResult(v);
    expect(res.stars).toBeGreaterThanOrEqual(1);
    expect(res.uptime).toBeGreaterThan(90);
    const cash = v.cash;
    const util = site(s).util;
    const gw = s.campus!.goodwill;
    const back = applyVisit(s, v);
    expect(back.stars).toBe(res.stars);
    expect(s.cash).toBe(cash);
    expect(site(s).tunedUntil).toBeGreaterThan(s.minute);
    expect(site(s).util).toBeCloseTo(Math.min(0.9, util + res.stars * VISIT.utilPerStar), 5);
    expect(s.campus!.goodwill).toBeGreaterThanOrEqual(gw);
    expect(s.log.some((l) => l.text.includes('Back from'))).toBe(true);
  }, 60000);

  it('a bad shift earns nothing and leaves the site as it was', () => {
    const s = hq(5);
    const v = createVisit(s, site(s), 12);
    for (const d of v.devices) d.faults.push('hung'); // nobody fixes anything
    advance(v, 800);
    v.progress.status = 'lost';
    expect(visitResult(v).stars).toBe(0);
    const before = site(s).tunedUntil;
    applyVisit(s, v);
    expect(site(s).tunedUntil).toBe(before);
  });

  it('a tuned-up site has far fewer incidents', () => {
    const incidents = (tuned: boolean) => {
      let n = 0;
      for (let seed = 1; seed <= 12; seed++) {
        const s = hq(seed);
        site(s).util = 0.5;
        if (tuned) site(s).tunedUntil = s.minute + 100 * 1440;
        for (let d = 0; d < 20; d++) {
          advance(s, 1440);
          n += s.log.filter((l) => l.text.includes('cooling fault')).length;
          s.log = [];
          s.campus!.alerts = [];
        }
      }
      return n;
    };
    expect(incidents(true)).toBeLessThan(incidents(false));
  }, 120000);
});

describe('calibration: the summary model against the full simulation', () => {
  it('matches the share of days with a critical incident in a full hall to within 10%', () => {
    let days = 0;
    let hit = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const s = createGame('ch4', 'sysadmin', seed);
      s.incidentMult = 1.2; // a site with no local team (staff level 0)
      s.endMinute = 999_999;
      let before = 0;
      for (let d = 0; d < 7; d++) {
        for (let i = 0; i < 1440; i++) {
          if (s.minute % 5 === 0) autopilot(s, { auto: true });
          advance(s, 1);
        }
        days++;
        if (s.stats.criticals > before) hit++;
        before = s.stats.criticals;
      }
    }
    const measured = hit / days;
    expect(Math.abs(CAMPUS.incidentPerDay - measured) / measured).toBeLessThanOrEqual(0.1);
  }, 240000);
});

describe('site visit UI', () => {
  it('live sites offer a visit, the end screen returns to headquarters, the pause menu lets you leave early', () => {
    const s = hq();
    expect(campusPanel(s)).toContain('data-action="visitSite"');
    const v = createVisit(s, site(s), 2);
    v.progress.status = 'won';
    const html = visitEnd(v);
    expect(html).toContain('data-action="returnHq"');
    expect(html).toContain('Site visit over');
    expect(endScreen(v)).toBe(html);
    expect(html).not.toMatch(/undefined|NaN/);
    expect(pauseMenu(v, DEFAULT_SETTINGS)).toContain('data-action="abandonVisit"');
    expect(pauseMenu(s, DEFAULT_SETTINGS)).toContain('data-action="restart"');
  });
});
