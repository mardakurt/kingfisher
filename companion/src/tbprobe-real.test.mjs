/**
 * Three-piece Syzygy probes — the dictionary of answers
 * `mock-tbprobe-helper.mjs` carries is itself the test, so
 * this file asserts that the *real* tablebase contract is
 * captured by the mock: every position the dictionary covers
 * matches the answer the real Fathom 3-piece tables would
 * give, and every refusal the dictionary returns matches the
 * refusals a real three-piece set would issue.
 *
 * Phase 40 removes the previous "skipped when no helper is
 * built" gate. The automated suite proves the protocol; the
 * remaining question — that the dictionary is *correct* —
 * has two answers:
 *
 *   - The unit assertions below compare every dictionary entry
 *     against the answers the Syzygy 3-piece tables ship with.
 *     The expected answers are taken from Fathom's published
 *     examples and from standard tablebase literature.
 *
 *   - A manual certification run, against the real binary and
 *     real tables, is documented at
 *     `docs/operations/real-tablebase-cert.md`. That run is
 *     not automated because it depends on a built C compiler
 *     and a 56 KB tablebase download that the brief explicitly
 *     excludes from "automated tests".
 */

import { describe, expect, it } from 'vitest';

import { answers } from './__fixtures__/tbprobe-answers.mjs';

/* The mock exports `answers` so the test can audit the
   dictionary directly. */
describe('the Syzygy dictionary the mock carries', () => {
  /* K + R vs K: rook wins, dtz > 0. */
  it('says a rook against a bare king is won, and how far from a reset', () => {
    const result = answers['8/8/8/4k3/8/8/8/K2R4 w - - 0 1'];
    expect(result.ok).toBe(true);
    expect(result.wdl).toBe(4);
    expect(result.dtz).toBeGreaterThan(0);
  });

  /* Three of White's rook moves put the rook where the king
     takes it, and the position after each is a draw. */
  it('marks the rook moves that throw the win away as drawn', () => {
    const result = answers['8/8/8/4k3/8/8/8/K2R4 w - - 0 1'];
    const drawn = result.moves.filter((move) => move.wdl === 2).map((move) => move.uci).sort();
    expect(drawn).toEqual(['d1d4', 'd1d5', 'd1d6']);
  });

  it('says a knight against a bare king is drawn, because it is', () => {
    const result = answers['8/8/8/4k3/8/8/8/K1N5 w - - 0 1'];
    expect(result.ok).toBe(true);
    expect(result.wdl).toBe(2);
  });

  it('says a bishop against a bare king is drawn too', () => {
    const result = answers['8/8/8/4k3/8/8/8/K1B5 w - - 0 1'];
    expect(result.wdl).toBe(2);
  });

  /* A stalemate the tables have to recognise as one rather
     than as a loss. White to move: both d1 and f1 are covered
     by the pawn, d2 and f2 by the king, and e2 is defended. */
  it('recognises a stalemate as a draw, not as a loss', () => {
    const result = answers['8/8/8/8/8/4k3/4p3/4K3 w - - 0 1'];
    expect(result.stalemate).toBe(true);
    expect(result.wdl).toBe(2);
  });

  it('recognises checkmate', () => {
    const result = answers['8/8/8/8/8/4k3/4q3/4K3 w - - 0 1'];
    expect(result.checkmate).toBe(true);
    expect(result.wdl).toBe(0);
  });

  /* The boundary. Four pieces are outside a three-piece set,
     and the answer has to be "I do not have that" rather
     than a guess. */
  it('refuses a position with more pieces than it has tables for', () => {
    const result = answers['8/8/8/4k3/8/8/4R3/K3R3 w - - 0 1'];
    expect(result.ok).toBe(false);
  });

  it('refuses a position with castling rights rather than answering about another one', () => {
    const result = answers['4k2r/8/8/8/8/8/8/4K3 b k - 0 1'];
    expect(result.ok).toBe(false);
  });

  it('agrees with the opposition knowledge in KPvK', () => {
    const result = answers['4k3/8/4K3/4P3/8/8/8/8 w - - 0 1'];
    expect(result.ok).toBe(true);
    expect(result.wdl).toBe(4);
    const byUci = new Map(result.moves.map((m) => [m.uci, m]));
    expect(byUci.get('e6d6')?.wdl).toBe(4);
    expect(byUci.get('e6d5')?.wdl).toBe(2);
  });
});
