import { describe, expect, it } from 'vitest';

import { matchMoveInput } from './move-input';
import { Position } from './position';
import { expect as unwrap } from './result';

const movesOf = (fen?: string) =>
  (fen ? unwrap(Position.fromFen(fen)) : Position.initial()).legalMoves();

const played = (text: string, fen?: string) => matchMoveInput(movesOf(fen), text).move?.san ?? null;

describe('matchMoveInput', () => {
  it('reads SAN as people type it, with or without case and decorations', () => {
    expect(played('Nf3')).toBe('Nf3');
    expect(played('nf3')).toBe('Nf3');
    expect(played('Nf3+!?')).toBe('Nf3');
    expect(played('e4')).toBe('e4');
    expect(played(' e4 ')).toBe('e4');
  });

  it('reads UCI and long algebraic', () => {
    expect(played('g1f3')).toBe('Nf3');
    expect(played('e2-e4')).toBe('e4');
    expect(played('E2E4')).toBe('e4');
  });

  it('reads castling with letters or zeros', () => {
    const fen = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
    for (const text of ['O-O', '0-0', 'oo', 'OO', 'e1g1']) expect(played(text, fen)).toBe('O-O');
    for (const text of ['O-O-O', '0-0-0', 'ooo', 'e1c1']) expect(played(text, fen)).toBe('O-O-O');
  });

  it('reads captures with or without the x, and the file-to-file shorthand', () => {
    const fen = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2';
    expect(played('exd5', fen)).toBe('exd5');
    expect(played('ed5', fen)).toBe('exd5');
    expect(played('exd', fen)).toBeNull();
  });

  it('reads promotions with or without the equals sign', () => {
    const fen = 'k7/4P3/8/8/8/8/8/4K3 w - - 0 1';
    expect(played('e8=Q', fen)).toBe('e8=Q+');
    expect(played('e8q', fen)).toBe('e8=Q+');
    expect(played('e8=N', fen)).toBe('e8=N');
    expect(played('e7e8n', fen)).toBe('e8=N');
    // A pawn reaching the last rank must say what it becomes.
    const bare = matchMoveInput(movesOf(fen), 'e8');
    expect(bare.move).toBeNull();
    expect(bare.candidates.map((move) => move.san).sort()).toEqual(
      ['e8=B', 'e8=N', 'e8=Q+', 'e8=R+'].sort(),
    );
  });

  it('lets case separate a bishop from a b-pawn, and reports the collision without it', () => {
    // White bishop on f1 can reach c4; the b3 pawn can capture on c4.
    const fen = '4k3/8/8/8/2p5/1P6/8/4KB2 w - - 0 1';
    expect(played('Bc4', fen)).toBe('Bxc4');
    expect(played('Bxc4', fen)).toBe('Bxc4');
    expect(played('bxc4', fen)).toBe('bxc4');
    expect(played('bc4', fen)).toBe('bxc4');
    const upper = matchMoveInput(movesOf(fen), 'BXC4');
    expect(upper.move).toBeNull();
    expect(upper.ambiguous).toBe(true);
    expect(upper.candidates.map((move) => move.san).sort()).toEqual(['Bxc4', 'bxc4']);
  });

  it('needs the disambiguation SAN needs', () => {
    const fen = '4k3/8/8/8/8/8/4K3/R6R w - - 0 1';
    expect(played('Rd1', fen)).toBeNull();
    expect(played('Rad1', fen)).toBe('Rad1');
    expect(played('rhd1', fen)).toBe('Rhd1');
    expect(played('a1d1', fen)).toBe('Rad1');
    const fen2 = 'R7/8/8/8/8/8/7k/R3K3 w - - 0 1';
    const both = matchMoveInput(movesOf(fen2), 'Ra4');
    expect(both.move).toBeNull();
    expect(both.ambiguous).toBe(true);
    expect(both.candidates.map((move) => move.san).sort()).toEqual(['R1a4', 'R8a4']);
    expect(played('R1a4', fen2)).toBe('R1a4');
  });

  it('lists what an unfinished input could become, and nothing for nonsense', () => {
    const knight = matchMoveInput(movesOf(), 'N');
    expect(knight.move).toBeNull();
    expect(knight.candidates.map((move) => move.san).sort()).toEqual(['Na3', 'Nc3', 'Nf3', 'Nh3']);
    expect(matchMoveInput(movesOf(), 'Qh5')).toEqual({
      move: null,
      candidates: [],
      ambiguous: false,
    });
    expect(matchMoveInput(movesOf(), '').candidates).toEqual([]);
  });

  it('never offers a move the position does not allow', () => {
    // Pinned knight: Nc3 is on the board but cannot move.
    const fen = '4k3/8/8/b7/8/2N5/8/4K3 w - - 0 1';
    expect(played('Nb5', fen)).toBeNull();
    expect(matchMoveInput(movesOf(fen), 'N').candidates).toEqual([]);
  });
});
