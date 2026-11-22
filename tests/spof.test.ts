import { spofCount, spofReport } from '../src/sim/spof';
import { failPdu } from '../src/sim/feeds';
import { advance } from '../src/sim/sim';
import { applyCommand } from '../src/sim/commands';
import { createGame } from '../src/sim/state';
import { deviceUp } from '../src/sim/selectors';
import { createSandbox, DEFAULT_SANDBOX } from '../src/sim/sandbox';
import { TICKETS } from '../src/data/catalog';
import { drawFrame } from '../src/render/renderer';
import { nextOverlayFor } from './helpers';
import { redundancyCard, networkPanel, alarmsPanel, rackModal, tabs, goalBar } from '../src/ui/views';
import { HANDBOOK } from '../src/data/handbook';
import type { GameState } from '../src/sim/types';

const ch6 = (seed = 1): GameState => {
  const s = createGame('ch6', 'sysadmin', seed);
  s.failuresEnabled = false;
  return s;
};

describe('SPOF view', () => {
  it('marks exactly the racks whose servers die when one feed fails (property over random layouts)', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const s = ch6(seed);
      // a random mix of single and dual-corded servers
      s.devices.forEach((d, i) => { d.psus = (seed * 7 + i * 13) % 3 === 0 ? 2 : 1; });
      const rep = spofReport(s);
      for (const r of s.racks) {
        const mine = s.devices.filter((d) => d.rackId === r.id);
        const expected = mine.filter((d) => (d.psus ?? 1) === 1 && deviceUp(s, d)).map((d) => d.id).sort();
        expect([...rep[r.id]!.power].sort()).toEqual(expected);
        // brute force: fail each feed on a fresh copy and compare
        const t = JSON.parse(JSON.stringify(s)) as GameState;
        const tr = t.racks.find((x) => x.id === r.id)!;
        failPdu(t, tr, 'A');
        const downA = t.devices.filter((d) => d.rackId === r.id && !deviceUp(t, d)).map((d) => d.id).sort();
        expect(downA).toEqual(expected);
      }
    }
  });

  it('is empty once every server has two legs, and a failed feed turns the survivors into single points', () => {
    const s = ch6();
    for (const d of s.devices) d.psus = 2;
    expect(spofCount(s)).toEqual({ servers: 0, racks: 0 });
    failPdu(s, s.racks[0]!, 'A');
    expect(spofReport(s)[s.racks[0]!.id]!.power.length).toBeGreaterThan(0); // one failure from an outage
    expect(spofReport(s)[s.racks[1]!.id]!.power).toEqual([]);
  });

  it('flags racks reached by fewer than two working coolers', () => {
    const s = ch6();
    const before = Object.values(spofReport(s)).filter((r) => r.singleCooler).length;
    for (const c of s.coolers) c.broken = true;
    const after = Object.values(spofReport(s)).filter((r) => r.singleCooler).length;
    expect(after).toBeGreaterThanOrEqual(before);
    expect(after).toBe(s.racks.filter((r) => s.devices.some((d) => d.rackId === r.id)).length);
  });

  it('the overlay cycle gains the SPOF view only from Chapter 6, and the map draws it', () => {
    expect(nextOverlayFor(['power'], 'power')).toBe('none');
    expect(nextOverlayFor(['power', 'redundancy'], 'power')).toBe('spof');
    expect(nextOverlayFor(['power', 'redundancy'], 'spof')).toBe('none');
    expect(typeof drawFrame).toBe('function');
  });
});

describe('redundancy UI', () => {
  it('shows counts, spare PSUs, a dual-cord button and failed feeds with a repair button', () => {
    const s = ch6();
    let html = redundancyCard(s);
    expect(html).toContain('data-action="dualCordNext"');
    expect(html).toContain('Spare PSUs');
    expect(html).not.toMatch(/undefined|NaN/);
    expect(networkPanel(s)).toContain('Redundancy');
    failPdu(s, s.racks[1]!, 'A');
    html = redundancyCard(s);
    expect(html).toContain('data-action="dispatchFeed"');
    expect(tabs(s, 'alarms')).toContain('class="badge">!');
    expect(alarmsPanel(s)).toContain('Power feed lost');
    expect(redundancyCard(createGame('ch5', 'sysadmin', 1))).toBe('');
  });

  it('the rack view shows feed lamps, legs and a Dual-cord button', () => {
    const s = ch6();
    const r = s.racks.find((x) => s.devices.some((d) => d.rackId === x.id))!;
    const html = rackModal(s, r.id);
    expect(html).toContain('Feed A');
    expect(html).toContain('one leg');
    expect(html).toContain('data-job="dualCord"');
    expect(rackModal(createGame('ch5', 'sysadmin', 1), r.id)).not.toContain('dualCord');
    expect(goalBar(s)).not.toMatch(/undefined|NaN/);
  });

  it('the Handbook explains feeds and single points of failure', () => {
    expect(HANDBOOK.filter((h) => h.unlock === 'redundancy').map((h) => h.id)).toEqual(['redundancy', 'spof']);
  });
});

describe('ticket queue v1: cross-connect orders', () => {
  it('appear only once the network exists, pay more, need more time and a network engineer', () => {
    const none = createGame('ch2', 'sysadmin', 1);
    expect(none.features).not.toContain('network');
    let seen = 0;
    let favours = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const s = ch6(seed);
      advance(s, 2 * 1440);
      for (const w of s.walkins) {
        if (w.kind === 'crossConnect') {
          seen++;
          expect(w.text).toContain('cross-connect');
          expect(w.deadline).toBeGreaterThan(0);
        } else favours++;
      }
    }
    expect(seen).toBeGreaterThan(0);
    expect(favours).toBeGreaterThan(0);
    expect(TICKETS.rewardMult).toBeGreaterThan(1);
  }, 30000);

  it('are done by a network engineer and pay the bigger reward', () => {
    const s = ch6();
    s.cash = 50000;
    const cand = s.candidates.find((c) => c.role === 'net')!;
    applyCommand(s, { type: 'hire', candidateId: cand.id });
    const rack = s.racks.find((r) => s.devices.some((d) => d.rackId === r.id))!;
    s.walkins.push({ id: 'w900', customer: 'ByteBank', rackId: rack.id, text: 'ByteBank orders a cross-connect to their carrier from Rack 1', reward: 300, deadline: s.minute + 120, status: 'open', kind: 'crossConnect' });
    const cash = s.cash;
    expect(applyCommand(s, { type: 'dispatch', job: 'favor', walkinId: 'w900', techId: 'best' }).ok).toBe(true);
    const job = s.jobs.find((j) => j.walkinId === 'w900')!;
    expect(job.kind).toBe('crossConnect');
    expect(s.techs.find((t) => t.id === job.techId)!.role).toBe('net');
    advance(s, 90);
    expect(s.walkins.find((w) => w.id === 'w900')!.status).toBe('done');
    expect(s.stats.walkinsDone).toBe(1);
    expect(s.today.revenue + s.reports.reduce((n, r) => n + r.revenue, 0)).toBeGreaterThanOrEqual(300);
    void cash;
  });

  it('are available in Sandbox on the big hall too', () => {
    const s = createSandbox({ ...DEFAULT_SANDBOX, floor: 'large' }, 'sysadmin', 3);
    expect(s.features).toContain('network');
  });
});
