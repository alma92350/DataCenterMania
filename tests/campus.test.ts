import { at } from '../src/core/time';
import { CAMPUS, FRONTIER } from '../src/data/catalog';
import { boardProfit, boardTargets, buildSite, createCampus, liveSites, siteCostPerDay, siteMix, siteRevenuePerDay, SITE_KINDS, SITE_TIERS } from '../src/sim/campus';
import { applyCommand } from '../src/sim/commands';
import { raiseAlarm } from '../src/sim/alarms';
import { createSandbox, DEFAULT_SANDBOX, SANDBOX_FLOORS, sandboxScore } from '../src/sim/sandbox';
import { advance } from '../src/sim/sim';
import { createGame } from '../src/sim/state';
import { decodeHandover, encodeHandover } from '../src/ui/share';
import { DEFAULT_SETTINGS } from '../src/ui/storage';
import { campusPanel, goalsPanel, handbookSection, pauseMenu, startScreen, alarmsPanel, handoverBox } from '../src/ui/views';
import { dailySpec } from '../src/sim/daily';
import { HANDBOOK } from '../src/data/handbook';
import type { GameState } from '../src/sim/types';
import { autopilot } from './autopilot';
import { measure } from './engagement';

function ch10(seed = 1): GameState {
  const s = createGame('ch10', 'sysadmin', seed);
  s.failuresEnabled = false;
  s.cash = 400000;
  s.campus!.cashAtReview = s.cash;
  return s;
}

describe('sites, latency and the summary model', () => {
  it('only low-latency sites sell inference; far sites sell training', () => {
    expect(siteMix('metro').inference).toBe(CAMPUS.inferenceShare);
    expect(siteMix('harbour').inference).toBe(CAMPUS.inferenceShare);
    expect(siteMix('nordic').inference).toBe(0);
    expect(siteMix('desert').training).toBe(1);
    const s = ch10();
    buildSite(s, 'metro', 'edge');
    buildSite(s, 'nordic', 'edge');
    const [m, n] = s.campus!.sites;
    for (const x of [m!, n!]) {
      x.status = 'live';
      x.util = 0.8;
    }
    expect(siteRevenuePerDay(m!)).toBeGreaterThan(siteRevenuePerDay(n!));
  });

  it('cold climates and cheap power cost less to run than a hot desert city', () => {
    const s = ch10();
    buildSite(s, 'nordic', 'edge');
    buildSite(s, 'metro', 'edge');
    for (const x of s.campus!.sites) {
      x.status = 'live';
      x.util = 0.8;
    }
    const [nordic, metro] = s.campus!.sites;
    expect(siteCostPerDay(s, nordic!)).toBeLessThan(siteCostPerDay(s, metro!));
    s.campus!.power = 'spot';
    s.campus!.spotMult = 1.6;
    expect(siteCostPerDay(s, nordic!)).toBeGreaterThan(Math.round(0.8 * 4 * 0.8 * 700 * 1.15 * 0.8));
  });

  it('building costs capital, takes days, and the site then fills up gradually', () => {
    const s = ch10();
    const cash = s.cash;
    s.progress.firedEvents.push('tenant');
    expect(buildSite(s, 'harbour', 'edge').ok).toBe(true);
    expect(s.cash).toBe(cash - SITE_TIERS.edge.price);
    expect(s.campus!.sites[0]!.status).toBe('building');
    expect(buildSite(s, 'harbour', 'edge')).toEqual({ ok: false, error: 'You already have a site there.' });
    advance(s, SITE_TIERS.edge.days * 1440 + 5);
    expect(liveSites(s)).toHaveLength(1);
    const u0 = liveSites(s)[0]!.util;
    advance(s, 3 * 1440);
    expect(liveSites(s)[0]!.util).toBeGreaterThan(u0);
    const poor = ch10();
    poor.cash = 100;
    expect(buildSite(poor, 'nordic', 'regional').ok).toBe(false);
    expect(applyCommand(createGame('ch9', 'sysadmin', 1), { type: 'buildSite', kind: 'nordic', tier: 'edge' }).ok).toBe(false);
  });

  it('a site earns money every day once live, and the home hall keeps its full simulation', () => {
    const s = ch10();
    buildSite(s, 'harbour', 'edge');
    advance(s, SITE_TIERS.edge.days * 1440 + 5);
    const cash = s.cash;
    advance(s, 3 * 1440);
    expect(s.log.some((l) => l.text.includes('Campus day'))).toBe(true);
    expect(s.cash).not.toBe(cash);
    expect(s.devices.length).toBeGreaterThan(0);
  });
});

describe('goodwill and the moratorium', () => {
  it('thirsty and noisy sites cost goodwill, local staff earn it back, and a fund buys it directly', () => {
    const s = ch10();
    buildSite(s, 'desert', 'edge');
    advance(s, SITE_TIERS.edge.days * 1440 + 5);
    const gw = s.campus!.goodwill;
    advance(s, 2 * 1440);
    expect(s.campus!.goodwill).toBeLessThan(gw);
    const f = s.campus!.goodwill;
    expect(applyCommand(s, { type: 'communityFund' }).ok).toBe(true);
    expect(s.campus!.goodwill).toBe(Math.min(100, f + CAMPUS.communityFundGoodwill));
    expect(applyCommand(s, { type: 'siteStaff', siteId: s.campus!.sites[0]!.id }).ok).toBe(true);
    expect(s.campus!.sites[0]!.staff).toBe(1);
  });

  it('low goodwill brings a moratorium that blocks new builds until it recovers; high goodwill speeds permits', () => {
    const s = ch10();
    s.campus!.goodwill = 10;
    advance(s, 1440 + 5);
    expect(s.campus!.moratorium).toBe(true);
    expect(buildSite(s, 'nordic', 'edge').ok).toBe(false);
    s.campus!.goodwill = 80;
    advance(s, 1440);
    expect(s.campus!.moratorium).toBe(false);
    s.campus!.goodwill = 90;
    buildSite(s, 'nordic', 'edge');
    expect(s.campus!.sites[0]!.readyAt - s.minute).toBe((SITE_TIERS.edge.days - 1) * 1440);
  });

  it('heat reuse in the home hall adds goodwill every day', () => {
    const a = ch10();
    const b = ch10();
    b.site!.heatReuse = true;
    a.campus!.goodwill = 50;
    b.campus!.goodwill = 50;
    advance(a, 1440 + 2);
    advance(b, 1440 + 2);
    expect(b.campus!.goodwill).toBeGreaterThan(a.campus!.goodwill);
  });
});

describe('economy 2.0 and the board', () => {
  it('capex, loans and investors are tracked so the board profit ignores them', () => {
    const s = ch10();
    const base = boardProfit(s);
    buildSite(s, 'harbour', 'edge');
    expect(boardProfit(s)).toBe(base); // capex does not count against profit
    applyCommand(s, { type: 'takeLoan' });
    expect(s.campus!.loan).toBe(CAMPUS.loanPrincipal);
    expect(boardProfit(s)).toBe(base);
    expect(applyCommand(s, { type: 'takeLoan' }).ok).toBe(false);
    expect(applyCommand(s, { type: 'repayLoan' }).ok).toBe(true);
    expect(s.campus!.loan).toBe(0);
    applyCommand(s, { type: 'takeInvestor' });
    expect(s.campus!.investor).toBe(true);
    expect(applyCommand(s, { type: 'takeInvestor' }).ok).toBe(false);
    expect(boardTargets(s)[0]!.label).toContain(Math.round(CAMPUS.boardProfit * CAMPUS.investorTargetMult).toLocaleString('en-US'));
  });

  it('a loan costs interest every day; spot power swings, fixed does not', () => {
    const s = ch10();
    applyCommand(s, { type: 'takeLoan' });
    const cash = s.cash;
    advance(s, 1440);
    expect(s.log.some((l) => l.text.includes('interest'))).toBe(true);
    void cash;
    const seen = new Set<number>();
    applyCommand(s, { type: 'setPowerContract', mode: 'spot' });
    for (let d = 0; d < 6; d++) {
      advance(s, 1440);
      seen.add(s.campus!.spotMult);
    }
    expect(seen.size).toBeGreaterThan(2);
    expect(applyCommand(createGame('ch9', 'sysadmin', 1), { type: 'setPowerContract', mode: 'spot' }).ok).toBe(false);
  });

  it('three targets: all met earns a grant, two is patience, fewer earns a strike, two strikes end the run', () => {
    const s = ch10();
    s.campus!.board.nextDay = 0;
    s.cash += 40000; // profit target met
    advance(s, 1440 + 1);
    const rev = s.campus!.board.reviews[0]!;
    expect(rev.targets).toHaveLength(3);
    expect(rev.met).toBeGreaterThanOrEqual(2);
    const t = ch10(2);
    t.campus!.board.nextDay = 0;
    t.campus!.cashAtReview = t.cash + 1_000_000; // impossible profit
    t.reputation = 3;
    t.stats.criticals = 0;
    for (const c of t.contracts) c.totalMinutes = 1000; // zero ok minutes: uptime target fails
    advance(t, 1440 + 1);
    expect(t.campus!.board.strikes).toBeGreaterThanOrEqual(1);
    t.campus!.board.nextDay = dayOfNow(t);
    t.campus!.cashAtReview = t.cash + 1_000_000;
    advance(t, 1440);
    expect(t.progress.status).toBe('lost');
    expect(t.log.some((l) => l.text.includes('replaced you'))).toBe(true);
  });
});

function dayOfNow(s: GameState): number {
  return Math.floor(s.minute / 1440);
}

describe('incidents at remote sites', () => {
  it('help halves the damage and costs money; a bigger team makes incidents rarer', () => {
    const run = (help: boolean, seed: number) => {
      const s = ch10(seed);
      buildSite(s, 'harbour', 'edge');
      advance(s, SITE_TIERS.edge.days * 1440 + 5);
      const site = s.campus!.sites[0]!;
      site.util = 0.8;
      s.campus!.alerts.push({ id: 'al1', siteId: site.id, day: 0, text: 'x', helped: false });
      site.incident = true;
      if (help) expect(applyCommand(s, { type: 'siteHelp', alertId: 'al1' }).ok).toBe(true);
      const cash = s.cash;
      advance(s, 1440);
      return s.cash - cash;
    };
    expect(run(true, 1)).toBeGreaterThan(run(false, 1) - CAMPUS.helpCost);
    expect(applyCommand(ch10(), { type: 'siteHelp', alertId: 'nope' }).ok).toBe(false);
  });

  it('a tenant leaving a young site depresses its utilisation for days', () => {
    const s = createGame('ch10', 'sysadmin', 3);
    s.failuresEnabled = false;
    s.cash = 300000;
    buildSite(s, 'harbour', 'edge');
    advance(s, at(3, 12) - s.minute);
    const site = s.campus!.sites[0]!;
    expect(site.shockUntil).toBeGreaterThan(s.minute);
  });
});

describe('Chapter 10, eras, Sandbox 2.0', () => {
  it('Chapter 10 has every system, a campus and two board reviews in eight days', () => {
    const s = createGame('ch10', 'sysadmin', 1);
    expect(s.campus).toBeDefined();
    expect(s.features).toEqual(expect.arrayContaining(['campus', 'finance', 'ai', 'liquid', 'crm', 'nights', 'energy']));
    expect(createCampus().board.everyDays).toBe(CAMPUS.boardEveryDays);
    for (const k of Object.keys(SITE_KINDS)) expect(SITE_KINDS[k as keyof typeof SITE_KINDS].latencyMs).toBeGreaterThan(0);
  });

  it('the Campus floor and the speculative Frontier floor are Sandbox options', () => {
    expect(Object.keys(SANDBOX_FLOORS)).toEqual(expect.arrayContaining(['campus', 'frontier']));
    const c = createSandbox({ ...DEFAULT_SANDBOX, floor: 'campus' }, 'sysadmin', 1);
    expect(c.campus).toBeDefined();
    c.campus!.sites.push({ id: 'x', kind: 'nordic', tier: 'edge', mw: 4, status: 'live', readyAt: 0, staff: 0, util: 0.5, capex: 1 });
    expect(sandboxScore(c)).toBeGreaterThanOrEqual(500);
    const f = createSandbox({ ...DEFAULT_SANDBOX, floor: 'frontier' }, 'sysadmin', 1);
    expect(f.frontier!.launchPerKg).toBe(FRONTIER.startPricePerKg);
    expect(f.features).not.toContain('hire');
  });

  it('start screen groups chapters into three eras', () => {
    const extras = { daily: dailySpec('2026-12-03'), dailyBest: null, achievements: {} };
    const html = startScreen({}, DEFAULT_SETTINGS, false, extras);
    expect(html).toContain('Era 1: Cloud warehouse');
    expect(html).toContain('Era 2');
    expect(html).toContain('Era 3');
  });
});

describe('Frontier floor: no technicians, launched spares, a falling price', () => {
  function orbit(): GameState {
    const s = createSandbox({ ...DEFAULT_SANDBOX, floor: 'frontier', cyber: false }, 'sysadmin', 2);
    s.failuresEnabled = false;
    s.cash = 500000;
    return s;
  }

  it('physical work is refused', () => {
    const s = orbit();
    const d = s.devices[0]!;
    d.faults.push('disk');
    expect(applyCommand(s, { type: 'dispatch', job: 'swapDisk', deviceId: d.id, techId: 'best' }).ok).toBe(false);
    expect(applyCommand(s, { type: 'hire', candidateId: 'x' }).ok).toBe(false);
  });

  it('a launched spare fixes a server or a rack for price per kg, and the price falls to a floor', () => {
    const s = orbit();
    const d = s.devices[0]!;
    d.faults.push('psu');
    raiseAlarm(s, 'psu', d.rackId, d.id, 2, 60);
    const cash = s.cash;
    expect(applyCommand(s, { type: 'launchRepair', deviceId: d.id }).ok).toBe(true);
    expect(cash - s.cash).toBe(Math.round(FRONTIER.startPricePerKg * FRONTIER.kgPerRepair));
    expect(d.faults).toEqual([]);
    expect(s.alarms.some((a) => a.deviceId === d.id)).toBe(false);
    expect(alarmsPanel(s)).not.toContain('Launch a spare');
    const before = s.frontier!.launchPerKg;
    advance(s, 3 * 1440);
    expect(s.frontier!.launchPerKg).toBeLessThan(before);
    advance(s, 120 * 1440);
    expect(s.frontier!.launchPerKg).toBe(FRONTIER.floorPricePerKg);
    expect(applyCommand(createGame('ch6', 'sysadmin', 1), { type: 'launchRepair', deviceId: 'd1' }).ok).toBe(false);
  }, 60000);

  it('alarms offer a launch button instead of a technician', () => {
    const s = orbit();
    const d = s.devices[0]!;
    d.faults.push('disk');
    raiseAlarm(s, 'disk', d.rackId, d.id, 1, 60);
    expect(alarmsPanel(s)).toContain('data-action="launchRepair"');
  });
});

describe('hand-over codes', () => {
  it('round-trips a whole game, and a friend can continue it', async () => {
    const s = createGame('ch7', 'sysadmin', 5);
    advance(s, 500);
    const code = await encodeHandover(s);
    expect(code.startsWith('DCM2')).toBe(true);
    expect(code).not.toMatch(/\s/);
    const back = await decodeHandover(code);
    expect(back.minute).toBe(s.minute);
    expect(back.cash).toBe(s.cash);
    advance(back, 120);
    advance(s, 120);
    expect(JSON.stringify(back)).toBe(JSON.stringify(s));
  });

  it('is compact, tolerant of whitespace, and rejects garbage', async () => {
    const s = createGame('ch0', 'sysadmin', 1);
    const code = await encodeHandover(s);
    expect(code.length).toBeLessThan(JSON.stringify(s).length);
    expect((await decodeHandover(`  ${code.slice(0, 30)}\n${code.slice(30)}  `)).seed).toBe(1);
    await expect(decodeHandover('hello')).rejects.toThrow();
    await expect(decodeHandover('DCM2:not-a-real-code')).rejects.toThrow();
  });

  it('the pause menu offers a copy button and the start screen a paste box', () => {
    expect(pauseMenu(createGame('ch1', 'sysadmin', 1), DEFAULT_SETTINGS)).toContain('data-action="copyCode"');
    expect(handoverBox()).toContain('data-action="loadCode"');
    expect(handoverBox()).toContain('id="code-input"');
  });
});

describe('campus UI and Handbook', () => {
  it('shows goodwill, sites to build, the board, finance and incidents', () => {
    const s = ch10();
    let html = campusPanel(s);
    for (const key of ['buildSite', 'takeLoan', 'takeInvestor', 'setPower', 'communityFund']) expect(html).toContain(`data-action="${key}"`);
    expect(html).toContain('Next board review');
    expect(html).not.toMatch(/undefined|NaN/);
    expect(goalsPanel(s)).toContain('Campus');
    buildSite(s, 'harbour', 'edge');
    advance(s, SITE_TIERS.edge.days * 1440 + 5);
    s.campus!.alerts.push({ id: 'al9', siteId: s.campus!.sites[0]!.id, day: 0, text: 'x', helped: false });
    html = campusPanel(s);
    expect(html).toContain('data-action="siteHelp"');
    expect(html).toContain('data-action="siteStaff"');
    s.campus!.moratorium = true;
    expect(campusPanel(s)).toContain('Moratorium');
    expect(campusPanel(createGame('ch9', 'sysadmin', 1))).toBe('');
    expect(handbookSection(['campus', 'finance'])).toContain('Community goodwill');
    expect(HANDBOOK.filter((h) => h.unlock === 'campus' || h.unlock === 'finance').length).toBe(4);
  });
});

describe('Chapter 10 balance', () => {
  it('an expanding bot survives both board reviews with a live site; an idle bot earns no star', () => {
    const play = (campus: 'expand' | 'idle', seed: number) => {
      const s = createGame('ch10', 'sysadmin', seed);
      while (s.progress.status === 'playing') {
        if (s.minute % 5 === 0) autopilot(s, { auto: true, campus });
        advance(s, 1);
      }
      return s;
    };
    const grow = [1, 3].map((seed) => play('expand', seed));
    expect(grow.every((s) => s.progress.status === 'won')).toBe(true);
    expect(grow.every((s) => s.campus!.board.reviews.length >= 2)).toBe(true);
    expect(grow.every((s) => (s.campus!.sites.some((x) => x.status === 'live')))).toBe(true);
    expect(play('idle', 1).progress.status).toBe('lost');
  }, 180000);

  it('keeps the bot engagement guardrails in Chapter 10', () => {
    const m = measure('ch10', 1, 'sysadmin', true);
    expect(m.shiftRealMinutes.every((x) => x >= 3 && x <= 10)).toBe(true);
    expect(m.quietDaytimePct).toBeLessThanOrEqual(70);
  }, 60000);
});
