import { chance, randInt } from '../core/rng';
import { BACKUP } from '../data/catalog';
import { DIFFICULTIES } from '../data/difficulty';
import { clearAlarms, escalationDelay, raiseAlarm } from './alarms';
import { facilityPowerW } from './power';
import { addLog, showTip } from './state';
import type { Backup, GameState, PowerSource } from './types';

export function createBackup(upsUnits: number, health: number, generator: Backup['generator'], fuelMin: number = BACKUP.fuelFullMin): Backup {
  return {
    grid: true, gridBackAt: null, outageStart: null, source: 'grid', upsUnits, upsKwh: upsUnits * BACKUP.upsKwhPerUnit * health,
    health, generator, testedAt: null, ats: 'ok', fuelMin,
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
  b.ats = 'ok';
  clearAlarms(s, (a) => a.kind === 'gridDown' || a.kind === 'generator' || a.kind === 'ats');
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
    if ((b.fuelMin ?? BACKUP.fuelFullMin) <= 0) {
      b.generator = 'failed';
      raiseAlarm(s, 'fuel', null, null, 3, null);
      addLog(s, 'fail', '🛢️ The generator tank is empty! Refuel it.');
    } else if (generatorTested(s) || chance(s.rng, BACKUP.untestedStartChance)) {
      b.generator = 'running';
      addLog(s, 'success', '🛢️ The generator roars to life.');
      const atsFail = s.minute - (b.atsServicedAt ?? -1e9) <= BACKUP.genTestValidMin ? BACKUP.atsFailServiced : BACKUP.atsFailUntested;
      if (chance(s.rng, atsFail)) {
        b.ats = 'failed';
        raiseAlarm(s, 'ats', null, null, 3, null);
        addLog(s, 'fail', '🔌 The transfer switch is stuck! The generator runs, but the racks are still on battery. Send an electrician.');
        showTip(s, 'atsFail');
      }
    } else {
      b.generator = 'failed';
      raiseAlarm(s, 'generator', null, null, 3, null);
      addLog(s, 'fail', '🛢️ The generator coughed and died. Nobody tested it! Send an electrician to start it.');
      showTip(s, 'generatorFail');
    }
  }

  if (b.generator === 'running' && (b.ats ?? 'ok') === 'failed') b.fuelMin = Math.max(0, (b.fuelMin ?? BACKUP.fuelFullMin) - 1);
  if (b.generator !== 'none' && (b.fuelMin ?? BACKUP.fuelFullMin) < BACKUP.fuelLowMin) {
    raiseAlarm(s, 'fuel', null, null, b.grid ? 1 : 2, b.grid ? escalationDelay(s, 1) : null);
    showTip(s, 'fuelLow');
  }
  const cap = upsCapacityKwh(b);
  let source: PowerSource;
  if (b.grid) {
    source = 'grid';
    b.upsKwh = Math.min(cap, b.upsKwh + BACKUP.rechargeKwhPerMin * b.upsUnits);
  } else if (b.generator === 'running' && (b.ats ?? 'ok') === 'ok') {
    source = 'generator';
    b.fuelMin = Math.max(0, (b.fuelMin ?? BACKUP.fuelFullMin) - 1);
    if (b.fuelMin <= 0) {
      b.generator = 'failed';
      raiseAlarm(s, 'fuel', null, null, 3, null);
      addLog(s, 'fail', '🛢️ The generator ran out of fuel!');
    }
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
  b.atsServicedAt = s.minute;
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

export function transferAts(s: GameState): void {
  const b = s.backup;
  if (!b) return;
  b.ats = 'ok';
  clearAlarms(s, (a) => a.kind === 'ats');
  addLog(s, 'success', '🔌 The load is transferred: the racks run on the generator.');
}

export function refuelGenerator(s: GameState): void {
  const b = s.backup;
  if (!b) return;
  b.fuelMin = BACKUP.fuelFullMin;
  clearAlarms(s, (a) => a.kind === 'fuel');
  if (b.generator === 'failed' && (b.fuelMin ?? 0) > 0 && !b.grid) b.generator = 'running';
  addLog(s, 'success', '🛢️ The tank is full: 24 hours of diesel.');
}
