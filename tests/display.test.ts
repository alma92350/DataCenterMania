import { detectQuest, resolveQuest, detectEink, resolveEink, shouldRedraw } from '../src/ui/display';
import { paletteFor, heatColor } from '../src/render/renderer';
import { DEFAULT_SETTINGS } from '../src/ui/storage';

const env = (o: Partial<Parameters<typeof detectEink>[0]> = {}) => ({ ua: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120', slowUpdate: false, monochrome: false, query: '', ...o });

describe('e-ink detection (Kindle Scribe)', () => {
  it('detects e-ink from media features, the Kindle browser, or a URL flag', () => {
    expect(detectEink(env())).toBe(false);
    expect(detectEink(env({ slowUpdate: true }))).toBe(true);
    expect(detectEink(env({ monochrome: true }))).toBe(true);
    expect(detectEink(env({ ua: 'Mozilla/5.0 (Linux; Kindle Scribe) AppleWebKit/537.36 Silk/120' }))).toBe(true);
    expect(detectEink(env({ ua: 'Mozilla/5.0 (X11; Linux armv7l) Kindle/3.0' }))).toBe(true);
    expect(detectEink(env({ query: '?eink=1' }))).toBe(true);
    expect(detectEink(env({ query: '?eink=0', slowUpdate: true }))).toBe(false);
  });

  it('the setting overrides detection; default is auto', () => {
    expect(DEFAULT_SETTINGS.display).toBe('auto');
    expect(resolveEink('auto', env({ slowUpdate: true }))).toBe(true);
    expect(resolveEink('color', env({ slowUpdate: true }))).toBe(false);
    expect(resolveEink('eink', env())).toBe(true);
  });
});

describe('e-ink rendering', () => {
  it('uses a pure black-and-white palette', () => {
    const p = paletteFor(true);
    expect(p.floorA).toBe('#ffffff');
    expect(p.wall).toBe('#000000');
    for (const v of Object.values(p)) expect(v).toMatch(/^#([0-9a-f])\1([0-9a-f])\2([0-9a-f])\3$|^#[0-9a-f]{6}$/);
    const grey = (hex: string) => hex.slice(1, 3) === hex.slice(3, 5) && hex.slice(3, 5) === hex.slice(5, 7);
    for (const v of Object.values(p)) expect(grey(v)).toBe(true);
    expect(paletteFor(false).floorA).not.toBe('#ffffff');
  });

  it('heat overlay is greyscale on e-ink', () => {
    expect(heatColor(40, true)).toMatch(/^rgba\(0, 0, 0, /);
    expect(heatColor(40, false)).toMatch(/^hsla/);
  });

  it('only redraws when something changed, and not too often', () => {
    expect(shouldRedraw({ key: 'a', lastKey: 'a', now: 10_000, lastDraw: 0, eink: true })).toBe(false);
    expect(shouldRedraw({ key: 'b', lastKey: 'a', now: 10_000, lastDraw: 9_900, eink: true })).toBe(false);
    expect(shouldRedraw({ key: 'b', lastKey: 'a', now: 10_000, lastDraw: 9_000, eink: true })).toBe(true);
    expect(shouldRedraw({ key: 'a', lastKey: 'a', now: 10_000, lastDraw: 9_999, eink: false })).toBe(true);
  });
});

describe('Meta Quest browser profile (v4.0)', () => {
  const q = (o: Partial<{ ua: string; query: string; slowUpdate: boolean }> = {}) => ({ ua: '', slowUpdate: false, monochrome: false, query: '', ...o });
  const QUEST_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/38.0.0.4.64 SamsungBrowser/4.0 Chrome/134.0.0.0 VR Safari/537.36';

  it('is detected from the Oculus Browser user agent and the quest flag', () => {
    expect(detectQuest(q({ ua: QUEST_UA }))).toBe(true);
    expect(detectQuest(q({ ua: 'Mozilla/5.0 (Linux; Android 12; Quest 2) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36' }))).toBe(true);
    expect(detectQuest(q({ ua: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120' }))).toBe(false);
    expect(detectQuest(q({ query: '?quest=1' }))).toBe(true);
    expect(detectQuest(q({ ua: QUEST_UA, query: '?quest=0' }))).toBe(false);
  });

  it('the display setting decides, auto follows detection, and Quest never means e-ink', () => {
    expect(resolveQuest('quest', q())).toBe(true);
    expect(resolveQuest('color', q({ ua: QUEST_UA }))).toBe(false);
    expect(resolveQuest('eink', q({ ua: QUEST_UA }))).toBe(false);
    expect(resolveQuest('auto', q({ ua: QUEST_UA }))).toBe(true);
    expect(resolveEink('quest', q({ slowUpdate: true }))).toBe(false);
    expect(detectEink(q({ ua: QUEST_UA }))).toBe(false);
  });
});
