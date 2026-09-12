import { describe, expect, it } from 'vitest';

import { cp, mate } from '@/chess/evaluation';

import { evaluationBarLayout, leadingSide, whiteShare } from './evaluation-bar-layout';

describe('the evaluation bar says who is better', () => {
  it('draws White at the bottom with White to view, and Black at the bottom when flipped', () => {
    const plus = cp(100);
    const whiteView = evaluationBarLayout(plus, 'w');
    const blackView = evaluationBarLayout(plus, 'b');
    expect(whiteView.bottomSide).toBe('w');
    expect(blackView.bottomSide).toBe('b');
    // The same position: White's band is the larger one in both views.
    expect(whiteView.bottomShare).toBeGreaterThan(0.5);
    expect(blackView.bottomShare).toBeLessThan(0.5);
    expect(whiteView.bottomShare + blackView.bottomShare).toBeCloseTo(1, 10);
  });

  it('flipping the board never changes who is leading or the label', () => {
    for (const score of [cp(150), cp(-150), mate(3), mate(-2), cp(0), null]) {
      const a = evaluationBarLayout(score, 'w');
      const b = evaluationBarLayout(score, 'b');
      expect(b.leading).toBe(a.leading);
      expect(b.label).toBe(a.label);
      expect(b.labelOn).toBe(a.labelOn);
      // The label stays in the leading band, which moves with the board.
      expect(b.labelAt).toBe(a.labelAt === 'top' ? 'bottom' : 'top');
    }
  });

  it('+1.00 for White and +1.00 for Black are mirror images', () => {
    const w = evaluationBarLayout(cp(100), 'w');
    const b = evaluationBarLayout(cp(-100), 'w');
    expect(w.leading).toBe('w');
    expect(b.leading).toBe('b');
    expect(w.label).toBe('+1.00');
    expect(b.label).toBe('-1.00');
    expect(w.bottomShare).toBeCloseTo(1 - b.bottomShare, 10);
    expect(w.labelAt).toBe('bottom');
    expect(b.labelAt).toBe('top');
  });

  it('mate saturates the bar without inventing a centipawn number', () => {
    const w = evaluationBarLayout(mate(3), 'w');
    expect(w.label).toBe('M3');
    expect(w.bottomShare).toBe(0.98);
    expect(w.leading).toBe('w');
    const b = evaluationBarLayout(mate(-4), 'w');
    expect(b.label).toBe('-M4');
    expect(b.bottomShare).toBe(0.02);
    expect(b.leading).toBe('b');
    expect(b.labelAt).toBe('top');
    // Flipped: Black's mate is the band at the bottom.
    const flipped = evaluationBarLayout(mate(-4), 'b');
    expect(flipped.bottomShare).toBe(0.98);
    expect(flipped.labelAt).toBe('bottom');
    expect(flipped.labelOn).toBe('b');
  });

  it('is neutral without a score, and at exactly 0.00', () => {
    const none = evaluationBarLayout(null, 'w');
    expect(none.label).toBe('—');
    expect(none.leading).toBeNull();
    expect(none.bottomShare).toBe(0.5);
    const level = evaluationBarLayout(cp(0), 'b');
    expect(level.label).toBe('0.00');
    expect(level.leading).toBeNull();
    expect(level.bottomShare).toBe(0.5);
  });

  it('grows with the advantage and clamps so both bands stay visible', () => {
    expect(whiteShare(cp(20))).toBeGreaterThan(whiteShare(cp(0)));
    expect(whiteShare(cp(300))).toBeGreaterThan(whiteShare(cp(100)));
    expect(whiteShare(cp(5000))).toBe(0.98);
    expect(whiteShare(cp(-5000))).toBe(0.02);
    expect(leadingSide(mate(0))).toBeNull();
  });
});
