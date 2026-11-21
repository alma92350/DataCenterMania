import { CHAPTERS, type ScriptedAction } from '../data/chapters';
import { applyFault } from './failures';
import { cutUplink } from './network';
import { launchAttack } from './cyber';
import { addLog, makeContract, showTip } from './state';
import type { GameState } from './types';

function run(s: GameState, a: ScriptedAction): void {
  switch (a.type) {
    case 'say':
      addLog(s, 'story', a.text);
      break;
    case 'tip':
      showTip(s, a.key);
      break;
    case 'fault': {
      const rack = s.racks[a.rack];
      const dev = rack ? s.devices.filter((d) => d.rackId === rack.id)[a.device] : undefined;
      if (dev) applyFault(s, dev, a.fault);
      break;
    }
    case 'ambient':
      s.ambient = a.value;
      if (a.officeAc !== undefined) for (const c of s.coolers) if (c.kind === 'officeAc') c.on = a.officeAc;
      if (a.text) addLog(s, 'story', a.text);
      break;
    case 'offer':
      s.contracts.push({ ...makeContract(s, a.contract, 'offered'), expiresDay: Math.floor(s.minute / 1440) + 3 });
      break;
    case 'failures':
      s.failuresEnabled = a.enabled;
      break;
    case 'filter': {
      const c = s.coolers[a.cooler];
      if (c) c.health = Math.min(c.health, a.health);
      break;
    }
    case 'attack':
      launchAttack(s, a.kind, a.villain);
      break;
    case 'cutUplink': {
      const u = s.uplinks[a.uplink];
      if (a.text) addLog(s, 'story', a.text);
      if (u) cutUplink(s, u);
      break;
    }
  }
}

export function runScriptedEvents(s: GameState): void {
  if (s.progress.firedEvents.includes('*all*')) return;
  for (const ev of CHAPTERS[s.chapter].events) {
    if (ev.at > s.minute || s.progress.firedEvents.includes(ev.id)) continue;
    s.progress.firedEvents.push(ev.id);
    for (const a of ev.actions) run(s, a);
  }
}
