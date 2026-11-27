import { checkForUpdate } from './version';
import { t } from './i18n';

const EVERY_MS = 30 * 60 * 1000;

/** Checks for a newer release now, every half hour, and whenever the tab comes back; shows a banner when there is one. */
export function watchForUpdates(): void {
  let shown = false;
  const run = async () => {
    if (shown) return;
    const r = await checkForUpdate();
    if (!r.available) return;
    shown = true;
    const bar = document.createElement('div');
    bar.id = 'update';
    bar.setAttribute('role', 'status');
    bar.innerHTML = `<span>🆕 ${t('A new version is available')}${r.latest ? ` (v${r.latest})` : ''}</span><button class="primary" data-update="reload">${t('Reload')}</button><button class="ghost" data-update="later" aria-label="${t('Later')}">✕</button>`;
    bar.addEventListener('click', (ev) => {
      const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-update]');
      if (!b) return;
      if (b.dataset.update === 'later') bar.remove();
      else {
        window.dispatchEvent(new Event('dcm:before-reload')); // the app saves
        location.reload();
      }
    });
    document.body.appendChild(bar);
  };
  void run();
  setInterval(() => void run(), EVERY_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void run();
  });
}
