import { describe, expect, it } from 'vitest';

import { cp, mate } from '@/chess/evaluation';

import {
  compactScore,
  evaluationBarLayout,
  leadingSide,
  whiteShare,
} from './evaluation-bar-layout';

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

  it('+1.0 for White and +1.0 for Black are mirror images', () => {
    const w = evaluationBarLayout(cp(100), 'w');
    const b = evaluationBarLayout(cp(-100), 'w');
    expect(w.leading).toBe('w');
    expect(b.leading).toBe('b');
    expect(w.label).toBe('+1.0');
    expect(b.label).toBe('-1.0');
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

  it('mate-in-1 is not equalised (the owner-reported bug)', () => {
    /*
      The owner reported that the bar stops working when mate is found: it
      shows equal even though the position is decided. The test below pins
      every (mate, orientation) combination to a non-50% share, because the
      only way the bar can show 50% is for the score to be missing, not for
      the score to exist. A future regression that drops `winningChances`
      for mate scores will fail these.
    */
    for (const score of [mate(1), mate(-1), mate(2), mate(-2), mate(7), mate(-7)]) {
      const w = evaluationBarLayout(score, 'w');
      const b = evaluationBarLayout(score, 'b');
      expect(w.leading).not.toBeNull();
      expect(b.leading).not.toBeNull();
      expect(w.bottomShare).not.toBe(0.5);
      expect(b.bottomShare).not.toBe(0.5);
      // The leading side's share is always the dominant one, whichever
      // orientation the board is in.
      const winningForWhite = score.moves > 0;
      expect(winningForWhite ? w.bottomShare : 1 - w.bottomShare).toBeGreaterThan(0.5);
      expect(winningForWhite ? 1 - b.bottomShare : b.bottomShare).toBeGreaterThan(0.5);
    }
  });

  it('is neutral without a score, and at exactly 0.0', () => {
    const none = evaluationBarLayout(null, 'w');
    expect(none.label).toBe('—');
    expect(none.leading).toBeNull();
    expect(none.bottomShare).toBe(0.5);
    const level = evaluationBarLayout(cp(0), 'b');
    expect(level.label).toBe('0.0');
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

describe('the bar label fits the bar', () => {
  it('keeps one decimal across the range, so five characters always suffice', () => {
    expect(compactScore(cp(38))).toBe('+0.4');
    expect(compactScore(cp(-120))).toBe('-1.2');
    expect(compactScore(cp(999))).toBe('+10.0');
    expect(compactScore(cp(1250))).toBe('+12.5');
    expect(compactScore(cp(-1000))).toBe('-10.0');
    expect(compactScore(cp(-99999))).toBe('-1000');
    expect(compactScore(mate(12))).toBe('M12');
    expect(compactScore(mate(-3))).toBe('-M3');
    expect(compactScore(null)).toBe('—');
    for (const score of [cp(38), cp(-120), cp(1250), cp(-99999), mate(12), mate(-3)]) {
      expect(compactScore(score).length).toBeLessThanOrEqual(5);
    }
  });

  it('the layout carries both the full figure and the bar figure', () => {
    const layout = evaluationBarLayout(cp(1250), 'w');
    expect(layout.label).toBe('+12.5');
    expect(layout.barLabel).toBe('+12.5');
  });
});
