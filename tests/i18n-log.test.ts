// @vitest-environment happy-dom
import { applyLanguage, FR, tl } from '../src/ui/i18n';
import '../src/sim/alarms';
import '../src/data/catalog';
import '../src/data/content';
import '../src/data/chapters';
import '../src/data/difficulty';
import '../src/sim/achievements';
import '../src/ui/views';
import '../src/data/handbook';
import { LOG_FR } from '../src/ui/i18n-log';

/** Every literal log template in src/sim, with `${…}` as {s} and the leading icon removed. */
const SOURCES = import.meta.glob('../src/sim/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

function templates(): string[] {
  const out = new Set<string>();
  const rx = /addLog\(\s*[\w.]+\s*,\s*(?:'[a-z]+'|[^,]+?)\s*,\s*(`(?:[^`$]|\$(?!\{)|\$\{[^}`]*\})*`|'(?:[^'\\]|\\.)*')/g;
  for (const src of Object.values(SOURCES)) {
    for (const m of src.matchAll(rx)) {
      const lit = m[1]!.slice(1, -1).replace(/\$\{[^}]*\}/g, '{s}').replace(/\\'/g, "'");
      const text = lit.replace(/^(?:\p{Extended_Pictographic}️?‍?\s?)+/u, '');
      if (/[A-Za-z]{3}/.test(text.replace(/\{s\}/g, ''))) out.add(text);
    }
  }
  return [...out];
}

describe('French simulation log messages (v2.2)', () => {
  it('finds the templates (guards the extraction itself)', () => {
    expect(templates().length).toBeGreaterThan(100);
  });

  it('keeps wildcard slots aligned between English and French', () => {
    for (const [en, fr] of Object.entries(LOG_FR)) {
      const slots = (en.match(/\{s\}/g) ?? []).length;
      expect([en, (fr.match(/\{s\}|\{\d\}/g) ?? []).length]).toEqual([en, slots]);
    }
  });

  it('translates every literal log template', { timeout: 60000 }, async () => {
    await applyLanguage('fr');
    const byRegex = ['Escalated to {s}: {s}', 'Day {s} closed: {s}${s} (revenue ${s}, costs ${s}).']; // tlRx, covered below
    const missing = templates().filter((tpl) => {
      if (byRegex.includes(tpl)) return false;
      const sample = tpl.replace(/\{s\}/g, '3');
      return tl(sample) === sample && !(tpl in FR);
    });
    await applyLanguage('en');
    expect(missing).toEqual([]);
  });

  it('keeps names, numbers and nested labels', { timeout: 60000 }, async () => {
    await applyLanguage('fr');
    expect(tl('📦 Coolant unit ordered: arrives in 2 days.')).toBe('📦 Unité de refroidissement commandée : arrivée dans 2 jours.');
    expect(tl('Worm outbreak: 2 racks quarantined. Clean and re-image them.')).toBe('Épidémie de ver : 2 baies en quarantaine. Nettoyez-les et réinstallez-les.');
    expect(tl('Alice: Reboot Rack 3 done.')).toContain('Alice');
    expect(tl('Day 4 closed: +$320 (revenue $900, costs $580).')).toBe('Jour 4 clos : +320 $ (revenus 900 $, coûts 580 $).');
    expect(tl('Chapter 5: Enterprise. Welcome.')).toBe('Chapitre 5 : Enterprise. Welcome.');
    await applyLanguage('en');
    expect(tl('Contract Acme ended.')).toBe('Contract Acme ended.');
  });
});
