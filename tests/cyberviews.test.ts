import { createGame } from '../src/sim/state';
import { launchAttack } from '../src/sim/cyber';
import { createFlood, createPhish, createWorm } from '../src/sim/minigames';
import { attackCard, attackPrompt, cyberChips, eventCard, miniGameModal, miniResultModal, outcomeOf } from '../src/ui/cyberViews';
import { alarmsPanel, goalBar, startScreen } from '../src/ui/views';
import { DEFAULT_SETTINGS } from '../src/ui/storage';
import { dailySpec } from '../src/sim/daily';
import type { AttackKind, GameState } from '../src/sim/types';

function attacked(kind: AttackKind): GameState {
  const s = createGame('hack', 'sysadmin', 1);
  launchAttack(s, kind);
  return s;
}

describe('attack prompt', () => {
  it.each(['flood', 'phish', 'worm'] as AttackKind[])('names the villain, the stakes and offers three ways out (%s)', (kind) => {
    const s = attacked(kind);
    const html = attackPrompt(s);
    expect(html).toContain(kind === 'phish' ? 'Captain Phish' : 'Script Kiddies');
    expect(html).toContain('data-action="attackDefend"');
    expect(html).toContain('data-action="attackAuto"');
    expect(html).toContain('data-action="attackLater"');
    expect(html).toContain('half strength');
    expect(html).not.toMatch(/undefined|NaN/);
  });

  it('a waiting attack shows as a card, a HUD chip and an Alarms-tab reminder; nothing when quiet', () => {
    const quiet = createGame('hack', 'sysadmin', 1);
    expect(attackCard(quiet)).toBe('');
    expect(cyberChips(quiet)).toBe('');
    const s = attacked('flood');
    expect(attackCard(s)).toContain('data-action="attackOpen"');
    expect(cyberChips(s)).toContain('defend!');
    expect(goalBar(s)).toContain('defend!');
    expect(alarmsPanel(s)).toContain('Script Kiddies');
    s.cyber.attack = null;
    s.floodUntil = s.minute + 60;
    s.floodStrength = 0.45;
    expect(cyberChips(s)).toContain('+45% traffic');
  });
});

describe('micro-game screens (touch friendly)', () => {
  it('flood: bot and user streams are big tap targets handled on pointer-down', () => {
    const s = attacked('flood');
    const g = createFlood(s.cyber.attack!.payload.seed);
    g.tick(1500);
    const html = miniGameModal(s, g);
    expect(html).toContain('data-action="mgTap"');
    expect(html).toContain('data-fast');
    expect(html).toMatch(/BOT/);
    expect(html).toContain('data-action="mgSkip"');
    expect(html).not.toMatch(/undefined|NaN/);
    // resolved streams are disabled, never tappable twice
    const live = g.streams().find((x) => x.state === 'live' && g.age(x) >= 0)!;
    g.tap(live.id);
    expect(miniGameModal(s, g)).toContain('disabled');
  });

  it('phish: two big answer buttons, then feedback that teaches', () => {
    const s = attacked('phish');
    const g = createPhish(s.cyber.attack!.payload.seed);
    let html = miniGameModal(s, g);
    expect(html).toContain('data-guess="phish"');
    expect(html).toContain('data-guess="legit"');
    expect(html).toContain('From');
    g.answer(g.current().phish);
    html = miniGameModal(s, g);
    expect(html).toContain('Correct');
    expect(html).toContain('disabled');
  });

  it('worm: a node per machine, racks and office machines, with an isolation budget', () => {
    const s = createGame('ch2', 'sysadmin', 1); // a small floor: racks are padded with office machines
    s.features.push('cyber');
    launchAttack(s, 'worm');
    const g = createWorm(s.cyber.attack!.payload.seed, s.cyber.attack!.payload.rackIds.length);
    const html = miniGameModal(s, g);
    expect((html.match(/data-action="mgNode"/g) ?? []).length).toBe(g.nodes.length);
    expect(html).toContain('Isolations left');
    expect(html).toMatch(/Rack \d/);
    expect(html).toMatch(/Office PC|Printer|Coffee machine|Guest Wi-Fi|Smart TV|Badge reader/);
    expect(html).toContain('infected');
  });

  it('results summarise the game and carry the score to the command', () => {
    const s = attacked('flood');
    const g = createFlood(1);
    g.tick(20000);
    const out = outcomeOf(s, g);
    expect(out.score).toBe(0);
    expect(out.summary).toContain('got through');
    const html = miniResultModal(s, out);
    expect(html).toContain('data-action="mgDone"');
    expect(html).toContain('The attack got through');
    const w = createWorm(2, 7);
    w.tick(20000);
    expect(outcomeOf(attacked('worm'), w).infected?.length).toBeGreaterThan(0);
  });
});

describe('start screen', () => {
  it('shows the Hacker Weekend card, locked until Startup Colo is beaten', () => {
    const extras = { daily: dailySpec('2026-12-03'), dailyBest: null, achievements: {} };
    expect(startScreen({}, DEFAULT_SETTINGS, false, extras)).toContain('Hacker Weekend');
    expect(startScreen({}, DEFAULT_SETTINGS, false, extras)).not.toContain('data-chapter="hack"');
    expect(startScreen({ ch2: { sysadmin: 1 } }, DEFAULT_SETTINGS, false, extras)).toContain('data-chapter="hack"');
    expect(eventCard('hack', true, 2)).toContain('★★☆');
  });
});
