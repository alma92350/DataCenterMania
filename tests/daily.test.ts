import { at } from '../src/core/time';
import { createDaily, dailyIdFor, dailyNumber, dailySpec, dailyScore, shareLine, DAILY_MODIFIERS } from '../src/sim/daily';
import { objectivesFor, chapterEnd } from '../src/sim/objectives';
import { advance } from '../src/sim/sim';
import { CHAPTERS } from '../src/data/chapters';
import { autopilot } from './autopilot';
import { step } from '../src/sim/sim';

describe('daily challenge', () => {
  it('ids and numbers come from the local date', () => {
    expect(dailyIdFor(new Date(2026, 10, 21, 15, 0))).toBe('2026-11-21');
    expect(dailyNumber('2026-11-20')).toBe(1);
    expect(dailyNumber('2026-11-21')).toBe(2);
    expect(dailyNumber('2027-11-20')).toBe(366);
  });

  it('the scenario is deterministic per day and varies across days', () => {
    expect(dailySpec('2026-12-01')).toEqual(dailySpec('2026-12-01'));
    const specs = Array.from({ length: 14 }, (_, i) => dailySpec(dailyIdFor(new Date(2026, 11, 1 + i))));
    expect(new Set(specs.map((d) => d.chapter)).size).toBeGreaterThan(1);
    expect(new Set(specs.map((d) => d.modifier)).size).toBeGreaterThan(1);
    expect(new Set(specs.map((d) => d.seed)).size).toBe(14);
  });

  it('is a single shift with its own objectives and the modifier applied', () => {
    const spec = dailySpec('2026-12-03');
    const s = createDaily('2026-12-03');
    expect(s.dailyId).toBe('2026-12-03');
    expect(s.chapter).toBe(spec.chapter);
    expect(chapterEnd(s)).toBe(at(0, 22));
    expect(chapterEnd(s)).toBeLessThan(CHAPTERS[s.chapter].endMinute);
    expect(objectivesFor(s)).not.toBe(CHAPTERS[s.chapter].objectives);
    expect(objectivesFor(s)).toHaveLength(3);
    expect(s.seenTips.length).toBeGreaterThan(5); // veterans: no tutorial tips
    expect(DAILY_MODIFIERS[spec.modifier]).toBeDefined();
  });

  it('every modifier changes the world', () => {
    const base = createDaily('2026-12-03');
    for (const m of Object.keys(DAILY_MODIFIERS) as (keyof typeof DAILY_MODIFIERS)[]) {
      const s = createDaily('2026-12-03', m);
      const changed = s.ambient !== base.ambient || s.cash !== base.cash || (s.incidentMult ?? 1) !== 1 || (s.demandMult ?? 1) !== 1;
      expect(changed || m === base.dailyModifier).toBe(true);
    }
  });

  it('plays to the end and produces a score and a share line', () => {
    const s = createDaily('2026-12-05');
    while (s.progress.status === 'playing') {
      if (s.minute % 5 === 0) autopilot(s);
      step(s);
    }
    expect(s.minute).toBe(at(0, 22));
    expect(s.shiftReports).toHaveLength(1);
    const line = shareLine(s, 'https://example.test/');
    expect(line).toMatch(/^DataCenterMania Daily #\d+ [★☆]{3}/);
    expect(line).toContain('%');
    expect(line).toContain('https://example.test/');
    expect(dailyScore(s)).toBeGreaterThan(0);
  });

  it('more stars always beat fewer stars', () => {
    const a = createDaily('2026-12-05');
    const b = createDaily('2026-12-05');
    advance(a, 30);
    advance(b, 30);
    a.progress.stars = 2;
    b.progress.stars = 1;
    b.cash += 100000;
    expect(dailyScore(a)).toBeGreaterThan(dailyScore(b));
  });
});
