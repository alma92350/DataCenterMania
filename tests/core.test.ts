import { createRng, rand, randInt, pick, chance } from '../src/core/rng';
import {
  MINUTES_PER_DAY, dayOf, minuteOfDay, weekdayOf, formatClock, gameMinutesPerRealSecond, isNight,
} from '../src/core/time';

describe('rng', () => {
  it('is deterministic for a given seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 5 }, () => rand(a));
    const seqB = Array.from({ length: 5 }, () => rand(b));
    expect(seqA).toEqual(seqB);
  });

  it('differs across seeds and stays in [0,1)', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(rand(a)).not.toEqual(rand(b));
    const r = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rand(r);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('state is a plain serializable object', () => {
    const r = createRng(9);
    rand(r);
    const copy = JSON.parse(JSON.stringify(r));
    expect(rand(copy)).toEqual(rand(r));
  });

  it('randInt is inclusive and pick/chance behave', () => {
    const r = createRng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) seen.add(randInt(r, 1, 3));
    expect([...seen].sort()).toEqual([1, 2, 3]);
    expect(['a', 'b']).toContain(pick(r, ['a', 'b']));
    expect(chance(r, 0)).toBe(false);
    expect(chance(r, 1)).toBe(true);
  });
});

describe('time model (PRD §3.1)', () => {
  it('splits absolute minutes into day / minute of day / weekday', () => {
    expect(MINUTES_PER_DAY).toBe(1440);
    expect(dayOf(1440 * 2 + 5)).toBe(2);
    expect(minuteOfDay(1440 * 2 + 5)).toBe(5);
    // day 0 is a Monday
    expect(weekdayOf(0)).toBe(0);
    expect(weekdayOf(1440 * 4)).toBe(4); // Friday
    expect(weekdayOf(1440 * 7)).toBe(0);
  });

  it('formats a clock', () => {
    expect(formatClock(1440 * 4 + 18 * 60 + 5)).toBe('Fri 18:05');
  });

  it('maps speeds to game minutes per real second', () => {
    expect(gameMinutesPerRealSecond(0)).toBe(0);
    expect(gameMinutesPerRealSecond(1)).toBe(3);
    expect(gameMinutesPerRealSecond(2)).toBe(6);
    expect(gameMinutesPerRealSecond(4)).toBe(12);
  });

  it('knows the night window 22:00-06:00', () => {
    expect(isNight(23 * 60)).toBe(true);
    expect(isNight(5 * 60 + 59)).toBe(true);
    expect(isNight(6 * 60)).toBe(false);
    expect(isNight(12 * 60)).toBe(false);
  });
});
