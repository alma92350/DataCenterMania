import { createGame } from '../src/sim/state';
import { advance } from '../src/sim/sim';
import { applyFault } from '../src/sim/failures';
import { applyCommand } from '../src/sim/commands';
import {
  alarmsPanel, contractsPanel, coolerModal, endScreen, goalsPanel, pauseMenu, rackLayout, rackModal, shopPanel,
  networkPanel, startScreen, tabs, teamPanel, techStatus, topBar, visiblePanels,
} from '../src/ui/views';
import { DEFAULT_SETTINGS } from '../src/ui/storage';
import type { ChapterId } from '../src/sim/types';

describe('views', () => {
  it.each(['ch0', 'ch1', 'ch2', 'ch3'] as ChapterId[])('render every panel for %s without throwing', (ch) => {
    const s = createGame(ch, 'sysadmin', 1);
    advance(s, 600);
    applyFault(s, s.devices[0]!, 'disk');
    const html = [
      topBar(s, 1, 1), tabs(s, 'alarms'), alarmsPanel(s), teamPanel(s), contractsPanel(s), shopPanel(s), goalsPanel(s), networkPanel(s),
      rackModal(s, s.racks[0]!.id), coolerModal(s, s.coolers[0]!.id), pauseMenu(s, DEFAULT_SETTINGS), endScreen(s),
    ].join('');
    expect(html).toContain('Rack 1');
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('NaN');
  });

  it('progressive disclosure: no shop tab without the feature', () => {
    const s = createGame('ch0', 'sysadmin', 1);
    expect(visiblePanels(s)).toContain('shop');
    s.features = [];
    expect(visiblePanels(s)).not.toContain('shop');
  });

  it('escapes names coming from state', () => {
    const s = createGame('ch1', 'sysadmin', 1);
    s.techs[0]!.name = '<script>x</script>';
    expect(teamPanel(s)).not.toContain('<script>');
  });

  it('rack layout covers all 42U exactly once, top first', () => {
    const s = createGame('ch2', 'sysadmin', 1);
    const rack = s.racks[0]!;
    const layout = rackLayout(s, rack);
    let total = 0;
    for (const item of layout) total += item.kind === 'empty' ? item.to - item.from + 1 : item.device.model === 'server2u' ? 2 : 1;
    expect(total).toBe(42);
    const first = layout[0]!;
    expect(first.kind === 'empty' && first.to).toBe(41);
  });

  it('a pending install hides its slots from the free ranges', () => {
    const s = createGame('ch1', 'sysadmin', 1);
    const rack = s.racks[3]!;
    applyCommand(s, { type: 'install', rackId: rack.id, slot: 0, model: 'server1u', contractId: null, techId: 'best' });
    const empties = rackLayout(s, rack).filter((i) => i.kind === 'empty');
    expect(empties.every((i) => i.kind === 'empty' && i.from >= 1)).toBe(true);
  });

  it('describes what a technician is doing', () => {
    const s = createGame('ch1', 'sysadmin', 1);
    expect(techStatus(s, s.techs[0]!)).toMatch(/Idle/);
    applyFault(s, s.devices[0]!, 'disk');
    applyCommand(s, { type: 'dispatch', job: 'swapDisk', deviceId: s.devices[0]!.id, techId: 'manager' });
    expect(techStatus(s, s.techs[0]!)).toMatch(/Fetching/);
  });

  it('start screen locks chapters until the previous one is won', () => {
    const html = startScreen({}, DEFAULT_SETTINGS, false);
    expect(html).toContain('data-chapter="ch0"');
    expect(html).not.toContain('data-chapter="ch1"');
    expect(startScreen({ ch0: { intern: 1 } }, DEFAULT_SETTINGS, true)).toContain('data-chapter="ch1"');
  });

  it('chapter 3 shows the network tab, aisle info and cooler maintenance', () => {
    const s = createGame('ch3', 'sysadmin', 1);
    advance(s, 120);
    expect(visiblePanels(s)).toContain('network');
    expect(networkPanel(s)).toContain('MetroFiber A');
    expect(rackModal(s, s.racks[0]!.id)).toMatch(/Front faces|Rotate/);
    const crac = s.coolers.find((c) => c.kind === 'crac')!;
    expect(coolerModal(s, crac.id)).toContain('Change filter');
    expect(teamPanel(s)).toContain('HVAC tech');
  });

  it('nightmare difficulty is locked until chapter 3 is beaten', () => {
    expect(startScreen({}, DEFAULT_SETTINGS, false)).not.toContain('data-difficulty="nightmare"');
    expect(startScreen({ ch3: { senior: 1 } }, DEFAULT_SETTINGS, false)).toContain('data-difficulty="nightmare"');
  });
});
