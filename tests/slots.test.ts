// @vitest-environment happy-dom
import { dailySpec } from '../src/sim/daily';
import { advance } from '../src/sim/sim';
import { createGame } from '../src/sim/state';
import { serialize, deserialize } from '../src/sim/save';
import { FR } from '../src/ui/i18n';
import { DEFAULT_SETTINGS, Persistence, SLOT_COUNT, type KeyValueStore } from '../src/ui/storage';
import { pauseMenu, slotsBox, startScreen } from '../src/ui/views';

class Mem implements KeyValueStore {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
}

describe('save slots and save files (v3.3)', () => {
  it('starts with empty slots and keeps them independent of the autosave', () => {
    const p = new Persistence(new Mem());
    expect(p.listSlots()).toEqual(Array(SLOT_COUNT).fill(null));
    const s = createGame('ch1', 'sysadmin', 1);
    p.saveGame(s);
    expect(p.listSlots().every((x) => x === null)).toBe(true);
    p.clearGame();
    p.saveSlot(1, s, 1_700_000_000_000);
    expect(p.loadGame()).toBeNull();
  });

  it('saves, lists, loads and deletes a slot, and the loaded game continues identically', () => {
    const p = new Persistence(new Mem());
    const s = createGame('ch2', 'sysadmin', 5);
    advance(s, 500);
    expect(p.saveSlot(0, s, 1_700_000_000_000)).toBe(true);
    const info = p.listSlots()[0]!;
    expect(info).toMatchObject({ index: 0, chapter: 'ch2', minute: s.minute, savedAt: 1_700_000_000_000, sandbox: false });
    const back = p.loadSlot(0)!;
    advance(s, 300);
    advance(back, 300);
    expect(serialize(back)).toBe(serialize(s));
    p.deleteSlot(0);
    expect(p.listSlots()[0]).toBeNull();
    expect(p.loadSlot(0)).toBeNull();
  });

  it('rejects bad slot numbers, full storage and corrupt data without throwing', () => {
    const full: KeyValueStore = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => undefined };
    const s = createGame('ch1', 'sysadmin', 1);
    expect(new Persistence(full).saveSlot(0, s)).toBe(false);
    const m = new Mem();
    const p = new Persistence(m);
    expect(p.saveSlot(9, s)).toBe(false);
    m.setItem('dcm.slot.2.game.v1', '{not json');
    expect(p.loadSlot(2)).toBeNull();
    m.setItem('dcm.slot.2.meta.v1', '{not json');
    expect(p.listSlots()[2]).toBeNull();
    expect(new Persistence(null).saveSlot(0, s)).toBe(false);
  });

  it('a save file is the same text as a slot: it round-trips through deserialize', () => {
    const s = createGame('ch3', 'sysadmin', 2);
    advance(s, 200);
    expect(serialize(deserialize(serialize(s)))).toBe(serialize(s));
    expect(() => deserialize('nonsense')).toThrow();
  });

  it('shows in the pause menu (with save buttons) and on the start screen (load only), in French too', () => {
    const p = new Persistence(new Mem());
    const s = createGame('ch1', 'sysadmin', 1);
    p.saveSlot(1, s, 1_700_000_000_000);
    const menu = pauseMenu(s, DEFAULT_SETTINGS, p.listSlots());
    expect(menu).toContain('data-action="slotSave"');
    expect(menu).toContain('data-action="downloadSave"');
    expect(menu).toContain('data-action="slotLoad" data-slot="1"');
    expect(menu).not.toContain('data-action="slotLoad" data-slot="0"');
    const start = startScreen({}, DEFAULT_SETTINGS, false, { daily: dailySpec('2026-12-03'), dailyBest: null, achievements: {}, slots: p.listSlots() });
    expect(start).toContain('data-action="slotLoad" data-slot="1"');
    expect(start).not.toContain('data-action="slotSave"');
    expect(start).toContain('id="save-file"');
    expect(slotsBox([null, null, null], true)).not.toMatch(/undefined|NaN/);
    for (const x of ['Save slots and files', 'Slot', 'Empty', 'Save here', 'Overwrite', 'Load', 'Delete', 'Download save file', 'Load a save file']) expect([x, x in FR]).toEqual([x, true]);
  });
});
