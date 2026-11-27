import { CHAPTERS, CHAPTER_ORDER } from '../src/data/chapters';
import { createGame } from '../src/sim/state';
import { computeRecirculation } from '../src/sim/thermal';
import { updatePower } from '../src/sim/power';
import { availableRoles } from '../src/data/content';
import { isUnlocked } from '../src/ui/storage';
import type { FeatureFlag } from '../src/sim/types';

/**
 * PRD §19 / §21.5: at most two NEW systems per chapter. Feature flags that belong to an
 * already-introduced system count as that system; 'roles' just unlocks the specialist of the
 * system introduced in the same chapter.
 */
const SYSTEM_OF: Record<FeatureFlag, string | null> = {
  shop: 'shop', hire: 'team', projects: 'team', autodispatch: 'team',
  contracts: 'contracts', walkins: 'contracts',
  power: 'power', buildRack: 'expansion', coolers: 'expansion',
  aisles: 'aisles', maintenance: 'maintenance', network: 'network', fatigue: 'fatigue', cyber: 'cyber', backup: 'backup', redundancy: 'redundancy', changes: 'changes',
  roles: null, remote: null,
};

describe('chapter structure (PRD §21.5)', () => {
  it('order is Closet, Server Room, Startup Colo, Colocation Floor, Launch Week, Enterprise DC, Grown-up Infrastructure', () => {
    expect(CHAPTER_ORDER).toEqual(['ch0', 'ch1', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6']);
    expect(CHAPTER_ORDER.map((id) => CHAPTERS[id].number)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(CHAPTERS.ch3.title).toBe('Colocation Floor');
    expect(CHAPTERS.ch4.title).toBe('Launch Week');
    for (let i = 0; i < CHAPTER_ORDER.length - 1; i++) expect(CHAPTERS[CHAPTER_ORDER[i]!].next).toBe(CHAPTER_ORDER[i + 1]);
    expect(CHAPTERS.ch4.next).toBe('ch5');
    expect(CHAPTERS.ch5.next).toBe('ch6');
    expect(CHAPTERS.ch6.next).toBeNull();
  });

  it('each chapter adds at most two new systems, and never drops one', () => {
    let known = new Set<FeatureFlag>();
    for (const id of CHAPTER_ORDER) {
      const features = new Set(CHAPTERS[id].features);
      for (const f of known) expect(features.has(f), `${id} lost ${f}`).toBe(true);
      const fresh = new Set([...features].filter((f) => !known.has(f)).map((f) => SYSTEM_OF[f]).filter((x): x is string => !!x));
      const knownSystems = new Set([...known].map((f) => SYSTEM_OF[f]));
      const newSystems = [...fresh].filter((x) => !knownSystems.has(x));
      expect(newSystems.length, `${id} introduces ${newSystems.join(', ')}`).toBeLessThanOrEqual(2);
      known = features;
    }
  });

  it('Colocation Floor teaches aisles and cooler maintenance, with the HVAC specialist but no network', () => {
    const f = CHAPTERS.ch3.features;
    expect(f).toEqual(expect.arrayContaining(['aisles', 'maintenance', 'roles']));
    expect(f).not.toContain('network');
    expect(f).not.toContain('fatigue');
    const s = createGame('ch3', 'sysadmin', 1);
    expect(s.uplinks).toHaveLength(0);
    expect(s.racks).toHaveLength(15);
    expect(s.racks.every((r) => r.facing === 'S')).toBe(true); // the aisle lesson: every row faces the same way
    updatePower(s);
    expect([...computeRecirculation(s).values()].some((v) => v > 0)).toBe(true);
    expect(availableRoles(s.features)).toEqual(['hw', 'hvac']);
    expect(s.candidates.some((c) => c.role === 'hvac')).toBe(true);
    expect(s.candidates.some((c) => c.role === 'net')).toBe(false);
  });

  it('Launch Week teaches network and fatigue, on a floor whose aisles are already right', () => {
    const f = CHAPTERS.ch4.features;
    expect(f).toEqual(expect.arrayContaining(['network', 'fatigue', 'aisles', 'maintenance']));
    const s = createGame('ch4', 'sysadmin', 1);
    expect(s.uplinks).toHaveLength(1);
    updatePower(s);
    expect([...computeRecirculation(s).values()].every((v) => v === 0)).toBe(true);
    expect(availableRoles(s.features)).toEqual(['hw', 'hvac', 'net']);
    expect(s.candidates.some((c) => c.role === 'net')).toBe(true);
    expect(s.techs.every((t) => Number.isFinite(t.fatigue))).toBe(true);
  });

  it('Launch Week unlocks after Colocation Floor', () => {
    expect(isUnlocked({ ch2: { sysadmin: 1 } }, 'ch4')).toBe(false);
    expect(isUnlocked({ ch3: { sysadmin: 1 } }, 'ch4')).toBe(true);
  });

  it('every chapter ends at 22:00 so a whole number of shifts fits', () => {
    for (const id of CHAPTER_ORDER) expect(CHAPTERS[id].endMinute % 1440).toBe(22 * 60);
  });
});
