import { createCamera, screenToWorld, worldToScreen, zoomAt, panBy, fitCamera, clampCamera } from '../src/render/camera';
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
