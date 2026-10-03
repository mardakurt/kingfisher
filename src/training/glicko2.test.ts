import { describe, expect, it } from 'vitest';

import { GLICKO2_DEFAULT, glicko2Update } from './glicko2';

describe('Glicko-2', () => {
  /*
   * Glickman, "Example of the Glicko-2 system" (2013), §"Example
   * calculation": a 1500 / 200 / 0.06 player beats a 1400/30, loses to a
   * 1550/100 and to a 1700/300, with τ = 0.5. The paper's answer is
   * r' = 1464.06, RD' = 151.52, σ' = 0.05999.
   */
  it('reproduces the worked example in Glickman’s paper', () => {
    const next = glicko2Update({ rating: 1500, deviation: 200, volatility: 0.06 }, [
      { opponentRating: 1400, opponentDeviation: 30, score: 1 },
      { opponentRating: 1550, opponentDeviation: 100, score: 0 },
      { opponentRating: 1700, opponentDeviation: 300, score: 0 },
    ]);
    expect(next.rating).toBeCloseTo(1464.06, 1);
    expect(next.deviation).toBeCloseTo(151.52, 1);
    // The paper prints σ′ truncated to 0.05999; the computed value is 0.059996.
    expect(next.volatility).toBeCloseTo(0.06, 4);
  });

  it('only widens the deviation in a period with no games', () => {
    const next = glicko2Update({ rating: 1700, deviation: 60, volatility: 0.06 }, []);
    expect(next.rating).toBe(1700);
    expect(next.deviation).toBeGreaterThan(60);
  });

  it('rises on a win and falls on a loss against an equal opponent', () => {
    const win = glicko2Update(GLICKO2_DEFAULT, [
      { opponentRating: 1500, opponentDeviation: 80, score: 1 },
    ]);
    const loss = glicko2Update(GLICKO2_DEFAULT, [
      { opponentRating: 1500, opponentDeviation: 80, score: 0 },
    ]);
    expect(win.rating).toBeGreaterThan(1500);
    expect(loss.rating).toBeLessThan(1500);
    expect(win.rating - 1500).toBeCloseTo(1500 - loss.rating, 6);
    expect(win.deviation).toBeLessThan(350);
  });
});
