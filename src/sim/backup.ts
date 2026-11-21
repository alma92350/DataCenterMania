import { chance, randInt } from '../core/rng';
import { BACKUP } from '../data/catalog';
import { DIFFICULTIES } from '../data/difficulty';
import { clearAlarms, escalationDelay, raiseAlarm } from './alarms';
import { facilityPowerW } from './power';
import { addLog, showTip } from './state';
import type { Backup, GameState, PowerSource } from './types';

export function createBackup(upsUnits: number, health: number, generator: Backup['generator']): Backup {
  return {
    grid: true, gridBackAt: null, outageStart: null, source: 'grid', upsUnits, upsKwh: upsUnits * BACKUP.upsKwhPerUnit * health,
    health, generator, testedAt: null,
  };
}

export const upsCapacityKwh = (b: Backup): number => b.upsUnits * BACKUP.upsKwhPerUnit * Math.max(BACKUP.minHealthCapacity, b.health);

export const generatorTested = (s: GameState): boolean => !!s.backup && s.backup.testedAt !== null && s.minute - s.backup.testedAt <= BACKUP.genTestValidMin;

/** Minutes of battery left at the current load (Infinity on grid or generator). */
export function upsRuntimeMin(s: GameState): number {
  const b = s.backup;
  if (!b) return 0;
  const kw = Math.max(0.1, facilityPowerW(s) / 1000);
  return (b.upsKwh / kw) * 60;
}

/** Is there power at the racks? Without a backup system the utility is assumed to be rock solid. */
export const hasPower = (s: GameState): boolean => !s.backup || s.backup.source !== 'none';

export function startOutage(s: GameState, minutes: number, text?: string): void {
  const b = s.backup;
  if (!b || !b.grid) return;
  b.grid = false;
  b.outageStart = s.minute;
  b.gridBackAt = s.minute + minutes;
  s.stats.outages = (s.stats.outages ?? 0) + 1;
  addLog(s, 'alarm', text ?? `⚡ Utility power is out! The grid should be back in about ${Math.round(minutes / 60 * 10) / 10} h.`);
  raiseAlarm(s, 'gridDown', null, null, 2, escalationDelay(s, 2));
  showTip(s, 'gridDown');
}

function endOutage(s: GameState, b: Backup): void {
  b.grid = true;
  b.gridBackAt = null;
  b.outageStart = null;
  if (b.generator === 'running' || b.generator === 'failed') b.generator = 'idle';
  clearAlarms(s, (a) => a.kind === 'gridDown' || a.kind === 'generator');
  addLog(s, 'success', '⚡ The grid is back. Batteries recharge; the generator goes back to standby.');
}

/** Per game minute: outages, battery drain and recharge, generator start-up, battery wear. */
export function updateBackup(s: GameState): void {
  const b = s.backup;
  if (!b) return;

  if (b.upsUnits > 0) {
    b.health = Math.max(0, b.health - BACKUP.batteryWearPerDay / 1440);
    if (b.health < BACKUP.batteryWarnBelow) raiseAlarm(s, 'battery', null, null, 1, escalationDelay(s, 1));
  }

  if (b.grid && s.failuresEnabled) {
    const rate = (BACKUP.randomOutagePerDay / 1440) * DIFFICULTIES[s.difficulty].incidentRate * (s.incidentMult ?? 1);
    if (chance(s.rng, rate)) startOutage(s, randInt(s.rng, BACKUP.outageMin[0], BACKUP.outageMin[1]));
  }

  if (!b.grid && b.gridBackAt !== null && s.minute >= b.gridBackAt) endOutage(s, b);

  // the generator starts a few minutes into an outage; an untested one often does not
  if (!b.grid && b.generator === 'idle' && b.outageStart !== null && s.minute >= b.outageStart + BACKUP.genStartMin) {
    if (generatorTested(s) || chance(s.rng, BACKUP.untestedStartChance)) {
      b.generator = 'running';
      addLog(s, 'success', '🛢️ The generator roars to life.');
    } else {
      b.generator = 'failed';
      raiseAlarm(s, 'generator', null, null, 3, null);
      addLog(s, 'fail', '🛢️ The generator coughed and died. Nobody tested it! Send an electrician to start it.');
      showTip(s, 'generatorFail');
    }
  }

  const cap = upsCapacityKwh(b);
  let source: PowerSource;
  if (b.grid) {
    source = 'grid';
    b.upsKwh = Math.min(cap, b.upsKwh + BACKUP.rechargeKwhPerMin * b.upsUnits);
  } else if (b.generator === 'running') {
    source = 'generator';
  } else if (b.upsKwh > 0) {
    source = 'ups';
    b.upsKwh = Math.max(0, b.upsKwh - facilityPowerW(s) / 1000 / 60);
    if (b.upsKwh <= 0) addLog(s, 'fail', '🔋 The batteries are empty!');
  } else {
    source = 'none';
  }
  b.upsKwh = Math.min(b.upsKwh, cap);
  if (source === 'none') {
    s.stats.blackoutMin = (s.stats.blackoutMin ?? 0) + 1;
    if (b.source !== 'none') {
      addLog(s, 'fail', '🌑 BLACKOUT! Every server is down.');
      s.reputation = Math.max(0, s.reputation - 0.2);
      raiseAlarm(s, 'gridDown', null, null, 3, null);
    }
  }
  b.source = source;
}

/** A battery change restores health; fixing the generator brings it up (or back to standby). */
export function startGenerator(s: GameState): void {
  const b = s.backup;
  if (!b || b.generator === 'none') return;
  b.generator = b.grid ? 'idle' : 'running';
  clearAlarms(s, (a) => a.kind === 'generator');
  addLog(s, 'success', b.grid ? '🛢️ The generator is serviced and on standby.' : '🛢️ The generator is running again!');
}

export function testGenerator(s: GameState): void {
  const b = s.backup;
  if (!b || b.generator === 'none') return;
  b.testedAt = s.minute;
  s.stats.prevented = (s.stats.prevented ?? 0) + 1;
  addLog(s, 'success', '🛢️ Generator test passed: it will start when you need it (valid for two days).');
}

export function replaceBatteries(s: GameState): void {
  const b = s.backup;
  if (!b) return;
  b.health = 1;
  clearAlarms(s, (a) => a.kind === 'battery');
  addLog(s, 'success', '🔋 New batteries installed. The UPS is at full health.');
}
