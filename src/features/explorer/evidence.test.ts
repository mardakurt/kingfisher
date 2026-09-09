import { describe, expect, it } from 'vitest';

import { cp } from '@/chess/evaluation';
import { START_FEN } from '@/chess/fen';
import { asSan, asUci } from '@/chess/types';
import type { DatabaseMove, ExplorerResult } from '@/database/types';
import type { EngineAnalysis } from '@/engine/types';
import type { RepertoirePositionRecord } from '@/persistence/domain';

import { buildMoveEvidence, MINIMUM_TREND_GAMES, summariseEvidence, trendOf } from './evidence';

const move = (
  san: string,
  uci: string,
  games: number,
  white = 0,
  draws = 0,
  black = 0,
): DatabaseMove => ({
  uci: asUci(uci),
  san: asSan(san),
  games,
  white: white || games,
  draws,
  black,
});

const result = (moves: DatabaseMove[], totalGames?: number): ExplorerResult => ({
  fen: START_FEN,
  source: { id: 'test', name: 'Test' },
  totalGames: totalGames ?? moves.reduce((sum, entry) => sum + entry.games, 0),
  white: 0,
  draws: 0,
  black: 0,
  moves,
});

describe('gathering evidence for one move', () => {
  const base = result([
    move('e4', 'e2e4', 600, 300, 200, 100),
    move('d4', 'd2d4', 400, 200, 150, 50),
  ]);

  it('computes frequency against the position total, not the move list', () => {
    const evidence = buildMoveEvidence({ result: base, sideToMove: 'w' });
    expect(evidence[0]?.frequency).toBeCloseTo(0.6);
    expect(evidence[1]?.frequency).toBeCloseTo(0.4);
  });

  it('scores from the point of view of the side to move', () => {
    const white = buildMoveEvidence({ result: base, sideToMove: 'w' })[0];
    const black = buildMoveEvidence({ result: base, sideToMove: 'b' })[0];
    expect(white?.score).toBeCloseTo((300 + 100) / 600);
    expect(black?.score).toBeCloseTo((100 + 100) / 600);
  });

  it('attaches the engine rank only to moves the engine actually listed', () => {
    const analysis = {
      lines: [
        { rank: 1, score: cp(30), depth: 20, moves: [asUci('d2d4')] },
        { rank: 2, score: cp(20), depth: 20, moves: [asUci('g1f3')] },
      ],
    } as unknown as EngineAnalysis;

    const evidence = buildMoveEvidence({ result: base, sideToMove: 'w', analysis });
    expect(evidence.find((entry) => entry.san === asSan('d4'))?.engineRank).toBe(1);
    expect(evidence.find((entry) => entry.san === asSan('e4'))?.engineRank).toBeUndefined();
  });

  it('carries the repertoire role and keeps expected replies distinct', () => {
    const repertoire = {
      moves: [
        { uci: asUci('e2e4'), san: asSan('e4'), role: 'main', updatedAt: 0 },
        { uci: asUci('d2d4'), san: asSan('d4'), role: 'main', expected: true, updatedAt: 0 },
      ],
    } as unknown as RepertoirePositionRecord;

    const evidence = buildMoveEvidence({ result: base, sideToMove: 'w', repertoire });
    expect(evidence[0]?.repertoireRole).toBe('main');
    expect(evidence[0]?.repertoireExpected).toBe(false);
    expect(evidence[1]?.repertoireExpected).toBe(true);
  });

  it('keeps personal results as their own numbers rather than folding them in', () => {
    const personal = result([move('e4', 'e2e4', 10, 6, 2, 2)], 10);
    const evidence = buildMoveEvidence({ result: base, sideToMove: 'w', personal });
    expect(evidence[0]?.personalGames).toBe(10);
    expect(evidence[0]?.personalScore).toBeCloseTo(0.7);
    // The shared database figure is untouched by the personal one.
    expect(evidence[0]?.database.games).toBe(600);
  });

  it('lists only moves the database has, not engine-only candidates', () => {
    const analysis = {
      lines: [{ rank: 1, score: cp(30), depth: 20, moves: [asUci('h2h4')] }],
    } as unknown as EngineAnalysis;
    const evidence = buildMoveEvidence({ result: base, sideToMove: 'w', analysis });
    expect(evidence.map((entry) => entry.uci)).not.toContain(asUci('h2h4'));
  });
});

/**
 * The rule that keeps "recent theory" from becoming astrology: a move played
 * three times is not a trend however the percentages fall.
 */
describe('calling something a trend', () => {
  const withRecent = (
    games: number,
    recentGames: number,
    recentTotal: number,
  ): ReturnType<typeof buildMoveEvidence>[number] => {
    const all = result([move('e4', 'e2e4', games)], 1000);
    const recent = result([move('e4', 'e2e4', recentGames)], recentTotal);
    return buildMoveEvidence({ result: all, sideToMove: 'w', recent })[0]!;
  };

  it('refuses to judge a move with too few games overall', () => {
    expect(trendOf(withRecent(MINIMUM_TREND_GAMES - 1, 8, 20))).toBe('insufficient');
  });

  it('refuses to judge a move with too few recent games', () => {
    expect(trendOf(withRecent(300, 2, 10))).toBe('insufficient');
  });

  it('sees a rise when the recent share is clearly larger', () => {
    expect(trendOf(withRecent(100, 60, 100))).toBe('rising');
  });

  it('sees a fall when the recent share is clearly smaller', () => {
    expect(trendOf(withRecent(500, 10, 200))).toBe('falling');
  });

  it('calls a small wobble steady', () => {
    expect(trendOf(withRecent(300, 31, 100))).toBe('steady');
  });

  it('says nothing at all without a recent window', () => {
    const evidence = buildMoveEvidence({
      result: result([move('e4', 'e2e4', 300)], 1000),
      sideToMove: 'w',
    })[0]!;
    expect(trendOf(evidence)).toBe('insufficient');
  });

  it('marks 3-of-7 evidence as insufficient, never as a trend', () => {
    // The brief's warning: 3/7 games must not look equivalent to 3,000/7,000.
    const tiny = withRecent(7, 3, 7);
    expect(tiny.recentGames).toBe(3);
    expect(tiny.database.games).toBe(7);
    expect(trendOf(tiny)).toBe('insufficient');
  });
});

describe('the comparison summary', () => {
  it('lists each source as its own row and never combines them', () => {
    const all = result(
      [
        {
          ...move('e4', 'e2e4', 600, 300, 200, 100),
          averageRating: 2500,
          performance: 2530,
          lastPlayedYear: 2025,
        },
      ],
      1000,
    );
    const evidence = buildMoveEvidence({
      result: all,
      sideToMove: 'w',
      personal: result([move('e4', 'e2e4', 8, 5, 2, 1)], 8),
    })[0]!;

    const labels = summariseEvidence(evidence).map(([label]) => label);
    expect(labels).toEqual(
      expect.arrayContaining([
        'Games',
        'Frequency',
        'Score',
        'Average Elo',
        'Performance',
        'Last played',
        'My games',
      ]),
    );
    // No row purports to be an overall verdict.
    expect(labels).not.toContain('Rating');
    expect(labels).not.toContain('Quality');
    expect(labels).not.toContain('Recommendation');
  });
});
