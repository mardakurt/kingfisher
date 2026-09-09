import { describe, expect, it } from 'vitest';

import { asFen, asSan, asUci } from '@/chess/types';
import type { ExplorerResult } from '@/database/types';
import type { RepertoireMove, RepertoirePositionRecord } from '@/persistence/domain';

import { computeCoverage, isActionable, MINIMUM_COVERAGE_GAMES, topGaps } from './coverage';

const move = (uci: string, san: string, role: RepertoireMove['role']): RepertoireMove => ({
  uci: asUci(uci),
  san: asSan(san),
  role,
  updatedAt: 0,
});

const result = (
  moves: { uci: string; san: string; games: number; averageRating?: number }[],
): ExplorerResult => ({
  fen: asFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -'),
  source: { id: 'test', name: 'Test' },
  totalGames: moves.reduce((sum, m) => sum + m.games, 0),
  white: 0,
  draws: 0,
  black: 0,
  moves: moves.map((m) => ({
    uci: asUci(m.uci),
    san: asSan(m.san),
    games: m.games,
    white: 0,
    draws: 0,
    black: 0,
    ...(m.averageRating !== undefined ? { averageRating: m.averageRating } : {}),
  })),
});

const position = (moves: RepertoireMove[]): RepertoirePositionRecord => ({
  id: 'rp1',
  repertoireId: 'rep',
  positionKey: 'key',
  fen: asFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -'),
  sideToMove: 'w',
  moves,
  depth: 0,
  createdAt: 0,
  updatedAt: 0,
  revision: 1,
});

describe('repertoire coverage against a reference source', () => {
  it('reports moves the source plays that the repertoire has not decided', () => {
    const report = computeCoverage(position([move('e2e4', 'e4', 'main')]), [
      {
        id: 'elite',
        name: 'Elite OTB',
        result: result([
          { uci: 'e2e4', san: 'e4', games: 1000 },
          { uci: 'd2d4', san: 'd4', games: 600 },
        ]),
      },
    ])[0]!;

    expect(report.gaps.map((gap) => gap.uci)).toEqual(['d2d4']);
    expect(report.gaps[0]?.games).toBe(600);
    expect(report.gaps[0]?.share).toBeCloseTo(600 / 1600, 4);
    expect(report.hasDecision).toBe(true);
  });

  it('does not report an "avoid" decision as a gap', () => {
    const report = computeCoverage(position([move('d2d4', 'd4', 'avoid')]), [
      {
        id: 'elite',
        name: 'Elite OTB',
        result: result([
          { uci: 'e2e4', san: 'e4', games: 1000 },
          { uci: 'd2d4', san: 'd4', games: 200 },
        ]),
      },
    ])[0]!;
    expect(report.gaps.map((gap) => gap.uci)).toEqual(['e2e4']);
  });

  it('drops a source move whose games are below the noise floor', () => {
    const tiny = MINIMUM_COVERAGE_GAMES - 1;
    const report = computeCoverage(position([]), [
      {
        id: 'elite',
        name: 'Elite OTB',
        result: result([
          { uci: 'e2e4', san: 'e4', games: 1000 },
          { uci: 'h2h4', san: 'h4', games: tiny },
        ]),
      },
    ])[0]!;
    expect(report.gaps.map((gap) => gap.uci)).toEqual(['e2e4']);
  });

  it('reports no gaps when the repertoire has decided every move the source reports', () => {
    const report = computeCoverage(
      position([move('e2e4', 'e4', 'main'), move('d2d4', 'd4', 'alternative')]),
      [
        {
          id: 'elite',
          name: 'Elite OTB',
          result: result([
            { uci: 'e2e4', san: 'e4', games: 1000 },
            { uci: 'd2d4', san: 'd4', games: 600 },
          ]),
        },
      ],
    )[0]!;
    expect(report.gaps).toEqual([]);
    expect(isActionable(report)).toBe(false);
  });

  it('keeps the same row whether the move came from a single source or many — gaps are reported once', () => {
    const report = computeCoverage(position([]), [
      { id: 'elite', name: 'Elite OTB', result: result([{ uci: 'e2e4', san: 'e4', games: 1000 }]) },
    ]);
    expect(report).toHaveLength(1);
    expect(report[0]?.sourceId).toBe('elite');
  });

  it('sorts top gaps by games, descending', () => {
    const report = computeCoverage(position([]), [
      {
        id: 'elite',
        name: 'Elite OTB',
        result: result([
          { uci: 'a', san: 'A', games: 10 },
          { uci: 'b', san: 'B', games: 80 },
          { uci: 'c', san: 'C', games: 40 },
        ]),
      },
    ])[0]!;
    const top = topGaps(report, 2);
    expect(top.map((gap) => gap.uci)).toEqual(['b', 'c']);
  });

  it('carries the average rating when the source reports one', () => {
    const report = computeCoverage(position([]), [
      {
        id: 'elite',
        name: 'Elite OTB',
        result: result([{ uci: 'e2e4', san: 'e4', games: 1000, averageRating: 2600 }]),
      },
    ])[0]!;
    expect(report.gaps[0]?.averageRating).toBe(2600);
  });
});
