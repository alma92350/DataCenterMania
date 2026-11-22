import { clearAlarms } from './alarms';
import { addLog } from './state';
import type { GameState } from './types';

/** Finishes remote reboots that are due: the hang clears without anybody walking to the rack. */
export function updateNoc(s: GameState): void {
  if (!s.remoteReboots?.length) return;
  const due = s.remoteReboots.filter((r) => s.minute >= r.at);
  if (!due.length) return;
  s.remoteReboots = s.remoteReboots.filter((r) => s.minute < r.at);
  for (const r of due) {
    const dev = s.devices.find((d) => d.id === r.deviceId);
    if (!dev || !dev.faults.includes('hung')) continue;
    dev.faults = dev.faults.filter((f) => f !== 'hung');
    clearAlarms(s, (a) => a.kind === 'hung' && a.deviceId === dev.id);
    s.stats.reboots = (s.stats.reboots ?? 0) + 1;
    s.stats.resolved++;
    addLog(s, 'success', '🖥️ Remote reboot worked: the server is back.');
  }
}
