import type { Speed } from '../core/time';
import { PARTS } from '../data/catalog';
import { applyCommand, suggestedCoolerJob, suggestedJob, type Command, type DispatchJob } from '../sim/commands';
import { step } from '../sim/sim';
import { createGame } from '../sim/state';
import { contractAssignedUnits, contractById, firstFreeSlot, rackById } from '../sim/selectors';
import { tileAt } from '../sim/grid';
import type { Facing, GameState, LogEntry, PartId, ProjectId, ServerModelId, ShiftReport } from '../sim/types';
import { formatClock } from '../core/time';
import { ACHIEVEMENTS, earnedAchievements } from '../sim/achievements';
import { createDaily, dailyIdFor, dailyScore, dailySpec, shareLine } from '../sim/daily';
import { clampCamera, createCamera, panBy, pickNearest, screenToWorld, touchFitCamera, zoomAt } from '../render/camera';
import { drawFrame, techColor, type Overlay } from '../render/renderer';
import { Sound } from './audio';
import { effectiveSpeed, minutesToAdvance, shouldAutoPause } from './clock';
import { Persistence, type Settings } from './storage';
import { browserEnv, resolveEink, shouldRedraw } from './display';
import { morph } from './morph';
import { setMonoIcons } from './icons';
import { spriteVersion } from '../render/sprites';
import {
  alarmsPanel, contractsPanel, coolerModal, endScreen, goalBar, goalsPanel, networkPanel, pauseMenu, rackModal, recapModal, shiftReportModal, shopPanel, startScreen, tabs,
  teamPanel, tipCard, topBar, visiblePanels, type PanelId,
} from './views';

type Modal =
  | { kind: 'rack'; id: string } | { kind: 'cooler'; id: string } | { kind: 'menu' } | { kind: 'end' }
  | { kind: 'shift'; report: ShiftReport } | { kind: 'recap'; lines: string[]; woke: string | null } | null;
type BuildMode = { part: Extract<PartId, 'rack' | 'portableAc' | 'wallAc' | 'crac'>; facing: Facing } | null;

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
};

export class App {
  private state: GameState | null = null;
  private speed: Speed = 1;
  private carry = 0;
  private lastFrame = 0;
  private cam = createCamera(32);
  private overlay: Overlay = 'none';
  private panel: PanelId = 'alarms';
  private sheetOpen = false;
  private modal: Modal = null;
  private build: BuildMode = null;
  private hover: { x: number; y: number } | null = null;
  private tips: string[] = [];
  private seenLog = 0;
  private uiTimer = 0;
  private lastHtml = new Map<string, string>();
  private readonly store = new Persistence();
  private settings: Settings = this.store.loadSettings();
  private readonly sound = new Sound();
  private readonly canvas = $<HTMLCanvasElement>('#map');
  private readonly ctx = this.canvas.getContext('2d')!;
  private pointers = new Map<number, { x: number; y: number }>();
  private drag = { moved: false, startX: 0, startY: 0, pinch: 0 };

  start(): void {
    this.sound.enabled = this.settings.sound;
    this.applyDisplay();
    this.bindInput();
    new ResizeObserver(() => this.resize()).observe($('#stage'));
    this.resize();
    this.showStart();
    requestAnimationFrame((t) => this.frame(t));
  }

  private eink = false;
  private lastDrawKey = '';
  private lastDrawAt = 0;

  /** Switches between the colour UI and the e-ink (Kindle Scribe) UI. */
  private applyDisplay(): void {
    this.eink = resolveEink(this.settings.display, browserEnv());
    setMonoIcons(this.eink);
    document.body.classList.toggle('eink', this.eink);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', this.eink ? '#ffffff' : '#0b0f15');
    this.lastDrawKey = '';
    if (this.eink && this.settings.autoPause === 'critical') this.settings.autoPause = 'major';
    this.renderUi(true);
  }

  // ---------- screens ----------

  private showStart(): void {
    this.state = null;
    this.modal = null;
    document.body.classList.add('at-start');
    const today = dailyIdFor(new Date());
    const best = this.store.loadDaily()[today] ?? null;
    this.html('#screen', startScreen(this.store.loadProgress(), this.settings, this.store.loadGame()?.progress.status === 'playing', {
      daily: dailySpec(today), dailyBest: best, achievements: this.store.loadAchievements(),
    }), true);
  }

  private startGame(s: GameState): void {
    this.state = s;
    this.speed = 1;
    this.carry = 0;
    this.modal = s.progress.status === 'playing' ? null : { kind: 'end' };
    this.build = null;
    this.tips = [];
    this.seenLog = s.logSeq - 1;
    this.panel = 'alarms';
    document.body.classList.remove('at-start');
    this.html('#screen', '');
    this.resize();
    this.fitMap();
    // replay the chapter intro and any tip shown in the first minute
    for (const l of s.log.slice(-3)) if (l.kind === 'story') this.toast(l.text, 'story', 7000);
    this.renderUi(true);
  }

  private newGame(chapter: GameState['chapter']): void {
    this.startGame(createGame(chapter, this.settings.difficulty, (Date.now() ^ (Math.random() * 1e9)) >>> 0));
  }

  // ---------- loop ----------

  private frame(t: number): void {
    const dt = this.lastFrame ? (t - this.lastFrame) / 1000 : 0;
    this.lastFrame = t;
    const s = this.state;
    if (s) {
      const paused = this.modal !== null && this.modal.kind !== 'rack' && this.modal.kind !== 'cooler';
      const tipBlocking = this.tips.length > 0; // Sam talks, the world waits
      const speed = paused || tipBlocking ? 0 : effectiveSpeed(this.speed, s, this.settings.nightSkip);
      const { minutes, carry } = minutesToAdvance(dt, speed, this.carry);
      this.carry = carry;
      for (let i = 0; i < minutes && s.progress.status === 'playing'; i++) {
        step(s);
        if (s.minute % 60 === 0) this.store.saveGame(s);
        if (s.attention) {
          if (shouldAutoPause(s, this.settings.autoPause)) {
            this.speed = 0;
            this.carry = 0;
            this.toast(`⏸ Auto-paused: ${s.attention.text}`, 'alarm', 5000);
          }
          this.sound.alarm(s.attention.severity);
          s.attention = null;
          break;
        }
      }
      this.consumeLog(s);
      if (s.pendingShiftReport) {
        for (const id of this.store.unlockAchievements(earnedAchievements(s, this.store.loadProgress()))) {
          const a = ACHIEVEMENTS.find((x) => x.id === id);
          if (a) this.toast(`🏆 Achievement unlocked: ${a.icon} ${a.name}`, 'success', 6000);
        }
        this.modal = { kind: 'shift', report: s.pendingShiftReport };
        s.pendingShiftReport = null;
        this.store.saveGame(s);
        this.sound.success();
        this.renderUi(true);
      }
      if (s.progress.status !== 'playing' && this.modal?.kind !== 'end' && this.modal?.kind !== 'shift') this.finish(s);
      const view = {
        selectedRackId: this.modal?.kind === 'rack' ? this.modal.id : null,
        buildPreview: this.build && this.hover ? { ...this.hover, valid: this.canBuildAt(this.hover.x, this.hover.y) } : null,
        overlay: this.overlay,
        time: t,
        eink: this.eink,
      };
      const key = [s.minute, this.cam.x, this.cam.y, this.cam.scale, this.overlay, view.selectedRackId, JSON.stringify(view.buildPreview),
        this.canvas.width, this.canvas.height, s.jobs.length, s.alarms.length, spriteVersion()].join('|');
      if (shouldRedraw({ key, lastKey: this.lastDrawKey, now: t, lastDraw: this.lastDrawAt, eink: this.eink })) {
        drawFrame(this.ctx, s, this.cam, view);
        this.lastDrawKey = key;
        this.lastDrawAt = t;
      }
      this.uiTimer += dt;
      if (this.uiTimer > (this.eink ? 1 : 0.25)) {
        this.uiTimer = 0;
        this.renderUi();
      }
    }
    requestAnimationFrame((n) => this.frame(n));
  }

  private endExtras: { newAchievements: string[]; share?: string; newBest?: boolean } = { newAchievements: [] };

  private finish(s: GameState): void {
    let progress = this.store.loadProgress();
    if (s.dailyId) {
      const share = shareLine(s, location.origin + location.pathname);
      const newBest = this.store.recordDaily(s.dailyId, { stars: s.progress.stars, score: dailyScore(s), share });
      this.endExtras = { newAchievements: [], share, newBest };
    } else {
      progress = this.store.recordResult(s.chapter, s.difficulty, s.progress.status === 'won' ? s.progress.stars : 0);
      this.endExtras = { newAchievements: [] };
    }
    this.endExtras.newAchievements = this.store.unlockAchievements(earnedAchievements(s, progress));
    this.store.clearGame();
    this.modal = { kind: 'end' };
    if (s.progress.status === 'won') this.sound.success();
    this.renderUi(true);
  }

  private consumeLog(s: GameState): void {
    const fresh: LogEntry[] = s.log.filter((l) => l.id > this.seenLog);
    if (!fresh.length) return;
    this.seenLog = fresh[fresh.length - 1]!.id;
    for (const l of fresh) {
      if (l.kind === 'tip') this.tips.push(l.text);
      else if (l.kind === 'story') this.toast(l.text, 'story', window.matchMedia('(max-width: 820px)').matches ? 4500 : 7000);
      else if (l.kind === 'fail' || l.kind === 'success') this.toast(l.text, l.kind, 4500);
      else if (l.kind === 'money' && l.text.startsWith('Day')) {
        this.toast(l.text, 'money', 6000);
        this.sound.cash();
      } else if (l.kind === 'money' && l.text.startsWith('Setup fee')) this.toast(l.text, 'money', 4000);
    }
  }

  // ---------- rendering ----------

  private html(sel: string, content: string, force = false): void {
    if (!force && this.lastHtml.get(sel) === content) return;
    const el = $(sel);
    // never yank a control out from under the player's finger
    if (!force && el.contains(document.activeElement) && document.activeElement?.matches('select, input')) return;
    // ...nor while a finger or mouse button is down on it: the tap must land on the element it started on
    if (!force && this.pressing && el.contains(this.pressing)) return;
    this.lastHtml.set(sel, content);
    morph(el, content);
  }

  /** Element under an active press (touch or mouse), or null. */
  private pressing: Element | null = null;

  private renderUi(force = false): void {
    const s = this.state;
    if (!s) return;
    if (!visiblePanels(s).includes(this.panel)) this.panel = 'alarms';
    this.html('#topbar', topBar(s, this.speed, this.tips.length ? 0 : effectiveSpeed(this.speed, s, this.settings.nightSkip)), force);
    this.html('#tabs', tabs(s, this.panel), force);
    const panelHtml = { alarms: alarmsPanel, team: teamPanel, contracts: contractsPanel, network: networkPanel, shop: shopPanel, goals: goalsPanel }[this.panel](s);
    this.html('#panel', panelHtml, force);
    document.body.classList.toggle('sheet-open', this.sheetOpen);
    this.paintTechDots(s);

    let modal = '';
    if (this.modal?.kind === 'rack') modal = rackModal(s, this.modal.id);
    else if (this.modal?.kind === 'cooler') modal = coolerModal(s, this.modal.id);
    else if (this.modal?.kind === 'menu') modal = pauseMenu(s, this.settings);
    else if (this.modal?.kind === 'end') modal = endScreen(s, this.endExtras);
    else if (this.modal?.kind === 'shift') modal = shiftReportModal(s, this.modal.report);
    else if (this.modal?.kind === 'recap') modal = recapModal(this.modal.lines, this.modal.woke);
    const modalEl = $('#modal');
    const keepInstall = modalEl.querySelector('.install-form') !== null && this.modal?.kind === 'rack';
    if (!keepInstall) this.html('#modal', modal, force);
    modalEl.hidden = modal === '';
    modalEl.classList.toggle('sheetish', this.modal?.kind === 'rack' || this.modal?.kind === 'cooler');

    this.html('#goalbar', goalBar(s), force);
    this.html('#tip', this.tips.length ? tipCard(this.tips[0]!) : '', force);
    this.html('#buildbar', this.build
      ? `<div class="buildbar">Tap a free floor tile: <b>${PARTS[this.build.part].name}</b>
          ${this.build.part === 'rack' && s.features.includes('aisles') ? `<button data-action="buildFacing">Front ${this.build.facing === 'S' ? '⬇️ south' : '⬆️ north'}</button>` : ''}
          <button data-action="cancelBuild">Cancel</button></div>`
      : '', force);
  }

  private paintTechDots(s: GameState): void {
    for (const el of document.querySelectorAll<HTMLElement>('[data-tech-color]')) {
      const t = s.techs.find((x) => x.id === el.dataset.techColor);
      if (t) el.style.borderColor = techColor(s, t);
    }
  }

  private toast(text: string, kind: string, ms: number): void {
    const host = $('#toasts');
    const el = document.createElement('div');
    el.className = `toast toast-${kind}`;
    el.textContent = text;
    host.appendChild(el);
    const max = window.matchMedia('(max-width: 820px)').matches ? 2 : 4;
    while (host.children.length > max) host.firstElementChild?.remove();
    if (this.eink) ms *= 1.5;
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 400);
    }, ms);
  }

  // ---------- commands ----------

  private run(cmd: Command): boolean {
    const s = this.state;
    if (!s) return false;
    const res = applyCommand(s, cmd);
    if (!res.ok) this.toast(res.error, 'fail', 3500);
    else this.sound.click();
    this.consumeLog(s);
    this.renderUi(true);
    return res.ok;
  }

  private canBuildAt(x: number, y: number): boolean {
    const s = this.state;
    if (!s) return false;
    const blocked = [...s.racks, ...s.coolers].some((o) => o.pos.x === x && o.pos.y === y);
    return tileAt(s.grid, x, y) === 'floor' && !blocked;
  }

  private onAction(el: HTMLElement, ev: Event): void {
    const d = el.dataset;
    const s = this.state;
    this.sound.unlock();
    switch (d.action) {
      case 'speed':
        this.speed = Number(d.speed) as Speed;
        this.renderUi(true);
        return;
      case 'panel': {
        const p = d.panel as PanelId;
        this.sheetOpen = this.panel === p ? !this.sheetOpen : true;
        this.panel = p;
        this.renderUi(true);
        return;
      }
      case 'menu':
        this.modal = { kind: 'menu' };
        this.renderUi(true);
        return;
      case 'closeModal':
        this.modal = null;
        if (this.state && this.state.progress.status !== 'playing') this.finish(this.state);
        this.renderUi(true);
        return;
      case 'sleep':
        this.sleep();
        return;
      case 'dismissTip':
        this.tips.shift();
        this.renderUi(true);
        return;
      case 'difficulty':
        this.settings.difficulty = d.difficulty as Settings['difficulty'];
        this.store.saveSettings(this.settings);
        this.showStart();
        return;
      case 'newGame':
        this.newGame(d.chapter as GameState['chapter']);
        return;
      case 'continue': {
        const saved = this.store.loadGame();
        if (saved) this.startGame(saved);
        return;
      }
      case 'daily':
        this.startGame(createDaily(dailyIdFor(new Date())));
        return;
      case 'share': {
        const text = this.endExtras.share ?? '';
        const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> };
        if (nav.share) nav.share({ text }).catch(() => {});
        else navigator.clipboard?.writeText(text).then(() => this.toast('Result copied: paste it anywhere!', 'success', 3000), () => {});
        return;
      }
      case 'restart':
        if (s?.dailyId) this.startGame(createDaily(s.dailyId));
        else if (s) this.newGame(s.chapter);
        return;
      case 'quit':
        if (s && s.progress.status === 'playing') this.store.saveGame(s);
        this.showStart();
        return;
      case 'setting': {
        const input = el as HTMLInputElement;
        const key = d.key as keyof Settings;
        if (ev.type !== 'change') return;
        if (key === 'autoPause') this.settings.autoPause = input.value as Settings['autoPause'];
        if (key === 'nightSkip') this.settings.nightSkip = input.checked;
        if (key === 'sound') this.settings.sound = this.sound.enabled = input.checked;
        if (key === 'display') {
          this.settings.display = input.value as Settings['display'];
          this.applyDisplay();
        }
        this.store.saveSettings(this.settings);
        return;
      }
    }
    if (!s) return;
    switch (d.action) {
      case 'fix': {
        const alarm = s.alarms.find((a) => a.id === d.alarm);
        if (!alarm) return;
        const techId = el.parentElement?.querySelector<HTMLSelectElement>('.tech-pick')?.value ?? 'best';
        const coolerJob = suggestedCoolerJob(alarm.kind);
        if (coolerJob && alarm.coolerId) {
          this.run({ type: coolerJob, coolerId: alarm.coolerId, techId });
          return;
        }
        const job = suggestedJob(alarm.kind);
        if (!job) return;
        this.run({
          type: 'dispatch', job, deviceId: alarm.deviceId ?? undefined, rackId: alarm.rackId ?? undefined,
          uplinkId: alarm.uplinkId ?? undefined, techId,
        });
        return;
      }
      case 'openRack':
        this.openRack(d.rack!);
        return;
      case 'dispatchDevice':
        this.run({ type: 'dispatch', job: d.job as 'swapDisk', deviceId: d.device, techId: 'best' });
        return;
      case 'dispatchRack':
        this.run({ type: 'dispatch', job: (d.job ?? 'resetBreaker') as DispatchJob, rackId: d.rack, techId: 'best' });
        return;
      case 'dispatchUplink':
        this.run({ type: 'dispatch', job: 'repairUplink', uplinkId: d.uplink, techId: 'best' });
        return;
      case 'coolerJob':
        this.run({ type: d.job as 'serviceCooler' | 'repairCooler', coolerId: d.cooler!, techId: 'best' });
        return;
      case 'openCooler':
        this.modal = { kind: 'cooler', id: d.cooler! };
        this.renderUi(true);
        return;
      case 'buyUplink':
        this.run({ type: 'buyUplink' });
        return;
      case 'buildFacing':
        if (this.build) this.build.facing = this.build.facing === 'S' ? 'N' : 'S';
        this.renderUi(true);
        return;
      case 'assign':
        if (ev.type === 'change') this.run({ type: 'assign', deviceId: d.device!, contractId: (el as HTMLSelectElement).value || null });
        return;
      case 'power':
        this.run({ type: 'setPower', deviceId: d.device!, on: d.on === '1' });
        return;
      case 'cooler':
        this.run({ type: 'toggleCooler', coolerId: d.cooler!, on: d.on === '1' });
        return;
      case 'installForm': {
        const tpl = document.querySelector<HTMLTemplateElement>('#install-form');
        const li = el.closest('li');
        if (!tpl || !li) return;
        document.querySelectorAll('.install-form').forEach((f) => f.remove());
        const form = tpl.content.firstElementChild!.cloneNode(true) as HTMLElement;
        form.dataset.rack = d.rack;
        form.dataset.slot = d.slot;
        li.appendChild(form);
        return;
      }
      case 'install': {
        const form = el.closest<HTMLElement>('.install-form');
        if (!form) return;
        const model = form.querySelector<HTMLSelectElement>('#install-model')!.value as ServerModelId;
        const rack = rackById(s, form.dataset.rack ?? null);
        if (!rack) return;
        // install at the first slot of the chosen gap that fits the model
        const from = Number(form.dataset.slot);
        let slot: number | null = from;
        const u = model === 'server2u' ? 2 : 1;
        const fits = (x: number) => x + u <= rack.capacityU && s.devices.every((dv) => dv.rackId !== rack.id || x + u <= dv.slot || x >= dv.slot + (dv.model === 'server2u' ? 2 : 1));
        if (!fits(from)) slot = firstFreeSlot(s, rack, u);
        if (slot === null) {
          this.toast('No room for that server in this rack.', 'fail', 3000);
          return;
        }
        form.remove();
        this.run({
          type: 'install', rackId: rack.id, slot, model,
          contractId: form.querySelector<HTMLSelectElement>('#install-contract')!.value || null,
          techId: form.querySelector<HTMLSelectElement>('#install-tech')!.value || 'best',
        });
        return;
      }
      case 'hire':
        this.run({ type: 'hire', candidateId: d.candidate! });
        return;
      case 'favor': {
        const techId = el.parentElement?.querySelector<HTMLSelectElement>('.tech-pick')?.value ?? 'best';
        this.run({ type: 'dispatch', job: 'favor', walkinId: d.walkin, techId });
        return;
      }
      case 'dismissPm':
        if (s.pendingPostMortem) s.pendingPostMortem = null;
        this.renderUi(true);
        return;
      case 'remedy': {
        const pm = s.postMortems.find((x) => x.id === d.pm);
        if (pm?.remedy && this.run(pm.remedy.cmd)) s.pendingPostMortem = null;
        this.renderUi(true);
        return;
      }
      case 'project':
        this.run({ type: 'startProject', project: d.project as ProjectId });
        return;
      case 'fire':
        this.run({ type: 'fire', techId: d.tech! });
        return;
      case 'accept':
        this.run({ type: 'acceptContract', contractId: d.contract! });
        return;
      case 'decline':
        this.run({ type: 'declineContract', contractId: d.contract! });
        return;
      case 'autoAssign': {
        const c = contractById(s, d.contract ?? null);
        if (!c) return;
        let assigned = contractAssignedUnits(s, c.id);
        const free = s.devices.filter((dv) => dv.contractId === null && dv.poweredOn);
        if (!free.length) {
          this.toast('No free servers. Install more from the rack view (tap a rack).', 'fail', 4000);
          return;
        }
        for (const dv of free) {
          if (assigned >= c.units + 1) break; // one spare unit of headroom
          applyCommand(s, { type: 'assign', deviceId: dv.id, contractId: c.id });
          assigned += dv.model === 'server2u' ? 2 : 1;
        }
        this.renderUi(true);
        return;
      }
      case 'order':
        this.run({ type: 'order', part: d.part as PartId, qty: Number(d.qty) });
        return;
      case 'build':
        this.build = { part: d.part as 'rack', facing: 'S' };
        this.sheetOpen = false;
        this.renderUi(true);
        return;
      case 'cancelBuild':
        this.build = null;
        this.renderUi(true);
        return;
    }
  }

  /** Fast-forwards the night; a critical alarm wakes the player early (PRD §21.1). */
  private sleep(): void {
    const s = this.state;
    if (!s) return;
    const from = s.logSeq;
    let woke: string | null = null;
    s.attention = null;
    for (let i = 0; i < 1440 && s.progress.status === 'playing' && !s.shift; i++) {
      step(s);
      const att = s.attention as GameState['attention']; // step() may raise one
      if (att && att.severity >= 3) {
        woke = `${formatClock(s.minute)}: ${att.text}`;
        s.attention = null;
        break;
      }
      s.attention = null;
    }
    const lines = s.log
      .filter((l) => l.id >= from && (l.kind === 'success' || l.kind === 'fail' || l.kind === 'alarm' || l.kind === 'story'))
      .map((l) => `${formatClock(l.minute)} ${l.text}`)
      .slice(-12);
    this.seenLog = s.logSeq - 1;
    this.store.saveGame(s);
    this.modal = s.progress.status === 'playing' ? { kind: 'recap', lines, woke } : null;
    this.speed = 1;
    this.renderUi(true);
  }

  /** Fit the map, but never below a finger-friendly tile size on small screens; centre on the racks. */
  private fitMap(): void {
    const s = this.state;
    if (!s) return;
    const items = [...s.racks, ...s.coolers].map((o) => o.pos);
    const focus = items.length
      ? { x0: Math.min(...items.map((p) => p.x)), y0: Math.min(...items.map((p) => p.y)), x1: Math.max(...items.map((p) => p.x)), y1: Math.max(...items.map((p) => p.y)) }
      : { x0: 0, y0: 0, x1: s.grid.w - 1, y1: s.grid.h - 1 };
    const touch = window.matchMedia('(pointer: coarse)').matches;
    touchFitCamera(this.cam, s.grid.w, s.grid.h, this.canvas.clientWidth, this.canvas.clientHeight, focus, touch ? 30 : 12);
    this.clamp();
  }

  private openRack(id: string): void {
    this.modal = { kind: 'rack', id };
    this.renderUi(true);
  }

  // ---------- input ----------

  private bindInput(): void {
    const handler = (ev: Event) => {
      if (ev.type === 'click') this.pressing = null; // the press completed: refreshes may resume
      const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (!el) return;
      const isField = el.matches('select, input');
      if (isField !== (ev.type === 'change')) return;
      if (el.matches('button')) ev.preventDefault();
      this.onAction(el, ev);
    };
    document.addEventListener('click', handler);
    document.addEventListener('pointerdown', (ev) => (this.pressing = ev.target as Element), { capture: true, passive: true });
    const release = () => setTimeout(() => (this.pressing = null), 0);
    document.addEventListener('pointerup', release, { capture: true, passive: true });
    document.addEventListener('pointercancel', release, { capture: true, passive: true });
    document.addEventListener('change', handler);
    $('#modal').addEventListener('click', (ev) => {
      if (ev.target === ev.currentTarget && this.modal?.kind !== 'end') {
        this.modal = null;
        this.renderUi(true);
      }
    });

    document.addEventListener('keydown', (ev) => {
      if (!this.state || (ev.target as HTMLElement).matches('input, select, textarea')) return;
      const keys: Record<string, () => void> = {
        ' ': () => (this.speed = this.speed === 0 ? 1 : 0),
        '1': () => (this.speed = 1),
        '2': () => (this.speed = 2),
        '3': () => (this.speed = 4),
        h: () => (this.overlay = this.overlay === 'heat' ? 'none' : 'heat'),
        p: () => (this.overlay = this.overlay === 'power' ? 'none' : 'power'),
        Escape: () => {
          if (this.build) this.build = null;
          else if (this.modal?.kind !== 'end') this.modal = null;
        },
      };
      const fn = keys[ev.key];
      if (fn) {
        ev.preventDefault();
        fn();
        this.renderUi(true);
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state?.progress.status === 'playing') {
        this.store.saveGame(this.state);
        this.speed = 0;
      }
    });

    const c = this.canvas;
    c.addEventListener('pointerdown', (ev) => {
      this.sound.unlock();
      c.setPointerCapture(ev.pointerId);
      this.pointers.set(ev.pointerId, { x: ev.offsetX, y: ev.offsetY });
      if (this.pointers.size === 1) this.drag = { moved: false, startX: ev.offsetX, startY: ev.offsetY, pinch: 0 };
      if (this.pointers.size === 2) this.drag.pinch = this.pinchDistance();
    });
    c.addEventListener('pointermove', (ev) => {
      if (this.state) {
        const w = screenToWorld(this.cam, ev.offsetX, ev.offsetY);
        this.hover = { x: Math.floor(w.x), y: Math.floor(w.y) };
      }
      const prev = this.pointers.get(ev.pointerId);
      if (!prev) return;
      this.pointers.set(ev.pointerId, { x: ev.offsetX, y: ev.offsetY });
      if (this.pointers.size === 1) {
        if (Math.hypot(ev.offsetX - this.drag.startX, ev.offsetY - this.drag.startY) > 6) this.drag.moved = true;
        if (this.drag.moved) panBy(this.cam, ev.offsetX - prev.x, ev.offsetY - prev.y);
      } else if (this.pointers.size === 2) {
        this.drag.moved = true;
        const dist = this.pinchDistance();
        const [a, b] = [...this.pointers.values()];
        if (this.drag.pinch > 0 && a && b) zoomAt(this.cam, dist / this.drag.pinch, (a.x + b.x) / 2, (a.y + b.y) / 2);
        this.drag.pinch = dist;
      }
      this.clamp();
    });
    const up = (ev: PointerEvent) => {
      const wasTap = this.pointers.size === 1 && !this.drag.moved;
      this.pointers.delete(ev.pointerId);
      if (wasTap && ev.type === 'pointerup') this.tap(ev.offsetX, ev.offsetY);
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('pointerleave', () => (this.hover = null));
    c.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      zoomAt(this.cam, Math.exp(-ev.deltaY * 0.0015), ev.offsetX, ev.offsetY);
      this.clamp();
    }, { passive: false });
    $('#zoom').addEventListener('click', (ev) => {
      const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-zoom]');
      if (!b) return;
      const z = b.dataset.zoom;
      if (z === 'fit' && this.state) this.fitMap();
      else if (z === 'heat') this.overlay = this.overlay === 'none' ? 'heat' : this.overlay === 'heat' && this.state?.features.includes('power') ? 'power' : 'none';
      else if (z === 'power') this.overlay = this.overlay === 'power' ? 'none' : 'power';
      else zoomAt(this.cam, z === 'in' ? 1.25 : 0.8, c.clientWidth / 2, c.clientHeight / 2);
      b.closest('#zoom')?.querySelectorAll('[data-zoom="heat"],[data-zoom="power"]').forEach((x) =>
        x.classList.toggle('on', (x as HTMLElement).dataset.zoom === this.overlay));
      this.clamp();
    });
  }

  private pinchDistance(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  private clamp(): void {
    if (this.state) clampCamera(this.cam, this.state.grid.w, this.state.grid.h, this.canvas.clientWidth, this.canvas.clientHeight);
  }

  private tap(sx: number, sy: number): void {
    const s = this.state;
    if (!s) return;
    const w = screenToWorld(this.cam, sx, sy);
    const x = Math.floor(w.x);
    const y = Math.floor(w.y);
    if (this.build) {
      const part = this.build.part;
      const ok = part === 'rack'
        ? this.run({ type: 'buildRack', pos: { x, y }, facing: this.build.facing, techId: 'best' })
        : this.run({ type: 'placeCooler', coolerKind: part, pos: { x, y }, techId: 'best' });
      if (ok && s.inventory[part] < 1) this.build = null;
      this.renderUi(true);
      return;
    }
    // forgiving taps: anything within about a tile of the finger counts
    const reach = Math.max(0.75, 22 / this.cam.scale);
    const rack = pickNearest(s.racks, w, reach);
    const cooler = pickNearest(s.coolers, w, reach);
    const rd = rack ? Math.hypot(rack.pos.x + 0.5 - w.x, rack.pos.y + 0.5 - w.y) : Infinity;
    const cd = cooler ? Math.hypot(cooler.pos.x + 0.5 - w.x, cooler.pos.y + 0.5 - w.y) : Infinity;
    if (rack && rd <= cd) return this.openRack(rack.id);
    if (cooler) {
      this.modal = { kind: 'cooler', id: cooler.id };
      this.renderUi(true);
      return;
    }
    if (this.modal) {
      this.modal = null;
      this.renderUi(true);
    }
  }

  private resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.clamp();
  }
}
