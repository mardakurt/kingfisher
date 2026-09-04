import { beforeAll, describe, expect, it } from 'vitest';

import {
  alternativeMoveOrders,
  fenAfter,
  keyAfter,
  loadOpeningCatalog,
  OPENING_ALIASES,
  OPENING_FAMILIES,
  searchOpenings,
  tokeniseMoves,
  type OpeningEntry,
} from './opening-catalog';

/**
 * The library is the surface a player uses to find an opening by whatever they
 * happen to know about it — a code, a name, a nickname, or the moves. Each of
 * those is a separate way in, and each has a test, because a search box that
 * silently only handles one of them is worse than one that says so.
 *
 * Every expectation here is a real line: the assertions are checked against the
 * vendored CC0 dataset rather than against a fixture, so a re-vendoring that
 * renamed something fails here rather than in front of a user.
 */

let catalog: readonly OpeningEntry[];

beforeAll(async () => {
  catalog = await loadOpeningCatalog();
});

describe('the opening catalog', () => {
  it('carries every named position in the dataset, with its moves', () => {
    expect(catalog.length).toBeGreaterThanOrEqual(3800);
    for (const entry of catalog.slice(0, 200)) {
      expect(entry.moves.length).toBe(entry.plies);
      expect(keyAfter(entry.moves)).toBe(entry.key);
    }
  });

  it('replays every single line in the dataset to the position it is filed under', () => {
    // The whole point of the generated index is that it agrees with the rules
    // code. This is the check that it still does, over all 3,810 entries.
    const wrong = catalog.filter((entry) => keyAfter(entry.moves) !== entry.key);
    expect(wrong.map((entry) => entry.label)).toEqual([]);
  });

  it('covers all five ECO volumes', () => {
    const volumes = new Set(catalog.map((entry) => entry.eco[0]));
    expect([...volumes].sort()).toEqual(['A', 'B', 'C', 'D', 'E']);
  });
});

describe('the empty search box', () => {
  it('opens on families a chess player would name, not on ECO order', () => {
    const results = searchOpenings(catalog, '');
    const first = results.slice(0, 10).map((result) => result.entry.name);
    // A00 is the Amar Opening. A first screen that suggests Kingfisher's idea
    // of a notable opening is 1.Nh3 is a first screen that has to be fixed.
    expect(first).not.toContain('Amar Opening');
    expect(first).toContain('Sicilian Defense');
    expect(first).toContain('Ruy Lopez');
  });

  it('resolves every listed family to its own shortest line', () => {
    const results = searchOpenings(catalog, '');
    const missing = OPENING_FAMILIES.filter(
      (family) => !results.some((result) => result.entry.name === family),
    );
    expect(missing).toEqual([]);
    for (const family of OPENING_FAMILIES) {
      const shown = results.find((result) => result.entry.name === family)?.entry;
      const shortest = Math.min(
        ...catalog.filter((entry) => entry.name === family).map((entry) => entry.plies),
      );
      expect(shown?.plies, family).toBe(shortest);
    }
  });
});

describe('searching by ECO code', () => {
  it('finds a whole code', () => {
    const results = searchOpenings(catalog, 'B90');
    expect(results.length).toBeGreaterThan(10);
    expect(results.every((result) => result.entry.eco === 'B90')).toBe(true);
    expect(results.some((result) => result.entry.label.includes('Najdorf'))).toBe(true);
  });

  it('finds a whole volume from its letter', () => {
    const results = searchOpenings(catalog, 'e');
    expect(results.every((result) => result.entry.eco.startsWith('E'))).toBe(true);
  });
});

describe('searching by name', () => {
  const names = [
    ['Najdorf', 'Najdorf'],
    ['Poisoned Pawn', 'Poisoned Pawn'],
    ['English Attack', 'English Attack'],
    ['Berlin', 'Berlin'],
    ['Catalan', 'Catalan'],
    ['Semi-Slav', 'Semi-Slav'],
    ['Marshall', 'Marshall'],
    ['Dragon', 'Dragon'],
    ['Winawer', 'Winawer'],
    ['Meran', 'Meran'],
    ['Benko', 'Benko'],
    ['Sveshnikov', 'Sveshnikov'],
    ['Grünfeld', 'Grünfeld'],
    ['Stonewall', 'Stonewall'],
    ['Rossolimo', 'Rossolimo'],
  ] as const;

  it.each(names)('finds %s', (query, expected) => {
    const results = searchOpenings(catalog, query);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.entry.label).toContain(expected);
  });

  it('resolves an informal name through the alias table', () => {
    const results = searchOpenings(catalog, 'qgd');
    expect(results[0]?.reason).toBe('alias');
    expect(results[0]?.entry.label).toContain("Queen's Gambit Declined");
  });

  it('has no alias that resolves to nothing in the dataset', () => {
    const dead: string[] = [];
    for (const [alias, term] of Object.entries(OPENING_ALIASES)) {
      const hit = catalog.some((entry) => entry.label.toLowerCase().includes(term.toLowerCase()));
      if (!hit) dead.push(`${alias} → ${term}`);
    }
    expect(dead).toEqual([]);
  });
});

describe('searching by moves', () => {
  it('reads a numbered move sequence and lands on the named position', () => {
    const results = searchOpenings(catalog, '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6');
    expect(results[0]?.reason).toBe('moves');
    expect(results[0]?.entry.label).toContain('Najdorf');
  });

  it('reads bare SAN as well', () => {
    const results = searchOpenings(catalog, 'e4 e5 Nf3 Nc6 Bb5');
    expect(results[0]?.entry.label).toContain('Ruy Lopez');
  });

  it('falls back to every line that starts that way when the position is unnamed', () => {
    const results = searchOpenings(
      catalog,
      '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 O-O 6. Nf3 h6 7. Bh4 b6',
    );
    expect(results.length).toBeGreaterThan(0);
  });

  it('refuses input that is not moves rather than misreading it', () => {
    expect(tokeniseMoves('Sicilian Defense')).toBeNull();
    expect(tokeniseMoves('1. e4 c5')).toEqual(['e4', 'c5']);
  });
});

describe('searching by position', () => {
  it('finds the opening a FEN is filed under', () => {
    const najdorf = catalog.find((entry) => entry.label.endsWith('Najdorf Variation'));
    const fen = fenAfter(najdorf?.moves ?? []);
    expect(fen).not.toBeNull();
    const results = searchOpenings(catalog, fen as string);
    expect(results[0]?.reason).toBe('position');
    expect(results[0]?.entry.key).toBe(najdorf?.key);
  });
});

describe('transpositions', () => {
  it('finds another move order into the Nimzo-Indian', () => {
    const orders = alternativeMoveOrders(['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4']);
    expect(orders.length).toBeGreaterThan(0);
    for (const order of orders) {
      expect(keyAfter(order)).toBe(keyAfter(['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4']));
      expect([...order].sort()).toEqual(['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4'].sort());
    }
  });

  it('only ever offers orders that are legal and reach the same position', () => {
    // The Exchange Ruy Lopez does transpose — 2.Bb5 before Nf3 is a real move
    // order — so the property to hold is not "no results" but "every result is
    // a line the rules code played to the same place".
    const line = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Bxc6', 'dxc6'];
    const orders = alternativeMoveOrders(line);
    const target = keyAfter(line);
    for (const order of orders) {
      expect(keyAfter(order)).toBe(target);
      expect(order.join(' ')).not.toBe(line.join(' '));
    }
  });

  it('stays inside its bound on a line with a great many equivalent orders', () => {
    // Six quiet moves a side is where the factorial starts to bite. The
    // guarantee is not "few transpositions exist" but "this returns quickly
    // and never more than it was asked for".
    const line = ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'b6', 'g3', 'Bb7', 'Bg2', 'Be7', 'O-O', 'O-O'];
    const started = Date.now();
    const orders = alternativeMoveOrders(line, { limit: 4 });
    expect(orders.length).toBeLessThanOrEqual(4);
    expect(Date.now() - started).toBeLessThan(3000);
    for (const order of orders) expect(keyAfter(order)).toBe(keyAfter(line));
  });

  it('refuses lines too short or too long to be worth searching', () => {
    expect(alternativeMoveOrders(['e4', 'e5'])).toEqual([]);
    expect(alternativeMoveOrders(new Array(20).fill('e4'))).toEqual([]);
  });
});
