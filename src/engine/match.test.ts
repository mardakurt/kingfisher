import { describe, expect, it } from 'vitest';

import { START_FEN } from '@/chess/fen';
import { Position } from '@/chess/position';
import type { Fen, Uci } from '@/chess/types';

import {
  erf,
  matchPgn,
  matchStatistics,
  playMatchGame,
  pointsForA,
  validateMatchOptions,
  type MatchGame,
  type MatchSearch,
} from './match';

const game = (
  white: 'a' | 'b',
  result: MatchGame['result'],
  ending: MatchGame['ending'] = 'checkmate',
): MatchGame => ({
  white,
  moves: [],
  ending,
  result,
});

/** A scripted engine: plays the listed moves in order, whoever asks. */
const scripted = (moves: readonly string[]): { search: MatchSearch; asked: ('a' | 'b')[] } => {
  const asked: ('a' | 'b')[] = [];
  let at = 0;
  return {
    asked,
    search: async (engine) => {
      asked.push(engine);
      return (moves[at++] ?? null) as Uci | null;
    },
  };
};

describe('a match game', () => {
  it('asks the engine on move and ends on checkmate with the right result', async () => {
    // Fool's mate: 1.f3 e5 2.g4 Qh4#.
    const { search, asked } = scripted(['f2f3', 'e7e5', 'g2g4', 'd8h4']);
    const played = await playMatchGame(START_FEN, 'b', search, 100);
    expect(played).toMatchObject({ ending: 'checkmate', result: '0-1', white: 'b' });
    // B had White: B, A, B, A.
    expect(asked).toEqual(['b', 'a', 'b', 'a']);
    expect(pointsForA(played!)).toBe(1);
  });

  it('asks the right engine when the start position has Black to move', async () => {
    const fen = Position.fromFen(START_FEN).ok
      ? ('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1' as Fen)
      : START_FEN;
    const { search, asked } = scripted(['e7e5', 'g1f3']);
    await playMatchGame(fen, 'a', search, 2);
    expect(asked).toEqual(['b', 'a']);
  });

  it('stops at the ply limit as an unfinished game scored as a draw', async () => {
    const { search } = scripted(['g1f3', 'g8f6', 'f3g1', 'f6g8']);
    const played = await playMatchGame(START_FEN, 'a', search, 3);
    expect(played).toMatchObject({ ending: 'unfinished', result: '1/2-1/2' });
    expect(played!.moves).toHaveLength(3);
  });

  it('ends on threefold repetition', async () => {
    const shuffle = ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8'];
    const { search } = scripted(shuffle);
    const played = await playMatchGame(START_FEN, 'a', search, 100);
    expect(played?.ending).toBe('threefold-repetition');
    expect(played?.moves).toHaveLength(8);
  });

  it('refuses an illegal move from an engine rather than playing it', async () => {
    const { search } = scripted(['e2e5']);
    await expect(playMatchGame(START_FEN, 'a', search, 10)).rejects.toThrow('not legal');
  });
});

describe('match statistics', () => {
  it('scores from engine A’s side whichever colour it had', () => {
    const stats = matchStatistics([
      game('a', '1-0'),
      game('b', '1-0'),
      game('b', '0-1'),
      game('a', '1/2-1/2'),
    ]);
    expect(stats).toMatchObject({ wins: 2, losses: 1, draws: 1, score: 0.625 });
    // −400·log10(1/0.625 − 1) = 88.7
    expect(stats.elo).toBe(89);
  });

  it('gives an interval that narrows with more games, and leaves 100% unbounded', () => {
    const few = matchStatistics([...Array(6)].map((_, i) => game('a', i < 4 ? '1-0' : '0-1')));
    const many = matchStatistics(
      [...Array(60)].map((_, i) => game('a', i % 3 < 2 ? '1-0' : '0-1')),
    );
    expect(few.score).toBeCloseTo(many.score, 6);
    // Six games at 4–2: the 95% interval reaches past a 100% score, so it has no upper bound.
    expect(few.eloHigh).toBeNull();
    expect(few.eloLow!).toBeLessThan(many.eloLow!);
    // Sixty games at the same rate: bounded on both sides, around +120.
    expect(many.elo).toBe(120);
    expect(many.eloLow!).toBeGreaterThan(30);
    expect(many.eloHigh!).toBeLessThan(230);
    const sweep = matchStatistics([game('a', '1-0'), game('b', '0-1')]);
    expect(sweep.elo).toBeNull();
    expect(sweep.eloHigh).toBeNull();
  });

  it('computes the likelihood of superiority from wins and losses only', () => {
    expect(matchStatistics([game('a', '1/2-1/2')]).los).toBeNull();
    expect(matchStatistics([game('a', '1-0'), game('a', '0-1')]).los).toBeCloseTo(0.5, 6);
    // 10 wins, 4 losses: 0.5·(1+erf(6/√28)) ≈ 0.9455
    const stats = matchStatistics([
      ...[...Array(10)].map(() => game('a', '1-0')),
      ...[...Array(4)].map(() => game('a', '0-1')),
    ]);
    expect(stats.los).toBeCloseTo(0.9455, 3);
  });

  it('counts adjudicated games separately', () => {
    expect(matchStatistics([game('a', '1/2-1/2', 'unfinished')]).unfinished).toBe(1);
  });

  it('has an erf accurate to the table', () => {
    expect(erf(0)).toBeCloseTo(0, 6);
    expect(erf(1)).toBeCloseTo(0.8427008, 6);
    expect(erf(-0.5)).toBeCloseTo(-0.5204999, 6);
  });
});

describe('the match as PGN', () => {
  it('names the engines by colour and states an adjudication', () => {
    const games: MatchGame[] = [
      {
        white: 'a',
        moves: ['e2e4' as Uci, 'e7e5' as Uci],
        ending: 'unfinished',
        result: '1/2-1/2',
      },
    ];
    const pgn = matchPgn(
      START_FEN,
      games,
      { a: 'Engine A', b: 'Engine B' },
      { games: 1, msPerMove: 100, maxPlies: 2 },
    );
    expect(pgn).toContain('[White "Engine A"]');
    expect(pgn).toContain('[Black "Engine B"]');
    expect(pgn).toContain('[Termination "adjudicated draw: 2-ply limit reached"]');
    expect(pgn).toContain('1. e4 e5 1/2-1/2');
    expect(pgn).not.toContain('[FEN');
  });

  it('validates its budget', () => {
    expect(() => validateMatchOptions({ games: 0, msPerMove: 100, maxPlies: 200 })).toThrow();
    expect(() => validateMatchOptions({ games: 10, msPerMove: 100, maxPlies: 200 })).not.toThrow();
  });
});
