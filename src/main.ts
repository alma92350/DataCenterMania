import './ui/style.css';
import { App } from './ui/app';

import { Persistence } from './ui/storage';
import { watchForUpdates } from './ui/updater';
import { applyLanguage, detectLang } from './ui/i18n';

const saved = new Persistence().loadSettings().lang;
void applyLanguage(saved === 'auto' ? detectLang(navigator.languages) : saved).finally(() => new App().start());

if (import.meta.env.PROD) watchForUpdates();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline support is a bonus */
    });
  });
}
