import { APP_BUILD, APP_VERSION, checkForUpdate } from '../src/ui/version';
import { pauseMenu, startScreen } from '../src/ui/views';
import { createGame } from '../src/sim/state';
import { DEFAULT_SETTINGS } from '../src/ui/storage';

const reply = (body: unknown, ok = true) => async () => ({ ok, json: async () => body });

describe('version and update check', () => {
  it('knows its version (from package.json) and build', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(APP_BUILD).toMatch(/^\d{12}$/);
  });

  it('reports an update only when the published build differs', async () => {
    expect(await checkForUpdate(reply({ version: '9.9.9', build: '999912312359' }))).toEqual({ available: true, latest: '9.9.9' });
    expect(await checkForUpdate(reply({ version: APP_VERSION, build: APP_BUILD }))).toEqual({ available: false, latest: APP_VERSION });
  });

  it('treats offline, errors and malformed files as no update', async () => {
    expect((await checkForUpdate(async () => { throw new Error('offline'); })).available).toBe(false);
    expect((await checkForUpdate(reply({}, false))).available).toBe(false);
    expect((await checkForUpdate(reply({ version: 3 }))).available).toBe(false);
    expect((await checkForUpdate(reply(null))).available).toBe(false);
  });

  it('bypasses the cache with a timestamped no-store request', async () => {
    let seen = '';
    let init: RequestInit | undefined;
    await checkForUpdate(async (u, i) => { seen = u; init = i; return { ok: true, json: async () => ({}) }; });
    expect(seen).toMatch(/^\.\/version\.json\?t=\d+$/);
    expect(init?.cache).toBe('no-store');
  });

  it('shows the version on the start screen and in the pause menu', () => {
    expect(startScreen({}, DEFAULT_SETTINGS, false)).toContain(`v${APP_VERSION}`);
    expect(pauseMenu(createGame('ch1', 'sysadmin', 1), DEFAULT_SETTINGS)).toContain(`v${APP_VERSION}`);
  });
});
