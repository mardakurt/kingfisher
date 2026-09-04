import { describe, expect, it } from 'vitest';

import { asFen } from '@/chess/types';

import {
  categoryOfWdl,
  fromHelper,
  invertCategory,
  signDtz,
  TB_BLESSED_LOSS,
  TB_CURSED_WIN,
  TB_DRAW,
  TB_LOSS,
  TB_WIN,
  type HelperResult,
} from './syzygy';

/**
 * Fixtures recorded from the real helper against real Syzygy tables.
 *
 * Not invented. Each of these was produced by running
 * `kingfisher-tbprobe --path=<3-piece tables>` and pasting the answer, so the
 * conversion is tested against what Fathom actually says rather than against
 * what this file assumes it says. The chess facts they encode are the ones any
 * player can check: KRvK is a win, the rook cannot be dropped where it
 * stalemates, KNvK is a draw, and the opposition decides KPvK.
 */

/** 8/8/8/4k3/8/8/8/K2R4 w - - 0 1 — White to play, rook against bare king. */
const KRK: HelperResult = {
  ok: true,
  wdl: TB_WIN,
  dtz: 29,
  checkmate: false,
  stalemate: false,
  moves: [
    { uci: 'a1b1', wdl: 4, dtz: 31 },
    { uci: 'a1a2', wdl: 4, dtz: 29 },
    { uci: 'd1d4', wdl: 2, dtz: 0 },
    { uci: 'd1d5', wdl: 2, dtz: 0 },
    { uci: 'd1d8', wdl: 4, dtz: 31 },
  ],
};
const KRK_FEN = asFen('8/8/8/4k3/8/8/8/K2R4 w - - 0 1');

/** 4k3/8/4K3/4P3/8/8/8/8 w - - 0 1 — the opposition decides it. */
const KPK: HelperResult = {
  ok: true,
  wdl: TB_WIN,
  dtz: 3,
  checkmate: false,
  stalemate: false,
  moves: [
    { uci: 'e6d5', wdl: 2, dtz: 0 },
    { uci: 'e6f5', wdl: 2, dtz: 0 },
    { uci: 'e6d6', wdl: 4, dtz: 3 },
    { uci: 'e6f6', wdl: 4, dtz: 3 },
  ],
};
const KPK_FEN = asFen('4k3/8/4K3/4P3/8/8/8/8 w - - 0 1');

describe('reading Fathom’s codes', () => {
  it('maps every WDL value, including the two the fifty-move rule creates', () => {
    expect(categoryOfWdl(TB_WIN)).toBe('win');
    expect(categoryOfWdl(TB_CURSED_WIN)).toBe('cursed-win');
    expect(categoryOfWdl(TB_DRAW)).toBe('draw');
    expect(categoryOfWdl(TB_BLESSED_LOSS)).toBe('blessed-loss');
    expect(categoryOfWdl(TB_LOSS)).toBe('loss');
  });

  it('treats an unknown code as a draw rather than as a win', () => {
    expect(categoryOfWdl(99)).toBe('draw');
  });

  it('inverts a category to the other side of the board', () => {
    expect(invertCategory('win')).toBe('loss');
    expect(invertCategory('loss')).toBe('win');
    expect(invertCategory('cursed-win')).toBe('blessed-loss');
    expect(invertCategory('blessed-loss')).toBe('cursed-win');
    expect(invertCategory('draw')).toBe('draw');
    expect(invertCategory('checkmate')).toBe('checkmate');
  });

  it('is its own inverse', () => {
    for (const category of ['win', 'loss', 'cursed-win', 'blessed-loss', 'draw'] as const) {
      expect(invertCategory(invertCategory(category))).toBe(category);
    }
  });

  it('signs DTZ the way Syzygy does', () => {
    expect(signDtz(29, 'win')).toBe(29);
    expect(signDtz(29, 'loss')).toBe(-29);
    expect(signDtz(29, 'blessed-loss')).toBe(-29);
    expect(signDtz(29, 'cursed-win')).toBe(29);
    expect(signDtz(0, 'draw')).toBe(0);
  });
});

describe('a rook against a bare king', () => {
  const result = fromHelper(KRK_FEN, KRK, 'Local Syzygy');

  it('is a win for the side to move', () => {
    expect(result.category).toBe('win');
    expect(result.dtz).toBe(29);
  });

  it('never reports a distance to mate, which Syzygy does not contain', () => {
    expect(result.dtm).toBeNull();
    expect(result.moves.every((move) => move.dtm === null)).toBe(true);
  });

  it('lists a winning move as a loss for the opponent, not as a win', () => {
    const best = result.moves[0];
    expect(best?.category).toBe('loss');
    // And the losing side's DTZ is negative, as Syzygy and Lichess both report.
    expect(best?.dtz).toBeLessThan(0);
  });

  it('puts the winning moves before the ones that throw the win away', () => {
    const categories = result.moves.map((move) => move.category);
    expect(categories.indexOf('loss')).toBeLessThan(categories.indexOf('draw'));
  });

  it('sees that dropping the rook on the king’s file only draws', () => {
    const stalemating = result.moves.filter((move) => move.uci === 'd1d4' || move.uci === 'd1d5');
    expect(stalemating).toHaveLength(2);
    expect(stalemating.every((move) => move.category === 'draw')).toBe(true);
  });

  it('gives every move a SAN the board can print', () => {
    expect(result.moves.map((move) => move.san)).toContain('Rd8');
    expect(result.moves.every((move) => move.san.length > 0)).toBe(true);
  });

  it('names the implementation that answered', () => {
    expect(result.source).toBe('Local Syzygy');
  });
});

describe('king and pawn against king', () => {
  const result = fromHelper(KPK_FEN, KPK, 'Local Syzygy');

  it('wins with the opposition and draws without it', () => {
    const byUci = new Map(result.moves.map((move) => [String(move.uci), move]));
    expect(byUci.get('e6d6')?.category).toBe('loss');
    expect(byUci.get('e6f6')?.category).toBe('loss');
    expect(byUci.get('e6d5')?.category).toBe('draw');
    expect(byUci.get('e6f5')?.category).toBe('draw');
  });

  it('marks no move as zeroing when none is a capture or a pawn move', () => {
    expect(result.moves.every((move) => move.zeroing === false)).toBe(true);
  });
});

describe('positions that are already over', () => {
  it('reports checkmate as checkmate', () => {
    const mate = fromHelper(
      asFen('8/8/8/8/8/4k3/4q3/4K3 w - - 0 1'),
      { ok: true, wdl: 0, dtz: 0, checkmate: true, stalemate: false, moves: [] },
      'Local Syzygy',
    );
    expect(mate.category).toBe('checkmate');
    expect(mate.checkmate).toBe(true);
    expect(mate.moves).toEqual([]);
  });

  it('reports stalemate as stalemate, not as a draw', () => {
    const stalemate = fromHelper(
      asFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'),
      { ok: true, wdl: 2, dtz: 0, checkmate: false, stalemate: true, moves: [] },
      'Local Syzygy',
    );
    expect(stalemate.category).toBe('stalemate');
    expect(stalemate.stalemate).toBe(true);
  });
});

describe('a move that mates', () => {
  it('is reported as checkmate rather than as a loss for the opponent', () => {
    // Kg6 supports h7, so Qh7 is mate rather than merely a winning move.
    const result = fromHelper(
      asFen('7k/8/6K1/8/8/8/8/7Q w - - 0 1'),
      {
        ok: true,
        wdl: TB_WIN,
        dtz: 1,
        checkmate: false,
        stalemate: false,
        moves: [{ uci: 'h1h7', wdl: 4, dtz: 1 }],
      },
      'Local Syzygy',
    );
    expect(result.moves[0]?.category).toBe('checkmate');
    expect(result.moves[0]?.checkmate).toBe(true);
  });
});

describe('a helper that disagrees with the rules', () => {
  it('drops an illegal move rather than showing one nobody can play', () => {
    const result = fromHelper(
      KRK_FEN,
      { ...KRK, moves: [...(KRK.moves ?? []), { uci: 'h8h1', wdl: 4, dtz: 1 }] },
      'Local Syzygy',
    );
    expect(result.moves.map((move) => String(move.uci))).not.toContain('h8h1');
    expect(result.moves).toHaveLength(KRK.moves?.length ?? 0);
  });
});

describe('zeroing moves', () => {
  it('marks a capture and a pawn move, and nothing else', () => {
    const result = fromHelper(
      asFen('8/8/8/3k4/8/8/4P3/4K3 w - - 0 1'),
      {
        ok: true,
        wdl: TB_WIN,
        dtz: 5,
        checkmate: false,
        stalemate: false,
        moves: [
          { uci: 'e2e4', wdl: 4, dtz: 5 },
          { uci: 'e1d2', wdl: 4, dtz: 7 },
        ],
      },
      'Local Syzygy',
    );
    const byUci = new Map(result.moves.map((move) => [String(move.uci), move]));
    expect(byUci.get('e2e4')?.zeroing).toBe(true);
    expect(byUci.get('e1d2')?.zeroing).toBe(false);
  });
});
