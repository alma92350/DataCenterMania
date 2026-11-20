import type { Grid, TileKind, Vec } from './types';

const CHAR_TO_TILE: Record<string, TileKind> = {
  ' ': 'void', '#': 'wall', '.': 'floor', '~': 'locked', S: 'storage', D: 'dock', N: 'noc',
  R: 'floor', A: 'floor', C: 'floor',
};

export interface ParsedMap {
  grid: Grid;
  racks: Vec[];
  coolers: Vec[];
  cracs: Vec[];
}

/**
 * Map legend: '#' wall, '.' floor, '~' locked floor (future expansion), 'S' storage,
 * 'D' loading dock, 'N' NOC / staff room, 'R' rack, 'A' air conditioner, 'C' CRAC unit, ' ' void.
 */
export function parseMap(rows: readonly string[]): ParsedMap {
  const h = rows.length;
  const w = rows[0]?.length ?? 0;
  const tiles: TileKind[] = [];
  const racks: Vec[] = [];
  const coolers: Vec[] = [];
  const cracs: Vec[] = [];
  rows.forEach((row, y) => {
    if (row.length !== w) throw new Error(`map row ${y} has length ${row.length}, expected ${w}`);
    [...row].forEach((ch, x) => {
      const tile = CHAR_TO_TILE[ch];
      if (!tile) throw new Error(`unknown map char '${ch}' at ${x},${y}`);
      tiles.push(tile);
      if (ch === 'R') racks.push({ x, y });
      if (ch === 'A') coolers.push({ x, y });
      if (ch === 'C') cracs.push({ x, y });
    });
  });
  return { grid: { w, h, tiles }, racks, coolers, cracs };
}

export const idx = (g: Grid, x: number, y: number): number => y * g.w + x;

export function tileAt(g: Grid, x: number, y: number): TileKind {
  if (x < 0 || y < 0 || x >= g.w || y >= g.h) return 'void';
  return g.tiles[idx(g, x, y)] ?? 'void';
}

const WALKABLE: ReadonlySet<TileKind> = new Set<TileKind>(['floor', 'storage', 'dock', 'noc']);

export function isWalkable(g: Grid, blocked: ReadonlySet<number>, x: number, y: number): boolean {
  return WALKABLE.has(tileAt(g, x, y)) && !blocked.has(idx(g, x, y));
}

const DIRS: readonly Vec[] = [{ x: 0, y: 1 }, { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: -1 }];

/** A* on a 4-connected grid. Returns steps excluding `from`, including `to`, or null. */
export function findPath(g: Grid, blocked: ReadonlySet<number>, from: Vec, to: Vec): Vec[] | null {
  const start = idx(g, from.x, from.y);
  const goal = idx(g, to.x, to.y);
  if (start === goal) return [];
  if (!isWalkable(g, blocked, to.x, to.y)) return null;
  const hScore = (i: number) => Math.abs((i % g.w) - to.x) + Math.abs(Math.floor(i / g.w) - to.y);
  const gScore = new Map<number, number>([[start, 0]]);
  const came = new Map<number, number>();
  // small grids: a simple array-based open set is plenty fast
  const open: number[] = [start];
  const fScore = new Map<number, number>([[start, hScore(start)]]);
  while (open.length) {
    let bestI = 0;
    for (let i = 1; i < open.length; i++) {
      if ((fScore.get(open[i]!) ?? Infinity) < (fScore.get(open[bestI]!) ?? Infinity)) bestI = i;
    }
    const cur = open.splice(bestI, 1)[0]!;
    if (cur === goal) {
      const path: Vec[] = [];
      let c: number | undefined = cur;
      while (c !== undefined && c !== start) {
        path.push({ x: c % g.w, y: Math.floor(c / g.w) });
        c = came.get(c);
      }
      return path.reverse();
    }
    const cx = cur % g.w;
    const cy = Math.floor(cur / g.w);
    for (const d of DIRS) {
      const nx = cx + d.x;
      const ny = cy + d.y;
      if (!isWalkable(g, blocked, nx, ny)) continue;
      const n = idx(g, nx, ny);
      const tentative = (gScore.get(cur) ?? Infinity) + 1;
      if (tentative < (gScore.get(n) ?? Infinity)) {
        came.set(n, cur);
        gScore.set(n, tentative);
        fScore.set(n, tentative + hScore(n));
        if (!open.includes(n)) open.push(n);
      }
    }
  }
  return null;
}

/** Walkable neighbour of a (usually blocked) tile, preferring its front (south). */
export function accessTile(g: Grid, blocked: ReadonlySet<number>, pos: Vec): Vec | null {
  for (const d of DIRS) {
    const x = pos.x + d.x;
    const y = pos.y + d.y;
    if (isWalkable(g, blocked, x, y)) return { x, y };
  }
  return null;
}

export function nearestTile(g: Grid, kind: TileKind, from: Vec): Vec | null {
  let best: Vec | null = null;
  let bestD = Infinity;
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      if (tileAt(g, x, y) !== kind) continue;
      const d = Math.abs(x - from.x) + Math.abs(y - from.y);
      if (d < bestD) {
        bestD = d;
        best = { x, y };
      }
    }
  }
  return best;
}
