/** The version this page was built from, and the check for a newer one (published as version.json). */
export const APP_VERSION: string = __APP_VERSION__;
export const APP_BUILD: string = __APP_BUILD__;

export interface UpdateCheck {
  available: boolean;
  latest: string | null;
}

type Fetch = (url: string, init?: RequestInit) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/** True when the published build differs from this one. Any failure (offline, no file) means "no update". */
export async function checkForUpdate(fetcher: Fetch = (u, i) => fetch(u, i), build: string = APP_BUILD): Promise<UpdateCheck> {
  try {
    const res = await fetcher(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return { available: false, latest: null };
    const data = (await res.json()) as { version?: unknown; build?: unknown };
    if (typeof data.version !== 'string' || typeof data.build !== 'string') return { available: false, latest: null };
    return { available: data.build !== build, latest: data.version };
  } catch {
    return { available: false, latest: null };
  }
}
