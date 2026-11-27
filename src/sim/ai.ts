import { chance } from '../core/rng';
import { AI, PARTS } from '../data/catalog';
import { clearAlarms, raiseAlarm } from './alarms';
import { addLog, showTip } from './state';
import { contractDevices, deviceUp } from './selectors';
import type { Contract, Device, GameState } from './types';

export const aiContracts = (s: GameState): Contract[] => s.contracts.filter((c) => c.kind === 'ai' && c.status === 'active');
export const gpuDevices = (s: GameState, c: Contract): Device[] => contractDevices(s, c.id).filter((d) => d.gpu);

export const paused = (s: GameState, c: Contract): boolean => (c.pausedUntil ?? 0) > s.minute;

/** Cluster interruptions grow faster than linearly with cluster size (PRD v2 addendum P6). */
export function interruptRatePerMin(s: GameState, n: number): number {
  if (n <= 0) return 0;
  const clusterFactor = 1 + AI.clusterGrowth * (n - 1);
  const auto = s.aiTech?.autoRestart ? AI.autoRestartMult : 1;
  return (n * AI.interruptPerDay * clusterFactor * auto) / 1440;
}

export const lossMinutes = (s: GameState): number => (s.aiTech?.checkpoint ? AI.lossCheckpointMin : AI.lossMin);

/** Per game minute: cluster interruptions, and silent corruption that nobody noticed. */
export function updateAi(s: GameState): void {
  if (!s.features.includes('ai') || (!s.failuresEnabled && !s.aiForce)) return;
  for (const c of aiContracts(s)) {
    const gpus = gpuDevices(s, c);
    const running = gpus.filter((d) => deviceUp(s, d));
    if (running.length && !paused(s, c) && chance(s.rng, interruptRatePerMin(s, running.length) * (s.incidentMult ?? 1))) {
      c.pausedUntil = s.minute + lossMinutes(s);
      c.aiInterrupts = (c.aiInterrupts ?? 0) + 1;
      addLog(s, 'info', `🧠 The ${c.name} training run was interrupted. Restarting from the last checkpoint (${lossMinutes(s)} min lost).`);
      showTip(s, 'aiInterrupt');
    }
    // corrupted nodes poison the whole run until someone finds them
    if (gpus.some((d) => d.faults.includes('corrupt'))) c.pausedUntil = Math.max(c.pausedUntil ?? 0, s.minute + 2);
  }
  for (const d of s.devices) {
    const at = corruptSince.get(d.id);
    if (d.faults.includes('corrupt')) {
      if (at === undefined) corruptSince.set(d.id, s.minute);
      else if (s.minute - at >= AI.corruptUndetectedMin) {
        d.faults = d.faults.filter((f) => f !== 'corrupt');
        corruptSince.delete(d.id);
        clearAlarms(s, (a) => a.kind === 'corrupt' && a.deviceId === d.id);
        s.reputation = Math.max(0, s.reputation - 0.3);
        addLog(s, 'fail', '🧠 A customer found wrong answers from a corrupted GPU server before you did. Reputation hit, and the run restarted.');
      }
    } else corruptSince.delete(d.id);
  }
}

const corruptSince = new Map<string, number>();

/** Silent data corruption: wrong answers without a crash. Diagnostics (NOC level 2) raises an alarm; otherwise it stays hidden. */
export function corruptNode(s: GameState, text?: string): void {
  const d = s.devices.find((x) => x.gpu && deviceUp(s, x) && !x.faults.includes('corrupt'));
  if (!d) return;
  d.faults.push('corrupt');
  corruptSince.set(d.id, s.minute);
  if (text) addLog(s, 'story', text);
  if ((s.noc ?? 0) >= 2) {
    raiseAlarm(s, 'corrupt', d.rackId, d.id, 2, null);
    addLog(s, 'alarm', '🧠 Remote diagnostics caught silent data corruption on a GPU server. Reboot it before the customer notices.');
  } else {
    addLog(s, 'info', '🧠 Something is off: results from one GPU server look wrong, but nothing crashed…');
  }
  showTip(s, 'corrupt');
}

/** Effective training time since the chapter started, over all AI contracts (percent). */
export function aiEffective(s: GameState): number {
  let total = 0;
  let ok = 0;
  for (const c of s.contracts) {
    if (c.kind !== 'ai') continue;
    total += c.totalMinutes + c.minutesToday;
    ok += c.totalOkMinutes + c.okMinutesToday;
  }
  return total === 0 ? 100 : (ok / total) * 100;
}

export const gpuPrice = (): number => AI.gpuUpgradePrice + PARTS.server2u.price * 0;

export function resetAiState(): void {
  corruptSince.clear();
}
