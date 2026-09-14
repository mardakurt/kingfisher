/**
 * A sparring partner that plays an opponent's own moves.
 *
 * The owner asked for a companion in Preparation that "acts like the player
 * selected" — plays like Carlsen, having studied Carlsen's games. What can
 * honestly be built from the games Kingfisher holds is exactly this: while the
 * position on the board is one the player has actually reached in those
 * games, the partner plays a move the player actually played there, chosen
 * with the frequency the player chose it, and says so — "1.e4, played in 62
 * of their 120 games". The moment the game leaves the player's own practice,
 * the partner says that too, and the engine plays from there.
 *
 * What it deliberately does not do: infer a "style" and steer the engine by
 * it. A blend of tendencies into an adjective is an opinion with the
 * arithmetic hidden — `src/player/tendencies.ts` refuses to produce one, and
 * so does this. The partner is evidence in the opening and an engine after
 * it, and the panel labels every move with which of the two it was.
 *
 * Pure. The opening tree is `buildOpeningTree`'s output over the games the
 * user selected; the randomness comes in as a function so a test can pin it.
 */

import { positionKey } from '@/chess/fen';
import type { Fen } from '@/chess/types';

import type { OpeningTree, PreparationEdge, PreparationNode } from './index';

export interface BookReply {
  readonly kind: 'book';
  readonly edge: PreparationEdge;
  /** The node the move was chosen at, for the panel's "N games here". */
  readonly node: PreparationNode;
}

export interface OutOfBook {
  readonly kind: 'out-of-book';
  /** Why: the position is not in their games, or is but nothing was played on from it. */
  readonly reason: 'unreached' | 'no-continuation';
}

export type SparringChoice = BookReply | OutOfBook;

/**
 * The player's reply at this position, from their games, or the reason there
 * is none.
 *
 * Weighted by how often they played each move: a move played in 40 of 60
 * games is chosen two times in three. `random` is a number in [0, 1).
 */
export function chooseBookReply(
  tree: OpeningTree,
  fen: Fen,
  random: () => number = Math.random,
): SparringChoice {
  const node = tree.nodes.get(positionKey(fen));
  if (!node) return { kind: 'out-of-book', reason: 'unreached' };
  const total = node.edges.reduce((sum, edge) => sum + edge.games, 0);
  if (total === 0 || node.edges.length === 0) {
    return { kind: 'out-of-book', reason: 'no-continuation' };
  }
  let roll = Math.min(Math.max(random(), 0), 0.999_999) * total;
  for (const edge of node.edges) {
    roll -= edge.games;
    if (roll < 0) return { kind: 'book', edge, node };
  }
  return { kind: 'book', edge: node.edges[node.edges.length - 1]!, node };
}

/** How a reply is announced, in the panel and in the move log. */
export function describeChoice(choice: SparringChoice, name: string): string {
  if (choice.kind === 'book') {
    const { edge, node } = choice;
    const share = node.games ? Math.round((edge.games / node.games) * 100) : 0;
    return `Played in ${edge.games} of ${name}'s ${node.games} ${
      node.games === 1 ? 'game' : 'games'
    } here (${share}%)${edge.lastPlayed ? `, last in ${edge.lastPlayed}` : ''}`;
  }
  return choice.reason === 'unreached'
    ? `${name}'s games do not reach this position. The engine plays from here.`
    : `${name}'s games reach this position but none continues from it. The engine plays from here.`;
}
