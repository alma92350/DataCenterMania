/**
 * The three cyber micro-games (PRD §9). Each is a tiny deterministic state machine driven by
 * `tick(dtMs)` and player taps; the UI only renders it. All are 10-15 seconds and one-thumb.
 *  - Block the Flood (Script Kiddies' DDoS): tap bot traffic, leave real users alone
 *  - Phish or Legit? (Captain Phish): judge three emails
 *  - Cut the Spread (worm): isolate machines before the infection reaches them
 * Every game ends with a score in [0, 1].
 */
import { createRng, rand, randInt, type RngState } from '../core/rng';

// ------------------------------------------------------------------ Block the Flood

export const FLOOD = { total: 14, durationMs: 10000, ttlMs: 1900, lanes: 5, minBots: 9, minLegit: 3 } as const;

export interface Stream {
  id: number;
  lane: number;
  kind: 'bot' | 'legit';
  spawnAt: number;
  state: 'live' | 'blocked' | 'hit' | 'passed';
  resolvedAt: number | null;
}

export class Flood {
  readonly kind = 'flood' as const;
  t = 0;
  over = false;
  blocked = 0;
  mistakes = 0;
  hits = 0;
  readonly botsTotal: number;
  private readonly list: Stream[] = [];

  constructor(seed: number) {
    const r = createRng(seed);
    const gap = FLOOD.durationMs / FLOOD.total;
    const kinds: ('bot' | 'legit')[] = Array.from({ length: FLOOD.total }, () => (rand(r) < 0.72 ? 'bot' : 'legit'));
    // guarantee a fair mix
    for (let i = 0; kinds.filter((k) => k === 'bot').length < FLOOD.minBots; i += 3) kinds[i % FLOOD.total] = 'bot';
    for (let i = 1; kinds.filter((k) => k === 'legit').length < FLOOD.minLegit; i += 4) kinds[i % FLOOD.total] = 'legit';
    let lastLane = -1;
    let prevLane = -1;
    for (let i = 0; i < FLOOD.total; i++) {
      let lane = randInt(r, 0, FLOOD.lanes - 1);
      while (lane === lastLane || lane === prevLane) lane = (lane + 1) % FLOOD.lanes;
      prevLane = lastLane;
      lastLane = lane;
      this.list.push({ id: i, lane, kind: kinds[i]!, spawnAt: Math.round(i * gap + (rand(r) - 0.5) * gap * 0.3 + gap * 0.3), state: 'live', resolvedAt: null });
    }
    this.botsTotal = this.list.filter((s) => s.kind === 'bot').length;
  }

  streams(): readonly Stream[] {
    return this.list;
  }

  /** Milliseconds since this stream appeared (negative: not yet on screen). */
  age(s: Stream): number {
    return this.t - s.spawnAt;
  }

  tick(dt: number): void {
    if (this.over) return;
    this.t += dt;
    for (const s of this.list) {
      if (s.state === 'live' && this.age(s) >= FLOOD.ttlMs) {
        s.resolvedAt = this.t;
        if (s.kind === 'bot') {
          s.state = 'hit';
          this.hits++;
        } else s.state = 'passed';
      }
    }
    if (this.list.every((s) => s.state !== 'live')) this.over = true;
  }

  tap(id: number): void {
    if (this.over) return;
    const s = this.list.find((x) => x.id === id);
    if (!s || s.state !== 'live' || this.age(s) < 0) return;
    s.state = 'blocked';
    s.resolvedAt = this.t;
    if (s.kind === 'bot') this.blocked++;
    else this.mistakes++;
  }

  score(): number {
    return Math.max(0, Math.min(1, (this.blocked - 0.5 * this.mistakes) / this.botsTotal));
  }
}

export const createFlood = (seed: number): Flood => new Flood(seed);

// ------------------------------------------------------------------ Phish or Legit?

export const PHISH_COUNT = 3;
const FEEDBACK_MS = 1100;

export interface Email {
  from: string;
  subject: string;
  body: string;
  phish: boolean;
  /** Why it is (not) a phish: shown after each answer, so the game teaches. */
  tell: string;
}

const PHISH: Email[] = [
  { from: 'it-support@c0mpany-help.net', subject: 'URGENT: your coffee machine licence has expired', body: 'Click here within 5 minutes or your coffee machine will be switched off forever!', phish: true, tell: 'Fake urgency and a look-alike sender (c0mpany with a zero).' },
  { from: 'ceo@datacenter-mania.co', subject: 'Quick favour: buy gift cards', body: 'I am in a meeting and cannot talk. Buy 10 gift cards and send me the codes. Keep it secret.', phish: true, tell: 'The boss never asks for gift cards by email, and the domain ends in .co, not .com.' },
  { from: 'billing@cloudnimbus-secure.biz', subject: 'Invoice overdue: pay now to avoid shutdown', body: 'Your CloudNimbus account will be suspended today. Pay here: http://cloudnimbus-secure.biz/pay', phish: true, tell: 'A surprise invoice from a .biz domain pretending to be your vendor.' },
  { from: 'hr@payroll-update.info', subject: 'Update your salary details', body: 'Please re-enter your bank details at the link below so we can pay you this month.', phish: true, tell: 'Payroll never asks you to retype bank details through an email link.' },
  { from: 'admin@your-rack-check.com', subject: 'Your password expires TODAY!', body: 'Log in now to keep your password: http://your-rack-check.com/login', phish: true, tell: 'Password panic plus a link to a site you have never seen.' },
  { from: 'noreply@free-servers-giveaway.xyz', subject: 'You won 10 free servers!!!', body: 'Congratulations! Claim your 10 servers now. Just confirm your admin password.', phish: true, tell: 'Too good to be true, and nobody asks for your password to give you a prize.' },
  { from: 'delivery@parcel-track.cc', subject: 'Parcel stuck at the loading dock', body: 'We could not deliver your parcel. Pay a small fee to release it: http://parcel-track.cc/fee', phish: true, tell: 'You did not order anything, and the link goes to a strange domain.' },
  { from: 'it@datacenter-mania.com.verify-login.ru', subject: 'Mandatory security check', body: 'Sign in at the link below to confirm your account is still yours.', phish: true, tell: 'Read a domain from the right: this one really belongs to verify-login.ru.' },
];

const LEGIT: Email[] = [
  { from: 'facilities@datacenter-mania.com', subject: 'Fire drill on Thursday at 10:00', body: 'Please leave the floor calmly through the nearest exit. See you in the car park.', phish: false, tell: 'Expected, from your own domain, and no link or request.' },
  { from: 'noc@datacenter-mania.com', subject: 'Maintenance window tonight at 02:00', body: 'The network team will reboot the core switch. Expect a one-minute blip.', phish: false, tell: 'Internal address, ordinary notice, nothing to click.' },
  { from: 'vendor@cloudnimbus.com', subject: 'Your order of 2 spare disks has shipped', body: 'Tracking is available in your account on the CloudNimbus portal. Delivery in 2 days.', phish: false, tell: 'You did order spare disks, and it tells you to use the portal you already know.' },
  { from: 'hr@datacenter-mania.com', subject: 'Lunch and learn: cable management', body: 'Pizza will be provided. Bring your favourite zip tie.', phish: false, tell: 'Friendly, internal, and it asks for nothing.' },
  { from: 'sam@datacenter-mania.com', subject: 'Welcome back, here is the new cheat sheet', body: 'I updated the runbook with last week\'s lessons. It is on the shared drive as usual.', phish: false, tell: 'Sam, your mentor, from the right domain, pointing at the usual place.' },
  { from: 'billing@cloudnimbus.com', subject: 'Your monthly statement is ready', body: 'No action needed. Log in to the portal as you normally do to download it.', phish: false, tell: 'No link, no pressure, and it points you to your usual route.' },
  { from: 'security@datacenter-mania.com', subject: 'Reminder: lock your screen', body: 'A short reminder from the security team. Thank you for keeping the floor safe.', phish: false, tell: 'Internal reminder that asks for nothing risky.' },
  { from: 'ops@datacenter-mania.com', subject: 'Weekly on-call rota', body: 'The rota for next week is attached on the wiki page you bookmarked.', phish: false, tell: 'Routine, from your own domain, and it points to a known place.' },
];

export class Phish {
  readonly kind = 'phish' as const;
  readonly emails: Email[];
  index = 0;
  state: 'asking' | 'feedback' = 'asking';
  correct = 0;
  mistakes = 0;
  lastCorrect: boolean | null = null;
  over = false;
  private feedbackLeft = 0;

  constructor(seed: number) {
    const r = createRng(seed);
    const phishCount = rand(r) < 0.5 ? 1 : 2;
    const take = (pool: Email[], n: number) => {
      const copy = [...pool];
      const out: Email[] = [];
      for (let i = 0; i < n; i++) out.push(copy.splice(randInt(r, 0, copy.length - 1), 1)[0]!);
      return out;
    };
    const picked = [...take(PHISH, phishCount), ...take(LEGIT, PHISH_COUNT - phishCount)];
    for (let i = picked.length - 1; i > 0; i--) {
      const j = randInt(r, 0, i);
      [picked[i], picked[j]] = [picked[j]!, picked[i]!];
    }
    this.emails = picked;
  }

  current(): Email {
    return this.emails[Math.min(this.index, this.emails.length - 1)]!;
  }

  answer(guessPhish: boolean): void {
    if (this.over || this.state !== 'asking') return;
    this.lastCorrect = guessPhish === this.current().phish;
    if (this.lastCorrect) this.correct++;
    else this.mistakes++;
    this.state = 'feedback';
    this.feedbackLeft = FEEDBACK_MS;
  }

  tick(dt: number): void {
    if (this.over || this.state !== 'feedback') return;
    this.feedbackLeft -= dt;
    if (this.feedbackLeft > 0) return;
    this.index++;
    if (this.index >= PHISH_COUNT) {
      this.over = true;
      this.index = PHISH_COUNT - 1;
    }
    this.state = 'asking';
  }

  score(): number {
    return this.correct / PHISH_COUNT;
  }
}

export const createPhish = (seed: number): Phish => new Phish(seed);

// ------------------------------------------------------------------ Cut the Spread

export const WORM = { isolates: 3, spreadMs: 1300, maxMs: 14000, minNodes: 5, maxNodes: 9 } as const;

export interface WormNode {
  id: number;
  x: number; // 0..100
  y: number; // 0..100
  state: 'clean' | 'infected' | 'isolated';
}

export class Worm {
  readonly kind = 'worm' as const;
  t = 0;
  over = false;
  isolatesLeft: number = WORM.isolates;
  readonly nodes: WormNode[] = [];
  readonly edges: [number, number][] = [];
  private acc = 0;
  private readonly r: RngState;

  constructor(seed: number, count: number) {
    this.r = createRng(seed);
    const n = Math.max(WORM.minNodes, Math.min(WORM.maxNodes, count));
    // jittered 3x3 grid, n of the nine cells
    const cells = Array.from({ length: 9 }, (_, i) => i);
    for (let i = cells.length - 1; i > 0; i--) {
      const j = randInt(this.r, 0, i);
      [cells[i], cells[j]] = [cells[j]!, cells[i]!];
    }
    cells.slice(0, n).sort((a, b) => a - b).forEach((cell, id) => {
      this.nodes.push({ id, x: 16 + (cell % 3) * 34 + (rand(this.r) - 0.5) * 8, y: 16 + Math.floor(cell / 3) * 34 + (rand(this.r) - 0.5) * 8, state: 'clean' });
    });
    // each machine links to its two nearest, then any separate islands are joined
    const dist = (a: number, b: number) => Math.hypot(this.nodes[a]!.x - this.nodes[b]!.x, this.nodes[a]!.y - this.nodes[b]!.y);
    const link = (a: number, b: number) => {
      if (a !== b && !this.edges.some(([p, q]) => (p === a && q === b) || (p === b && q === a))) this.edges.push([a, b]);
    };
    for (const node of this.nodes) {
      const near = this.nodes.filter((o) => o.id !== node.id).sort((a, b) => dist(node.id, a.id) - dist(node.id, b.id)).slice(0, 2);
      for (const o of near) link(node.id, o.id);
    }
    for (;;) {
      const comp = this.components();
      if (comp.length <= 1) break;
      let best: [number, number] | null = null;
      for (const a of comp[0]!) for (const other of comp.slice(1)) for (const b of other) if (!best || dist(a, b) < dist(best[0], best[1])) best = [a, b];
      link(best![0], best![1]);
    }
    this.nodes[randInt(this.r, 0, n - 1)]!.state = 'infected';
  }

  private components(): number[][] {
    const seen = new Set<number>();
    const out: number[][] = [];
    for (const n of this.nodes) {
      if (seen.has(n.id)) continue;
      const comp: number[] = [];
      const queue = [n.id];
      seen.add(n.id);
      while (queue.length) {
        const cur = queue.shift()!;
        comp.push(cur);
        for (const m of this.neighbours(cur)) if (!seen.has(m)) { seen.add(m); queue.push(m); }
      }
      out.push(comp);
    }
    return out;
  }

  neighbours(id: number): number[] {
    return this.edges.filter(([a, b]) => a === id || b === id).map(([a, b]) => (a === id ? b : a));
  }

  private canSpread(): boolean {
    return this.nodes.some((n) => n.state === 'infected' && this.neighbours(n.id).some((m) => this.nodes[m]!.state === 'clean'));
  }

  tick(dt: number): void {
    if (this.over) return;
    this.t += dt;
    this.acc += dt;
    while (this.acc >= WORM.spreadMs) {
      this.acc -= WORM.spreadMs;
      const infected = this.nodes.filter((n) => n.state === 'infected');
      for (const n of infected) {
        const targets = this.neighbours(n.id).filter((m) => this.nodes[m]!.state === 'clean');
        if (targets.length && rand(this.r) < 0.8) this.nodes[targets[randInt(this.r, 0, targets.length - 1)]!]!.state = 'infected';
      }
    }
    if (this.t >= WORM.maxMs || !this.canSpread()) this.over = true;
  }

  isolate(id: number): boolean {
    const n = this.nodes[id];
    if (this.over || !n || n.state !== 'clean' || this.isolatesLeft <= 0) return false;
    n.state = 'isolated';
    this.isolatesLeft--;
    if (!this.canSpread()) this.over = true;
    return true;
  }

  infectedIndexes(): number[] {
    return this.nodes.filter((n) => n.state === 'infected').map((n) => n.id);
  }

  score(): number {
    return this.nodes.filter((n) => n.state !== 'infected').length / this.nodes.length;
  }
}

export const createWorm = (seed: number, count: number): Worm => new Worm(seed, count);

export type MiniGame = Flood | Phish | Worm;
