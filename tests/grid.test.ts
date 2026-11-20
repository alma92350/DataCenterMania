import { parseMap, findPath, isWalkable, accessTile, tileAt, nearestTile } from '../src/sim/grid';

const MAP = [
  '#######',
  '#S...R#',
  '#.##..#',
  '#.....#',
  '#~~~~~#',
  '#######',
];

describe('parseMap', () => {
  it('builds tiles and extracts rack / cooler markers', () => {
    const m = parseMap(['#R.A#', '#.S~#']);
    expect(m.grid.w).toBe(5);
    expect(m.grid.h).toBe(2);
    expect(tileAt(m.grid, 0, 0)).toBe('wall');
    expect(tileAt(m.grid, 1, 0)).toBe('floor'); // rack sits on floor
    expect(tileAt(m.grid, 2, 1)).toBe('storage');
    expect(tileAt(m.grid, 3, 1)).toBe('locked');
    expect(m.racks).toEqual([{ x: 1, y: 0 }]);
    expect(m.coolers).toEqual([{ x: 3, y: 0 }]);
    expect(tileAt(m.grid, 99, 99)).toBe('void');
  });

  it('rejects ragged maps', () => {
    expect(() => parseMap(['###', '##'])).toThrow();
  });
});

describe('pathfinding', () => {
  const { grid, racks } = parseMap(MAP);
  const blocked = new Set(racks.map((r) => r.y * grid.w + r.x));

  it('walkability respects walls, locked tiles and blockers', () => {
    expect(isWalkable(grid, blocked, 1, 1)).toBe(true); // storage
    expect(isWalkable(grid, blocked, 2, 2)).toBe(false); // wall
    expect(isWalkable(grid, blocked, 2, 4)).toBe(false); // locked
    expect(isWalkable(grid, blocked, 5, 1)).toBe(false); // rack
  });

  it('finds the shortest 4-neighbour path (excludes start, includes goal)', () => {
    const p = findPath(grid, blocked, { x: 1, y: 1 }, { x: 4, y: 3 });
    expect(p).not.toBeNull();
    expect(p![p!.length - 1]).toEqual({ x: 4, y: 3 });
    expect(p!.length).toBe(5); // manhattan distance 3+2
    for (let i = 1; i < p!.length; i++) {
      const d = Math.abs(p![i]!.x - p![i - 1]!.x) + Math.abs(p![i]!.y - p![i - 1]!.y);
      expect(d).toBe(1);
    }
  });

  it('returns empty path when already there, null when unreachable', () => {
    expect(findPath(grid, blocked, { x: 1, y: 1 }, { x: 1, y: 1 })).toEqual([]);
    expect(findPath(grid, blocked, { x: 1, y: 1 }, { x: 2, y: 4 })).toBeNull();
  });

  it('finds an access tile next to a blocker, preferring the front (south)', () => {
    expect(accessTile(grid, blocked, { x: 5, y: 1 })).toEqual({ x: 5, y: 2 });
    expect(accessTile(grid, blocked, { x: 2, y: 2 })).not.toBeNull();
  });

  it('nearestTile finds the closest tile of a kind', () => {
    expect(nearestTile(grid, 'storage', { x: 5, y: 3 })).toEqual({ x: 1, y: 1 });
    expect(nearestTile(grid, 'dock', { x: 5, y: 3 })).toBeNull();
  });
});
