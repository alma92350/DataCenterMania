/**
 * Canvas sprite cache. The SVG sprites from ui/icons are rasterised once by the browser and
 * reused every frame. Browser-only: without `Image` (tests, SSR) everything returns null.
 */
import { avatarSvg, glyphSvg, partSvg, placeSvg, svgUri, type GlyphId, type PersonRole } from '../ui/icons';
import type { PartId } from '../sim/types';

const cache = new Map<string, HTMLImageElement>();
let version = 0;

/** Increases whenever a sprite finishes loading, so the map can redraw itself. */
export const spriteVersion = (): number => version;

function load(key: string, svg: () => string): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null;
  let img = cache.get(key);
  if (!img) {
    img = new Image();
    img.onload = () => version++;
    img.onerror = () => console.error(`sprite failed to load: ${key}`); // caught by the e2e "no console errors" checks
    // rasterise at 2x so sprites stay crisp on high-density phone screens
    img.src = svgUri(svg().replace('width="64" height="64"', 'width="128" height="128"'));
    cache.set(key, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

export const partSprite = (id: PartId | 'officeAc', mono: boolean) => load(`part:${id}:${mono}`, () => partSvg(id, mono));
export const placeSprite = (id: 'storage' | 'noc' | 'dock', mono: boolean) => load(`place:${id}:${mono}`, () => placeSvg(id, mono));
export const glyphSprite = (id: GlyphId, mono: boolean) => load(`glyph:${id}:${mono}`, () => glyphSvg(id, mono));
export const avatarSprite = (role: PersonRole, seed: string, mono: boolean) => load(`av:${role}:${seed}:${mono}`, () => avatarSvg(role, seed, mono));

export function drawSprite(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, cx: number, cy: number, size: number, alpha = 1): boolean {
  if (!img) return false;
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
  ctx.globalAlpha = 1;
  return true;
}
