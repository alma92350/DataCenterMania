import { pick, randInt } from '../core/rng';
import { dayOf } from '../core/time';
import { BASE_PUE, ELECTRICITY_PER_KWH, PARTS, RACK_RENT_PER_DAY } from '../data/catalog';
import { CHAPTERS } from '../data/chapters';
import { CUSTOMERS } from '../data/content';
import { DIFFICULTIES } from '../data/difficulty';
import { addLog, makeCandidate, makeContract } from './state';
import { contractUptimeTodayPct } from './selectors';
import type { DayReport, GameState, PartId } from './types';

export function deliveryTime(s: GameState, part: PartId): number {
  return Math.round(PARTS[part].deliveryMin * DIFFICULTIES[s.difficulty].deliveryTime);
}

export function updateOrders(s: GameState): void {
  const arrived = s.orders.filter((o) => o.arriveAt <= s.minute);
  if (!arrived.length) return;
  s.orders = s.orders.filter((o) => o.arriveAt > s.minute);
  for (const o of arrived) {
    s.inventory[o.part] += o.qty;
    addLog(s, 'info', `Delivery arrived: ${o.qty} × ${PARTS[o.part].name}.`);
  }
}

/** Midnight settlement: revenue, SLA penalties, salaries, power and rent (PRD §10). */
export function settleDay(s: GameState): DayReport {
  const day = dayOf(s.minute) - 1;
  const diff = DIFFICULTIES[s.difficulty];
  const report: DayReport = { day, revenue: 0, penalties: 0, salaries: 0, electricity: 0, rent: 0, net: 0, slaMet: 0, slaBreached: 0 };
  for (const c of s.contracts) {
    if (c.status !== 'active' || c.minutesToday === 0) continue;
    report.revenue += Math.round(c.revenuePerDay * (c.minutesToday / 1440));
    const uptime = contractUptimeTodayPct(c);
    if (uptime + 1e-9 >= c.slaPct) {
      report.slaMet++;
      s.reputation = Math.min(5, s.reputation + 0.06);
    } else {
      report.slaBreached++;
      c.breaches++;
      report.penalties += Math.round(c.penaltyPerBreach * diff.slaPenalty);
      s.reputation = Math.max(0, s.reputation - 0.3);
      addLog(s, 'fail', `SLA breached for ${c.customer}: ${uptime.toFixed(1)}% < ${c.slaPct}%.`);
    }
    c.totalMinutes += c.minutesToday;
    c.totalOkMinutes += c.okMinutesToday;
    c.minutesToday = 0;
    c.okMinutesToday = 0;
  }
  report.salaries = s.techs.reduce((sum, t) => sum + t.salaryPerDay, 0);
  report.electricity = Math.round(s.energyTodayKwh * ELECTRICITY_PER_KWH * BASE_PUE);
  report.rent = s.racks.length * RACK_RENT_PER_DAY;
  report.net = report.revenue - report.penalties - report.salaries - report.electricity - report.rent;
  s.cash += report.net;
  s.energyTodayKwh = 0;
  s.reports.push(report);
  addLog(s, 'money', `Day ${day + 1} closed: ${report.net >= 0 ? '+' : ''}$${report.net.toLocaleString('en-US')} (revenue $${report.revenue}, costs $${report.revenue - report.net}).`);

  const today = dayOf(s.minute);
  for (const c of s.contracts) {
    if (c.status === 'active' && today >= c.expiresDay) {
      c.status = 'ended';
      for (const d of s.devices) if (d.contractId === c.id) d.contractId = null;
      if (c.breaches === 0) s.reputation = Math.min(5, s.reputation + 0.1);
      addLog(s, 'info', `Contract with ${c.customer} ended.`);
    }
  }
  s.contracts = s.contracts.filter((c) => !(c.status === 'offered' && today >= c.expiresDay));

  if (s.features.includes('hire')) {
    s.candidates = s.candidates.slice(-1);
    while (s.candidates.length < 3) s.candidates.push(makeCandidate(s));
  }
  if (CHAPTERS[s.chapter].dailyOffers) generateOffers(s, randInt(s.rng, 1, 2));
  return report;
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
    }, 'offered'));
    addLog(s, 'info', `New contract offer: ${a.name} wants ${units} units for $${revenue}/day.`);
  }
}
