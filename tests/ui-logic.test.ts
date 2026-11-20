import { createCamera, screenToWorld, worldToScreen, zoomAt, panBy, fitCamera, clampCamera, touchFitCamera, pickNearest } from '../src/render/camera';
import { minutesToAdvance, effectiveSpeed, shouldAutoPause } from '../src/ui/clock';
import { escapeHtml, money, stars, countdown } from '../src/ui/format';
import { createGame } from '../src/sim/state';
import { at } from '../src/core/time';

describe('camera', () => {
  it('converts between screen and world (tile) coordinates', () => {
    const cam = createCamera(32);
    cam.x = 10;
    cam.y = 20;
    const w = screenToWorld(cam, 74, 84);
    expect(w).toEqual({ x: 2.625, y: 3.25 });
    expect(worldToScreen(cam, w.x, w.y)).toEqual({ x: 74, y: 84 });
  });

  it('zooms around the cursor (point under cursor stays put) and clamps', () => {
    const cam = createCamera(32);
    const before = screenToWorld(cam, 100, 100);
    zoomAt(cam, 2, 100, 100);
    const after = screenToWorld(cam, 100, 100);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(cam.scale).toBe(64);
    zoomAt(cam, 100, 0, 0);
    expect(cam.scale).toBeLessThanOrEqual(96);
    zoomAt(cam, 0.0001, 0, 0);
    expect(cam.scale).toBeGreaterThanOrEqual(12);
  });

  it('pans and fits a grid inside a viewport', () => {
    const cam = createCamera(32);
    panBy(cam, 10, -5);
    expect(cam.x).toBe(-10);
    expect(cam.y).toBe(5);
    fitCamera(cam, 10, 8, 400, 300);
    const tl = worldToScreen(cam, 0, 0);
    const br = worldToScreen(cam, 10, 8);
    expect(tl.x).toBeGreaterThanOrEqual(0);
    expect(tl.y).toBeGreaterThanOrEqual(0);
    expect(br.x).toBeLessThanOrEqual(400);
    expect(br.y).toBeLessThanOrEqual(300);
    expect(Math.round(tl.x + br.x)).toBe(400);
  });

  it('keeps the map from leaving the viewport entirely', () => {
    const cam = createCamera(32);
    cam.x = 100000;
    clampCamera(cam, 10, 8, 400, 300);
    expect(worldToScreen(cam, 10, 8).x).toBeGreaterThan(0);
  });
});

describe('game clock pacing', () => {
  it('turns real time into game minutes with a fractional carry', () => {
    const r1 = minutesToAdvance(0.25, 1, 0);
    expect(r1.minutes).toBe(0);
    expect(r1.carry).toBeCloseTo(0.75);
    const r2 = minutesToAdvance(0.25, 1, r1.carry);
    expect(r2.minutes).toBe(1);
    expect(r2.carry).toBeCloseTo(0.5);
    expect(minutesToAdvance(1, 4, 0).minutes).toBe(12);
    expect(minutesToAdvance(1, 0, 0.9).minutes).toBe(0);
  });

  it('caps a huge frame gap (tab was in background)', () => {
    expect(minutesToAdvance(60, 4, 0).minutes).toBeLessThanOrEqual(60);
  });

  it('night skip runs nights at 4x unless something serious is open', () => {
    const s = createGame('ch1', 'sysadmin', 1);
    s.minute = at(0, 23);
    expect(effectiveSpeed(1, s, true)).toBe(4);
    expect(effectiveSpeed(1, s, false)).toBe(1);
    expect(effectiveSpeed(0, s, true)).toBe(0);
    s.alarms.push({ id: 'a', kind: 'psu', severity: 2, rackId: 'r', deviceId: null, raisedAt: 0, escalateAt: null, acknowledged: false });
    expect(effectiveSpeed(1, s, true)).toBe(1);
    s.minute = at(0, 12);
    s.alarms = [];
    expect(effectiveSpeed(2, s, true)).toBe(2);
  });

  it('auto-pause follows the setting, and difficulty can force it', () => {
    const s = createGame('ch1', 'sysadmin', 1);
    s.attention = { severity: 2, text: 'x' };
    expect(shouldAutoPause(s, 'critical')).toBe(false);
    expect(shouldAutoPause(s, 'major')).toBe(true);
    expect(shouldAutoPause(s, 'off')).toBe(false);
    s.attention = { severity: 3, text: 'x' };
    expect(shouldAutoPause(s, 'critical')).toBe(true);
    const intern = createGame('ch1', 'intern', 1);
    intern.attention = { severity: 3, text: 'x' };
    expect(shouldAutoPause(intern, 'off')).toBe(true);
  });
});

describe('formatting', () => {
  it('escapes HTML', () => {
    expect(escapeHtml(`<img src=x onerror="a">&'`)).toBe('&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;');
  });
  it('formats money, stars and countdowns', () => {
    expect(money(12345)).toBe('$12,345');
    expect(money(-50)).toBe('-$50');
    expect(stars(3.4)).toBe('★★★☆☆');
    expect(countdown(125)).toBe('2h05');
    expect(countdown(9)).toBe('9m');
  });
});

describe('touch-friendly camera & taps (mobile responsiveness)', () => {
  it('keeps tiles big enough to tap and centres on the area of interest', () => {
    const cam = createCamera(32);
    // a 25x13 floor in a 360px-wide phone: plain fit gives ~13px tiles
    fitCamera(cam, 25, 13, 360, 600);
    expect(cam.scale).toBeLessThan(20);
    touchFitCamera(cam, 25, 13, 360, 600, { x0: 3, y0: 3, x1: 11, y1: 7 }, 28);
    expect(cam.scale).toBeGreaterThanOrEqual(28);
    const c = worldToScreen(cam, 7.5, 5.5); // centre of the focus box
    expect(Math.abs(c.x - 180)).toBeLessThan(2); // too wide: centred on the racks
    const mid = worldToScreen(cam, 12.5, 6.5); // map centre
    expect(Math.abs(mid.y - 300)).toBeLessThan(2); // fits vertically: whole map centred
  });

  it('on a big screen it is a plain fit', () => {
    const a = createCamera(32);
    const b = createCamera(32);
    fitCamera(a, 25, 13, 1000, 700);
    touchFitCamera(b, 25, 13, 1000, 700, { x0: 3, y0: 3, x1: 11, y1: 7 }, 28);
    expect(b).toEqual(a);
  });

  it('a tap near a rack picks it; a tap far away picks nothing', () => {
    const targets = [{ id: 'r1', pos: { x: 3, y: 3 } }, { id: 'r2', pos: { x: 5, y: 3 } }];
    expect(pickNearest(targets, { x: 3.5, y: 3.5 }, 1)?.id).toBe('r1'); // centre of the tile
    expect(pickNearest(targets, { x: 4.1, y: 4.0 }, 1)?.id).toBe('r1'); // just off the tile
    expect(pickNearest(targets, { x: 5.1, y: 2.9 }, 1)?.id).toBe('r2');
    expect(pickNearest(targets, { x: 9, y: 9 }, 1)).toBeNull();
  });
});
