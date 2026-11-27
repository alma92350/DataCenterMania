// @vitest-environment happy-dom
import { advice } from '../src/sim/advisor';
import { applyCommand } from '../src/sim/commands';
import { advance } from '../src/sim/sim';
import { createGame } from '../src/sim/state';
import { FR, applyLanguage, tl } from '../src/ui/i18n';
import { advisorCard, alarmsPanel } from '../src/ui/views';
import '../src/data/catalog';
import '../src/data/chapters';

const ids = (s: ReturnType<typeof createGame>) => advice(s, 10).map((a) => a.id);

describe('the Advisor (v3.2)', () => {
  it('says nothing in the first chapters, where there is nothing to advise', () => {
    expect(advice(createGame('ch0', 'sysadmin', 1))).toEqual([]);
    expect(advisorCard(createGame('ch0', 'sysadmin', 1))).toBe('');
  });

  it('flags an untested generator and a missing electrician in Chapter 5, urgent first', () => {
    const s = createGame('ch5', 'sysadmin', 1);
    const a = advice(s);
    expect(a.map((x) => x.id)).toEqual(expect.arrayContaining(['testGenerator', 'electrician']));
    expect(a[0]!.urgency).toBe(2);
    expect(a.length).toBeLessThanOrEqual(3);
  });

  it('stops advising once the fix is done', () => {
    const s = createGame('ch5', 'sysadmin', 1);
    s.backup!.testedAt = s.minute;
    s.cash += 20000;
    const cand = s.candidates.find((c) => c.role === 'elec')!;
    expect(applyCommand(s, { type: 'hire', candidateId: cand.id }).ok).toBe(true);
    expect(ids(s)).not.toContain('testGenerator');
    expect(ids(s)).not.toContain('electrician');
  });

  it('notices low fuel, worn batteries and single power cords', () => {
    const s = createGame('ch6', 'sysadmin', 1);
    s.backup!.testedAt = s.minute;
    s.backup!.fuelMin = 60;
    s.backup!.health = 0.3;
    advance(s, 3);
    expect(ids(s)).toEqual(expect.arrayContaining(['refuel']));
    const t = createGame('ch6', 'sysadmin', 1);
    t.backup!.testedAt = t.minute;
    expect(advice(t).some((x) => x.id === 'spof' || x.id === 'electrician')).toBe(true);
  });

  it('suggests efficiency fixes from Chapter 7 when PUE is high', () => {
    const s = createGame('ch7', 'sysadmin', 1);
    s.failuresEnabled = false;
    advance(s, 3);
    s.site!.cooling = 'dry';
    s.cash = 50000;
    const a = ids(s);
    expect(a.some((x) => x === 'freeCooling' || x === 'setpoint' || x.startsWith('capacity'))).toBe(true);
  });

  it('renders as a card with a button to the right tab, shown on the Alarms tab, and never shows undefined', () => {
    const s = createGame('ch5', 'sysadmin', 1);
    const html = advisorCard(s);
    expect(html).toContain('Advisor');
    expect(html).toMatch(/data-action="panel" data-panel="(network|team)"/);
    expect(html).not.toMatch(/undefined|NaN/);
    expect(alarmsPanel(s)).toContain('class="advisor"');
  });

  it('is translated, with numbers and labels carried over', async () => {
    for (const x of ['Advisor', 'Go']) expect([x, x in FR]).toEqual([x, true]);
    await applyLanguage('fr');
    expect(tl('Servers on a single power cord: 3. Add a second power supply (open the SPOF overlay with O).')).toContain('3');
    expect(tl('Power is at 92%. Add capacity before you take another customer.')).toBe('Puissance est à 92 %. Ajoutez de la capacité avant de prendre un autre client.');
    expect(tl('The generator has not been tested recently. An untested generator often fails to start: have an electrician test it.')).toContain('groupe');
    await applyLanguage('en');
  });
});
