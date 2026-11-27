// @vitest-environment happy-dom
import { compareVersions, RELEASES, releasesSince } from '../src/data/releases';
import { FR, applyLanguage, t } from '../src/ui/i18n';
import { DEFAULT_SETTINGS } from '../src/ui/storage';
import { APP_VERSION } from '../src/ui/version';
import { startScreen, whatsNew } from '../src/ui/views';
import '../src/data/catalog';
import '../src/data/chapters';

describe('release notes (v2.7)', () => {
  it('compares versions numerically', () => {
    expect(compareVersions('2.10.0', '2.9.0')).toBeGreaterThan(0);
    expect(compareVersions('2.0', '2.0.0')).toBe(0);
    expect(compareVersions('1.9.9', '2.0.0')).toBeLessThan(0);
  });

  it('lists the current version first, newest to oldest, and every note has French', () => {
    expect(RELEASES[0]!.version).toBe(APP_VERSION);
    for (let i = 1; i < RELEASES.length; i++) expect(compareVersions(RELEASES[i - 1]!.version, RELEASES[i]!.version)).toBeGreaterThan(0);
    for (const r of RELEASES) for (const s of [r.title, ...r.notes]) expect([s, s in FR]).toEqual([s, true]);
  });

  it('selects what is new since the last visit', () => {
    expect(releasesSince('2.5.0').map((r) => r.version)).toEqual(RELEASES.filter((r) => compareVersions(r.version, '2.5.0') > 0).map((r) => r.version));
    expect(releasesSince(APP_VERSION)).toEqual([]);
    expect(releasesSince(undefined).length).toBe(RELEASES.length);
  });

  it('opens the notes once after an update, closed and read-only otherwise', () => {
    const after = whatsNew({ ...DEFAULT_SETTINGS, seenVersion: '2.4.0' });
    expect(after).toContain('open');
    expect(after).toContain('data-action="seenNotes"');
    expect(after).toContain('Playtest kit');
    expect(after).not.toContain('Hyperscale');
    const current = whatsNew({ ...DEFAULT_SETTINGS, seenVersion: APP_VERSION });
    expect(current).not.toContain('seenNotes');
    expect(current).not.toMatch(/<details class="whatsnew" open/);
    expect(startScreen({}, { ...DEFAULT_SETTINGS, seenVersion: APP_VERSION }, false)).toContain('class="whatsnew"');
  });

  it('is translated', async () => {
    await applyLanguage('fr');
    expect(whatsNew({ ...DEFAULT_SETTINGS, seenVersion: '2.4.0' })).toContain('Nouveautés depuis votre dernière visite');
    expect(t('Playtest kit')).toBe('Kit de playtest');
    await applyLanguage('en');
  });
});
