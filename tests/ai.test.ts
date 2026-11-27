import { at } from '../src/core/time';
import { AI } from '../src/data/catalog';
import { aiEffective, corruptNode, interruptRatePerMin, lossMinutes } from '../src/sim/ai';
import { applyCommand } from '../src/sim/commands';
import { failPump, leak, liquidTarget, loopCapacityKw, loopHeatKw, spike } from '../src/sim/liquid';
import { advance } from '../src/sim/sim';
import { createGame } from '../src/sim/state';
import { devicePowerW } from '../src/sim/power';
import { deviceUp } from '../src/sim/selectors';
import { aiCard, rackModal, tabs } from '../src/ui/views';
import { HANDBOOK } from '../src/data/handbook';
import type { GameState } from '../src/sim/types';
import { autopilot } from './autopilot';
import { measure } from './engagement';

/** A Chapter 8 site with one liquid rack carrying two GPU servers for the AI contract. */
function factory(seed = 1, cdus = 1): GameState {
  const s = createGame('ch8', 'sysadmin', seed);
  s.failuresEnabled = false;
  s.cash = 200000;
  s.progress.firedEvents.push('pump', 'spike1', 'winter', 'sdc', 'spike2');
  s.loop!.cdus = cdus;
  s.loop!.cdusOk = cdus;
  const rack = s.racks.find((r) => !s.devices.some((d) => d.rackId === r.id))!;
  rack.liquid = true;
  rack.powerBudgetW = AI.liquidBudgetW;
  advance(s, 10 + 0); // offers arrive at 09:00, so step past it
  advance(s, at(0, 9, 5) - s.minute);
  const offer = s.contracts.find((c) => c.kind === 'ai')!;
  applyCommand(s, { type: 'acceptContract', contractId: offer.id });
  s.inventory.server2u = 4;
  for (let i = 0; i < 2; i++) {
    s.devices.push({ id: `gpu${i}`, model: 'server2u', rackId: rack.id, slot: i * 2, faults: [], poweredOn: true, thermalShutdown: false, contractId: offer.id, load: 0, psus: 2, gpu: true });
  }
  advance(s, 5);
  return s;
}
const gpus = (s: GameState) => s.devices.filter((d) => d.gpu);

describe('GPU servers and the liquid loop', () => {
  it('a GPU server draws five times the power and counts for two and a half times the compute', () => {
    const s = factory();
    const gpu = gpus(s)[0]!;
    const plain = { ...gpu, gpu: false };
    expect(devicePowerW(s, gpu)).toBeCloseTo(devicePowerW(s, plain) * AI.gpuPowerMult, 0);
    expect(s.contracts.find((c) => c.kind === 'ai')!.units).toBe(10);
  });

  it('while the loop keeps up the rack stays near 35 degrees; with too little capacity it runs away within minutes', () => {
    const s = factory(1, 1);
    advance(s, 60);
    const rack = s.racks.find((r) => r.liquid)!;
    expect(loopHeatKw(s)).toBeLessThanOrEqual(loopCapacityKw(s));
    expect(rack.temp).toBeLessThan(40);
    expect(gpus(s).every((d) => deviceUp(s, d))).toBe(true);
    failPump(s);
    expect(loopCapacityKw(s)).toBe(0);
    expect(liquidTarget(s, rack)).toBeGreaterThan(80);
    advance(s, 8);
    expect(gpus(s).every((d) => !deviceUp(s, d))).toBe(true);
    expect(s.stats.thermalShutdowns).toBeGreaterThan(0);
  });

  it('a spare coolant unit (N+1) rides through a pump failure', () => {
    const s = factory(1, 2);
    advance(s, 30);
    failPump(s);
    advance(s, 30);
    expect(gpus(s).every((d) => deviceUp(s, d))).toBe(true);
    expect(s.stats.thermalShutdowns).toBe(0);
    expect(s.alarms.some((a) => a.kind === 'pump')).toBe(true);
  });

  it('a pump repair by an electrician restores capacity and clears the alarm; an untrained one is twice as slow', () => {
    const s = factory(1, 2);
    s.cash = 100000;
    const cand = s.candidates.find((c) => c.role === 'elec')!;
    applyCommand(s, { type: 'hire', candidateId: cand.id });
    failPump(s);
    expect(applyCommand(s, { type: 'dispatch', job: 'repairPump', techId: 'best' }).ok).toBe(true);
    const slow = s.jobs[0]!.workTotal;
    expect(slow).toBe(45 * AI.untrainedWorkMult);
    advance(s, 200);
    expect(s.loop!.cdusOk).toBe(2);
    expect(s.alarms.some((a) => a.kind === 'pump')).toBe(false);
    const t = factory(1, 2);
    const elec = t.techs.find((x) => x.role === 'hw')!; // pretend this specialist was trained
    elec.liquid = true;
    t.techs.forEach((x) => (x.role === 'hw' ? undefined : x));
    failPump(t);
    expect(applyCommand(t, { type: 'dispatch', job: 'repairPump', techId: elec.id }).ok).toBe(false); // an HW tech may not do it
  });

  it('a leak isolates a rack until it is repaired', () => {
    const s = factory(1, 2);
    leak(s, 0);
    expect(s.loop!.leakRackId).not.toBeNull();
    expect(gpus(s).every((d) => !deviceUp(s, d))).toBe(true);
    expect(s.alarms.some((a) => a.kind === 'leak')).toBe(true);
    expect(applyCommand(s, { type: 'dispatch', job: 'repairLeak', techId: 'best' }).ok).toBe(true);
    advance(s, 900);
    expect(s.loop!.leakRackId).toBeNull();
    advance(s, 30);
    expect(gpus(s).every((d) => deviceUp(s, d))).toBe(true);
  });

  it('GPUs need a liquid rack, cold plates need rear-door coolers first, and each tier costs money', () => {
    const s = createGame('ch8', 'sysadmin', 2);
    s.cash = 100000;
    const air = s.devices.find((d) => d.model === 'server2u') ?? s.devices[0]!;
    expect(applyCommand(s, { type: 'dispatch', job: 'gpuUpgrade', deviceId: air.id, techId: 'best' }).ok).toBe(false);
    expect(applyCommand(s, { type: 'buyAiTech', tech: 'coldPlates' }).ok).toBe(false);
    const cash = s.cash;
    expect(applyCommand(s, { type: 'buyAiTech', tech: 'rearDoor' }).ok).toBe(true);
    expect(s.cash).toBe(cash - AI.tech.rearDoor.price);
    expect(applyCommand(s, { type: 'buyAiTech', tech: 'rearDoor' }).ok).toBe(false);
    expect(applyCommand(s, { type: 'buyAiTech', tech: 'coldPlates' }).ok).toBe(true);
    const empty = s.racks.find((r) => !s.devices.some((d) => d.rackId === r.id))!;
    expect(applyCommand(s, { type: 'dispatch', job: 'convertLiquid', rackId: empty.id, techId: 'best' }).ok).toBe(true);
    advance(s, 900);
    expect(empty.liquid).toBe(true);
    expect(empty.powerBudgetW).toBe(AI.liquidBudgetW);
    expect(applyCommand(createGame('ch6', 'sysadmin', 1), { type: 'buyAiTech', tech: 'rearDoor' }).ok).toBe(false);
  });

  it('training a specialist costs money and time, and makes liquid work normal speed', () => {
    const s = factory();
    const hv = s.candidates.find((c) => c.role === 'hvac')!;
    applyCommand(s, { type: 'hire', candidateId: hv.id });
    const t = s.techs.find((x) => x.role === 'hvac')!;
    expect(applyCommand(s, { type: 'trainLiquid', techId: 'manager' }).ok).toBe(false);
    expect(applyCommand(s, { type: 'trainLiquid', techId: t.id }).ok).toBe(true);
    expect(t.liquid).toBe(true);
    expect(t.lockedUntil).toBeGreaterThan(s.minute);
    expect(applyCommand(s, { type: 'trainLiquid', techId: t.id }).ok).toBe(false);
    advance(s, AI.trainMin + 5);
    leak(s, 0);
    applyCommand(s, { type: 'dispatch', job: 'repairLeak', techId: t.id });
    expect(s.jobs.find((j) => j.kind === 'repairLeak')!.workTotal).toBe(60);
  });

  it('a coolant unit is ordered in queue days and arrives', () => {
    const s = factory(1, 1);
    s.progress.firedEvents.push('delayedOrder');
    expect(applyCommand(s, { type: 'orderCdu' }).ok).toBe(true);
    advance(s, 2 * 1440 + 5);
    expect(s.loop!.cdus).toBe(2);
  });
});

describe('effective training time', () => {
  it('interruptions grow faster than linearly with cluster size, and checkpointing and auto-restart help', () => {
    const s = factory();
    const r2 = interruptRatePerMin(s, 2);
    const r8 = interruptRatePerMin(s, 8);
    expect(r8).toBeGreaterThan(r2 * 4);
    expect(lossMinutes(s)).toBe(AI.lossMin);
    s.aiTech = { rearDoor: true, coldPlates: true, checkpoint: true, autoRestart: false, battery: false };
    expect(lossMinutes(s)).toBe(AI.lossCheckpointMin);
    s.aiTech.autoRestart = true;
    expect(interruptRatePerMin(s, 2)).toBeCloseTo(r2 * AI.autoRestartMult, 8);
  });

  it('every interruption pauses the cluster and lowers effective time; checkpointing loses less', () => {
    const run = (checkpoint: boolean, seed: number) => {
      const s = factory(seed, 2);
      s.aiForce = true;
      s.incidentMult = 3;
      if (checkpoint) s.aiTech = { rearDoor: true, coldPlates: true, checkpoint: true, autoRestart: false, battery: false };
      advance(s, 3 * 1440);
      return s;
    };
    const plain = [1, 2, 3].map((seed) => run(false, seed));
    const cp = [1, 2, 3].map((seed) => run(true, seed));
    expect(plain.some((s) => (s.contracts.find((c) => c.kind === 'ai')!.aiInterrupts ?? 0) > 0)).toBe(true);
    const avg = (xs: GameState[]) => xs.reduce((n, s) => n + aiEffective(s), 0) / xs.length;
    expect(avg(plain)).toBeLessThan(100);
    expect(avg(cp)).toBeGreaterThan(avg(plain));
    expect(aiEffective(createGame('ch6', 'sysadmin', 1))).toBe(100);
  }, 60000);
});

describe('spikes and silent corruption', () => {
  it('a power spike on GPU racks can trip the breaker; a battery buffer softens it', () => {
    const s = factory(1, 2);
    advance(s, 15);
    s.racks.find((r) => r.liquid)!.powerBudgetW = Math.round(gpus(s).reduce((w, d) => w + devicePowerW(s, d), 0) * 1.3);
    spike(s, 1.6, 5);
    advance(s, 2);
    expect(s.racks.find((r) => r.liquid)!.tripped).toBe(true);
    const t = factory(1, 2);
    advance(t, 15);
    t.racks.find((r) => r.liquid)!.powerBudgetW = Math.round(gpus(t).reduce((w, d) => w + devicePowerW(t, d), 0) * 1.3);
    t.aiTech = { rearDoor: true, coldPlates: true, checkpoint: false, autoRestart: false, battery: true };
    spike(t, 1.6, 5);
    expect(t.spike!.mult).toBeLessThan(1.6);
    advance(t, 2);
    expect(t.racks.find((r) => r.liquid)!.tripped).toBe(false);
  });

  it('corruption is caught by remote diagnostics (NOC level 2) and cleared by a reboot, else the customer finds it first', () => {
    const s = factory(1, 2);
    s.noc = 2;
    corruptNode(s);
    expect(s.devices.some((d) => d.faults.includes('corrupt'))).toBe(true);
    expect(s.alarms.some((a) => a.kind === 'corrupt')).toBe(true);
    const d = s.devices.find((x) => x.faults.includes('corrupt'))!;
    expect(applyCommand(s, { type: 'dispatch', job: 'reboot', deviceId: d.id, techId: 'best' }).ok).toBe(true);
    advance(s, 60);
    expect(d.faults).not.toContain('corrupt');
    const t = factory(2, 2);
    t.aiForce = true;
    corruptNode(t);
    expect(t.alarms.some((a) => a.kind === 'corrupt')).toBe(false);
    const rep = t.reputation;
    advance(t, AI.corruptUndetectedMin + 5);
    expect(t.reputation).toBeLessThan(rep);
    expect(t.devices.some((x) => x.faults.includes('corrupt'))).toBe(false);
  });
});

describe('AI factory UI and balance', () => {
  it('shows the loop, the ladder, training and conversion controls', () => {
    const s = factory();
    applyCommand(s, { type: 'hire', candidateId: s.candidates.find((c) => c.role === 'hvac')!.id });
    const html = aiCard(s);
    for (const key of ['buyAiTech', 'orderCdu', 'trainLiquid']) expect(html).toContain(`data-action="${key}"`);
    expect(html).toContain('Effective training time');
    expect(html).not.toMatch(/undefined|NaN/);
    expect(aiCard(createGame('ch7', 'sysadmin', 1))).toBe('');
    const r = s.racks.find((x) => x.liquid)!;
    expect(rackModal(s, r.id)).toContain('On the liquid loop');
    failPump(s);
    expect(aiCard(s)).toContain('data-job="repairPump"');
    expect(tabs(s, 'alarms')).toContain('Infra');
    expect(HANDBOOK.filter((h) => h.unlock === 'liquid' || h.unlock === 'ai').length).toBeGreaterThanOrEqual(4);
  });

  it('a planned bot wins the chapter; a bot that ignores the AI customer cannot earn the star', () => {
    const play = (ai: 'planned' | 'passive', seed: number) => {
      const s = createGame('ch8', 'sysadmin', seed);
      while (s.progress.status === 'playing') {
        if (s.minute % 5 === 0) autopilot(s, { auto: true, ai });
        advance(s, 1);
      }
      return s;
    };
    const planned = [1, 3].map((seed) => play('planned', seed));
    expect(planned.every((s) => s.progress.status === 'won')).toBe(true);
    expect(planned.every((s) => s.stats.thermalShutdowns === 0)).toBe(true);
    expect(planned.every((s) => aiEffective(s) >= 90)).toBe(true);
    const passive = play('passive', 1);
    expect(passive.progress.status).toBe('lost');
  }, 120000);

  it('keeps the bot engagement guardrails in Chapter 8', () => {
    const m = measure('ch8', 1, 'sysadmin', true);
    expect(m.shiftRealMinutes.every((x) => x >= 3 && x <= 10)).toBe(true);
    expect(m.quietDaytimePct).toBeLessThanOrEqual(70);
  });
});
