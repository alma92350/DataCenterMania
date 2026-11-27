import { analyze, formatReport, sessionMinutes, type PlaytestExport } from '../src/ui/playtest';
import { BEAT_EVERY_MS, Telemetry, type TelemetryEvent } from '../src/ui/telemetry';
import { feedbackBox, settingsForm } from '../src/ui/views';
import { DEFAULT_SETTINGS } from '../src/ui/storage';

const MIN = 60000;
const ev = (t: number, type: string, data?: TelemetryEvent['data']): TelemetryEvent => ({ t, type, ...(data ? { data } : {}) });
const won = (t: number, chapter: string) => ev(t, 'chapterEnd', { chapter, won: true });
const start = (t: number, chapter: string) => ev(t, 'chapterStart', { chapter });

describe('playtest analysis (PRD v2 §10)', () => {
  it('splits sessions at 30-minute gaps and measures each', () => {
    const beats = [0, 2, 4, 6, 8, 10, 100, 102].map((m) => ev(m * MIN, 'active'));
    const s = sessionMinutes(beats);
    expect(s).toEqual([10, 2]);
    expect(sessionMinutes([])).toEqual([]);
  });

  it('computes tutorial completion, Ch5 to Ch6 continuation, Ch10 completion and the rest', () => {
    const files: PlaytestExport[] = [
      { events: [start(0, 'ch0'), won(1, 'ch0'), won(2, 'ch5'), start(3, 'ch6'), won(4, 'ch10'), ev(5 * MIN, 'active'), ev(15 * MIN, 'active'),
        ev(6, 'feedback', { kind: 'rating', value: 5 }), ev(7, 'feedback', { kind: 'tag', value: 'unfair' })] },
      { events: [start(0, 'ch0'), ev(0, 'active'), ev(10 * MIN, 'active'), ev(8, 'feedback', { kind: 'rating', value: 4 })] },
    ];
    const m = Object.fromEntries(analyze(files).map((x) => [x.id, x]));
    expect(m.tutorial!.value).toBe(50);
    expect(m.tutorial!.pass).toBe(false);
    expect(m.ch5ch6!.value).toBe(100);
    expect(m.ch5ch6!.pass).toBe(true);
    expect(m.ch10!.value).toBe(50);
    expect(m.session!.value).toBe(10);
    expect(m.session!.pass).toBe(true);
    expect(m.unfair!.value).toBe(1);
    expect(m.unfair!.pass).toBe(false);
    expect(m.credibility!.value).toBe(4.5);
    expect(m.credibility!.pass).toBe(true);
  });

  it('says "no data" instead of guessing', () => {
    for (const m of analyze([{ events: [] }])) if (m.id !== 'unfair') expect(m).toMatchObject({ value: null, pass: null });
    expect(formatReport([{ events: [] }])).toContain('no data');
    expect(formatReport([{ events: [] }, { events: [] }])).toContain('2 tester logs');
  });
});

describe('telemetry additions', () => {
  const memory = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  };

  it('beats at most once per interval, records feedback, and exports the version', () => {
    let now = 1_000_000;
    const t = new Telemetry(memory(), () => true, () => now);
    t.beat();
    t.beat();
    now += BEAT_EVERY_MS + 1;
    t.beat();
    expect(t.load().filter((e) => e.type === 'active').length).toBe(2);
    t.feedback('rating', 4);
    t.feedback('tag', 'unfair');
    expect(t.load().filter((e) => e.type === 'feedback').map((e) => e.data)).toEqual([{ kind: 'rating', value: 4 }, { kind: 'tag', value: 'unfair' }]);
    expect(JSON.parse(t.export()).version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('does nothing while telemetry is off', () => {
    const t = new Telemetry(memory(), () => false);
    t.beat();
    t.feedback('rating', 5);
    expect(t.load()).toEqual([]);
  });

  it('shows the feedback buttons only when the play log is on', () => {
    expect(settingsForm(DEFAULT_SETTINGS)).not.toContain('data-action="feedback"');
    const on = settingsForm({ ...DEFAULT_SETTINGS, telemetry: true });
    expect(on).toContain('data-action="feedback"');
    expect(feedbackBox().match(/data-kind="rating"/g)!.length).toBe(5);
  });
});
