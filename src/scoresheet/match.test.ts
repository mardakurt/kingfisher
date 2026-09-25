import { describe, expect, it } from 'vitest';

import { Position } from '@/chess/position';

import { matchToken, normalizeToken } from './match';

const after = (sans: string): Position => {
  let position = Position.initial();
  for (const san of sans.split(' ').filter(Boolean)) {
    const next = position.advanceSan(san);
    if (!next.ok) throw new Error(san);
    position = next.value.next;
  }
  return position;
};

describe('normalizeToken', () => {
  it.each([
    ['Nf3', 'Nf3'],
    ['nf3', 'Nf3'],
    ['Sf3', 'Nf3'],
    ['Cf3', 'Nf3'],
    ['Lc4', 'Bc4'],
    ['Dxd5+', 'Qd5'],
    ['Txe1#', 'Re1'],
    ['0-0', 'O-O'],
    ['o-o-o', 'O-O-O'],
    ['OO', 'O-O'],
    ['00', 'O-O'],
    ['0-0+', 'O-O'],
    ['exd5', 'ed5'],
    ['e:d5', 'ed5'],
    ['ed', 'ed'],
    ['e8Q', 'e8=Q'],
    ['e8=Q+', 'e8=Q'],
    ['e8/D', 'e8=Q'],
    ['bxc6', 'bc6'],
    ['b5', 'b5'],
    ['Bb5', 'Bb5'],
    ['Nf3!?', 'Nf3'],
    ['E4', 'e4'],
  ])('%s → %s', (token, expected) => {
    expect(normalizeToken(token)).toBe(expected);
  });
});

describe('matchToken', () => {
  it('reads a move in any of the common spellings as one certain move', () => {
    const position = after('e4 e5');
    for (const token of ['Nf3', 'nf3', 'Sf3', 'Cf3', 'Ngf3', 'Ng1f3', 'N f3', 'Nf3!']) {
      const result = matchToken(position, token);
      expect(result.certain, token).toBe(true);
      expect(result.candidates[0]!.move.san).toBe('Nf3');
    }
  });

  it('reads pawn captures written short', () => {
    const position = after('e4 d5');
    for (const token of ['exd5', 'ed', 'ed5', 'e:d5', 'd5', 'e4d5']) {
      const result = matchToken(position, token);
      expect(result.candidates[0]!.move.san, token).toBe('exd5');
      expect(result.certain, token).toBe(true);
    }
  });

  it('reads an en passant capture written short', () => {
    const position = after('e4 a6 e5 d5');
    for (const token of ['exd6', 'ed', 'ed6', 'e5d6']) {
      const result = matchToken(position, token);
      expect(result.candidates[0]!.move.san, token).toBe('exd6');
      expect(result.certain, token).toBe(true);
    }
  });

  it('reads castling and promotion', () => {
    const castle = after('e4 e5 Nf3 Nc6 Bc4 Bc5');
    expect(matchToken(castle, '0-0').candidates[0]!.move.san).toBe('O-O');
    const promote = Position.fromFen('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    if (!promote.ok) throw new Error('fen');
    expect(matchToken(promote.value, 'a8Q').candidates[0]!.move.san).toBe('a8=Q+');
    expect(matchToken(promote.value, 'a8=N').candidates[0]!.move.san).toBe('a8=N');
  });

  it('offers the readings one character off, and is not certain between them', () => {
    // After 1. e4 e5 four knight moves reach the third rank; "N?3" is any of them.
    const position = after('e4 e5');
    const result = matchToken(position, 'N?3');
    expect(result.certain).toBe(false);
    expect(
      result.candidates
        .filter((c) => c.distance === 0)
        .map((c) => c.move.san)
        .sort(),
    ).toEqual(['Na3', 'Nc3', 'Nf3', 'Nh3']);
  });

  it('prefers the exact spelling over a near one', () => {
    // Nf3 and Nf6? Only white to move: Nf3 exact; Nh3 is one character off.
    const result = matchToken(after('e4 e5'), 'Nf3');
    expect(result.certain).toBe(true);
    expect(result.candidates[0]!.move.san).toBe('Nf3');
    expect(result.candidates.slice(1).every((c) => c.distance === 1)).toBe(true);
  });

  it('returns no candidate for what cannot be a move here', () => {
    expect(matchToken(after('e4 e5'), 'Qh5').certain).toBe(true);
    expect(matchToken(after('e4 e5'), 'Kh8').candidates).toEqual([]);
    expect(matchToken(after('e4 e5'), '').candidates).toEqual([]);
  });
});
