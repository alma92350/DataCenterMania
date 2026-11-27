// @vitest-environment happy-dom
import { applyLanguage, FR } from '../src/ui/i18n';
import { createGame } from '../src/sim/state';
import { DEFAULT_SETTINGS } from '../src/ui/storage';
import { pauseMenu, shortcutsModal, SHORTCUTS } from '../src/ui/views';
import '../src/data/catalog';
import '../src/data/chapters';

describe('keyboard shortcuts (v2.9)', () => {
  it('lists every shortcut, with a close button, and is reachable from the pause menu', () => {
    const html = shortcutsModal();
    for (const [k] of SHORTCUTS) expect(html).toContain(`<kbd>${k}</kbd>`);
    expect(html).toContain('data-action="closeModal"');
    expect(pauseMenu(createGame('ch1', 'sysadmin', 1), DEFAULT_SETTINGS)).toContain('data-action="showKeys"');
  });

  it('has no duplicate keys and French for every description', async () => {
    const keys = SHORTCUTS.map(([k]) => k);
    expect(new Set(keys).size).toBe(keys.length);
    for (const [, d] of SHORTCUTS) expect([d, d in FR]).toEqual([d, true]);
    await applyLanguage('fr');
    expect(shortcutsModal()).toContain('Raccourcis clavier');
    await applyLanguage('en');
  });
});
