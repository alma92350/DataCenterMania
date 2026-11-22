import { COOLERS } from '../data/catalog';
import { deviceUp, devicesInRack } from './selectors';
import type { GameState } from './types';

export interface RackSpof {
  /** Devices that go down if a single power feed fails (single-corded, or already on one leg). */
  power: string[];
  /** Fewer than two working coolers reach this loaded rack: one cooler failure leaves it uncooled. */
  singleCooler: boolean;
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/**
 * Single points of failure (PRD v2 F1). Power is measured the honest way: take each feed down in turn on a copy
 * of the rack's state and see which servers stop. Cooling counts the working coolers in reach.
 */
export function spofReport(s: GameState): Record<string, RackSpof> {
  const out: Record<string, RackSpof> = {};
  for (const r of s.racks) {
    const devices = devicesInRack(s, r.id);
    const before = new Set(devices.filter((d) => deviceUp(s, d)).map((d) => d.id));
    const down = new Set<string>();
    const saved = { a: r.pduA, b: r.pduB };
    for (const feed of ['A', 'B'] as const) {
      if (feed === 'A') r.pduA = 'failed';
      else r.pduB = 'failed';
      for (const d of devices) if (before.has(d.id) && !deviceUp(s, d)) down.add(d.id);
      r.pduA = saved.a;
      r.pduB = saved.b;
    }
    const cooling = s.coolers.filter((c) => c.on && !c.broken && c.kind !== 'officeAc' && dist(c.pos, r.pos) <= COOLERS[c.kind].radius).length;
    out[r.id] = { power: [...down], singleCooler: devices.length > 0 && cooling < 2 };
  }
  return out;
}

export const spofCount = (s: GameState): { servers: number; racks: number } => {
  const rep = spofReport(s);
  const racks = Object.values(rep).filter((r) => r.power.length > 0);
  return { servers: racks.reduce((n, r) => n + r.power.length, 0), racks: racks.length };
};
