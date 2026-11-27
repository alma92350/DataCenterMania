import { spofCount, spofReport } from './spof';
import { generatorTested } from './backup';
import type { GameState } from './types';

export interface ResilienceCheck {
  level: 2 | 3 | 4;
  label: string;
  ok: boolean;
}

/**
 * Resilience levels I to IV (PRD v2 addendum P14), generic names rather than any real certification.
 *  I   basic site.  II  every serving server has two legs.  III  maintainable without a shutdown.
 *  IV  survives any single fault.
 */
export function resilience(s: GameState): { level: 1 | 2 | 3 | 4; checks: ResilienceCheck[] } {
  const serving = s.devices.filter((d) => d.contractId !== null);
  const dual = serving.length > 0 && serving.every((d) => (d.psus ?? 1) === 2);
  const maintainable = (s.stats.changeDone ?? 0) >= 2 && (s.stats.changeFailed ?? 0) === 0;
  const power = !!s.backup && generatorTested(s) && s.backup.upsUnits >= 2;
  const spof = spofCount(s).servers === 0;
  const cooled = Object.values(spofReport(s)).every((r) => !r.singleCooler);
  const checks: ResilienceCheck[] = [
    { level: 2, label: 'Every serving server has two power legs', ok: dual },
    { level: 3, label: 'Two planned changes done with none going wrong', ok: maintainable },
    { level: 3, label: 'Generator tested and two UPS units', ok: power },
    { level: 4, label: 'No single point of failure on power', ok: spof },
    { level: 4, label: 'Every loaded rack has two coolers in reach', ok: cooled },
    { level: 4, label: 'Two internet uplinks and a serviced transfer switch', ok: s.uplinks.length >= 2 && !!s.backup && s.backup.atsServicedAt !== null && s.backup.atsServicedAt !== undefined },
  ];
  const ok = (lv: number) => checks.filter((c) => c.level === lv).every((c) => c.ok);
  const level = !ok(2) ? 1 : !ok(3) ? 2 : !ok(4) ? 3 : 4;
  return { level, checks };
}
