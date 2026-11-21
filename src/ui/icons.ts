/**
 * Hand-drawn SVG sprites: parts, coolers, places, glyphs and character portraits.
 * Pure string functions (no DOM, no ids) so they work inline in HTML, as canvas images and in tests.
 * Every sprite has a colour version and a pure greys version for e-ink screens (Kindle Scribe).
 */
import type { PartId, TechRole } from '../sim/types';

type Pal = Record<
  'line' | 'w' | 'g1' | 'g2' | 'g3' | 'g4' | 'blue' | 'sky' | 'green' | 'amber' | 'orange' | 'red' | 'yellow' | 'purple' | 'teal' | 'brown' | 'brown2' | 'navy',
  string
>;

const COLOR: Pal = {
  line: '#0b1220', w: '#f4f7fb', g1: '#d5dde8', g2: '#9aa7b8', g3: '#566275', g4: '#2b3444',
  blue: '#3b82f6', sky: '#7cc4ff', green: '#34d17f', amber: '#ffb020', orange: '#ff8a3d', red: '#ef4458',
  yellow: '#ffd23f', purple: '#8b6bd9', teal: '#2fb8a8', brown: '#b9824a', brown2: '#8a5a2b', navy: '#223a63',
};

const MONO: Pal = {
  line: '#000000', w: '#ffffff', g1: '#eeeeee', g2: '#bbbbbb', g3: '#777777', g4: '#333333',
  blue: '#999999', sky: '#bdbdbd', green: '#555555', amber: '#888888', orange: '#aaaaaa', red: '#000000',
  yellow: '#dddddd', purple: '#777777', teal: '#aaaaaa', brown: '#bbbbbb', brown2: '#666666', navy: '#444444',
};

let monoDefault = false;
/** E-ink mode: sprites default to greys. Set by the app when the display mode changes. */
export function setMonoIcons(mono: boolean): void {
  monoDefault = mono;
}

const pal = (mono: boolean): Pal => (mono ? MONO : COLOR);

const wrap = (inner: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${inner}</svg>`;

const S = (c: Pal, w = 2.4) => `stroke="${c.line}" stroke-width="${w}"`;

// ---------------------------------------------------------------- parts

function disk(c: Pal): string {
  return `<rect x="9" y="12" width="46" height="40" rx="5" fill="${c.g2}" ${S(c)}/>
<circle cx="29" cy="31" r="14" fill="${c.g1}" ${S(c)}/><circle cx="29" cy="31" r="5" fill="${c.g3}" ${S(c)}/>
<path d="M47 17 L35 28" ${S(c, 3)}/><circle cx="47" cy="17" r="2.6" fill="${c.g4}"/>
<rect x="13" y="45" width="20" height="4" rx="1.5" fill="${c.w}" ${S(c, 1.4)}/><circle cx="48" cy="46" r="2.4" fill="${c.green}" ${S(c, 1)}/>`;
}

function psu(c: Pal): string {
  const blades = [0, 60, 120].map((a) => `<path d="M27 32 L${(27 + 10 * Math.cos((a * Math.PI) / 180)).toFixed(1)} ${(32 + 10 * Math.sin((a * Math.PI) / 180)).toFixed(1)}" ${S(c, 2)}/>`).join('');
  return `<rect x="6" y="14" width="42" height="36" rx="4" fill="${c.g2}" ${S(c)}/>
<circle cx="27" cy="32" r="13" fill="${c.g1}" ${S(c)}/>${blades}<circle cx="27" cy="32" r="2.6" fill="${c.g3}" ${S(c, 1.4)}/>
<rect x="48" y="27" width="8" height="10" rx="2" fill="${c.g3}" ${S(c)}/><path d="M56 30 H60 M56 34 H60" ${S(c, 2.4)}/>
<path d="M13 20 l5 -1 l-3 5 l5 -1" ${S(c, 1.8)} fill="none"/><rect x="40" y="18" width="5" height="3" rx="1" fill="${c.amber}" ${S(c, 1)}/>`;
}

function bays(c: Pal, x: number, y: number, n: number, w: number, h: number, gap: number): string {
  let out = '';
  for (let i = 0; i < n; i++) {
    const bx = x + i * (w + gap);
    out += `<rect x="${bx}" y="${y}" width="${w}" height="${h}" rx="1.5" fill="${c.g4}" ${S(c, 1.4)}/><rect x="${bx + 1.5}" y="${y + h - 3.5}" width="${w - 3}" height="2" rx="1" fill="${c.g2}"/>`;
  }
  return out;
}

function server1u(c: Pal): string {
  return `<rect x="3" y="22" width="58" height="22" rx="3" fill="${c.g2}" ${S(c)}/>
<rect x="1" y="25" width="4" height="16" rx="1.5" fill="${c.g3}" ${S(c, 1.6)}/><rect x="59" y="25" width="4" height="16" rx="1.5" fill="${c.g3}" ${S(c, 1.6)}/>
${bays(c, 9, 26, 4, 8, 13, 1.8)}
<circle cx="50" cy="29" r="2.2" fill="${c.green}" ${S(c, 1)}/><circle cx="56" cy="29" r="2.2" fill="${c.amber}" ${S(c, 1)}/>
<path d="M48 36 H58 M48 39 H58" ${S(c, 1.4)}/>`;
}

function server2u(c: Pal): string {
  return `<rect x="3" y="12" width="58" height="40" rx="3" fill="${c.g2}" ${S(c)}/>
<rect x="1" y="16" width="4" height="32" rx="1.5" fill="${c.g3}" ${S(c, 1.6)}/><rect x="59" y="16" width="4" height="32" rx="1.5" fill="${c.g3}" ${S(c, 1.6)}/>
${bays(c, 9, 16, 4, 8, 14, 1.8)}${bays(c, 9, 34, 4, 8, 14, 1.8)}
<circle cx="51" cy="21" r="3.2" fill="${c.g1}" ${S(c, 1.4)}/><path d="M51 19.4 V21.8" ${S(c, 1.2)}/>
<circle cx="49" cy="30" r="2.2" fill="${c.green}" ${S(c, 1)}/><circle cx="55" cy="30" r="2.2" fill="${c.amber}" ${S(c, 1)}/>
<path d="M48 40 H58 M48 43 H58 M48 46 H58" ${S(c, 1.4)}/>`;
}

function rack(c: Pal): string {
  let units = '';
  for (let i = 0; i < 6; i++) {
    const y = 10 + i * 7.6;
    units += `<rect x="18" y="${y}" width="28" height="6" rx="1.2" fill="${i % 2 ? c.g1 : c.g2}" ${S(c, 1.2)}/><circle cx="42" cy="${y + 3}" r="1.2" fill="${i === 2 ? c.amber : c.green}"/>`;
  }
  return `<rect x="13" y="4" width="38" height="54" rx="3" fill="${c.g4}" ${S(c)}/><rect x="16" y="7" width="32" height="48" rx="2" fill="${c.g3}" ${S(c, 1.4)}/>${units}
<path d="M17 59 v3 M47 59 v3" ${S(c, 3)}/>`;
}

function snowflake(c: Pal, cx: number, cy: number, r: number, color: string): string {
  const arms = [0, 60, 120].map((a) => {
    const dx = r * Math.cos((a * Math.PI) / 180);
    const dy = r * Math.sin((a * Math.PI) / 180);
    return `M${(cx - dx).toFixed(1)} ${(cy - dy).toFixed(1)} L${(cx + dx).toFixed(1)} ${(cy + dy).toFixed(1)}`;
  }).join(' ');
  return `<path d="${arms}" stroke="${color}" stroke-width="2.2"/><path d="${arms}" stroke="${c.line}" stroke-width="0.6"/>`;
}

function portableAc(c: Pal): string {
  return `<rect x="15" y="6" width="34" height="44" rx="7" fill="${c.w}" ${S(c)}/>
<path d="M21 12 H43 M21 16 H43 M21 20 H43" ${S(c, 1.6)}/>
<rect x="22" y="25" width="20" height="6" rx="2" fill="${c.g4}" ${S(c, 1.2)}/><circle cx="26" cy="28" r="1.4" fill="${c.sky}"/><circle cx="31" cy="28" r="1.4" fill="${c.green}"/>
${snowflake(c, 32, 40, 5.5, c.sky)}
<circle cx="22" cy="56" r="4.4" fill="${c.g3}" ${S(c)}/><circle cx="42" cy="56" r="4.4" fill="${c.g3}" ${S(c)}/>`;
}

function wallAc(c: Pal): string {
  return `<rect x="3" y="10" width="58" height="24" rx="7" fill="${c.w}" ${S(c)}/>
<path d="M9 28 Q32 36 55 28" ${S(c, 2)}/><rect x="9" y="15" width="22" height="5" rx="2" fill="${c.g4}" ${S(c, 1.2)}/>
<circle cx="40" cy="18" r="2" fill="${c.sky}" ${S(c, 1)}/><circle cx="47" cy="18" r="2" fill="${c.green}" ${S(c, 1)}/>
<path d="M14 40 q4 5 0 10 M26 40 q4 5 0 10 M38 40 q4 5 0 10 M50 40 q4 5 0 10" stroke="${c.sky}" stroke-width="2.6"/>
${snowflake(c, 50, 54, 4.4, c.sky)}`;
}

function crac(c: Pal): string {
  const blades = [0, 72, 144, 216, 288].map((a) => `<path d="M32 22 L${(32 + 11 * Math.cos((a * Math.PI) / 180)).toFixed(1)} ${(22 + 11 * Math.sin((a * Math.PI) / 180)).toFixed(1)}" ${S(c, 2.2)}/>`).join('');
  return `<rect x="9" y="4" width="46" height="56" rx="4" fill="${c.g2}" ${S(c)}/>
<circle cx="32" cy="22" r="15" fill="${c.g1}" ${S(c)}/>${blades}<circle cx="32" cy="22" r="3" fill="${c.g3}" ${S(c, 1.4)}/>
<rect x="14" y="42" width="36" height="12" rx="2" fill="${c.g3}" ${S(c, 1.4)}/><path d="M18 46 H46 M18 50 H46" ${S(c, 1.4)}/>
<rect x="15" y="0.5" width="6" height="4" rx="1" fill="${c.blue}" ${S(c, 1.2)}/><rect x="43" y="0.5" width="6" height="4" rx="1" fill="${c.red}" ${S(c, 1.2)}/>`;
}

function filter(c: Pal): string {
  const pleats = 'M14 18 L19 46 L24 18 L29 46 L34 18 L39 46 L44 18 L49 46';
  return `<rect x="8" y="10" width="48" height="44" rx="3" fill="${c.w}" ${S(c)}/>
<path d="${pleats}" stroke="${c.g3}" stroke-width="2.2"/><path d="M12 14 H52 M12 50 H52" ${S(c, 1.4)}/>
<path d="M32 3 v6 M28 6 l4 -4 l4 4" stroke="${c.sky}" stroke-width="2.2"/>`;
}

function netSwitch(c: Pal): string {
  let ports = '';
  for (let i = 0; i < 8; i++) {
    ports += `<rect x="${9 + i * 6.4}" y="27" width="4.6" height="6" rx="0.8" fill="${c.g4}" ${S(c, 1)}/><circle cx="${11.3 + i * 6.4}" cy="38" r="1.3" fill="${i === 5 ? c.amber : c.green}"/>`;
  }
  return `<rect x="3" y="22" width="58" height="22" rx="3" fill="${c.blue}" ${S(c)}/>${ports}
<path d="M14 33 q-3 10 -8 12 M34 33 q0 12 4 16 M52 33 q6 6 3 14" stroke="${c.amber}" stroke-width="2.4"/>
<path d="M22 33 q2 12 -3 17" stroke="${c.sky}" stroke-width="2.4"/>`;
}

function coffee(c: Pal): string {
  return `<rect x="13" y="6" width="32" height="46" rx="5" fill="${c.g4}" ${S(c)}/><rect x="17" y="10" width="24" height="10" rx="2" fill="${c.g1}" ${S(c, 1.4)}/>
<circle cx="23" cy="15" r="2.2" fill="${c.red}" ${S(c, 1)}/><circle cx="31" cy="15" r="2.2" fill="${c.green}" ${S(c, 1)}/>
<rect x="26" y="22" width="6" height="6" rx="1" fill="${c.g3}" ${S(c, 1.2)}/>
<rect x="17" y="46" width="30" height="6" rx="2" fill="${c.g3}" ${S(c, 1.4)}/>
<path d="M22 34 h14 l-2 11 h-10 z" fill="${c.w}" ${S(c, 1.8)}/><path d="M36 36 q5 0 3 6 h-3" ${S(c, 1.8)}/>
<path d="M27 32 q-2 -3 0 -5 M32 32 q-2 -3 0 -5" stroke="${c.g2}" stroke-width="1.8"/>`;
}

function officeAc(c: Pal): string {
  return `<rect x="3" y="14" width="58" height="26" rx="5" fill="${c.g1}" ${S(c)}/>
<path d="M8 20 H56 M8 25 H56 M8 30 H56" ${S(c, 1.6)}/><circle cx="52" cy="35" r="1.8" fill="${c.green}" ${S(c, 1)}/>
<path d="M14 46 q4 4 0 9 M30 46 q4 4 0 9 M46 46 q4 4 0 9" stroke="${c.sky}" stroke-width="2.4"/>`;
}

const PARTS_DRAW: Record<PartId | 'officeAc', (c: Pal) => string> = {
  disk, psu, server1u, server2u, rack, portableAc, wallAc, crac, filter, switch: netSwitch, coffee, officeAc,
};

export const PART_SPRITES = Object.keys(PARTS_DRAW) as (PartId | 'officeAc')[];

export function partSvg(id: PartId | 'officeAc', mono: boolean = monoDefault): string {
  return wrap(PARTS_DRAW[id](pal(mono)));
}

// ---------------------------------------------------------------- places and glyphs

function storage(c: Pal): string {
  const box = (x: number, y: number, w: number, h: number) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.5" fill="${c.brown}" ${S(c, 1.6)}/><path d="M${x + w / 2} ${y} v${h}" stroke="${c.brown2}" stroke-width="2"/>`;
  return `<path d="M6 28 H58 M6 52 H58" ${S(c, 3)}/><path d="M8 6 V60 M56 6 V60" ${S(c, 3)}/>
${box(12, 14, 16, 14)}${box(32, 18, 18, 10)}${box(14, 38, 20, 14)}${box(38, 40, 12, 12)}`;
}

function noc(c: Pal): string {
  return `<rect x="8" y="8" width="38" height="28" rx="3" fill="${c.g4}" ${S(c)}/><rect x="12" y="12" width="30" height="20" rx="1.5" fill="${c.sky}" ${S(c, 1.2)}/>
<path d="M14 28 L21 21 L27 25 L40 14" stroke="${c.green}" stroke-width="2.4"/><path d="M27 36 v8 M18 46 H36" ${S(c, 3)}/>
<path d="M44 50 h12 l-2 10 h-8 z" fill="${c.w}" ${S(c, 1.8)}/><path d="M56 52 q5 0 3 6 h-3" ${S(c, 1.8)}/><path d="M48 46 q-2 -3 0 -5 M52 46 q-2 -3 0 -5" stroke="${c.g2}" stroke-width="1.8"/>`;
}

function dock(c: Pal): string {
  return `<rect x="3" y="14" width="38" height="30" rx="2.5" fill="${c.w}" ${S(c)}/><path d="M10 24 H34 M10 30 H30" stroke="${c.blue}" stroke-width="3"/>
<path d="M41 22 H53 L61 32 V44 H41 z" fill="${c.orange}" ${S(c)}/><path d="M46 26 H52 L56 32 H46 z" fill="${c.sky}" ${S(c, 1.4)}/>
<circle cx="15" cy="48" r="6" fill="${c.g4}" ${S(c)}/><circle cx="15" cy="48" r="2" fill="${c.g1}"/><circle cx="50" cy="48" r="6" fill="${c.g4}" ${S(c)}/><circle cx="50" cy="48" r="2" fill="${c.g1}"/>`;
}

export function placeSvg(id: 'storage' | 'noc' | 'dock', mono: boolean = monoDefault): string {
  const c = pal(mono);
  return wrap(id === 'storage' ? storage(c) : id === 'noc' ? noc(c) : dock(c));
}

export type GlyphId = 'bolt' | 'wrench' | 'rotate' | 'broken' | 'switchx';

export function glyphSvg(id: GlyphId, mono: boolean = monoDefault): string {
  const c = pal(mono);
  switch (id) {
    case 'bolt':
      return wrap(`<polygon points="38,3 14,36 29,36 24,61 50,26 34,26" fill="${c.yellow}" ${S(c, 2.6)}/>`);
    case 'wrench':
      return wrap(`<path d="M14 52 L38 28" stroke="${c.line}" stroke-width="11"/><path d="M14 52 L38 28" stroke="${c.g1}" stroke-width="7"/>
<circle cx="43" cy="21" r="12" fill="${c.g1}" ${S(c)}/><path d="M43 21 L54 10" stroke="${c.w}" stroke-width="9" opacity="1"/><path d="M44 19 L56 8" ${S(c, 2)}/>`);
    case 'rotate':
      return wrap(`<path d="M50 32 A18 18 0 1 1 40 16" stroke="${c.line}" stroke-width="9"/><path d="M50 32 A18 18 0 1 1 40 16" stroke="${c.sky}" stroke-width="5"/>
<polygon points="34,6 48,12 38,24" fill="${c.sky}" ${S(c, 2.2)}/>`);
    case 'broken':
      return wrap(`<circle cx="32" cy="32" r="26" fill="${c.red}" ${S(c)}/><path d="M21 21 L43 43 M43 21 L21 43" stroke="${c.w}" stroke-width="6"/>`);
    case 'switchx':
      return wrap(`<rect x="3" y="22" width="58" height="22" rx="3" fill="${c.g2}" ${S(c)}/><path d="M22 20 L42 46 M42 20 L22 46" stroke="${c.red}" stroke-width="6"/><path d="M22 20 L42 46 M42 20 L22 46" stroke="${c.line}" stroke-width="1.2"/>`);
  }
}

// ---------------------------------------------------------------- people

export type PersonRole = TechRole | 'lead';

const SKIN = ['#f6d7b8', '#e8b98f', '#c98e63', '#9a6440', '#6b4229'];
const SKIN_SHADE = ['#e4bf9a', '#d29f74', '#b07848', '#82532f', '#583422'];
const HAIR = ['#2b2118', '#5a3a22', '#b5651d', '#d9b45a', '#8d8d94'];
const MONO_HAIR = ['#000000', '#333333', '#555555', '#999999', '#777777'];

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export interface Look {
  skin: number;
  hair: number;
  style: 0 | 1 | 2;
  glasses: boolean;
}

/** A person's appearance is derived from their name, so it never changes. */
export function avatarLook(seed: string): Look {
  const h = hash(seed);
  return { skin: h % 5, hair: (h >>> 4) % 5, style: ((h >>> 8) % 3) as 0 | 1 | 2, glasses: ((h >>> 12) % 4) === 0 };
}

const MANAGER_LOOK: Look = { skin: 1, hair: 1, style: 0, glasses: true };

function hairBack(look: Look, hair: string, c: Pal): string {
  if (look.style === 1) return `<path d="M19 28 Q18 52 24 52 L40 52 Q46 52 45 28 Z" fill="${hair}" ${S(c, 1.6)}/>`;
  return '';
}

function hairFront(look: Look, hair: string, c: Pal, hasHat: boolean): string {
  if (hasHat) {
    // only the sideburns / fringe peek out from under a hat
    return look.style === 2 ? `<circle cx="20.5" cy="27" r="3.2" fill="${hair}" ${S(c, 1.2)}/><circle cx="43.5" cy="27" r="3.2" fill="${hair}" ${S(c, 1.2)}/>`
      : `<path d="M21 25 q-1 4 1 6 M43 25 q1 4 -1 6" stroke="${hair}" stroke-width="2.4"/>`;
  }
  if (look.style === 2) {
    return `<circle cx="22" cy="20" r="6" fill="${hair}" ${S(c, 1.4)}/><circle cx="32" cy="15" r="7" fill="${hair}" ${S(c, 1.4)}/><circle cx="42" cy="20" r="6" fill="${hair}" ${S(c, 1.4)}/>`;
  }
  return `<path d="M20 26 Q19 11 32 11 Q45 11 44 26 Q40 19 32 19 Q24 19 20 26 Z" fill="${hair}" ${S(c, 1.6)}/>`;
}

interface Outfit {
  bg: string;
  body: string;
  details: (c: Pal) => string;
  hat: (c: Pal) => string;
}

function outfit(role: PersonRole, c: Pal): Outfit {
  switch (role) {
    case 'manager':
      return {
        bg: c.sky, body: c.navy,
        details: () => `<path d="M26 46 L32 56 L38 46 Z" fill="${c.w}" ${S(c, 1.4)}/><path d="M32 47 L29.5 64 L34.5 64 Z" fill="${c.red}" ${S(c, 1.2)}/><path d="M32 47 l-2.4 3 l2.4 2 l2.4 -2 z" fill="${c.red}" ${S(c, 1)}/>
<polygon points="45,52 46.4,55 49.6,55.3 47.2,57.4 47.9,60.5 45,59 42.1,60.5 42.8,57.4 40.4,55.3 43.6,55" fill="${c.yellow}" ${S(c, 0.9)}/>`,
        hat: () => '',
      };
    case 'hw':
      return {
        bg: c.sky, body: c.orange,
        details: () => `<path d="M22 64 V50 M42 64 V50" stroke="${c.yellow}" stroke-width="4"/><path d="M26 46 L32 52 L38 46" ${S(c, 1.6)}/>`,
        hat: () => `<path d="M19 22 Q19 6 32 6 Q45 6 45 22 Z" fill="${c.yellow}" ${S(c, 1.8)}/><path d="M16 23 Q32 18 48 23 L47 26 Q32 22 17 26 Z" fill="${c.yellow}" ${S(c, 1.8)}/><path d="M32 6 V16" ${S(c, 1.6)}/>`,
      };
    case 'hvac':
      return {
        bg: c.sky, body: c.teal,
        details: () => `<rect x="25" y="50" width="14" height="9" rx="2" fill="${c.w}" ${S(c, 1.2)}/><path d="M32 51.5 V57.5 M29.4 53 L34.6 56 M34.6 53 L29.4 56" stroke="${c.blue}" stroke-width="1.4"/>`,
        hat: () => `<path d="M19 22 Q19 9 32 9 Q45 9 45 22 Z" fill="${c.blue}" ${S(c, 1.8)}/><path d="M18 22 L8 25 Q10 28 20 26 Z" fill="${c.blue}" ${S(c, 1.6)}/><path d="M32 9 V15" ${S(c, 1.4)}/><rect x="21" y="19" width="22" height="5" rx="2.5" fill="${c.sky}" ${S(c, 1.4)}/>`,
      };
    case 'net':
      return {
        bg: c.sky, body: c.purple,
        details: () => `<path d="M27 46 V54 M37 46 V54" stroke="${c.w}" stroke-width="2"/><rect x="24" y="55" width="16" height="8" rx="2" fill="${c.g4}" ${S(c, 1.2)}/><path d="M27 59 h10" stroke="${c.green}" stroke-width="1.6"/>`,
        hat: () => `<path d="M18 24 Q18 8 32 8 Q46 8 46 24 Q40 18 32 18 Q24 18 18 24 Z" fill="${c.g4}" ${S(c, 1.8)}/><circle cx="32" cy="6" r="3" fill="${c.g4}" ${S(c, 1.4)}/>
<path d="M18 25 q0 -17 14 -17 q14 0 14 17" stroke="${c.g3}" stroke-width="2.4"/><rect x="14.5" y="24" width="5" height="9" rx="2.4" fill="${c.g3}" ${S(c, 1.4)}/><rect x="44.5" y="24" width="5" height="9" rx="2.4" fill="${c.g3}" ${S(c, 1.4)}/><path d="M19 32 Q22 40 28 39" ${S(c, 1.8)}/><circle cx="29.5" cy="39" r="1.8" fill="${c.red}" ${S(c, 1)}/>`,
      };
    case 'lead':
      return {
        bg: c.sky, body: c.green,
        details: () => `<path d="M26 46 L32 55 L38 46" ${S(c, 1.6)}/><rect x="40" y="50" width="7" height="12" rx="1.8" fill="${c.g4}" ${S(c, 1.2)}/><path d="M43.5 50 V45" ${S(c, 1.8)}/><circle cx="43.5" cy="55" r="1.4" fill="${c.amber}"/>
<path d="M22 64 V52 M42 64 V54" stroke="${c.w}" stroke-width="2.4"/>`,
        hat: () => `<path d="M19 22 Q19 6 32 6 Q45 6 45 22 Z" fill="${c.w}" ${S(c, 1.8)}/><path d="M16 23 Q32 18 48 23 L47 26 Q32 22 17 26 Z" fill="${c.w}" ${S(c, 1.8)}/><polygon points="32,9 33.6,13 37.8,13.2 34.5,15.8 35.7,19.8 32,17.4 28.3,19.8 29.5,15.8 26.2,13.2 30.4,13" fill="${c.green}" ${S(c, 0.9)}/>`,
      };
  }
}

/** A round portrait (viewBox 0 0 64 64, bust inside a circle) of a person with a role-specific outfit. */
export function avatarSvg(role: PersonRole, seed: string, mono: boolean = monoDefault): string {
  const c = pal(mono);
  const look = role === 'manager' ? MANAGER_LOOK : avatarLook(seed);
  const skin = mono ? '#eeeeee' : SKIN[look.skin]!;
  const shade = mono ? '#cccccc' : SKIN_SHADE[look.skin]!;
  const hair = mono ? MONO_HAIR[look.hair]! : HAIR[look.hair]!;
  const o = outfit(role, c);
  const hasHat = role !== 'manager';
  const glasses = (look.glasses || role === 'manager' || role === 'net')
    ? `<circle cx="27" cy="31" r="4.2" ${S(c, 1.6)} fill="${c.w}" fill-opacity="0.35"/><circle cx="37" cy="31" r="4.2" ${S(c, 1.6)} fill="${c.w}" fill-opacity="0.35"/><path d="M31.2 31 h1.6" ${S(c, 1.6)}/>`
    : '';
  const face = `<ellipse cx="32" cy="30" rx="12" ry="13.5" fill="${skin}" ${S(c, 1.8)}/><ellipse cx="20" cy="31" rx="2.2" ry="3" fill="${skin}" ${S(c, 1.4)}/><ellipse cx="44" cy="31" rx="2.2" ry="3" fill="${skin}" ${S(c, 1.4)}/>
<circle cx="27" cy="31" r="1.6" fill="${c.line}"/><circle cx="37" cy="31" r="1.6" fill="${c.line}"/>
<path d="M24 26.5 q3 -2 6 -0.4 M34 26.1 q3 -1.6 6 0.4" ${S(c, 1.4)}/><path d="M32 33 q-1.4 3 0.6 3.6" ${S(c, 1.2)}/><path d="M27.5 38.5 q4.5 3.6 9 0" ${S(c, 1.8)}/>`;
  return wrap(`<g><circle cx="32" cy="32" r="30.5" fill="${o.bg}" ${S(c, 2.4)}/>
<g clip-path="url(#clip)"><clipPath id="clip"><circle cx="32" cy="32" r="30"/></clipPath>
${hairBack(look, hair, c)}
<path d="M5 66 C5 49 18 44 32 44 C46 44 59 49 59 66 Z" fill="${o.body}" ${S(c, 2)}/>
<rect x="27" y="38" width="10" height="9" rx="3" fill="${shade}" ${S(c, 1.4)}/>
${o.details(c)}
${face}${glasses}
${hairFront(look, hair, c, hasHat)}
${o.hat(c)}</g></g>`);
}

/** Data URI of an SVG string, for canvas `Image` use. */
export function svgUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
