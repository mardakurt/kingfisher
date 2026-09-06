import { describe, expect, it } from 'vitest';

import type { ExplorerResult } from '@/database/types';
import type { Fen } from '@/chess/types';

import { compareSources, describeDifference, type SourceColumn } from './source-comparison';

const FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' as Fen;

const result = (
  id: string,
  totalGames: number,
  moves: readonly { san: string; uci: string; games: number; white?: number; draws?: number }[],
): ExplorerResult => ({
  fen: FEN,
  source: { id, name: id },
  totalGames,
  white: 0,
  draws: 0,
  black: 0,
  moves: moves.map((move) => ({
    uci: move.uci as never,
    san: move.san as never,
    games: move.games,
    white: move.white ?? 0,
    draws: move.draws ?? 0,
    black: move.games - (move.white ?? 0) - (move.draws ?? 0),
  })),
});

const column = (id: string, res: ExplorerResult | null | undefined): SourceColumn => ({
  id,
  name: id,
  result: res,
});

/**
 * The one rule this whole module exists to keep: populations are never merged.
 *
 * Elite over-the-board play and 2400+ blitz disagree, and the disagreement is
 * the reason to look. An "overall" column would average exactly the signal
 * somebody opened the comparison to see.
 */
describe('comparing sources', () => {
  const otb = column(
    'otb',
    result('otb', 1000, [
      { san: 'Be3', uci: 'f1e3', games: 210 },
      { san: 'Bg5', uci: 'f1g5', games: 170 },
    ]),
  );
  const online = column(
    'online',
    result('online', 500, [
      { san: 'Bg5', uci: 'f1g5', games: 135 },
      { san: 'Be3', uci: 'f1e3', games: 95 },
      { san: 'h3', uci: 'h2h3', games: 60 },
    ]),
  );

  it('gives each source its own column, and computes no combined figure', () => {
    const comparison = compareSources([otb, online], true);
    const bg5 = comparison.rows.find((row) => row.san === 'Bg5');
    expect(bg5?.cells).toHaveLength(2);
    expect(bg5?.cells[0]?.share).toBeCloseTo(0.17, 3);
    expect(bg5?.cells[1]?.share).toBeCloseTo(0.27, 3);
    // Nothing anywhere in the row is an average of the two.
    expect(bg5?.cells.map((cell) => cell.share)).toEqual([0.17, 0.27]);
  });

  it('keeps a move one population plays and the other does not', () => {
    /*
      The finding, not an inconvenience. 6.h3 appears in the online source and
      not in the over-the-board one, and dropping the row because one column is
      empty would hide it.
    */
    const comparison = compareSources([otb, online], true);
    const h3 = comparison.rows.find((row) => row.san === 'h3');
    expect(h3, '6.h3 was dropped because one source does not have it').toBeDefined();
    expect(h3?.cells[0]?.absence).toBe('not-played');
    expect(h3?.cells[0]?.games).toBe(0);
    expect(h3?.cells[1]?.share).toBeCloseTo(0.12, 3);
  });

  it('tells "not played here" apart from "this source cannot answer"', () => {
    const broken = column('broken', null);
    const loading = column('loading', undefined);
    const comparison = compareSources([otb, broken, loading], true);
    const row = comparison.rows[0];
    expect(row?.cells[1]?.absence).toBe('unavailable');
    expect(row?.cells[2]?.absence).toBe('loading');
    // Neither of which is a zero that could be read as evidence.
    expect(row?.cells[1]?.share).toBeNull();
    expect(row?.cells[2]?.share).toBeNull();
  });

  it('tells an empty position apart from an absent move', () => {
    const empty = column('empty', result('empty', 0, []));
    const comparison = compareSources([otb, empty], true);
    expect(comparison.rows[0]?.cells[1]?.absence).toBe('no-games');
  });

  it('orders by the strongest showing in any source, not by the first source', () => {
    /*
      Otherwise the comparison is just the first source's table with extra
      columns, and a move that one population loves is buried.
    */
    const quiet = column(
      'quiet',
      result('quiet', 1000, [
        { san: 'Be3', uci: 'f1e3', games: 20 },
        { san: 'Bg5', uci: 'f1g5', games: 10 },
      ]),
    );
    const loud = column('loud', result('loud', 100, [{ san: 'h3', uci: 'h2h3', games: 80 }]));
    const comparison = compareSources([quiet, loud], true);
    expect(comparison.rows[0]?.san).toBe('h3');
  });

  it('scores from the point of view of the side to move', () => {
    const white = compareSources(
      [
        column(
          'a',
          result('a', 100, [{ san: 'e4', uci: 'e2e4', games: 100, white: 60, draws: 20 }]),
        ),
      ],
      true,
    );
    const black = compareSources(
      [
        column(
          'a',
          result('a', 100, [{ san: 'e4', uci: 'e2e4', games: 100, white: 60, draws: 20 }]),
        ),
      ],
      false,
    );
    expect(white.rows[0]?.cells[0]?.score).toBeCloseTo(0.7, 3);
    expect(black.rows[0]?.cells[0]?.score).toBeCloseTo(0.3, 3);
  });

  it('reports nothing answered when no source has games', () => {
    const comparison = compareSources([column('a', null), column('b', undefined)], true);
    expect(comparison.answered).toBe(false);
    expect(comparison.rows).toEqual([]);
  });

  it('describes a difference as arithmetic, never as a conclusion', () => {
    const comparison = compareSources([otb, online], true);
    const bg5 = comparison.rows.find((row) => row.san === 'Bg5');
    const sentence = describeDifference(bg5!, otb, online);
    expect(sentence).toBe('Bg5: 17.0% in otb, 27.0% in online.');
    for (const forbidden of ['new main line', 'better', 'best', 'trend', 'refuted']) {
      expect(sentence?.toLowerCase()).not.toContain(forbidden);
    }
  });

  it('says nothing rather than something wrong when a side has no number', () => {
    const comparison = compareSources([otb, column('broken', null)], true);
    const row = comparison.rows[0];
    expect(describeDifference(row!, otb, column('broken', null))).toBeNull();
  });
});
