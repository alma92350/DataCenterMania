import { PARTS } from '../src/data/catalog';
import { avatarSvg, glyphSvg, partSvg, placeSvg, svgUri, setMonoIcons, avatarLook, villainSvg, PART_SPRITES } from '../src/ui/icons';
import type { PartId } from '../src/sim/types';

const PART_IDS = Object.keys(PARTS) as PartId[];

/** Tiny well-formedness check: every opened tag is closed in order. */
function balanced(svg: string): boolean {
  const stack: string[] = [];
  const re = /<\/?([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) {
    const [full, name, , selfClose] = m;
    if (full!.startsWith('</')) {
      if (stack.pop() !== name) return false;
    } else if (!selfClose) stack.push(name!);
  }
  return stack.length === 0;
}

/**
 * Canvas loads sprites as strict XML (unlike inline HTML, which forgives): no duplicate attributes,
 * quoted values, no raw ampersands.
 */
function strictXml(svg: string): string | null {
  const re = /<([a-zA-Z][\w:-]*)((?:\s+[\w:-]+="[^"]*")*)\s*\/?>/g;
  const all = svg.match(/<[a-zA-Z][^>]*>/g) ?? [];
  let matched = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) {
    matched++;
    const names = [...m[2]!.matchAll(/\s([\w:-]+)="/g)].map((x) => x[1]!);
    const dup = names.find((n, i) => names.indexOf(n) !== i);
    if (dup) return `duplicate attribute "${dup}" in <${m[1]}>`;
  }
  if (matched !== all.length) return 'a tag has malformed attributes';
  if (/&(?!amp;|lt;|gt;|quot;|apos;)/.test(svg)) return 'raw ampersand';
  return null;
}

function isGrey(hex: string): boolean {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  return full.slice(0, 2) === full.slice(2, 4) && full.slice(2, 4) === full.slice(4, 6);
}

const hexes = (svg: string) => svg.match(/#[0-9a-fA-F]{3,6}\b/g) ?? [];

describe('part sprites', () => {
  it('every shop part has its own drawing', () => {
    expect(PART_SPRITES.sort()).toEqual([...PART_IDS, 'officeAc'].sort());
    const drawings = PART_IDS.map((id) => partSvg(id));
    expect(new Set(drawings).size).toBe(PART_IDS.length);
  });

  it.each([...PART_IDS, 'officeAc'] as const)('%s is a clean, balanced SVG in colour and in e-ink mono', (id) => {
    for (const mono of [false, true]) {
      const svg = partSvg(id, mono);
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toContain('viewBox="0 0 64 64"');
      expect(svg.endsWith('</svg>')).toBe(true);
      expect(balanced(svg)).toBe(true);
      expect(strictXml(svg)).toBeNull();
      expect(svg).not.toMatch(/undefined|NaN/);
      if (mono) for (const h of hexes(svg)) expect(isGrey(h)).toBe(true);
    }
    expect(hexes(partSvg(id, false)).some((h) => !isGrey(h))).toBe(true); // colour has colour
  });

  it('places and glyphs exist in both modes', () => {
    for (const id of ['storage', 'noc', 'dock'] as const) {
      expect(balanced(placeSvg(id))).toBe(true);
      for (const h of hexes(placeSvg(id, true))) expect(isGrey(h)).toBe(true);
    }
    for (const id of ['bolt', 'wrench', 'rotate', 'broken', 'switchx'] as const) {
      expect(balanced(glyphSvg(id))).toBe(true);
      for (const h of hexes(glyphSvg(id, true))) expect(isGrey(h)).toBe(true);
    }
  });

  it('the default mode can be switched globally (e-ink)', () => {
    const colour = partSvg('disk');
    setMonoIcons(true);
    const mono = partSvg('disk');
    setMonoIcons(false);
    expect(mono).not.toBe(colour);
    expect(partSvg('disk')).toBe(colour);
  });

  it('builds a data URI for canvas use', () => {
    const uri = svgUri(partSvg('rack'));
    expect(uri.startsWith('data:image/svg+xml')).toBe(true);
    expect(decodeURIComponent(uri.split(',')[1]!)).toContain('<svg');
  });
});

describe('people sprites', () => {
  const roles = ['manager', 'hw', 'hvac', 'net', 'lead'] as const;

  it('every role is drawn, balanced, and looks different', () => {
    const drawings = roles.map((r) => avatarSvg(r, 'same-seed'));
    for (const svg of drawings) {
      expect(balanced(svg)).toBe(true);
      expect(strictXml(svg)).toBeNull();
      expect(svg).not.toMatch(/undefined|NaN/);
    }
    expect(new Set(drawings).size).toBe(roles.length);
  });

  it('every face is strict, loadable XML for every role, look and mode', () => {
    const names = ['Mia Byte', 'Alex Cable', 'Priya Patch', 'Jonas Rack', 'Kenji Volt', 'Zoe Fiber', 'Omar Stack', 'Ada Cache', 'Linus Router', 'Grace Packet', 'Hugo Socket', 'Ines Volt'];
    for (const r of roles) for (const n of names) for (const mono of [false, true]) expect(strictXml(avatarSvg(r, n, mono))).toBeNull();
    for (const g of ['bolt', 'wrench', 'rotate', 'broken', 'switchx'] as const) expect(strictXml(glyphSvg(g))).toBeNull();
    for (const p of ['storage', 'noc', 'dock'] as const) expect(strictXml(placeSvg(p))).toBeNull();
  });

  it('a person always looks the same, and different people look different', () => {
    expect(avatarSvg('hw', 'Mia Byte')).toBe(avatarSvg('hw', 'Mia Byte'));
    const faces = new Set(['Mia Byte', 'Alex Cable', 'Priya Patch', 'Jonas Rack', 'Kenji Volt', 'Zoe Fiber', 'Omar Stack', 'Ada Cache'].map((n) => avatarSvg('hw', n)));
    expect(faces.size).toBeGreaterThanOrEqual(5);
    expect(avatarLook('Mia Byte')).toEqual(avatarLook('Mia Byte'));
  });

  it('e-ink portraits are greyscale only', () => {
    for (const r of roles) for (const h of hexes(avatarSvg(r, 'x', true))) expect(isGrey(h)).toBe(true);
  });

  it('the manager is a fixed character regardless of seed', () => {
    expect(avatarSvg('manager', 'anything')).toBe(avatarSvg('manager', 'something else'));
  });
});

describe('villain sprites', () => {
  it('Script Kiddies and Captain Phish are distinct, strict-XML portraits in colour and e-ink', () => {
    const drawings = (['kiddies', 'phish'] as const).flatMap((v) => [false, true].map((mono) => ({ v, mono, svg: villainSvg(v, mono) })));
    for (const { svg, mono } of drawings) {
      expect(balanced(svg)).toBe(true);
      expect(strictXml(svg)).toBeNull();
      expect(svg).not.toMatch(/undefined|NaN/);
      if (mono) for (const h of hexes(svg)) expect(isGrey(h)).toBe(true);
    }
    expect(villainSvg('kiddies')).not.toBe(villainSvg('phish'));
    expect(hexes(villainSvg('phish', false)).some((h) => !isGrey(h))).toBe(true);
  });
});
