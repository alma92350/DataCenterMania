/** Release notes shown in the game ("What's new"). Newest first. Add an entry with every version bump. */
export interface Release {
  version: string;
  title: string;
  notes: string[];
}

export const RELEASES: Release[] = [
  { version: '2.8.0', title: 'Trophy room', notes: ['Ten new achievements for the enterprise, AI and campus chapters: efficiency, redundancy, change control, incident command and more.'] },
  { version: '2.7.0', title: 'What’s new', notes: ['This page: release notes inside the game, shown once after an update.'] },
  { version: '2.6.0', title: 'Playtest kit', notes: ['One-tap feedback in the pause menu when the play log is on.', 'The play log measures session length and carries the game version.'] },
  { version: '2.5.0', title: 'Night shift worker', notes: ['Sleeping simulates the night in a background worker, so the page stays responsive.', 'The game shows its version and offers a reload when a newer release is live.'] },
  { version: '2.4.0', title: 'Gigawatt', notes: ['A 1 GW campus tier: it needs community goodwill, fills slowly and makes the board expect much more.'] },
  { version: '2.3.0', title: 'Turn up the heat', notes: ['Choose the supply-air temperature and contain your aisles: energy saved against margin when cooling fails.'] },
  { version: '2.2.0', title: 'Parlez-vous datacenter', notes: ['Every message in the event log now has a French translation.'] },
  { version: '2.1.0', title: 'Site visit', notes: ['Fly to a campus site and play a full shift there; good shifts tune the site up.'] },
  { version: '2.0.0', title: 'Hyperscale', notes: ['Chapter 10 and the campus: several sites, a board, loans and investors.', 'Sandbox gets Campus and Frontier floors; hand-over codes let a friend continue your game.'] },
];

/** Compares dotted versions: negative when a < b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** Releases newer than the one the player last saw (all of them when unknown). */
export const releasesSince = (lastSeen: string | undefined): Release[] => RELEASES.filter((r) => !lastSeen || compareVersions(r.version, lastSeen) > 0);
