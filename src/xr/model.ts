import { THERMAL } from '../data/catalog';
import { suggestedCoolerJob, suggestedJob, type Command } from '../sim/commands';
import { deviceUp, devicesInRack } from '../sim/selectors';
import type { Alarm, GameState } from '../sim/types';
import { formatClock } from '../core/time';

/**
 * The immersive hall (v4.1): everything about the VR view that is not WebGL. The scene is rebuilt from the
 * game state every frame as plain data, so it can be tested without a headset.
 */
export const TILE_M = 0.8;
export const RACK_SIZE = { w: 0.6, h: 2.0, d: 1.0 } as const;

export interface RackBox { id: string; x: number; z: number; color: string; severity: 0 | 1 | 2 | 3; label: string }
export interface CoolerBox { id: string; x: number; z: number; on: boolean }
export interface TechDot { id: string; x: number; z: number; busy: boolean }
export interface SceneModel {
  racks: RackBox[];
  coolers: CoolerBox[];
  techs: TechDot[];
  /** Hall centre in tile units: the room is drawn around the player. */
  floor: { w: number; d: number; cx: number; cz: number };
}

const HEAT = [[0, '#3ddc84'], [THERMAL.warn - 6, '#3ddc84'], [THERMAL.warn, '#ffb020'], [THERMAL.major, '#ff7a1a'], [THERMAL.shutdown, '#ff3b5c']] as const;

/** Rack colour from its temperature: green when cool, through amber and orange to red at shutdown. */
export function heatColor(temp: number): string {
  for (let i = HEAT.length - 1; i >= 0; i--) if (temp >= HEAT[i]![0]) return HEAT[i]![1];
  return HEAT[0]![1];
}

const worst = (alarms: Alarm[]): 0 | 1 | 2 | 3 => alarms.reduce<number>((m, a) => Math.max(m, a.severity), 0) as 0 | 1 | 2 | 3;

export function buildScene(s: GameState): SceneModel {
  const xs = [...s.racks.map((r) => r.pos.x), ...s.coolers.map((c) => c.pos.x)];
  const ys = [...s.racks.map((r) => r.pos.y), ...s.coolers.map((c) => c.pos.y)];
  const minX = Math.min(...xs, 0);
  const maxX = Math.max(...xs, 1);
  const minY = Math.min(...ys, 0);
  const maxY = Math.max(...ys, 1);
  const cx = (minX + maxX) / 2;
  const cz = (minY + maxY) / 2;
  const at = (p: { x: number; y: number }) => ({ x: (p.x - cx) * TILE_M, z: (p.y - cz) * TILE_M });
  return {
    racks: s.racks.map((r, i) => {
      const sev = worst(s.alarms.filter((a) => a.rackId === r.id));
      return { id: r.id, ...at(r.pos), color: r.tripped ? '#3a4352' : heatColor(r.temp), severity: sev, label: `Rack ${i + 1}` };
    }),
    coolers: s.coolers.map((c) => ({ id: c.id, ...at(c.pos), on: c.on && !c.broken })),
    techs: s.techs.map((t) => ({ id: t.id, ...at(t.pos), busy: t.jobId !== null })),
    floor: { w: (maxX - minX + 3) * TILE_M, d: (maxY - minY + 3) * TILE_M, cx, cz },
  };
}

/** Where the hall sits in front of the player (metres): its centre is a few steps ahead. */
export const hallOffset = (m: SceneModel): { x: number; z: number } => ({ x: 0, z: -Math.max(3, m.floor.d / 2 + 1.5) });

/** The lines shown on the panel for a rack. */
export function rackInfo(s: GameState, rackId: string): string[] {
  const i = s.racks.findIndex((r) => r.id === rackId);
  const r = s.racks[i];
  if (!r) return [];
  const devices = devicesInRack(s, rackId);
  const up = devices.filter((d) => deviceUp(s, d)).length;
  const alarms = s.alarms.filter((a) => a.rackId === rackId);
  return [
    `Rack ${i + 1}`,
    `${r.temp.toFixed(0)}°C · ${(r.loadW / 1000).toFixed(1)} kW`,
    `Servers up ${up} / ${devices.length}`,
    r.tripped ? 'Breaker tripped' : alarms.length ? `${alarms.length} alarm${alarms.length > 1 ? 's' : ''}` : 'All quiet',
  ];
}

/** The alarm worth fixing from the panel: the selected rack's worst, else the worst anywhere. */
export function dispatchTarget(s: GameState, rackId: string | null): Alarm | null {
  const pool = (rackId ? s.alarms.filter((a) => a.rackId === rackId) : s.alarms).filter((a) => suggestedJob(a.kind) || suggestedCoolerJob(a.kind));
  return [...pool].sort((a, b) => b.severity - a.severity || a.raisedAt - b.raisedAt)[0] ?? null;
}

/** The command that sends the best free technician to an alarm (the same one the Alarms tab sends), or null when no fix is known. */
export function dispatchCommand(a: Alarm): Command | null {
  const coolerJob = suggestedCoolerJob(a.kind);
  if (coolerJob && a.coolerId) return { type: coolerJob, coolerId: a.coolerId, techId: 'best' };
  const job = suggestedJob(a.kind);
  if (!job) return null;
  return { type: 'dispatch', job, deviceId: a.deviceId ?? undefined, rackId: a.rackId ?? undefined, uplinkId: a.uplinkId ?? undefined, techId: 'best' };
}

// ---- the floating control panel ----

export const PANEL = { w: 640, h: 400, meters: { w: 0.8, h: 0.5 } } as const;
export type PanelAction = 'pause' | 'speed1' | 'speed2' | 'speed4' | 'dispatch' | 'exit';
export interface PanelButton { id: PanelAction; label: string; x: number; y: number; w: number; h: number }

export const PANEL_BUTTONS: PanelButton[] = [
  { id: 'pause', label: '⏸', x: 16, y: 236, w: 90, h: 66 },
  { id: 'speed1', label: '1×', x: 116, y: 236, w: 90, h: 66 },
  { id: 'speed2', label: '2×', x: 216, y: 236, w: 90, h: 66 },
  { id: 'speed4', label: '4×', x: 316, y: 236, w: 90, h: 66 },
  { id: 'exit', label: 'Exit VR', x: 456, y: 236, w: 168, h: 66 },
  { id: 'dispatch', label: 'Send the best tech', x: 16, y: 316, w: 608, h: 70 },
];

/** Which button a point in panel pixels falls on. */
export function panelHit(px: number, py: number): PanelAction | null {
  return PANEL_BUTTONS.find((b) => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h)?.id ?? null;
}

/** A ray's hit on the panel plane (the panel faces +z at the origin of its own space) as pixel coordinates. */
export function panelUv(local: { x: number; y: number }): { px: number; py: number } | null {
  const u = local.x / PANEL.meters.w + 0.5;
  const v = 0.5 - local.y / PANEL.meters.h;
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  return { px: u * PANEL.w, py: v * PANEL.h };
}

/** The text lines of the panel's top area. */
export function panelText(s: GameState, rackId: string | null, speed: number): { header: string; lines: string[] } {
  const info = rackId ? rackInfo(s, rackId) : [];
  const target = dispatchTarget(s, rackId);
  return {
    header: `${formatClock(s.minute)} · $${Math.round(s.cash).toLocaleString('en-US')} · speed ${speed === 0 ? 'paused' : `${speed}×`}`,
    lines: info.length ? info : ['Point at a rack', `${s.alarms.length} alarm${s.alarms.length === 1 ? '' : 's'} in the hall`, target ? 'A fix is ready below' : ''],
  };
}

// ---- picking ----

export interface Ray { ox: number; oy: number; oz: number; dx: number; dy: number; dz: number }

/** Slab test of a ray against an axis-aligned box; returns the distance or null. */
export function rayBox(r: Ray, min: [number, number, number], max: [number, number, number]): number | null {
  let t0 = 0;
  let t1 = Infinity;
  const o = [r.ox, r.oy, r.oz];
  const d = [r.dx, r.dy, r.dz];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]!) < 1e-9) {
      if (o[i]! < min[i]! || o[i]! > max[i]!) return null;
    } else {
      let a = (min[i]! - o[i]!) / d[i]!;
      let b = (max[i]! - o[i]!) / d[i]!;
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, b);
      if (t0 > t1) return null;
    }
  }
  return t0;
}

/** The nearest rack a ray from the controller points at (positions are hall-space plus the hall offset). */
export function pickRack(m: SceneModel, ray: Ray, offset: { x: number; z: number } = hallOffset(m)): string | null {
  let best: { id: string; t: number } | null = null;
  for (const r of m.racks) {
    const cx = r.x + offset.x;
    const cz = r.z + offset.z;
    const t = rayBox(ray, [cx - RACK_SIZE.w / 2, 0, cz - RACK_SIZE.d / 2], [cx + RACK_SIZE.w / 2, RACK_SIZE.h, cz + RACK_SIZE.d / 2]);
    if (t !== null && (!best || t < best.t)) best = { id: r.id, t };
  }
  return best?.id ?? null;
}
