import { CONTRACT_GRACE_MIN, JOB_LABEL, PARTS, SERVER_MODELS, THERMAL } from '../data/catalog';
import { CHAPTERS, CHAPTER_ORDER } from '../data/chapters';
import { traitOf } from '../data/content';
import { DIFFICULTIES } from '../data/difficulty';
import { MINUTES_PER_DAY, formatClock, dayOf, type Speed } from '../core/time';
import { alarmLabel } from '../sim/alarms';
import { suggestedJob } from '../sim/commands';
import { demandFactor } from '../sim/demand';
import { deliveryTime } from '../sim/economy';
import { objectiveStatus } from '../sim/objectives';
import {
  activeContracts, contractAssignedUnits, contractById, contractCapacity, contractUptimeTodayPct, deviceUp,
  devicesInRack, hasFeature, offeredContracts, overallUptimePct, rackById,
} from '../sim/selectors';
import type { Alarm, Contract, Device, DifficultyId, GameState, LogEntry, PartId, Rack, Tech } from '../sim/types';
import { SEVERITY_LABEL } from '../sim/types';
import { countdown, escapeHtml as e, money, stars } from './format';
import { bestStars, isUnlocked, type Progress, type Settings } from './storage';

export type PanelId = 'alarms' | 'team' | 'contracts' | 'shop' | 'goals';

export const PANEL_META: Record<PanelId, { icon: string; label: string }> = {
  alarms: { icon: '🔔', label: 'Alarms' },
  team: { icon: '👷', label: 'Team' },
  contracts: { icon: '📄', label: 'Clients' },
  shop: { icon: '🛒', label: 'Shop' },
  goals: { icon: '🎯', label: 'Goals' },
};

export function visiblePanels(s: GameState): PanelId[] {
  const out: PanelId[] = ['alarms', 'team', 'contracts'];
  if (hasFeature(s, 'shop')) out.push('shop');
  out.push('goals');
  return out;
}

const rackName = (s: GameState, r: Rack | undefined) => (r ? `Rack ${s.racks.indexOf(r) + 1}` : 'Rack ?');

const sevBadge = (sev: Alarm['severity']) =>
  `<span class="sev sev-${sev}" role="img" aria-label="${SEVERITY_LABEL[sev]}"></span>`;

export function topBar(s: GameState, speed: Speed, effective: Speed): string {
  const ch = CHAPTERS[s.chapter];
  const left = Math.max(0, ch.endMinute - s.minute);
  const speeds: Speed[] = [0, 1, 2, 4];
  const alarms = s.alarms.filter((a) => a.kind !== 'powerHigh');
  const worst = alarms.reduce((m, a) => Math.max(m, a.severity), 0);
  return `
    <div class="stat" title="Cash"><span class="k">Cash</span><b class="${s.cash < 0 ? 'neg' : ''}">${money(s.cash)}</b></div>
    <div class="stat" title="Reputation"><span class="k">Rep</span><b class="stars">${stars(s.reputation)}</b></div>
    <div class="stat" title="SLA uptime since start"><span class="k">Uptime</span><b>${overallUptimePct(s).toFixed(2)}%</b></div>
    <div class="stat clock" title="Time left: ${countdown(left)}"><span class="k">Ch${ch.number} · ${countdown(left)} left</span><b>${formatClock(s.minute)}</b></div>
    <div class="speed" role="group" aria-label="Game speed">
      ${speeds.map((sp) => `<button data-action="speed" data-speed="${sp}" class="${sp === speed ? 'on' : ''}" aria-pressed="${sp === speed}" title="${sp === 0 ? 'Pause (Space)' : `${sp}× speed`}">${sp === 0 ? '⏸' : `${sp}×`}</button>`).join('')}
      ${effective !== speed ? '<span class="night" title="Night skip">🌙4×</span>' : ''}
    </div>
    <button class="alarm-pill ${worst ? `sev-bg-${worst}` : ''}" data-action="panel" data-panel="alarms" aria-label="${alarms.length} alarms">🔔 ${alarms.length}</button>
    <button class="menu-btn" data-action="menu" aria-label="Menu">☰</button>`;
}

export function tabs(s: GameState, active: PanelId): string {
  return visiblePanels(s)
    .map((p) => {
      const badge = p === 'alarms' ? s.alarms.filter((a) => a.kind !== 'powerHigh').length : p === 'contracts' ? offeredContracts(s).length : 0;
      return `<button data-action="panel" data-panel="${p}" class="${p === active ? 'on' : ''}" aria-pressed="${p === active}">
        <span class="ti">${PANEL_META[p].icon}</span><span class="tl">${PANEL_META[p].label}</span>${badge ? `<span class="badge">${badge}</span>` : ''}</button>`;
    })
    .join('');
}

function techOptions(s: GameState): string {
  return `<option value="best">Best tech</option>${s.techs.map((t) => `<option value="${e(t.id)}">${e(t.name)}</option>`).join('')}`;
}

function jobFor(s: GameState, a: Alarm) {
  return s.jobs.find((j) => (a.deviceId ? j.deviceId === a.deviceId : j.rackId === a.rackId && j.deviceId === null) && j.kind === suggestedJob(a.kind));
}

export function alarmsPanel(s: GameState): string {
  const list = [...s.alarms].sort((a, b) => b.severity - a.severity || a.raisedAt - b.raisedAt);
  if (!list.length) return `<div class="empty">✅ All quiet. Enjoy your coffee.</div>`;
  return `<ul class="list alarms">${list
    .map((a) => {
      const job = jobFor(s, a);
      const fix = suggestedJob(a.kind);
      const tech = job ? s.techs.find((t) => t.id === job.techId) : undefined;
      const eta = a.escalateAt !== null ? `<span class="eta" title="Escalates in">⏱ ${countdown(a.escalateAt - s.minute)}</span>` : '';
      let action: string;
      if (job) action = `<span class="busy">🔧 ${e(tech?.name ?? 'Queued')}${job.stage === 'queued' ? ' (queued)' : ''}</span>`;
      else if (fix) {
        action = `<select class="tech-pick" aria-label="Technician">${techOptions(s)}</select>
          <button class="primary" data-action="fix" data-alarm="${e(a.id)}">${e(JOB_LABEL[fix])}</button>`;
      } else action = `<span class="hint">${a.kind === 'overheat' ? 'Cool it down, cut load or turn servers off' : 'Move or power off servers'}</span>`;
      return `<li class="alarm sevrow-${a.severity}">
        <div class="row">${sevBadge(a.severity)}<b>${e(alarmLabel(s, a))}</b></div>
        <div class="row meta"><span>${formatClock(a.raisedAt)}</span>${eta}
          <button class="ghost" data-action="openRack" data-rack="${e(a.rackId)}">📍 Rack</button></div>
        <div class="row actions">${action}</div></li>`;
    })
    .join('')}</ul>`;
}

export function techStatus(s: GameState, t: Tech): string {
  const job = s.jobs.find((j) => j.id === t.jobId);
  if (!job) return t.path.length ? 'Walking back to the staff room' : 'Idle ☕';
  const where = job.rackId ? ` · ${rackName(s, rackById(s, job.rackId))}` : '';
  switch (job.stage) {
    case 'toStorage':
      return `Fetching ${PARTS[job.part!].name.toLowerCase()} from storage${where}`;
    case 'toSite':
      return `Walking to the job: ${JOB_LABEL[job.kind]}${where}`;
    case 'working': {
      const pct = Math.round(100 * (1 - job.workLeft / Math.max(1, job.workTotal)));
      return `${JOB_LABEL[job.kind]}${where} · ${Math.max(0, Math.min(99, pct))}%`;
    }
    default:
      return JOB_LABEL[job.kind];
  }
}

export function teamPanel(s: GameState): string {
  const staff = s.techs
    .map((t) => {
      const trait = traitOf(t.trait);
      const queued = s.jobs.filter((j) => j.techId === t.id && j.stage === 'queued');
      return `<li class="tech">
        <div class="row"><span class="dot" data-tech-color="${e(t.id)}"></span><b>${e(t.name)}</b>
          <span class="muted">${t.role === 'manager' ? 'Manager' : 'HW tech'} · ${'★'.repeat(t.skill)}</span></div>
        <div class="row meta">${e(techStatus(s, t))}${queued.length ? ` · +${queued.length} queued` : ''}</div>
        ${trait ? `<div class="row meta">🏷️ ${e(trait.name)}: ${e(trait.description)}</div>` : ''}
        ${t.role !== 'manager' ? `<div class="row actions"><span class="muted">${money(t.salaryPerDay)}/day</span>
          <button class="ghost danger" data-action="fire" data-tech="${e(t.id)}">Let go</button></div>` : ''}
      </li>`;
    })
    .join('');
  let hire = '';
  if (hasFeature(s, 'hire')) {
    hire = `<h3>Candidates</h3><ul class="list">${s.candidates
      .map((c) => {
        const trait = traitOf(c.trait);
        return `<li><div class="row"><b>${e(c.name)}</b><span class="muted">${'★'.repeat(c.skill)}${'☆'.repeat(5 - c.skill)} · walks ${c.speed.toFixed(1)} tiles/min</span></div>
          ${trait ? `<div class="row meta">🏷️ ${e(trait.name)}: ${e(trait.description)}</div>` : ''}
          <div class="row actions"><span class="muted">${money(c.salaryPerDay)}/day</span>
          <button class="primary" data-action="hire" data-candidate="${e(c.id)}">Hire</button></div></li>`;
      })
      .join('')}</ul><p class="muted small">New candidates every morning. Salaries are paid at midnight.</p>`;
  } else {
    hire = `<p class="muted small">🔒 Hiring unlocks in Chapter 1. For now, it is just you.</p>`;
  }
  return `<ul class="list">${staff}</ul>${hire}`;
}

function contractRow(s: GameState, c: Contract): string {
  const assigned = contractAssignedUnits(s, c.id);
  const live = contractCapacity(s, c.id);
  const need = c.units * demandFactor(c.profile, s.minute);
  const today = contractUptimeTodayPct(c);
  const daysLeft = c.expiresDay - dayOf(s.minute);
  const onboarding = c.liveFrom === null;
  const status = onboarding
    ? `<span class="chip warn">Setting up · ${countdown((c.graceUntil ?? s.minute) - s.minute)} left</span>`
    : `<span class="chip ${today >= c.slaPct ? 'ok' : 'bad'}">Today ${today.toFixed(1)}% / ${c.slaPct}%</span>`;
  const bar = Math.min(100, (live / Math.max(1, c.units)) * 100);
  const needPct = Math.min(100, (need / Math.max(1, c.units)) * 100);
  return `<li class="contract">
    <div class="row"><b>${e(c.customer)}</b><span class="muted">${money(c.revenuePerDay)}/day · ${daysLeft}d left</span></div>
    <div class="row meta">${e(c.description)}</div>
    <div class="cap" title="Live capacity vs demand"><div class="cap-live" style="width:${bar}%"></div><div class="cap-need" style="left:${needPct}%"></div></div>
    <div class="row meta"><span>Servers: ${live}/${assigned} live units, needs ${c.units} (demand now ${need.toFixed(1)})</span></div>
    <div class="row actions">${status}${c.breaches ? `<span class="chip bad">${c.breaches} breach${c.breaches > 1 ? 'es' : ''}</span>` : ''}
      ${assigned < c.units ? `<button class="primary" data-action="autoAssign" data-contract="${e(c.id)}">Assign free servers</button>` : ''}</div>
  </li>`;
}

export function contractsPanel(s: GameState): string {
  const active = activeContracts(s);
  const offers = offeredContracts(s);
  const free = s.devices.filter((d) => d.contractId === null);
  return `
    <h3>Active (${active.length})</h3>
    ${active.length ? `<ul class="list">${active.map((c) => contractRow(s, c)).join('')}</ul>` : '<div class="empty">No customers yet.</div>'}
    <p class="muted small">${free.length} unassigned server${free.length === 1 ? '' : 's'}. New contracts have ${countdown(CONTRACT_GRACE_MIN)} of setup time before the SLA starts counting. Going live fully provisioned pays a setup fee.</p>
    <h3>Offers (${offers.length})</h3>
    ${offers.length
      ? `<ul class="list">${offers
          .map((c) => `<li class="contract offer">
            <div class="row"><b>${e(c.customer)}</b><span class="muted">${money(c.revenuePerDay)}/day</span></div>
            <div class="row meta">${e(c.description)}</div>
            <div class="row meta">Needs ${c.units} units · SLA ${c.slaPct}% · ${c.durationDays} days · penalty ${money(c.penaltyPerBreach)}/breach · demand: ${e(c.profile)}</div>
            <div class="row actions"><span class="muted">Offer expires in ${Math.max(0, c.expiresDay - dayOf(s.minute))}d</span>
              <button class="ghost" data-action="decline" data-contract="${e(c.id)}">Decline</button>
              <button class="primary" data-action="accept" data-contract="${e(c.id)}">Sign</button></div></li>`)
          .join('')}</ul>`
      : '<div class="empty">No offers right now.</div>'}`;
}

const SHOP_ORDER: PartId[] = ['disk', 'psu', 'server1u', 'server2u', 'portableAc', 'rack', 'wallAc'];

export function shopPanel(s: GameState): string {
  const available = SHOP_ORDER.filter((p) => (p !== 'rack' || hasFeature(s, 'buildRack')) && (p !== 'wallAc' || hasFeature(s, 'coolers')));
  const rows = available
    .map((p) => {
      const info = PARTS[p];
      const extra = p === 'server1u' || p === 'server2u'
        ? `${SERVER_MODELS[p].units} unit${SERVER_MODELS[p].units > 1 ? 's' : ''}, ${SERVER_MODELS[p].u}U, ${SERVER_MODELS[p].idleW}-${SERVER_MODELS[p].maxW} W`
        : '';
      const dt = deliveryTime(s, p);
      const placeable = p === 'rack' || p === 'portableAc' || p === 'wallAc';
      return `<li><div class="row"><span class="pi">${info.icon}</span><b>${e(info.name)}</b><span class="muted">${money(info.price)}</span></div>
        <div class="row meta">In stock: <b>${s.inventory[p]}</b> · delivery ${dt === 0 ? 'instant' : countdown(dt)}${extra ? ` · ${extra}` : ''}</div>
        <div class="row actions">
          ${placeable && s.inventory[p] > 0 ? `<button class="primary" data-action="build" data-part="${p}">Place on floor</button>` : ''}
          <button data-action="order" data-part="${p}" data-qty="1" ${s.cash < info.price ? 'disabled' : ''}>Buy 1</button>
          ${p === 'disk' || p === 'psu' ? `<button data-action="order" data-part="${p}" data-qty="3" ${s.cash < info.price * 3 ? 'disabled' : ''}>Buy 3</button>` : ''}
        </div></li>`;
    })
    .join('');
  const orders = s.orders.length
    ? `<h3>On the way</h3><ul class="list">${s.orders.map((o) => `<li class="row"><span>${PARTS[o.part].icon} ${o.qty} × ${e(PARTS[o.part].name)}</span><span class="muted">arrives ${formatClock(o.arriveAt)}</span></li>`).join('')}</ul>`
    : '';
  return `<ul class="list shop">${rows}</ul>${orders}`;
}

function logLine(l: LogEntry): string {
  const icon = { info: 'ℹ️', alarm: '🚨', money: '💰', tip: '🧓', story: '📣', success: '✅', fail: '❌' }[l.kind];
  return `<li class="log log-${l.kind}"><span class="t">${formatClock(l.minute)}</span> ${icon} ${e(l.text)}</li>`;
}

export function goalsPanel(s: GameState): string {
  const ch = CHAPTERS[s.chapter];
  const status = objectiveStatus(s);
  const last = s.reports[s.reports.length - 1];
  return `
    <h3>Chapter ${ch.number}: ${e(ch.title)}</h3>
    <p class="muted">${e(ch.intro)}</p>
    <ul class="list goals">${ch.objectives
      .map((o, i) => `<li class="row"><span class="star">${'★'.repeat(i + 1)}</span><span>${e(o.label)}</span><span class="${status[i] ? 'ok' : 'muted'}">${status[i] ? '✓ on track' : '…'}</span></li>`)
      .join('')}</ul>
    <p class="muted small">Ends ${formatClock(ch.endMinute)} · goals are checked at the end · ${DIFFICULTIES[s.difficulty].emoji} ${e(DIFFICULTIES[s.difficulty].name)}</p>
    ${last ? `<h3>Last day</h3><div class="report">
      <span>Revenue</span><b>${money(last.revenue)}</b><span>Penalties</span><b>${money(-last.penalties)}</b>
      <span>Salaries</span><b>${money(-last.salaries)}</b><span>Electricity</span><b>${money(-last.electricity)}</b>
      <span>Rent</span><b>${money(-last.rent)}</b><span>Net</span><b class="${last.net < 0 ? 'neg' : 'pos'}">${money(last.net)}</b></div>` : ''}
    <h3>Log</h3><ul class="list logs">${[...s.log].reverse().slice(0, 40).map(logLine).join('')}</ul>`;
}

/** Contiguous slot ranges: devices and empty gaps, top of the rack first. */
export function rackLayout(s: GameState, rack: Rack): ({ kind: 'device'; device: Device } | { kind: 'empty'; from: number; to: number })[] {
  const devices = devicesInRack(s, rack.id).sort((a, b) => a.slot - b.slot);
  const pending = s.jobs.filter((j) => j.kind === 'install' && j.rackId === rack.id);
  const out: ({ kind: 'device'; device: Device } | { kind: 'empty'; from: number; to: number })[] = [];
  let slot = 0;
  const occupiedAt = (u: number) => pending.some((j) => j.slot !== undefined && u >= j.slot && u < j.slot + SERVER_MODELS[j.model ?? 'server1u'].u);
  for (const d of devices) {
    if (d.slot > slot) pushEmpty(slot, d.slot - 1);
    out.push({ kind: 'device', device: d });
    slot = d.slot + SERVER_MODELS[d.model].u;
  }
  if (slot < rack.capacityU) pushEmpty(slot, rack.capacityU - 1);
  return out.reverse();

  function pushEmpty(from: number, to: number) {
    let start = from;
    for (let u = from; u <= to + 1; u++) {
      if (u > to || occupiedAt(u)) {
        if (u > start) out.push({ kind: 'empty', from: start, to: u - 1 });
        start = u + 1;
      }
    }
  }
}

function deviceRow(s: GameState, d: Device): string {
  const m = SERVER_MODELS[d.model];
  const up = deviceUp(s, d);
  const job = s.jobs.find((j) => j.deviceId === d.id);
  const status = !d.poweredOn ? 'Off' : d.thermalShutdown ? 'Thermal shutdown' : !up ? 'Down' : d.faults.length ? 'Degraded' : 'OK';
  const cls = !d.poweredOn ? 'off' : !up ? 'bad' : d.faults.length ? 'warn' : 'ok';
  const contract = contractById(s, d.contractId);
  const fixes = d.faults
    .map((f) => suggestedJob(f))
    .filter((j, i, arr): j is NonNullable<typeof j> => !!j && arr.indexOf(j) === i)
    .map((j) => `<button class="primary" data-action="dispatchDevice" data-job="${j}" data-device="${e(d.id)}">${e(JOB_LABEL[j])}</button>`)
    .join('');
  const contractOptions = `<option value="">— unassigned —</option>${activeContracts(s)
    .map((c) => `<option value="${e(c.id)}" ${c.id === d.contractId ? 'selected' : ''}>${e(c.customer)}</option>`)
    .join('')}`;
  return `<li class="slot dev ${cls}" style="--u:${m.u}">
    <div class="row"><span class="u">U${d.slot + 1}${m.u > 1 ? `-${d.slot + m.u}` : ''}</span><b>${e(m.name)}</b><span class="chip ${cls}">${status}</span></div>
    <div class="row meta">${d.faults.map((f) => `⚠ ${e(f)}`).join(' ')} ${up ? `Load ${(d.load * 100).toFixed(0)}%` : ''} ${contract ? `· for ${e(contract.customer)}` : ''}</div>
    <div class="row actions">
      ${job ? `<span class="busy">🔧 ${e(JOB_LABEL[job.kind])}…</span>` : fixes}
      <select data-action="assign" data-device="${e(d.id)}" aria-label="Customer">${contractOptions}</select>
      <button data-action="power" data-device="${e(d.id)}" data-on="${d.poweredOn ? '0' : '1'}">${d.poweredOn ? 'Power off' : 'Power on'}</button>
      ${job ? '' : `<button class="ghost danger" data-action="dispatchDevice" data-job="remove" data-device="${e(d.id)}">Remove</button>`}
    </div></li>`;
}

export function rackModal(s: GameState, rackId: string): string {
  const rack = rackById(s, rackId);
  if (!rack) return '';
  const powerPct = (rack.loadW / rack.powerBudgetW) * 100;
  const layout = rackLayout(s, rack);
  const stock = (['server1u', 'server2u'] as const).filter((m) => s.inventory[m] > 0);
  const contractOptions = `<option value="">— unassigned —</option>${activeContracts(s).map((c) => `<option value="${e(c.id)}">${e(c.customer)}</option>`).join('')}`;
  const tempCls = rack.temp >= THERMAL.major ? 'bad' : rack.temp >= THERMAL.warn ? 'warn' : 'ok';
  const breakerJob = s.jobs.find((j) => j.kind === 'resetBreaker' && j.rackId === rack.id);
  return `<div class="modal-card" role="dialog" aria-modal="true" aria-label="${e(rackName(s, rack))}">
    <header><h2>🗄️ ${e(rackName(s, rack))}</h2><button class="ghost" data-action="closeModal" aria-label="Close">✕</button></header>
    <div class="rack-stats">
      <div><span class="k">Temperature</span><b class="${tempCls}">${rack.temp.toFixed(1)}°C</b></div>
      <div><span class="k">Power</span><b class="${powerPct > 90 ? 'bad' : powerPct > 70 ? 'warn' : ''}">${Math.round(rack.loadW)} / ${rack.powerBudgetW} W</b>
        <div class="bar"><div style="width:${Math.min(100, powerPct)}%" class="${powerPct > 90 ? 'bad' : ''}"></div></div></div>
    </div>
    ${rack.tripped ? `<div class="banner bad">⚡ Breaker tripped. The whole rack is down. ${breakerJob ? '🔧 Someone is on the way.' : `<button class="primary" data-action="dispatchRack" data-job="resetBreaker" data-rack="${e(rack.id)}">Reset breaker</button>`}
      <div class="small">Tip: if the rack still draws more than its budget, it will trip again. Remove or power off servers first.</div></div>` : ''}
    <ul class="slots">${layout
      .map((item) => {
        if (item.kind === 'device') return deviceRow(s, item.device);
        const size = item.to - item.from + 1;
        return `<li class="slot empty"><div class="row"><span class="u">U${item.from + 1}${size > 1 ? `-${item.to + 1}` : ''}</span><span class="muted">${size} free U</span>
          ${stock.length ? `<button data-action="installForm" data-rack="${e(rack.id)}" data-slot="${item.from}">+ Install</button>` : '<span class="muted small">No servers in stock</span>'}</div></li>`;
      })
      .join('')}</ul>
    <template id="install-form">
      <div class="install-form">
        <label>Server <select id="install-model">${stock.map((m) => `<option value="${m}">${e(SERVER_MODELS[m].name)} (${s.inventory[m]} in stock)</option>`).join('')}</select></label>
        <label>Customer <select id="install-contract">${contractOptions}</select></label>
        <label>Technician <select id="install-tech">${techOptions(s)}</select></label>
        <button class="primary" data-action="install">Install</button>
      </div>
    </template>
  </div>`;
}

export function coolerModal(s: GameState, coolerId: string): string {
  const c = s.coolers.find((x) => x.id === coolerId);
  if (!c) return '';
  const names = { officeAc: 'Office AC', portableAc: 'Portable AC', wallAc: 'Wall AC' };
  return `<div class="modal-card small-card" role="dialog" aria-modal="true">
    <header><h2>❄️ ${names[c.kind]}</h2><button class="ghost" data-action="closeModal" aria-label="Close">✕</button></header>
    <p>Capacity <b>${c.capacityKw} kW</b> of heat · draws ${c.powerW} W · ${c.on ? 'running' : 'off'}</p>
    ${c.kind === 'officeAc' ? '<p class="muted small">Facilities control this unit.</p>' : `<button class="primary" data-action="cooler" data-cooler="${e(c.id)}" data-on="${c.on ? '0' : '1'}">${c.on ? 'Switch off' : 'Switch on'}</button>`}
  </div>`;
}

export function startScreen(progress: Progress, settings: Settings, hasSave: boolean): string {
  const diffs = Object.values(DIFFICULTIES);
  return `<div class="start">
    <h1>Data<span>Center</span>Mania</h1>
    <p class="tag">Keep the servers humming. Keep the customers happy. Keep your cool.</p>
    ${hasSave ? '<button class="primary big" data-action="continue">▶ Continue</button>' : ''}
    <h3>Difficulty</h3>
    <div class="diffs">${diffs
      .map((d) => `<button class="diff ${settings.difficulty === d.id ? 'on' : ''}" data-action="difficulty" data-difficulty="${d.id}" aria-pressed="${settings.difficulty === d.id}">
        <span class="em">${d.emoji}</span><b>${e(d.name)}</b><span class="small">${e(d.blurb)}</span></button>`)
      .join('')}
      <div class="diff locked" aria-disabled="true"><span class="em">🔥</span><b>On-Call Nightmare</b><span class="small">Coming soon</span></div>
    </div>
    <h3>Chapters</h3>
    <div class="chapters">${CHAPTER_ORDER.map((id) => {
      const ch = CHAPTERS[id];
      const open = isUnlocked(progress, id);
      const best = bestStars(progress, id);
      return `<button class="chapter ${open ? '' : 'locked'}" ${open ? `data-action="newGame" data-chapter="${id}"` : 'disabled'}>
        <span class="num">${ch.number}</span><span class="ct"><b>${e(ch.title)}</b><span class="small">${e(ch.subtitle)}</span></span>
        <span class="best">${open ? `${'★'.repeat(best)}${'☆'.repeat(3 - best)}` : '🔒'}</span></button>`;
    }).join('')}
      <div class="chapter locked"><span class="num">3</span><span class="ct"><b>Colocation Floor</b><span class="small">Hot/cold aisles, networking: coming soon</span></span><span class="best">🔒</span></div>
    </div>
    ${settingsForm(settings)}
    <p class="muted small">Free, no ads, works offline. Saves stay in this browser.</p>
  </div>`;
}

export function settingsForm(settings: Settings): string {
  return `<details class="settings"><summary>⚙️ Settings</summary>
    <label>Auto-pause on <select data-action="setting" data-key="autoPause">
      ${(['critical', 'major', 'off'] as const).map((v) => `<option value="${v}" ${settings.autoPause === v ? 'selected' : ''}>${v === 'off' ? 'never' : `${v} alarms`}</option>`).join('')}
    </select></label>
    <label><input type="checkbox" data-action="setting" data-key="nightSkip" ${settings.nightSkip ? 'checked' : ''}> Night skip (fast nights when quiet)</label>
    <label><input type="checkbox" data-action="setting" data-key="sound" ${settings.sound ? 'checked' : ''}> Sound</label>
  </details>`;
}

export function pauseMenu(s: GameState, settings: Settings): string {
  return `<div class="modal-card small-card" role="dialog" aria-modal="true" aria-label="Menu">
    <header><h2>⏸ Paused</h2><button class="ghost" data-action="closeModal" aria-label="Close">✕</button></header>
    <p class="muted">Chapter ${CHAPTERS[s.chapter].number}: ${e(CHAPTERS[s.chapter].title)} · ${DIFFICULTIES[s.difficulty].emoji} ${e(DIFFICULTIES[s.difficulty].name)}</p>
    <div class="stack">
      <button class="primary" data-action="closeModal">Resume</button>
      <button data-action="restart">Restart chapter</button>
      <button data-action="quit">Save &amp; quit to menu</button>
    </div>
    ${settingsForm(settings)}
    <p class="muted small">Keys: Space pause · 1/2/3 speed · H heat map · P power map · Esc close</p>
  </div>`;
}

export function endScreen(s: GameState): string {
  const ch = CHAPTERS[s.chapter];
  const won = s.progress.status === 'won';
  const status = objectiveStatus(s);
  const next = ch.next ? CHAPTERS[ch.next] : null;
  const profit = s.cash - s.progress.startCash;
  return `<div class="modal-card end ${won ? 'won' : 'lost'}" role="dialog" aria-modal="true">
    <h2>${won ? '🎉 Chapter complete!' : '💥 Chapter failed'}</h2>
    <div class="big-stars">${'★'.repeat(s.progress.stars)}${'☆'.repeat(3 - s.progress.stars)}</div>
    <ul class="list goals">${ch.objectives.map((o, i) => `<li class="row"><span>${status[i] ? '✅' : '❌'}</span><span>${e(o.label)}</span></li>`).join('')}</ul>
    <div class="report">
      <span>Uptime</span><b>${overallUptimePct(s).toFixed(2)}%</b>
      <span>Profit</span><b class="${profit < 0 ? 'neg' : 'pos'}">${money(profit)}</b>
      <span>Incidents fixed</span><b>${s.stats.resolved} / ${s.stats.incidents}</b>
      <span>Critical alarms</span><b>${s.stats.criticals}</b>
      <span>Reputation</span><b>${stars(s.reputation)}</b>
    </div>
    <div class="stack">
      ${won && next ? `<button class="primary big" data-action="newGame" data-chapter="${next.id}">Next: ${e(next.title)} ▶</button>` : ''}
      ${won && !next ? '<p>That is all for now. More chapters (cooling aisles, power rooms, cyber villains) are coming!</p>' : ''}
      <button data-action="newGame" data-chapter="${ch.id}">↻ Retry</button>
      <button class="ghost" data-action="quit">Menu</button>
    </div></div>`;
}

export function tipCard(text: string): string {
  return `<div class="tip-card" role="status"><span class="avatar" aria-hidden="true">🧓</span>
    <div><b>Sam, your mentor</b><p>${e(text)}</p></div><button class="primary" data-action="dismissTip">Got it</button></div>`;
}

export function difficultyName(id: DifficultyId): string {
  return DIFFICULTIES[id].name;
}

export function dayProgress(s: GameState): number {
  return (s.minute % MINUTES_PER_DAY) / MINUTES_PER_DAY;
}
