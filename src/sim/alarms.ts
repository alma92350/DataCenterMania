import { COOLERS, ESCALATION_MIN } from '../data/catalog';
import { DIFFICULTIES } from '../data/difficulty';
import { addLog, newId, showTip } from './state';
import { recordAlarmHistory } from './postmortem';
import { deviceById, rackById } from './selectors';
import type { Alarm, AlarmKind, GameState, Severity } from './types';
import { SEVERITY_LABEL } from './types';

export const ALARM_TEXT: Record<AlarmKind, string> = {
  disk: 'Disk failed (RAID degraded)',
  dataloss: 'Data loss: second disk failed',
  psu: 'Power supply failed (server down)',
  hung: 'Server not responding',
  overheat: 'Rack overheating',
  breaker: 'Breaker tripped (rack down)',
  powerHigh: 'Rack power above 90% of budget',
  filter: 'Cooler filter clogged',
  coolerDown: 'Cooler broken down',
  switch: 'Top-of-rack switch failed (rack offline)',
  uplink: 'Fiber uplink cut',
  bandwidth: 'Uplink bandwidth exhausted',
  malware: 'Malware outbreak (servers quarantined)',
  gridDown: 'Utility power is out',
  generator: 'Generator failed to start',
  battery: 'UPS batteries are worn out',
  ats: 'Transfer switch stuck: the generator is not carrying the load',
  fuel: 'Generator fuel is running low',
  feed: 'Power feed lost on a rack',
  siteCap: 'Main breaker tripped: the grid connection is overloaded',
  siteCapHigh: 'Facility power above 90% of the grid connection',
  oob: 'Out-of-band management link is down',
  pump: 'Coolant pump failed: the liquid loop lost capacity',
  leak: 'Coolant leak: a liquid rack is isolated',
  corrupt: 'Silent data corruption on a GPU server',
};

export interface AlarmTarget {
  coolerId?: string;
  uplinkId?: string;
}

export function escalationDelay(s: GameState, severity: Severity): number | null {
  const mult = DIFFICULTIES[s.difficulty].escalation;
  if (severity === 1) return ESCALATION_MIN.warningToMajor * mult;
  if (severity === 2) return ESCALATION_MIN.majorToCritical * mult;
  return null;
}

export function alarmLabel(s: GameState, a: Alarm): string {
  if (a.coolerId) {
    const c = s.coolers.find((x) => x.id === a.coolerId);
    return `${ALARM_TEXT[a.kind]} · ${c ? COOLERS[c.kind].name : 'Cooler'}`;
  }
  if (a.uplinkId) return `${ALARM_TEXT[a.kind]} · ${s.uplinks.find((u) => u.id === a.uplinkId)?.name ?? 'Uplink'}`;
  if (a.rackId === null) return ALARM_TEXT[a.kind];
  const rack = rackById(s, a.rackId);
  const rackName = rack ? `Rack ${s.racks.indexOf(rack) + 1}` : 'Rack ?';
  const dev = deviceById(s, a.deviceId);
  return `${ALARM_TEXT[a.kind]} · ${rackName}${dev ? ` U${dev.slot + 1}` : ''}`;
}

function flag(s: GameState, a: Alarm): void {
  if (a.severity >= 2 && (!s.attention || s.attention.severity < a.severity)) {
    s.attention = { severity: a.severity, text: alarmLabel(s, a) };
  }
  if (a.severity === 3) s.stats.criticals++;
}

/** Raises an alarm, or updates the severity of the matching open one. */
export function raiseAlarm(
  s: GameState, kind: AlarmKind, rackId: string | null, deviceId: string | null, severity: Severity, escalateAfter: number | null,
  target: AlarmTarget = {},
): Alarm {
  const coolerId = target.coolerId ?? null;
  const uplinkId = target.uplinkId ?? null;
  const existing = s.alarms.find(
    (a) => a.kind === kind && a.rackId === rackId && a.deviceId === deviceId && (a.coolerId ?? null) === coolerId && (a.uplinkId ?? null) === uplinkId,
  );
  if (existing) {
    if (severity > existing.severity) {
      existing.severity = severity;
      flag(s, existing);
    }
    return existing;
  }
  const alarm: Alarm = {
    id: newId(s, 'a'), kind, severity, rackId, deviceId, coolerId, uplinkId, raisedAt: s.minute,
    escalateAt: escalateAfter === null ? null : s.minute + escalateAfter, acknowledged: false,
  };
  s.alarms.push(alarm);
  recordAlarmHistory(s, kind, rackId, deviceId);
  if (kind !== 'powerHigh' && kind !== 'bandwidth') s.stats.incidents++;
  addLog(s, 'alarm', `${SEVERITY_LABEL[severity]}: ${alarmLabel(s, alarm)}`);
  flag(s, alarm);
  showTip(s, 'firstAlarm');
  return alarm;
}

export function clearAlarms(s: GameState, pred: (a: Alarm) => boolean): void {
  s.alarms = s.alarms.filter((a) => !pred(a));
}

/** Time-based escalation of un-fixed incidents. */
export function escalateAlarms(s: GameState): void {
  for (const a of [...s.alarms]) {
    if (a.escalateAt === null || s.minute < a.escalateAt) continue;
    if (a.kind === 'disk') {
      const d = deviceById(s, a.deviceId);
      clearAlarms(s, (x) => x.id === a.id);
      if (d) {
        d.faults = d.faults.map((f) => (f === 'disk' ? 'dataloss' : f));
        raiseAlarm(s, 'dataloss', a.rackId, d.id, 3, null);
        showTip(s, 'dataloss');
        s.reputation = Math.max(0, s.reputation - 0.3);
      }
      continue;
    }
    if (a.severity < 3) {
      a.severity = (a.severity + 1) as Severity;
      a.escalateAt = (() => {
        const next = escalationDelay(s, a.severity);
        return next === null ? null : s.minute + next;
      })();
      addLog(s, 'alarm', `Escalated to ${SEVERITY_LABEL[a.severity]}: ${alarmLabel(s, a)}`);
      flag(s, a);
      if (a.severity === 3) s.reputation = Math.max(0, s.reputation - 0.1);
    } else {
      a.escalateAt = null;
    }
  }
}
