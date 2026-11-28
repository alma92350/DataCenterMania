import { createGame } from '../src/sim/state';
import { advance } from '../src/sim/sim';
import { raiseAlarm } from '../src/sim/alarms';
import { applyCommand } from '../src/sim/commands';
import {
  buildScene, dispatchCommand, dispatchTarget, hallOffset, heatColor, PANEL, PANEL_BUTTONS, panelHit, panelText, panelUv, pickRack, rackInfo, rayBox, RACK_SIZE, TILE_M,
} from '../src/xr/model';
import { vrSupported } from '../src/xr/support';

const game = () => {
  const s = createGame('ch3', 'sysadmin', 1);
  s.failuresEnabled = false;
  advance(s, 5);
  return s;
};

describe('immersive hall model (v4.1)', () => {
  it('colours racks from cool green to shutdown red', () => {
    expect(heatColor(20)).toBe('#3ddc84');
    expect(heatColor(33)).toBe('#ffb020');
    expect(heatColor(40)).toBe('#ff7a1a');
    expect(heatColor(46)).toBe('#ff3b5c');
    const order = [20, 33, 40, 46].map(heatColor);
    expect(new Set(order).size).toBe(4);
  });

  it('turns the game into racks, coolers and technicians in metres around the hall centre', () => {
    const s = game();
    const m = buildScene(s);
    expect(m.racks.length).toBe(s.racks.length);
    expect(m.coolers.length).toBe(s.coolers.length);
    expect(m.techs.length).toBe(s.techs.length);
    const xs = m.racks.map((r) => r.x);
    expect(Math.min(...xs)).toBeLessThan(0);
    expect(Math.max(...xs)).toBeGreaterThan(0);
    expect(m.floor.w).toBeGreaterThan(Math.max(...xs) - Math.min(...xs));
    const a = s.racks[0]!;
    const b = s.racks.find((r) => r.pos.x !== a.pos.x)!;
    const ra = m.racks.find((r) => r.id === a.id)!;
    const rb = m.racks.find((r) => r.id === b.id)!;
    expect(Math.abs(rb.x - ra.x)).toBeCloseTo(Math.abs(b.pos.x - a.pos.x) * TILE_M, 5);
    expect(hallOffset(m).z).toBeLessThan(0); // the hall is in front of the player
  });

  it('shows alarms as beacons and breakers as dark racks', () => {
    const s = game();
    const rack = s.racks[0]!;
    raiseAlarm(s, 'disk', rack.id, s.devices.find((d) => d.rackId === rack.id)?.id ?? null, 2, null);
    expect(buildScene(s).racks.find((r) => r.id === rack.id)!.severity).toBe(2);
    rack.tripped = true;
    expect(buildScene(s).racks.find((r) => r.id === rack.id)!.color).toBe('#3a4352');
  });

  it('describes a rack and finds the alarm worth fixing', () => {
    const s = game();
    const rack = s.racks[0]!;
    expect(rackInfo(s, rack.id)[0]).toBe('Rack 1');
    expect(rackInfo(s, 'nope')).toEqual([]);
    const dev = s.devices.find((d) => d.rackId === rack.id)!;
    raiseAlarm(s, 'disk', rack.id, dev.id, 1, null);
    raiseAlarm(s, 'psu', rack.id, dev.id, 2, null);
    expect(dispatchTarget(s, rack.id)!.kind).toBe('psu');
    expect(dispatchTarget(s, null)!.kind).toBe('psu');
    expect(dispatchTarget(s, s.racks[1]!.id)).toBeNull();
    expect(rackInfo(s, rack.id).join(' ')).toContain('alarm');
  });

  it('builds the same command the Alarms tab sends, and it works', () => {
    const s = game();
    s.cash += 5000;
    const dev = s.devices[0]!;
    dev.faults.push('disk');
    raiseAlarm(s, 'disk', dev.rackId, dev.id, 1, null);
    const a = dispatchTarget(s, null)!;
    const cmd = dispatchCommand(a)!;
    expect(cmd).toMatchObject({ type: 'dispatch', job: 'swapDisk', deviceId: dev.id, techId: 'best' });
    expect(['dispatch'].includes(cmd.type)).toBe(true);
    expect(applyCommand(s, cmd).ok).toBe(true);
    s.alarms.push({ id: 'x', kind: 'coolerDown', severity: 2, rackId: null, deviceId: null, coolerId: s.coolers[0]!.id, raisedAt: 0, escalateAt: null, acknowledged: false });
    expect(dispatchCommand(s.alarms[s.alarms.length - 1]!)).toMatchObject({ type: 'repairCooler', coolerId: s.coolers[0]!.id });
  });

  it('intersects rays with boxes and picks the nearest rack', () => {
    expect(rayBox({ ox: 0, oy: 1, oz: 5, dx: 0, dy: 0, dz: -1 }, [-1, 0, -1], [1, 2, 1])).toBeCloseTo(4, 5);
    expect(rayBox({ ox: 5, oy: 1, oz: 5, dx: 0, dy: 0, dz: -1 }, [-1, 0, -1], [1, 2, 1])).toBeNull();
    expect(rayBox({ ox: 0, oy: 3, oz: 5, dx: 0, dy: 0, dz: -1 }, [-1, 0, -1], [1, 2, 1])).toBeNull();
    const s = game();
    const m = buildScene(s);
    const off = hallOffset(m);
    const target = m.racks[0]!;
    const ray = { ox: target.x + off.x, oy: 1.2, oz: target.z + off.z + 4, dx: 0, dy: 0, dz: -1 };
    expect(pickRack(m, ray)).toBeTruthy();
    const through = pickRack(m, ray)!;
    const picked = m.racks.find((r) => r.id === through)!;
    expect(Math.abs(picked.x - target.x)).toBeLessThan(RACK_SIZE.w);
    expect(pickRack(m, { ...ray, oy: 5 })).toBeNull();
  });

  it('lays out the panel: every button inside it, none overlapping, and hit tests agree with the layout', () => {
    for (const b of PANEL_BUTTONS) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(PANEL.w);
      expect(b.y + b.h).toBeLessThanOrEqual(PANEL.h);
      expect(panelHit(b.x + b.w / 2, b.y + b.h / 2)).toBe(b.id);
      expect(b.h).toBeGreaterThanOrEqual(60);
    }
    for (const a of PANEL_BUTTONS) for (const b of PANEL_BUTTONS) {
      if (a === b) continue;
      const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
      expect([a.id, b.id, apart]).toEqual([a.id, b.id, true]);
    }
    expect(panelHit(1, 1)).toBeNull();
    expect(panelUv({ x: 0, y: 0 })).toEqual({ px: PANEL.w / 2, py: PANEL.h / 2 });
    expect(panelUv({ x: PANEL.meters.w, y: 0 })).toBeNull();
    expect(panelUv({ x: -PANEL.meters.w / 2, y: PANEL.meters.h / 2 })).toEqual({ px: 0, py: 0 });
  });

  it('prints a header and hints on the panel', () => {
    const s = game();
    const t = panelText(s, null, 0);
    expect(t.header).toContain('paused');
    expect(t.lines[0]).toBe('Point at a rack');
    expect(panelText(s, s.racks[0]!.id, 2).header).toContain('2×');
    expect(panelText(s, s.racks[0]!.id, 2).lines[0]).toBe('Rack 1');
  });

  it('reports no VR where the browser has no WebXR, without throwing', async () => {
    await expect(vrSupported()).resolves.toBe(false);
  });
});
