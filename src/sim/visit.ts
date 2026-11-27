import { at } from '../core/time';
import { CHAPTERS, type Objective } from '../data/chapters';
import { addLog, createGame } from './state';
import { overallUptimePct } from './selectors';
import { SITE_KINDS } from './campus';
import type { CampusSite, GameState } from './types';

/**
 * Site visit (v2.1): fly to a remote site and play one shift in a full hall. The headquarters is frozen
 * while you are away; the result folds back into the campus summary model.
 */
export const VISIT = { tunedDaysPerStar: 1, utilPerStar: 0.03, goodwillPerStar: 1, tunedRiskMult: 0.5, climate: { nordic: -8, metro: 2, desert: 8, harbour: 0 } } as const;

export const VISIT_OBJECTIVES: [Objective, Objective, Objective] = [
  { label: 'Keep the site above 95% uptime through the shift', check: (s) => overallUptimePct(s) >= 95, progress: (s) => `Uptime ${overallUptimePct(s).toFixed(1)}% / 95%` },
  { label: 'Uptime ≥ 99% and no critical alarm', check: (s) => overallUptimePct(s) >= 99 && s.stats.criticals === 0 },
  { label: 'Uptime ≥ 99.8%, no critical alarm and every incident fixed', check: (s) => overallUptimePct(s) >= 99.8 && s.stats.criticals === 0 && s.stats.resolved >= s.stats.incidents },
];

/** A full hall for a remote site, sized by its tier and shaped by its climate and local team. */
export function createVisit(hq: GameState, site: CampusSite, seed: number): GameState {
  const s = createGame('ch4', hq.difficulty, seed);
  s.visit = { siteId: site.id, hqCash: hq.cash, startCash: hq.cash };
  s.cash = hq.cash;
  s.progress.startCash = hq.cash;
  s.progress.peakCash = hq.cash;
  s.ambient = 24 + VISIT.climate[site.kind];
  s.incidentMult = (hq.incidentMult ?? 1) * (1.2 - 0.25 * site.staff);
  s.endMinute = at(0, 22);
  s.seenTips = Object.keys(CHAPTERS.ch4.features); // veterans: no tutorial tips
  s.features = hq.features.filter((f) => f !== 'campus' && f !== 'finance' && f !== 'crm' && f !== 'nights' && f !== 'ai' && f !== 'liquid');
  delete s.campus;
  s.log = [];
  addLog(s, 'story', `✈️ You flew to ${SITE_KINDS[site.kind].name}. One shift, one hall: keep it running and your local team will remember.`);
  return s;
}

export interface VisitResult {
  stars: number;
  uptime: number;
  criticals: number;
  profit: number;
}

export function visitResult(visit: GameState): VisitResult {
  const stars = VISIT_OBJECTIVES.findIndex((o) => !o.check(visit));
  return {
    stars: stars === -1 ? 3 : stars,
    uptime: overallUptimePct(visit),
    criticals: visit.stats.criticals,
    profit: Math.round(visit.cash - (visit.visit?.startCash ?? visit.cash)),
  };
}

/** Folds the visit back into the headquarters: the money you spent or earned, and a tuned-up site. */
export function applyVisit(hq: GameState, visit: GameState): VisitResult {
  const res = visitResult(visit);
  hq.cash = visit.cash;
  const site = hq.campus?.sites.find((x) => x.id === visit.visit?.siteId);
  if (site && hq.campus) {
    if (res.stars > 0) site.tunedUntil = Math.max(site.tunedUntil ?? 0, hq.minute + res.stars * VISIT.tunedDaysPerStar * 1440);
    site.util = Math.min(0.9, site.util + res.stars * VISIT.utilPerStar);
    hq.campus.goodwill = Math.min(100, hq.campus.goodwill + res.stars * VISIT.goodwillPerStar);
    hq.campus.alerts = hq.campus.alerts.filter((a) => a.siteId !== site.id);
    addLog(hq, res.stars ? 'success' : 'info', `✈️ Back from ${SITE_KINDS[site.kind].name}: ${'★'.repeat(res.stars)}${'☆'.repeat(3 - res.stars)} (uptime ${res.uptime.toFixed(1)}%). ${res.stars ? `The site is tuned up for ${res.stars} day${res.stars > 1 ? 's' : ''} and the team is proud.` : 'The local team is not impressed.'}`);
  }
  return res;
}
