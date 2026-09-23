import { describe, expect, it } from 'vitest';

import { parsePgn } from '@/chess/pgn';
import type { GameTree } from '@/chess/tree/types';

import { scanGame } from './game-scan';
import { parseMaterialQuery } from './material-query';
import { parseRoute } from './route';

const tree = (pgn: string): GameTree => {
  const parsed = parsePgn(pgn);
  const game = parsed.games[0];
  if (!game) throw new Error(parsed.issues.map((issue) => issue.message).join('; '));
  return game.tree;
};

const fromFen = (fen: string, movetext: string) =>
  tree(`[SetUp "1"]\n[FEN "${fen}"]\n\n${movetext}`);

const material = (text: string) => {
  const parsed = parseMaterialQuery(text);
  if (!parsed.ok) throw new Error(parsed.error);
  return { query: parsed.query };
};

const route = (text: string) => {
  const parsed = parseRoute(text);
  if (!parsed.ok) throw new Error(parsed.error);
  return { route: parsed.route };
};

// White rook against Black rook and rook: 1.Rxd7 is R v R for one position,
// and 1...Rxd7 makes it K v R.
const TRANSIENT = fromFen('3r2k1/3r4/8/8/8/8/8/3R2K1 w - - 0 1', '1. Rxd7 Rxd7 2. Kf2 *');
// The same exchange as the last move of the game: R v R is where it ended.
const FINAL = fromFen('3r2k1/3r4/8/8/8/8/8/3R2K1 w - - 0 1', '1. Rxd7 *');
// 1.Rxd8+ leaves rook against bishop, and it stays.
const HELD = fromFen('3r2k1/8/8/8/2b5/8/8/3R2K1 w - - 0 1', '1. Rxd8+ Kf7 2. Kf2 *');

describe('scanGame', () => {
  it('ignores a balance that lasts one position', () => {
    expect(scanGame(TRANSIENT, { material: material('R v R') })).toBeNull();
    // K v R held from 1...Rxd7 (ply 2) to the end.
    expect(scanGame(TRANSIENT, { material: material('K v R') })).toMatchObject({ ply: 2 });
  });

  it('counts a balance the game ended in', () => {
    expect(scanGame(FINAL, { material: material('R v R') })).toMatchObject({ ply: 1 });
  });

  it('finds a held balance at its first position', () => {
    expect(scanGame(HELD, { material: material('R v B') })).toMatchObject({ ply: 1 });
    expect(scanGame(HELD, { material: { ...material('R v B'), colour: 'b' } })).toBeNull();
  });

  it('asks a strategic theme by its definition', () => {
    const rookEnding = fromFen('3r2k1/8/8/8/8/8/5PP1/3R2K1 w - - 0 1', '1. Kf1 Kf8 *');
    expect(scanGame(rookEnding, { theme: 'rook-ending' })).toMatchObject({ ply: 0 });
    expect(scanGame(rookEnding, { theme: 'minor-piece-ending' })).toBeNull();
    expect(scanGame(rookEnding, { theme: 'no-such-theme' })).toBeNull();
  });

  it('finds a comment in a variation, at the ply it hangs from', () => {
    const annotated = tree(
      "1. e4 e5 2. Nf3 (2. f4 {The King's Gambit, which the author prefers}) 2... Nc6 *",
    );
    expect(scanGame(annotated, { comment: "king's GAMBIT" })).toMatchObject({ ply: 3 });
    expect(scanGame(annotated, { comment: 'Najdorf' })).toBeNull();
  });

  it('requires every filter, and reports when all of them had happened', () => {
    const ruy = tree(
      '1. e4 e5 2. Nf3 Nc6 3. Bb5 {The Spanish} a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 11. Nbd2 Bb7 12. Bc2 Re8 13. Nf1 Bf8 14. Ng3 *',
    );
    const both = scanGame(ruy, { route: route('N b1 d2 f1 g3'), comment: 'spanish' });
    // The comment is at ply 5, the route completes at ply 27.
    expect(both).toMatchObject({ ply: 27 });
    expect(ruy.nodes[both!.nodeId]!.move!.san).toBe('Ng3');
    expect(scanGame(ruy, { route: route('N b1 d2 f1 g3'), comment: 'Najdorf' })).toBeNull();
  });

  it('returns nothing when asked nothing', () => {
    expect(scanGame(HELD, {})).toBeNull();
  });
});
