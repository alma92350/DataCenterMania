/**
 * E-ink display support (Kindle Scribe and similar): monochrome, slow-refresh screens.
 * Detection uses the CSS Media Queries 4 `update: slow` / `monochrome` features, the
 * Kindle browser's user agent, or an explicit `?eink=1|0` URL flag.
 */
export type DisplaySetting = 'auto' | 'color' | 'eink';

export interface DisplayEnv {
  ua: string;
  slowUpdate: boolean;
  monochrome: boolean;
  query: string;
}

export function detectEink(env: DisplayEnv): boolean {
  const flag = /[?&]eink=([01])/.exec(env.query);
  if (flag) return flag[1] === '1';
  return env.slowUpdate || env.monochrome || /Kindle|Silk\//i.test(env.ua);
}

export function resolveEink(setting: DisplaySetting, env: DisplayEnv): boolean {
  if (setting === 'eink') return true;
  if (setting === 'color') return false;
  return detectEink(env);
}

export function browserEnv(): DisplayEnv {
  const mq = (q: string) => {
    try {
      return window.matchMedia(q).matches;
    } catch {
      return false;
    }
  };
  return { ua: navigator.userAgent, slowUpdate: mq('(update: slow)'), monochrome: mq('(monochrome)'), query: location.search };
}

/** E-ink panels ghost and flash on every repaint: redraw only on change, at most twice a second. */
export const EINK_MIN_FRAME_MS = 500;

export function shouldRedraw(o: { key: string; lastKey: string; now: number; lastDraw: number; eink: boolean }): boolean {
  if (!o.eink) return true;
  return o.key !== o.lastKey && o.now - o.lastDraw >= EINK_MIN_FRAME_MS;
}
