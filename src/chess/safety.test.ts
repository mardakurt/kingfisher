import { describe, expect, it } from 'vitest';

import { parseFen, type FenParts } from './fen';
import { nullMoveFen, safetyOf, staticExchange } from './safety';
import type { Square } from './types';

const parts = (fen: string): FenParts => {
  const parsed = parseFen(fen);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
};

describe('static exchange', () => {
  it('wins a whole piece that nobody defends', () => {
    // Black knight d5, attacked by the e4 pawn, defended by nothing.
    const p = parts('4k3/8/8/3n4/4P3/8/8/4K3 w - - 0 1');
    expect(staticExchange(p, 'd5' as Square, 'w')).toBe(3);
    expect(safetyOf(p, 'b').enPrise.map((e) => e.square)).toEqual(['d5']);
  });

  it('counts the recapture: pawn takes a defended knight for +2', () => {
    const p = parts('4k3/8/4p3/3n4/4P3/8/8/4K3 w - - 0 1');
    expect(staticExchange(p, 'd5' as Square, 'w')).toBe(2);
  });

  it('does not start an exchange that loses: a rook against a defended knight', () => {
    const p = parts('4k3/8/4p3/3n4/8/8/8/3RK3 w - - 0 1');
    expect(staticExchange(p, 'd5' as Square, 'w')).toBe(0);
    expect(safetyOf(p, 'b').enPrise).toEqual([]);
  });

  it('brings in an attacker revealed behind a capturing rook (an x-ray)', () => {
    // White Ra2 and Ra1 behind it; Black knight a7 defended by Ra8.
    // Rxa7 (3) Rxa7 (5) Rxa7 (5): White nets the knight.
    const p = parts('r3k3/n7/8/8/8/8/R7/R3K3 w - - 0 1');
    expect(staticExchange(p, 'a7' as Square, 'w')).toBe(3);
    // Without the rook behind, the same capture loses the exchange.
    const single = parts('r3k3/n7/8/8/8/8/R7/4K3 w - - 0 1');
    expect(staticExchange(single, 'a7' as Square, 'w')).toBe(0);
  });

  it('lets the king take only what nothing defends', () => {
    const defended = parts('8/8/8/8/8/2b5/3p4/4K2k w - - 0 1');
    // The d2 pawn is defended by the c3 bishop, so Kxd2 is no capture.
    expect(staticExchange(defended, 'd2' as Square, 'w')).toBe(0);
    const free = parts('8/8/8/8/8/8/3p4/4K2k w - - 0 1');
    expect(staticExchange(free, 'd2' as Square, 'w')).toBe(1);
  });

  it('counts an en passant capture, and continues the exchange on the landing square', () => {
    const hanging = parts('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
    expect(staticExchange(hanging, 'd5' as Square, 'w')).toBe(1);
    expect(safetyOf(hanging, 'b').enPrise.map((entry) => entry.square)).toEqual(['d5']);
    // The queen on e7 recaptures on d6 and does not attack d5.
    const recaptured = parts('4k3/4q3/8/3pP3/8/8/8/4K3 w - d6 0 1');
    expect(staticExchange(recaptured, 'd5' as Square, 'w')).toBe(0);
    expect(safetyOf(recaptured, 'b').enPrise).toEqual([]);
  });

  it('values a pawn capture on the eighth rank as a promotion to a queen', () => {
    const hanging = parts('r3k3/1P6/8/8/8/8/8/4K3 w - - 0 1');
    expect(staticExchange(hanging, 'a8' as Square, 'w')).toBe(13);
    // The new queen is recaptured: the promotion bonus and the queen cancel,
    // leaving a rook for a pawn.
    const recaptured = parts('r2qk3/1P6/8/8/8/8/8/4K3 w - - 0 1');
    expect(staticExchange(recaptured, 'a8' as Square, 'w')).toBe(4);
  });
});

describe('safety report', () => {
  it('names loose pieces but not pawns or the king', () => {
    const p = parts('4k3/8/8/8/8/8/1P6/1N2K3 w - - 0 1');
    expect(safetyOf(p, 'w').loose.map((e) => e.square)).toEqual(['b1']);
  });
});

describe('the position with the turn passed', () => {
  it('flips the turn and drops the en passant square', () => {
    const fen = nullMoveFen(parts('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 5'));
    expect(fen).toBe('4k3/8/8/3pP3/8/8/8/4K3 b - - 0 5');
  });

  it('has none when the side to move is in check', () => {
    expect(nullMoveFen(parts('4k3/8/8/8/8/8/4r3/4K3 w - - 0 1'))).toBeNull();
  });
});
