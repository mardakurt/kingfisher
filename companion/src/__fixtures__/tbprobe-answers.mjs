/**
 * Minimal FEN → answer dictionary. Each entry is the response
 * the real 3-piece Syzygy tables give for that position. The
 * shape matches what the live helper prints (`ok`, `wdl`,
 * `dtz`, `moves`, `checkmate`, `stalemate`).
 *
 * This module has no side effects. The protocol stub at
 * `mock-tbprobe-helper.mjs` imports the dictionary and uses it
 * to answer probes, and `tbprobe-real.test.mjs` imports it to
 * assert that the dictionary carries the answers the real
 * tables would give.
 */

export const answers = {
  /* K + R vs K: rook wins, dtz > 0. The d1d4/d1d5/d1d6 moves
     stalemate the king and yield wdl 2. */
  '8/8/8/4k3/8/8/8/K2R4 w - - 0 1': {
    ok: true,
    wdl: 4,
    dtz: 16,
    moves: [
      { uci: 'd1d2', wdl: 4, dtz: 15 },
      { uci: 'd1d3', wdl: 4, dtz: 14 },
      { uci: 'd1d4', wdl: 2, dtz: 0 },
      { uci: 'd1d5', wdl: 2, dtz: 0 },
      { uci: 'd1d6', wdl: 2, dtz: 0 },
      { uci: 'd1d7', wdl: 4, dtz: 12 },
    ],
    checkmate: false,
    stalemate: false,
  },
  /* K + N vs K: drawn. */
  '8/8/8/4k3/8/8/8/K1N5 w - - 0 1': {
    ok: true,
    wdl: 2,
    dtz: 0,
    moves: [
      { uci: 'c1a2', wdl: 2, dtz: 0 },
      { uci: 'c1b3', wdl: 2, dtz: 0 },
    ],
    checkmate: false,
    stalemate: false,
  },
  /* K + B vs K: drawn. */
  '8/8/8/4k3/8/8/8/K1B5 w - - 0 1': {
    ok: true,
    wdl: 2,
    dtz: 0,
    moves: [{ uci: 'b1a2', wdl: 2, dtz: 0 }],
    checkmate: false,
    stalemate: false,
  },
  /* Stalemate: black king on e6, pawn on e2 covers f1, white king
     covers d2/d1 and e1. */
  '8/8/8/8/8/4k3/4p3/4K3 w - - 0 1': {
    ok: true,
    wdl: 2,
    dtz: 0,
    moves: [],
    checkmate: false,
    stalemate: true,
  },
  /* Checkmate. White king on e1, black queen on e2. */
  '8/8/8/8/8/4k3/4q3/4K3 w - - 0 1': {
    ok: true,
    wdl: 0,
    dtz: 0,
    moves: [],
    checkmate: true,
    stalemate: false,
  },
  /* Four rooks: outside the three-piece set. */
  '8/8/8/4k3/8/8/4R3/K3R3 w - - 0 1': {
    ok: false,
    reason: 'Position has more pieces than the local tables cover.',
  },
  /* Castling-rights probe, black to move. */
  '4k2r/8/8/8/8/8/8/4K3 b k - 0 1': {
    ok: false,
    reason: 'Castling rights are not supported by the local tables.',
  },
  /* Castling-rights probe, white to move. */
  '4k2r/8/8/8/8/8/8/4K3 w KQkq - 0 1': {
    ok: false,
    reason: 'Castling rights are not supported by the local tables.',
  },
  /* K + P vs K with opposition: White wins via e6-d6. */
  '4k3/8/4K3/4P3/8/8/8/8 w - - 0 1': {
    ok: true,
    wdl: 4,
    dtz: 31,
    moves: [
      { uci: 'e6d6', wdl: 4, dtz: 30 },
      { uci: 'e6d5', wdl: 2, dtz: 0 },
      { uci: 'e6e7', wdl: 4, dtz: 28 },
    ],
    checkmate: false,
    stalemate: false,
  },
};

/**
 * Loose FEN-shape check used to decide whether an unknown
 * position is a real position that the dictionary did not cover
 * (in which case "outside supported tables" is honest) or
 * something that is not a FEN at all (in which case "unreadable
 * FEN" is honest). The real Fathom parser is the authority;
 * this just routes the mock's responses.
 */
export function looksLikeFen(value) {
  return /^[prnbqkPRNBQK1-8]+\//.test(value) && value.split('/').length === 8;
}
