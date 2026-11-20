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

  it.each(['ch1', 'ch2', 'ch3'] as const)('%s: every shift fits a session, and quiet time stays bounded', (ch) => {
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
});
