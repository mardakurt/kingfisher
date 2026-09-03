import { describe, expect, it } from 'vitest';

import { parsePgn } from '@/chess/pgn';
import { asSan, asUci } from '@/chess/types';
import type { GameTree, NodeId } from '@/chess/tree/types';
import {
  EMPTY_TALLY,
  guessColorFor,
  guessTargets,
  judgeGuess,
  recordGuess,
} from './guess-the-move';

const GAME = `[Event "Model"]
[White "Capablanca, Jose"]
[Black "Marshall, Frank"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 O-O
8. c3 d5 9. exd5 Nxd5 10. Nxe5 Nxe5 11. Rxe5 c6 1-0`;

const tree = (): GameTree => parsePgn(GAME).games[0]!.tree;

describe('choosing what to guess', () => {
  it('asks about one side only, past the opening', () => {
    const targets = guessTargets(tree(), { color: 'w', fromPly: 12 });

    expect(targets.length).toBeGreaterThan(0);
    // One player's thinking, not a conversation.
    for (const target of targets) expect(target.sideToMove).toBe('w');
    // Recall is not the exercise, so the first plies are skipped.
    for (const target of targets) expect(target.ply).toBeGreaterThanOrEqual(12);
  });

  it('guesses from the position before the move, not after it', () => {
    const built = tree();
    const [target] = guessTargets(built, { color: 'w', fromPly: 12 });

    expect(target).toBeDefined();
    expect(built.nodes[target!.fromNodeId]?.fen).toBe(target!.fen);
    // The answer is the move made from that position.
    expect(built.nodes[target!.nodeId]?.move?.san).toBe(target!.playedSan);
  });

  it('asks only about marked moments when there are any', () => {
    const built = tree();
    const all = guessTargets(built, { color: 'w', fromPly: 0 });
    const chosen = [all[3]!.nodeId, all[5]!.nodeId] as readonly NodeId[];

    const targets = guessTargets(built, { color: 'w', onlyNodeIds: chosen });

    expect(targets.map((target) => target.nodeId)).toEqual(chosen);
    // A marked moment inside the opening is still asked about: the player
    // marked it, which overrides the default.
    expect(targets.some((target) => target.ply < 12)).toBe(
      all.slice(3, 6).some((target) => target.ply < 12),
    );
  });

  it('finds nothing rather than something for a colour that never moves', () => {
    const empty = parsePgn(`[Result "*"]\n\n*`).games[0]!.tree;
    expect(guessTargets(empty, { color: 'w' })).toEqual([]);
  });
});

describe('judging a guess', () => {
  const target = {
    nodeId: 'n1' as NodeId,
    fromNodeId: 'r' as NodeId,
    fen: 'x',
    ply: 20,
    sideToMove: 'w' as const,
    playedUci: asUci('e1e5'),
    playedSan: asSan('Rxe5'),
  };

  it('confirms a match in the game’s own terms', () => {
    const result = judgeGuess({ uci: asUci('e1e5'), san: asSan('Rxe5') }, target);
    expect(result.outcome).toBe('match');
    expect(result.message).toContain('Rxe5');
  });

  it('reports a difference, never a mistake', () => {
    const result = judgeGuess({ uci: asUci('d1h5'), san: asSan('Qh5') }, target);

    expect(result.outcome).toBe('different');
    expect(result.message).toBe('The game went Rxe5. You chose Qh5.');
    /*
      The game move is what one player chose on one day. A different move can
      be better, and the vocabulary must not teach deference to a result.
    */
    expect(result.message.toLowerCase()).not.toMatch(/wrong|incorrect|mistake|blunder/);
  });
});

describe('the tally', () => {
  it('counts matches and attempts, and nothing else', () => {
    const target = {
      nodeId: 'n1' as NodeId,
      fromNodeId: 'r' as NodeId,
      fen: 'x',
      ply: 20,
      sideToMove: 'w' as const,
      playedUci: asUci('e1e5'),
      playedSan: asSan('Rxe5'),
    };
    let tally = EMPTY_TALLY;
    tally = recordGuess(tally, judgeGuess({ uci: asUci('e1e5'), san: asSan('Rxe5') }, target));
    tally = recordGuess(tally, judgeGuess({ uci: asUci('d1h5'), san: asSan('Qh5') }, target));

    expect(tally).toEqual({ matched: 1, attempted: 2 });
    // No percentage: a number a player can optimise is a number that replaces
    // the thing worth optimising.
    expect(Object.keys(tally).sort()).toEqual(['attempted', 'matched']);
  });
});

describe('picking a side', () => {
  it('uses the user’s own alias when they are in the game', () => {
    expect(guessColorFor(tree(), ['Capablanca, Jose'])).toBe('w');
    expect(guessColorFor(tree(), ['  marshall, frank '])).toBe('b');
    expect(guessColorFor(tree(), ['Someone Else'])).toBeNull();
    expect(guessColorFor(tree(), [])).toBeNull();
  });
});
