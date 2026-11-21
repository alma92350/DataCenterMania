import { CONTRACT_PROJECTS, GENERIC_PROJECTS } from '../data/content';

const ROMAN = ['', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII', ' IX', ' X'];

interface Named {
  customer: string;
  name?: string;
}

/** A project name for a new contract that no other contract of this customer already uses. */
export function nextContractName(existing: readonly Named[], customer: string, preferred?: string): string {
  const taken = new Set(existing.filter((c) => c.customer === customer && c.name).map((c) => c.name!));
  if (preferred && !taken.has(preferred)) return preferred;
  const pool = CONTRACT_PROJECTS[customer] ?? GENERIC_PROJECTS;
  for (const n of pool) if (!taken.has(n)) return n;
  for (let round = 1; round < ROMAN.length; round++) {
    for (const n of pool) if (!taken.has(n + ROMAN[round]!)) return n + ROMAN[round]!;
  }
  return `${pool[0]!} #${taken.size + 1}`;
}

/** "ByteBank · Payments Gateway": the unique, human-readable name of a contract. */
export function contractLabel(c: { customer: string; name: string }): string {
  return `${c.customer} · ${c.name}`;
}

/** Gives names to contracts that lack one (old saves), in array order. */
export function assignMissingNames(contracts: Named[]): void {
  const done: Named[] = contracts.filter((c) => c.name);
  for (const c of contracts) {
    if (c.name) continue;
    c.name = nextContractName(done, c.customer);
    done.push(c);
  }
}
