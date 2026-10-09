import type { OpponentStrength } from './conversion';

/**
 * What a missing tablebase move means for the opponent the player selected.
 *
 * "Tablebase-perfect — every defence is the best defence" is false if that
 * opponent then searches or plays a random legal move. Strong and club are
 * already described as engine searches, so a miss there may search.
 */
export function whenTablebaseGivesNoMove(strength: OpponentStrength): 'decline' | 'search' {
  return strength === 'tablebase-perfect' ? 'decline' : 'search';
}
