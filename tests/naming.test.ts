import { createGame, makeContract } from '../src/sim/state';
import { advance } from '../src/sim/sim';
import { generateOffers } from '../src/sim/economy';
import { nextContractName, contractLabel } from '../src/sim/naming';
import { serialize, deserialize } from '../src/sim/save';
import { rackModal, contractsPanel } from '../src/ui/views';
import { escapeHtml } from '../src/ui/format';
import { CHAPTER_ORDER } from '../src/data/chapters';
import type { GameState } from '../src/sim/types';

const labels = (s: GameState) => s.contracts.map(contractLabel);

describe('contract names', () => {
  it('picks the first unused project name for a customer, then numbers them', () => {
    const existing: { customer: string; name?: string }[] = [];
    const names: string[] = [];
    for (let i = 0; i < 7; i++) {
      const n = nextContractName(existing, 'ByteBank');
      names.push(n);
      existing.push({ customer: 'ByteBank', name: n });
    }
    expect(new Set(names).size).toBe(7);
    expect(names[0]).toBe('Payments Gateway');
    expect(names.some((n) => /\bII\b/.test(n))).toBe(true);
  });

  it('honours a preferred name unless it is taken, and handles unknown customers', () => {
    expect(nextContractName([], 'ByteBank', 'Special')).toBe('Special');
    expect(nextContractName([{ customer: 'ByteBank', name: 'Special' }], 'ByteBank', 'Special')).not.toBe('Special');
    expect(nextContractName([], 'Brand New Customer Inc.')).toBeTruthy();
    // the same project name may exist at two different customers
    expect(nextContractName([{ customer: 'A', name: 'Website' }], 'B', 'Website')).toBe('Website');
  });

  it.each(CHAPTER_ORDER)('every contract in %s has a distinct full name from the first minute', (ch) => {
    const s = createGame(ch, 'sysadmin', 1);
    const l = labels(s);
    expect(new Set(l).size).toBe(l.length);
    expect(s.contracts.every((c) => c.name.length > 2)).toBe(true);
  });

  it('two contracts from the same customer get different names, also over a long game', () => {
    const s = createGame('ch2', 'sysadmin', 5);
    s.failuresEnabled = false;
    for (let i = 0; i < 40; i++) generateOffers(s, 1);
    const l = labels(s);
    expect(new Set(l).size).toBe(l.length);
    const byCustomer = new Map<string, number>();
    for (const c of s.contracts) byCustomer.set(c.customer, (byCustomer.get(c.customer) ?? 0) + 1);
    expect(Math.max(...byCustomer.values())).toBeGreaterThan(1); // the scenario really has repeat customers
  });

  it('chapter 0 names its two bakery contracts to match the story', () => {
    const s = createGame('ch0', 'sysadmin', 1);
    expect(s.contracts[0]!.name).toBe('Till System');
    advance(s, 8 * 60);
    const offer = s.contracts.find((c) => c.status === 'offered')!;
    expect(offer.customer).toBe("Grandma's Bakery");
    expect(offer.name).toBe('Online Shop');
  });

  it('the UI tells contracts of the same customer apart', () => {
    const s = createGame('ch2', 'sysadmin', 1);
    const dup = makeContract(s, { ...s.contracts[1]!, customer: s.contracts[1]!.customer, name: undefined } as never, 'active');
    s.contracts.push(dup);
    const html = rackModal(s, s.racks[0]!.id);
    expect(html).toContain(escapeHtml(contractLabel(dup)));
    expect(html).toContain(escapeHtml(contractLabel(s.contracts[1]!)));
    expect(contractsPanel(s)).toContain(dup.name);
    expect(contractLabel(dup)).not.toBe(contractLabel(s.contracts[1]!));
  });

  it('old saves get names when loaded', () => {
    const s = createGame('ch2', 'sysadmin', 3);
    const old = JSON.parse(serialize(s));
    old.version = 4;
    for (const c of old.contracts) delete c.name;
    const loaded = deserialize(JSON.stringify(old));
    const l = labels(loaded);
    expect(new Set(l).size).toBe(l.length);
    expect(loaded.contracts.every((c) => c.name.length > 2)).toBe(true);
  });
});
