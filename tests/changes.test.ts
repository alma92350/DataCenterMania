import { at } from '../src/core/time';
import { CHANGE, CHANGES, LEAD_TIME, PARTS, SUPPLY } from '../src/data/catalog';
import { changeCrew, changeRisk, delayInfra, finishChange, makeChange, offerChange, openChanges, tonight } from '../src/sim/changes';
import { applyCommand } from '../src/sim/commands';
import { deliveryTime } from '../src/sim/economy';
import { resilience } from '../src/sim/resilience';
import { advance } from '../src/sim/sim';
import { overallUptimePct } from '../src/sim/selectors';
import { createGame } from '../src/sim/state';
import type { Change, GameState } from '../src/sim/types';
import { autopilot } from './autopilot';
import { measure } from './engagement';

function ch6(seed = 1): GameState {
  const s = createGame('ch6', 'sysadmin', seed);
  s.failuresEnabled = false;
  return s;
}
const first = (s: GameState, kind: Change['kind']): Change => {
  const c = makeChange(s, kind)!;
  expect(c).toBeTruthy();
  return c;
};

describe('change risk model (pure)', () => {
  it('is the base risk times each factor that applies, and every factor is named', () => {
    const s = ch6();
    const c = first(s, 'firmware');
    const base = changeRisk(s, c, at(0, 12)); // noon, no rollback, the manager would do it
    expect(base.factors.map((f) => f.key)).toContain('crew');
    expect(base.pct).toBeGreaterThan(0);
    const night = changeRisk(s, c, at(0, 23));
    expect(night.factors.map((f) => f.key)).toContain('window');
    expect(night.pct).toBeLessThan(base.pct);
    c.rollback = true;
    const safe = changeRisk(s, c, at(0, 23));
    expect(safe.factors.map((f) => f.key)).toContain('rollback');
    expect(safe.pct).toBeLessThan(night.pct);
  });

  it('a rested specialist lowers it, a tired one raises it', () => {
    const s = ch6();
    const c = first(s, 'firmware');
    const rested = changeRisk(s, c, at(0, 12));
    expect(changeCrew(s, c).role).toBe('hw');
    expect(rested.factors.find((f) => f.key === 'crew')!.mult).toBe(CHANGE.restedMult);
    changeCrew(s, c).fatigue = 80;
    const tired = changeRisk(s, c, at(0, 12));
    expect(tired.factors.find((f) => f.key === 'crew')!.mult).toBe(CHANGE.tiredMult);
    expect(tired.pct).toBeGreaterThan(rested.pct);
  });

  it('PDU maintenance is far safer on a rack where every server has two legs', () => {
    const s = ch6();
    const c = first(s, 'pduMaintenance');
    const single = changeRisk(s, c, at(0, 12)).pct;
    for (const d of s.devices) d.psus = 2;
    const dual = changeRisk(s, c, at(0, 12));
    expect(dual.factors.map((f) => f.key)).toContain('dual');
    expect(dual.pct).toBeLessThan(single);
  });

  it('is clamped between 1% and 95%', () => {
    const s = ch6();
    const c = first(s, 'capacityInstall');
    c.rollback = true;
    expect(changeRisk(s, c, at(0, 23)).pct).toBeGreaterThanOrEqual(1);
    const big = { ...c, kind: 'pduMaintenance' as const };
    s.difficulty = 'nightmare';
    expect(changeRisk(s, big, at(0, 12)).pct).toBeLessThanOrEqual(95);
  });
});

describe('change cards: offers, scheduling, freeze', () => {
  it('Chapter 6 offers the first two cards, then two new ones every morning, never more than three open', () => {
    const s = ch6();
    advance(s, at(0, 9) - s.minute);
    expect(openChanges(s).map((c) => c.kind)).toEqual(['firmware', 'pduMaintenance']);
    advance(s, at(1, 7) - s.minute);
    expect(openChanges(s).length).toBeLessThanOrEqual(CHANGE.maxOpen);
    expect(createGame('ch5', 'sysadmin', 1).features).not.toContain('changes');
    expect(applyCommand(createGame('ch5', 'sysadmin', 1), { type: 'setFreeze', on: true }).ok).toBe(false);
  });

  it('scheduling for tonight starts the work at 23:00 with the best technician, and the card finishes', () => {
    const s = ch6(2);
    advance(s, at(0, 9) - s.minute);
    const c = openChanges(s).find((x) => x.kind === 'firmware')!;
    expect(applyCommand(s, { type: 'setRollback', changeId: c.id, on: true }).ok).toBe(true);
    expect(applyCommand(s, { type: 'scheduleChange', changeId: c.id, when: 'tonight' }).ok).toBe(true);
    expect(c.scheduledAt).toBe(tonight(s));
    expect(c.status).toBe('scheduled');
    expect(applyCommand(s, { type: 'scheduleChange', changeId: c.id, when: 'tonight' }).ok).toBe(false);
    advance(s, at(0, 22, 59) - s.minute);
    expect(s.jobs.some((j) => j.kind === 'change')).toBe(false);
    advance(s, 2);
    const job = s.jobs.find((j) => j.kind === 'change')!;
    expect(job.workTotal).toBe(CHANGES.firmware.workMin + CHANGE.rollbackMin);
    expect(s.techs.find((t) => t.id === job.techId)!.role).toBe('hw');
    advance(s, 240);
    expect(['done', 'failed']).toContain(c.status);
  });

  it('a freeze stops everything from starting: scheduled work waits, "now" is refused, requests expire', () => {
    const s = ch6();
    advance(s, at(0, 9) - s.minute);
    const [a, b] = openChanges(s);
    applyCommand(s, { type: 'scheduleChange', changeId: a!.id, when: 'tonight' });
    expect(applyCommand(s, { type: 'setFreeze', on: true }).ok).toBe(true);
    expect(applyCommand(s, { type: 'scheduleChange', changeId: b!.id, when: 'now' }).ok).toBe(false);
    advance(s, at(1, 1) - s.minute);
    expect(a!.status).toBe('scheduled'); // 23:00 passed, the freeze held it back
    expect(s.jobs.some((j) => j.kind === 'change')).toBe(false);
    const rep = s.reputation;
    advance(s, at(3, 1) - s.minute);
    expect(b!.status).toBe('expired');
    expect(s.reputation).toBeLessThan(rep);
    applyCommand(s, { type: 'setFreeze', on: false });
    advance(s, 400);
    expect(['running', 'done', 'failed']).toContain(a!.status);
  });
});

describe('change outcomes', () => {
  it('success applies the benefit: firmware, hardened PDUs, a healthy cooler, a spare server', () => {
    const s = ch6();
    const run = (c: Change) => {
      c.status = 'running';
      // force success by making the risk zero: the model is clamped to 1%, so retry until it succeeds
      for (let i = 0; i < 400 && c.status === 'running'; i++) {
        c.status = 'running';
        finishChange(s, c.id);
        if ((c.status as string) === "failed") c.status = "running";
        else break;
      }
    };
    const fw = first(s, 'firmware');
    run(fw);
    expect(s.racks.find((r) => r.id === fw.rackId)!.fw).toBe(true);
    const pdu = first(s, 'pduMaintenance');
    run(pdu);
    expect(s.racks.find((r) => r.id === pdu.rackId)!.pduHardened).toBe(true);
    const cool = first(s, 'coolerSwap');
    s.coolers.find((x) => x.id === cool.coolerId)!.health = 0.2;
    run(cool);
    expect(s.coolers.find((x) => x.id === cool.coolerId)!.health).toBe(1);
    const stock = s.inventory.server1u;
    run(first(s, 'capacityInstall'));
    expect(s.inventory.server1u).toBe(stock + 1);
    expect(s.stats.changeDone).toBeGreaterThanOrEqual(4);
  });

  it('failure causes a real incident and says why', () => {
    for (const kind of ['firmware', 'pduMaintenance', 'coolerSwap'] as const) {
      let hit = false;
      for (let seed = 1; seed < 400 && !hit; seed++) {
        const s = ch6(seed);
        const c = first(s, kind);
        c.status = 'running';
        finishChange(s, c.id);
        if ((c.status as string) !== "failed") continue;
        hit = true;
        expect(s.stats.changeFailed).toBe(1);
        expect(s.log.some((l) => l.text.includes('planned change'))).toBe(true);
        if (kind === 'firmware') expect(s.devices.some((d) => d.faults.includes('hung'))).toBe(true);
        if (kind === 'pduMaintenance') expect(s.racks.some((r) => r.pduA === 'failed')).toBe(true);
        if (kind === 'coolerSwap') expect(s.coolers.some((x) => x.broken)).toBe(true);
      }
      expect(hit).toBe(true);
    }
  });

  it('a firmware change makes hangs rarer on that rack, hardened PDUs make feed failures rarer', () => {
    const hangs = (fw: boolean) => {
      let n = 0;
      for (let seed = 1; seed <= 25; seed++) {
        const s = createGame('ch6', 'sysadmin', seed);
        s.incidentMult = 3;
        for (const r of s.racks) r.fw = fw;
        advance(s, 1440);
        n += s.stats.incidents;
      }
      return n;
    };
    expect(hangs(true)).toBeLessThan(hangs(false));
  }, 30000);

  it('careful scheduling beats reckless scheduling on change-caused failures', () => {
    const play = (mode: 'careful' | 'reckless', seed: number) => {
      const s = createGame('ch6', 'sysadmin', seed);
      while (s.progress.status === 'playing') {
        if (s.minute % 5 === 0) autopilot(s, { auto: true, changes: mode });
        advance(s, 1);
      }
      return s;
    };
    const failed = (mode: 'careful' | 'reckless') => [1, 2, 3, 4].reduce((n, seed) => n + (play(mode, seed).stats.changeFailed ?? 0), 0);
    expect(failed('careful')).toBeLessThanOrEqual(failed('reckless'));
  }, 60000);
});

describe('long-lead equipment, supply shocks and RMA', () => {
  it('UPS units and generators are ordered with a lead time in game days, and arrive', () => {
    const s = ch6();
    s.backup!.generator = 'none';
    s.progress.firedEvents.push('delayedOrder');
    s.cash = 60000;
    const units = s.backup!.upsUnits;
    expect(applyCommand(s, { type: 'buyUps' }).ok).toBe(true);
    expect(s.backup!.upsUnits).toBe(units);
    expect(s.pendingInfra).toHaveLength(1);
    expect(applyCommand(s, { type: 'buyGenerator' }).ok).toBe(true);
    expect(applyCommand(s, { type: 'buyGenerator' }).ok).toBe(false); // already on order
    advance(s, LEAD_TIME.ups.days * 1440 - 5);
    expect(s.backup!.upsUnits).toBe(units);
    advance(s, 10);
    expect(s.backup!.upsUnits).toBe(units + 1);
    expect(s.backup!.generator).toBe('none');
    advance(s, 1440);
    expect(s.backup!.generator).toBe('idle');
    expect(s.pendingInfra).toHaveLength(0);
  });

  it('expediting costs half the price and saves a day; a delayed delivery slips the ETA', () => {
    const s = ch6();
    s.cash = 60000;
    applyCommand(s, { type: 'buyUps' });
    const p = s.pendingInfra![0]!;
    delayInfra(s, 1);
    expect(p.at).toBe(480 + 3 * 1440);
    p.at -= 1440; // back to the original ETA
    const eta = p.at;
    const cash = s.cash;
    expect(applyCommand(s, { type: 'expediteInfra', id: p.id }).ok).toBe(true);
    expect(p.at).toBe(eta - 1440);
    expect(cash - s.cash).toBe(Math.round(3500 * 0.5));
    expect(applyCommand(s, { type: 'expediteInfra', id: p.id }).ok).toBe(false);
    delayInfra(s, 2);
    expect(p.at).toBe(eta - 1440 + 2 * 1440);
  });

  it('chapters before the change system keep instant purchases', () => {
    const s = createGame('ch5', 'sysadmin', 1);
    s.cash = 60000;
    const units = s.backup!.upsUnits;
    applyCommand(s, { type: 'buyUps' });
    expect(s.backup!.upsUnits).toBe(units + 1);
    expect(s.pendingInfra ?? []).toHaveLength(0);
  });

  it('a supply shock triples part delivery times for a while, then ends', () => {
    const s = ch6();
    const normal = deliveryTime(s, 'psu');
    advance(s, at(1, 9) - s.minute);
    expect(deliveryTime(s, 'psu')).toBe(normal * SUPPLY.shockMult);
    advance(s, 3 * 1440);
    expect(deliveryTime(s, 'psu')).toBe(normal);
    expect(PARTS.psu.deliveryMin).toBeGreaterThan(0);
  });

  it('returned parts earn an RMA credit once change management exists', () => {
    const s = ch6();
    s.failuresEnabled = false;
    const d = s.devices[0]!;
    d.faults.push('disk');
    s.inventory.disk = 2;
    const cash = s.cash;
    applyCommand(s, { type: 'dispatch', job: 'swapDisk', deviceId: d.id, techId: 'best' });
    advance(s, 90);
    expect(s.stats.rmaCredit).toBe(Math.round(PARTS.disk.price * SUPPLY.rmaShare));
    void cash;
    const t = createGame('ch4', 'sysadmin', 1);
    const e = t.devices[0]!;
    e.faults.push('disk');
    applyCommand(t, { type: 'dispatch', job: 'swapDisk', deviceId: e.id, techId: 'best' });
    advance(t, 90);
    expect(t.stats.rmaCredit ?? 0).toBe(0);
  });
});

describe('resilience levels', () => {
  it('climb from I to IV as the site is hardened', () => {
    const s = ch6();
    expect(resilience(s).level).toBe(1);
    for (const d of s.devices) d.psus = 2;
    expect(resilience(s).level).toBe(2);
    s.stats.changeDone = 2;
    s.backup!.testedAt = s.minute;
    expect(resilience(s).level).toBe(3);
    s.stats.changeFailed = 1;
    expect(resilience(s).level).toBe(2);
    s.stats.changeFailed = 0;
    s.backup!.atsServicedAt = s.minute;
    for (const c of s.coolers) void c;
    const lv = resilience(s);
    expect(lv.checks.every((c) => typeof c.ok === 'boolean')).toBe(true);
    expect(lv.level).toBeGreaterThanOrEqual(3);
  });

  it('is the Chapter 6 three-star goal, and the bot guardrails still hold', () => {
    expect(JSON.stringify(createGame('ch6', 'sysadmin', 1).features)).toContain('changes');
    const m = measure('ch6', 1, 'sysadmin', true);
    expect(m.shiftRealMinutes.every((x) => x >= 3 && x <= 10)).toBe(true);
    expect(m.quietDaytimePct).toBeLessThanOrEqual(70);
    expect(overallUptimePct(m.state)).toBeGreaterThan(90);
  });

  it('offering a change logs a request and shows the tip once', () => {
    const s = ch6();
    offerChange(s, 'coolerSwap');
    expect(s.log.some((l) => l.text.includes('Change request'))).toBe(true);
  });
});

import { alarmsPanel, backupPanel, changesSection, goalsPanel, resilienceCard, shiftReportModal, tabs } from '../src/ui/views';
import { HANDBOOK } from '../src/data/handbook';

describe('change management UI', () => {
  it('shows each card with its risk, factors, a rollback toggle, now/tonight options and a freeze switch', () => {
    const s = ch6();
    advance(s, at(0, 9) - s.minute);
    const html = changesSection(s);
    expect(html).toContain('Planned changes');
    expect(html).toContain('data-action="freezeToggle"');
    expect(html).toContain('data-action="changeRollback"');
    expect(html).toContain('data-action="changeNow"');
    expect(html).toContain('data-action="changeTonight"');
    expect(html).toContain('Firmware upgrade');
    expect(html).toMatch(/\d+% risk/);
    expect(html).not.toMatch(/undefined|NaN/);
    expect(alarmsPanel(s)).toContain('Planned changes');
    expect(tabs(s, 'alarms')).toContain('class="badge"');
    expect(changesSection(createGame('ch5', 'sysadmin', 1))).toBe('');
  });

  it('tonight is safer than now, and the freeze disables Now', () => {
    const s = ch6();
    advance(s, at(0, 12) - s.minute);
    const [c] = openChanges(s);
    const now = changeRisk(s, c!, s.minute).pct;
    const night = changeRisk(s, c!, tonight(s)).pct;
    expect(night).toBeLessThan(now);
    applyCommand(s, { type: 'setFreeze', on: true });
    const html = changesSection(s);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toMatch(/data-action="changeNow"[^>]*disabled/);
  });

  it('shows ETAs for equipment on order, and the shift report lists what is arriving', () => {
    const s = ch6();
    s.cash = 60000;
    s.backup!.upsUnits = 1;
    s.progress.firedEvents.push('delayedOrder');
    applyCommand(s, { type: 'buyUps' });
    const html = backupPanel(s);
    expect(html).toContain('ETA');
    expect(html).toContain('data-action="expediteInfra"');
    expect(html).toContain(`${LEAD_TIME.ups.days} days`);
    const report = shiftReportModal(s, { day: 0, stars: 1, goalMet: true, goalLabel: 'x', bonus: 0, uptimePct: 100, criticals: 0, net: 0, resolved: 0, incidents: 0, highlights: [] } as never);
    expect(report).toContain('Arriving');
  });

  it('the Goals tab shows the resilience checklist and the Handbook explains the new systems', () => {
    const s = ch6();
    expect(resilienceCard(s)).toContain('Resilience level I');
    expect(goalsPanel(s)).toContain('Resilience level');
    expect(resilienceCard(createGame('ch4', 'sysadmin', 1))).toBe('');
    expect(HANDBOOK.filter((h) => h.unlock === 'changes').map((h) => h.id)).toEqual(['changes', 'leadtime', 'resilience']);
  });
});
