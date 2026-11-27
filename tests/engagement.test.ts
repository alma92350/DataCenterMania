import { measure } from './engagement';

/**
 * Engagement guardrails (PRD §19, §21.10): pacing regressions fail the build like bugs.
 * Measured with the autopilot bot on Sysadmin; real minutes are simulated time at 1×
 * (players also spend paused time reading tips and report cards).
 */
describe('engagement guardrails', () => {
  it('the tutorial is a single short shift', () => {
    const m = measure('ch0', 1);
    expect(m.state.progress.status).toBe('won');
    expect(m.realMinutes).toBeGreaterThan(3);
    expect(m.realMinutes).toBeLessThanOrEqual(6);
    expect(m.shiftRealMinutes).toHaveLength(1);
  });

  it('the tutorial ★★★ needs a deliberate action (the passive bot does not get it)', () => {
    expect(measure('ch0', 1).state.progress.stars).toBeLessThan(3);
  });

  it.each(['ch1', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6', 'ch7', 'ch8'] as const)('%s: every shift fits a session, and quiet time stays bounded', (ch) => {
    const runs = [1, 2].map((seed) => measure(ch, seed));
    for (const m of runs) {
      for (const minutes of m.shiftRealMinutes) {
        expect(minutes).toBeGreaterThanOrEqual(4);
        expect(minutes).toBeLessThanOrEqual(9);
      }
      expect(m.longestQuietRealSec).toBeLessThanOrEqual(150);
    }
    const quiet = runs.reduce((a, m) => a + m.quietDaytimePct, 0) / runs.length;
    expect(quiet).toBeLessThanOrEqual(70);
  });

  it('★★★ is a real mastery goal: the default bot rarely gets it (PRD v0.5 exit criterion ≤ 20%)', () => {
    const runs = (['ch0', 'ch1', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6', 'ch7', 'ch8'] as const).flatMap((ch) => [1, 2].map((seed) => measure(ch, seed)));
    const three = runs.filter((m) => m.state.progress.stars === 3).length;
    expect(runs.every((m) => m.state.progress.status === 'won')).toBe(true);
    expect(three / runs.length).toBeLessThanOrEqual(0.2);
  }, 90000);

  it('workload stays flat from chapter 2 to 4 once you delegate to a Shift Lead (PRD v0.6 exit criterion)', () => {
    const apm = (ch: 'ch2' | 'ch3' | 'ch4', auto: boolean) => [1, 2].reduce((sum, seed) => sum + measure(ch, seed, 'sysadmin', auto).actionsPerMinute, 0) / 2;
    const base = apm('ch2', true);
    expect(base).toBeGreaterThan(0);
    expect(apm('ch3', true) / base).toBeLessThanOrEqual(1.6);
    expect(apm('ch4', true) / base).toBeLessThanOrEqual(1.6);
  });

  it('delegating really removes work: the Shift Lead cuts actions per minute by more than half', () => {
    const manual = measure('ch3', 1).actionsPerMinute;
    const delegated = measure('ch3', 1, 'sysadmin', true).actionsPerMinute;
    expect(delegated).toBeLessThan(manual * 0.5);
  });
});
