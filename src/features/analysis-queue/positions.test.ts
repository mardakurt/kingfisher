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

  it('costs less than both sides on a longer game', () => {
    // The point of the option. On a real game the saving is close to half; on
    // a six-ply toy the overlap of before-and-after positions hides it, so
    // this uses a game long enough for the difference to show.
    const long = gameOf([
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
    ]);
    const both = positionsFor(long as never, { strategy: 'every-move', startPly: 1 }).length;
    const white = positionsFor(long as never, {
      strategy: 'every-move',
      startPly: 1,
      sides: 'w',
    }).length;
    expect(white).toBeLessThan(both);
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
