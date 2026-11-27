import { at } from '../src/core/time';
import { CRM, NIGHTS } from '../src/data/catalog';
import { adjustSatisfaction, averageSatisfaction, dailySatisfaction, onContractExpiry, runAudit, satisfactionOf } from '../src/sim/crm';
import { applyCommand } from '../src/sim/commands';
import { raiseAlarm } from '../src/sim/alarms';
import { isNightHour, offDuty, openIncident, raisePager, rotaPremiumPerDay, scoreIncident } from '../src/sim/nights';
import { advance } from '../src/sim/sim';
import { createGame } from '../src/sim/state';
import { overallUptimePct } from '../src/sim/selectors';
import { alarmsPanel, contractsPanel, nightsSection, tabs, teamPanel } from '../src/ui/views';
import { HANDBOOK } from '../src/data/handbook';
import type { GameState } from '../src/sim/types';
import { autopilot } from './autopilot';
import { measure } from './engagement';

function ch9(seed = 1): GameState {
  const s = createGame('ch9', 'sysadmin', seed);
  s.failuresEnabled = false;
  return s;
}
const hire = (s: GameState, role: 'hw' | 'hvac' | 'net' | 'elec') => {
  s.cash += 20000;
  const cand = s.candidates.find((c) => c.role === role);
  if (!cand) throw new Error('no candidate ' + role);
  applyCommand(s, { type: 'hire', candidateId: cand.id });
  return s.techs[s.techs.length - 1]!;
};

describe('satisfaction and renewals', () => {
  it('starts at 70, moves with daily SLA results and is clamped to 0..100', () => {
    const s = ch9();
    const c = s.contracts.find((x) => x.status === 'active')!;
    expect(satisfactionOf(c)).toBe(CRM.startSatisfaction);
    adjustSatisfaction(c, 500);
    expect(satisfactionOf(c)).toBe(100);
    adjustSatisfaction(c, -500);
    expect(satisfactionOf(c)).toBe(0);
    expect(averageSatisfaction(s)).toBeLessThan(100);
  });

  it('a day with the SLA met raises it, a breach lowers it (only with the CRM system on)', () => {
    const s = ch9();
    const c = s.contracts.find((x) => x.status === 'active')!;
    dailySatisfaction(s, c, true);
    expect(satisfactionOf(c)).toBe(CRM.startSatisfaction + CRM.metDay);
    dailySatisfaction(s, c, false);
    expect(satisfactionOf(c)).toBe(CRM.startSatisfaction + CRM.metDay + CRM.missedDay);
    advance(s, at(1, 1) - s.minute);
    expect(s.contracts.filter((x) => x.status === 'active').every((x) => x.satisfaction !== undefined)).toBe(true);
    const old = createGame('ch6', 'sysadmin', 1);
    old.failuresEnabled = false;
    advance(old, at(1, 1) - old.minute);
    expect(old.contracts.every((x) => x.satisfaction === undefined)).toBe(true);
  });

  it('finishing a customer request pleases them, ignoring it upsets them', () => {
    const s = ch9();
    const c = s.contracts.find((x) => x.status === 'active')!;
    const rack = s.racks.find((r) => s.devices.some((d) => d.rackId === r.id))!;
    s.walkins.push({ id: 'w1', customer: `${c.customer} · ${c.name}`, rackId: rack.id, text: 'x', reward: 50, deadline: s.minute + 5, status: 'open', kind: 'favor' });
    const before = satisfactionOf(c);
    advance(s, 10);
    expect(satisfactionOf(c)).toBe(before + CRM.ticketMissed);
  });

  it('happy customers renew at a higher price, unhappy ones leave', () => {
    let renewed = 0;
    let left = 0;
    for (let seed = 1; seed <= 60; seed++) {
      for (const mood of [90, 20]) {
        const s = ch9(seed);
        const c = s.contracts.find((x) => x.status === 'active')!;
        c.satisfaction = mood;
        const price = c.revenuePerDay;
        const res = onContractExpiry(s, c, 3);
        if (mood === 90) {
          if (res === 'renewed') {
            renewed++;
            expect(c.revenuePerDay).toBeGreaterThan(price);
            expect(c.renewals).toBe(1);
          }
        } else if (res === 'churned') left++;
      }
    }
    expect(renewed).toBeGreaterThanOrEqual(55);
    expect(left).toBe(60);
  });

  it('contracts end in Chapter 9 with a renewal decision: the short ones are renewed, not ended, by a happy site', () => {
    const s = ch9(2);
    for (const c of s.contracts) c.satisfaction = 100;
    advance(s, at(3, 2) - s.minute);
    expect(s.contracts.some((c) => (c.renewals ?? 0) > 0)).toBe(true);
    expect(s.log.some((l) => l.text.includes('renewed'))).toBe(true);
  });
});

describe('compliance audit', () => {
  it('passes with at least three of four checks and fails otherwise, with consequences', () => {
    const good = ch9();
    for (const d of good.devices) d.psus = 2;
    good.backup!.testedAt = good.minute;
    good.backup!.atsServicedAt = good.minute;
    expect(runAudit(good).passed).toBe(true);
    expect(good.audit!.checks.filter((c) => c.ok).length).toBe(4);
    const bad = ch9();
    const rep = bad.reputation;
    const mood = satisfactionOf(bad.contracts.find((c) => c.status === 'active')!);
    const a = runAudit(bad);
    expect(a.passed).toBe(false);
    expect(bad.reputation).toBeLessThan(rep);
    expect(satisfactionOf(bad.contracts.find((c) => c.status === 'active')!)).toBe(mood + CRM.auditFailSatisfaction);
  });

  it('is scheduled for Thursday morning in Chapter 9', () => {
    const s = ch9();
    advance(s, at(3, 10) - s.minute);
    expect(s.audit?.done).toBe(true);
  });
});

describe('nights, rota and the pager', () => {
  it('only the rota and you are on site between 22:00 and 06:00', () => {
    const s = ch9();
    const hw = s.techs.find((t) => t.role === 'hw')!;
    s.minute = at(0, 23);
    expect(isNightHour(s.minute)).toBe(true);
    expect(offDuty(s, hw)).toBe(true);
    expect(offDuty(s, s.techs.find((t) => t.role === 'manager')!)).toBe(false);
    expect(applyCommand(s, { type: 'setNightCrew', techId: hw.id, on: true }).ok).toBe(true);
    expect(offDuty(s, hw)).toBe(false);
    s.minute = at(1, 9);
    expect(offDuty(s, hw)).toBe(false);
    expect(applyCommand(createGame('ch6', 'sysadmin', 1), { type: 'setNightCrew', techId: 'x', on: true }).ok).toBe(false);
  });

  it('off-duty technicians do not take jobs at night; the rota does', () => {
    const s = ch9();
    const hw = s.techs.find((t) => t.role === 'hw')!;
    advance(s, at(0, 22, 30) - s.minute);
    const d = s.devices[0]!;
    d.faults.push('hung');
    raiseAlarm(s, 'hung', d.rackId, d.id, 2, 60);
    applyCommand(s, { type: 'dispatch', job: 'reboot', deviceId: d.id, techId: 'best' });
    expect(s.jobs[0]!.techId).not.toBe(hw.id); // the manager (you) took it
    const t = ch9();
    applyCommand(t, { type: 'setNightCrew', techId: t.techs.find((x) => x.role === 'hw')!.id, on: true });
    advance(t, at(0, 22, 30) - t.minute);
    const e = t.devices[0]!;
    e.faults.push('hung');
    raiseAlarm(t, 'hung', e.rackId, e.id, 2, 60);
    applyCommand(t, { type: 'dispatch', job: 'reboot', deviceId: e.id, techId: 'best' });
    expect(t.techs.find((x) => x.id === t.jobs[0]!.techId)!.role).toBe('hw');
  });

  it('the rota costs a 50% premium on those salaries', () => {
    const s = ch9();
    const hw = s.techs.find((t) => t.role === 'hw')!;
    expect(rotaPremiumPerDay(s)).toBe(0);
    applyCommand(s, { type: 'setNightCrew', techId: hw.id, on: true });
    expect(rotaPremiumPerDay(s)).toBe(Math.round(hw.salaryPerDay * NIGHTS.rotaPremiumShare));
  });

  it('the pager wakes you at 03:00: calling people in tires them, holding it makes the problem worse', () => {
    const s = ch9();
    advance(s, at(1, 3, 5) - s.minute);
    expect(s.pager?.answered).toBeNull();
    expect(s.alarms.some((a) => a.kind === 'feed')).toBe(true);
    const fatigue = s.techs.map((t) => t.fatigue);
    expect(applyCommand(s, { type: 'answerPager', how: 'now' }).ok).toBe(true);
    expect(s.techs.every((t, i) => t.fatigue >= fatigue[i]!)).toBe(true);
    expect(s.techs.some((t, i) => t.fatigue > fatigue[i]!)).toBe(true);
    expect(applyCommand(s, { type: 'answerPager', how: 'hold' }).ok).toBe(false);
    const h = ch9();
    advance(h, at(1, 3, 5) - h.minute);
    applyCommand(h, { type: 'answerPager', how: 'hold' });
    const sev = h.alarms.map((a) => a.severity);
    advance(h, NIGHTS.pagerHoldEscalation + 1);
    expect(h.alarms.some((a, i) => a.severity > (sev[i] ?? 3)) || h.log.some((l) => l.text.includes('got worse'))).toBe(true);
    expect(applyCommand(createGame('ch6', 'sysadmin', 1), { type: 'answerPager', how: 'now' }).ok).toBe(false);
    raisePager(createGame('ch6', 'sysadmin', 1), 'nothing');
  });
});

describe('incident command', () => {
  it('a critical alarm opens an incident; a commander, an honest update and a fast fix score 3, and it closes after quiet', () => {
    const s = ch9();
    hire(s, 'elec');
    const rack = s.racks.find((r) => s.devices.some((d) => d.rackId === r.id))!;
    raiseAlarm(s, 'breaker', rack.id, null, 3, null);
    expect(s.incident?.status).toBe('open');
    const tech = s.techs.find((t) => t.role !== 'manager')!;
    expect(applyCommand(s, { type: 'setCommander', techId: tech.id }).ok).toBe(true);
    expect(applyCommand(s, { type: 'sendUpdate', kind: 'honest' }).ok).toBe(true);
    s.alarms = [];
    advance(s, NIGHTS.incidentQuietMin + 2);
    expect(s.incident?.status).toBe('closed');
    expect(s.incidentScores).toEqual([3]);
    expect(applyCommand(s, { type: 'sendUpdate', kind: 'honest' }).ok).toBe(false);
  });

  it('no commander and no update scores low; silence upsets the customers who suffered', () => {
    const s = ch9();
    const c = s.contracts.find((x) => x.status === 'active')!;
    c.minutesToday = 100;
    c.okMinutesToday = 50;
    const before = satisfactionOf(c);
    openIncident(s);
    s.incident!.startedAt = s.minute - 400;
    expect(scoreIncident(s)).toBe(0);
    s.alarms = [];
    advance(s, NIGHTS.incidentQuietMin + 2);
    expect(satisfactionOf(c)).toBe(before + NIGHTS.updateSilent);
    const t = ch9();
    const d = t.contracts.find((x) => x.status === 'active')!;
    d.minutesToday = 100;
    d.okMinutesToday = 50;
    const b = satisfactionOf(d);
    openIncident(t);
    applyCommand(t, { type: 'sendUpdate', kind: 'honest' });
    t.alarms = [];
    advance(t, NIGHTS.incidentQuietMin + 2);
    expect(satisfactionOf(d)).toBe(b + NIGHTS.updateHonest);
  });
});

describe('Chapter 9 UI and balance', () => {
  it('shows moods, the rota toggle, the pager and the incident controls', () => {
    const s = ch9();
    expect(contractsPanel(s)).toMatch(/😄|🙂|😐|😠/);
    expect(teamPanel(s)).toContain('data-action="nightCrew"');
    advance(s, at(1, 3, 5) - s.minute);
    expect(nightsSection(s)).toContain('data-action="pagerNow"');
    expect(alarmsPanel(s)).toContain('The pager');
    expect(tabs(s, 'alarms')).toContain('class="badge"');
    applyCommand(s, { type: 'answerPager', how: 'now' });
    raiseAlarm(s, 'breaker', s.racks[0]!.id, null, 3, null);
    const html = nightsSection(s);
    expect(html).toContain('data-action="commander"');
    expect(html).toContain('data-action="update"');
    expect(html).not.toMatch(/undefined|NaN/);
    expect(nightsSection(createGame('ch6', 'sysadmin', 1))).toBe('');
    expect(HANDBOOK.filter((h) => h.unlock === 'crm' || h.unlock === 'nights').map((h) => h.id)).toEqual(['satisfaction', 'audit', 'oncall', 'incident']);
  });

  it('a prepared bot passes the audit and keeps customers happy; the chapter is winnable', () => {
    const s = ch9(1);
    s.failuresEnabled = true;
    while (s.progress.status === 'playing') {
      if (s.minute % 5 === 0) autopilot(s, { auto: true });
      advance(s, 1);
    }
    expect(s.progress.status).toBe('won');
    expect(s.audit?.passed).toBe(true);
    expect(averageSatisfaction(s)).toBeGreaterThan(65);
    expect(overallUptimePct(s)).toBeGreaterThan(97);
  }, 60000);

  it('keeps the bot engagement guardrails in Chapter 9', () => {
    const m = measure('ch9', 1, 'sysadmin', true);
    expect(m.shiftRealMinutes.every((x) => x >= 3 && x <= 10)).toBe(true);
    expect(m.quietDaytimePct).toBeLessThanOrEqual(70);
  });
});
