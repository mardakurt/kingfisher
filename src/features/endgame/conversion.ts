/**
 * Tablebase-refereed endgame practice.
 *
 * The point of practising a theoretical endgame against an engine is not to
 * find out who wins — you already know, that is why it is a theoretical
 * endgame. It is to find out whether *you* can hold the result. So the
 * referee here is the tablebase, not the engine's evaluation: after every
 * move it asks what the position is now worth, factually, and says so when
 * the answer has changed.
 *
 * The wording rule in §53 matters and is enforced by the tests. The report is
 * "The tablebase result changed from Win to Draw on this move." — never "you
 * blundered". The difference is not politeness. A tablebase knows the result
 * changed; it does not know whether the player was trying something, misread
 * the position, or made a typo, and a system that claims to know that is
 * making something up. It also cannot be right about a move a strong player
 * played deliberately to reach a position they understand better.
 */

import type { Color } from '@/chess/types';
import type { TablebaseCategory } from '@/tablebase/types';

/** The result, from one side's point of view, at the resolution a player uses. */
export type ConversionOutcome = 'win' | 'draw' | 'loss';

/**
 * A category, read from a chosen side's point of view.
 *
 * `category` is always for the side to move, so it is inverted whenever the
 * side to move is not the side we are asking about. Getting this wrong would
 * make the referee announce a change on every single move, which is the
 * failure mode worth having a test for.
 *
 * The two fifty-move categories collapse to `draw`: a cursed win is a win on
 * the board and a draw in the game, and the game is what is being played.
 * The nuance is not lost — `describeCategory` still has it for the panel.
 */
export function outcomeFor(
  category: TablebaseCategory,
  sideToMove: Color,
  perspective: Color,
): ConversionOutcome {
  const forMover = ((): ConversionOutcome => {
    switch (category) {
      case 'win':
        return 'win';
      case 'loss':
      case 'checkmate':
        // `checkmate` means the side to move is mated.
        return 'loss';
      case 'cursed-win':
      case 'blessed-loss':
      case 'draw':
      case 'stalemate':
        return 'draw';
    }
  })();
  if (sideToMove === perspective) return forMover;
  if (forMover === 'win') return 'loss';
  if (forMover === 'loss') return 'win';
  return 'draw';
}

export const OUTCOME_LABEL: Record<ConversionOutcome, string> = {
  win: 'Win',
  draw: 'Draw',
  loss: 'Loss',
};

/** Ordered worst to best, so a change can be described as a gain or a loss. */
const RANK: Record<ConversionOutcome, number> = { loss: 0, draw: 1, win: 2 };

export interface ResultChange {
  readonly from: ConversionOutcome;
  readonly to: ConversionOutcome;
  readonly direction: 'worse' | 'better';
  readonly message: string;
}

/**
 * What to say, if anything, about a move.
 *
 * `null` when the result held — which is the common case and deserves no
 * interruption. A trainer that comments on every move trains the player to
 * stop reading it.
 */
export function describeChange(
  before: ConversionOutcome,
  after: ConversionOutcome,
): ResultChange | null {
  if (before === after) return null;
  return {
    from: before,
    to: after,
    direction: RANK[after] < RANK[before] ? 'worse' : 'better',
    message: `The tablebase result changed from ${OUTCOME_LABEL[before]} to ${OUTCOME_LABEL[after]} on this move.`,
  };
}

export type ConversionEnding =
  | { readonly kind: 'checkmate'; readonly winner: Color }
  | { readonly kind: 'stalemate' }
  | { readonly kind: 'draw'; readonly reason: string }
  /** The win is gone and cannot come back without the opponent erring. */
  | { readonly kind: 'result-lost'; readonly from: ConversionOutcome }
  | { readonly kind: 'converted' };

/**
 * Whether the session is over, and why.
 *
 * §54's list: mate, draw, the result irreversibly lost, or the user stopping.
 * "Irreversibly lost" is judged against the *starting* result rather than the
 * previous move: drifting from Win to Draw and back to Win is a session worth
 * continuing, and only a result that is worse than where you began and has
 * stayed there ends it.
 */
export function endingFor(input: {
  readonly category: TablebaseCategory;
  readonly sideToMove: Color;
  readonly perspective: Color;
  readonly startingOutcome: ConversionOutcome;
  readonly halfmoveClock: number;
}): ConversionEnding | null {
  if (input.category === 'checkmate') {
    // The side to move is mated, so the other side won.
    return { kind: 'checkmate', winner: input.sideToMove === 'w' ? 'b' : 'w' };
  }
  if (input.category === 'stalemate') return { kind: 'stalemate' };
  if (input.halfmoveClock >= 100) {
    return { kind: 'draw', reason: 'Fifty moves without a capture or a pawn move.' };
  }

  const current = outcomeFor(input.category, input.sideToMove, input.perspective);
  if (current === input.startingOutcome) return null;
  if (RANK[current] < RANK[input.startingOutcome]) {
    return { kind: 'result-lost', from: input.startingOutcome };
  }
  return null;
}

/**
 * The engine's job in a refereed session.
 *
 * It plays the opponent, and it should play the *position* rather than the
 * strongest move it can find: a tablebase-perfect opponent in a lost position
 * makes practice impossible to fail, and a weak one makes it meaningless.
 * Naming the choice keeps it a decision the user made rather than a default
 * nobody noticed.
 */
export type OpponentStrength = 'tablebase-perfect' | 'strong' | 'club';

export const OPPONENT_STRENGTH_LABEL: Record<OpponentStrength, string> = {
  'tablebase-perfect': 'Tablebase-perfect — every defence is the best defence',
  strong: 'Strong — a full engine search, but no tablebase',
  club: 'Club strength — a shallow search that will go wrong',
};

/** Search depth for the engine-backed strengths. */
export const strengthDepth = (strength: OpponentStrength): number => (strength === 'club' ? 6 : 18);
