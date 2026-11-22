import { chance } from '../core/rng';
import { REDUNDANCY } from '../data/catalog';
import { DIFFICULTIES } from '../data/difficulty';
import { clearAlarms, escalationDelay, raiseAlarm } from './alarms';
import { addLog, showTip } from './state';
import { deviceUp, devicesInRack } from './selectors';
import type { GameState, Rack } from './types';

export const feedState = (r: Rack, feed: 'A' | 'B'): 'ok' | 'failed' => (feed === 'A' ? r.pduA : r.pduB) ?? 'ok';

export function failPdu(s: GameState, rack: Rack, feed: 'A' | 'B'): void {
  if (feedState(rack, feed) === 'failed') return;
  if (feed === 'A') rack.pduA = 'failed';
  else rack.pduB = 'failed';
  const down = devicesInRack(s, rack.id).filter((d) => !deviceUp(s, d)).length;
  const n = s.racks.indexOf(rack) + 1;
  raiseAlarm(s, 'feed', rack.id, null, down > 0 ? 3 : 1, down > 0 ? null : escalationDelay(s, 1));
  addLog(s, down > 0 ? 'fail' : 'alarm', down > 0
    ? `⚡ Feed ${feed} failed on Rack ${n}: ${down} single-corded server${down > 1 ? 's' : ''} down!`
    : `⚡ Feed ${feed} failed on Rack ${n}. Every server still has its other leg. Fix it before the second feed goes.`);
  showTip(s, 'feedFail');
}

export function repairPdu(s: GameState, rack: Rack, feed: 'A' | 'B'): void {
  if (feed === 'A') rack.pduA = 'ok';
  else rack.pduB = 'ok';
  if (rack.pduA !== 'failed' && rack.pduB !== 'failed') clearAlarms(s, (a) => a.kind === 'feed' && a.rackId === rack.id);
  addLog(s, 'success', `⚡ Feed ${feed} is restored on Rack ${s.racks.indexOf(rack) + 1}.`);
}

/** Rare random feed failures once redundancy is in play. */
export function rollFeeds(s: GameState, dt: number): void {
  if (!s.failuresEnabled || !s.features.includes('redundancy')) return;
  const rate = DIFFICULTIES[s.difficulty].incidentRate * (s.incidentMult ?? 1) * REDUNDANCY.pduFailPerDay * (dt / 1440);
  for (const r of s.racks) {
    if (!s.devices.some((d) => d.rackId === r.id)) continue;
    for (const feed of ['A', 'B'] as const) if (chance(s.rng, rate)) failPdu(s, r, feed);
  }
}
