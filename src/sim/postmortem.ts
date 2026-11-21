import { contractLabel } from './naming';
import { countdown } from './postmortem-format';
import { addLog, newId } from './state';
import type { AlarmKind, Contract, GameState, PartId, ProjectId } from './types';

/** PRD §21.8: after a real outage, explain what happened, why, and offer a one-tap fix. */
export const POSTMORTEM_MIN_OUTAGE = 10;

export type RemedyCommand =
  | { type: 'order'; part: PartId; qty: number }
  | { type: 'buyUplink' }
  | { type: 'startProject'; project: ProjectId };

export type PostMortemKind = AlarmKind | 'capacity';

export interface PostMortem {
  id: string;
  customer: string;
  from: number;
  to: number;
  minutes: number;
  kind: PostMortemKind;
  cause: string;
  prevent: string;
  remedy: { label: string; cmd: RemedyCommand } | null;
}

const LESSONS: Partial<Record<PostMortemKind, { cause: string; prevent: string; remedy?: { label: string; cmd: RemedyCommand } }>> = {
  disk: { cause: 'A disk failed and the server limped on in degraded mode.', prevent: 'Keep spare disks and swap degraded disks before the second one fails.', remedy: { label: 'Order 2 spare disks', cmd: { type: 'order', part: 'disk', qty: 2 } } },
  dataloss: { cause: 'A degraded disk was not swapped in time and a second disk died: data loss.', prevent: 'Swap degraded disks within the warning window, and always keep spares.', remedy: { label: 'Order 2 spare disks', cmd: { type: 'order', part: 'disk', qty: 2 } } },
  psu: { cause: 'A power supply died and took its server down.', prevent: 'Keep a spare PSU on the shelf, and give every customer one server more than they need (N+1).', remedy: { label: 'Order 2 spare PSUs', cmd: { type: 'order', part: 'psu', qty: 2 } } },
  hung: { cause: 'A server hung and stopped answering.', prevent: 'Reboot hung servers quickly. The firmware campaign makes hangs much rarer.', remedy: { label: 'Start the firmware campaign', cmd: { type: 'startProject', project: 'firmware' } } },
  breaker: { cause: 'The rack drew more power than its budget and the breaker tripped, taking every server down.', prevent: 'Spread servers across racks and keep each rack under 90% of its budget (power overlay).' },
  overheat: { cause: 'The rack overheated and its servers shut down to protect themselves.', prevent: 'Add cooling near hot racks, fix the aisles, and power off idle servers.', remedy: { label: 'Order a portable AC', cmd: { type: 'order', part: 'portableAc', qty: 1 } } },
  switch: { cause: 'A top-of-rack switch failed and cut the whole rack off the network.', prevent: 'Keep a spare switch and a network engineer on the team.', remedy: { label: 'Order a spare switch', cmd: { type: 'order', part: 'switch', qty: 1 } } },
  uplink: { cause: 'The fiber uplink was cut and traffic had nowhere to go.', prevent: 'A second uplink on a separate route keeps you online when one is cut.', remedy: { label: 'Order a second uplink', cmd: { type: 'buyUplink' } } },
  bandwidth: { cause: 'Customers needed more bandwidth than your uplinks carry.', prevent: 'Add uplink capacity before signing traffic-heavy customers.', remedy: { label: 'Order a second uplink', cmd: { type: 'buyUplink' } } },
  coolerDown: { cause: 'A cooler broke down and the floor heated up.', prevent: 'Change filters before they clog: a dirty cooler can break.', remedy: { label: 'Order 2 filters', cmd: { type: 'order', part: 'filter', qty: 2 } } },
  filter: { cause: 'A clogged filter cut cooling capacity.', prevent: 'Have an HVAC tech change filters when they turn amber.', remedy: { label: 'Order 2 filters', cmd: { type: 'order', part: 'filter', qty: 2 } } },
  malware: { cause: 'Malware got in and the infected servers were quarantined.', prevent: 'Spot phishing emails, cut the spread fast, and re-image infected racks quickly.' },
  capacity: { cause: 'Demand was higher than the servers assigned to this customer could handle.', prevent: 'Assign one spare server per customer (N+1) and watch the demand marker on the contract card.' },
};

/** Lower is more likely the root cause. */
const PRIORITY: PostMortemKind[] = ['malware', 'uplink', 'bandwidth', 'breaker', 'switch', 'coolerDown', 'overheat', 'dataloss', 'psu', 'hung', 'filter', 'disk'];

const GLOBAL: ReadonlySet<AlarmKind> = new Set(['uplink', 'bandwidth', 'coolerDown', 'filter']);

export function recordAlarmHistory(s: GameState, kind: AlarmKind, rackId: string | null, deviceId: string | null): void {
  s.alarmHistory ??= [];
  s.alarmHistory.push({ kind, rackId, deviceId, minute: s.minute });
  if (s.alarmHistory.length > 60) s.alarmHistory.splice(0, s.alarmHistory.length - 60);
}

function inferKind(s: GameState, c: Contract, from: number): PostMortemKind {
  const racks = new Set(s.devices.filter((d) => d.contractId === c.id).map((d) => d.rackId));
  const devices = new Set(s.devices.filter((d) => d.contractId === c.id).map((d) => d.id));
  const relevant = (s.alarmHistory ?? []).filter((a) => a.minute >= from - 60 && (
    (GLOBAL.has(a.kind) && (a.kind !== 'bandwidth' || c.bandwidthPerUnit > 0)) ||
    (a.deviceId !== null && devices.has(a.deviceId)) || (a.rackId !== null && racks.has(a.rackId))));
  for (const k of PRIORITY) if (relevant.some((a) => a.kind === k)) return k;
  return 'capacity';
}

/** Called once per game minute per active contract with whether its SLA was met that minute. */
export function trackOutage(s: GameState, c: Contract, ok: boolean): void {
  s.outages ??= {};
  const open = s.outages[c.id];
  if (!ok) {
    if (open === undefined) s.outages[c.id] = s.minute;
    return;
  }
  if (open === undefined) return;
  delete s.outages[c.id];
  const minutes = s.minute - open;
  if (minutes < POSTMORTEM_MIN_OUTAGE) return;
  const kind = inferKind(s, c, open);
  const lesson = LESSONS[kind] ?? LESSONS.capacity!;
  const pm: PostMortem = {
    id: newId(s, 'pm'), customer: contractLabel(c), from: open, to: s.minute, minutes, kind,
    cause: lesson.cause, prevent: lesson.prevent, remedy: lesson.remedy ?? null,
  };
  s.postMortems ??= [];
  s.postMortems.push(pm);
  if (s.postMortems.length > 10) s.postMortems.splice(0, s.postMortems.length - 10);
  s.pendingPostMortem = pm;
  addLog(s, 'info', `📋 Post-mortem: ${contractLabel(c)} was down for ${countdown(minutes)}. ${lesson.cause}`);
}
