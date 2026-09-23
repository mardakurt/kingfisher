import { describe, expect, it } from 'vitest';

import { parsePgn } from '@/chess/pgn';
import { mainlinePath } from '@/chess/tree/tree';

import { findRoute, parseRoute, pieceOn, type Route, type RouteMove } from './route';

const movesOf = (movetext: string): RouteMove[] => {
  const tree = parsePgn(movetext).games[0]!.tree;
  return mainlinePath(tree)
    .slice(1)
    .map((id) => {
      const node = tree.nodes[id]!;
      return { ply: node.ply, uci: node.move!.uci, fenBefore: tree.nodes[node.parentId!]!.fen };
    });
};

const route = (text: string): Route => {
  const parsed = parseRoute(text);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.route;
};

// The Breyer: the b1-knight's d2–f1–g3 tour, and Black's knight going home.
const RUY = movesOf(
  '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 11. Nbd2 Bb7 12. Bc2 Re8 13. Nf1 Bf8 14. Ng3 *',
);

describe('parseRoute', () => {
  it('reads the ways a route is written', () => {
    expect(route('N b1 d2 f1 g3').label).toBe('N b1–d2–f1–g3');
    expect(route('Nb1-d2-f1-g3').label).toBe('N b1–d2–f1–g3');
    expect(route('nb1 nd2 nf1').squares).toEqual(['b1', 'd2', 'f1']);
  });

  it('names what it cannot read', () => {
    expect(parseRoute('b1 d2')).toEqual({
      ok: false,
      error: 'Start with the piece: K, Q, R, B, N or P, e.g. "N f3 d2 f1".',
    });
    expect(parseRoute('N b1')).toMatchObject({ ok: false });
    expect(parseRoute('N b1 z9')).toEqual({ ok: false, error: '"z9" is not a square.' });
    expect(parseRoute('N b1 b1')).toMatchObject({ ok: false });
  });
});

describe('findRoute', () => {
  it('follows one piece through pauses, to the ply that completes the route', () => {
    // 11.Nbd2 is ply 21, 13.Nf1 ply 25, 14.Ng3 ply 27.
    expect(findRoute(RUY, route('N b1 d2 f1 g3'))).toBe(27);
    expect(findRoute(RUY, route('N b1 d2 f1'))).toBe(25);
  });

  it('breaks the trail when the piece makes another move mid-route', () => {
    // The bishop went b5–a4–b3; b5 straight to b3 never happened.
    expect(findRoute(RUY, route('B f1 b5 a4 b3'))).toBe(13);
    expect(findRoute(RUY, route('B f1 b5 b3'))).toBeNull();
  });

  it('does not let a different piece type walk the same squares', () => {
    expect(findRoute(RUY, route('Q b1 d2 f1 g3'))).toBeNull();
  });

  it('follows the rook through castling', () => {
    // 5.O-O (ply 9) takes the rook h1–f1; 6.Re1 (ply 11) takes it on.
    expect(findRoute(RUY, route('R h1 f1 e1'))).toBe(11);
  });

  it('keeps to the chosen colour', () => {
    // 9...Nb8 (ply 18) then 10...Nbd7 (ply 20).
    expect(findRoute(RUY, route('N c6 b8 d7'))).toBe(20);
    expect(findRoute(RUY, route('N c6 b8 d7'), 'b')).toBe(20);
    expect(findRoute(RUY, route('N c6 b8 d7'), 'w')).toBeNull();
  });

  it('ends the trail when the piece is captured on its square', () => {
    // White's knight reaches f3 and is taken there; Black's knight then goes
    // f3–d4, which must not be read as White's knight finishing g1–f3–d4.
    const moves = movesOf('1. Nf3 Nc6 2. e3 Ne5 3. Be2 Nxf3+ 4. Kf1 Nd4 *');
    expect(findRoute(moves, route('N g1 f3 d4'))).toBeNull();
    // The black knight's own route is found.
    expect(findRoute(moves, route('N e5 f3 d4'))).toBe(8);
  });
});

describe('pieceOn', () => {
  it('reads a square from the placement field', () => {
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(pieceOn(start, 'b1')).toEqual({ color: 'w', type: 'n' });
    expect(pieceOn(start, 'd8')).toEqual({ color: 'b', type: 'q' });
    expect(pieceOn(start, 'e4')).toBeNull();
  });
});
