import { SERVER_MODELS, THERMAL } from '../data/catalog';
import { deviceUp, devicesInRack } from '../sim/selectors';
import { tileAt } from '../sim/grid';
import type { Alarm, Device, GameState, Rack, Severity, Tech, TileKind } from '../sim/types';
import { worldToScreen, type Camera } from './camera';
import { avatarSprite, drawSprite, glyphSprite, partSprite, placeSprite } from './sprites';

export type Overlay = 'none' | 'heat' | 'power';

export interface RenderView {
  selectedRackId: string | null;
  buildPreview: { x: number; y: number; valid: boolean } | null;
  overlay: Overlay;
  time: number; // ms, for animations
  /** E-ink screen: monochrome palette, no animation. */
  eink?: boolean;
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
  ink: '#0b0f15',
  lockedLine: '#232a36',
  coolerOn: '#16324a',
  coolerOff: '#232a36',
  coolerEdgeOn: '#5ab4ff',
  coolerEdgeOff: '#4a5566',
  barBg: '#0d131b',
  rackDead: '#07090d',
  slot: '#1e2a3a',
  intake: '#5ab4ff',
  exhaust: '#ff8a65',
  tempText: '#9fb0c6',
  gold: '#ffd166',
  info: '#5ab4ff',
};

export type Palette = typeof COLORS;

/** E-ink (Kindle Scribe): pure greys only; meaning is carried by shape, pattern and text. */
export const MONO: Palette = {
  bg: '#ffffff', floorA: '#ffffff', floorB: '#ffffff', wall: '#000000', wallEdge: '#000000',
  storage: '#dddddd', noc: '#eeeeee', dock: '#cccccc', locked: '#ffffff', rack: '#ffffff', rackEdge: '#000000',
  ok: '#000000', warn: '#777777', major: '#444444', crit: '#000000', off: '#cccccc', select: '#000000', text: '#000000',
  ink: '#000000', lockedLine: '#999999', coolerOn: '#ffffff', coolerOff: '#eeeeee', coolerEdgeOn: '#000000', coolerEdgeOff: '#999999',
  barBg: '#ffffff', rackDead: '#000000', slot: '#dddddd', intake: '#ffffff', exhaust: '#000000', tempText: '#000000', gold: '#000000', info: '#000000',
};

export const paletteFor = (eink: boolean): Palette => (eink ? MONO : COLORS);

/** Palette for the frame being drawn. */
let P: Palette = COLORS;
let EINK = false;

export const severityColor = (sev: Severity): string => [P.info, P.warn, P.major, P.crit][sev]!;

const tileColor = (k: TileKind): string =>
  ({ void: P.bg, wall: P.wall, floor: P.floorA, locked: P.locked, storage: P.storage, dock: P.dock, noc: P.noc })[k];

export function deviceColor(s: GameState, d: Device): string {
  if (EINK && d.poweredOn && deviceUp(s, d) && !d.faults.length) return '#ffffff';
  if (!d.poweredOn) return P.off;
  if (!deviceUp(s, d)) return P.crit;
  if (d.faults.length) return P.warn;
  return P.ok;
}

/** Blue (cool) -> green -> amber -> red as the rack heats up. */
export function heatColor(temp: number, eink = EINK): string {
  const t = Math.max(0, Math.min(1, (temp - 18) / (THERMAL.shutdown - 18)));
  const hue = 220 - t * 220;
  if (eink) return `rgba(0, 0, 0, ${(0.08 + t * 0.6).toFixed(2)})`;
  return `hsla(${hue}, 85%, 55%, 0.55)`;
}

const TECH_COLORS = ['#5ab4ff', '#f2c94c', '#bb6bd9', '#6fcf97', '#f2994a', '#56ccf2', '#eb5757'];
export const techColor = (s: GameState, t: Tech): string => (EINK ? '#000000' : TECH_COLORS[s.techs.indexOf(t) % TECH_COLORS.length]!);

export function drawFrame(ctx: CanvasRenderingContext2D, s: GameState, cam: Camera, view: RenderView): void {
  EINK = !!view.eink;
  P = paletteFor(EINK);
  if (EINK) view = { ...view, time: 0 };
  const { width, height } = ctx.canvas;
  const dpr = ctx.canvas.width / Math.max(1, ctx.canvas.clientWidth);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = P.bg;
  ctx.fillRect(0, 0, width, height);
  drawTiles(ctx, s, cam);
  for (const job of s.jobs) {
    if (job.kind !== 'buildRack' && job.kind !== 'placeCooler') continue;
    const p = worldToScreen(cam, job.site.x, job.site.y);
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = P.select;
    ctx.lineWidth = 2;
    ctx.strokeRect(p.x + 3, p.y + 3, cam.scale - 6, cam.scale - 6);
    ctx.setLineDash([]);
  }
  for (const c of s.coolers) drawCooler(ctx, cam, c.pos, c.on && !c.broken, c.kind, view.time, c.broken, c.health);
  for (const r of s.racks) drawRack(ctx, s, cam, r, view);
  for (const t of s.techs) drawTech(ctx, s, cam, t);
  drawAlarmPins(ctx, s, cam, view.time);
  drawFx(ctx, s, cam);
  if (view.buildPreview) {
    const p = worldToScreen(cam, view.buildPreview.x, view.buildPreview.y);
    ctx.fillStyle = EINK ? (view.buildPreview.valid ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.6)') : view.buildPreview.valid ? 'rgba(61,220,132,0.35)' : 'rgba(255,59,92,0.35)';
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
      ctx.fillStyle = kind === 'floor' && (x + y) % 2 ? P.floorB : tileColor(kind);
      ctx.fillRect(p.x, p.y, z + 0.5, z + 0.5);
      if (kind === 'wall' && tileAt(s.grid, x, y + 1) !== 'wall' && tileAt(s.grid, x, y + 1) !== 'void') {
        ctx.fillStyle = P.wallEdge;
        ctx.fillRect(p.x, p.y + z * 0.8, z + 0.5, z * 0.2);
      } else if (kind === 'locked') {
        ctx.strokeStyle = P.lockedLine;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y + z);
        ctx.lineTo(p.x + z, p.y);
        ctx.stroke();
      } else if ((kind === 'storage' || kind === 'noc' || kind === 'dock') && z >= 18) {
        drawSprite(ctx, placeSprite(kind, EINK), p.x + z / 2, p.y + z / 2, z * 0.86, 0.9);
      }
    }
  }
}

function drawCooler(
  ctx: CanvasRenderingContext2D, cam: Camera, pos: { x: number; y: number }, on: boolean, kind: string, time: number,
  broken = false, health = 1,
): void {
  const z = cam.scale;
  const p = worldToScreen(cam, pos.x, pos.y);
  ctx.fillStyle = on ? P.coolerOn : P.coolerOff;
  roundRect(ctx, p.x + z * 0.08, p.y + z * 0.08, z * 0.84, z * 0.84, z * 0.15);
  ctx.fill();
  ctx.strokeStyle = on ? P.coolerEdgeOn : P.coolerEdgeOff;
  ctx.lineWidth = Math.max(1, z * 0.05);
  ctx.stroke();
  // a gentle bob while running replaces the old spinning emoji
  const bob = on && !EINK ? Math.sin(time / 500) * z * 0.015 : 0;
  drawSprite(ctx, partSprite(kind as 'officeAc', EINK), p.x + z / 2, p.y + z / 2 + bob, z * 0.84, on ? 1 : 0.4);
  if (broken) drawSprite(ctx, glyphSprite('broken', EINK), p.x + z * 0.8, p.y + z * 0.2, z * 0.4);
  else if (health < 0.99 && z >= 18) {
    ctx.fillStyle = P.barBg;
    ctx.fillRect(p.x + z * 0.15, p.y + z * 0.86, z * 0.7, Math.max(2, z * 0.06));
    ctx.fillStyle = health < 0.4 ? P.crit : health < 0.7 ? P.warn : P.ok;
    ctx.fillRect(p.x + z * 0.15, p.y + z * 0.86, z * 0.7 * health, Math.max(2, z * 0.06));
  }
}

function drawRack(ctx: CanvasRenderingContext2D, s: GameState, cam: Camera, r: Rack, view: RenderView): void {
  const z = cam.scale;
  const p = worldToScreen(cam, r.pos.x, r.pos.y);
  const devices = devicesInRack(s, r.id);
  const x = p.x + z * 0.1;
  const y = p.y + z * 0.04;
  const w = z * 0.8;
  const h = z * 0.92;
  ctx.fillStyle = r.tripped ? P.rackDead : P.rack;
  roundRect(ctx, x, y, w, h, z * 0.08);
  ctx.fill();
  if (view.overlay === 'heat') {
    ctx.fillStyle = heatColor(r.temp);
    ctx.fill();
  } else if (view.overlay === 'power') {
    const ratio = r.loadW / r.powerBudgetW;
    ctx.fillStyle = EINK ? `rgba(0,0,0,${Math.min(0.7, ratio * 0.7).toFixed(2)})` : ratio > 0.9 ? 'rgba(255,59,92,0.5)' : ratio > 0.7 ? 'rgba(255,176,32,0.45)' : 'rgba(61,220,132,0.3)';
    ctx.fill();
  }
  const selected = view.selectedRackId === r.id;
  ctx.strokeStyle = selected ? P.select : P.rackEdge;
  ctx.lineWidth = selected ? Math.max(2, z * 0.08) : Math.max(1, z * 0.04);
  ctx.stroke();

  // server LEDs: one row per device, bottom slot at the bottom
  const rows = 14;
  const rowH = (h - z * 0.16) / rows;
  for (const d of devices) {
    const u = SERVER_MODELS[d.model].u;
    const row = Math.min(rows - 1, d.slot);
    const ry = y + h - z * 0.08 - (row + 1) * rowH;
    ctx.fillStyle = P.slot;
    ctx.fillRect(x + w * 0.12, ry + rowH * 0.12, w * 0.76, rowH * (u > 1 ? 1.6 : 0.76));
    const color = deviceColor(s, d);
    const blink = EINK || !(d.poweredOn && deviceUp(s, d)) ? 1 : Math.sin(view.time / 90 + d.slot * 1.7) > -0.2 ? 1 : 0.35;
    ctx.globalAlpha = blink;
    ctx.fillStyle = color;
    ctx.fillRect(x + w * 0.7, ry + rowH * 0.25, Math.max(2, w * 0.12), Math.max(1.5, rowH * 0.5));
    ctx.globalAlpha = 1;
  }
  // front (cold intake) and back (hot exhaust) edges, so aisles can be read at a glance
  if (s.features.includes('aisles')) {
    const front = r.facing === 'S' ? y + h - Math.max(2, z * 0.07) : y;
    const back = r.facing === 'S' ? y : y + h - Math.max(2, z * 0.07);
    ctx.fillStyle = r.recirculation > 0 ? P.crit : P.intake; // intake: blue when breathing cool air
    ctx.fillRect(x + w * 0.1, front, w * 0.8, Math.max(2, z * 0.07));
    ctx.fillStyle = P.exhaust; // exhaust
    ctx.fillRect(x + w * 0.1, back, w * 0.8, Math.max(2, z * 0.07));
  }
  if (z >= 14) {
    const g = r.tripped ? 'bolt' : r.switchFailed ? 'switchx' : r.maintenance ? 'rotate' : null;
    if (g) drawSprite(ctx, glyphSprite(g, EINK), p.x + z / 2, p.y + z / 2, z * (g === 'switchx' ? 0.8 : 0.62));
  }
  if (z >= 40) {
    ctx.fillStyle = r.temp >= THERMAL.warn ? P.warn : P.tempText;
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
  const radius = z * 0.36;
  ctx.fillStyle = EINK ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(c.x, c.y + radius * 0.85, radius * 0.9, radius * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  // portrait (role outfit + a face that is always the same for this person), ringed in their own colour
  const portrait = avatarSprite(t.role, t.role === 'manager' ? 'manager' : t.name, EINK);
  if (!drawSprite(ctx, portrait, c.x, c.y, radius * 2)) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, z * 0.07);
  ctx.beginPath();
  ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
  ctx.stroke();

  const job = s.jobs.find((j) => j.id === t.jobId);
  if (job?.stage === 'working') {
    const done = Math.max(0, Math.min(1, 1 - job.workLeft / Math.max(1, job.workTotal)));
    ctx.strokeStyle = P.ok;
    ctx.lineWidth = Math.max(2, z * 0.08);
    ctx.beginPath();
    ctx.arc(c.x, c.y, radius + z * 0.1, -Math.PI / 2, -Math.PI / 2 + done * Math.PI * 2);
    ctx.stroke();
    drawSprite(ctx, glyphSprite('wrench', EINK), c.x + radius, c.y - radius, z * 0.42);
  } else if (t.carrying) {
    drawSprite(ctx, partSprite(t.carrying, EINK), c.x + radius, c.y - radius, z * 0.5);
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
  const keyOf = (a: Alarm) => a.rackId ?? a.coolerId ?? (a.uplinkId ? 'uplink' : null);
  for (const a of s.alarms) {
    const key = keyOf(a);
    if (!key) continue;
    const cur = worst.get(key);
    if (!cur || a.severity > cur.severity) worst.set(key, a);
  }
  const dock = s.grid.tiles.indexOf('dock');
  for (const [key, a] of worst) {
    const pos = key === 'uplink'
      ? (dock >= 0 ? { x: dock % s.grid.w, y: Math.floor(dock / s.grid.w) } : null)
      : (s.racks.find((r) => r.id === key) ?? s.coolers.find((c) => c.id === key))?.pos;
    if (!pos) continue;
    const p = worldToScreen(cam, pos.x + 0.5, pos.y - 0.15);
    const pulse = 1 + Math.sin(time / (a.severity === 3 ? 120 : 260)) * 0.12;
    const r = Math.max(7, z * 0.26) * pulse;
    drawSeverityShape(ctx, a.severity, p.x, p.y, r);
    ctx.fillStyle = severityColor(a.severity);
    ctx.fill();
    ctx.strokeStyle = EINK ? '#ffffff' : P.ink;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = EINK ? '#ffffff' : P.ink;
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

const FX_LIFE = 45; // game minutes

/** Floating "+$" / "SLA!" pops rising from racks (PRD §21.3). */
function drawFx(ctx: CanvasRenderingContext2D, s: GameState, cam: Camera): void {
  const z = cam.scale;
  for (const f of s.fx) {
    const age = s.minute - f.minute;
    if (age < 0 || age > FX_LIFE) continue;
    const rack = f.rackId ? s.racks.find((r) => r.id === f.rackId) : null;
    if (f.rackId && !rack) continue;
    if (EINK && age > 15) continue;
    const t = EINK ? 0 : age / FX_LIFE;
    const base = rack ? worldToScreen(cam, rack.pos.x + 0.5, rack.pos.y) : { x: ctx.canvas.clientWidth / 2, y: ctx.canvas.clientHeight * 0.3 };
    const y = base.y - z * 0.3 - t * z * 1.2;
    ctx.globalAlpha = 1 - t * t;
    const text = f.kind === 'miss' ? 'SLA!' : `+$${f.amount}`;
    ctx.font = `bold ${Math.round(Math.max(11, z * (f.kind === 'bonus' ? 0.6 : 0.32)))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = EINK ? '#ffffff' : P.ink;
    ctx.strokeText(text, base.x, y);
    ctx.fillStyle = f.kind === 'miss' ? P.crit : f.kind === 'bonus' ? P.gold : P.ok;
    ctx.fillText(text, base.x, y);
    ctx.globalAlpha = 1;
  }
}
