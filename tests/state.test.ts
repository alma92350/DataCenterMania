import { createGame, addLog, showTip, newId } from '../src/sim/state';
import { CHAPTERS } from '../src/data/chapters';
import { DIFFICULTIES } from '../src/data/difficulty';

describe('createGame', () => {
  it('builds chapter 0 from its definition', () => {
    const s = createGame('ch0', 'sysadmin', 123);
    expect(s.chapter).toBe('ch0');
    expect(s.minute).toBe(CHAPTERS.ch0.startMinute);
    expect(s.racks).toHaveLength(1);
    expect(s.devices).toHaveLength(3);
    expect(s.coolers).toHaveLength(1);
    expect(s.coolers[0]!.kind).toBe('officeAc');
    expect(s.techs).toHaveLength(1);
    expect(s.techs[0]!.role).toBe('manager');
    expect(s.contracts.filter((c) => c.status === 'active')).toHaveLength(1);
    expect(s.devices.filter((d) => d.contractId === s.contracts[0]!.id)).toHaveLength(2);
    expect(s.inventory.disk).toBe(1);
    expect(s.features).toEqual(['shop']);
    expect(s.progress.status).toBe('playing');
  });

  it('applies the difficulty starting-cash multiplier', () => {
    const base = CHAPTERS.ch1.startCash;
    expect(createGame('ch1', 'intern', 1).cash).toBe(base * DIFFICULTIES.intern.startingCash);
    expect(createGame('ch1', 'senior', 1).cash).toBe(base * DIFFICULTIES.senior.startingCash);
  });

  it('creates hireable candidates when hiring is unlocked', () => {
    expect(createGame('ch0', 'sysadmin', 1).candidates).toHaveLength(0);
    expect(createGame('ch1', 'sysadmin', 1).candidates.length).toBeGreaterThanOrEqual(2);
  });

  it('is deterministic per seed and JSON round-trips', () => {
    const a = createGame('ch2', 'sysadmin', 5);
    const b = createGame('ch2', 'sysadmin', 5);
    expect(a).toEqual(b);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  });

  it('places devices into existing racks without overlap', () => {
    for (const id of ['ch0', 'ch1', 'ch2'] as const) {
      const s = createGame(id, 'sysadmin', 1);
      for (const d of s.devices) expect(s.racks.some((r) => r.id === d.rackId)).toBe(true);
    }
  });
});

describe('state helpers', () => {
  it('newId is unique and log is capped', () => {
    const s = createGame('ch0', 'sysadmin', 1);
    expect(newId(s, 'x')).not.toEqual(newId(s, 'x'));
    for (let i = 0; i < 500; i++) addLog(s, 'info', `msg ${i}`);
    expect(s.log.length).toBeLessThanOrEqual(200);
    expect(s.log[s.log.length - 1]!.text).toBe('msg 499');
  });

  it('showTip shows each tip once', () => {
    const s = createGame('ch0', 'sysadmin', 1);
    showTip(s, 'heat');
    showTip(s, 'heat');
    expect(s.log.filter((l) => l.kind === 'tip')).toHaveLength(1);
    expect(s.seenTips).toContain('heat');
  });
});
