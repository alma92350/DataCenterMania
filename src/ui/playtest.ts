import type { TelemetryEvent } from './telemetry';

/** One tester's exported play log (Telemetry.export). */
export interface PlaytestExport {
  version?: string;
  exportedAt?: number;
  events: TelemetryEvent[];
}

export interface Metric {
  id: string;
  label: string;
  target: string;
  value: number | null;
  unit: string;
  /** true/false against the target, null when there is not enough data. */
  pass: boolean | null;
}

const share = (n: number, d: number): number | null => (d === 0 ? null : (n / d) * 100);
const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const SESSION_GAP_MS = 30 * 60 * 1000;

/** Minutes of each play session in one log: heartbeats closer than 30 minutes belong together. */
export function sessionMinutes(events: TelemetryEvent[]): number[] {
  const beats = events.filter((e) => e.type === 'active' || e.type === 'session').map((e) => e.t).sort((a, b) => a - b);
  const out: number[] = [];
  if (!beats.length) return out;
  let start = beats[0]!;
  let last = start;
  for (const t of beats.slice(1)) {
    if (t - last > SESSION_GAP_MS) {
      out.push(Math.max(1, (last - start) / 60000));
      start = t;
    }
    last = t;
  }
  out.push(Math.max(1, (last - start) / 60000));
  return out;
}

const chapterWon = (e: TelemetryEvent[], chapter: string) => e.some((x) => x.type === 'chapterEnd' && x.data?.chapter === chapter && x.data?.won === true);
const chapterStarted = (e: TelemetryEvent[], chapter: string) => e.some((x) => x.type === 'chapterStart' && x.data?.chapter === chapter);

/** The PRD v2 §10 metrics that a play log can answer, over any number of testers. */
export function analyze(files: PlaytestExport[]): Metric[] {
  const logs = files.map((f) => f.events ?? []);
  const started = (c: string) => logs.filter((e) => chapterStarted(e, c));
  const ratings = logs.flat().filter((e) => e.type === 'feedback' && e.data?.kind === 'rating').map((e) => Number(e.data?.value));
  const unfair = logs.flat().filter((e) => e.type === 'feedback' && e.data?.kind === 'tag' && e.data?.value === 'unfair').length;
  const sessions = logs.flatMap(sessionMinutes);
  const tutorial = share(started('ch0').filter((e) => chapterWon(e, 'ch0')).length, started('ch0').length);
  const ch5 = logs.filter((e) => chapterWon(e, 'ch5'));
  const cont = share(ch5.filter((e) => chapterStarted(e, 'ch6')).length, ch5.length);
  const anyStart = logs.filter((e) => e.some((x) => x.type === 'chapterStart'));
  const ch10 = share(anyStart.filter((e) => chapterWon(e, 'ch10')).length, anyStart.length);
  const med = median(sessions);
  const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
  return [
    { id: 'tutorial', label: 'Tutorial completion', target: '> 80%', value: tutorial, unit: '%', pass: tutorial === null ? null : tutorial > 80 },
    { id: 'ch5ch6', label: 'Ch5 → Ch6 continuation', target: '> 60%', value: cont, unit: '%', pass: cont === null ? null : cont > 60 },
    { id: 'session', label: 'Median session length', target: '8–12 min', value: med, unit: 'min', pass: med === null ? null : med >= 8 && med <= 12 },
    { id: 'ch10', label: 'Ch10 completion', target: '> 15% of starters', value: ch10, unit: '%', pass: ch10 === null ? null : ch10 > 15 },
    { id: 'unfair', label: '“Unfair outage” reports', target: '≈ 0', value: logs.length ? unfair : null, unit: '', pass: logs.length ? unfair === 0 : null },
    { id: 'credibility', label: '“Feels like the job” rating', target: '≥ 4 / 5', value: avg, unit: '/5', pass: avg === null ? null : avg >= 4 },
  ];
}

export function formatReport(files: PlaytestExport[]): string {
  const rows = analyze(files).map((m) => `${m.pass === null ? '·' : m.pass ? '✅' : '❌'} ${m.label.padEnd(30)} ${m.value === null ? 'no data' : `${Math.round(m.value * 10) / 10}${m.unit}`.padEnd(9)}  (target ${m.target})`);
  return [`Playtest report: ${files.length} tester log${files.length === 1 ? '' : 's'}`, ...rows].join('\n');
}
