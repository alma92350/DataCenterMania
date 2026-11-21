import { MORALE } from '../data/catalog';
import { SAVE_VERSION } from './state';
import { assignMissingNames } from './naming';
import type { GameState, PartId } from './types';

export function serialize(s: GameState): string {
  return JSON.stringify(s);
}

type AnyRecord = Record<string, unknown>;

/** v1 -> v2: chapter 3 fields (aisles, cooler condition, uplinks, roles, fatigue, bandwidth). */
function migrateV1(d: AnyRecord): void {
  for (const r of d.racks as AnyRecord[]) {
    r.facing ??= 'S';
    r.switchFailed ??= false;
    r.maintenance ??= false;
    r.recirculation ??= 0;
  }
  for (const c of d.coolers as AnyRecord[]) {
    c.health ??= 1;
    c.broken ??= false;
  }
  for (const t of d.techs as AnyRecord[]) {
    t.fatigue ??= 0;
    t.morale ??= MORALE.base;
    t.onBreak ??= false;
  }
  for (const c of d.candidates as AnyRecord[]) c.role ??= 'hw';
  for (const c of d.contracts as AnyRecord[]) c.bandwidthPerUnit ??= 0;
  for (const r of d.reports as AnyRecord[]) r.network ??= 0;
  const inv = d.inventory as Record<PartId, number>;
  for (const p of ['crac', 'filter', 'switch', 'coffee'] as const) inv[p] ??= 0;
  d.uplinks ??= [];
  d.bandwidthUsed ??= 0;
  d.coffeeLevel ??= 0;
  d.version = 2;
}


/** v2 -> v3: live money, shifts, walk-ins, projects, fx. */
function migrateV2(d: AnyRecord): void {
  const day = Math.floor((d.minute as number) / 1440);
  d.today ??= { day, revenue: 0, penalties: 0, salaries: 0, electricity: 0, rent: 0, network: 0, net: 0, slaMet: 0, slaBreached: 0 };
  d.pendingRevenue ??= {};
  d.fx ??= [];
  d.fxSeq ??= 1;
  d.shift ??= null;
  d.shiftReports ??= [];
  d.pendingShiftReport ??= null;
  d.walkins ??= [];
  d.projects ??= [];
  (d.stats as AnyRecord).peakTemp ??= 0;
  d.version = 3;
}

/** v3 -> v4: post-mortems. */
function migrateV3(d: AnyRecord): void {
  d.outages ??= {};
  d.postMortems ??= [];
  d.pendingPostMortem ??= null;
  d.alarmHistory ??= [];
  d.version = 4;
}

/** v4 -> v5: contract names. */
function migrateV4(d: AnyRecord): void {
  assignMissingNames(d.contracts as { customer: string; name?: string }[]);
  d.autoDispatch ??= false;
  d.streak ??= { hours: 0, best: 0, hit: false };
  d.auditUntil ??= 0;
  d.version = 5;
}

/** v5 -> v6: cyber attacks. */
function migrateV5(d: AnyRecord): void {
  d.cyber ??= { attack: null, queue: [], followUp: null, blocked: 0, hits: 0, perfect: 0, history: [] };
  d.floodUntil ??= 0;
  d.floodStrength ??= 0;
  d.version = 6;
}

const MIGRATIONS: Record<number, (d: AnyRecord) => void> = { 1: migrateV1, 2: migrateV2, 3: migrateV3, 4: migrateV4, 5: migrateV5 };

/** Parses, validates and migrates a save to the current version. */
export function deserialize(json: string): GameState {
  const data = JSON.parse(json) as AnyRecord;
  if (typeof data !== 'object' || data === null) throw new Error('Invalid save');
  if (typeof data.version !== 'number' || data.version > SAVE_VERSION || data.version < 1) {
    throw new Error(`Unsupported save version ${String(data.version)}`);
  }
  for (const key of ['grid', 'racks', 'devices', 'techs', 'contracts', 'rng', 'progress'] as const) {
    if (!(key in data)) throw new Error(`Invalid save: missing ${key}`);
  }
  while (typeof data.version === 'number' && data.version < SAVE_VERSION && MIGRATIONS[data.version]) {
    MIGRATIONS[data.version]!(data);
  }
  if (data.version !== SAVE_VERSION) throw new Error(`Unsupported save version ${String(data.version)}`);
  return data as unknown as GameState;
}
