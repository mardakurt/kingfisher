import { beforeEach, describe, expect, it } from 'vitest';

import { asSan, asUci } from '@/chess/types';
import {
  addMove,
  annotate,
  branchAt,
  candidatesOf,
  childrenAt,
  countMoves,
  EMPTY_TREE,
  goTo,
  lines,
  maxDepth,
  movesAlong,
  removeBranch,
  resetCalculationIds,
  stepBack,
  type CalculationTree,
} from './tree';

const play = (tree: CalculationTree, san: string, uci = san) =>
  addMove(tree, { uci: asUci(uci), san: asSan(san) });

/** 1.Rd8 (2.Qe2 / 2.g4) and 1.Bxf6 — two candidates, one of them forking. */
function fixture(): CalculationTree {
  let tree = EMPTY_TREE;
  tree = play(tree, 'Rd8');
  tree = play(tree, 'Qe2');
  tree = stepBack(tree);
  tree = play(tree, 'g4');
  tree = goTo(tree, []);
  tree = play(tree, 'Bxf6');
  return tree;
}

beforeEach(resetCalculationIds);

describe('building a calculation tree', () => {
  it('records branches rather than flattening them into lines', () => {
    const tree = fixture();

    expect(tree.branches).toHaveLength(2);
    expect(tree.branches.map((branch) => branch.san)).toEqual(['Rd8', 'Bxf6']);
    // The fork is the point: 1.Rd8 has two replies, and the shape says so.
    expect(tree.branches[0]!.children.map((child) => child.san)).toEqual(['Qe2', 'g4']);
    expect(countMoves(tree.branches)).toBe(4);
    expect(maxDepth(tree.branches)).toBe(2);
  });

  it('descends into a move as it is played, so the next move continues the line', () => {
    let tree = play(EMPTY_TREE, 'Rd8');
    expect(branchAt(tree.branches, tree.path)?.san).toBe('Rd8');
    tree = play(tree, 'Qe2');
    expect(movesAlong(tree.branches, tree.path).map((move) => move.san)).toEqual(['Rd8', 'Qe2']);
  });

  it('navigates to a move already entered rather than recording it twice', () => {
    let tree = play(EMPTY_TREE, 'Rd8');
    tree = goTo(tree, []);
    const again = play(tree, 'Rd8');

    // A player replaying a line they already entered means "take me back
    // there", not "record it again".
    expect(again.branches).toHaveLength(1);
    expect(branchAt(again.branches, again.path)?.san).toBe('Rd8');
  });

  it('steps back without changing what was entered', () => {
    const tree = play(play(EMPTY_TREE, 'Rd8'), 'Qe2');
    const back = stepBack(tree);
    expect(back.path).toHaveLength(1);
    expect(countMoves(back.branches)).toBe(2);
    // At the root, stepping back does nothing rather than throwing.
    expect(stepBack(goTo(tree, [])).path).toEqual([]);
  });

  it('lists the moves available to continue from wherever the cursor is', () => {
    const tree = fixture();
    expect(childrenAt(tree.branches, []).map((branch) => branch.san)).toEqual(['Rd8', 'Bxf6']);
    expect(childrenAt(tree.branches, [tree.branches[0]!.id]).map((b) => b.san)).toEqual([
      'Qe2',
      'g4',
    ]);
    expect(childrenAt(tree.branches, ['nonexistent'])).toEqual([]);
  });
});

describe('editing a calculation tree', () => {
  it('removes a branch with everything under it, and rescues the cursor', () => {
    const tree = fixture();
    const removed = removeBranch(tree, tree.branches[0]!.id);

    expect(removed.branches.map((branch) => branch.san)).toEqual(['Bxf6']);
    expect(countMoves(removed.branches)).toBe(1);
    // The cursor was pointing at Bxf6, which survived, so it is untouched.
    expect(branchAt(removed.branches, removed.path)?.san).toBe('Bxf6');
  });

  it('leaves the cursor somewhere valid when the branch it was in is removed', () => {
    let tree = play(EMPTY_TREE, 'Rd8');
    const rootBranch = tree.branches[0]!.id;
    tree = play(tree, 'Qe2');
    const removed = removeBranch(tree, rootBranch);

    expect(removed.branches).toEqual([]);
    expect(removed.path).toEqual([]);
    expect(branchAt(removed.branches, removed.path)).toBeNull();
  });

  it('annotates a branch without disturbing its shape', () => {
    const tree = fixture();
    const target = tree.branches[0]!.children[1]!.id;
    const annotated = annotate(tree, target, {
      note: 'Too slow',
      estimate: { band: 'slightly-black', pawns: -0.4 },
    });

    const branch = annotated.branches[0]!.children[1]!;
    expect(branch.note).toBe('Too slow');
    expect(branch.estimate).toEqual({ band: 'slightly-black', pawns: -0.4 });
    expect(countMoves(annotated.branches)).toBe(countMoves(tree.branches));
  });
});

describe('reading a calculation tree back', () => {
  it('walks every root-to-leaf line, including the ones cut short', () => {
    const written = lines(fixture().branches).map((line) =>
      line.moves.map((move) => move.san).join(' '),
    );
    expect(written).toEqual(['Rd8 Qe2', 'Rd8 g4', 'Bxf6']);
  });

  it('derives the candidate list from the roots, so the two cannot disagree', () => {
    const candidates = candidatesOf(fixture().branches);

    expect(candidates.map((candidate) => candidate.san)).toEqual(['Rd8', 'Bxf6']);
    // The principal line under a candidate is the first line the player entered.
    expect(candidates[0]!.line).toEqual(['Rd8', 'Qe2']);
    expect(candidates[1]!.line).toEqual(['Bxf6']);
  });

  it('carries a branch note onto its candidate', () => {
    const tree = fixture();
    const annotated = annotate(tree, tree.branches[1]!.id, { note: 'Simplest' });
    expect(candidatesOf(annotated.branches)[1]!.note).toBe('Simplest');
  });

  it('reports nothing rather than something for an empty tree', () => {
    expect(lines([])).toEqual([]);
    expect(candidatesOf([])).toEqual([]);
    expect(countMoves([])).toBe(0);
    expect(maxDepth([])).toBe(0);
  });
});
