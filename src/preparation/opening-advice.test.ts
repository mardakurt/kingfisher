import { describe, expect, it } from 'vitest';

import { positionKey } from '@/chess/fen';
import { parsePgn } from '@/chess/pgn';
import type { Fen, San, Uci } from '@/chess/types';
import type { DatabaseMove, ExplorerResult } from '@/database/types';
import { normalizeGame } from '@/persistence/import-game';

import { buildOpeningTree } from './index';
import { moverScore, openingAdvice } from './opening-advice';

const game = (white: string, black: string, result: string, moves: string) => {
  const parsed = parsePgn(
    `[White "${white}"]\n[Black "${black}"]\n[Result "${result}"]\n\n${moves} ${result}`,
  ).games[0];
  if (!parsed) throw new Error('fixture did not parse');
  return normalizeGame(parsed.tree);
};

// The player, as White, always answers 1...c5 with 2.Bc4 and loses most of them.
const GAMES = [
  ...Array.from({ length: 5 }, (_, i) =>
    game('Me', `Opp ${i}`, i === 0 ? '1-0' : '0-1', '1. e4 c5 2. Bc4 e6'),
  ),
  // As Black the player does fine: no advice expected there.
  ...Array.from({ length: 5 }, (_, i) => game(`Opp ${i}`, 'Me', '0-1', '1. d4 d5 2. c4 e6')),
];

const AFTER_C5 = 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';

const move = (
  uci: string,
  san: string,
  games: number,
  white: number,
  draws: number,
): DatabaseMove => ({
  uci: uci as Uci,
  san: san as San,
  games,
  white,
  draws,
  black: games - white - draws,
});

function source(table: Record<string, readonly DatabaseMove[]>) {
  const asked: string[] = [];
  const explore = async (fen: Fen): Promise<ExplorerResult> => {
    asked.push(positionKey(fen));
    const moves = table[positionKey(fen)] ?? [];
    return {
      fen,
      source: { id: 'ref', name: 'Reference' },
      totalGames: moves.reduce((sum, entry) => sum + entry.games, 0),
      white: 0,
      draws: 0,
      black: 0,
      moves,
    };
  };
  return { explore, asked };
}

const trees = {
  w: buildOpeningTree(GAMES, ['Me'], { playerColor: 'w' }),
  b: buildOpeningTree(GAMES, ['Me'], { playerColor: 'b' }),
};

describe('openingAdvice', () => {
  it('finds the position the player keeps losing, and what scored better in the source', async () => {
    const { explore } = source({
      [positionKey(AFTER_C5)]: [
        move('g1f3', 'Nf3', 4000, 1800, 1400),
        move('b1c3', 'Nc3', 900, 380, 300),
        move('f1c4', 'Bc4', 200, 70, 50),
        // Scores better, but on too few games to be evidence.
        move('d1h5', 'Qh5', 10, 9, 0),
      ],
    });
    const advice = await openingAdvice({ trees, explore });
    expect(advice).toHaveLength(1);
    const [row] = advice;
    expect(row!.color).toBe('w');
    expect(row!.line).toEqual(['e4', 'c5']);
    expect(row!.yours).toMatchObject({ san: 'Bc4', games: 5 });
    expect(row!.yours.score).toBeCloseTo(0.2);
    expect(row!.yoursInSource?.score).toBeCloseTo((70 + 25) / 200);
    expect(row!.alternatives.map((alt) => alt.san)).toEqual(['Nf3', 'Nc3']);
    expect(row!.alternatives[0]!.score).toBeCloseTo((1800 + 700) / 4000);
    expect(row!.source.name).toBe('Reference');
  });

  it('does not let a few lucky games of the player’s move in the source set the bar', async () => {
    const { explore } = source({
      [positionKey(AFTER_C5)]: [
        move('g1f3', 'Nf3', 4000, 1800, 1400),
        // Three games, all won: not evidence that 2.Bc4 scores 100%.
        move('f1c4', 'Bc4', 3, 3, 0),
      ],
    });
    const [row] = await openingAdvice({ trees, explore });
    expect(row!.yoursInSource).toMatchObject({ games: 3, score: 1 });
    expect(row!.alternatives.map((alt) => alt.san)).toEqual(['Nf3']);
  });

  it('reports nothing where nothing in the source scored better', async () => {
    const { explore } = source({
      [positionKey(AFTER_C5)]: [
        move('f1c4', 'Bc4', 200, 150, 20),
        move('g1f3', 'Nf3', 400, 100, 100),
      ],
    });
    expect(await openingAdvice({ trees, explore })).toEqual([]);
  });

  it('asks only about positions with enough of the player’s own games', async () => {
    const { explore, asked } = source({});
    await openingAdvice({ trees, explore });
    // The two positions where the player keeps losing with White — the start
    // (1.e4, 1 of 5) and after 1...c5 (2.Bc4, 1 of 5) — and none of Black's,
    // where the player scores well.
    expect(asked).toEqual([
      positionKey('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'),
      positionKey(AFTER_C5),
    ]);
    const loose = source({});
    await openingAdvice({ trees, explore: loose.explore, minGames: 6 });
    expect(loose.asked).toEqual([]);
  });
});

describe('moverScore', () => {
  it('scores for the side to move', () => {
    const counts = { games: 10, white: 6, draws: 2, black: 2 };
    expect(moverScore(counts, 'w')).toBeCloseTo(0.7);
    expect(moverScore(counts, 'b')).toBeCloseTo(0.3);
  });
});
