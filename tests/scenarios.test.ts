// @vitest-environment happy-dom
import { at } from '../src/core/time';
import { CHAPTERS, CHAPTER_ORDER, EVENT_ORDER, SCENARIO_BASE, SCENARIO_ORDER } from '../src/data/chapters';
import { advance } from '../src/sim/sim';
import { createGame } from '../src/sim/state';
import { FR } from '../src/ui/i18n';
import { isUnlocked } from '../src/ui/storage';
import { scenariosSection } from '../src/ui/views';
import { measure } from './engagement';

describe('Incident Replays (v3.0)', () => {
  it('are events, not part of the campaign, two days long, with three goals each', () => {
    for (const id of SCENARIO_ORDER) {
      const ch = CHAPTERS[id];
      expect(ch.event).toBe(true);
      expect(CHAPTER_ORDER).not.toContain(id);
      expect(EVENT_ORDER).not.toContain(id);
      expect(ch.objectives.length).toBe(3);
      expect(ch.endMinute - ch.startMinute).toBeLessThanOrEqual(2 * 1440);
      expect(ch.events!.length).toBeGreaterThan(2);
    }
  });

  it('unlock when the chapter they replay is won', () => {
    for (const id of SCENARIO_ORDER) {
      expect(isUnlocked({}, id)).toBe(false);
      expect(isUnlocked({ [SCENARIO_BASE[id]]: { sysadmin: 1 } }, id)).toBe(true);
    }
  });

  it('run their scripted incidents', () => {
    const a = createGame('sc1', 'sysadmin', 1);
    advance(a, at(0, 15) - a.minute);
    expect(a.log.some((l) => l.text.includes('A feed on Rack 1'))).toBe(true);
    expect(a.log.some((l) => l.text.includes('utility drops out'))).toBe(true);
    const c = createGame('sc3', 'sysadmin', 1);
    advance(c, at(0, 11) - c.minute);
    expect(c.ambient).toBeGreaterThan(40);
    expect(c.site).toBeDefined();
  });

  it('are winnable by the bot but never a three-star walk-over', () => {
    for (const id of SCENARIO_ORDER) {
      let wins = 0;
      let threes = 0;
      for (const seed of [1, 2, 3]) {
        const m = measure(id, seed, 'sysadmin', false, 'auto').state;
        if (m.progress.status === 'won') wins++;
        if (m.progress.stars === 3) threes++;
      }
      expect([id, wins >= 2]).toEqual([id, true]);
      expect([id, threes]).toEqual([id, 0]);
    }
  }, 300000);

  it('show on the start screen, locked or playable, and every text has French', () => {
    const locked = scenariosSection({});
    expect(locked).toContain('🔒');
    expect(locked).not.toContain('data-action="newGame"');
    const open = scenariosSection({ ch5: { sysadmin: 1 }, ch6: { sysadmin: 3 }, ch7: { sysadmin: 1 } });
    for (const id of SCENARIO_ORDER) expect(open).toContain(`data-chapter="${id}"`);
    for (const id of SCENARIO_ORDER) {
      const ch = CHAPTERS[id];
      for (const text of [ch.title, ch.subtitle, ch.intro, ...ch.objectives.map((o) => o.label)]) expect([text, text in FR]).toEqual([text, true]);
      for (const e of ch.events ?? []) for (const act of e.actions) if ('text' in act && act.text) expect([act.text, act.text in FR]).toEqual([act.text, true]);
    }
  });
});
