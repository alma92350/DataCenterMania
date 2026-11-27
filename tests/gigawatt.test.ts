import { CAMPUS } from '../src/data/catalog';
import { boardTargets, buildSite, siteCostPerDay, siteRevenuePerDay, SITE_TIERS } from '../src/sim/campus';
import { advance } from '../src/sim/sim';
import { createGame } from '../src/sim/state';
import { campusPanel } from '../src/ui/views';
import type { GameState } from '../src/sim/types';

function hq(seed = 1): GameState {
  const s = createGame('ch10', 'sysadmin', seed);
  s.failuresEnabled = false;
  s.endMinute = 999_999;
  s.cash = 2_000_000;
  s.campus!.cashAtReview = s.cash;
  s.campus!.board.nextDay = 999; // no board reviews: these tests are about the site itself
  s.progress.firedEvents.push('tenant');
  return s;
}
const first = (s: GameState) => s.campus!.sites[0]!;

describe('gigawatt tier (v2.4)', () => {
  it('is a 1 GW site that costs goodwill to build and needs enough of it', () => {
    const s = hq();
    s.campus!.goodwill = 40;
    expect(buildSite(s, 'nordic', 'gigawatt').ok).toBe(false);
    expect(s.cash).toBe(2_000_000);
    s.campus!.goodwill = 80;
    expect(buildSite(s, 'nordic', 'gigawatt').ok).toBe(true);
    expect(s.cash).toBe(2_000_000 - SITE_TIERS.gigawatt.price);
    expect(s.campus!.goodwill).toBe(80 - SITE_TIERS.gigawatt.goodwillCost!);
    expect(first(s).mw).toBe(1000);
  });

  it('takes longer to build and ramps up slowly', () => {
    const s = hq();
    buildSite(s, 'nordic', 'gigawatt');
    advance(s, SITE_TIERS.edge.days * 1440);
    expect(first(s).status).toBe('building');
    advance(s, (SITE_TIERS.gigawatt.days - SITE_TIERS.edge.days) * 1440 + 5);
    expect(first(s).status).toBe('live');
    const util = first(s).util;
    advance(s, 1440);
    expect(first(s).util - util).toBeLessThan(0.08);
  });

  it('sells wholesale: far more revenue than a regional hub, with a lower rate per MW and a power deal', () => {
    const s = hq();
    buildSite(s, 'nordic', 'gigawatt');
    buildSite(s, 'harbour', 'regional');
    advance(s, 9 * 1440);
    const [g, r] = s.campus!.sites;
    g!.util = r!.util = 0.5;
    expect(siteRevenuePerDay(g!)).toBeGreaterThan(siteRevenuePerDay(r!));
    expect(siteRevenuePerDay(g!) / g!.mw).toBeLessThan(siteRevenuePerDay(r!) / r!.mw);
    expect(siteCostPerDay(s, g!)).toBeGreaterThan(siteCostPerDay(s, r!));
    expect(siteRevenuePerDay(g!)).toBeGreaterThan(siteCostPerDay(s, g!));
  });

  it('drains goodwill every day and raises the board profit target', () => {
    const s = hq();
    s.campus!.goodwill = 80;
    const base = boardTargets(s)[0]!.label;
    buildSite(s, 'nordic', 'gigawatt');
    advance(s, SITE_TIERS.gigawatt.days * 1440 + 5);
    const gw = s.campus!.goodwill;
    advance(s, 2 * 1440);
    expect(s.campus!.goodwill).toBeLessThan(gw);
    expect(boardTargets(s)[0]!.label).not.toBe(base);
    expect(CAMPUS.gigawattBoardMult).toBeGreaterThan(1);
  });

  it('the campus panel offers it, reads in GW, and disables it without goodwill', () => {
    const s = hq();
    s.campus!.goodwill = 40;
    const html = campusPanel(s);
    expect(html).toContain('data-tier="gigawatt"');
    expect(html).toContain('1 GW');
    expect(html).toMatch(/data-tier="gigawatt"[^>]*disabled/);
    expect(html).not.toMatch(/undefined|NaN/);
  });
});
