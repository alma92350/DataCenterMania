import { BACKUP, ENERGY } from '../data/catalog';
import { averageSatisfaction } from './crm';
import { capacityReport } from './capacity';
import { pueNow, setpointOf } from './site';
import { spofReport } from './spof';
import type { GameState } from './types';

export interface Advice {
  id: string;
  /** 1 = worth doing soon, 2 = do it now. */
  urgency: 1 | 2;
  text: string;
  /** The tab where the fix lives. */
  tab: 'alarms' | 'team' | 'contracts' | 'network' | 'shop' | 'goals';
}

const has = (s: GameState, f: GameState['features'][number]) => s.features.includes(f);

/**
 * The Advisor (v3.1): reads the reports the game already keeps (backup, single points of failure, capacity,
 * coolers, energy, customers, campus) and says what to do next, most urgent first. Pure and cheap.
 */
export function advice(s: GameState, limit = 3): Advice[] {
  const out: Advice[] = [];
  const b = s.backup;
  if (has(s, 'backup') && b) {
    if (b.generator !== 'none' && (b.testedAt === null || s.minute - b.testedAt > BACKUP.genTestValidMin)) {
      out.push({ id: 'testGenerator', urgency: 2, tab: 'network', text: 'The generator has not been tested recently. An untested generator often fails to start: have an electrician test it.' });
    }
    if (b.fuelMin !== undefined && b.generator !== 'none' && b.fuelMin < BACKUP.fuelLowMin) {
      out.push({ id: 'refuel', urgency: 2, tab: 'network', text: 'The generator tank is nearly empty. Refuel it before the next outage.' });
    }
    if (b.health < BACKUP.batteryWarnBelow) {
      out.push({ id: 'batteries', urgency: 1, tab: 'network', text: 'The UPS batteries are worn. Replace them before they are needed.' });
    }
    if (!s.techs.some((t) => t.role === 'elec')) {
      out.push({ id: 'electrician', urgency: 1, tab: 'team', text: 'Nobody on the team can service backup power. Hire an electrician.' });
    }
  }
  if (has(s, 'redundancy') && s.racks.length) {
    const single = Object.values(spofReport(s)).reduce((n, r) => n + r.power.length, 0);
    if (single > 0) out.push({ id: 'spof', urgency: 1, tab: 'shop', text: `Servers on a single power cord: ${single}. Add a second power supply (open the SPOF overlay with O).` });
  }
  const cap = capacityReport(s);
  const worst = [...cap.resources].filter((r) => r.cap > 0).sort((a, b2) => b2.pct - a.pct)[0]!;
  if (worst && worst.pct >= 90 && s.devices.length > 0) {
    out.push({ id: `capacity-${worst.key}`, urgency: worst.pct >= 100 ? 2 : 1, tab: 'network', text: `${worst.label} is at ${Math.round(worst.pct)}%. Add capacity before you take another customer.` });
  }
  if (has(s, 'maintenance')) {
    const dirty = s.coolers.filter((c) => c.on && !c.broken && c.health < 0.4).length;
    if (dirty) out.push({ id: 'filters', urgency: 1, tab: 'alarms', text: `Coolers with dirty filters: ${dirty}. Send an HVAC technician before they fail.` });
  }
  if (s.site && has(s, 'energy') && s.racks.length) {
    const pue = pueNow(s);
    if (pue > 1.55 && !s.site.economizer && s.cash >= ENERGY.economizerPrice) {
      out.push({ id: 'freeCooling', urgency: 1, tab: 'network', text: `PUE is ${pue.toFixed(2)}. Free cooling would cut your cooling bill on cool nights.` });
    } else if (pue > 1.5 && setpointOf(s) <= ENERGY.setpointDefault) {
      out.push({ id: 'setpoint', urgency: 1, tab: 'network', text: `PUE is ${pue.toFixed(2)}. Raising the supply-air setpoint a few degrees saves cooling energy (mind the margin).` });
    }
  }
  if (has(s, 'crm') && averageSatisfaction(s) < 50) {
    out.push({ id: 'satisfaction', urgency: 1, tab: 'contracts', text: 'Customers are unhappy. Close their tickets quickly and keep every SLA to win them back before renewals.' });
  }
  if (s.campus && s.campus.goodwill < 40 && !s.campus.moratorium) {
    out.push({ id: 'goodwill', urgency: 1, tab: 'goals', text: 'Community goodwill is low. A community fund or heat reuse wins it back before the county blocks new builds.' });
  }
  return out.sort((a, b2) => b2.urgency - a.urgency).slice(0, limit);
}
