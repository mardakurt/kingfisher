import { describe, expect, it } from 'vitest';

import { START_FEN } from '@/chess/fen';
import { playSanAt } from '@/chess/game';
import { createTree } from '@/chess/tree/tree';
import type { GameTree } from '@/chess/tree/types';

import { OPENING_LABELS } from './opening-index.generated';
import { loadOpeningIndex } from './openings';
import { classifyPath } from './useOpeningClassification';
import { briefForLineage, VARIATION_BRIEFS, VARIATION_BRIEF_COUNT } from './variation-briefs';

function treeFrom(moves: readonly string[]): { tree: GameTree; node: string } {
  let tree = createTree(START_FEN);
  let node = tree.rootId;
  for (const san of moves) {
    const played = playSanAt(tree, node, san);
    if (!played.ok) throw new Error(`${san}: ${played.error.message}`);
    tree = played.value.tree;
    node = played.value.nodeId;
  }
  return { tree, node };
}

const index = await loadOpeningIndex();

/** The brief a player actually sees after playing a line, end to end. */
function briefAfter(moves: readonly string[]) {
  const { tree, node } = treeFrom(moves);
  const classification = classifyPath(index, tree, node);
  if (!classification) return null;
  const resolved = briefForLineage(classification.lineage ?? [classification.name]);
  return resolved ? { ...resolved, classification } : null;
}

const NAJDORF = ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'];

describe('variation briefs', () => {
  it('gives the right variation the right brief', () => {
    const found = briefAfter(NAJDORF);
    expect(found?.matched).toEqual(['Sicilian Defense', 'Najdorf Variation']);
    expect(found?.inherited).toBe(false);
    // The defining fact, not a mood.
    expect(found?.brief.defining).toContain('a6');
  });

  it('reaches the family brief when only the family is named', () => {
    const found = briefAfter(['e4', 'c5']);
    expect(found?.matched).toEqual(['Sicilian Defense']);
    expect(found?.brief.black).toContain('c-file');
  });

  it('gives transpositions the same brief', () => {
    /*
      Two move orders into the same Najdorf position. They are the same
      position, so they are the same variation, so they must be the same
      explanation — the whole reason classification is keyed on position.
    */
    const direct = briefAfter(NAJDORF);
    const transposed = briefAfter([
      'Nf3',
      'c5',
      'e4',
      'd6',
      'd4',
      'cxd4',
      'Nxd4',
      'Nf6',
      'Nc3',
      'a6',
    ]);
    expect(transposed?.classification.nodeId).toBeDefined();
    expect(transposed?.matched).toEqual(direct?.matched);
    expect(transposed?.brief).toBe(direct?.brief);
  });

  it('carries the brief down to a position past the last named one', () => {
    /*
      Twenty-four plies in, and the deepest position the dataset names was
      reached at fifteen. The position therefore has no brief of its own and
      must inherit the English Attack's — which is the honest answer, because
      that is still the variation being played.

      Note which kind of inheritance this is. `inherited` is about the
      *lineage*, and it is false here because the classified lineage is
      exactly a variation that has a brief of its own. The inheritance under
      test is positional, and the fact that carries it is `ply < node.ply` —
      the same fact the panel already uses to write "Last classified".
    */
    const moves = [
      ...NAJDORF,
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
      'g4',
      'b5',
      'g5',
      'b4',
    ];
    const { tree, node } = treeFrom(moves);
    const deep = briefAfter(moves);
    expect(tree.nodes[node]?.ply).toBe(24);
    expect(deep?.classification.ply).toBe(15);
    expect(deep?.classification.ply).toBeLessThan(tree.nodes[node]?.ply ?? 0);
    expect(deep?.matched).toEqual(['Sicilian Defense', 'Najdorf Variation', 'English Attack']);
    // The very same brief object the named position itself resolves to.
    expect(deep?.brief).toBe(briefAfter([...NAJDORF, 'Be3', 'e5', 'Nb3', 'Be6', 'f3'])?.brief);
  });

  it('prefers the more specific brief when one exists', () => {
    const specific = briefForLineage(['Sicilian Defense', 'Najdorf Variation', 'English Attack']);
    expect(specific?.matched).toEqual(['Sicilian Defense', 'Najdorf Variation', 'English Attack']);
    expect(specific?.inherited).toBe(false);
    expect(specific?.brief.white).toContain('kingside');
  });

  it('falls back through an uncovered qualifier to the covered ancestor', () => {
    const found = briefForLineage([
      'Sicilian Defense',
      'Najdorf Variation',
      'English Attack',
      'Anti-English Attack',
    ]);
    expect(found?.matched).toEqual(['Sicilian Defense', 'Najdorf Variation', 'English Attack']);
    expect(found?.inherited).toBe(true);
  });

  it('matches a family whose own dataset name carries a clause', () => {
    // "London System, with Bd3" is one dataset label, not a family and a
    // qualifier — there is no colon in it.
    const found = briefForLineage(['London System, with Bd3']);
    expect(found?.matched).toEqual(['London System']);
    expect(found?.inherited).toBe(true);
  });

  it('returns nothing rather than inventing one for an uncovered opening', () => {
    expect(briefForLineage(['Kadas Opening'])).toBeNull();
    expect(briefForLineage([])).toBeNull();
  });

  it('keeps every brief short enough to read in a panel', () => {
    for (const brief of VARIATION_BRIEFS) {
      const text = `${brief.defining} ${brief.white} ${brief.black}`;
      expect(text.length, brief.lineage.join(' > ')).toBeLessThanOrEqual(520);
      // Three fields, each one sentence; nothing here may become an essay.
      for (const part of [brief.defining, brief.white, brief.black]) {
        expect(part.length, brief.lineage.join(' > ')).toBeLessThanOrEqual(220);
        expect(part.trim().endsWith('.'), part).toBe(true);
      }
    }
  });

  it('gives every brief a provenance and a non-empty lineage', () => {
    for (const brief of VARIATION_BRIEFS) {
      expect(brief.source).toBe('kingfisher');
      expect(brief.lineage.length).toBeGreaterThan(0);
      expect(brief.lineage.every((part) => part.trim().length > 0)).toBe(true);
    }
    expect(VARIATION_BRIEF_COUNT).toBe(VARIATION_BRIEFS.length);
  });

  it('has no duplicate lineage keys', () => {
    const keys = VARIATION_BRIEFS.map((brief) => brief.lineage.join(' > '));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keys every brief to a family the vendored dataset actually names', () => {
    /*
      A brief for a family that does not exist in the dataset can never be
      shown, and would be invisible rot. Checked against the index itself
      rather than a second hand-written list.
    */
    const families = new Set<string>();
    for (const brief of VARIATION_BRIEFS) families.add(brief.lineage[0] as string);
    const known = new Set<string>();
    for (const label of OPENING_LABELS) {
      const colon = label.indexOf(': ');
      known.add(colon === -1 ? label : label.slice(0, colon));
    }
    for (const family of families) {
      const ok = known.has(family) || [...known].some((name) => name.startsWith(`${family}, `));
      expect(ok, `no dataset family named ${family}`).toBe(true);
    }
  });
});
