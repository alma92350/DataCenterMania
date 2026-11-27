import { AI, CAMPUS, CRM, FRONTIER, NIGHTS, BACKUP, CHANGES, CONTRACT_GRACE_MIN, COOLERS, ENERGY, LEAD_TIME, NOC, SITE, EXTRA_UPLINK, JOB_LABEL, LEAD, PARTS, PROJECTS, ROLE_LABEL, SERVER_MODELS, THERMAL } from '../data/catalog';
import { CHAPTERS, CHAPTER_ORDER } from '../data/chapters';
import { traitOf } from '../data/content';
import { DIFFICULTIES } from '../data/difficulty';
import { MINUTES_PER_DAY, formatClock, dayOf, type Speed } from '../core/time';
import { alarmLabel } from '../sim/alarms';
import { contractLabel } from '../sim/naming';
import { avatarSvg, partSvg } from './icons';
import { AUTO } from '../sim/automation';
import { attackCard, cyberChips, eventCard } from './cyberViews';
import { suggestedCoolerJob, suggestedJob } from '../sim/commands';
import { bandwidthCapacity } from '../sim/network';
import { demandFactor } from '../sim/demand';
import { deliveryTime } from '../sim/economy';
import { chapterEnd, objectiveStatus, objectivesFor } from '../sim/objectives';
import {
  activeContracts, contractAssignedUnits, contractById, contractCapacity, contractMarginPerDay, contractUptimeTodayPct, deviceUp,
  devicesInRack, hasFeature, offeredContracts, overallUptimePct, rackById,
} from '../sim/selectors';
import type { Alarm, Contract, Device, DifficultyId, GameState, LogEntry, PartId, ProjectId, Rack, ShiftReport, Tech } from '../sim/types';
import { SEVERITY_LABEL } from '../sim/types';
import { t, tl } from './i18n';
import { HANDBOOK, handbookFor } from '../data/handbook';
import { countdown, escapeHtml as e, money, stars } from './format';
import { bestStars, isDifficultyUnlocked, isSandboxUnlocked, isUnlocked, type Progress, type Settings } from './storage';
import { spofCount } from '../sim/spof';
import { changeRisk, changeTitle, openChanges, tonight } from '../sim/changes';
import { resilience } from '../sim/resilience';
import { APP_VERSION } from './version';
import { RELEASES, releasesSince } from '../data/releases';
import { satisfactionOf } from '../sim/crm';
import { VISIT_OBJECTIVES, visitResult } from '../sim/visit';
import { boardProfit, boardTargets, campusBuildable, goodwillState, liveSites, siteCostPerDay, siteMix, siteRevenuePerDay, SITE_KINDS, SITE_TIERS } from '../sim/campus';
import { isNightHour, rotaPremiumPerDay, scoreIncident } from '../sim/nights';
import { aiContracts, aiEffective, interruptRatePerMin, lossMinutes } from '../sim/ai';
import { loopCapacityKw, loopHeatKw } from '../sim/liquid';
import { capacityReport, fitPreview, formatPower, powerScale } from '../sim/capacity';
import { containmentOf, droughtActive, facilityW, freeShare, outdoorC, pueAverage, pueNow, setpointOf } from '../sim/site';
import { feedOk, onOneLeg } from '../sim/selectors';
import { generatorTested, upsCapacityKwh, upsRuntimeMin } from '../sim/backup';
import { SANDBOX_FLOORS, sandboxDays, sandboxScore, type SandboxConfig, type SandboxFloor } from '../sim/sandbox';
import { ACHIEVEMENTS, careerTitle } from '../sim/achievements';
import { DAILY_MODIFIERS, dailySpec, type DailySpec } from '../sim/daily';

export type PanelId = 'alarms' | 'team' | 'contracts' | 'network' | 'shop' | 'goals';

export const PANEL_META: Record<PanelId, { icon: string; label: string }> = {
  alarms: { icon: '🔔', label: 'Alarms' },
  team: { icon: '👷', label: 'Team' },
  contracts: { icon: '📄', label: 'Clients' },
  shop: { icon: '🛒', label: 'Shop' },
  network: { icon: '🌐', label: 'Network' },
  goals: { icon: '🎯', label: 'Goals' },
};

export function visiblePanels(s: GameState): PanelId[] {
  const out: PanelId[] = ['alarms', 'team', 'contracts'];
  if (hasFeature(s, 'network')) out.push('network');
  if (hasFeature(s, 'shop')) out.push('shop');
  out.push('goals');
  return out;
}

const rackName = (s: GameState, r: Rack | undefined) => (r ? `Rack ${s.racks.indexOf(r) + 1}` : 'Rack ?');

const sevBadge = (sev: Alarm['severity']) =>
  `<span class="sev sev-${sev}" role="img" aria-label="${SEVERITY_LABEL[sev]}"></span>`;

export function topBar(s: GameState, speed: Speed, effective: Speed): string {
  const ch = CHAPTERS[s.chapter];
  const left = Math.max(0, chapterEnd(s) - s.minute);
  const speeds: Speed[] = [0, 1, 2, 4];
  const alarms = s.alarms.filter((a) => a.kind !== 'powerHigh');
  const worst = alarms.reduce((m, a) => Math.max(m, a.severity), 0);
  return `
    <div class="stat" title="${t('Cash')}"><span class="k">${t('Cash')}</span><b class="${s.cash < 0 ? 'neg' : ''}">${money(s.cash)}</b></div>
    <div class="stat" title="${t('Reputation')}"><span class="k">${t('Rep')}</span><b class="stars">${stars(s.reputation)}</b></div>
    <div class="stat" title="${t('SLA uptime since start')}"><span class="k">${t('Uptime')}</span><b>${overallUptimePct(s).toFixed(2)}%</b></div>
    <div class="stat clock" title="Time left: ${countdown(left)}"><span class="k">${ch.event ? 'Event' : `Ch${ch.number}`} · ${countdown(left)} left</span><b>${formatClock(s.minute)}</b></div>
    <div class="speed" role="group" aria-label="Game speed">
      ${speeds.map((sp) => `<button data-action="speed" data-speed="${sp}" class="${sp === speed ? 'on' : ''}" aria-pressed="${sp === speed}" title="${sp === 0 ? 'Pause (Space)' : `${sp}× speed`}">${sp === 0 ? '⏸' : `${sp}×`}</button>`).join('')}
      ${speed > 0 && effective === 0 ? '<span class="night paused" title="Read the tip to continue">⏸ Tip</span>' : effective !== speed ? '<span class="night" title="Night skip">🌙4×</span>' : ''}
    </div>
    <button class="alarm-pill ${worst ? `sev-bg-${worst}` : ''}" data-action="panel" data-panel="alarms" aria-label="${alarms.length} alarms">🔔 ${alarms.length}</button>
    <button class="menu-btn" data-action="menu" aria-label="Menu">☰</button>`;
}

export function tabs(s: GameState, active: PanelId): string {
  return visiblePanels(s)
    .map((p) => {
      const badge = p === 'alarms' ? s.alarms.filter((a) => a.kind !== 'powerHigh').length + s.walkins.filter((w) => w.status === 'open').length + (s.changes ?? []).filter((c) => c.status === 'offered').length + (s.pager && !s.pager.answered ? 1 : 0) : p === 'contracts' ? offeredContracts(s).length : 0;
      const meta = p === 'network' && s.backup ? { icon: '🔌', label: t('Infra') } : PANEL_META[p];
      const alert = p === 'network' && ((s.backup && (!s.backup.grid || s.alarms.some((a) => a.kind === 'generator' || a.kind === 'battery' || a.kind === 'ats' || a.kind === 'fuel'))) || s.alarms.some((a) => a.kind === 'feed' || a.kind === 'siteCap' || a.kind === 'oob'));
      return `<button data-action="panel" data-panel="${p}" class="${p === active ? 'on' : ''}" aria-pressed="${p === active}">
        <span class="ti">${meta.icon}</span><span class="tl">${meta.label}</span>${alert ? '<span class="badge">!</span>' : ''}${badge ? `<span class="badge">${badge}</span>` : ''}</button>`;
    })
    .join('');
}

function techOptions(s: GameState): string {
  return `<option value="best">Best tech</option>${s.techs.map((t) => `<option value="${e(t.id)}">${e(t.name)}</option>`).join('')}`;
}

function jobFor(s: GameState, a: Alarm) {
  if (a.coolerId) return s.jobs.find((j) => j.coolerId === a.coolerId);
  if (a.uplinkId) return s.jobs.find((j) => j.uplinkId === a.uplinkId);
  return s.jobs.find((j) => (a.deviceId ? j.deviceId === a.deviceId : j.rackId === a.rackId && j.deviceId === null) && j.kind === suggestedJob(a.kind));
}

const ALARM_HINT: Partial<Record<Alarm['kind'], string>> = {
  overheat: 'Cool it down, fix the airflow, cut load or turn servers off',
  powerHigh: 'Move or power off servers',
  bandwidth: 'Add a second uplink in the Network tab, or turn away traffic-heavy clients',
};

const riskCls = (pct: number) => (pct >= 25 ? 'bad' : pct >= 12 ? 'warn' : 'ok');

export function changesSection(s: GameState): string {
  if (!hasFeature(s, 'changes')) return '';
  const list = openChanges(s);
  const tAt = tonight(s);
  const cards = list.map((c) => {
    const def = CHANGES[c.kind];
    const now = changeRisk(s, c, s.minute);
    const night = changeRisk(s, c, tAt);
    const shown = c.status === 'offered' ? now : changeRisk(s, c);
    const factors = shown.factors.map((f) => `<span class="chip ${f.mult < 1 ? 'ok' : 'warn'}" title="×${f.mult}">${f.mult < 1 ? '✓' : '⚠'} ${e(t(f.label))}</span>`).join(' ');
    const actions = c.status === 'offered'
      ? `<button class="ghost ${c.rollback ? 'on' : ''}" data-action="changeRollback" data-change="${e(c.id)}" data-on="${c.rollback ? '0' : '1'}" aria-pressed="${c.rollback}">↩️ ${t('Rollback plan')} ${c.rollback ? t('on') : t('off')}</button>
         <button data-action="changeNow" data-change="${e(c.id)}" ${s.freeze ? 'disabled' : ''}>${t('Now')} · ${now.pct}%</button>
         <button class="primary" data-action="changeTonight" data-change="${e(c.id)}">${t('Tonight')} ${formatClock(tAt)} · ${night.pct}%</button>
         <button class="ghost" data-action="changeSkip" data-change="${e(c.id)}">${t('Skip')}</button>`
      : c.status === 'scheduled'
        ? `<span class="muted">🕙 ${t('Scheduled')} ${formatClock(c.scheduledAt ?? 0)}${s.freeze ? ` · ${t('held by the freeze')}` : ''}</span><button class="ghost" data-action="changeSkip" data-change="${e(c.id)}">${t('Skip')}</button>`
        : `<span class="busy">🔧 ${t('In progress')}…</span>`;
    return `<li class="change"><div class="row"><span>${def.icon}</span><b>${e(t(changeTitle(s, c).split(' · ')[0]!))}${c.rackId ? ` · Rack ${s.racks.findIndex((r) => r.id === c.rackId) + 1}` : ''}</b><span class="chip ${riskCls(shown.pct)}">${shown.pct}% ${t('risk')}</span></div>
      <div class="row meta">${e(t(def.benefit))}</div>
      <div class="row meta factors">${factors}</div>
      <div class="row actions">${actions}</div></li>`;
  }).join('');
  return `<h3>📝 ${t('Planned changes')}</h3>
    <div class="row actions"><button class="${s.freeze ? 'primary' : 'ghost'}" data-action="freezeToggle" aria-pressed="${!!s.freeze}">🧊 ${t('Change freeze')} ${s.freeze ? t('on') : t('off')}</button>
      <span class="muted small">${t('Done')} ${s.stats.changeDone ?? 0} · ${t('went wrong')} ${s.stats.changeFailed ?? 0}</span></div>
    ${list.length ? `<ul class="list changes">${cards}</ul>` : `<div class="empty">${t('No change requests right now.')}</div>`}`;
}

export function campusPanel(s: GameState): string {
  const c = s.campus;
  if (!c) return '';
  const gw = Math.round(c.goodwill);
  const state = goodwillState(c);
  const targets = boardTargets(s);
  const day = dayOf(s.minute);
  const built = new Set(c.sites.map((x) => x.kind));
  const kinds = (Object.keys(SITE_KINDS) as (keyof typeof SITE_KINDS)[]).filter((k) => !built.has(k));
  const mw = (n: number) => (n >= 1000 ? `${n / 1000} GW` : `${n} MW`);
  const sites = c.sites.map((x) => {
    const k = SITE_KINDS[x.kind];
    const mix = siteMix(x.kind);
    const alert = c.alerts.find((a) => a.siteId === x.id);
    return `<li><div class="row"><b>🏢 ${e(t(k.name))}</b><span class="chip ${x.status === 'live' ? 'ok' : 'warn'}">${x.status === 'live' ? t('live') : `${t('ready')} ${formatClock(x.readyAt)}`}</span></div>
      <div class="row meta">${e(t(SITE_TIERS[x.tier].name))} · ${mw(x.mw)} · ${k.latencyMs} ms · PUE ${k.pue} · ${Math.round(mix.inference * 100)}% ${t('inference')}</div>
      ${x.status === 'live' ? `<div class="row meta">${t('Utilisation')} ${Math.round(x.util * 100)}% · +${money(siteRevenuePerDay(x))}/${t('day')} · −${money(siteCostPerDay(s, x))}/${t('day')} · ${t('team')} ${x.staff}</div>
      ${alert ? `<div class="banner bad"><span>📟 ${t('Incident')}</span>${alert.helped ? `<span class="busy">🚁 …</span>` : `<button class="primary" data-action="siteHelp" data-alert="${e(alert.id)}" ${s.cash < CAMPUS.helpCost ? 'disabled' : ''}>${t('Send help')} ${money(CAMPUS.helpCost)}</button>`}</div>` : ''}
      <div class="row actions"><button class="primary" data-action="visitSite" data-site="${e(x.id)}">✈️ ${t('Visit: play a shift')}</button>${x.staff < 2 ? `<button data-action="siteStaff" data-site="${e(x.id)}" ${s.cash < CAMPUS.staffUpgrade ? 'disabled' : ''}>${t('Bigger team')} ${money(CAMPUS.staffUpgrade)}</button>` : `<span class="muted small">${t('Fully staffed')}</span>`}</div>` : ''}</li>`;
  }).join('');
  const options = campusBuildable(s) ? kinds.map((k) => {
    const d = SITE_KINDS[k];
    const mix = siteMix(k);
    return `<li><div class="row"><b>${e(t(d.name))}</b><span class="muted">${d.latencyMs} ms · PUE ${d.pue} · ${t('power')} ×${d.power}</span></div>
      <div class="row meta">${e(t(d.blurb))} ${Math.round(mix.inference * 100)}% ${t('inference')}</div>
      <div class="row actions">${(Object.keys(SITE_TIERS) as (keyof typeof SITE_TIERS)[]).map((tier) => `<button data-action="buildSite" data-kind="${k}" data-tier="${tier}" ${s.cash < SITE_TIERS[tier].price || s.campus!.goodwill < (SITE_TIERS[tier].minGoodwill ?? 0) ? 'disabled' : ''}>${mw(SITE_TIERS[tier].mw)} ${money(SITE_TIERS[tier].price)}</button>`).join('')}</div>
      ${s.campus!.goodwill < (SITE_TIERS.gigawatt.minGoodwill ?? 0) ? `<div class="row meta">${t('A gigawatt campus needs goodwill of')} ${SITE_TIERS.gigawatt.minGoodwill}.</div>` : ''}</li>`;
  }).join('') : '';
  return `<h3>🌍 ${t('Campus')}</h3>
    <div class="report"><span>${t('Goodwill')}</span><b class="${state === 'moratorium' ? 'bad' : state === 'low' ? 'warn' : 'ok'}">${gw}${state === 'moratorium' ? ` · ${t('moratorium')}` : ''}</b>
      <span>${t('Live sites')}</span><b>${liveSites(s).length} / ${CAMPUS.maxSites}</b>
      <span>${t('Next board review')}</span><b>${t('day')} ${c.board.nextDay + 1} · ${t('strikes')} ${c.board.strikes}/2</b></div>
    <div class="bar"><div style="width:${gw}%" class="${gw < 40 ? 'bad' : ''}"></div></div>
    <ul class="list goals">${targets.map((x) => `<li class="row"><span>${x.ok ? '✅' : '▫️'}</span><span>${e(t(x.label.replace(/\d[\d,]*/, '{n}')).replace('{n}', (x.label.match(/\d[\d,]*/) ?? [''])[0]!))}</span></li>`).join('')}</ul>
    <p class="muted small">${t('Profit this review')}: ${money(boardProfit(s))} · ${t('day')} ${day + 1}</p>
    <ul class="list">${sites || `<li class="muted small">${t('No other sites yet.')}</li>`}</ul>
    ${campusBuildable(s) ? (options ? `<h3>🏗️ ${t('Build a site')}</h3><ul class="list">${options}</ul>` : '') : `<div class="banner bad"><span>🚧 ${t('Moratorium: no new builds.')}</span></div>`}
    <h3>🏦 ${t('Finance')}</h3>
    <div class="report"><span>${t('Loan')}</span><b>${money(c.loan)}</b><span>${t('Depreciation / day')}</span><b>${money(c.depreciationToday)}</b><span>${t('Power contract')}</span><b>${c.power === 'spot' ? `${t('Spot')} ×${c.spotMult.toFixed(2)}` : t('Fixed')}</b></div>
    <div class="row actions">${c.loan > 0 ? `<button data-action="repayLoan" ${s.cash < c.loan ? 'disabled' : ''}>${t('Repay loan')}</button>` : `<button data-action="takeLoan">${t('Borrow')} ${money(CAMPUS.loanPrincipal)}</button>`}
      ${c.investor ? `<span class="chip ok">💼 ${t('Investor')}</span>` : `<button data-action="takeInvestor">💼 ${t('Take an investor')} ${money(CAMPUS.investorCash)}</button>`}
      <button class="opt ${c.power === 'spot' ? 'on' : ''}" data-action="setPower" data-mode="${c.power === 'spot' ? 'fixed' : 'spot'}" aria-pressed="${c.power === 'spot'}">⚡ ${t('Spot power')}</button>
      <button data-action="communityFund" ${s.cash < CAMPUS.communityFund ? 'disabled' : ''}>🌳 ${t('Community fund')} ${money(CAMPUS.communityFund)}</button></div>`;
}

export function resilienceCard(s: GameState): string {
  if (!hasFeature(s, 'redundancy')) return '';
  const r = resilience(s);
  const lv = ['I', 'II', 'III', 'IV'][r.level - 1];
  return `<h3>🛡️ ${t('Resilience level')} ${lv}</h3>
    <ul class="list goals">${r.checks.map((c) => `<li class="row"><span>${c.ok ? '✅' : '▫️'}</span><span class="muted small">${['', '', 'II', 'III', 'IV'][c.level]}</span><span>${e(t(c.label))}</span></li>`).join('')}</ul>
    <p class="muted small">${t('Level III means you can maintain anything without a shutdown. Level IV survives any single fault.')}</p>`;
}

export function nightsSection(s: GameState): string {
  if (!hasFeature(s, 'nights')) return '';
  let out = '';
  const p = s.pager;
  if (p && !p.answered) {
    out += `<div class="banner bad pager"><span>📟 <b>${t('The pager')}</b>: ${e(t(p.text))}</span>
      <div class="row actions"><button class="primary" data-action="pagerNow">${t('Call everybody in')}</button><button data-action="pagerHold">${t('Hold until morning')}</button></div></div>`;
  }
  const inc = s.incident;
  if (inc && inc.status === 'open') {
    const crew = s.techs.filter((x) => x.role !== 'manager');
    const cmd = s.techs.find((x) => x.id === inc.commanderId);
    out += `<div class="banner warn incident"><span>🚨 <b>${t('Major incident')}</b> · ${Math.floor((s.minute - inc.startedAt) / 60)}h${String((s.minute - inc.startedAt) % 60).padStart(2, '0')}</span>
      <div class="row meta">${t('Commander')}: ${cmd ? e(cmd.name) : `<i>${t('nobody yet')}</i>`}</div>
      <div class="row actions">${crew.map((x) => `<button class="${x.id === inc.commanderId ? 'primary' : 'ghost'}" data-action="commander" data-tech="${e(x.id)}">${e(x.name.split(' ')[0]!)}</button>`).join('')}</div>
      <div class="row meta">${t('Update to customers')}: <b>${inc.update === 'none' ? t('none yet') : t(inc.update)}</b></div>
      <div class="row actions"><button class="${inc.update === 'honest' ? 'primary' : ''}" data-action="update" data-kind="honest">${t('Honest')}</button><button class="${inc.update === 'vague' ? 'primary' : ''}" data-action="update" data-kind="vague">${t('Vague')}</button><button class="${inc.update === 'silent' ? 'primary' : ''}" data-action="update" data-kind="silent">${t('Silent')}</button></div></div>`;
  }
  const a = s.audit;
  if (a?.done) {
    out += `<div class="banner ${a.passed ? 'info' : 'bad'}"><span>📑 ${t('Compliance audit')}: <b>${a.passed ? t('passed') : t('failed')}</b></span></div>
      <ul class="list goals">${a.checks.map((c) => `<li class="row"><span>${c.ok ? '✅' : '❌'}</span><span>${e(t(c.label))}</span></li>`).join('')}</ul>`;
  }
  const night = isNightHour(s.minute);
  out += `<div class="row meta">🌙 ${t('Night rota')}: ${(s.nightCrew ?? []).length} · ${t('premium')} ${money(rotaPremiumPerDay(s))}/${t('day')}${night ? ` · <b>${t('night')}</b>` : ''}</div>`;
  return out;
}

export function alarmsPanel(s: GameState): string {
  const list = [...s.alarms].sort((a, b) => b.severity - a.severity || a.raisedAt - b.raisedAt);
  const requests = attackCard(s) + nightsSection(s) + postMortemCard(s) + changesSection(s) + requestsSection(s);
  if (!list.length) return `${requests}<div class="empty">✅ All quiet. ${requests ? 'Time for those requests!' : hasFeature(s, 'projects') ? 'Maybe start an ops project (Team tab)?' : 'Enjoy your coffee.'}</div>`;
  return `${requests}${requests ? '<h3>Alarms</h3>' : ''}<ul class="list alarms">${list
    .map((a) => {
      const job = jobFor(s, a);
      const fix = suggestedJob(a.kind) ?? suggestedCoolerJob(a.kind);
      const tech = job ? s.techs.find((t) => t.id === job.techId) : undefined;
      const eta = a.escalateAt !== null ? `<span class="eta" title="Escalates in">⏱ ${countdown(a.escalateAt - s.minute)}</span>` : '';
      let action: string;
      const remote = a.kind === 'hung' && (s.noc ?? 0) >= 1 && a.deviceId ? s.remoteReboots?.find((r) => r.deviceId === a.deviceId) : undefined;
      if (remote) action = `<span class="busy">🖥️ ${t('Remote reboot running…')}</span>`;
      else if (job) action = `<span class="busy">🔧 ${e(tech?.name ?? 'Queued')}${job.stage === 'queued' ? ' (queued)' : ''}</span>`;
      else if (fix) {
        action = `<select class="tech-pick" aria-label="Technician">${techOptions(s)}</select>
          <button class="primary" data-action="fix" data-alarm="${e(a.id)}">${e(JOB_LABEL[fix])}</button>${a.kind === 'hung' && (s.noc ?? 0) >= 1 && a.deviceId ? `<button data-action="remoteReboot" data-device="${e(a.deviceId)}">🖥️ ${t('Remote reboot')}</button>` : ''}`;
      } else action = `<span class="hint">${e(ALARM_HINT[a.kind] ?? '')}</span>`;
      if (s.frontier && (a.deviceId || a.rackId)) action = `<button class="primary" data-action="launchRepair" data-device="${e(a.deviceId ?? '')}" data-rack="${e(a.rackId ?? '')}">🚀 ${t('Launch a spare')} ${money(Math.round(s.frontier.launchPerKg * FRONTIER.kgPerRepair))}</button>`;
      return `<li class="alarm sevrow-${a.severity}">
        <div class="row">${sevBadge(a.severity)}<b>${e(alarmLabel(s, a))}</b></div>
        <div class="row meta"><span>${formatClock(a.raisedAt)}</span>${eta}
          ${a.rackId ? `<button class="ghost" data-action="openRack" data-rack="${e(a.rackId)}">📍 Rack</button>` : ''}
          ${a.coolerId ? `<button class="ghost" data-action="openCooler" data-cooler="${e(a.coolerId)}">📍 Cooler</button>` : ''}</div>
        <div class="row actions">${action}</div></li>`;
    })
    .join('')}</ul>`;
}

export function techStatus(s: GameState, t: Tech): string {
  const job = s.jobs.find((j) => j.id === t.jobId);
  if (!job && (t.lockedUntil ?? 0) > s.minute) return `🔒 Locked out (phished) · ${countdown((t.lockedUntil ?? 0) - s.minute)}`;
  if (!job && t.onBreak) return 'On a break 😴';
  if (!job && hasFeature(s, 'nights') && t.role !== 'manager' && isNightHour(s.minute) && !(s.nightCrew ?? []).includes(t.id)) return `🌙 ${tl('Off duty')}`;
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
        <div class="row"><span class="avatar" data-tech-color="${e(t.id)}">${avatarSvg(t.role, t.role === 'manager' ? 'manager' : t.name)}</span><b>${e(t.name)}</b>
          <span class="muted">${ROLE_LABEL[t.role]} · ${'★'.repeat(t.skill)}</span></div>
        <div class="row meta">${e(techStatus(s, t))}${queued.length ? ` · +${queued.length} queued` : ''}</div>
        ${hasFeature(s, 'fatigue') ? `<div class="row meta vitals"><span title="Fatigue">😓</span><div class="bar mini"><div style="width:${t.fatigue.toFixed(0)}%" class="${t.fatigue > 60 ? 'bad' : ''}"></div></div>
          <span title="Morale">${t.morale > 75 ? '😄' : t.morale > 45 ? '🙂' : t.morale > 25 ? '😐' : '😠'}</span></div>` : ''}
        ${trait ? `<div class="row meta">🏷️ ${e(trait.name)}: ${e(trait.description)}</div>` : ''}
        ${t.role !== 'manager' && hasFeature(s, 'nights') ? `<div class="row actions"><button class="opt ${(s.nightCrew ?? []).includes(t.id) ? 'on' : ''}" data-action="nightCrew" data-tech="${e(t.id)}" data-on="${(s.nightCrew ?? []).includes(t.id) ? '0' : '1'}" aria-pressed="${(s.nightCrew ?? []).includes(t.id)}">🌙 ${tl('Night rota')}</button></div>` : ''}
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
        return `<li><div class="row"><span class="avatar">${avatarSvg(c.role, c.name)}</span><b>${e(c.name)}</b><span class="chip">${ROLE_LABEL[c.role]}</span><span class="muted">${'★'.repeat(c.skill)}${'☆'.repeat(5 - c.skill)} · walks ${c.speed.toFixed(1)} tiles/min</span></div>
          ${trait ? `<div class="row meta">🏷️ ${e(trait.name)}: ${e(trait.description)}</div>` : ''}
          <div class="row actions"><span class="muted">${money(c.salaryPerDay)}/day</span>
          <button class="primary" data-action="hire" data-candidate="${e(c.id)}">Hire</button></div></li>`;
      })
      .join('')}</ul><p class="muted small">New candidates every morning. Salaries are paid at midnight.</p>`;
  } else {
    hire = `<p class="muted small">🔒 Hiring unlocks in Chapter 1. For now, it is just you.</p>`;
  }
  const prevented = s.stats.prevented ?? 0;
  const badge = prevented ? `<div class="banner info"><span>🛡️ Your specialists prevented <b>${prevented}</b> problem${prevented === 1 ? '' : 's'} before they started.</span></div>` : '';
  return `${badge}<ul class="list">${staff}</ul>${leadSection(s)}${projectsSection(s)}${hire}`;
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
  const mood = hasFeature(s, 'crm') ? satisfactionOf(c) : null;
  const moodLine = mood === null ? '' : `<div class="row meta"><span title="${t('Customer satisfaction')}">${mood >= 75 ? '😄' : mood >= 50 ? '🙂' : mood >= 30 ? '😐' : '😠'}</span><div class="bar mini"><div style="width:${mood.toFixed(0)}%" class="${mood < 40 ? 'bad' : ''}"></div></div><span class="muted small">${Math.round(mood)}${c.renewals ? ` · ${t('renewed')} ×${c.renewals}` : ''}${daysLeft <= 1 ? ` · ${mood >= 60 ? t('likely to renew') : t('may leave')}` : ''}</span></div>`;
  return `<li class="contract">
    <div class="row"><b>${e(c.name)}</b><span class="muted">${money(c.revenuePerDay)}/day · ${daysLeft}d left</span></div>${moodLine}
    <div class="row meta"><span class="cust">🏢 ${e(c.customer)}</span></div>
    <div class="row meta">${e(c.description)}</div>
    <div class="cap" title="Live capacity vs demand"><div class="cap-live" style="width:${bar}%"></div><div class="cap-need" style="left:${needPct}%"></div></div>
    <div class="row meta"><span>Servers: ${live}/${assigned} live units, needs ${c.units} (demand now ${need.toFixed(1)})</span><span class="${contractMarginPerDay(s, c) < 0 ? 'bad' : 'ok'}" title="Revenue minus server power and rack rent">Margin ${money(contractMarginPerDay(s, c))}/day</span></div>
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
            <div class="row"><b>${e(c.name)}</b><span class="muted">${money(c.revenuePerDay)}/day</span></div>
            <div class="row meta"><span class="cust">🏢 ${e(c.customer)}</span></div>
            <div class="row meta">${e(c.description)}</div>
            ${fitLine(s, c)}
            <div class="row meta">Needs ${c.units} units · SLA ${c.slaPct}% · ${c.durationDays} days · penalty ${money(c.penaltyPerBreach)}/breach · demand: ${e(c.profile)}</div>
            <div class="row actions"><span class="muted">Offer expires in ${Math.max(0, c.expiresDay - dayOf(s.minute))}d</span>
              <button class="ghost" data-action="decline" data-contract="${e(c.id)}">Decline</button>
              <button class="primary" data-action="accept" data-contract="${e(c.id)}">Sign</button></div></li>`)
          .join('')}</ul>`
      : '<div class="empty">No offers right now.</div>'}`;
}

export function powerChip(s: GameState): string {
  const b = s.backup;
  if (!b || b.grid && b.source === 'grid') return '';
  switch (b.source) {
    case 'ups': {
      const min = Math.floor(upsRuntimeMin(s));
      return `<button class="chip-btn ${min < 20 ? 'bad' : 'warn'}" data-action="panel" data-panel="network">🔋 Grid down · battery ${min} min</button>`;
    }
    case 'generator':
      return `<button class="chip-btn ok" data-action="panel" data-panel="network">🛢️ Generator running${b.gridBackAt ? ` · grid back ~${formatClock(b.gridBackAt)}` : ''}</button>`;
    default:
      return `<button class="chip-btn bad" data-action="panel" data-panel="network">🌑 BLACKOUT</button>`;
  }
}

export function backupPanel(s: GameState): string {
  const b = s.backup;
  if (!b) return '';
  const cap = upsCapacityKwh(b);
  const pct = cap > 0 ? Math.min(100, (b.upsKwh / cap) * 100) : 0;
  const src = { grid: ['ok', t('Utility grid')], ups: ['warn', t('On battery')], generator: ['ok', t('On generator')], none: ['bad', t('BLACKOUT')] }[b.source];
  const tested = generatorTested(s);
  const busy = (kind: string) => s.jobs.some((j) => j.kind === kind);
  const gen = { none: ['muted', 'None'], idle: [tested ? 'ok' : 'warn', tested ? 'Standby · tested' : 'Standby · UNTESTED'], running: ['ok', 'Running'], failed: ['bad', 'FAILED'] }[b.generator];
  const need = (n: number) => (s.cash < n ? 'disabled' : '');
  return `<h3>${t('Backup power')}</h3>
    <div class="report"><span>${t('Racks run on')}</span><b class="${src[0]}">${src[1]}</b>
      ${!b.grid && b.gridBackAt ? `<span>Grid back</span><b>~${formatClock(b.gridBackAt)}</b>` : ''}
      ${b.source === 'ups' ? `<span>Battery left</span><b>${Math.floor(upsRuntimeMin(s))} min</b>` : ''}</div>
    <div class="bar big"><div style="width:${pct}%" class="${pct < 25 ? 'bad' : ''}"></div></div>
    <ul class="list">
      <li><div class="row"><b>🔋 UPS × ${b.upsUnits}</b><span class="chip ${b.health < BACKUP.batteryWarnBelow ? 'bad' : 'ok'}">Health ${Math.round(b.health * 100)}%</span></div>
        <div class="row meta">${b.upsKwh.toFixed(1)} / ${cap.toFixed(1)} kWh · bridges the gap until the generator starts</div>
        <div class="row actions">${busy('replaceBattery') ? '<span class="busy">🔧 Replacing…</span>' : b.health < 0.95 ? `<button class="primary" data-action="dispatchPower" data-job="replaceBattery" ${need(BACKUP.batteryJobCost)}>Replace batteries ${money(BACKUP.batteryJobCost)}</button>` : ''}
          ${b.upsUnits + (s.pendingInfra ?? []).filter((p) => p.kind === 'ups').length < BACKUP.maxUps ? `<button data-action="buyUps" ${need(BACKUP.upsPrice)}>+ UPS unit ${money(BACKUP.upsPrice)}${hasFeature(s, 'changes') ? ` · ${LEAD_TIME.ups.days} ${t('days')}` : ''}</button>` : ''}</div></li>
      <li><div class="row"><b>🛢️ ${t('Generator')}</b><span class="chip ${gen[0]}">${gen[1]}</span></div>
        <div class="row meta">${b.generator === 'none' ? 'No generator: when the batteries run dry, the lights go out.' : `Starts ${BACKUP.genStartMin} min into an outage. ${tested ? 'Test valid until ' + formatClock((b.testedAt ?? 0) + BACKUP.genTestValidMin) + '.' : 'An untested generator often refuses to start.'}`}</div>
        ${b.generator !== 'none' ? `<div class="row meta">⛽ ${t('Fuel')}: ${Math.floor((b.fuelMin ?? BACKUP.fuelFullMin) / 60)} h ${t('left')} ${b.ats === 'failed' ? `· <b class="bad">${t('Transfer switch STUCK')}</b>` : ''}</div>` : ''}
        <div class="row actions">${b.ats === 'failed' ? (busy('transferAts') ? '<span class="busy">🔧 …</span>' : `<button class="primary" data-action="dispatchPower" data-job="transferAts">${t('Transfer to generator')}</button>`) : ''}
          ${b.generator !== 'none' && (b.fuelMin ?? BACKUP.fuelFullMin) < BACKUP.fuelFullMin * 0.9 ? (busy('refuel') ? '<span class="busy">🔧 …</span>' : `<button data-action="dispatchPower" data-job="refuel" ${need(BACKUP.refuelCost)}>${t('Refuel')} ${money(BACKUP.refuelCost)}</button>`) : ''}
          ${b.generator === 'failed' ? (busy('startGenerator') ? '<span class="busy">🔧 Starting…</span>' : '<button class="primary" data-action="dispatchPower" data-job="startGenerator">Start generator</button>')
          : b.generator === 'idle' && b.grid ? (busy('testGenerator') ? '<span class="busy">🔧 Testing…</span>' : `<button class="primary" data-action="dispatchPower" data-job="testGenerator" ${need(BACKUP.genTestCost)}>Test generator ${money(BACKUP.genTestCost)}</button>`)
          : b.generator === 'none' ? `<button class="primary" data-action="buyGenerator" ${need(BACKUP.generatorPrice)}>Buy generator ${money(BACKUP.generatorPrice)}</button>` : ''}</div></li>
    </ul>
    ${(s.pendingInfra ?? []).length ? `<ul class="list">${(s.pendingInfra ?? []).map((p) => `<li><div class="row"><b>📦 ${e(t(LEAD_TIME[p.kind].name))}</b><span class="chip warn">${t('ETA')} ${formatClock(p.at)} · ${Math.max(1, Math.ceil((p.at - s.minute) / 1440))} ${t('day')}</span></div>
      <div class="row actions">${p.expedited ? `<span class="muted small">${t('Expedited')}</span>` : `<button data-action="expediteInfra" data-id="${e(p.id)}">${t('Expedite')} ${money(Math.round((p.kind === 'ups' ? BACKUP.upsPrice : BACKUP.generatorPrice) * LEAD_TIME.expediteShare))}</button>`}</div></li>`).join('')}</ul>` : ''}
    <p class="muted small">Only an <b>electrician</b> works at full speed on power jobs. Hire one in the Team tab.</p>`;
}

export function aiCard(s: GameState): string {
  const loop = s.loop;
  if (!loop || !hasFeature(s, 'liquid')) return '';
  const sc = powerScale(s);
  const heat = loopHeatKw(s);
  const cap = loopCapacityKw(s);
  const queued = (s.pendingInfra ?? []).filter((p) => p.kind === 'cdu');
  const tech = s.aiTech;
  const specialists = s.techs.filter((x) => x.role === 'hvac' || x.role === 'elec');
  const ai = aiContracts(s);
  const tiers = (Object.keys(AI.tech) as (keyof typeof AI.tech)[]).map((k) => {
    const def = AI.tech[k];
    const have = !!tech?.[k];
    const blocked = k === 'coldPlates' && !tech?.rearDoor;
    return `<li><div class="row"><b>${e(t(def.name))}</b><span class="chip ${have ? 'ok' : 'muted'}">${have ? t('Installed') : money(def.price)}</span></div>
      <div class="row meta">${e(t(def.blurb))}</div>
      ${have ? '' : `<div class="row actions"><button class="primary" data-action="buyAiTech" data-tech="${k}" ${s.cash < def.price || blocked ? 'disabled' : ''}>${t('Buy')}${blocked ? ` · ${t('needs')} ${t(AI.tech.rearDoor.name)}` : ''}</button></div>`}</li>`;
  }).join('');
  return `<h3>🧊 ${t('Liquid loop and AI')}</h3>
    <div class="report"><span>${t('Coolant units')}</span><b>${loop.cdusOk} / ${loop.cdus} ${t('working')}</b>
      <span>${t('Loop heat / capacity')}</span><b class="${heat > cap ? 'bad' : heat > cap * 0.8 ? 'warn' : 'ok'}">${heat.toFixed(1)} / ${cap.toFixed(0)} kW</b>
      ${ai.length ? `<span>${t('Effective training time')}</span><b class="${aiEffective(s) >= 90 ? 'ok' : 'warn'}">${aiEffective(s).toFixed(1)}%</b>
      <span>${t('Interruptions')}</span><b>${ai.reduce((n, c) => n + (c.aiInterrupts ?? 0), 0)} · ${t('each costs')} ${lossMinutes(s)} min</b>` : ''}</div>
    <div class="bar big"><div style="width:${cap > 0 ? Math.min(100, (heat / cap) * 100) : 100}%" class="${heat > cap ? 'bad' : ''}"></div></div>
    ${loop.cdusOk < loop.cdus ? `<div class="banner bad"><span>💧 ${t('A coolant pump failed')}</span>${s.jobs.some((j) => j.kind === 'repairPump') ? '<span class="busy">🔧 …</span>' : `<button class="primary" data-action="dispatchPower" data-job="repairPump">${t('Repair coolant pump')}</button>`}</div>` : ''}
    ${loop.leakRackId ? `<div class="banner bad"><span>💧 ${t('Coolant leak: a rack is isolated')}</span>${s.jobs.some((j) => j.kind === 'repairLeak') ? '<span class="busy">🔧 …</span>' : `<button class="primary" data-action="dispatchPower" data-job="repairLeak">${t('Repair coolant leak')}</button>`}</div>` : ''}
    <div class="row actions">${loop.cdus + queued.length < 4 ? `<button data-action="orderCdu" ${s.cash < AI.cduPrice ? 'disabled' : ''}>${t('Order coolant unit')} ${money(AI.cduPrice)} · ${LEAD_TIME.cdu.days} ${t('days')}</button>` : ''}
      ${queued.map((p) => `<span class="chip warn">📦 ${t('ETA')} ${formatClock(p.at)}</span>${p.expedited ? '' : `<button class="ghost" data-action="expediteInfra" data-id="${e(p.id)}">${t('Expedite')}</button>`}`).join('')}</div>
    <ul class="list">${tiers}</ul>
    <h3>🎓 ${t('Liquid-cooling training')}</h3>
    <ul class="list">${specialists.length ? specialists.map((x) => `<li><div class="row"><b>${e(x.name)}</b><span class="chip ${x.liquid ? 'ok' : 'muted'}">${x.liquid ? ((x.lockedUntil ?? 0) > s.minute ? t('In training') : t('Trained')) : t('Untrained: liquid work takes twice as long')}</span></div>
      ${x.liquid ? '' : `<div class="row actions"><button data-action="trainLiquid" data-tech="${e(x.id)}" ${s.cash < AI.trainPrice ? 'disabled' : ''}>${t('Train')} ${money(AI.trainPrice)} · ${AI.trainMin / 60} h</button></div>`}</li>`).join('') : `<li class="muted small">${t('Hire an HVAC technician or an electrician first.')}</li>`}</ul>
    <p class="muted small">${t('Interruption rate for a cluster of 4:')} ${(interruptRatePerMin(s, 4) * 1440).toFixed(1)} ${t('per day')}</p>`;
}

export function siteChip(s: GameState): string {
  const site = s.site;
  if (!site) return '';
  if (site.mainTripped) return `<button class="chip-btn bad" data-action="panel" data-panel="network">⚡ ${t('MAIN BREAKER TRIPPED')}</button>`;
  const pct = Math.round((facilityW(s) / site.gridCapW) * 100);
  return `<button class="chip-btn ${pct >= 100 ? 'bad' : pct >= 90 ? 'warn' : ''}" data-action="panel" data-panel="network" title="${t('Grid connection used')}">⚡ ${pct}% · PUE ${pueNow(s).toFixed(2)}</button>`;
}

export function energyCard(s: GameState): string {
  const site = s.site;
  if (!site || !hasFeature(s, 'energy')) return '';
  const sc = powerScale(s);
  const cash = (n: number) => (s.cash < n ? 'disabled' : '');
  const ratio = site.waterOffToday > 0 ? site.waterOffToday / Math.max(1, site.waterOnToday) : 0;
  const maxW = Math.max(1, site.waterOnToday, site.waterOffToday);
  const drought = droughtActive(s);
  const queued = (s.pendingInfra ?? []).filter((p) => p.kind === 'grid');
  const room = site.gridSteps + queued.length < SITE.maxSteps;
  return `<h3>⚡ ${t('Energy and water')}</h3>
    <div class="report"><span>PUE ${t('now')}</span><b class="${pueNow(s) > 1.55 ? 'bad' : pueNow(s) > 1.4 ? 'warn' : 'ok'}">${pueNow(s).toFixed(2)}</b>
      <span>PUE ${t('since the start')}</span><b>${pueAverage(s).toFixed(2)}</b>
      <span>${t('Outside air')}</span><b>${outdoorC(s).toFixed(0)}°C${site.economizer ? ` · ${t('free cooling')} ${Math.round(freeShare(s) * 100)}%` : ''}</b>
      <span>${t('Facility power')}</span><b>${formatPower(facilityW(s), sc)} / ${formatPower(site.gridCapW, sc)}</b></div>
    <div class="bar big"><div style="width:${Math.min(100, (facilityW(s) / site.gridCapW) * 100)}%" class="${facilityW(s) > site.gridCapW * SITE.warnShare ? 'bad' : ''}"></div></div>
    ${site.mainTripped ? `<div class="banner bad"><span>⚡ ${t('The main breaker tripped. Everything is down.')}</span>${s.jobs.some((j) => j.kind === 'resetMain') ? '<span class="busy">🔧 …</span>' : `<button class="primary" data-action="dispatchPower" data-job="resetMain">${t('Reset main breaker')}</button>`}</div>` : ''}
    ${site.oob === 'cut' ? `<div class="banner warn"><span>🖥️ ${t('Out-of-band management link is down')}</span>${s.jobs.some((j) => j.kind === 'repairOob') ? '<span class="busy">🔧 …</span>' : `<button class="primary" data-action="dispatchPower" data-job="repairOob">${t('Repair management link')}</button>`}</div>` : ''}
    ${drought ? `<div class="banner warn"><span>🏜️ ${t('Drought: evaporative cooling is banned')} · ${t('until')} ${formatClock(site.droughtUntil)}</span></div>` : ''}
    <ul class="list">
      <li><div class="row"><b>🌬️ ${t('Cooling mode')}</b><span class="chip ok">${site.cooling === 'evaporative' ? t('Evaporative') : t('Dry')}</span></div>
        <div class="row meta">${t('Evaporative: cheap electricity, uses water. Dry: almost no water, more electricity.')}</div>
        <div class="row actions"><button class="opt ${site.cooling === 'evaporative' ? 'on' : ''}" data-action="setCooling" data-mode="evaporative" aria-pressed="${site.cooling === 'evaporative'}" ${drought ? 'disabled' : ''}>💧 ${t('Evaporative')}</button>
          <button class="opt ${site.cooling === 'dry' ? 'on' : ''}" data-action="setCooling" data-mode="dry" aria-pressed="${site.cooling === 'dry'}">🌬️ ${t('Dry')}</button></div></li>
      <li><div class="row"><b>🌡️ ${t('Supply air')}</b><span class="chip ${setpointOf(s) > 25 ? 'warn' : 'ok'}">${setpointOf(s)}°C</span></div>
        <div class="row meta">${t('Warmer air saves cooling energy and lets free cooling work more hours, but leaves less margin when something fails.')}</div>
        <div class="row actions"><button data-action="setSetpoint" data-c="${setpointOf(s) - 1}" ${setpointOf(s) <= ENERGY.setpointMin ? 'disabled' : ''} aria-label="${t('Lower the setpoint')}">− 1°C</button>
          <button data-action="setSetpoint" data-c="${setpointOf(s) + 1}" ${setpointOf(s) >= ENERGY.setpointMax ? 'disabled' : ''} aria-label="${t('Raise the setpoint')}">+ 1°C</button></div></li>
      <li><div class="row"><b>🧱 ${t('Aisle containment')}</b><span class="chip ${containmentOf(s) ? 'ok' : 'muted'}">${t(ENERGY.containmentName[containmentOf(s)])}</span></div>
        <div class="row meta">${t('Keeps hot exhaust away from cold intakes and trims fan energy.')}</div>
        <div class="row actions">${containmentOf(s) < 2 ? `<button class="primary" data-action="buyContainment" ${cash(ENERGY.containmentPrice[containmentOf(s) + 1]!)}>${t('Upgrade to')} ${t(ENERGY.containmentName[containmentOf(s) + 1]!)} ${money(ENERGY.containmentPrice[containmentOf(s) + 1]!)}</button>` : ''}</div></li>
      <li><div class="row"><b>❄️ ${t('Free cooling')}</b><span class="chip ${site.economizer ? 'ok' : 'muted'}">${site.economizer ? t('Installed') : t('Not installed')}</span></div>
        <div class="row actions">${site.economizer ? '' : `<button class="primary" data-action="buyEconomizer" ${cash(ENERGY.economizerPrice)}>${t('Install')} ${money(ENERGY.economizerPrice)}</button>`}
          <button class="opt ${site.renewable ? 'on' : ''}" data-action="setRenewable" data-on="${site.renewable ? '0' : '1'}" aria-pressed="${site.renewable}">🌱 ${t('Renewable power')} +15%</button>
          ${site.heatReuse ? `<span class="chip ok">♨️ ${t('Heat reuse')}</span>` : `<button data-action="buyHeatReuse" ${cash(ENERGY.heatReusePrice)}>♨️ ${t('Heat reuse')} ${money(ENERGY.heatReusePrice)}</button>`}</div></li>
      <li><div class="row"><b>💧 ${t('Water today')}</b>${ratio ? `<span class="chip">${t('off-site is')} ${ratio.toFixed(1)}× ${t('on-site')}</span>` : ''}</div>
        <div class="row meta">${t('On-site (cooling)')}: ${Math.round(site.waterOnToday)} L</div><div class="bar"><div style="width:${(site.waterOnToday / maxW) * 100}%"></div></div>
        <div class="row meta">${t('Off-site (in the electricity)')}: ${Math.round(site.waterOffToday)} L</div><div class="bar"><div style="width:${(site.waterOffToday / maxW) * 100}%" class="warn"></div></div></li>
      <li><div class="row"><b>🔌 ${t('Grid connection')}</b><span class="chip ${room ? 'ok' : 'muted'}">${formatPower(site.gridCapW, sc)}</span></div>
        ${queued.map((p) => `<div class="row meta">📦 +${formatPower(SITE.stepW, sc)} · ${t('ETA')} ${formatClock(p.at)} · ${Math.max(1, Math.ceil((p.at - s.minute) / 1440))} ${t('day')}</div>`).join('')}
        <div class="row actions">${room ? `<button class="primary" data-action="orderGrid" ${cash(SITE.stepPrice)}>${t('Order +')}${formatPower(SITE.stepW, sc)} ${money(SITE.stepPrice)} · ${LEAD_TIME.grid.days} ${t('days')}</button>` : `<span class="muted small">${t('The utility will not connect more.')}</span>`}</div></li>
    </ul>`;
}

export function capacityCard(s: GameState): string {
  if (!hasFeature(s, 'capacity')) return '';
  const rep = capacityReport(s);
  const sc = powerScale(s);
  const fmt = (k: string, v: number) => (k === 'power' ? formatPower(v, sc) : k === 'space' ? `${v} U` : k === 'cooling' ? `${v.toFixed(1)} kW` : `${v.toFixed(1)} Gbps`);
  return `<h3>📊 ${t('Capacity')}</h3>
    <ul class="list">${rep.resources.map((r) => `<li><div class="row"><b>${e(t(r.label))}${r.key === rep.limiting ? ` <span class="chip warn">${t('runs out first')}</span>` : ''}</b><span class="muted">${fmt(r.key, r.used)} / ${fmt(r.key, r.cap)}</span></div>
      <div class="bar"><div style="width:${Math.min(100, r.pct)}%" class="${r.pct > 90 ? 'bad' : ''}"></div></div></li>`).join('')}</ul>
    ${rep.strandedU > 0 ? `<p class="muted small">⚠ ${t('Stranded')}: ${rep.strandedU} U ${t('free but no power left in those racks.')}</p>` : ''}`;
}

export function fitLine(s: GameState, c: Contract): string {
  if (!hasFeature(s, 'capacity')) return '';
  const f = fitPreview(s, c);
  const names: Record<string, string> = { power: 'power', space: 'space', network: 'network', cooling: 'cooling' };
  return `<div class="row meta"><span class="chip ${f.ok ? 'ok' : 'bad'}">${f.ok ? `✓ ${t('Fits')}` : `⚠ ${t('Runs out of')} ${f.limits.map((l) => t(names[l]!)).join(', ')}`}</span>
    <span class="muted small">${t('needs')} ${f.needUnits} ${t('servers')} · ${formatPower(f.needW, powerScale(s))} · ${f.needU} U${f.needGbps ? ` · ${f.needGbps} Gbps` : ''}</span></div>`;
}

export function redundancyCard(s: GameState): string {
  if (!hasFeature(s, 'redundancy')) return '';
  const serving = s.devices.filter((d) => d.contractId !== null);
  const single = serving.filter((d) => (d.psus ?? 1) !== 2);
  const spof = spofCount(s);
  const busy = s.jobs.some((j) => j.kind === 'dualCord');
  const failed = s.racks.flatMap((r, i) => (['A', 'B'] as const).filter((f) => !feedOk(r, f)).map((f) => ({ r, i, f })));
  return `<h3>${t('Redundancy')}</h3>
    <div class="report"><span>${t('Dual-cord')}</span><b class="${single.length ? 'warn' : 'ok'}">${serving.length - single.length} / ${serving.length}</b>
      <span>${t('Single points of failure')}</span><b class="${spof.servers ? 'bad' : 'ok'}">${spof.servers}</b>
      <span>${t('Spare PSUs in stock')}</span><b>${s.inventory.psu}</b></div>
    ${failed.length ? `<ul class="list">${failed.map(({ r, i, f }) => {
      const job = s.jobs.find((j) => j.kind === 'repairPdu' && j.rackId === r.id);
      return `<li><div class="row"><b>⚡ ${t('Feed')} ${f} · Rack ${i + 1}</b><span class="chip bad">${t('FAILED')}</span></div>
        <div class="row actions">${job ? '<span class="busy">🔧 …</span>' : `<button class="primary" data-action="dispatchFeed" data-rack="${e(r.id)}" data-feed="${f}">${t('Repair power feed')}</button>`}</div></li>`;
    }).join('')}</ul>` : ''}
    <div class="row actions">${single.length ? (busy ? '<span class="busy">🔧 …</span>' : `<button class="primary" data-action="dualCordNext" ${s.inventory.psu < 1 ? 'disabled' : ''}>${t('Dual-cord next server')}</button>`) : `<span class="ok">✅ ${t('two legs')}</span>`}</div>
    <p class="muted small">${t('Power feeds, dual power supplies and single points of failure')}: ${t('SPOF view')} (O).</p>`;
}

export function networkPanel(s: GameState): string {
  const cap = bandwidthCapacity(s);
  const used = s.bandwidthUsed;
  const pct = cap > 0 ? (used / cap) * 100 : 100;
  const failed = s.racks.filter((r) => r.switchFailed);
  return `${aiCard(s)}${energyCard(s)}${capacityCard(s)}${backupPanel(s)}${redundancyCard(s)}
    <h3>${t('Uplink traffic')}</h3>
    <div class="report"><span>Using</span><b class="${used > cap ? 'bad' : pct > 90 ? 'warn' : ''}">${used.toFixed(1)} / ${cap} Gbps</b></div>
    <div class="bar big"><div style="width:${Math.min(100, pct)}%" class="${pct > 90 ? 'bad' : ''}"></div></div>
    <p class="muted small">If customers need more bandwidth than your live uplinks carry, every bandwidth-using contract misses its SLA.</p>
    <h3>${t('Uplinks')}</h3>
    <ul class="list">${s.uplinks.map((u) => {
      const job = s.jobs.find((j) => j.uplinkId === u.id);
      return `<li><div class="row"><b>${e(u.name)}</b><span class="chip ${u.up ? 'ok' : 'bad'}">${u.up ? 'Up' : 'CUT'}</span></div>
        <div class="row meta">${u.capacityGbps} Gbps · ${money(u.costPerDay)}/day${!u.up && u.repairAt !== null ? ` · ISP repair ETA ${formatClock(u.repairAt)}` : ''}</div>
        ${!u.up ? `<div class="row actions">${job ? `<span class="busy">🔧 Splicing…</span>` : `<button class="primary" data-action="dispatchUplink" data-uplink="${e(u.id)}">Send network engineer</button>`}</div>` : ''}</li>`;
    }).join('')}</ul>
    ${s.uplinks.length < 2 ? `<div class="banner info"><span>Add <b>${e(EXTRA_UPLINK.name)}</b>: +${EXTRA_UPLINK.capacityGbps} Gbps on a separate route.
      ${money(EXTRA_UPLINK.setupCost)} setup + ${money(EXTRA_UPLINK.costPerDay)}/day.</span>
      <button class="primary" data-action="buyUplink" ${s.cash < EXTRA_UPLINK.setupCost ? 'disabled' : ''}>Order</button></div>` : ''}
    <h3>${t('Switches')}</h3>
    ${failed.length ? `<ul class="list">${failed.map((r) => `<li class="row"><span>🔀 ${e(rackName(s, r))} switch down</span><button data-action="openRack" data-rack="${e(r.id)}">📍 Rack</button></li>`).join('')}</ul>`
      : `<div class="empty">All top-of-rack switches healthy. ${s.inventory.switch} spare${s.inventory.switch === 1 ? '' : 's'} in stock.</div>`}`;
}

const SHOP_ORDER: PartId[] = ['disk', 'psu', 'filter', 'switch', 'server1u', 'server2u', 'portableAc', 'rack', 'wallAc', 'crac', 'coffee'];
const SHOP_GATE: Partial<Record<PartId, Parameters<typeof hasFeature>[1]>> = {
  rack: 'buildRack', wallAc: 'coolers', crac: 'maintenance', filter: 'maintenance', switch: 'network', coffee: 'fatigue',
};
const PLACEABLE: ReadonlySet<PartId> = new Set(['rack', 'portableAc', 'wallAc', 'crac']);

export function nocCard(s: GameState): string {
  if (!hasFeature(s, 'remote')) return '';
  const level = s.noc ?? 0;
  const next = NOC.levels[level];
  return `<h3>🖥️ ${t('Network operations centre')}</h3>
    <div class="banner info"><span><b>${t('Level')} ${level}/${NOC.levels.length}</b>${level ? ` · ${e(t(NOC.levels[level - 1]!.name))}` : ''}<br>
      ${next ? `<span class="muted small">${t('Next')}: <b>${e(t(next.name))}</b> · ${e(t(next.blurb))} ${money(next.price)} + ${money(next.perDay)}/${t('day')}</span>` : `<span class="muted small">${t('Fully upgraded')}</span>`}</span>
      ${next ? `<button class="primary" data-action="upgradeNoc" ${s.cash < next.price ? 'disabled' : ''}>${t('Upgrade')}</button>` : ''}</div>`;
}

export function shopPanel(s: GameState): string {
  const available = SHOP_ORDER.filter((p) => !SHOP_GATE[p] || hasFeature(s, SHOP_GATE[p]!));
  const rows = available
    .map((p) => {
      const info = PARTS[p];
      const extra = p === 'server1u' || p === 'server2u'
        ? `${SERVER_MODELS[p].units} unit${SERVER_MODELS[p].units > 1 ? 's' : ''}, ${SERVER_MODELS[p].u}U, ${SERVER_MODELS[p].idleW}-${SERVER_MODELS[p].maxW} W`
        : '';
      const dt = deliveryTime(s, p);
      const placeable = PLACEABLE.has(p);
      return `<li><div class="row"><span class="ico">${partSvg(p)}</span><b>${e(info.name)}</b><span class="muted">${money(info.price)}</span></div>
        <div class="row meta">${p === 'coffee' ? `Current machine: level <b>${s.coffeeLevel}</b>` : `In stock: <b>${s.inventory[p]}</b>`} · delivery ${dt === 0 ? 'instant' : countdown(dt)}${extra ? ` · ${extra}` : ''}</div>
        <div class="row actions">
          ${placeable && s.inventory[p] > 0 ? `<button class="primary" data-action="build" data-part="${p}">Place on floor</button>` : ''}
          <button data-action="order" data-part="${p}" data-qty="1" ${s.cash < info.price ? 'disabled' : ''}>Buy 1</button>
          ${p === 'disk' || p === 'psu' || p === 'filter' ? `<button data-action="order" data-part="${p}" data-qty="3" ${s.cash < info.price * 3 ? 'disabled' : ''}>Buy 3</button>` : ''}
        </div></li>`;
    })
    .join('');
  const orders = s.orders.length
    ? `<h3>On the way</h3><ul class="list">${s.orders.map((o) => `<li class="row"><span class="inline-ico"><span class="ico sm">${partSvg(o.part)}</span> ${o.qty} × ${e(PARTS[o.part].name)}</span><span class="muted">arrives ${formatClock(o.arriveAt)}</span></li>`).join('')}</ul>`
    : '';
  return `${nocCard(s)}<h3>${t("Parts")}</h3><ul class="list shop">${rows}</ul>${orders}`;
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
    <h3>${ch.event ? 'Event' : `Chapter ${ch.number}`}: ${e(ch.title)}</h3>
    <p class="muted">${e(ch.intro)}</p>
    <ul class="list goals">${objectivesFor(s)
      .map((o, i) => `<li class="row"><span class="star">${'★'.repeat(i + 1)}</span><span>${e(o.label)}</span><span class="${status[i] ? 'ok' : 'muted'}">${status[i] ? '✓ on track' : '…'}</span></li>`)
      .join('')}</ul>
    <p class="muted small">${s.sandbox ? `No end date · score ${sandboxScore(s).toLocaleString('en-US')} · milestones` : `Ends ${formatClock(chapterEnd(s))} · goals are checked at the end`} · ${DIFFICULTIES[s.difficulty].emoji} ${e(DIFFICULTIES[s.difficulty].name)}</p>
    ${resilienceCard(s)}
    ${campusPanel(s)}
    ${last ? `<h3>Last day</h3><div class="report">
      <span>Revenue</span><b>${money(last.revenue)}</b><span>Penalties</span><b>${money(-last.penalties)}</b>
      <span>Salaries</span><b>${money(-last.salaries)}</b><span>Electricity</span><b>${money(-last.electricity)}</b>
      <span>Rent</span><b>${money(-last.rent)}</b>${last.network ? `<span>Network</span><b>${money(-last.network)}</b>` : ''}<span>Net</span><b class="${last.net < 0 ? 'neg' : 'pos'}">${money(last.net)}</b></div>` : ''}
    ${incidentHistory(s)}
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
    .map((c) => `<option value="${e(c.id)}" ${c.id === d.contractId ? 'selected' : ''}>${e(contractLabel(c))}</option>`)
    .join('')}`;
  const legs = hasFeature(s, 'redundancy') ? ((d.psus ?? 1) === 2 ? (onOneLeg(s, d) ? `<span class="chip warn">${t('one leg')}</span>` : `<span class="chip ok">${t('two legs')}</span>`) : `<span class="chip bad">${t('one leg')}</span>`) : '';
  const rackOf = rackById(s, d.rackId);
  const gpuBtn = hasFeature(s, 'liquid') && rackOf?.liquid && !d.gpu && d.model === 'server2u' && !job ? `<button class="primary" data-action="dispatchDevice" data-job="gpuUpgrade" data-device="${e(d.id)}" ${s.cash < AI.gpuUpgradePrice ? 'disabled' : ''}>${t('Fit GPUs')} ${money(AI.gpuUpgradePrice)}</button>` : '';
  const dual = hasFeature(s, 'redundancy') && (d.psus ?? 1) !== 2 && !job ? `<button data-action="dispatchDevice" data-job="dualCord" data-device="${e(d.id)}" ${s.inventory.psu < 1 ? 'disabled' : ''}>${t('Dual-cord')}</button>` : '';
  return `<li class="slot dev ${cls}" style="--u:${m.u}">
    <div class="row"><span class="u">U${d.slot + 1}${m.u > 1 ? `-${d.slot + m.u}` : ''}</span><span class="ico xs">${partSvg(d.model)}</span><b>${e(m.name)}</b><span class="chip ${cls}">${status}</span>${legs}${d.gpu ? '<span class="chip ok">GPU</span>' : ''}${d.faults.includes('corrupt') ? `<span class="chip bad">${t('corrupted')}</span>` : ''}</div>
    <div class="row meta">${d.faults.map((f) => `⚠ ${e(f)}`).join(' ')} ${up ? `Load ${(d.load * 100).toFixed(0)}%` : ''} ${contract ? `· for ${e(contractLabel(contract))}` : ''}</div>
    <div class="row actions">
      ${job ? `<span class="busy">🔧 ${e(JOB_LABEL[job.kind])}…</span>` : fixes}${gpuBtn}${dual}
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
  const contractOptions = `<option value="">— unassigned —</option>${activeContracts(s).map((c) => `<option value="${e(c.id)}">${e(contractLabel(c))}</option>`).join('')}`;
  const tempCls = rack.temp >= THERMAL.major ? 'bad' : rack.temp >= THERMAL.warn ? 'warn' : 'ok';
  const breakerJob = s.jobs.find((j) => j.kind === 'resetBreaker' && j.rackId === rack.id);
  return `<div class="modal-card" role="dialog" aria-modal="true" aria-label="${e(rackName(s, rack))}">
    <header role="group"><h2 class="inline-ico"><span class="ico sm">${partSvg('rack')}</span> ${e(rackName(s, rack))}</h2><button class="ghost" data-action="closeModal" aria-label="Close">✕</button></header>
    <div class="rack-stats">
      <div><span class="k">Temperature</span><b class="${tempCls}">${rack.temp.toFixed(1)}°C</b></div>
      <div><span class="k">Power</span><b class="${powerPct > 90 ? 'bad' : powerPct > 70 ? 'warn' : ''}">${formatPower(rack.loadW, powerScale(s))} / ${formatPower(rack.powerBudgetW, powerScale(s))}</b>
        <div class="bar"><div style="width:${Math.min(100, powerPct)}%" class="${powerPct > 90 ? 'bad' : ''}"></div></div></div>
    </div>
    ${hasFeature(s, 'aisles') ? `<div class="banner ${rack.recirculation > 0 ? 'warn' : 'info'}">
      <span>${rack.facing === 'S' ? '⬇️' : '⬆️'} Front faces <b>${rack.facing === 'S' ? 'south' : 'north'}</b>.
      ${rack.recirculation > 0 ? `Breathing hot exhaust from the rack in front: <b>+${rack.recirculation.toFixed(1)}°C</b>.` : 'Airflow OK.'}</span>
      ${s.jobs.some((j) => j.kind === 'rotateRack' && j.rackId === rack.id)
        ? `<span class="busy">🔧 ${rack.maintenance ? 'Rotating… servers offline' : 'Rotation queued'}</span>`
        : `<button data-action="dispatchRack" data-job="rotateRack" data-rack="${e(rack.id)}">↻ Rotate (servers offline ~1h)</button>`}</div>` : ''}
    ${rack.switchFailed ? `<div class="banner bad">🔀 Top-of-rack switch failed: every server here is offline.
      ${s.jobs.some((j) => j.kind === 'replaceSwitch' && j.rackId === rack.id) ? '<span class="busy">🔧 On it</span>' : `<button class="primary" data-action="dispatchRack" data-job="replaceSwitch" data-rack="${e(rack.id)}">Replace switch</button>`}</div>` : ''}
    ${hasFeature(s, 'liquid') ? `<div class="banner ${rack.liquid ? 'info' : 'warn'}"><span>${rack.liquid ? `🧊 ${t('On the liquid loop')}` : `🌬️ ${t('Air-cooled')}`}</span>${rack.liquid || !s.aiTech?.coldPlates ? '' : (s.jobs.some((j) => j.kind === 'convertLiquid' && j.rackId === rack.id) ? '<span class="busy">🔧 …</span>' : `<button data-action="dispatchRack" data-job="convertLiquid" data-rack="${e(rack.id)}">${t('Convert to liquid')} ${money(AI.convertPrice)}</button>`)}</div>` : ''}
    ${hasFeature(s, 'redundancy') ? (['A', 'B'] as const).map((f) => `<div class="banner ${feedOk(rack, f) ? 'info' : 'bad'}"><span>⚡ ${t('Feed')} ${f}: <b>${feedOk(rack, f) ? 'OK' : t('FAILED')}</b></span>${feedOk(rack, f) ? '' : (s.jobs.some((j) => j.kind === 'repairPdu' && j.rackId === rack.id) ? '<span class="busy">🔧 …</span>' : `<button class="primary" data-action="dispatchFeed" data-rack="${e(rack.id)}" data-feed="${f}">${t('Repair power feed')}</button>`)}</div>`).join('') : ''}
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
  const busy = s.jobs.find((j) => j.coolerId === c.id);
  const maint = hasFeature(s, 'maintenance') && c.kind !== 'officeAc';
  return `<div class="modal-card small-card" role="dialog" aria-modal="true">
    <header role="group"><h2 class="inline-ico"><span class="ico sm">${partSvg(c.kind)}</span> ${COOLERS[c.kind].name}</h2><button class="ghost" data-action="closeModal" aria-label="Close">✕</button></header>
    <p>Capacity <b>${c.capacityKw} kW</b> of heat · draws ${c.powerW} W · ${c.broken ? '<b class="bad">BROKEN</b>' : c.on ? 'running' : 'off'}</p>
    ${maint ? `<p>Filter <div class="bar"><div style="width:${(c.health * 100).toFixed(0)}%" class="${c.health < 0.4 ? 'bad' : ''}"></div></div>
      <span class="muted small">A dirty filter cuts capacity by up to half and can make the unit break down.</span></p>
      <div class="stack">${busy ? `<span class="busy">🔧 ${e(JOB_LABEL[busy.kind])}…</span>` : c.broken
        ? `<button class="primary" data-action="coolerJob" data-job="repairCooler" data-cooler="${e(c.id)}">Repair (HVAC tech)</button>`
        : `<button class="primary" data-action="coolerJob" data-job="serviceCooler" data-cooler="${e(c.id)}" ${c.health > 0.9 ? 'disabled' : ''}>Change filter (HVAC tech, ${s.inventory.filter} in stock)</button>`}</div>` : ''}
    ${c.kind === 'officeAc' ? '<p class="muted small">Facilities control this unit.</p>' : `<button class="primary" data-action="cooler" data-cooler="${e(c.id)}" data-on="${c.on ? '0' : '1'}">${c.on ? 'Switch off' : 'Switch on'}</button>`}
  </div>`;
}

export interface StartExtras {
  sandboxBest?: { score: number; days: number } | null;
  daily: DailySpec;
  dailyBest: { stars: number; share: string } | null;
  achievements: Record<string, number>;
}

/** Feature flags of every chapter the player has reached (the Handbook grows with them). */
export function unlockedFeatures(progress: Progress): string[] {
  const out = new Set<string>();
  for (const id of CHAPTER_ORDER) if (isUnlocked(progress, id)) CHAPTERS[id].features.forEach((f) => out.add(f));
  if (isUnlocked(progress, 'hack')) out.add('cyber');
  return [...out];
}

/** Release notes: open and highlighted once after an update, always available as a closed list. */
export function whatsNew(settings: Settings): string {
  const unseen = settings.seenVersion !== undefined && settings.seenVersion !== APP_VERSION && releasesSince(settings.seenVersion).length > 0;
  const list = (unseen ? releasesSince(settings.seenVersion) : RELEASES).slice(0, unseen ? 6 : 8);
  return `<details class="whatsnew" ${unseen ? 'open' : ''}><summary>🆕 ${unseen ? t('What’s new since your last visit') : t('Release notes')}</summary>
    ${list.map((r) => `<h3>v${e(r.version)} · ${e(t(r.title))}</h3><ul>${r.notes.map((n) => `<li>${e(t(n))}</li>`).join('')}</ul>`).join('')}
    ${unseen ? `<button class="primary" data-action="seenNotes">${t('Got it')}</button>` : ''}</details>`;
}

export function startScreen(progress: Progress, settings: Settings, hasSave: boolean, extras?: StartExtras): string {
  const diffs = Object.values(DIFFICULTIES);
  return `<section class="start" aria-label="${t('Main menu')}">
    <h1>Data<span>Center</span>Mania</h1>
    <p class="tag">${t('Keep the servers humming. Keep the customers happy. Keep your cool.')}</p>
    <p class="muted small version">v${APP_VERSION}</p>
    ${whatsNew(settings)}
    ${hasSave ? `<button class="primary big" data-action="continue">${t('▶ Continue')}</button>` : ''}
    ${extras ? careerCard(progress) + dailyCard(extras.daily, extras.dailyBest) + eventCard('hack', isUnlocked(progress, 'hack'), bestStars(progress, 'hack')) + sandboxCard(settings.sandbox, isSandboxUnlocked(progress), extras.sandboxBest ?? null) : ''}
    <h2 class="sec">${t('Difficulty')}</h2>
    <div class="diffs">${diffs
      .map((d) => isDifficultyUnlocked(progress, d.id)
        ? `<button class="diff ${settings.difficulty === d.id ? 'on' : ''}" data-action="difficulty" data-difficulty="${d.id}" aria-pressed="${settings.difficulty === d.id}">
        <span class="em">${d.emoji}</span><b>${e(d.name)}</b><span class="small">${e(d.blurb)}</span></button>`
        : `<div class="diff locked" aria-disabled="true"><span class="em">${d.emoji}</span><b>${e(d.name)}</b><span class="small">${t('🔒 Beat Chapter 3 to unlock')}</span></div>`)
      .join('')}
    </div>
    <h2 class="sec">${t('Chapters')}</h2>
    <div class="chapters">${CHAPTER_ORDER.map((id) => {
      const ch = CHAPTERS[id];
      const era = ERA_STARTS[ch.number] ? `<h3 class="era">${t(ERA_STARTS[ch.number]!)}</h3>` : '';
      const open = isUnlocked(progress, id);
      const best = bestStars(progress, id);
      return `${era}<button class="chapter ${open ? '' : 'locked'}" ${open ? `data-action="newGame" data-chapter="${id}"` : 'disabled'}>
        <span class="num">${ch.number}</span><span class="ct"><b>${e(ch.title)}</b><span class="small">${e(ch.subtitle)}</span></span>
        <span class="best">${open ? `${'★'.repeat(best)}${'☆'.repeat(3 - best)}` : '🔒'}</span></button>`;
    }).join('')}
    </div>
    ${extras ? achievementsGrid(extras.achievements) + handbookSection(unlockedFeatures(progress)) + handoverBox() : ''}
    ${settingsForm(settings)}
    <p class="muted small">${t('Free, no ads, works offline. Saves stay in this browser.')}</p>
  </section>`;
}

/** The campaign in three eras (PRD v2 addendum P16): where each begins. */
const ERA_STARTS: Record<number, string> = { 0: 'Era 1: Cloud warehouse', 6: 'Era 2: The AI factory approaches', 9: 'Era 3: Energy-integrated compute' };

export function handoverBox(): string {
  return `<details class="handover"><summary>📥 ${t('Resume from a hand-over code')}</summary>
    <p class="muted small">${t('Paste the code a friend copied from their pause menu to take over their shift.')}</p>
    <textarea id="code-input" rows="3" aria-label="${t('Hand-over code')}" placeholder="DCM2:…"></textarea>
    <button class="primary" data-action="loadCode">${t('Load the game')}</button></details>`;
}

export function handbookSection(features: readonly string[]): string {
  const list = handbookFor(features);
  return `<details class="handbook"><summary>📖 ${t('Ops Handbook')} ${list.length}/${HANDBOOK.length}</summary>
    <ul class="hb-list">${list.map((h) => `<li><details><summary><span class="pi">${h.icon}</span> <b>${e(t(h.term))}</b></summary>
      <p><span class="hb-k">${t('In the game')}</span> ${e(t(h.game))}</p><p><span class="hb-k">${t('In real life')}</span> ${e(t(h.real))}</p></details></li>`).join('')}</ul>
    <p class="muted small">${t('New entries unlock as you meet each system.')}</p></details>`;
}

export function settingsForm(settings: Settings): string {
  return `<details class="settings"><summary>${t('⚙️ Settings')}</summary>
    <label>${t('Auto-pause on')} <select data-action="setting" data-key="autoPause">
      ${(['critical', 'major', 'off'] as const).map((v) => `<option value="${v}" ${settings.autoPause === v ? 'selected' : ''}>${v === 'off' ? t('never') : t(`${v} alarms`)}</option>`).join('')}
    </select></label>
    <label><input type="checkbox" data-action="setting" data-key="nightSkip" ${settings.nightSkip ? 'checked' : ''}> ${t('Night skip (fast nights when quiet)')}</label>
    <label><input type="checkbox" data-action="setting" data-key="sound" ${settings.sound ? 'checked' : ''}> ${t('Sound')}</label>
    <label>${t('Display')} <select data-action="setting" data-key="display">
      ${([['auto', 'Auto-detect'], ['color', 'Colour screen'], ['eink', 'E-ink (Kindle Scribe)']] as const)
        .map(([v, l]) => `<option value="${v}" ${settings.display === v ? 'selected' : ''}>${t(l)}</option>`).join('')}
    </select></label>
    <label><input type="checkbox" data-action="setting" data-key="telemetry" ${settings.telemetry ? 'checked' : ''}> ${t('Keep a play log on this device')}</label>
    ${settings.telemetry ? `<button class="ghost" data-action="exportTelemetry">${t('Export play log')}</button>${feedbackBox()}` : ''}
    <label>${t('Language')} <select data-action="setting" data-key="lang">
      ${([['auto', 'Auto'], ['en', 'English'], ['fr', 'Français']] as const).map(([v, l]) => `<option value="${v}" ${settings.lang === v ? 'selected' : ''}>${l}</option>`).join('')}
    </select></label>
  </details>`;
}

/** Tester feedback, one tap each: how much it feels like the job, and what went wrong. */
export function feedbackBox(): string {
  const tags: [string, string][] = [['unfair', 'An outage felt unfair'], ['slow', 'Too slow'], ['hard', 'Too hard'], ['confusing', 'Confusing']];
  return `<fieldset class="feedback"><legend>💬 ${t('Feedback for the testers')}</legend>
    <div class="row meta">${t('Does it feel like the job of a data center operator?')}</div>
    <div class="row actions">${[1, 2, 3, 4, 5].map((n) => `<button data-action="feedback" data-kind="rating" data-value="${n}" aria-label="${n} / 5">${n}</button>`).join('')}</div>
    <div class="row actions">${tags.map(([v, l]) => `<button class="ghost" data-action="feedback" data-kind="tag" data-value="${v}">${t(l)}</button>`).join('')}</div></fieldset>`;
}

export function pauseMenu(s: GameState, settings: Settings): string {
  return `<div class="modal-card small-card" role="dialog" aria-modal="true" aria-label="Menu">
    <header role="group"><h2>${t('⏸ Paused')}</h2><button class="ghost" data-action="closeModal" aria-label="Close">✕</button></header>
    <p class="muted">${s.sandbox ? `Sandbox: ${e(SANDBOX_FLOORS[s.sandbox.floor].name)}, day ${sandboxDays(s)}` : `Chapter ${CHAPTERS[s.chapter].number}: ${e(CHAPTERS[s.chapter].title)}`} · ${DIFFICULTIES[s.difficulty].emoji} ${e(DIFFICULTIES[s.difficulty].name)}</p>
    <div class="stack">
      <button class="primary" data-action="closeModal">${t('Resume')}</button>
      ${s.visit ? `<button data-action="abandonVisit">✈️ ${t('Come back early')}</button>` : `<button data-action="restart">${t('Restart chapter')}</button>`}
      <button data-action="copyCode">📋 ${t('Copy hand-over code')}</button>
      <button data-action="quit">${t('Save & quit to menu')}</button>
    </div>
    ${handbookSection(s.features)}
    ${settingsForm(settings)}
    <p class="muted small version">DataCenterMania v${APP_VERSION}</p>
    <p class="muted small">Keys: Space pause · 1/2/3 speed · H heat map · P power map · Esc close</p>
  </div>`;
}

export interface EndExtras {
  newAchievements: string[];
  share?: string;
  newBest?: boolean;
}

export function sandboxEnd(s: GameState, extras: EndExtras): string {
  const score = sandboxScore(s);
  return `<div class="modal-card end lost" role="dialog" aria-modal="true">
    <h2>♾️ Sandbox over</h2>
    <p class="muted">${e(s.log.filter((l) => l.kind === 'fail').slice(-1)[0]?.text ?? 'The data center closed its doors.')}</p>
    <div class="big-stars">${sandboxDays(s)} days</div>
    <div class="report">
      <span>Score</span><b>${score.toLocaleString('en-US')}</b>
      <span>Peak cash</span><b>${money(s.progress.peakCash)}</b>
      <span>Attacks blocked</span><b>${s.cyber.blocked}</b>
      <span>Uptime</span><b>${overallUptimePct(s).toFixed(2)}%</b>
      <span>Incidents fixed</span><b>${s.stats.resolved} / ${s.stats.incidents}</b>
    </div>
    ${extras.newBest ? '<div class="banner info"><span>🏅 <b>New high score!</b></span></div>' : ''}
    ${extras.newAchievements.length ? `<h3>🏆 Unlocked</h3><ul class="list achv-new">${extras.newAchievements
      .map((id) => ACHIEVEMENTS.find((a) => a.id === id)).filter((a): a is NonNullable<typeof a> => !!a)
      .map((a) => `<li class="row"><span class="pi">${a.icon}</span><b>${e(a.name)}</b></li>`).join('')}</ul>` : ''}
    <div class="stack"><button class="primary big" data-action="sandbox">↻ Go again</button><button class="ghost" data-action="quit">Menu</button></div></div>`;
}

export function visitEnd(s: GameState): string {
  const res = visitResult(s);
  return `<div class="modal-card end ${res.stars ? 'won' : 'lost'}" role="dialog" aria-modal="true">
    <h2>✈️ ${t('Site visit over')}</h2>
    <div class="big-stars">${'★'.repeat(res.stars)}${'☆'.repeat(3 - res.stars)}</div>
    <ul class="list goals">${VISIT_OBJECTIVES.map((o, i) => `<li class="row"><span>${i < res.stars ? '✅' : '❌'}</span><span>${e(t(o.label))}</span></li>`).join('')}</ul>
    <div class="report"><span>Uptime</span><b>${res.uptime.toFixed(2)}%</b><span>${t('Critical alarms')}</span><b>${res.criticals}</b><span>${t('Profit')}</span><b class="${res.profit < 0 ? 'neg' : 'pos'}">${money(res.profit)}</b></div>
    <p class="muted small">${t('Stars tune the site up for that many days (fewer incidents), raise its utilisation and win goodwill.')}</p>
    <div class="stack"><button class="primary big" data-action="returnHq">✈️ ${t('Return to headquarters')}</button></div></div>`;
}

export function endScreen(s: GameState, extras: EndExtras = { newAchievements: [] }): string {
  if (s.visit) return visitEnd(s);
  if (s.sandbox) return sandboxEnd(s, extras);
  const ch = CHAPTERS[s.chapter];
  const won = s.progress.status === 'won';
  const status = objectiveStatus(s);
  const next = ch.next ? CHAPTERS[ch.next] : null;
  const profit = s.cash - s.progress.startCash;
  return `<div class="modal-card end ${won ? 'won' : 'lost'}" role="dialog" aria-modal="true">
    <h2>${s.dailyId ? (won ? '🎉 Daily complete!' : '💥 Daily failed') : won ? `🎉 ${ch.event ? 'Event' : 'Chapter'} complete!` : `💥 ${ch.event ? 'Event' : 'Chapter'} failed`}</h2>
    <div class="big-stars">${'★'.repeat(s.progress.stars)}${'☆'.repeat(3 - s.progress.stars)}</div>
    <ul class="list goals">${objectivesFor(s).map((o, i) => `<li class="row"><span>${status[i] ? '✅' : '❌'}</span><span>${e(o.label)}</span></li>`).join('')}</ul>
    <div class="report">
      <span>Uptime</span><b>${overallUptimePct(s).toFixed(2)}%</b>
      <span>Profit</span><b class="${profit < 0 ? 'neg' : 'pos'}">${money(profit)}</b>
      <span>Incidents fixed</span><b>${s.stats.resolved} / ${s.stats.incidents}</b>
      <span>Critical alarms</span><b>${s.stats.criticals}</b>
      <span>Reputation</span><b>${stars(s.reputation)}</b>
    </div>
    ${extras.newAchievements.length ? `<h3>🏆 Unlocked</h3><ul class="list achv-new">${extras.newAchievements
      .map((id) => ACHIEVEMENTS.find((a) => a.id === id))
      .filter((a): a is NonNullable<typeof a> => !!a)
      .map((a) => `<li class="row"><span class="pi">${a.icon}</span><b>${e(a.name)}</b><span class="muted small">${e(a.description)}</span></li>`).join('')}</ul>` : ''}
    ${s.dailyId ? `<div class="banner info"><span>📅 Daily #${dailySpec(s.dailyId).number}${extras.newBest ? ' · <b>new personal best!</b>' : ''}</span>
      <button class="primary" data-action="share">📤 Share result</button></div>
      <pre class="share-text">${e(extras.share ?? '')}</pre>` : ''}
    <div class="stack">
      ${!s.dailyId && won && next ? `<button class="primary big" data-action="newGame" data-chapter="${next.id}">Next: ${e(next.title)} ▶</button>` : ''}
      ${!s.dailyId && won && !next ? '<p>That is all for now, and <b>On-Call Nightmare</b> is unlocked! More chapters (power rooms, generators, cyber villains) are coming.</p>' : ''}
      ${s.dailyId ? '<button data-action="daily">↻ Retry today’s challenge</button>' : `<button data-action="newGame" data-chapter="${ch.id}">↻ Retry</button>`}
      <button class="ghost" data-action="quit">Menu</button>
    </div></div>`;
}

export function tipCard(text: string): string {
  return `<div class="tip-card" role="status"><span class="avatar" aria-hidden="true">🧓</span>
    <div><b>${t('Sam, your mentor')}</b><p>${e(text)}</p></div><button class="primary" data-action="dismissTip">${t('Got it')}</button></div>`;
}

export function difficultyName(id: DifficultyId): string {
  return DIFFICULTIES[id].name;
}

export function dayProgress(s: GameState): number {
  return (s.minute % MINUTES_PER_DAY) / MINUTES_PER_DAY;
}

/** HUD chips: the chapter goal with live progress, and the current shift goal (PRD §21.3). */
export function goalBar(s: GameState): string {
  const ch = CHAPTERS[s.chapter];
  const shown = 0; // the ★ goal, with live progress; the Goals tab lists ★★ and ★★★
  const o = objectivesFor(s)[shown]!;
  const ok = o.check(s);
  const goal = `<button class="chip-btn ${ok ? 'ok' : ''}" data-action="panel" data-panel="goals" title="${e(o.label)}">
    <span class="star">${'★'.repeat(shown + 1)}</span> ${e(o.progress ? o.progress(s) : o.label)} ${ok ? '✓' : ''}</button>`;
  const sh = s.shift;
  const shift = sh
    ? `<span class="chip-btn ${sh.goalFailed ? 'bad' : ''}" title="Shift goal: ${e(sh.goalLabel)}">🕘 ${e(sh.goalLabel)} · ${sh.goalFailed ? '✗ missed' : `+${money(sh.bonus)}`}</span>`
    : '';
  const today = s.today.revenue - s.today.salaries - s.today.rent - s.today.network - s.today.electricity;
  const money$ = `<span class="chip-btn ${today < 0 ? 'bad' : 'ok'}" title="Today so far (credited every hour)">💰 Today ${today >= 0 ? '+' : ''}${money(today)}</span>`;
  const streak = s.streak.hours >= 2 ? `<span class="chip-btn ok" title="Hours in a row with every customer within SLA (best ${s.streak.best}h)">🔥 Streak ${s.streak.hours}h</span>` : '';
  return `${cyberChips(s)}${powerChip(s)}${siteChip(s)}${goal}${shift}${streak}${money$}`;
}

/** A burst of falling pieces for a perfect shift. Pure CSS, deterministic, off for reduced motion and e-ink. */
export function confetti(): string {
  const colors = ['#ffd166', '#5ab4ff', '#3ddc84', '#ef4458', '#bb6bd9', '#ff8a3d'];
  return `<div class="confetti" aria-hidden="true">${Array.from({ length: 30 }, (_, i) =>
    `<i style="--x:${(i * 37) % 100};--c:${colors[i % colors.length]};--d:${(1.8 + ((i * 7) % 10) / 8).toFixed(2)}s;--del:${(((i * 13) % 10) / 12).toFixed(2)}s;--r:${(i * 53) % 360}deg"></i>`).join('')}</div>`;
}

export function shiftReportModal(s: GameState, r: ShiftReport): string {
  const over = s.progress.status !== 'playing';
  return `<div class="modal-card small-card shift-card" role="dialog" aria-modal="true" aria-label="Shift report">${r.stars === 3 ? confetti() : ''}
    <h2>🕙 Shift ${s.shiftReports.indexOf(r) + 1} report</h2>
    <div class="big-stars">${'★'.repeat(r.stars)}${'☆'.repeat(3 - r.stars)}</div>
    <ul class="list goals">
      <li class="row"><span>${r.goalMet ? '✅' : '❌'}</span><span>${e(r.goalLabel)}</span><b>${r.goalMet ? `+${money(r.bonus)}` : ''}</b></li>
      <li class="row"><span>${r.uptimePct >= 99.5 ? '✅' : '❌'}</span><span>Uptime ≥ 99.5% (${r.uptimePct.toFixed(2)}%)</span></li>
      <li class="row"><span>${r.criticals === 0 ? '✅' : '❌'}</span><span>No critical alarm${r.criticals ? ` (${r.criticals})` : ''}</span></li>
    </ul>
    <div class="report"><span>Cash this shift</span><b class="${r.net < 0 ? 'neg' : 'pos'}">${r.net >= 0 ? '+' : ''}${money(r.net)}</b>
      <span>Incidents fixed</span><b>${r.resolved} / ${r.incidents}</b></div>
    ${r.highlights.length ? `<p class="muted small">${r.highlights.map(e).join(' · ')}</p>` : ''}
    ${(s.pendingInfra ?? []).length ? `<p class="muted small">${(s.pendingInfra ?? []).map((p) => `📦 ${t('Arriving')}: ${t(LEAD_TIME[p.kind].name)} · ${Math.max(1, Math.ceil((p.at - s.minute) / 1440))} ${t('day')}`).join(' · ')}</p>` : ''}
    <div class="stack">${over ? '<button class="primary" data-action="closeModal">See results</button>' : `
      <button class="primary big" data-action="sleep">😴 Sleep until 06:00</button>
      <button data-action="closeModal">Keep working through the night</button>`}</div>
    <p class="muted small">Progress saved. A good place to take a break.</p>
  </div>`;
}

export function recapModal(lines: string[], wokeUp: string | null): string {
  return `<div class="modal-card small-card" role="dialog" aria-modal="true" aria-label="Night recap">
    <h2>${wokeUp ? '⏰ Woken up!' : '🌅 Good morning'}</h2>
    ${wokeUp ? `<div class="banner bad">${e(wokeUp)}</div>` : ''}
    <h3>While you slept</h3>
    ${lines.length ? `<ul class="list logs">${lines.map((l) => `<li>${e(l)}</li>`).join('')}</ul>` : '<div class="empty">A quiet night. The servers hummed, nobody called.</div>'}
    <div class="stack"><button class="primary big" data-action="closeModal">${wokeUp ? 'Handle it' : 'Start the shift'}</button></div>
  </div>`;
}

export function requestsSection(s: GameState): string {
  const open = s.walkins.filter((w) => w.status === 'open');
  if (!open.length) return '';
  return `<h3>Customer requests</h3><ul class="list">${open
    .map((w) => {
      const job = s.jobs.find((j) => j.walkinId === w.id);
      return `<li class="walkin"><div class="row"><span>${w.kind === 'crossConnect' ? '🔌' : '🙋'}</span><b>${e(w.text)}</b><span class="chip ok">+${money(w.reward)}</span></div>
        <div class="row meta"><span class="eta">⏱ ${countdown(w.deadline - s.minute)} left</span></div>
        <div class="row actions">${job ? `<span class="busy">🔧 ${e(s.techs.find((t) => t.id === job.techId)?.name ?? 'Queued')}</span>`
          : `<select class="tech-pick" aria-label="Technician">${techOptions(s)}</select><button class="primary" data-action="favor" data-walkin="${e(w.id)}">Send</button>`}</div></li>`;
    })
    .join('')}</ul>`;
}

export function projectsSection(s: GameState): string {
  if (!hasFeature(s, 'projects')) return '';
  return `<h3>Ops projects</h3><p class="muted small">Quiet moment? Invest a technician's time now and every shift after gets easier.</p>
  <ul class="list">${(Object.keys(PROJECTS) as ProjectId[])
    .map((id) => {
      const p = PROJECTS[id];
      const done = s.projects.includes(id);
      const job = s.jobs.find((j) => j.projectId === id);
      return `<li><div class="row"><span class="pi">${p.icon}</span><b>${e(p.name)}</b><span class="muted">${money(p.cost)} · ${countdown(p.workMin)}</span></div>
        <div class="row meta">${e(p.effect)}</div>
        <div class="row actions">${done ? '<span class="chip ok">✓ Done</span>' : job
          ? `<span class="busy">🔧 ${job.stage === 'working' ? `${Math.round(100 * (1 - job.workLeft / Math.max(1, job.workTotal)))}%` : 'on the way'}</span>`
          : `<button class="primary" data-action="project" data-project="${id}" ${s.cash < p.cost ? 'disabled' : ''}>Start</button>`}</div></li>`;
    })
    .join('')}</ul>`;
}

export function careerCard(p: Progress): string {
  const c = careerTitle(p);
  return `<div class="career"><span class="badge-title">🎓 ${e(c.title)}</span>
    <span class="muted small">${c.stars}★ earned${c.next ? ` · ${c.starsToNext > 0 ? `${c.starsToNext}★ to ${e(c.next)}` : `win on 🔥 Nightmare to become ${e(c.next)}`}` : ''}</span></div>`;
}

export function dailyCard(d: DailySpec, best: { stars: number } | null): string {
  const m = DAILY_MODIFIERS[d.modifier];
  return `<div class="daily-card">
    <div class="row"><b>📅 Daily Challenge #${d.number}</b><span class="chip">${m.icon} ${e(m.name)}</span></div>
    <div class="row meta">${e(CHAPTERS[d.chapter].title)} · one shift · ${e(m.description)}</div>
    <div class="row actions">${best ? `<span class="muted">Your best today: ${'★'.repeat(best.stars)}${'☆'.repeat(3 - best.stars)}</span>` : '<span class="muted">Same challenge for everyone today.</span>'}
      <button class="primary" data-action="daily">${best ? 'Play again' : 'Play'}</button></div>
  </div>`;
}

export function sandboxCard(cfg: SandboxConfig, unlocked: boolean, best: { score: number; days: number } | null): string {
  if (!unlocked) return `<div class="daily-card locked"><div class="row"><b>♾️ Sandbox</b><span class="chip">🔒</span></div><div class="row meta">Beat Startup Colo to unlock endless play.</div></div>`;
  const opt = (key: string, value: string | number | boolean, label: string, on: boolean) =>
    `<button class="opt ${on ? 'on' : ''}" data-action="sandboxOpt" data-key="${key}" data-value="${value}" aria-pressed="${on}">${label}</button>`;
  const floors = (Object.keys(SANDBOX_FLOORS) as SandboxFloor[]).map((f) => opt('floor', f, SANDBOX_FLOORS[f].name, cfg.floor === f)).join('');
  return `<details class="daily-card sandbox" ${best ? '' : 'open'}><summary><b>♾️ Sandbox</b> <span class="muted">${best ? `best ${best.score.toLocaleString('en-US')} · ${best.days} days` : 'play until bankruptcy'}</span></summary>
    <div class="opts"><span class="muted small">Floor</span>${floors}</div>
    <div class="opts"><span class="muted small">Cash</span>${([0.5, 1, 2] as const).map((v) => opt('cash', v, `×${v}`, cfg.cash === v)).join('')}</div>
    <div class="opts"><span class="muted small">Incidents</span>${([0.5, 1, 2] as const).map((v) => opt('incidents', v, `×${v}`, cfg.incidents === v)).join('')}</div>
    <div class="opts"><span class="muted small">Hackers</span>${opt('cyber', true, 'On', cfg.cyber)}${opt('cyber', false, 'Off', !cfg.cyber)}
      <span class="muted small">Ramp-up</span>${opt('ramp', true, 'On', cfg.ramp)}${opt('ramp', false, 'Off', !cfg.ramp)}</div>
    <div class="row actions"><span class="muted small">${e(SANDBOX_FLOORS[cfg.floor].blurb)} Score = days survived, peak cash and attacks blocked.</span>
      <button class="primary" data-action="sandbox">Play</button></div></details>`;
}

export function achievementsGrid(unlocked: Record<string, number>): string {
  const n = ACHIEVEMENTS.filter((a) => a.id in unlocked).length;
  return `<details class="achievements"><summary>🏆 Achievements ${n}/${ACHIEVEMENTS.length}</summary>
    <ul class="achv-grid">${ACHIEVEMENTS.map((a) => {
      const got = a.id in unlocked;
      return `<li class="${got ? 'got' : 'locked'}" title="${e(a.description)}"><span class="pi">${got ? a.icon : '🔒'}</span><b>${e(a.name)}</b><span class="small">${e(a.description)}</span></li>`;
    }).join('')}</ul></details>`;
}

export function postMortemCard(s: GameState): string {
  const pm = s.pendingPostMortem;
  if (!pm) return '';
  return `<div class="pm-card" role="status">
    <div class="row"><span>📋</span><b>Post-mortem: ${e(pm.customer)} down ${countdown(pm.minutes)}</b></div>
    <ol class="pm-steps"><li><b>What:</b> outage ${formatClock(pm.from)}–${formatClock(pm.to)}</li><li><b>Why:</b> ${e(pm.cause)}</li><li><b>Prevent:</b> ${e(pm.prevent)}</li></ol>
    <div class="row actions">${pm.remedy ? `<button class="primary" data-action="remedy" data-pm="${e(pm.id)}">${e(pm.remedy.label)}</button>` : ''}
      <button class="ghost" data-action="dismissPm">Got it</button></div>
  </div>`;
}

export function incidentHistory(s: GameState): string {
  if (!s.postMortems.length) return '';
  return `<h3>Incident history</h3><ul class="list">${[...s.postMortems].reverse().map((pm) =>
    `<li><div class="row"><b>${e(pm.customer)}</b><span class="muted">${formatClock(pm.from)} · ${countdown(pm.minutes)}</span></div><div class="row meta">${e(pm.cause)}</div></li>`).join('')}</ul>`;
}

/** Hire a Shift Lead and switch on auto-dispatch (PRD §13, §21.6). */
export function leadSection(s: GameState): string {
  if (!hasFeature(s, 'autodispatch')) return '';
  const lead = s.techs.find((t) => t.role === 'lead');
  if (!lead) {
    return `<h3>Shift Lead</h3><div class="lead-card">
      <span class="avatar">${avatarSvg('lead', 'Shift Lead')}</span>
      <div class="lead-text"><b>Delegate the routine</b>
        <span class="muted small">A Shift Lead sends the best specialist to routine alarms and customer requests while you run the floor. They never touch a rack themselves. ${money(LEAD.salaryPerDay)}/day.</span></div>
      <button class="primary" data-action="hireLead">Hire</button></div>`;
  }
  const sent = s.stats.autoDispatched ?? 0;
  return `<h3>Shift Lead</h3><div class="lead-card">
    <span class="avatar">${avatarSvg('lead', lead.name)}</span>
    <div class="lead-text"><b>${e(lead.name)}</b>
      <span class="muted small">Auto-dispatch is <b>${s.autoDispatch ? 'ON' : 'OFF'}</b>. Alarms wait ${AUTO.reactMin} minutes for you first.${sent ? ` Sent ${sent} so far.` : ''}</span></div>
    <button class="${s.autoDispatch ? '' : 'primary'}" data-action="autoDispatch" data-on="${s.autoDispatch ? '0' : '1'}">${s.autoDispatch ? 'Turn off' : 'Turn on'}</button></div>`;
}
