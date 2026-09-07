/**
 * Which positions an engine pass actually evaluates.
 *
 * The side filter is the part that is easy to get wrong, and wrong in a way
 * that looks right: judging a move needs the evaluation *before* it and
 * *after* it, so narrowing a pass to White's moves cannot simply drop Black's
 * positions — that would leave every swing with nothing to compare against and
 * a review queue that silently found nothing.
 */

import { describe, expect, it } from 'vitest';

import { START_FEN } from '@/chess/fen';
import { playSanAt } from '@/chess/game';
import { expect as unwrap } from '@/chess/result';
import { createTree } from '@/chess/tree/tree';
import type { GameTree, NodeId } from '@/chess/tree/types';

import { positionsFor } from './queue-store';

/** A mainline game, as the queue would receive it. */
function gameOf(moves: readonly string[]): { tree: GameTree } {
  let tree = createTree(START_FEN);
  let cursor: NodeId = tree.rootId;
  for (const san of moves) {
    const played = unwrap(playSanAt(tree, cursor, san));
    tree = played.tree;
    cursor = played.nodeId;
  }
  return { tree } as { tree: GameTree };
}

// 1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 — six plies, three of them White's.
const GAME = gameOf(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']);
const plies = (rows: readonly { ply: number }[]) => rows.map((row) => row.ply);

/** Sixteen plies of the Ruy Lopez. Long enough for the two parity cases. */
const LONG_GAME = [
  'e4',
  'e5',
  'Nf3',
  'Nc6',
  'Bb5',
  'a6',
  'Ba4',
  'Nf6',
  'O-O',
  'Be7',
  'Re1',
  'b5',
  'Bb3',
  'd6',
  'c3',
  'O-O',
] as const;

describe('choosing the positions to evaluate', () => {
  it('takes every position after the first when no side is chosen', () => {
    expect(plies(positionsFor(GAME as never, { strategy: 'every-move', startPly: 1 }))).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
  });

  it('treats an absent side as both, so an older job means what it meant', () => {
    const withoutSides = positionsFor(GAME as never, { strategy: 'every-move', startPly: 1 });
    const explicitlyBoth = positionsFor(GAME as never, {
      strategy: 'every-move',
      startPly: 1,
      sides: 'both',
    });
    expect(plies(withoutSides)).toEqual(plies(explicitlyBoth));
  });

  it('keeps the position after each of the chosen side’s moves, not only before', () => {
    /*
      White moves from the root and from plies 2 and 4. Judging those needs the
      evaluation at each of those positions *and* at the position each move
      produced — plies 1, 3 and 5. A filter that kept only White's own
      positions would return 2 and 4 alone and make every swing incomputable.
    */
    const white = positionsFor(GAME as never, {
      strategy: 'every-move',
      startPly: 1,
      sides: 'w',
    });
    expect(plies(white)).toEqual([1, 2, 3, 4, 5]);
  });

  it('does the same for Black', () => {
    // Black moves from plies 1, 3 and 5, producing 2, 4 and 6.
    const black = positionsFor(GAME as never, {
      strategy: 'every-move',
      startPly: 1,
      sides: 'b',
    });
    expect(plies(black)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  /*
    What narrowing to one side actually costs, which is not what this test
    used to claim.

    It asserted only that White's set is *smaller* than both sides', under a
    comment saying "on a real game the saving is close to half". The assertion
    passes on a difference of one, and one is the most it can ever be:
    judging a move needs the evaluation before it and after it, a side moves at
    every other ply, so the union of "before and after each of White's moves"
    is every position in the game. The only position ever dropped is a final
    one no move was played from.

    So the bound is asserted exactly now, at several lengths, and the option's
    real narrowing lives in `suggestReviewCandidates` — which decides whose
    decisions the review offers — rather than here.
  */
  it('saves at most one position, whatever the length of the game', () => {
    const long = gameOf([...LONG_GAME]);
    const both = positionsFor(long as never, { strategy: 'every-move', startPly: 1 }).length;
    const white = positionsFor(long as never, {
      strategy: 'every-move',
      startPly: 1,
      sides: 'w',
    }).length;
    const black = positionsFor(long as never, {
      strategy: 'every-move',
      startPly: 1,
      sides: 'b',
    }).length;
    expect(both - white).toBeLessThanOrEqual(1);
    expect(both - black).toBeLessThanOrEqual(1);
    // And never *more* than both sides, which would mean the filter had
    // started admitting positions the unfiltered pass leaves out.
    expect(white).toBeLessThanOrEqual(both);
    expect(black).toBeLessThanOrEqual(both);

    /*
      The same bound one ply longer, so that "ends on White's move" and "ends
      on Black's move" are both covered — they are the two cases, and the
      saving swaps between the colours.
    */
    const odd = gameOf([...LONG_GAME, 'a3']);
    const oddBoth = positionsFor(odd as never, { strategy: 'every-move', startPly: 1 }).length;
    for (const side of ['w', 'b'] as const) {
      const narrowed = positionsFor(odd as never, {
        strategy: 'every-move',
        startPly: 1,
        sides: side,
      }).length;
      expect(oddBoth - narrowed, side).toBeLessThanOrEqual(1);
      expect(narrowed, side).toBeLessThanOrEqual(oddBoth);
    }
  });

  it('still skips the opening when asked to', () => {
    expect(plies(positionsFor(GAME as never, { strategy: 'after-opening', startPly: 4 }))).toEqual([
      4, 5, 6,
    ]);
  });

  it('applies the side filter and the opening skip together', () => {
    const white = positionsFor(GAME as never, {
      strategy: 'after-opening',
      startPly: 4,
      sides: 'w',
    });
    // From White's set — 1, 2, 3, 4, 5 — the opening skip removes 1, 2 and 3.
    expect(plies(white)).toEqual([4, 5]);
  });
});
