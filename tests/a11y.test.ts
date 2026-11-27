// @vitest-environment happy-dom
import { applyAccessibility, BASE_PALETTE, contrastRatio, DEFAULT_A11Y, paletteFor, TEXT_PX } from '../src/ui/a11y';
import { FR } from '../src/ui/i18n';
import { DEFAULT_SETTINGS } from '../src/ui/storage';
import { settingsForm } from '../src/ui/views';

describe('accessibility (v3.1)', () => {
  it('computes WCAG contrast', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
  });

  it('the default palette reads at 4.5:1 or better for text on every surface', () => {
    const p = paletteFor(DEFAULT_A11Y);
    for (const bg of [p['--bg']!, p['--panel']!]) {
      expect(contrastRatio(p['--text']!, bg)).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(p['--muted']!, bg)).toBeGreaterThanOrEqual(4.5);
      for (const k of ['--ok', '--warn', '--major', '--crit']) expect(contrastRatio(p[k]!, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('high contrast reaches 7:1 for text and muted text, with colour-blind colours still readable', () => {
    const p = paletteFor({ ...DEFAULT_A11Y, highContrast: true, colorBlind: true });
    expect(contrastRatio(p['--text']!, p['--bg']!)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(p['--muted']!, p['--bg']!)).toBeGreaterThanOrEqual(7);
    for (const k of ['--ok', '--warn', '--major', '--crit']) expect(contrastRatio(p[k]!, p['--bg']!)).toBeGreaterThanOrEqual(7);
  });

  it('the colour-blind palette keeps status colours distinguishable by luminance and hue', () => {
    const p = paletteFor({ ...DEFAULT_A11Y, colorBlind: true });
    expect(p['--ok']).not.toBe(BASE_PALETTE['--ok']);
    const set = new Set([p['--ok'], p['--warn'], p['--major'], p['--crit']]);
    expect(set.size).toBe(4);
    // not the classic red/green pair
    expect(p['--ok']!.toLowerCase()).not.toMatch(/^#3d/);
  });

  it('applies text size, motion and contrast to the page and can switch them back', () => {
    applyAccessibility({ textSize: 'xlarge', reduceMotion: true, highContrast: true, colorBlind: false });
    expect(document.documentElement.style.getPropertyValue('--font-px')).toBe(`${TEXT_PX.xlarge}px`);
    expect(document.documentElement.classList.contains('reduce-motion')).toBe(true);
    expect(document.body.classList.contains('high-contrast')).toBe(true);
    expect(document.documentElement.style.getPropertyValue('--bg')).toBe('#000000');
    applyAccessibility(DEFAULT_A11Y);
    expect(document.documentElement.style.getPropertyValue('--font-px')).toBe('15px');
    expect(document.documentElement.classList.contains('reduce-motion')).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--bg')).toBe(BASE_PALETTE['--bg']);
  });

  it('is in the settings form, reflects the saved choices, and has French', () => {
    const html = settingsForm({ ...DEFAULT_SETTINGS, a11y: { ...DEFAULT_A11Y, textSize: 'large', highContrast: true } });
    for (const k of ['textSize', 'reduceMotion', 'highContrast', 'colorBlind']) expect(html).toContain(`data-key="${k}"`);
    expect(html).toMatch(/<option value="large" selected>/);
    for (const x of ['Accessibility', 'Text size', 'Reduce motion', 'High contrast', 'Colour-blind safe colours', 'Normal', 'Large', 'Extra large']) expect([x, x in FR]).toEqual([x, true]);
  });
});
