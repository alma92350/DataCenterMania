/** Accessibility preferences (v3.1): text size, reduced motion, high contrast and a colour-blind-safe palette. */
export type TextSize = 'normal' | 'large' | 'xlarge';
export interface A11ySettings {
  textSize: TextSize;
  reduceMotion: boolean;
  highContrast: boolean;
  colorBlind: boolean;
}
export const DEFAULT_A11Y: A11ySettings = { textSize: 'normal', reduceMotion: false, highContrast: false, colorBlind: false };

export const TEXT_PX: Record<TextSize, number> = { normal: 15, large: 17, xlarge: 20 };

type Vars = Record<string, string>;
export const BASE_PALETTE: Vars = { '--bg': '#0b0f15', '--panel': '#121923', '--text': '#dfe7f2', '--muted': '#8a9ab0', '--line': '#263243', '--ok': '#3ddc84', '--warn': '#ffb020', '--major': '#ff7a1a', '--crit': '#ff3b5c' };
/** Blue, yellow and orange stay apart for red-green colour blindness; red and green do not. */
export const COLORBLIND_PALETTE: Vars = { '--ok': '#4aa3ff', '--warn': '#ffd400', '--major': '#ff8a00', '--crit': '#ff70b4' };
export const HIGHCONTRAST_PALETTE: Vars = { '--bg': '#000000', '--panel': '#000000', '--text': '#ffffff', '--muted': '#e0e0e0', '--line': '#ffffff' };

/** The palette in force: base colours, then the colour-blind set, then high contrast. */
export function paletteFor(a: A11ySettings): Vars {
  return { ...BASE_PALETTE, ...(a.colorBlind ? COLORBLIND_PALETTE : {}), ...(a.highContrast ? HIGHCONTRAST_PALETTE : {}) };
}

const lin = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}
/** WCAG contrast ratio of two #rrggbb colours (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** Applies the preferences to the page. */
export function applyAccessibility(a: A11ySettings, doc: Document = document): void {
  const root = doc.documentElement;
  root.style.setProperty('--font-px', `${TEXT_PX[a.textSize]}px`);
  root.classList.toggle('reduce-motion', a.reduceMotion);
  doc.body.classList.toggle('high-contrast', a.highContrast);
  const p = paletteFor(a);
  for (const [k, v] of Object.entries(p)) {
    if (a.colorBlind || a.highContrast || root.style.getPropertyValue(k)) root.style.setProperty(k, v);
  }
}
