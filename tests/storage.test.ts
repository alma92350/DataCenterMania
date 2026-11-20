import { Persistence, isUnlocked, bestStars, type KeyValueStore } from '../src/ui/storage';
import { createGame } from '../src/sim/state';

class MemoryStore implements KeyValueStore {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

class BrokenStore implements KeyValueStore {
  getItem(): string | null {
    throw new Error('blocked');
  }
  setItem(): void {
    throw new Error('blocked');
  }
  removeItem(): void {
    throw new Error('blocked');
  }
}

describe('persistence', () => {
  it('saves and loads a game', () => {
    const p = new Persistence(new MemoryStore());
    expect(p.loadGame()).toBeNull();
    const s = createGame('ch1', 'sysadmin', 4);
    p.saveGame(s);
    expect(p.loadGame()).toEqual(s);
    p.clearGame();
    expect(p.loadGame()).toBeNull();
  });

  it('survives a corrupt save and a broken storage', () => {
    const store = new MemoryStore();
    store.setItem('dcm.save.v1', '{broken');
    expect(new Persistence(store).loadGame()).toBeNull();
    const broken = new Persistence(new BrokenStore());
    expect(() => broken.saveGame(createGame('ch0', 'intern', 1))).not.toThrow();
    expect(broken.loadGame()).toBeNull();
    expect(broken.loadSettings().autoPause).toBe('critical');
    expect(broken.loadProgress()).toEqual({});
  });

  it('keeps the best stars and unlocks the next chapter', () => {
    const p = new Persistence(new MemoryStore());
    expect(isUnlocked(p.loadProgress(), 'ch0')).toBe(true);
    expect(isUnlocked(p.loadProgress(), 'ch1')).toBe(false);
    p.recordResult('ch0', 'sysadmin', 2);
    p.recordResult('ch0', 'sysadmin', 1);
    const prog = p.recordResult('ch0', 'intern', 3);
    expect(prog.ch0).toEqual({ sysadmin: 2, intern: 3 });
    expect(bestStars(prog, 'ch0')).toBe(3);
    expect(isUnlocked(prog, 'ch1')).toBe(true);
    expect(isUnlocked(prog, 'ch2')).toBe(false);
  });

  it('merges settings with defaults', () => {
    const p = new Persistence(new MemoryStore());
    p.saveSettings({ ...p.loadSettings(), nightSkip: false });
    expect(p.loadSettings()).toMatchObject({ nightSkip: false, autoPause: 'critical' });
  });
});
