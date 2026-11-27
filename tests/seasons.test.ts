// @vitest-environment happy-dom
import { MINUTES_PER_DAY } from '../src/core/time';
import { advance } from '../src/sim/sim';
import { createSandbox, DEFAULT_SANDBOX } from '../src/sim/sandbox';
import { createSeasons, heatwaveActive, seasonOf, SEASON, SEASONS } from '../src/sim/seasons';
import { surgeFactor } from '../src/sim/site';
import { createGame } from '../src/sim/state';
import { serialize, deserialize } from '../src/sim/save';
import { FR, applyLanguage, tl } from '../src/ui/i18n';
import { sandboxCard, topBar } from '../src/ui/views';
import '../src/data/catalog';
import '../src/data/chapters';

const sandbox = (seed = 1, seasons = true) => {
  const s = createSandbox({ ...DEFAULT_SANDBOX, seasons, cyber: false }, 'sysadmin', seed);
  s.failuresEnabled = false;
  return s;
};

describe('sandbox seasons (v3.4)', () => {
  it('are off unless chosen, so existing sandboxes do not change', () => {
    expect(sandbox(1, false).season).toBeUndefined();
    expect(seasonOf(sandbox(1, false))).toBeNull();
    expect(sandbox().season).toBeDefined();
  });

  it('turn every seven days: spring, summer, autumn, winter, then spring again', () => {
    const s = sandbox();
    const seen: string[] = [];
    for (let d = 0; d < SEASON.daysPer * 5; d++) {
      const id = seasonOf(s)!.season.id;
      if (seen[seen.length - 1] !== id) seen.push(id);
      advance(s, MINUTES_PER_DAY);
    }
    expect(seen.slice(0, 5)).toEqual(['spring', 'summer', 'autumn', 'winter', 'spring']);
  });

  it('move the air temperature with the season', () => {
    const s = sandbox();
    s.rampPerDay = 0;
    const byId: Record<string, number> = {};
    for (let d = 0; d < SEASON.daysPer * 4; d++) {
      advance(s, MINUTES_PER_DAY);
      const info = seasonOf(s)!;
      if (!heatwaveActive(s)) byId[info.season.id] = s.ambient;
    }
    expect(byId.summer!).toBeGreaterThan(byId.spring!);
    expect(byId.winter!).toBeLessThan(byId.autumn!);
    expect(byId.winter!).toBeLessThan(byId.summer! - 8);
  });

  it('bring heatwaves in summer only, and holiday rushes in winter only', () => {
    let heat = 0;
    let rush = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const s = sandbox(seed);
      for (let d = 0; d < SEASON.daysPer * 4; d++) {
        advance(s, MINUTES_PER_DAY);
        const id = seasonOf(s)!.season.id;
        if (heatwaveActive(s) && id !== 'summer' && id !== 'autumn') heat += 1000; // a wave may spill over by two days
        if (surgeFactor(s) > 1 && id !== 'winter' && id !== 'autumn') rush += 1000;
        if (heatwaveActive(s) && id === 'summer') heat++;
        if (surgeFactor(s) > 1 && id === 'winter') rush++;
      }
    }
    expect(heat).toBeGreaterThan(0);
    expect(heat).toBeLessThan(1000);
    expect(rush).toBeGreaterThan(0);
    expect(rush).toBeLessThan(1000);
  }, 120000);

  it('are part of the saved game and continue identically after loading', () => {
    const s = sandbox(3);
    advance(s, MINUTES_PER_DAY * 9);
    const copy = deserialize(serialize(s));
    advance(s, MINUTES_PER_DAY * 12);
    advance(copy, MINUTES_PER_DAY * 12);
    expect(serialize(copy)).toBe(serialize(s));
  }, 60000);

  it('can start in any season', () => {
    const s = createGame('ch3', 'sysadmin', 1);
    createSeasons(s, 3);
    expect(seasonOf(s)!.season.id).toBe('winter');
  });

  it('show in the sandbox card and the clock, and have French', async () => {
    expect(sandboxCard({ ...DEFAULT_SANDBOX, seasons: true }, true, null)).toContain('data-key="seasons"');
    const s = sandbox();
    expect(topBar(s, 1, 1)).toContain(SEASONS[0].icon);
    for (const season of SEASONS) for (const x of [season.name, season.blurb]) expect([x, x in FR]).toEqual([x, true]);
    await applyLanguage('fr');
    expect(tl('🌞 Summer begins. Hotter air weakens your coolers, and heatwaves are possible.')).toBe('🌞 Été commence. L’air plus chaud affaiblit vos refroidisseurs, et des canicules sont possibles.');
    expect(tl('🔥 Heatwave! The air is 7 degrees hotter for 2 days.')).toContain('Canicule');
    await applyLanguage('en');
  });
});
