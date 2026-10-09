import { beforeAll, describe, expect, it } from 'vitest';

import {
  aliasesForLabel,
  alternativeMoveOrders,
  fenAfter,
  keyAfter,
  loadOpeningCatalog,
  OPENING_ALIASES,
  OPENING_FAMILIES,
  openingFamilies,
  searchOpenings,
  tokeniseMoves,
  type OpeningEntry,
} from './opening-catalog';
import { loadTheoryBook } from './theory-book';

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

  it.each(['A', 'B', 'C', 'D', 'E'])(
    'replays every line in ECO volume %s to the position it is filed under',
    (volume) => {
      // Replay all 3,810 entries, in five independently bounded cases. A single
      // case exceeded Vitest's five-second limit on the shared CI runner.
      // The dataset coverage and rule comparison stay unchanged.
      const entries = catalog.filter((entry) => entry.eco.startsWith(volume));
      expect(entries.length).toBeGreaterThan(0);
      const wrong = entries.filter((entry) => keyAfter(entry.moves) !== entry.key);
      expect(wrong.map((entry) => entry.label)).toEqual([]);
    },
  );

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
    const families = openingFamilies(catalog);
    const hit = new Set<string>();
    for (const entry of catalog) {
      for (const alias of aliasesForLabel(entry.label, families)) hit.add(alias);
    }
    const dead = Object.keys(OPENING_ALIASES).filter((alias) => !hit.has(alias));
    expect(dead).toEqual([]);
  });
});

describe('aliases do not borrow another opening’s name', () => {
  it('does not call a Caro-Kann a Kan, or a Panov line the Modern Defense', async () => {
    const kan = searchOpenings(catalog, 'kan', catalog.length);
    expect(
      kan.some(
        (result) => result.entry.label.includes('Sicilian') && result.entry.label.includes('Kan'),
      ),
    ).toBe(true);
    expect(kan.some((result) => result.entry.name === 'Caro-Kann Defense')).toBe(false);

    const modern = searchOpenings(catalog, 'modern defense', catalog.length);
    expect(modern.some((result) => result.entry.name === 'Modern Defense')).toBe(true);
    expect(modern.some((result) => result.entry.name === 'Caro-Kann Defense')).toBe(false);

    const book = await loadTheoryBook();
    const caro = catalog.find((entry) => entry.label.includes('Panov Attack, Modern Defense'));
    expect(caro).toBeDefined();
    const aliases = book.node(caro!.key)?.aliases ?? [];
    expect(aliases).toContain('caro-kann');
    expect(aliases).not.toContain('kan');
    expect(aliases).not.toContain('modern defense');
  });

  it('does not call a Closed Ruy Lopez a Closed Sicilian', async () => {
    const closed = searchOpenings(catalog, 'closed sicilian', catalog.length);
    expect(closed.some((result) => result.entry.label.startsWith('Sicilian Defense: Closed'))).toBe(
      true,
    );
    expect(closed.some((result) => result.entry.label.startsWith('Ruy Lopez'))).toBe(false);
    expect(closed.every((result) => /sicilian/i.test(result.entry.label))).toBe(true);

    const book = await loadTheoryBook();
    const ruy = catalog.find((entry) => entry.label.startsWith('Ruy Lopez: Closed'));
    expect(ruy).toBeDefined();
    expect(book.node(ruy!.key)?.aliases).not.toContain('closed sicilian');
  });

  it('does not call a Semi-Slav a Slav, and still calls a Slav a Slav', async () => {
    const slav = searchOpenings(catalog, 'slav', catalog.length);
    expect(slav.some((result) => result.entry.name === 'Slav Defense')).toBe(true);
    expect(slav.some((result) => result.entry.label.includes('Semi-Slav'))).toBe(false);

    const book = await loadTheoryBook();
    const semi = catalog.find((entry) => entry.name === 'Semi-Slav Defense');
    const slavLine = catalog.find((entry) => entry.name === 'Slav Defense');
    expect(semi).toBeDefined();
    expect(slavLine).toBeDefined();
    expect(book.node(semi!.key)?.aliases).toContain('semi-slav');
    expect(book.node(semi!.key)?.aliases).not.toContain('slav');
    expect(book.node(slavLine!.key)?.aliases).toContain('slav');
  });

  it('does not call an Accelerated London an Accelerated Dragon', async () => {
    const dragons = searchOpenings(catalog, 'accelerated dragon', catalog.length);
    expect(dragons.length).toBeGreaterThan(0);
    expect(dragons.every((result) => /dragon/i.test(result.entry.label))).toBe(true);
    expect(
      dragons.some((result) =>
        /accelerated london|accelerated panov|accelerated meran|accelerated averbakh/i.test(
          result.entry.label,
        ),
      ),
    ).toBe(false);

    const book = await loadTheoryBook();
    const london = catalog.find((entry) => entry.label.includes('Accelerated London'));
    const dragon = catalog.find((entry) => entry.label.includes('Accelerated Dragon'));
    const najdorf = catalog.find((entry) => entry.label.includes('Najdorf'));
    expect(london).toBeDefined();
    expect(dragon).toBeDefined();
    expect(book.node(london!.key)?.aliases).not.toContain('accelerated dragon');
    expect(book.node(dragon!.key)?.aliases).toContain('accelerated dragon');
    expect(book.node(najdorf!.key)?.aliases).toContain('najdorf');
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
