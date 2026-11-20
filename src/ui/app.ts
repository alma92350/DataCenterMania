import type { Speed } from '../core/time';
import { PARTS } from '../data/catalog';
import { applyCommand, suggestedJob, type Command } from '../sim/commands';
import { step } from '../sim/sim';
import { createGame } from '../sim/state';
import { contractAssignedUnits, contractById, firstFreeSlot, rackById } from '../sim/selectors';
import { tileAt } from '../sim/grid';
import type { GameState, LogEntry, PartId, ServerModelId } from '../sim/types';
import { clampCamera, createCamera, fitCamera, panBy, screenToWorld, zoomAt } from '../render/camera';
import { drawFrame, techColor, type Overlay } from '../render/renderer';
import { Sound } from './audio';
import { effectiveSpeed, minutesToAdvance, shouldAutoPause } from './clock';
import { Persistence, type Settings } from './storage';
import {
  alarmsPanel, contractsPanel, coolerModal, endScreen, goalsPanel, pauseMenu, rackModal, shopPanel, startScreen, tabs,
  teamPanel, tipCard, topBar, visiblePanels, type PanelId,
} from './views';

type Modal = { kind: 'rack'; id: string } | { kind: 'cooler'; id: string } | { kind: 'menu' } | { kind: 'end' } | null;
type BuildMode = { part: Extract<PartId, 'rack' | 'portableAc' | 'wallAc'> } | null;

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
    this.bindInput();
    new ResizeObserver(() => this.resize()).observe($('#stage'));
    this.resize();
    this.showStart();
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------- screens ----------

  private showStart(): void {
    this.state = null;
    this.modal = null;
    document.body.classList.add('at-start');
    this.html('#screen', startScreen(this.store.loadProgress(), this.settings, this.store.loadGame()?.progress.status === 'playing'));
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
    fitCamera(this.cam, s.grid.w, s.grid.h, this.canvas.clientWidth, this.canvas.clientHeight);
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
      if (s.progress.status !== 'playing' && this.modal?.kind !== 'end') this.finish(s);
      drawFrame(this.ctx, s, this.cam, {
        selectedRackId: this.modal?.kind === 'rack' ? this.modal.id : null,
        buildPreview: this.build && this.hover ? { ...this.hover, valid: this.canBuildAt(this.hover.x, this.hover.y) } : null,
        overlay: this.overlay,
        time: t,
      });
      this.uiTimer += dt;
      if (this.uiTimer > 0.25) {
        this.uiTimer = 0;
        this.renderUi();
      }
    }
    requestAnimationFrame((n) => this.frame(n));
  }

  private finish(s: GameState): void {
    this.store.recordResult(s.chapter, s.difficulty, s.progress.status === 'won' ? s.progress.stars : 0);
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
      else if (l.kind === 'story') this.toast(l.text, 'story', 7000);
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
    this.lastHtml.set(sel, content);
    el.innerHTML = content;
  }

  private renderUi(force = false): void {
    const s = this.state;
    if (!s) return;
    if (!visiblePanels(s).includes(this.panel)) this.panel = 'alarms';
    this.html('#topbar', topBar(s, this.speed, effectiveSpeed(this.speed, s, this.settings.nightSkip)), force);
    this.html('#tabs', tabs(s, this.panel), force);
    const panelHtml = { alarms: alarmsPanel, team: teamPanel, contracts: contractsPanel, shop: shopPanel, goals: goalsPanel }[this.panel](s);
    this.html('#panel', panelHtml, force);
    document.body.classList.toggle('sheet-open', this.sheetOpen);
    this.paintTechDots(s);

    let modal = '';
    if (this.modal?.kind === 'rack') modal = rackModal(s, this.modal.id);
    else if (this.modal?.kind === 'cooler') modal = coolerModal(s, this.modal.id);
    else if (this.modal?.kind === 'menu') modal = pauseMenu(s, this.settings);
    else if (this.modal?.kind === 'end') modal = endScreen(s);
    const modalEl = $('#modal');
    const keepInstall = modalEl.querySelector('.install-form') !== null && this.modal?.kind === 'rack';
    if (!keepInstall) this.html('#modal', modal, force);
    modalEl.hidden = modal === '';
    modalEl.classList.toggle('sheetish', this.modal?.kind === 'rack' || this.modal?.kind === 'cooler');

    this.html('#tip', this.tips.length ? tipCard(this.tips[0]!) : '', force);
    this.html('#buildbar', this.build
      ? `<div class="buildbar">Tap a free floor tile to place: <b>${PARTS[this.build.part].name}</b> <button data-action="cancelBuild">Cancel</button></div>`
      : '', force);
  }

  private paintTechDots(s: GameState): void {
    for (const el of document.querySelectorAll<HTMLElement>('[data-tech-color]')) {
      const t = s.techs.find((x) => x.id === el.dataset.techColor);
      if (t) el.style.background = techColor(s, t);
    }
  }

  private toast(text: string, kind: string, ms: number): void {
    const host = $('#toasts');
    const el = document.createElement('div');
    el.className = `toast toast-${kind}`;
    el.textContent = text;
    host.appendChild(el);
    while (host.children.length > 4) host.firstElementChild?.remove();
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
        this.renderUi(true);
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
      case 'restart':
        if (s) this.newGame(s.chapter);
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
        this.store.saveSettings(this.settings);
        return;
      }
    }
    if (!s) return;
    switch (d.action) {
      case 'fix': {
        const alarm = s.alarms.find((a) => a.id === d.alarm);
        const job = alarm && suggestedJob(alarm.kind);
        if (!alarm || !job) return;
        const techId = el.parentElement?.querySelector<HTMLSelectElement>('.tech-pick')?.value ?? 'best';
        this.run({ type: 'dispatch', job, deviceId: alarm.deviceId ?? undefined, rackId: alarm.rackId, techId });
        return;
      }
      case 'openRack':
        this.openRack(d.rack!);
        return;
      case 'dispatchDevice':
        this.run({ type: 'dispatch', job: d.job as 'swapDisk', deviceId: d.device, techId: 'best' });
        return;
      case 'dispatchRack':
        this.run({ type: 'dispatch', job: 'resetBreaker', rackId: d.rack, techId: 'best' });
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
        this.build = { part: d.part as 'rack' };
        this.sheetOpen = false;
        this.renderUi(true);
        return;
      case 'cancelBuild':
        this.build = null;
        this.renderUi(true);
        return;
    }
  }

  private openRack(id: string): void {
    this.modal = { kind: 'rack', id };
    this.renderUi(true);
  }

  // ---------- input ----------

  private bindInput(): void {
    const handler = (ev: Event) => {
      const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (!el) return;
      const isField = el.matches('select, input');
      if (isField !== (ev.type === 'change')) return;
      if (el.matches('button')) ev.preventDefault();
      this.onAction(el, ev);
    };
    document.addEventListener('click', handler);
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
      if (z === 'fit' && this.state) fitCamera(this.cam, this.state.grid.w, this.state.grid.h, c.clientWidth, c.clientHeight);
      else if (z === 'heat') this.overlay = this.overlay === 'heat' ? 'none' : 'heat';
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
        ? this.run({ type: 'buildRack', pos: { x, y }, techId: 'best' })
        : this.run({ type: 'placeCooler', coolerKind: part, pos: { x, y }, techId: 'best' });
      if (ok && s.inventory[part] < 1) this.build = null;
      this.renderUi(true);
      return;
    }
    const rack = s.racks.find((r) => r.pos.x === x && r.pos.y === y);
    if (rack) return this.openRack(rack.id);
    const cooler = s.coolers.find((c) => c.pos.x === x && c.pos.y === y);
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
