import { MORALE } from '../data/catalog';
import { SAVE_VERSION } from './state';
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

const MIGRATIONS: Record<number, (d: AnyRecord) => void> = { 1: migrateV1 };

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
