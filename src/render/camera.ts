/** Pan/zoom camera for the top-down map. `scale` = pixels per tile; (x, y) = world origin offset in screen pixels (negated). */
export interface Camera {
  x: number;
  y: number;
  scale: number;
}

export const MIN_SCALE = 12;
export const MAX_SCALE = 96;

export const createCamera = (scale = 32): Camera => ({ x: 0, y: 0, scale });

export function screenToWorld(c: Camera, sx: number, sy: number): { x: number; y: number } {
  return { x: (sx + c.x) / c.scale, y: (sy + c.y) / c.scale };
}

export function worldToScreen(c: Camera, wx: number, wy: number): { x: number; y: number } {
  return { x: wx * c.scale - c.x, y: wy * c.scale - c.y };
}

export function zoomAt(c: Camera, factor: number, sx: number, sy: number): void {
  const before = screenToWorld(c, sx, sy);
  c.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, c.scale * factor));
  c.x = before.x * c.scale - sx;
  c.y = before.y * c.scale - sy;
}

export function panBy(c: Camera, dx: number, dy: number): void {
  c.x -= dx;
  c.y -= dy;
}

export function fitCamera(c: Camera, w: number, h: number, vw: number, vh: number, margin = 16): void {
  c.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min((vw - margin * 2) / w, (vh - margin * 2) / h)));
  c.x = (w * c.scale - vw) / 2;
  c.y = (h * c.scale - vh) / 2;
}

/** Keeps at least a quarter of the viewport overlapping the map. */
export function clampCamera(c: Camera, w: number, h: number, vw: number, vh: number): void {
  const mw = w * c.scale;
  const mh = h * c.scale;
  c.x = Math.min(mw - vw * 0.25, Math.max(-vw * 0.75, c.x));
  c.y = Math.min(mh - vh * 0.25, Math.max(-vh * 0.75, c.y));
}

/**
 * Like fitCamera, but never lets tiles get smaller than `minScale` pixels (so a finger can hit
 * them). If the whole map does not fit at that size, it centres on `focus` and the player pans.
 */
export function touchFitCamera(
  c: Camera, w: number, h: number, vw: number, vh: number,
  focus: { x0: number; y0: number; x1: number; y1: number }, minScale: number,
): void {
  fitCamera(c, w, h, vw, vh);
  if (c.scale >= minScale) return;
  c.scale = minScale;
  const cx = (focus.x0 + focus.x1 + 1) / 2;
  const cy = (focus.y0 + focus.y1 + 1) / 2;
  // per axis: if the whole map fits, centre the map; otherwise centre on the focus area
  c.x = w * c.scale <= vw ? (w * c.scale - vw) / 2 : cx * c.scale - vw / 2;
  c.y = h * c.scale <= vh ? (h * c.scale - vh) / 2 : cy * c.scale - vh / 2;
}

/** Nearest target whose tile centre is within `maxDist` tiles of a tapped world point. */
export function pickNearest<T extends { pos: { x: number; y: number } }>(targets: readonly T[], at: { x: number; y: number }, maxDist: number): T | null {
  let best: T | null = null;
  let bestD = maxDist;
  for (const t of targets) {
    const d = Math.hypot(t.pos.x + 0.5 - at.x, t.pos.y + 0.5 - at.y);
    if (d <= bestD) {
      bestD = d;
      best = t;
    }
  }
  return best;
}
