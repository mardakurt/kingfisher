import { beforeEach, describe, expect, it } from 'vitest';

import { keyAfter } from './opening-catalog';
import { loadTheoryBook, resetTheoryBookForTests, THEORY_BOOK_PROVENANCE } from './theory-book';

/**
 * The book is built from the classification dataset, so these tests check the
 * structure rather than the chess: that the tree nests the way a book nests,
 * that a position on the board finds its place in it, and that no node invents
 * an opening the dataset does not name.
 */
/** A real English Attack, five plies past the last position the dataset names. */
const ENGLISH_ATTACK_20 = [
  'e4',
  'c5',
  'Nf3',
  'd6',
  'd4',
  'cxd4',
  'Nxd4',
  'Nf6',
  'Nc3',
  'a6',
  'Be3',
  'e5',
  'Nb3',
  'Be6',
  'f3',
  'Be7',
  'Qd2',
  'O-O',
  'O-O-O',
  'Nbd7',
] as const;

describe('theory book', () => {
  beforeEach(() => {
    resetTheoryBookForTests();
  });

  it('covers the whole named dataset', async () => {
    const book = await loadTheoryBook();
    // 3,810 named positions is what the vendored CC0 dataset carries. The
    // assertion is a floor rather than the number, so adding upstream entries
    // is not a test failure.
    expect(book.size).toBeGreaterThanOrEqual(3800);
  });

  it('nests the Najdorf under the Sicilian, and the English Attack under the Najdorf', async () => {
    /*
      The whole point of the module, stated as the line a player would browse.
      Each of these is looked up by position, so the test also proves the tree
      and the board agree about what a position is.
    */
    const book = await loadTheoryBook();
    const sicilian = keyAfter(['e4', 'c5']);
    const najdorf = keyAfter(['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6']);
    expect(sicilian).not.toBeNull();
    expect(najdorf).not.toBeNull();

    const path = book.path(najdorf as string);
    const labels = path.map((node) => node.label);
    /*
      The dataset names 1.e4 "King's Pawn Game", so that — not the Sicilian —
      is the root of this branch. What matters is the order: the Sicilian
      appears above the Najdorf, and the chain is unbroken.
    */
    expect(labels[0]).toBe("King's Pawn Game");
    expect(labels.at(-1)).toContain('Najdorf');
    const sicilianAt = labels.indexOf('Sicilian Defense');
    expect(sicilianAt).toBeGreaterThan(0);
    expect(sicilianAt).toBeLessThan(labels.length - 1);
    for (let index = 1; index < path.length; index += 1) {
      expect(path[index]?.parent).toBe(path[index - 1]?.key);
    }
  });

  it('reads a path without repeating the same name four times', async () => {
    /*
      The dataset calls 1.e4 c5, 2.Nf3 and 3.d4 all "Sicilian Defense", which
      is structurally right and reads badly in a breadcrumb.
    */
    const book = await loadTheoryBook();
    const najdorf = keyAfter(['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6']);
    const crumbs = book.crumbs(najdorf as string).map((node) => node.label);
    expect(new Set(crumbs).size).toBe(crumbs.length);
    expect(crumbs).toContain('Sicilian Defense');
    expect(crumbs.at(-1)).toContain('Najdorf');
    expect(crumbs.length).toBeLessThan(book.path(najdorf as string).length);
  });

  it('still places a line twenty plies deep, where the dataset names nothing', async () => {
    /*
      Part of the point of the book. The dataset stops naming this Najdorf at
      ply 15; a player at ply 20 is still in the English Attack, and the panel
      has to be able to say so — and to say how far past the last named
      position they are, rather than implying the name describes the position
      in front of them.
    */
    const book = await loadTheoryBook();
    const line = ENGLISH_ATTACK_20;
    expect(book.node(keyAfter(line) as string)).toBeNull();

    const match = book.deepest(line);
    expect(match).not.toBeNull();
    expect(match?.node.label).toContain('English Attack');
    expect(match?.ply).toBe(15);
    expect(match?.beyond).toBe(5);
  });

  it('reports an exact match as nothing beyond', async () => {
    const book = await loadTheoryBook();
    const match = book.deepest(['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6']);
    expect(match?.beyond).toBe(0);
    expect(match?.node.label).toContain('Najdorf');
  });

  it('lets a reader walk down a branch without playing the moves', async () => {
    const book = await loadTheoryBook();
    const najdorf = keyAfter(['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6']);
    const children = book.children(najdorf as string);
    expect(children.length).toBeGreaterThan(3);
    for (const child of children) {
      expect(child.parent).toBe(najdorf);
      // A branch prints the moves that make it, not the whole line again.
      expect(child.definingMoves.length).toBeGreaterThan(0);
      expect(child.moves.slice(0, -child.definingMoves.length).join(' ')).toBe(
        book.node(najdorf as string)?.moves.join(' '),
      );
    }
    expect(children.some((child) => child.label.includes('English Attack'))).toBe(true);
  });

  it('gives every node a parent that is genuinely shorter, and no cycles', async () => {
    const book = await loadTheoryBook();
    for (const root of book.roots) {
      expect(root.parent).toBeNull();
      expect(root.definingMoves).toEqual(root.moves);
    }
    let checked = 0;
    for (const family of book.families()) {
      for (const node of book.family(family)) {
        if (node.parent === null) continue;
        const parent = book.node(node.parent);
        expect(parent, `${node.label} has a missing parent`).not.toBeNull();
        expect(parent?.moves.length).toBeLessThan(node.moves.length);
        expect(node.moves.slice(0, parent?.moves.length ?? 0)).toEqual(parent?.moves);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(3000);
  });

  it('invents no opening the dataset does not name', async () => {
    /*
      The rule from AGENTS.md: opening names come from the licensed upstream
      classification, and nothing here may add to them. Every node's label must
      be the dataset's own, reachable from its family and variation.
    */
    const book = await loadTheoryBook();
    for (const family of book.families().slice(0, 40)) {
      for (const node of book.family(family)) {
        const expected = node.variation ? `${node.name}: ${node.variation}` : node.name;
        expect(node.label).toBe(expected);
        expect(node.lineage[0]).toBe(node.name);
      }
    }
  });

  it('answers with a brief inherited from the nearest described ancestor', async () => {
    const book = await loadTheoryBook();
    const englishAttack = keyAfter(ENGLISH_ATTACK_20.slice(0, 11));
    expect(englishAttack).not.toBeNull();
    const brief = book.brief(englishAttack as string);
    expect(brief).not.toBeNull();
    expect(brief?.brief.white.length).toBeGreaterThan(10);
    // Whether it is inherited is a fact the panel has to be able to state.
    expect(typeof brief?.inherited).toBe('boolean');
  });

  it('knows nothing about a position the dataset does not name', async () => {
    const book = await loadTheoryBook();
    const nonsense = keyAfter(['a4', 'h5', 'a5', 'h4', 'a6', 'h3']);
    expect(nonsense).not.toBeNull();
    expect(book.node(nonsense as string)).toBeNull();
    expect(book.path(nonsense as string)).toEqual([]);
    expect(book.brief(nonsense as string)).toBeNull();
  });

  it('carries the provenance of everything it says', async () => {
    expect(THEORY_BOOK_PROVENANCE.licence).toBe('CC0-1.0');
    expect(THEORY_BOOK_PROVENANCE.dataset).toBe('lichess-org/chess-openings');
  });

  it('offers the families a player would look for', async () => {
    const book = await loadTheoryBook();
    const families = book.families();
    for (const expected of [
      'Sicilian Defense',
      'French Defense',
      'Caro-Kann Defense',
      'Italian Game',
      'Ruy Lopez',
      "Queen's Gambit Declined",
      'Nimzo-Indian Defense',
      "King's Indian Defense",
    ]) {
      expect(families, `${expected} is missing from the book`).toContain(expected);
    }
  });

  it('indexes an opening by its named variations, not only by its next move', async () => {
    /*
      The difference between a move tree and a book. The Najdorf is four plies
      below the Sicilian and behind three positions the dataset also calls
      "Sicilian Defense", so it is not a child — but it is exactly what a
      reader looking at the Sicilian wants offered.
    */
    const book = await loadTheoryBook();
    const sicilian = keyAfter(['e4', 'c5']) as string;
    const names = book.variations(sicilian).map((node) => node.lineage.at(-1));

    expect(names).toContain('Najdorf Variation');
    expect(names).toContain('Dragon Variation');
    expect(names).toContain('Classical Variation');
    // None of which is a direct child.
    const children = book.children(sicilian).map((node) => node.label);
    expect(children).not.toContain('Sicilian Defense: Najdorf Variation');
  });

  it('offers the variations a player has heard of before the ones nobody has', async () => {
    /*
      Ordered by how much the dataset records below each line, which is the
      only ranking signal available that is not invented. Sorted by depth the
      Najdorf came seventieth of eighty-two, behind the Amazon Attack.
    */
    const book = await loadTheoryBook();
    const names = book
      .variations(keyAfter(['e4', 'c5']) as string)
      .slice(0, 8)
      .map((node) => node.lineage.at(-1));
    expect(names).toContain('Najdorf Variation');
    expect(names).toContain('Open');

    const replies = book
      .children(keyAfter(['e4']) as string)
      .slice(0, 6)
      .map((node) => node.name);
    for (const expected of ['Sicilian Defense', 'French Defense', 'Caro-Kann Defense']) {
      expect(replies, `${expected} should be near the top of Black's replies to 1.e4`).toContain(
        expected,
      );
    }
  });

  it('counts what the dataset records below a line, and nothing else', async () => {
    const book = await loadTheoryBook();
    const najdorf = book.node(
      keyAfter(['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6']) as string,
    );
    const amazon = book.node(keyAfter(['e4', 'c5', 'Qg4']) as string);
    expect(najdorf?.namedBelow).toBeGreaterThan(amazon?.namedBelow ?? 0);
    // A leaf has nothing below it, which is a fact and not a missing value.
    for (const root of book.roots) {
      expect(root.namedBelow).toBeGreaterThanOrEqual(0);
    }
  });

  it('offers no variations for a position the book does not know', async () => {
    const book = await loadTheoryBook();
    expect(book.variations('not-a-position')).toEqual([]);
  });

  it('records the nicknames a player would say out loud', async () => {
    const book = await loadTheoryBook();
    const najdorf = keyAfter(['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6']);
    expect(book.node(najdorf as string)?.aliases).toContain('najdorf');
  });
});
