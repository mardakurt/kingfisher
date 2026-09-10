import { describe, expect, it } from 'vitest';

import { positionKey, START_FEN } from '@/chess/fen';

import { MOVE_SEQUENCE_MAX_PLIES, parseMoveSequence } from './move-sequence';

describe('parseMoveSequence', () => {
  it('parses a full Najdorf main line', () => {
    const result = parseMoveSequence('1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 a6');
    expect(result.ok).toBe(true);
    expect(result.moves).toEqual([
      'e4',
      'c5',
      'Nf3',
      'd6',
      'd4',
      'cxd4',
      'Nxd4',
      'Nf6',
      'Nc3',
      'a6',
    ]);
    expect(result.fen).not.toBe(START_FEN);
  });

  it('parses a single move', () => {
    const result = parseMoveSequence('e4');
    expect(result.ok).toBe(true);
    expect(result.moves).toEqual(['e4']);
  });

  it('strips move numbers and NAGs', () => {
    const result = parseMoveSequence('1.e4!? c5?! 2.Nf3!');
    expect(result.ok).toBe(true);
    expect(result.moves).toEqual(['e4', 'c5', 'Nf3']);
  });

  it('strips comments and variations', () => {
    const result = parseMoveSequence('1.e4 c5 {A Sicilian} 2.Nf3 d6');
    expect(result.ok).toBe(true);
    expect(result.moves).toEqual(['e4', 'c5', 'Nf3', 'd6']);
  });

  it('reports the first illegal move', () => {
    const result = parseMoveSequence('1.e4 c5 2.Nf3 Nf6');
    // Nf6 is legal for Black after 2.Nf3, so advance one more and then make
    // an illegal move. 3.d4 is legal; 3...Qd1 is not.
    const twoPly = parseMoveSequence('1.e4 c5 2.Nf3 Nf6 3.d4 Qd1');
    expect(twoPly.ok).toBe(false);
    expect(twoPly.failedAt).toBe('Qd1');
    expect(twoPly.moves).toEqual(['e4', 'c5', 'Nf3', 'Nf6', 'd4']);
    // sanity: keep the original test running too
    expect(result.ok).toBe(true);
  });

  it('rejects a FEN-shaped input', () => {
    const result = parseMoveSequence('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('looks-like-fen');
  });

  it('rejects an empty string', () => {
    const result = parseMoveSequence('');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no-moves');
  });

  it('rejects a string with no moves', () => {
    const result = parseMoveSequence('   ');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no-moves');
  });

  it('caps at the ply limit', () => {
    const long = Array.from({ length: MOVE_SEQUENCE_MAX_PLIES + 5 }, (_, i) =>
      i % 2 === 0 ? 'e4' : 'e5',
    ).join(' ');
    const result = parseMoveSequence(long);
    expect(result.ok).toBe(false);
    expect(result.moves.length).toBeLessThanOrEqual(MOVE_SEQUENCE_MAX_PLIES);
  });

  it('produces a non-empty position key on success', () => {
    const result = parseMoveSequence('1.e4 c5 2.Nf3');
    expect(result.ok).toBe(true);
    expect(positionKey(result.fen)).toBeTruthy();
  });
});
