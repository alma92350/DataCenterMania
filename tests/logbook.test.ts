// @vitest-environment happy-dom
import { advance } from '../src/sim/sim';
import { createGame } from '../src/sim/state';
import { createSandbox, DEFAULT_SANDBOX } from '../src/sim/sandbox';
import { FR } from '../src/ui/i18n';
import { entryFor, LOGBOOK_MAX, logbookStats, type RunEntry } from '../src/ui/logbook';
import { Persistence, type KeyValueStore } from '../src/ui/storage';
import { logbookCard } from '../src/ui/views';
import '../src/data/catalog';

class Mem implements KeyValueStore {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
}
const run = (o: Partial<RunEntry> = {}): RunEntry => ({ t: 1_700_000_000_000, chapter: 'ch1', difficulty: 'sysadmin', mode: 'chapter', won: true, stars: 2, uptime: 99, profit: 1000, days: 3, ...o });

describe('career logbook (v3.5)', () => {
  it('builds an entry from a finished game', () => {
    const s = createGame('ch1', 'sysadmin', 1);
    advance(s, 600);
    s.progress.status = 'won';
    s.progress.stars = 2;
    const e = entryFor(s, 42);
    expect(e).toMatchObject({ t: 42, chapter: 'ch1', difficulty: 'sysadmin', mode: 'chapter', won: true, stars: 2 });
    expect(e.uptime).toBeGreaterThan(0);
    expect(e.days).toBeGreaterThanOrEqual(1);
    s.progress.status = 'lost';
    expect(entryFor(s, 43)).toMatchObject({ won: false, stars: 0 });
    const sb = createSandbox(DEFAULT_SANDBOX, 'sysadmin', 1);
    expect(entryFor(sb, 1)).toMatchObject({ mode: 'sandbox' });
    expect(typeof entryFor(sb, 1).score).toBe('number');
  });

  it('computes win rate, records, streak and a trend', () => {
    expect(logbookStats([])).toMatchObject({ runs: 0, winRate: null, bestUptime: null, trend: null, streak: 0 });
    const earlier = [1, 1, 0, 1, 1].map((st) => run({ stars: st, won: st > 0 }));
    const later = [2, 3, 2, 3, 3].map((st) => run({ stars: st, uptime: 98 + st / 10, profit: st * 1000 }));
    const st = logbookStats([...earlier, ...later]);
    expect(st.runs).toBe(10);
    expect(st.wins).toBe(9);
    expect(st.winRate).toBe(90);
    expect(st.streak).toBe(7);
    expect(st.bestUptime).toBe(99);
    expect(st.bestProfit).toBe(3000);
    expect(st.trend!).toBeGreaterThan(1);
    expect(logbookStats([run({ mode: 'sandbox', days: 12, stars: 0 }), run({ mode: 'sandbox', days: 20, stars: 0 })]).bestSandboxDays).toBe(20);
  });

  it('keeps the last 100 runs, survives corrupt data, and is empty for a new browser', () => {
    const m = new Mem();
    const p = new Persistence(m);
    expect(p.loadLogbook()).toEqual([]);
    for (let i = 0; i < LOGBOOK_MAX + 5; i++) p.addLogEntry(run({ t: i }));
    const all = p.loadLogbook();
    expect(all.length).toBe(LOGBOOK_MAX);
    expect(all[0]!.t).toBe(5);
    m.setItem('dcm.logbook.v1', 'nonsense');
    expect(p.loadLogbook()).toEqual([]);
    m.setItem('dcm.logbook.v1', '{"a":1}');
    expect(p.loadLogbook()).toEqual([]);
  });

  it('renders the records and the latest runs, never undefined, with French', () => {
    expect(logbookCard([])).toContain('Your finished runs will appear here.');
    const html = logbookCard([run(), run({ won: false, stars: 0, mode: 'daily' }), run({ mode: 'sandbox', days: 9 })]);
    expect(html).toContain('Win rate');
    expect(html).toContain('✅');
    expect(html).toContain('❌');
    expect(html).not.toMatch(/undefined|NaN/);
    for (const x of ['Logbook', 'Your finished runs will appear here.', 'runs', 'Win rate', 'Winning streak', 'Best uptime', 'Best profit', 'Longest sandbox']) expect([x, x in FR]).toEqual([x, true]);
  });
});
