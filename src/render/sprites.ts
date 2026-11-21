/**
 * Canvas sprite cache. The SVG sprites from ui/icons are loaded once, then pre-rendered to a small
 * bitmap; every frame draws that bitmap. (Drawing an SVG-backed image directly makes the browser
 * rasterise it again on each draw, which cost frames on slow phones.)
 * Browser-only: without `Image` / `document` (tests, SSR) everything returns null.
 */
import { avatarSvg, glyphSvg, partSvg, placeSvg, svgUri, type GlyphId, type PersonRole } from '../ui/icons';
import type { PartId } from '../sim/types';

/** Pre-rendered sprite size in pixels: crisp up to ~64 CSS px at 2x density. */
const BITMAP = 128;

type Source = HTMLCanvasElement | HTMLImageElement;

const cache = new Map<string, Source | 'loading' | 'failed'>();
let version = 0;

/** Increases whenever a sprite finishes loading, so the map can redraw itself. */
export const spriteVersion = (): number => version;

function load(key: string, svg: () => string): Source | null {
  if (typeof Image === 'undefined' || typeof document === 'undefined') return null;
  const hit = cache.get(key);
  if (hit && hit !== 'loading' && hit !== 'failed') return hit;
  if (hit) return null;
  cache.set(key, 'loading');
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = BITMAP;
    canvas.height = BITMAP;
    const g = canvas.getContext('2d');
    if (g) {
      g.drawImage(img, 0, 0, BITMAP, BITMAP);
      cache.set(key, canvas);
    } else {
      cache.set(key, img);
    }
    version++;
  };
  img.onerror = () => {
    cache.set(key, 'failed');
    console.error(`sprite failed to load: ${key}`); // caught by the e2e "no console errors" checks
  };
  img.src = svgUri(svg().replace('width="64" height="64"', `width="${BITMAP}" height="${BITMAP}"`));
  return null;
}

export const partSprite = (id: PartId | 'officeAc', mono: boolean) => load(`part:${id}:${mono}`, () => partSvg(id, mono));
export const placeSprite = (id: 'storage' | 'noc' | 'dock', mono: boolean) => load(`place:${id}:${mono}`, () => placeSvg(id, mono));
export const glyphSprite = (id: GlyphId, mono: boolean) => load(`glyph:${id}:${mono}`, () => glyphSvg(id, mono));
export const avatarSprite = (role: PersonRole, seed: string, mono: boolean) => load(`av:${role}:${seed}:${mono}`, () => avatarSvg(role, seed, mono));

export function drawSprite(ctx: CanvasRenderingContext2D, img: Source | null, cx: number, cy: number, size: number, alpha = 1): boolean {
  if (!img) return false;
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
  ctx.globalAlpha = 1;
  return true;
}
