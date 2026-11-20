import './ui/style.css';
import { App } from './ui/app';

new App().start();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline support is a bonus */
    });
  });
}
