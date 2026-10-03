/**
 * Glicko-2, as Mark Glickman specifies it ("Example of the Glicko-2 system",
 * 2013), and nothing more.
 *
 * Kingfisher uses it for one thing: a solver rating over puzzle attempts,
 * where every attempt is a one-game rating period against the puzzle's own
 * published rating. That is how the puzzle ratings were produced at their
 * source, so the two numbers are on comparable scales — comparable, not the
 * same: a rating earned here is Kingfisher's, from this person's attempts in
 * this browser, and is never presented as a rating anywhere else.
 */

export interface Glicko2Rating {
  readonly rating: number;
  readonly deviation: number;
  readonly volatility: number;
}

export interface Glicko2Game {
  readonly opponentRating: number;
  readonly opponentDeviation: number;
  /** 1 win, 0.5 draw, 0 loss. */
  readonly score: number;
}

/** Glickman's suggested starting point for an unrated player. */
export const GLICKO2_DEFAULT: Glicko2Rating = { rating: 1500, deviation: 350, volatility: 0.06 };

/** System constant τ: Glickman suggests 0.3–1.2; his example uses 0.5. */
export const GLICKO2_TAU = 0.5;

const SCALE = 173.7178;
const EPSILON = 0.000001;

const g = (phi: number): number => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
const expected = (mu: number, muJ: number, phiJ: number): number =>
  1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));

/** One rating period. With no games, only the deviation grows (step 6). */
export function glicko2Update(
  player: Glicko2Rating,
  games: readonly Glicko2Game[],
  tau = GLICKO2_TAU,
): Glicko2Rating {
  const mu = (player.rating - 1500) / SCALE;
  const phi = player.deviation / SCALE;
  const sigma = player.volatility;

  if (games.length === 0) {
    const grown = Math.sqrt(phi * phi + sigma * sigma);
    return { ...player, deviation: grown * SCALE };
  }

  // Step 3: the estimated variance v.
  let vInverse = 0;
  let deltaSum = 0;
  for (const game of games) {
    const muJ = (game.opponentRating - 1500) / SCALE;
    const phiJ = game.opponentDeviation / SCALE;
    const e = expected(mu, muJ, phiJ);
    vInverse += g(phiJ) * g(phiJ) * e * (1 - e);
    deltaSum += g(phiJ) * (game.score - e);
  }
  const v = 1 / vInverse;
  // Step 4: the estimated improvement Δ.
  const delta = v * deltaSum;

  // Step 5: the new volatility, by the Illinois algorithm.
  const a = Math.log(sigma * sigma);
  const f = (x: number): number => {
    const ex = Math.exp(x);
    return (
      (ex * (delta * delta - phi * phi - v - ex)) / (2 * (phi * phi + v + ex) ** 2) -
      (x - a) / (tau * tau)
    );
  };
  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * tau) < 0) k += 1;
    B = a - k * tau;
  }
  let fA = f(A);
  let fB = f(B);
  while (Math.abs(B - A) > EPSILON) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA /= 2;
    }
    B = C;
    fB = fC;
  }
  const sigmaPrime = Math.exp(A / 2);

  // Steps 6–8.
  const phiStar = Math.sqrt(phi * phi + sigmaPrime * sigmaPrime);
  const phiPrime = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muPrime = mu + phiPrime * phiPrime * deltaSum;
  return {
    rating: muPrime * SCALE + 1500,
    deviation: phiPrime * SCALE,
    volatility: sigmaPrime,
  };
}
