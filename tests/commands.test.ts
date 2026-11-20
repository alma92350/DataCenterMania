import { applyCommand, suggestedJob } from '../src/sim/commands';
import { applyFault } from '../src/sim/failures';
import { updateOrders } from '../src/sim/economy';
import { PARTS } from '../src/data/catalog';
import { quietGame } from './helpers';

describe('command validation', () => {
  it('rejects repairs that do not match a fault', () => {
    const s = quietGame('ch1');
    const res = applyCommand(s, { type: 'dispatch', job: 'swapDisk', deviceId: s.devices[0]!.id, techId: 'best' });
    expect(res).toEqual({ ok: false, error: expect.stringMatching(/disk/i) });
    expect(applyCommand(s, { type: 'dispatch', job: 'resetBreaker', rackId: s.racks[0]!.id, techId: 'best' }).ok).toBe(false);
  });

  it('rejects jobs without the needed part in stock', () => {
    const s = quietGame('ch1');
    s.inventory.disk = 0;
    applyFault(s, s.devices[0]!, 'disk');
    const res = applyCommand(s, { type: 'dispatch', job: 'swapDisk', deviceId: s.devices[0]!.id, techId: 'best' });
    expect(res.ok).toBe(false);
  });

  it('rejects a duplicate job for the same target', () => {
    const s = quietGame('ch1');
    applyFault(s, s.devices[0]!, 'hung');
    expect(applyCommand(s, { type: 'dispatch', job: 'reboot', deviceId: s.devices[0]!.id, techId: 'best' }).ok).toBe(true);
    expect(applyCommand(s, { type: 'dispatch', job: 'reboot', deviceId: s.devices[0]!.id, techId: 'best' }).ok).toBe(false);
  });

  it('rejects installs into occupied or out-of-range slots', () => {
    const s = quietGame('ch1');
    const rack = s.racks[0]!;
    expect(applyCommand(s, { type: 'install', rackId: rack.id, slot: 0, model: 'server1u', contractId: null, techId: 'best' }).ok).toBe(false);
    expect(applyCommand(s, { type: 'install', rackId: rack.id, slot: 41, model: 'server2u', contractId: null, techId: 'best' }).ok).toBe(false);
    expect(applyCommand(s, { type: 'install', rackId: rack.id, slot: 10, model: 'server1u', contractId: null, techId: 'best' }).ok).toBe(true);
    // pending install reserves the slot too
    expect(applyCommand(s, { type: 'install', rackId: rack.id, slot: 10, model: 'server1u', contractId: null, techId: 'best' }).ok).toBe(false);
  });

  it('gates features by chapter (progressive disclosure)', () => {
    const s = quietGame('ch0');
    expect(applyCommand(s, { type: 'hire', candidateId: 'nope' }).ok).toBe(false);
    s.inventory.rack = 1;
    expect(applyCommand(s, { type: 'buildRack', pos: { x: 2, y: 2 }, techId: 'best' }).ok).toBe(false);
  });

  it('rejects building on walls, storage or occupied tiles', () => {
    const s = quietGame('ch2');
    s.inventory.rack = 3;
    expect(applyCommand(s, { type: 'buildRack', pos: { x: 0, y: 0 }, techId: 'best' }).ok).toBe(false);
    expect(applyCommand(s, { type: 'buildRack', pos: { x: 1, y: 1 }, techId: 'best' }).ok).toBe(false);
    const r = s.racks[0]!.pos;
    expect(applyCommand(s, { type: 'buildRack', pos: r, techId: 'best' }).ok).toBe(false);
    expect(applyCommand(s, { type: 'buildRack', pos: { x: 19, y: 4 }, techId: 'best' }).ok).toBe(false); // locked
  });
});

describe('shop & orders', () => {
  it('ordering costs cash and delivers after the delivery time', () => {
    const s = quietGame('ch1');
    const cash = s.cash;
    const stock = s.inventory.psu;
    expect(applyCommand(s, { type: 'order', part: 'psu', qty: 2 }).ok).toBe(true);
    expect(s.cash).toBe(cash - PARTS.psu.price * 2);
    updateOrders(s);
    expect(s.inventory.psu).toBe(stock);
    s.minute += PARTS.psu.deliveryMin;
    updateOrders(s);
    expect(s.inventory.psu).toBe(stock + 2);
    expect(s.orders).toHaveLength(0);
  });

  it('cannot order without the cash, and qty must be positive', () => {
    const s = quietGame('ch1');
    s.cash = 10;
    expect(applyCommand(s, { type: 'order', part: 'server2u', qty: 1 }).ok).toBe(false);
    s.cash = 99999;
    expect(applyCommand(s, { type: 'order', part: 'disk', qty: 0 }).ok).toBe(false);
  });

  it('interns get instant deliveries', () => {
    const s = quietGame('ch1', 'intern');
    applyCommand(s, { type: 'order', part: 'disk', qty: 1 });
    const stock = s.inventory.disk;
    updateOrders(s);
    expect(s.inventory.disk).toBe(stock + 1);
  });
});

describe('team & contracts', () => {
  it('hiring and firing', () => {
    const s = quietGame('ch1');
    const cand = s.candidates[0]!;
    expect(applyCommand(s, { type: 'hire', candidateId: cand.id }).ok).toBe(true);
    expect(s.techs).toHaveLength(2);
    expect(s.candidates.find((c) => c.id === cand.id)).toBeUndefined();
    expect(s.progress.maxTechs).toBe(2);
    const t = s.techs[1]!;
    expect(applyCommand(s, { type: 'fire', techId: t.id }).ok).toBe(true);
    expect(s.techs).toHaveLength(1);
    expect(applyCommand(s, { type: 'fire', techId: 'manager' }).ok).toBe(false);
  });

  it('accepting a contract activates it; assigning servers', () => {
    const s = quietGame('ch1');
    const offer = s.contracts.find((c) => c.status === 'offered')!;
    expect(applyCommand(s, { type: 'acceptContract', contractId: offer.id }).ok).toBe(true);
    expect(offer.status).toBe('active');
    const d = s.devices[0]!;
    expect(applyCommand(s, { type: 'assign', deviceId: d.id, contractId: offer.id }).ok).toBe(true);
    expect(d.contractId).toBe(offer.id);
    expect(applyCommand(s, { type: 'assign', deviceId: d.id, contractId: 'missing' }).ok).toBe(false);
    expect(applyCommand(s, { type: 'declineContract', contractId: offer.id }).ok).toBe(false);
  });

  it('powering servers off and toggling coolers', () => {
    const s = quietGame('ch1');
    expect(applyCommand(s, { type: 'setPower', deviceId: s.devices[0]!.id, on: false }).ok).toBe(true);
    expect(s.devices[0]!.poweredOn).toBe(false);
    expect(applyCommand(s, { type: 'toggleCooler', coolerId: s.coolers[0]!.id, on: false }).ok).toBe(true);
    expect(s.coolers[0]!.on).toBe(false);
  });

  it('suggests a job for each repairable alarm', () => {
    expect(suggestedJob('disk')).toBe('swapDisk');
    expect(suggestedJob('dataloss')).toBe('swapDisk');
    expect(suggestedJob('psu')).toBe('replacePsu');
    expect(suggestedJob('hung')).toBe('reboot');
    expect(suggestedJob('breaker')).toBe('resetBreaker');
    expect(suggestedJob('overheat')).toBeNull();
  });
});
