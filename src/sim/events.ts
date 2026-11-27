import { CHAPTERS, type ScriptedAction } from '../data/chapters';
import { applyFault } from './failures';
import { cutUplink } from './network';
import { startOutage } from './backup';
import { failPdu } from './feeds';
import { delayInfra, offerChange, supplyShock } from './changes';
import { cutOob, startDrought, surge } from './site';
import { failPump, leak, spike } from './liquid';
import { corruptNode } from './ai';
import { runAudit } from './crm';
import { raisePager } from './nights';
import { raiseAlarm } from './alarms';
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
    case 'offerChange':
      offerChange(s, a.kind);
      break;
    case 'supplyShock':
      supplyShock(s, a.days, a.text);
      break;
    case 'audit':
      runAudit(s);
      break;
    case 'pager': {
      raisePager(s, a.text);
      if (a.what === 'feed') {
        const r = s.racks.find((x) => s.devices.some((d) => d.rackId === x.id && (d.psus ?? 1) !== 2)) ?? s.racks[3];
        if (r) failPdu(s, r, 'A');
      } else {
        const c = s.coolers.find((x) => x.kind !== 'officeAc' && !x.broken);
        if (c) {
          c.broken = true;
          raiseAlarm(s, 'coolerDown', null, null, 3, null, { coolerId: c.id });
        }
      }
      break;
    }
    case 'pumpFail':
      failPump(s, a.text);
      break;
    case 'leak':
      leak(s, a.rack, a.text);
      break;
    case 'spike':
      spike(s, a.mult, a.minutes, a.text);
      break;
    case 'corrupt':
      corruptNode(s, a.text);
      break;
    case 'drought':
      startDrought(s, a.days, a.text);
      break;
    case 'oobCut':
      cutOob(s, a.text);
      break;
    case 'surge':
      surge(s, a.mult, a.hours, a.text);
      break;
    case 'freeze':
      s.freeze = a.on;
      if (a.text) addLog(s, 'story', a.text);
      break;
    case 'delayInfra':
      delayInfra(s, a.days, a.text);
      break;
    case 'pduFail': {
      const r = s.racks[a.rack];
      if (a.text) addLog(s, 'story', a.text);
      if (r) failPdu(s, r, a.feed);
      break;
    }
    case 'outage':
      startOutage(s, a.minutes, a.text);
      break;
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
