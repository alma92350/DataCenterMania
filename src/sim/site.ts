import { COOLERS, ENERGY, SITE } from '../data/catalog';
import { clearAlarms, escalationDelay, raiseAlarm } from './alarms';
import { addLog, showTip } from './state';
import type { GameState, Site } from './types';

export function createSite(gridCapW: number): Site {
  return {
    gridCapW, gridSteps: 0, cooling: 'evaporative', economizer: false, renewable: false, heatReuse: false, oob: 'ok',
    mainTripped: false, overMin: 0, droughtUntil: 0, trips: 0, itKwh: 0, facKwh: 0, waterOnL: 0, waterOffL: 0, waterOnToday: 0, waterOffToday: 0,
  };
}

/** Outside air temperature: a daily wave around 14 degrees, hotter in a heatwave. */
export function outdoorC(s: GameState, minute: number = s.minute): number {
  const hour = (minute % 1440) / 60;
  return 14 + 6 * Math.sin(((hour - 9) / 24) * 2 * Math.PI) + (s.ambient - 24);
}

export const setpointOf = (s: GameState): number => s.site?.setpointC ?? ENERGY.setpointDefault;
export const setpointDelta = (s: GameState): number => (s.site ? setpointOf(s) - ENERGY.setpointDefault : 0);
export const containmentOf = (s: GameState): 0 | 1 | 2 => s.site?.containment ?? 0;

export const itPowerW = (s: GameState): number => s.racks.reduce((w, r) => w + r.loadW, 0);

/** Share of cooling electricity saved by outside air (only with the economiser). */
export function freeShare(s: GameState): number {
  if (!s.site?.economizer) return 0;
  return Math.max(0, Math.min(ENERGY.freeMax, (ENERGY.freeStartC + setpointDelta(s) - outdoorC(s)) / ENERGY.freeSpanC));
}

export function copNow(s: GameState): number {
  const site = s.site!;
  if (site.cooling === 'evaporative') return ENERGY.copEvaporative;
  return ENERGY.copDry / (outdoorC(s) > ENERGY.dryHotC ? ENERGY.dryHotPenalty : 1);
}

export function coolingW(s: GameState): number {
  const site = s.site;
  if (!site) return s.coolers.filter((c) => c.on).reduce((w, c) => w + c.powerW, 0);
  const running = s.coolers.filter((c) => c.on && !c.broken && c.kind !== 'officeAc').length;
  if (!running) return 0;
  const saving = Math.max(0.5, 1 - ENERGY.coolingPerDeg * setpointDelta(s) - ENERGY.containmentSave[containmentOf(s)]);
  return (itPowerW(s) / copNow(s) + ENERGY.fanW * running) * (1 - freeShare(s)) * saving;
}

/** IT plus cooling plus distribution losses. */
export function facilityW(s: GameState): number {
  const it = itPowerW(s);
  return it + coolingW(s) + (s.site ? it * ENERGY.lossShare : 0);
}

/** Instant PUE: total facility power divided by IT power (1 when idle). */
export function pueNow(s: GameState): number {
  const it = itPowerW(s);
  return it > 0 ? facilityW(s) / it : 1;
}

/** PUE since the chapter started, weighted by energy. This is what goals and ESG clauses read. */
export function pueAverage(s: GameState): number {
  const site = s.site;
  return site && site.itKwh > 0 ? site.facKwh / site.itKwh : pueNow(s);
}

/** ESG customers read PUE after the heat-reuse credit. */
export const pueForEsg = (s: GameState): number => pueNow(s) - (s.site?.heatReuse ? ENERGY.heatReusePueCredit : 0);

export function esgOk(s: GameState, pueMax: number | undefined): boolean {
  if (!pueMax || !s.site) return true;
  return pueForEsg(s) <= pueMax;
}

export const droughtActive = (s: GameState): boolean => !!s.site && s.minute < s.site.droughtUntil;

export function startDrought(s: GameState, days: number, text?: string): void {
  const site = s.site;
  if (!site) return;
  site.droughtUntil = s.minute + days * 1440;
  addLog(s, 'alarm', text ?? `🏜️ Drought declared: evaporative cooling is banned for ${days} days.`);
  if (site.cooling === 'evaporative') {
    site.cooling = 'dry';
    addLog(s, 'info', '🌬️ The site switched to dry cooling automatically.');
  }
  showTip(s, 'drought');
}

export function cutOob(s: GameState, text?: string): void {
  const site = s.site;
  if (!site || site.oob === 'cut') return;
  site.oob = 'cut';
  if (text) addLog(s, 'story', text);
  raiseAlarm(s, 'oob', null, null, 2, escalationDelay(s, 2));
  showTip(s, 'oobCut');
}

export function surge(s: GameState, mult: number, hours: number, text?: string): void {
  s.surge = { mult, until: s.minute + hours * 60 };
  addLog(s, 'alarm', text ?? `📈 Demand surge: customers need ${mult}× traffic for ${hours} hours.`);
}

export const surgeFactor = (s: GameState): number => (s.surge && s.minute < s.surge.until ? s.surge.mult : 1);

/** Per game minute: energy and water meters, the grid-connection limit, heat reuse income. */
export function updateSite(s: GameState): void {
  const site = s.site;
  if (!site) return;
  if (s.minute % 1440 === 0) {
    site.waterOnToday = 0;
    site.waterOffToday = 0;
  }
  const itW = itPowerW(s);
  const facW = facilityW(s);
  const itKwh = itW / 1000 / 60;
  const facKwh = facW / 1000 / 60;
  site.itKwh += itKwh;
  site.facKwh += facKwh;
  const on = itKwh * ENERGY.waterOnPerKwh[site.cooling] * (1 - freeShare(s) * 0.5);
  const off = facKwh * ENERGY.waterOffPerKwh[site.renewable ? 'renewable' : 'grid'];
  site.waterOnL += on;
  site.waterOffL += off;
  site.waterOnToday += on;
  site.waterOffToday += off;

  if (site.heatReuse && s.minute % 60 === 0) {
    const income = Math.round(itKwh * 60 * ENERGY.heatReuseEarnPerKwh);
    if (income > 0) {
      s.cash += income;
      s.today.revenue += income;
    }
  }

  // the grid connection: a warning at 90%, a tripped main breaker after a few minutes over the limit
  if (!site.mainTripped) {
    if (facW > site.gridCapW * SITE.warnShare) raiseAlarm(s, 'siteCapHigh', null, null, 1, escalationDelay(s, 1));
    else clearAlarms(s, (a) => a.kind === 'siteCapHigh');
    site.overMin = facW > site.gridCapW ? site.overMin + 1 : Math.max(0, site.overMin - 1);
    if (site.overMin >= SITE.tripMin) {
      site.mainTripped = true;
      site.trips++;
      s.reputation = Math.max(0, s.reputation - 0.2);
      clearAlarms(s, (a) => a.kind === 'siteCapHigh');
      raiseAlarm(s, 'siteCap', null, null, 3, null);
      addLog(s, 'fail', '⚡ The main breaker tripped: the facility drew more than its grid connection. Everything is down until an electrician resets it.');
      showTip(s, 'siteCap');
    }
  }
}

export function resetMain(s: GameState): void {
  const site = s.site;
  if (!site) return;
  site.mainTripped = false;
  site.overMin = 0;
  clearAlarms(s, (a) => a.kind === 'siteCap');
  addLog(s, 'success', '⚡ The main breaker is back on. Shed some load or order a bigger grid connection before it trips again.');
}

export function repairOob(s: GameState): void {
  const site = s.site;
  if (!site) return;
  site.oob = 'ok';
  clearAlarms(s, (a) => a.kind === 'oob');
  addLog(s, 'success', '🖥️ The out-of-band link is back: remote management works again.');
}

export const coolerKw = (s: GameState): number =>
  s.coolers.filter((c) => c.on && !c.broken).reduce((kw, c) => kw + COOLERS[c.kind].capacityKw * Math.max(0.5, c.health), 0);
