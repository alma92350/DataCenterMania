import type { KeyValueStore } from './storage';

/**
 * Opt-in local telemetry (PRD v2 F14): a short event log kept in this browser so playtesters can
 * export it by hand. Nothing is ever sent anywhere.
 */
export interface TelemetryEvent {
  t: number;
  type: string;
  data?: Record<string, string | number | boolean>;
}

export const TELEMETRY_KEY = 'dcm.telemetry.v1';
export const TELEMETRY_MAX = 500;

export class Telemetry {
  constructor(private readonly store: KeyValueStore | null, private enabled: () => boolean, private now: () => number = Date.now) {}

  load(): TelemetryEvent[] {
    try {
      const raw = this.store?.getItem(TELEMETRY_KEY);
      return raw ? (JSON.parse(raw) as TelemetryEvent[]) : [];
    } catch {
      return [];
    }
  }

  record(type: string, data?: TelemetryEvent['data']): void {
    if (!this.enabled()) return;
    try {
      const all = this.load();
      all.push({ t: this.now(), type, ...(data ? { data } : {}) });
      if (all.length > TELEMETRY_MAX) all.splice(0, all.length - TELEMETRY_MAX);
      this.store?.setItem(TELEMETRY_KEY, JSON.stringify(all));
    } catch {
      /* storage full or blocked: telemetry is optional */
    }
  }

  clear(): void {
    try {
      this.store?.removeItem(TELEMETRY_KEY);
    } catch {
      /* ignore */
    }
  }

  /** A readable summary for the playtest export. */
  export(): string {
    const events = this.load();
    const starts = events.filter((e) => e.type === 'chapterStart').length;
    const ends = events.filter((e) => e.type === 'chapterEnd');
    return JSON.stringify({
      exportedAt: this.now(),
      summary: { sessions: events.filter((e) => e.type === 'session').length, chapterStarts: starts, chapterEnds: ends.length, wins: ends.filter((e) => e.data?.won === true).length },
      events,
    }, null, 2);
  }
}
