/** Hacker Weekend UI (v0.7): attack prompt, the three micro-game screens, results, HUD chips. Pure state -> HTML. */
import { CHAPTERS } from '../data/chapters';
import { KIND_NAME, TAUNTS, VILLAIN_NAME } from '../sim/cyber';
import { Flood, FLOOD, PHISH_COUNT, Phish, WORM, Worm, type MiniGame } from '../sim/minigames';
import type { Attack, AttackKind, GameState } from '../sim/types';
import { formatClock } from '../core/time';
import { countdown, escapeHtml as e } from './format';
import { partSvg, villainSvg } from './icons';

export const GAME_TITLE: Record<AttackKind, string> = { flood: 'Block the Flood', phish: 'Phish or Legit?', worm: 'Cut the Spread' };
const GAME_SECONDS: Record<AttackKind, number> = { flood: 12, phish: 15, worm: 14 };

const STAKES: Record<AttackKind, string> = {
  flood: 'Bot traffic is about to overload your customers. Block the bots, but leave real users alone.',
  phish: 'Three emails land in the team inbox. Every mistake locks a technician out of their account for two hours and lets the worm in.',
  worm: 'A worm is crawling through the network. Quarantine machines before it reaches your racks.',
};

const OFFICE_MACHINES = ['Office PC', 'Printer', 'Coffee machine (IoT)', 'Guest Wi-Fi', 'Smart TV', 'Badge reader'];

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export const tauntOf = (a: Attack): string => TAUNTS[a.villain][hash(a.id) % TAUNTS[a.villain].length]!;

export function attackPrompt(s: GameState): string {
  const a = s.cyber.attack;
  if (!a) return '';
  return `<div class="modal-card attack-card" role="dialog" aria-modal="true" aria-label="Cyber attack">
    <div class="villain"><span class="avatar big">${villainSvg(a.villain)}</span>
      <div><b>${e(VILLAIN_NAME[a.villain])}</b><p class="taunt">“${e(tauntOf(a))}”</p></div></div>
    <h2>🚨 ${e(KIND_NAME[a.kind])}</h2>
    <p>${e(STAKES[a.kind])}</p>
    <div class="stack">
      <button class="primary big" data-action="attackDefend">🛡️ Defend: ${e(GAME_TITLE[a.kind])} (about ${GAME_SECONDS[a.kind]} s)</button>
      <button data-action="attackAuto">⚡ Auto-defend (only half strength)</button>
      <button class="ghost" data-action="attackLater">Later (it keeps waiting ${countdown(a.expiresAt - s.minute)})</button>
    </div></div>`;
}

/** A reminder card at the top of the Alarms tab while an attack is waiting. */
export function attackCard(s: GameState): string {
  const a = s.cyber.attack;
  if (!a) return '';
  return `<div class="pm-card attack-banner" role="status">
    <div class="row"><span class="avatar small">${villainSvg(a.villain)}</span><b>${e(VILLAIN_NAME[a.villain])}: ${e(KIND_NAME[a.kind])}</b><span class="eta">⏱ ${countdown(a.expiresAt - s.minute)}</span></div>
    <div class="row actions"><button class="primary" data-action="attackOpen">Defend</button><button data-action="attackAuto">Auto-defend</button></div></div>`;
}

/** HUD chips: a waiting attack, an active flood. */
export function cyberChips(s: GameState): string {
  let out = '';
  if (s.cyber.attack) out += `<button class="chip-btn bad" data-action="attackOpen">🛡️ ${e(KIND_NAME[s.cyber.attack.kind])}: defend!</button>`;
  if (s.minute < s.floodUntil && s.floodStrength > 0) {
    out += `<span class="chip-btn bad" title="A flood is overloading your customers">🌊 Flood +${Math.round(s.floodStrength * 100)}% traffic · ${countdown(s.floodUntil - s.minute)}</span>`;
  }
  return out;
}

// ---------------------------------------------------------------- micro-game screens

function header(a: Attack, title: string, right: string): string {
  return `<header role="group" class="mini-head"><span class="avatar small">${villainSvg(a.villain)}</span><b>${e(title)}</b><span class="mini-right">${right}</span></header>`;
}

function floodBody(g: Flood): string {
  const visible = g.streams().filter((st) => {
    const age = g.age(st);
    if (age < 0) return false;
    return st.state === 'live' || (st.resolvedAt !== null && g.t - st.resolvedAt < 380);
  });
  const left = Math.max(0, 1 - g.t / FLOOD.durationMs);
  return `<div class="mini flood">
    <div class="mini-hud"><span>Blocked <b>${g.blocked}</b>/${g.botsTotal}</span><span>Innocent <b>${g.mistakes}</b></span><span>Hits <b class="${g.hits ? 'bad' : ''}">${g.hits}</b></span></div>
    <div class="bar"><div style="width:${(left * 100).toFixed(0)}%"></div></div>
    <div class="arena" role="group" aria-label="Incoming traffic">${visible.map((st) => {
      const p = Math.min(1, Math.max(0, g.age(st) / FLOOD.ttlMs));
      const done = st.state !== 'live';
      return `<button class="stream ${st.kind}${done ? ` done ${st.state}` : ''}" data-fast data-action="mgTap" data-id="${st.id}" ${done ? 'disabled tabindex="-1"' : ''} style="left:calc(${st.lane} * 20% + 2%);--p:${p.toFixed(2)}" aria-label="${st.kind === 'bot' ? 'Bot traffic' : 'Real user'}"><span>${st.kind === 'bot' ? 'BOT' : 'USER'}</span></button>`;
    }).join('')}<div class="server-line">Your servers</div></div>
    <p class="muted small">Tap the <b>BOT</b> traffic before it lands. Leave <b>USER</b> traffic alone.</p></div>`;
}

function phishBody(g: Phish): string {
  const mail = g.current();
  const feedback = g.state === 'feedback';
  return `<div class="mini phish">
    <div class="mini-hud"><span>Email <b>${Math.min(g.index + 1, PHISH_COUNT)}</b> of ${PHISH_COUNT}</span><span>Right <b>${g.correct}</b></span></div>
    <div class="mail"><div class="mail-head"><div><span class="muted">From</span> <b>${e(mail.from)}</b></div><div><span class="muted">Subject</span> <b>${e(mail.subject)}</b></div></div><p>${e(mail.body)}</p></div>
    ${feedback ? `<div class="banner ${g.lastCorrect ? 'info' : 'bad'}" role="status"><span>${g.lastCorrect ? '✓ Correct.' : '✗ Not quite.'} ${mail.phish ? 'It was a <b>phish</b>.' : 'It was <b>legit</b>.'} ${e(mail.tell)}</span></div>` : ''}
    <div class="phish-actions">
      <button class="big phish-btn" data-action="mgPhish" data-guess="phish" ${feedback ? 'disabled' : ''}>🎣 Phish!</button>
      <button class="big legit-btn" data-action="mgPhish" data-guess="legit" ${feedback ? 'disabled' : ''}>✅ Legit</button>
    </div></div>`;
}

function nodeName(a: Attack, s: GameState, i: number): string {
  const id = a.payload.rackIds[i] ?? null;
  if (id) return `Rack ${s.racks.findIndex((r) => r.id === id) + 1}`;
  return OFFICE_MACHINES[i % OFFICE_MACHINES.length]!;
}

function wormBody(s: GameState, a: Attack, g: Worm): string {
  const left = Math.max(0, 1 - g.t / WORM.maxMs);
  return `<div class="mini worm">
    <div class="mini-hud"><span>Isolations left <b>${g.isolatesLeft}</b></span><span>Infected <b class="${g.infectedIndexes().length ? 'bad' : ''}">${g.infectedIndexes().length}</b>/${g.nodes.length}</span></div>
    <div class="bar"><div style="width:${(left * 100).toFixed(0)}%"></div></div>
    <div class="worm-net" role="group" aria-label="Network map">
      <svg class="worm-edges" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${g.edges.map(([p, q]) => {
        const hot = g.nodes[p]!.state === 'infected' || g.nodes[q]!.state === 'infected';
        return `<line x1="${g.nodes[p]!.x.toFixed(1)}" y1="${g.nodes[p]!.y.toFixed(1)}" x2="${g.nodes[q]!.x.toFixed(1)}" y2="${g.nodes[q]!.y.toFixed(1)}" class="${hot ? 'hot' : ''}"/>`;
      }).join('')}</svg>
      ${g.nodes.map((n) => {
        const real = a.payload.rackIds[n.id] != null;
        const label = n.state === 'infected' ? 'Infected' : n.state === 'isolated' ? 'Isolated' : 'Tap to isolate';
        return `<button class="node ${n.state}" data-fast data-action="mgNode" data-id="${n.id}" ${n.state !== 'clean' || g.isolatesLeft <= 0 ? 'disabled' : ''} style="left:${n.x.toFixed(1)}%;top:${n.y.toFixed(1)}%" aria-label="${e(nodeName(a, s, n.id))}: ${label}">
          <span class="ico xs">${partSvg(real ? 'server1u' : 'switch')}</span><span class="nm">${e(nodeName(a, s, n.id))}</span><span class="st">${n.state === 'infected' ? '☣' : n.state === 'isolated' ? '🔒' : ''}</span></button>`;
      }).join('')}
    </div>
    <p class="muted small">Tap machines next to the <b>infected</b> ones to <b>isolate</b> them. You can only isolate ${WORM.isolates}.</p></div>`;
}

export function miniGameModal(s: GameState, game: MiniGame): string {
  const a = s.cyber.attack;
  if (!a) return '';
  const body = game.kind === 'flood' ? floodBody(game) : game.kind === 'phish' ? phishBody(game) : wormBody(s, a, game);
  return `<div class="modal-card mini-card" role="dialog" aria-modal="true" aria-label="${e(GAME_TITLE[a.kind])}">
    ${header(a, GAME_TITLE[a.kind], `<button class="ghost" data-action="mgSkip" title="Skip: half-strength auto-defence">Skip ⚡</button>`)}
    ${body}</div>`;
}

export interface MiniOutcome {
  score: number;
  summary: string;
  infected?: number[];
}

export function outcomeOf(s: GameState, game: MiniGame): MiniOutcome {
  if (game.kind === 'flood') {
    return { score: game.score(), summary: `Blocked ${game.blocked} of ${game.botsTotal} bots · ${game.mistakes} real user${game.mistakes === 1 ? '' : 's'} blocked by mistake · ${game.hits} got through.` };
  }
  if (game.kind === 'phish') return { score: game.score(), summary: `${game.correct} of ${PHISH_COUNT} emails judged right.` };
  const infected = game.infectedIndexes();
  const names = infected.map((i) => s.cyber.attack ? nodeName(s.cyber.attack, s, i) : `#${i}`);
  return { score: game.score(), infected, summary: infected.length ? `Infected: ${names.join(', ')}.` : 'Not a single machine infected!' };
}

export function miniResultModal(s: GameState, out: MiniOutcome): string {
  const a = s.cyber.attack;
  const pct = Math.round(out.score * 100);
  const verdict = out.score >= 0.9 ? 'Perfect defence!' : out.score >= 0.7 ? 'Attack blocked!' : out.score >= 0.4 ? 'Partly blocked' : 'The attack got through';
  return `<div class="modal-card small-card mini-result" role="dialog" aria-modal="true" aria-label="Result">
    ${a ? `<span class="avatar big">${villainSvg(a.villain)}</span>` : ''}
    <h2>${out.score >= 0.7 ? '🛡️' : '💥'} ${verdict}</h2>
    <div class="big-stars" aria-hidden="true">${'★'.repeat(Math.round(out.score * 3))}${'☆'.repeat(3 - Math.round(out.score * 3))}</div>
    <p><b>${pct}%</b> · ${e(out.summary)}</p>
    <div class="stack"><button class="primary big" data-action="mgDone">Continue</button></div></div>`;
}

/** The start-screen card for an event such as the Hacker Weekend. */
export function eventCard(id: 'hack', unlocked: boolean, best: number): string {
  const ch = CHAPTERS[id];
  return `<div class="daily-card event-card">
    <div class="row"><b>🕶️ ${e(ch.title)}</b><span class="chip">Event</span></div>
    <div class="row meta">${e(ch.subtitle)} · 2 shifts · 3 micro-games</div>
    <div class="row actions"><span class="muted">${unlocked ? `Best: ${'★'.repeat(best)}${'☆'.repeat(3 - best)}` : '🔒 Beat Startup Colo to unlock'}</span>
      ${unlocked ? `<button class="primary" data-action="newGame" data-chapter="${id}">${best ? 'Play again' : 'Play'}</button>` : ''}</div></div>`;
}

export const when = (minute: number): string => formatClock(minute);
