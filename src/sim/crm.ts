import { chance } from '../core/rng';
import { CRM } from '../data/catalog';
import { generatorTested } from './backup';
import { contractLabel } from './naming';
import { addLog, showTip } from './state';
import type { Audit, Contract, GameState } from './types';

export const satisfactionOf = (c: Contract): number => c.satisfaction ?? CRM.startSatisfaction;

export function adjustSatisfaction(c: Contract, delta: number): void {
  c.satisfaction = Math.max(0, Math.min(100, satisfactionOf(c) + delta));
}

/** Called once a day for every active contract with whether its SLA was met. */
export function dailySatisfaction(s: GameState, c: Contract, met: boolean): void {
  if (!s.features.includes('crm')) return;
  adjustSatisfaction(c, met ? CRM.metDay : CRM.missedDay);
}

export const averageSatisfaction = (s: GameState): number => {
  const list = s.contracts.filter((c) => c.status === 'active');
  return list.length ? list.reduce((n, c) => n + satisfactionOf(c), 0) / list.length : 100;
};

/** At the end of its term a happy customer usually renews (a bit pricier); an unhappy one leaves. */
export function onContractExpiry(s: GameState, c: Contract, today: number): 'renewed' | 'churned' {
  const p = Math.max(0, Math.min(1, (satisfactionOf(c) - CRM.renewBelow) / CRM.renewSpan));
  if (chance(s.rng, p)) {
    c.renewals = (c.renewals ?? 0) + 1;
    c.expiresDay = today + CRM.renewDays;
    c.revenuePerDay = Math.round(c.revenuePerDay * CRM.renewPriceMult);
    addLog(s, 'success', `🤝 ${contractLabel(c)} renewed for ${CRM.renewDays} more days at a higher price (satisfaction ${Math.round(satisfactionOf(c))}).`);
    return 'renewed';
  }
  s.reputation = Math.max(0, s.reputation - CRM.churnRep);
  addLog(s, 'fail', `👋 ${contractLabel(c)} is leaving: satisfaction was only ${Math.round(satisfactionOf(c))}.`);
  return 'churned';
}

/** A simplified compliance audit: does the site look like it is run properly? */
export function runAudit(s: GameState): Audit {
  const serving = s.devices.filter((d) => d.contractId !== null);
  const checks = [
    { label: 'The generator was tested recently', ok: generatorTested(s) },
    { label: 'Every serving server has two power legs', ok: serving.length > 0 && serving.every((d) => (d.psus ?? 1) === 2) },
    { label: 'No planned change went wrong', ok: (s.stats.changeFailed ?? 0) === 0 },
    { label: 'Two UPS units and a serviced transfer switch', ok: !!s.backup && s.backup.upsUnits >= 2 && s.backup.atsServicedAt != null },
  ];
  const passed = checks.filter((x) => x.ok).length >= CRM.auditPassChecks;
  const audit: Audit = { at: s.minute, done: true, passed, checks };
  s.audit = audit;
  if (passed) {
    s.reputation = Math.min(5, s.reputation + 0.2);
    addLog(s, 'success', '📑 The auditor is satisfied: you passed the compliance audit.');
  } else {
    s.reputation = Math.max(0, s.reputation - CRM.auditFailRep);
    for (const c of s.contracts) if (c.status === 'active') adjustSatisfaction(c, CRM.auditFailSatisfaction);
    addLog(s, 'fail', `📑 The auditor found ${checks.filter((x) => !x.ok).length} problems. Compliance audit failed: customers are nervous.`);
  }
  showTip(s, 'audit');
  return audit;
}
