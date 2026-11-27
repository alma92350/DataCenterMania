import { chance, randInt, rand } from '../core/rng';
import { dayOf } from '../core/time';
import { CAMPUS, FRONTIER } from '../data/catalog';
import { addLog, newId, showTip } from './state';
import { overallUptimePct } from './selectors';
import { pueAverage } from './site';
import type { Campus, CampusSite, GameState, SiteKind, SiteTier } from './types';

export const SITE_KINDS: Record<SiteKind, { name: string; blurb: string; pue: number; power: number; latencyMs: number; water: number }> = {
  nordic: { name: 'Nordic Fjord', blurb: 'Cold air and cheap hydro power, far from the cities.', pue: 1.15, power: 0.8, latencyMs: 38, water: 0 },
  metro: { name: 'Metro Edge', blurb: 'In the city: low latency for inference, dear power, noisy neighbours.', pue: 1.5, power: 1.3, latencyMs: 6, water: -1 },
  desert: { name: 'Desert Solar', blurb: 'Plenty of sun and cheap power, hot air and thirsty cooling.', pue: 1.7, power: 0.6, latencyMs: 45, water: -3 },
  harbour: { name: 'Harbour Hub', blurb: 'A fibre landing station: good latency and mild weather.', pue: 1.35, power: 1.0, latencyMs: 14, water: -1 },
};

export interface TierDef {
  name: string;
  mw: number;
  price: number;
  days: number;
  /** Gigawatt tier (v2.4): needs community goodwill, spends some, drains it daily, ramps slowly, sells wholesale. */
  minGoodwill?: number;
  goodwillCost?: number;
  goodwillPerDay?: number;
  rampPerDay?: number;
  rateMult?: number;
  powerMult?: number;
}

export const SITE_TIERS: Record<SiteTier, TierDef> = {
  edge: { name: 'Edge node', mw: 4, price: 50_000, days: 3 },
  enterprise: { name: 'Enterprise hall', mw: 12, price: 110_000, days: 4 },
  regional: { name: 'Regional hub', mw: 40, price: 250_000, days: 5 },
  gigawatt: { name: 'Gigawatt campus', mw: 1000, price: 600_000, days: 8, minGoodwill: 60, goodwillCost: 15, goodwillPerDay: -2, rampPerDay: 0.04, rateMult: 0.15, powerMult: 0.25 },
};

export function createCampus(): Campus {
  return {
    sites: [], goodwill: CAMPUS.startGoodwill, loan: 0, investor: false, power: 'fixed', spotMult: 1,
    board: { everyDays: CAMPUS.boardEveryDays, nextDay: CAMPUS.boardEveryDays, strikes: 0, reviews: [] },
    flows: { capex: 0, proceeds: 0, repaid: 0, grants: 0 }, cashAtReview: 0, alerts: [], depreciationToday: 0, moratorium: false,
  };
}

export const liveSites = (s: GameState): CampusSite[] => (s.campus?.sites ?? []).filter((x) => x.status === 'live');

/** Latency decides what a site can sell: inference needs a nearby city (PRD v2 addendum P7). */
export function siteMix(kind: SiteKind): { training: number; inference: number } {
  const inference = SITE_KINDS[kind].latencyMs <= CAMPUS.inferenceLatencyMs ? CAMPUS.inferenceShare : 0;
  return { training: 1 - inference, inference };
}

export function siteRevenuePerDay(site: CampusSite): number {
  const mix = siteMix(site.kind);
  const rate = mix.training * CAMPUS.trainingRate + mix.inference * CAMPUS.inferenceRate;
  return Math.round(site.mw * site.util * rate * (SITE_TIERS[site.tier].rateMult ?? 1));
}

export function siteCostPerDay(s: GameState, site: CampusSite): number {
  const k = SITE_KINDS[site.kind];
  const power = site.mw * site.util * CAMPUS.powerPerMwDay * k.pue * k.power * (SITE_TIERS[site.tier].powerMult ?? 1) * (s.campus?.power === 'spot' ? s.campus.spotMult : 1);
  return Math.round(power + CAMPUS.staffPerDay * (site.staff + 1) + site.mw * CAMPUS.rentPerMwDay);
}

export const campusBuildable = (s: GameState): boolean => !!s.campus && !s.campus.moratorium;

export function buildSite(s: GameState, kind: SiteKind, tier: SiteTier): { ok: true } | { ok: false; error: string } {
  const c = s.campus;
  if (!c) return { ok: false, error: 'This run has no campus.' };
  if (c.moratorium) return { ok: false, error: 'The county has declared a moratorium: no new builds until goodwill recovers.' };
  if (c.sites.length >= CAMPUS.maxSites) return { ok: false, error: 'The campus has no more sites to offer.' };
  if (c.sites.some((x) => x.kind === kind)) return { ok: false, error: 'You already have a site there.' };
  const def = SITE_TIERS[tier];
  if (def.minGoodwill && c.goodwill < def.minGoodwill) return { ok: false, error: `The county will not hear of a gigawatt campus below ${def.minGoodwill} goodwill.` };
  if (s.cash < def.price) return { ok: false, error: 'Not enough cash.' };
  s.cash -= def.price;
  c.goodwill = Math.max(0, c.goodwill - (def.goodwillCost ?? 0));
  c.flows.capex += def.price;
  const permit = c.goodwill >= CAMPUS.fastPermitGoodwill ? -1 : 0;
  c.sites.push({ id: newId(s, 'site'), kind, tier, mw: def.mw, status: 'building', readyAt: s.minute + Math.max(1, def.days + permit) * 1440, staff: 0, util: 0, capex: def.price });
  addLog(s, 'success', `🏗️ ${SITE_KINDS[kind].name}: ${def.name} (${def.mw} MW) ordered. It will be ready in ${Math.max(1, def.days + permit)} days.`);
  return { ok: true };
}

/** Per game minute: sites finish building; daily results at midnight; board review. */
export function updateCampus(s: GameState): void {
  if (s.frontier && s.minute % 1440 === 0 && s.minute > s.frontier.startMin) {
    s.frontier.launchPerKg = Math.max(FRONTIER.floorPricePerKg, s.frontier.launchPerKg * (1 - FRONTIER.fallPerDay));
  }
  const c = s.campus;
  if (!c) return;
  for (const site of c.sites) {
    if (site.status === 'building' && s.minute >= site.readyAt) {
      site.status = 'live';
      site.util = 0.3;
      addLog(s, 'success', `🏢 ${SITE_KINDS[site.kind].name} is live! Customers start moving in.`);
    }
  }
  if (s.minute % 1440 === 0 && s.minute > 0) campusDay(s, c);
}

function campusDay(s: GameState, c: Campus): void {
  let revenue = 0;
  let cost = 0;
  c.spotMult = Math.max(0.7, Math.min(1.6, c.spotMult + (rand(s.rng) - 0.5) * 0.5));
  let depreciation = 0;
  for (const site of c.sites) {
    depreciation += site.capex / CAMPUS.depreciationDays;
    if (site.status !== 'live') continue;
    // utilisation grows while customers move in, and drops after a shock
    const shock = site.shockUntil !== undefined && s.minute < site.shockUntil;
    site.util = Math.max(0.05, Math.min(0.9, site.util + (shock ? -0.15 : SITE_TIERS[site.tier].rampPerDay ?? 0.08)));
    let rev = siteRevenuePerDay(site);
    // incidents: staff and redundancy cut the chance; help halves the damage
    const tuned = (site.tunedUntil ?? 0) > s.minute;
    const risk = CAMPUS.incidentPerDay * (1 - 0.25 * site.staff) * (tuned ? 0.5 : 1);
    if (chance(s.rng, risk)) {
      c.alerts.push({ id: newId(s, 'al'), siteId: site.id, day: dayOf(s.minute) - 1, text: `${SITE_KINDS[site.kind].name}: a cooling fault is hurting customers.`, helped: false });
      showTip(s, 'campusAlert');
      addLog(s, 'alarm', `📟 ${SITE_KINDS[site.kind].name}: a cooling fault is hurting customers. Send help or take the loss.`);
      site.incident = true;
    }
    if (site.incident) {
      const helped = c.alerts.some((a) => a.siteId === site.id && a.helped);
      rev = Math.round(rev * (helped ? 0.7 : 0.35));
      site.incident = false;
      c.alerts = c.alerts.filter((a) => !(a.siteId === site.id && a.helped));
    }
    revenue += rev;
    cost += siteCostPerDay(s, site);
    c.goodwill += SITE_KINDS[site.kind].water + site.staff * CAMPUS.goodwillPerStaff + (SITE_TIERS[site.tier].goodwillPerDay ?? 0);
  }
  if (s.site?.heatReuse) c.goodwill += CAMPUS.goodwillHeatReuse;
  c.goodwill += (CAMPUS.neutralGoodwill - c.goodwill) * CAMPUS.goodwillDrift;
  c.goodwill = Math.max(0, Math.min(100, c.goodwill));
  if (!c.moratorium && c.goodwill < CAMPUS.moratoriumBelow) {
    c.moratorium = true;
    addLog(s, 'fail', '🚧 The county board declared a moratorium on new data center builds. Win back goodwill first.');
    showTip(s, 'moratorium');
  } else if (c.moratorium && c.goodwill >= CAMPUS.moratoriumEndsAt) {
    c.moratorium = false;
    addLog(s, 'success', '🚧 The moratorium is lifted.');
  }
  const interest = Math.round(c.loan * CAMPUS.loanInterestPerDay);
  c.depreciationToday = Math.round(depreciation);
  const net = revenue - cost - interest;
  s.cash += net;
  s.today.revenue += Math.max(0, revenue);
  if (revenue || cost || interest) addLog(s, 'money', `🏢 Campus day: revenue $${revenue.toLocaleString('en-US')}, costs $${cost.toLocaleString('en-US')}${interest ? `, interest $${interest}` : ''}.`);
  const day = dayOf(s.minute);
  if (day >= c.board.nextDay) boardReview(s, c);
}

/** Profit since the last review without capex, loans and grants (an EBITDA-like figure). */
export function boardProfit(s: GameState): number {
  const c = s.campus!;
  return Math.round(s.cash - c.cashAtReview + c.flows.capex + c.flows.repaid - c.flows.proceeds - c.flows.grants);
}

export function boardTargets(s: GameState): { label: string; ok: boolean }[] {
  const c = s.campus!;
  const mult = (c.investor ? CAMPUS.investorTargetMult : 1) * (c.sites.some((x) => x.tier === 'gigawatt' && x.status === 'live') ? CAMPUS.gigawattBoardMult : 1);
  const profit = boardProfit(s);
  return [
    { label: `Profit ≥ $${Math.round(CAMPUS.boardProfit * mult).toLocaleString('en-US')} since the last review`, ok: profit >= CAMPUS.boardProfit * mult },
    { label: 'Uptime ≥ 99%', ok: overallUptimePct(s) >= CAMPUS.boardUptime },
    { label: 'Average PUE ≤ 1.45, or three live sites', ok: pueAverage(s) <= CAMPUS.boardPue || liveSites(s).length >= 3 },
  ];
}

function boardReview(s: GameState, c: Campus): void {
  const targets = boardTargets(s);
  const met = targets.filter((x) => x.ok).length;
  const day = dayOf(s.minute);
  c.board.reviews.push({ day, met, targets: targets.map((x) => x.ok) });
  if (met === 3) {
    s.cash += CAMPUS.boardGrant;
    c.flows.grants += CAMPUS.boardGrant;
    c.board.strikes = 0;
    addLog(s, 'success', `📊 Board review: all three targets met. The board grants a $${CAMPUS.boardGrant.toLocaleString('en-US')} budget.`);
  } else if (met === 2) {
    addLog(s, 'info', '📊 Board review: two of three targets met. The board is patient.');
  } else {
    c.board.strikes++;
    s.reputation = Math.max(0, s.reputation - 0.2);
    addLog(s, 'fail', `📊 Board review: only ${met} of 3 targets met. Strike ${c.board.strikes} of 2.`);
    if (c.board.strikes >= 2) {
      s.progress.status = 'lost';
      addLog(s, 'fail', 'The board replaced you.');
      s.attention = { severity: 3, text: 'The board replaced you.' };
    }
  }
  c.board.nextDay = day + c.board.everyDays;
  c.cashAtReview = s.cash;
  c.flows = { capex: 0, proceeds: 0, repaid: 0, grants: 0 };
  void randInt;
}

export const goodwillState = (c: Campus): 'moratorium' | 'low' | 'ok' | 'high' => (c.moratorium ? 'moratorium' : c.goodwill < 40 ? 'low' : c.goodwill >= CAMPUS.fastPermitGoodwill ? 'high' : 'ok');
