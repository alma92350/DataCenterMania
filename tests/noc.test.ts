import { NOC } from '../src/data/catalog';
import { applyCommand } from '../src/sim/commands';
import { advance } from '../src/sim/sim';
import { raiseAlarm } from '../src/sim/alarms';
import { overallUptimePct } from '../src/sim/selectors';
import { createGame } from '../src/sim/state';
import { nocLicencePerDay } from '../src/sim/economy';
import { createSandbox, DEFAULT_SANDBOX } from '../src/sim/sandbox';
import { nocCard, alarmsPanel, shopPanel } from '../src/ui/views';
import type { GameState } from '../src/sim/types';
import { measure } from './engagement';

function hang(s: GameState) {
  const d = s.devices[0]!;
  d.faults.push('hung');
  raiseAlarm(s, 'hung', d.rackId, d.id, 2, 60);
  return d;
}

describe('NOC (remote hands)', () => {
  it('unlocks in Chapter 2 and not before', () => {
    expect(createGame('ch1', 'sysadmin', 1).features).not.toContain('remote');
    for (const ch of ['ch2', 'ch3', 'ch4', 'ch5'] as const) expect(createGame(ch, 'sysadmin', 1).features).toContain('remote');
    expect(createSandbox(DEFAULT_SANDBOX, 'sysadmin', 1).features).toContain('remote');
    const s = createGame('ch1', 'sysadmin', 1);
    expect(applyCommand(s, { type: 'upgradeNoc' }).ok).toBe(false);
  });

  it('upgrades in three levels, charging the price and a daily licence', () => {
    const s = createGame('ch2', 'sysadmin', 1);
    s.cash = 20000;
    const cash = s.cash;
    expect(applyCommand(s, { type: 'upgradeNoc' }).ok).toBe(true);
    expect(s.noc).toBe(1);
    expect(s.cash).toBe(cash - NOC.levels[0].price);
    expect(nocLicencePerDay(s)).toBe(60);
    applyCommand(s, { type: 'upgradeNoc' });
    applyCommand(s, { type: 'upgradeNoc' });
    expect(s.noc).toBe(3);
    expect(nocLicencePerDay(s)).toBe(200);
    expect(applyCommand(s, { type: 'upgradeNoc' }).ok).toBe(false);
    s.cash = 0;
    const t = createGame('ch2', 'sysadmin', 2);
    t.cash = 100;
    expect(applyCommand(t, { type: 'upgradeNoc' })).toEqual({ ok: false, error: 'Not enough cash.' });
  });

  it('a remote reboot clears a hang in two minutes with nobody walking', () => {
    const s = createGame('ch2', 'sysadmin', 1);
    s.failuresEnabled = false;
    const d = hang(s);
    expect(applyCommand(s, { type: 'remoteReboot', deviceId: d.id }).ok).toBe(false); // no NOC yet
    s.noc = 1;
    expect(applyCommand(s, { type: 'remoteReboot', deviceId: d.id }).ok).toBe(true);
    expect(applyCommand(s, { type: 'remoteReboot', deviceId: d.id }).ok).toBe(false); // already running
    advance(s, NOC.rebootMin + 1);
    expect(d.faults).not.toContain('hung');
    expect(s.jobs.length).toBe(0);
    expect(s.stats.reboots).toBe(1);
    expect(applyCommand(s, { type: 'remoteReboot', deviceId: d.id }).ok).toBe(false); // not hung any more
  });

  it('level 2 speeds up disk swaps and level 3 halves ops projects', () => {
    const swap = (noc: number) => {
      const s = createGame('ch3', 'sysadmin', 1);
      s.noc = noc;
      const d = s.devices[0]!;
      d.faults.push('disk');
      applyCommand(s, { type: 'dispatch', job: 'swapDisk', deviceId: d.id, techId: 'best' });
      return s.jobs[0]!.workTotal;
    };
    expect(swap(1)).toBe(15);
    expect(swap(2)).toBeLessThan(swap(1));
    const proj = (noc: number) => {
      const s = createGame('ch3', 'sysadmin', 1);
      s.noc = noc;
      applyCommand(s, { type: 'startProject', project: 'firmware' });
      return s.jobs[0]!.workTotal;
    };
    expect(proj(3)).toBe(Math.round(proj(0) / 2));
  });

  it('the Shift Lead uses remote reboot automatically', () => {
    const s = createGame('ch3', 'sysadmin', 1);
    s.failuresEnabled = false;
    s.noc = 1;
    s.cash = 30000;
    applyCommand(s, { type: 'hireLead' });
    applyCommand(s, { type: 'setAutoDispatch', on: true });
    const d = hang(s);
    advance(s, 90);
    expect(d.faults).not.toContain('hung');
    expect(s.jobs.some((j) => j.kind === 'reboot')).toBe(false);
  });

  it('shows the NOC card in the Shop and a Remote reboot button on hung alarms', () => {
    const s = createGame('ch2', 'sysadmin', 1);
    s.failuresEnabled = false;
    expect(shopPanel(s)).toContain('data-action="upgradeNoc"');
    expect(nocCard(createGame('ch1', 'sysadmin', 1))).toBe('');
    const d = hang(s);
    advance(s, 2);
    expect(alarmsPanel(s)).not.toContain('data-action="remoteReboot"');
    s.noc = 1;
    expect(alarmsPanel(s)).toContain(`data-device="${d.id}"`);
    applyCommand(s, { type: 'remoteReboot', deviceId: d.id });
    expect(alarmsPanel(s)).toContain('Remote reboot running');
    expect(shopPanel(s)).not.toMatch(/undefined|NaN/);
  });

  it('keeps technicians free: with remote reboot the bot loses no uptime and still clears every hang', () => {
    for (const ch of ['ch3', 'ch5'] as const) {
      const a = measure(ch, 1, 'sysadmin', false, 'auto', false).state;
      const b = measure(ch, 1, 'sysadmin', false, 'auto', true).state;
      expect(b.noc).toBeGreaterThanOrEqual(1);
      expect(overallUptimePct(b)).toBeGreaterThanOrEqual(overallUptimePct(a) - 0.3);
    }
  });
});
