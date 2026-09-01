import { describe, expect, it } from 'vitest';

import { compareScores, cp, formatScore, mate, toWhitePov, winningChances } from './evaluation';

describe('score conventions', () => {
  it('flips a Black-to-move score into White orientation', () => {
    expect(toWhitePov(cp(40), 'w')).toEqual(cp(40));
    expect(toWhitePov(cp(40), 'b')).toEqual(cp(-40));
    expect(toWhitePov(mate(3), 'b')).toEqual(mate(-3));
  });

  it('formats the way a chess player reads evaluations', () => {
    expect(formatScore(cp(34))).toBe('+0.34');
    expect(formatScore(cp(-120))).toBe('-1.20');
    expect(formatScore(cp(0))).toBe('0.00');
    expect(formatScore(mate(4))).toBe('M4');
    expect(formatScore(mate(-2))).toBe('-M2');
  });

  it('orders scores from White’s point of view, preferring faster mates', () => {
    expect(compareScores(cp(50), cp(-50))).toBeGreaterThan(0);
    expect(compareScores(mate(1), mate(8))).toBeGreaterThan(0);
    expect(compareScores(mate(-1), cp(-900))).toBeLessThan(0);
    expect(compareScores(mate(5), cp(2000))).toBeGreaterThan(0);
  });

  it('maps evaluations onto expected score', () => {
    expect(winningChances(cp(0))).toBeCloseTo(0.5, 5);
    expect(winningChances(mate(2))).toBe(1);
    expect(winningChances(mate(-2))).toBe(0);
    // The practical gap between +0.2 and +0.5 is larger than between +6.0 and +6.3.
    const nearEqual = winningChances(cp(50)) - winningChances(cp(20));
    const alreadyWinning = winningChances(cp(630)) - winningChances(cp(600));
    expect(nearEqual).toBeGreaterThan(alreadyWinning);
  });
});
