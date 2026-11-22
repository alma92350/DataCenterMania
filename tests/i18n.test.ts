// @vitest-environment happy-dom
import { ALARM_TEXT } from '../src/sim/alarms';
import { CHAPTERS } from '../src/data/chapters';
import { JOB_LABEL, PARTS, ROLE_LABEL } from '../src/data/catalog';
import { TIPS } from '../src/data/content';
import { DIFFICULTIES } from '../src/data/difficulty';
import { ACHIEVEMENTS } from '../src/sim/achievements';
import { FR, applyLanguage, currentLang, detectLang, t } from '../src/ui/i18n';
import { DEFAULT_SETTINGS } from '../src/ui/storage';
import { settingsForm, startScreen } from '../src/ui/views';
import { dailySpec } from '../src/sim/daily';

// source strings, captured before any translation happens
const SOURCE = {
  alarms: Object.values(ALARM_TEXT), jobs: Object.values(JOB_LABEL), roles: Object.values(ROLE_LABEL), parts: Object.values(PARTS).map((p) => p.name),
  tips: Object.values(TIPS), chapters: Object.values(CHAPTERS).flatMap((c) => [c.title, c.subtitle, c.intro]),
  diffs: Object.values(DIFFICULTIES).flatMap((d) => [d.name, d.blurb]),
};

describe('localisation', () => {
  it('picks French for French browsers, English otherwise', () => {
    expect(detectLang(['fr-FR', 'en'])).toBe('fr');
    expect(detectLang(['en-GB'])).toBe('en');
    expect(detectLang(undefined)).toBe('en');
  });

  it('English is the default and falls back to the source string', () => {
    expect(currentLang()).toBe('en');
    expect(t('Shop')).toBe('Shop');
    expect(t('a string with no translation')).toBe('a string with no translation');
  });

  it('every alarm, job, role, part, tip, chapter text and difficulty has a French translation', () => {
    const all = [...SOURCE.alarms, ...SOURCE.jobs, ...SOURCE.roles, ...SOURCE.parts, ...SOURCE.tips, ...SOURCE.chapters, ...SOURCE.diffs];
    const missing = all.filter((x) => !(x in FR));
    expect(missing).toEqual([]);
    for (const k of Object.keys(FR)) expect(FR[k]!.trim()).not.toBe('');
  });

  it('translates the data tables and the menus when French is applied', async () => {
    await applyLanguage('fr');
    expect(currentLang()).toBe('fr');
    expect(document.documentElement.lang).toBe('fr');
    expect(ALARM_TEXT.gridDown).toBe('Coupure du réseau électrique');
    expect(CHAPTERS.ch5.title).toBe('Datacenter d’entreprise');
    expect(ROLE_LABEL.elec).toBe('Électricien');
    expect(TIPS.welcome).toContain('placard');
    expect(ACHIEVEMENTS.length).toBeGreaterThan(0);
    const extras = { daily: dailySpec('2026-12-03'), dailyBest: null, achievements: {} };
    const html = startScreen({}, DEFAULT_SETTINGS, true, extras);
    expect(html).toContain('Continuer');
    expect(html).toContain('Difficulté');
    expect(html).toContain('Chapitres');
    expect(settingsForm(DEFAULT_SETTINGS)).toContain('Langue');
    expect(settingsForm(DEFAULT_SETTINGS)).toContain('Français');
    await applyLanguage('en');
  });
});
