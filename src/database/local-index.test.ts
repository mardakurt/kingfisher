import { describe, expect, it } from 'vitest';

import { parseSingleGame } from '@/chess/pgn';
import { expect as unwrap } from '@/chess/result';
import { START_FEN } from '@/chess/fen';
import { asFen } from '@/chess/types';

import { gameMetaFromHeaders, PositionIndex } from './local-index';
import { moveScore, performanceRating } from './types';

const game = (pgn: string, id: string) => {
  const parsed = unwrap(parseSingleGame(pgn));
  return { tree: parsed.tree, meta: gameMetaFromHeaders(id, parsed.tree.headers) };
};

const RUY = `[White "Carlsen, Magnus"]
[Black "Caruana, Fabiano"]
[Result "1-0"]
[WhiteElo "2850"]
[BlackElo "2800"]
[Date "2023.05.01"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0`;

const ITALIAN = `[White "Carlsen, Magnus"]
[Black "Nepomniachtchi, Ian"]
[Result "1/2-1/2"]
[WhiteElo "2850"]
[BlackElo "2790"]
[Date "2024.03.01"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 1/2-1/2`;

const SICILIAN = `[White "Firouzja, Alireza"]
[Black "Carlsen, Magnus"]
[Result "0-1"]
[WhiteElo "2760"]
[BlackElo "2850"]
[Date "2022.11.01"]

1. e4 c5 2. Nf3 d6 0-1`;

function buildIndex(): PositionIndex {
  const index = new PositionIndex();
  for (const [pgn, id] of [
    [RUY, 'g1'],
    [ITALIAN, 'g2'],
    [SICILIAN, 'g3'],
  ] as const) {
    const { tree, meta } = game(pgn, id);
    index.addGame(tree, meta);
  }
  return index;
}

const source = { id: 'test', name: 'Test' };

describe('PositionIndex', () => {
  it('counts games and positions', () => {
    const index = buildIndex();
    expect(index.gameCount).toBe(3);
    expect(index.positionCount).toBeGreaterThan(5);
  });

  it('aggregates the moves played from the start position', () => {
    const result = buildIndex().lookup(START_FEN, 'w', source);
    expect(result.totalGames).toBe(3);
    expect(result.moves).toHaveLength(1);
    expect(result.moves[0]?.san).toBe('e4');
    expect(result.moves[0]?.games).toBe(3);
    expect(result.moves[0]?.white).toBe(1);
    expect(result.moves[0]?.draws).toBe(1);
    expect(result.moves[0]?.black).toBe(1);
  });

  it('splits candidate moves at a branching position', () => {
    const afterThreeHalfMoves = asFen(
      'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 4 4',
    );
    const result = buildIndex().lookup(afterThreeHalfMoves, 'w', source);
    expect(result.moves.map((move) => move.san).sort()).toEqual(['Bb5', 'Bc4']);
    expect(result.totalGames).toBe(2);
  });

  it('finds transpositions, because it keys on the position', () => {
    const index = new PositionIndex();
    const direct = game('[Result "1-0"]\n\n1. d4 Nf6 2. c4 e6 3. Nf3 b6 1-0', 'a');
    const transposed = game('[Result "0-1"]\n\n1. Nf3 Nf6 2. c4 e6 3. d4 b6 0-1', 'b');
    index.addGame(direct.tree, direct.meta);
    index.addGame(transposed.tree, transposed.meta);

    // The move orders differ, the position does not; only the halfmove clock
    // separates the two FENs, and `positionKey` ignores it.
    const shared = asFen('rnbqkb1r/pppp1ppp/4pn2/8/2PP4/5N2/PP2PPPP/RNBQKB1R b KQkq - 1 3');
    const result = index.lookup(shared, 'b', source);
    expect(result.totalGames).toBe(2);
    expect(result.moves).toHaveLength(1);
    expect(result.moves[0]?.san).toBe('b6');
  });

  it('averages the rating of the side making the move', () => {
    const result = buildIndex().lookup(START_FEN, 'w', source);
    // White ratings: 2850, 2850, 2760.
    expect(result.moves[0]?.averageRating).toBe(2820);
  });

  it('filters by player and colour', () => {
    const index = buildIndex();
    const asBlack = index.lookup(START_FEN, 'w', source, {
      player: 'Carlsen',
      playerColor: 'b',
    });
    expect(asBlack.totalGames).toBe(1);

    const anySide = index.lookup(START_FEN, 'w', source, { player: 'Carlsen' });
    expect(anySide.totalGames).toBe(3);

    const missing = index.lookup(START_FEN, 'w', source, { player: 'Kasparov' });
    expect(missing.totalGames).toBe(0);
  });

  it('filters by year', () => {
    const index = buildIndex();
    expect(index.lookup(START_FEN, 'w', source, { sinceYear: 2023 }).totalGames).toBe(2);
    expect(index.lookup(START_FEN, 'w', source, { untilYear: 2022 }).totalGames).toBe(1);
  });

  it('returns an empty result for an unknown position instead of throwing', () => {
    const result = buildIndex().lookup(asFen('8/8/8/3k4/8/3K4/8/8 w - - 0 1'), 'w', source);
    expect(result.totalGames).toBe(0);
    expect(result.moves).toEqual([]);
  });

  it('lists the players who chose each move', () => {
    const result = buildIndex().lookup(START_FEN, 'w', source);
    expect(result.moves[0]?.notablePlayers).toContain('Carlsen, Magnus');
  });
});

describe('database statistics', () => {
  it('scores from the point of view of the side to move', () => {
    const move = {
      uci: 'e2e4' as never,
      san: 'e4' as never,
      games: 4,
      white: 2,
      draws: 1,
      black: 1,
    };
    expect(moveScore(move, 'w')).toBeCloseTo(0.625);
    expect(moveScore(move, 'b')).toBeCloseTo(0.375);
  });

  it('computes a performance rating and refuses impossible ones', () => {
    expect(performanceRating(0.5, 2400)).toBe(2400);
    expect(performanceRating(0.75, 2400)).toBe(2591);
    expect(performanceRating(1, 2400)).toBeUndefined();
    expect(performanceRating(0, 2400)).toBeUndefined();
  });
});
