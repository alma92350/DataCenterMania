import { SERVER_MODELS, THERMAL } from '../data/catalog';
import { deviceUp, devicesInRack } from '../sim/selectors';
import { tileAt } from '../sim/grid';
import type { Alarm, Device, GameState, Rack, Severity, Tech, TileKind } from '../sim/types';
import { worldToScreen, type Camera } from './camera';

export type Overlay = 'none' | 'heat' | 'power';

export interface RenderView {
  selectedRackId: string | null;
  buildPreview: { x: number; y: number; valid: boolean } | null;
  overlay: Overlay;
  time: number; // ms, for animations
}

export const COLORS = {
  bg: '#0b0f15',
  floorA: '#1c2430',
  floorB: '#1f2835',
  wall: '#0e1218',
  wallEdge: '#2b3646',
  storage: '#3a2f1c',
  noc: '#1b3036',
  dock: '#2c2c2c',
  locked: '#141820',
  rack: '#101722',
  rackEdge: '#41516a',
  ok: '#3ddc84',
  warn: '#ffb020',
  major: '#ff7a1a',
  crit: '#ff3b5c',
  off: '#3a4352',
  select: '#5ab4ff',
  text: '#dfe7f2',
} as const;

export const SEVERITY_COLOR: Record<Severity, string> = { 0: '#5ab4ff', 1: COLORS.warn, 2: COLORS.major, 3: COLORS.crit };

const TILE_COLOR: Record<TileKind, string> = {
  void: COLORS.bg, wall: COLORS.wall, floor: COLORS.floorA, locked: COLORS.locked,
  storage: COLORS.storage, dock: COLORS.dock, noc: COLORS.noc,
};

export function deviceColor(s: GameState, d: Device): string {
  if (!d.poweredOn) return COLORS.off;
  if (!deviceUp(s, d)) return COLORS.crit;
  if (d.faults.length) return COLORS.warn;
  return COLORS.ok;
}

/** Blue (cool) -> green -> amber -> red as the rack heats up. */
export function heatColor(temp: number): string {
  const t = Math.max(0, Math.min(1, (temp - 18) / (THERMAL.shutdown - 18)));
  const hue = 220 - t * 220;
  return `hsla(${hue}, 85%, 55%, 0.55)`;
}

const TECH_COLORS = ['#5ab4ff', '#f2c94c', '#bb6bd9', '#6fcf97', '#f2994a', '#56ccf2', '#eb5757'];
export const techColor = (s: GameState, t: Tech): string => TECH_COLORS[s.techs.indexOf(t) % TECH_COLORS.length]!;

export function drawFrame(ctx: CanvasRenderingContext2D, s: GameState, cam: Camera, view: RenderView): void {
  const { width, height } = ctx.canvas;
  const dpr = ctx.canvas.width / Math.max(1, ctx.canvas.clientWidth);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, width, height);
  drawTiles(ctx, s, cam);
  for (const job of s.jobs) {
    if (job.kind !== 'buildRack' && job.kind !== 'placeCooler') continue;
    const p = worldToScreen(cam, job.site.x, job.site.y);
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = COLORS.select;
    ctx.lineWidth = 2;
    ctx.strokeRect(p.x + 3, p.y + 3, cam.scale - 6, cam.scale - 6);
    ctx.setLineDash([]);
  }
  for (const c of s.coolers) drawCooler(ctx, cam, c.pos, c.on, c.kind, view.time);
  for (const r of s.racks) drawRack(ctx, s, cam, r, view);
  for (const t of s.techs) drawTech(ctx, s, cam, t);
  drawAlarmPins(ctx, s, cam, view.time);
  if (view.buildPreview) {
    const p = worldToScreen(cam, view.buildPreview.x, view.buildPreview.y);
    ctx.fillStyle = view.buildPreview.valid ? 'rgba(61,220,132,0.35)' : 'rgba(255,59,92,0.35)';
    ctx.fillRect(p.x, p.y, cam.scale, cam.scale);
  }
}

function drawTiles(ctx: CanvasRenderingContext2D, s: GameState, cam: Camera): void {
  const z = cam.scale;
  for (let y = 0; y < s.grid.h; y++) {
    for (let x = 0; x < s.grid.w; x++) {
      const kind = tileAt(s.grid, x, y);
      if (kind === 'void') continue;
      const p = worldToScreen(cam, x, y);
      ctx.fillStyle = kind === 'floor' && (x + y) % 2 ? COLORS.floorB : TILE_COLOR[kind];
      ctx.fillRect(p.x, p.y, z + 0.5, z + 0.5);
      if (kind === 'wall' && tileAt(s.grid, x, y + 1) !== 'wall' && tileAt(s.grid, x, y + 1) !== 'void') {
        ctx.fillStyle = COLORS.wallEdge;
        ctx.fillRect(p.x, p.y + z * 0.8, z + 0.5, z * 0.2);
      } else if (kind === 'locked') {
        ctx.strokeStyle = '#232a36';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y + z);
        ctx.lineTo(p.x + z, p.y);
        ctx.stroke();
      } else if (kind === 'storage' && z >= 18) {
        icon(ctx, '📦', p.x + z / 2, p.y + z / 2, z * 0.5);
      } else if (kind === 'noc' && z >= 18) {
        icon(ctx, '☕', p.x + z / 2, p.y + z / 2, z * 0.45);
      } else if (kind === 'dock' && z >= 18) {
        icon(ctx, '🚚', p.x + z / 2, p.y + z / 2, z * 0.5);
      }
    }
  }
}

function icon(ctx: CanvasRenderingContext2D, glyph: string, x: number, y: number, size: number, alpha = 0.85): void {
  ctx.globalAlpha = alpha;
  ctx.font = `${Math.round(size)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(glyph, x, y);
  ctx.globalAlpha = 1;
}

function drawCooler(ctx: CanvasRenderingContext2D, cam: Camera, pos: { x: number; y: number }, on: boolean, kind: string, time: number): void {
  const z = cam.scale;
  const p = worldToScreen(cam, pos.x, pos.y);
  ctx.fillStyle = on ? '#16324a' : '#232a36';
  roundRect(ctx, p.x + z * 0.08, p.y + z * 0.08, z * 0.84, z * 0.84, z * 0.15);
  ctx.fill();
  ctx.strokeStyle = on ? '#5ab4ff' : '#4a5566';
  ctx.lineWidth = Math.max(1, z * 0.05);
  ctx.stroke();
  const spin = on ? (time / 400) % (Math.PI * 2) : 0;
  ctx.save();
  ctx.translate(p.x + z / 2, p.y + z / 2);
  ctx.rotate(spin);
  icon(ctx, kind === 'portableAc' ? '❄️' : kind === 'officeAc' ? '🌬️' : '🧊', 0, 0, z * 0.55, on ? 1 : 0.35);
  ctx.restore();
}

function drawRack(ctx: CanvasRenderingContext2D, s: GameState, cam: Camera, r: Rack, view: RenderView): void {
  const z = cam.scale;
  const p = worldToScreen(cam, r.pos.x, r.pos.y);
  const devices = devicesInRack(s, r.id);
  const x = p.x + z * 0.1;
  const y = p.y + z * 0.04;
  const w = z * 0.8;
  const h = z * 0.92;
  ctx.fillStyle = r.tripped ? '#07090d' : COLORS.rack;
  roundRect(ctx, x, y, w, h, z * 0.08);
  ctx.fill();
  if (view.overlay === 'heat') {
    ctx.fillStyle = heatColor(r.temp);
    ctx.fill();
  } else if (view.overlay === 'power') {
    const ratio = r.loadW / r.powerBudgetW;
    ctx.fillStyle = ratio > 0.9 ? 'rgba(255,59,92,0.5)' : ratio > 0.7 ? 'rgba(255,176,32,0.45)' : 'rgba(61,220,132,0.3)';
    ctx.fill();
  }
  const selected = view.selectedRackId === r.id;
  ctx.strokeStyle = selected ? COLORS.select : COLORS.rackEdge;
  ctx.lineWidth = selected ? Math.max(2, z * 0.08) : Math.max(1, z * 0.04);
  ctx.stroke();

  // server LEDs: one row per device, bottom slot at the bottom
  const rows = 14;
  const rowH = (h - z * 0.16) / rows;
  for (const d of devices) {
    const u = SERVER_MODELS[d.model].u;
    const row = Math.min(rows - 1, d.slot);
    const ry = y + h - z * 0.08 - (row + 1) * rowH;
    ctx.fillStyle = '#1e2a3a';
    ctx.fillRect(x + w * 0.12, ry + rowH * 0.12, w * 0.76, rowH * (u > 1 ? 1.6 : 0.76));
    const color = deviceColor(s, d);
    const blink = d.poweredOn && deviceUp(s, d) ? (Math.sin(view.time / 90 + d.slot * 1.7) > -0.2 ? 1 : 0.35) : 1;
    ctx.globalAlpha = blink;
    ctx.fillStyle = color;
    ctx.fillRect(x + w * 0.7, ry + rowH * 0.25, Math.max(2, w * 0.12), Math.max(1.5, rowH * 0.5));
    ctx.globalAlpha = 1;
  }
  if (r.tripped && z >= 14) icon(ctx, '⚡', p.x + z / 2, p.y + z / 2, z * 0.6, 1);
  if (z >= 40) {
    ctx.fillStyle = r.temp >= THERMAL.warn ? COLORS.warn : '#9fb0c6';
    ctx.font = `${Math.round(z * 0.2)}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`${r.temp.toFixed(0)}°`, p.x + z / 2, p.y + z * 0.06);
  }
}

function drawTech(ctx: CanvasRenderingContext2D, s: GameState, cam: Camera, t: Tech): void {
  const z = cam.scale;
  const color = techColor(s, t);
  if (t.path.length && z >= 16) {
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.35;
    ctx.setLineDash([2, 4]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    const start = worldToScreen(cam, t.pos.x + 0.5, t.pos.y + 0.5);
    ctx.moveTo(start.x, start.y);
    for (const step of t.path) {
      const q = worldToScreen(cam, step.x + 0.5, step.y + 0.5);
      ctx.lineTo(q.x, q.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
  const c = worldToScreen(cam, t.pos.x + 0.5, t.pos.y + 0.5);
  const radius = z * 0.3;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(c.x, c.y + radius * 0.8, radius * 0.9, radius * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#0b0f15';
  ctx.lineWidth = Math.max(1, z * 0.05);
  ctx.stroke();
  ctx.fillStyle = '#0b0f15';
  ctx.font = `bold ${Math.round(radius * 1.1)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(t.role === 'manager' ? '★' : t.name[0] ?? '?', c.x, c.y + 1);

  const job = s.jobs.find((j) => j.id === t.jobId);
  if (job?.stage === 'working') {
    const done = Math.max(0, Math.min(1, 1 - job.workLeft / Math.max(1, job.workTotal)));
    ctx.strokeStyle = COLORS.ok;
    ctx.lineWidth = Math.max(2, z * 0.08);
    ctx.beginPath();
    ctx.arc(c.x, c.y, radius + z * 0.1, -Math.PI / 2, -Math.PI / 2 + done * Math.PI * 2);
    ctx.stroke();
    icon(ctx, '🔧', c.x + radius, c.y - radius, z * 0.3, 1);
  } else if (t.carrying) {
    icon(ctx, '📦', c.x + radius, c.y - radius, z * 0.3, 1);
  }
}

/** Colour-blind safe pins: warning = triangle, major = diamond, critical = octagon. */
export function drawSeverityShape(ctx: CanvasRenderingContext2D, sev: Severity, x: number, y: number, r: number): void {
  ctx.beginPath();
  const sides = sev === 1 ? 3 : sev === 2 ? 4 : sev === 3 ? 8 : 20;
  const rot = sev === 1 ? -Math.PI / 2 : sev === 2 ? 0 : Math.PI / 8;
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawAlarmPins(ctx: CanvasRenderingContext2D, s: GameState, cam: Camera, time: number): void {
  const z = cam.scale;
  const worst = new Map<string, Alarm>();
  for (const a of s.alarms) {
    const cur = worst.get(a.rackId);
    if (!cur || a.severity > cur.severity) worst.set(a.rackId, a);
  }
  for (const [rackId, a] of worst) {
    const rack = s.racks.find((r) => r.id === rackId);
    if (!rack) continue;
    const p = worldToScreen(cam, rack.pos.x + 0.5, rack.pos.y - 0.15);
    const pulse = 1 + Math.sin(time / (a.severity === 3 ? 120 : 260)) * 0.12;
    const r = Math.max(7, z * 0.26) * pulse;
    drawSeverityShape(ctx, a.severity, p.x, p.y, r);
    ctx.fillStyle = SEVERITY_COLOR[a.severity];
    ctx.fill();
    ctx.strokeStyle = '#0b0f15';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#0b0f15';
    ctx.font = `bold ${Math.round(r * 1.1)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', p.x, p.y + (a.severity === 1 ? r * 0.15 : 0));
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
