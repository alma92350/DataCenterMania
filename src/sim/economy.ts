import { contractLabel } from './naming';
import { pick, randInt } from '../core/rng';
import { MINUTES_PER_DAY, dayOf, minuteOfDay } from '../core/time';
import { BASE_PUE, ELECTRICITY_PER_KWH, MORALE, PARTS, RACK_RENT_PER_DAY } from '../data/catalog';
import { chance } from '../core/rng';
import { CHAPTERS } from '../data/chapters';
import { CUSTOMERS } from '../data/content';
import { DIFFICULTIES } from '../data/difficulty';
import { addFx, addLog, emptyReport, makeCandidate, makeContract, showTip } from './state';
import { cancelJob } from './jobs';
import { contractUptimeTodayPct, unitsOf } from './selectors';
import type { DayReport, GameState, PartId } from './types';

export function deliveryTime(s: GameState, part: PartId): number {
  return Math.round(PARTS[part].deliveryMin * DIFFICULTIES[s.difficulty].deliveryTime);
}

export function updateOrders(s: GameState): void {
  const arrived = s.orders.filter((o) => o.arriveAt <= s.minute);
  if (!arrived.length) return;
  s.orders = s.orders.filter((o) => o.arriveAt > s.minute);
  for (const o of arrived) {
    if (o.part === 'coffee') {
      s.coffeeLevel += o.qty;
      addLog(s, 'success', `New coffee machine installed. The team is delighted! (level ${s.coffeeLevel})`);
      continue;
    }
    s.inventory[o.part] += o.qty;
    addLog(s, 'info', `Delivery arrived: ${o.qty} × ${PARTS[o.part].name}.`);
  }
}

/** Revenue earned this minute by live contracts, attributed to the racks that serve them. */
export function accrueMinute(s: GameState): void {
  for (const c of s.contracts) {
    if (c.status !== 'active' || c.liveFrom === null) continue;
    const perMin = c.revenuePerDay / 1440;
    const devices = s.devices.filter((d) => d.contractId === c.id);
    const units = devices.reduce((n, d) => n + unitsOf(d), 0);
    if (!units) {
      s.pendingRevenue[''] = (s.pendingRevenue[''] ?? 0) + perMin;
      continue;
    }
    for (const d of devices) s.pendingRevenue[d.rackId] = (s.pendingRevenue[d.rackId] ?? 0) + (perMin * unitsOf(d)) / units;
  }
}

function dailyCosts(s: GameState) {
  return {
    salaries: s.techs.reduce((sum, t) => sum + t.salaryPerDay, 0),
    rent: s.racks.length * RACK_RENT_PER_DAY,
    network: s.uplinks.reduce((sum, u) => sum + u.costPerDay, 0),
  };
}

/** Credits earned revenue and charges running costs, prorated to the share of the day elapsed (PRD §21.3). */
export function settleHour(s: GameState): void {
  const t = s.today;
  let credited = 0;
  for (const [rackId, amount] of Object.entries(s.pendingRevenue)) {
    const whole = Math.floor(amount);
    if (whole <= 0) continue;
    credited += whole;
    s.pendingRevenue[rackId] = amount - whole;
    if (rackId) addFx(s, 'money', rackId, whole);
  }
  t.revenue += credited;
  const elapsed = (minuteOfDay(s.minute) || MINUTES_PER_DAY) / MINUTES_PER_DAY;
  const daily = dailyCosts(s);
  const due = {
    salaries: Math.round(daily.salaries * elapsed) - t.salaries,
    rent: Math.round(daily.rent * elapsed) - t.rent,
    network: Math.round(daily.network * elapsed) - t.network,
    electricity: Math.round(s.energyTodayKwh * ELECTRICITY_PER_KWH * BASE_PUE) - t.electricity,
  };
  for (const k of ['salaries', 'rent', 'network', 'electricity'] as const) t[k] += Math.max(0, due[k]);
  s.cash += credited - Math.max(0, due.salaries) - Math.max(0, due.rent) - Math.max(0, due.network) - Math.max(0, due.electricity);
  s.fx = s.fx.filter((f) => s.minute - f.minute < 180);
}

/**
 * Daily close (midnight, or the chapter's end when final): SLA verdicts and penalties, then the report.
 * Revenue and running costs were already credited hourly.
 */
export function settleDay(s: GameState, final = false): DayReport {
  const day = final ? dayOf(s.minute) : dayOf(s.minute) - 1;
  const diff = DIFFICULTIES[s.difficulty];
  const report = s.today;
  report.day = day;
  for (const c of s.contracts) {
    if (c.status !== 'active' || c.minutesToday === 0) continue;
    const uptime = contractUptimeTodayPct(c);
    if (uptime + 1e-9 >= c.slaPct) {
      report.slaMet++;
      s.reputation = Math.min(5, s.reputation + 0.06);
    } else {
      report.slaBreached++;
      c.breaches++;
      report.penalties += Math.round(c.penaltyPerBreach * diff.slaPenalty);
      s.reputation = Math.max(0, s.reputation - 0.3);
      addLog(s, 'fail', `SLA breached for ${contractLabel(c)}: ${uptime.toFixed(1)}% < ${c.slaPct}%.`);
    }
    c.totalMinutes += c.minutesToday;
    c.totalOkMinutes += c.okMinutesToday;
    c.minutesToday = 0;
    c.okMinutesToday = 0;
  }
  s.cash -= report.penalties;
  report.net = report.revenue - report.penalties - report.salaries - report.electricity - report.rent - report.network;
  s.energyTodayKwh = 0;
  s.reports.push(report);
  s.today = emptyReport(day + 1);
  addLog(s, 'money', `Day ${day + 1} closed: ${report.net >= 0 ? '+' : ''}$${report.net.toLocaleString('en-US')} (revenue $${report.revenue}, costs $${report.revenue - report.net}).`);
  if (final) return report;

  const today = dayOf(s.minute);
  for (const c of s.contracts) {
    if (c.status === 'active' && today >= c.expiresDay) {
      c.status = 'ended';
      for (const d of s.devices) if (d.contractId === c.id) d.contractId = null;
      if (c.breaches === 0) s.reputation = Math.min(5, s.reputation + 0.1);
      addLog(s, 'info', `Contract ${contractLabel(c)} ended.`);
    }
  }
  s.contracts = s.contracts.filter((c) => !(c.status === 'offered' && today >= c.expiresDay));

  if (s.features.includes('fatigue')) quitCheck(s);
  if (s.features.includes('hire')) {
    s.candidates = s.candidates.slice(-1);
    while (s.candidates.length < 3) s.candidates.push(makeCandidate(s));
  }
  if (CHAPTERS[s.chapter].dailyOffers) generateOffers(s, randInt(s.rng, 1, 2));
  return report;
}

/** Unhappy staff may hand in their notice at midnight. */
function quitCheck(s: GameState): void {
  for (const t of [...s.techs]) {
    if (t.role === 'manager' || t.morale >= MORALE.quitBelow || !chance(s.rng, MORALE.quitChance)) continue;
    for (const j of s.jobs.filter((x) => x.techId === t.id)) cancelJob(s, j.id);
    s.techs = s.techs.filter((x) => x.id !== t.id);
    addLog(s, 'fail', `${t.name} quit: "I need a job where I can sleep."`);
    showTip(s, 'quit');
  }
}

/** New contract offers; better reputation draws bigger and better-paying customers. */
export function generateOffers(s: GameState, count: number): void {
  for (let i = 0; i < count; i++) {
    const a = pick(s.rng, CUSTOMERS);
    const units = randInt(s.rng, a.units[0], a.units[1]);
    const repBonus = 0.8 + s.reputation * 0.08;
    const revenue = Math.round((units * a.pricePerUnit * repBonus) / 10) * 10;
    s.contracts.push(makeContract(s, {
      customer: a.name, description: a.description, units, slaPct: a.slaPct, revenuePerDay: revenue,
      penaltyPerBreach: Math.round(revenue * 0.8), durationDays: randInt(s.rng, a.duration[0], a.duration[1]), profile: a.profile,
      bandwidthPerUnit: s.features.includes('network') ? a.bandwidth : 0,
    }, 'offered'));
    addLog(s, 'info', `New contract offer: ${a.name} wants ${units} units for $${revenue}/day.`);
  }
}
