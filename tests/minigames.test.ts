import { createFlood, createPhish, createWorm, FLOOD, WORM, PHISH_COUNT } from '../src/sim/minigames';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

/** Runs a flood game with a player who taps every live bot after `reactMs`. */
function playFlood(seed: number, reactMs: number | null, tapLegit = false) {
  const g = createFlood(seed);
  let guard = 0;
  while (!g.over && guard++ < 2000) {
    g.tick(50);
    if (reactMs !== null) {
      for (const st of g.streams()) {
        if (st.state === 'live' && g.age(st) >= reactMs && (st.kind === 'bot' || tapLegit)) g.tap(st.id);
      }
    }
  }
  return g;
}

describe('Block the Flood', () => {
  it('is deterministic per seed and has bots and innocent users', () => {
    const a = createFlood(3).streams().map((s) => `${s.lane}${s.kind}${s.spawnAt}`);
    const b = createFlood(3).streams().map((s) => `${s.lane}${s.kind}${s.spawnAt}`);
    expect(a).toEqual(b);
    const g = createFlood(3);
    expect(g.streams()).toHaveLength(FLOOD.total);
    expect(g.botsTotal).toBeGreaterThanOrEqual(8);
    expect(g.streams().some((s) => s.kind === 'legit')).toBe(true);
  });

  it('is playable on a phone: streams live long enough to tap and never crowd the screen', () => {
    expect(FLOOD.ttlMs).toBeGreaterThanOrEqual(1500);
    for (const seed of SEEDS) {
      const g = createFlood(seed);
      let maxLive = 0;
      let guard = 0;
      while (!g.over && guard++ < 2000) {
        g.tick(50);
        maxLive = Math.max(maxLive, g.streams().filter((s) => s.state === 'live' && g.age(s) >= 0).length);
      }
      expect(maxLive).toBeLessThanOrEqual(4);
    }
  });

  it('tapping every bot quickly scores perfectly; doing nothing scores zero', () => {
    for (const seed of SEEDS) {
      expect(playFlood(seed, 150).score()).toBeGreaterThanOrEqual(0.99);
      expect(playFlood(seed, null).score()).toBe(0);
    }
  });

  it('a slower human still does well, and tapping innocent users hurts', () => {
    for (const seed of SEEDS) {
      expect(playFlood(seed, 700).score()).toBeGreaterThanOrEqual(0.9);
      expect(playFlood(seed, 150, true).score()).toBeLessThan(playFlood(seed, 150).score());
    }
  });

  it('ignores taps on streams that are gone, and finishes by itself', () => {
    const g = createFlood(1);
    g.tap(999);
    g.tick(FLOOD.durationMs + FLOOD.ttlMs + 500);
    expect(g.over).toBe(true);
    expect(g.hits).toBe(g.botsTotal);
    g.tap(0); // no effect after the game
    expect(g.blocked).toBe(0);
  });
});

describe('Phish or Legit?', () => {
  it('asks three different emails, deterministic per seed, with both kinds', () => {
    const a = createPhish(2).emails.map((e) => e.subject);
    expect(a).toEqual(createPhish(2).emails.map((e) => e.subject));
    for (const seed of SEEDS) {
      const g = createPhish(seed);
      expect(g.emails).toHaveLength(PHISH_COUNT);
      expect(new Set(g.emails.map((e) => e.subject)).size).toBe(PHISH_COUNT);
      expect(g.emails.some((e) => e.phish)).toBe(true);
      expect(g.emails.some((e) => !e.phish)).toBe(true);
      for (const e of g.emails) expect(e.tell.length).toBeGreaterThan(8);
    }
  });

  it('scores the share of correct answers, shows feedback, then moves on by itself', () => {
    const g = createPhish(4);
    for (let i = 0; i < PHISH_COUNT; i++) {
      expect(g.state).toBe('asking');
      g.answer(g.current().phish); // always right
      expect(g.state).toBe('feedback');
      expect(g.lastCorrect).toBe(true);
      g.tick(2000);
    }
    expect(g.over).toBe(true);
    expect(g.score()).toBe(1);

    const wrong = createPhish(4);
    for (let i = 0; i < PHISH_COUNT; i++) {
      wrong.answer(!wrong.current().phish);
      wrong.tick(2000);
    }
    expect(wrong.score()).toBe(0);
    expect(wrong.mistakes).toBe(PHISH_COUNT);
  });

  it('ignores answers during feedback and after the end', () => {
    const g = createPhish(5);
    g.answer(g.current().phish);
    g.answer(!g.current().phish); // ignored: still in feedback
    expect(g.correct).toBe(1);
    g.tick(2000);
    g.answer(g.current().phish);
    g.tick(2000);
    g.answer(g.current().phish);
    g.tick(2000);
    g.answer(true);
    expect(g.correct + g.mistakes).toBe(PHISH_COUNT);
  });
});

/** A sensible player: isolate the clean neighbour of an infected node with the most clean neighbours. */
function playWorm(seed: number, strategy: 'none' | 'smart') {
  const g = createWorm(seed, 7);
  let guard = 0;
  let sinceTap = 0;
  while (!g.over && guard++ < 4000) {
    g.tick(50);
    sinceTap += 50;
    if (strategy === 'smart' && sinceTap >= 350 && g.isolatesLeft > 0) {
      const cands = g.nodes
        .filter((n) => n.state === 'clean' && g.neighbours(n.id).some((m) => g.nodes[m]!.state === 'infected'))
        .map((n) => ({ id: n.id, reach: g.neighbours(n.id).filter((m) => g.nodes[m]!.state === 'clean').length }))
        .sort((a, b) => b.reach - a.reach);
      if (cands[0]) {
        g.isolate(cands[0].id);
        sinceTap = 0;
      }
    }
  }
  return g;
}

describe('Cut the Spread', () => {
  it('builds a connected network of 5-9 machines with one patient zero, deterministically', () => {
    for (const seed of SEEDS) {
      const g = createWorm(seed, 7);
      expect(g.nodes.length).toBe(7);
      expect(g.nodes.filter((n) => n.state === 'infected')).toHaveLength(1);
      // connectivity: flood fill from node 0
      const seen = new Set([0]);
      const queue = [0];
      while (queue.length) for (const m of g.neighbours(queue.shift()!)) if (!seen.has(m)) { seen.add(m); queue.push(m); }
      expect(seen.size).toBe(7);
    }
    expect(createWorm(3, 7).nodes.map((n) => n.state)).toEqual(createWorm(3, 7).nodes.map((n) => n.state));
    expect(createWorm(1, 3).nodes.length).toBeGreaterThanOrEqual(5);
    expect(createWorm(1, 40).nodes.length).toBeLessThanOrEqual(9);
  });

  it('unchecked, the worm takes most of the network; a smart player saves most of it', () => {
    let none = 0;
    let smart = 0;
    for (const seed of SEEDS) {
      none += playWorm(seed, 'none').score();
      smart += playWorm(seed, 'smart').score();
    }
    expect(none / SEEDS.length).toBeLessThanOrEqual(0.35);
    expect(smart / SEEDS.length).toBeGreaterThanOrEqual(0.6);
    expect(smart).toBeGreaterThan(none);
  });

  it('only a few isolations are allowed, infected machines cannot be isolated, and it ends by itself', () => {
    const g = createWorm(2, 7);
    expect(g.isolatesLeft).toBe(WORM.isolates);
    const infected = g.nodes.find((n) => n.state === 'infected')!;
    expect(g.isolate(infected.id)).toBe(false);
    const clean = g.nodes.filter((n) => n.state === 'clean');
    let ok = 0;
    for (const n of clean) if (g.isolate(n.id)) ok++;
    expect(ok).toBeLessThanOrEqual(WORM.isolates);
    expect(g.isolatesLeft === 0 || g.over).toBe(true); // used them all, or contained the worm early
    g.tick(WORM.maxMs + 100);
    expect(g.over).toBe(true);
    expect(g.score()).toBeGreaterThanOrEqual(0);
    expect(g.score()).toBeLessThanOrEqual(1);
    expect(g.infectedIndexes().every((i) => g.nodes[i]!.state === 'infected')).toBe(true);
  });
});
