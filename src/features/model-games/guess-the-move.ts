/**
 * Guess the move a master actually played.
 *
 * A different question from anything else Kingfisher asks, and the difference
 * is the point:
 *
 *   Training      — what is the best move here?      Checked against a stored answer.
 *   Calculation   — what would you play here?        Nothing is checked.
 *   Guess-the-move— what did *this player* play?     Checked against the game.
 *
 * The third has an answer that is a historical fact rather than an evaluation,
 * which is exactly why it teaches something the other two cannot: you are
 * trying to reconstruct a strong player's reasoning, and being told the engine
 * prefers something else is beside the point. So the engine stays off unless
 * the player asks for it, and a "wrong" guess is reported as a difference from
 * the game, never as a mistake.
 */

import type { GameTree, MoveNode, NodeId } from '@/chess/tree/types';
import { mainlinePath } from '@/chess/tree/tree';
import type { San, Uci } from '@/chess/types';
import type { Color } from '@/chess/types';

export interface GuessTarget {
  readonly nodeId: NodeId;
  /** The position to guess from, i.e. the parent of the played move. */
  readonly fromNodeId: NodeId;
  readonly fen: string;
  readonly ply: number;
  readonly sideToMove: Color;
  readonly playedUci: Uci;
  readonly playedSan: San;
}

/**
 * The moves worth guessing, in game order.
 *
 * Only one side's, because guessing both is guessing at a conversation rather
 * than following a player's thinking. Openings are skipped by default: the
 * first dozen plies of a master game are recall, and being asked to guess them
 * teaches opening knowledge the player either has or does not.
 */
export function guessTargets(
  tree: GameTree,
  options: {
    readonly color: Color;
    /** Plies to skip at the start. */
    readonly fromPly?: number;
    /** Only these node ids, when the player has marked key moments. */
    readonly onlyNodeIds?: readonly NodeId[];
  },
): readonly GuessTarget[] {
  const fromPly = options.fromPly ?? 12;
  const only = options.onlyNodeIds ? new Set(options.onlyNodeIds) : null;
  const path = mainlinePath(tree);
  const targets: GuessTarget[] = [];

  for (let index = 0; index < path.length - 1; index += 1) {
    const parent = tree.nodes[path[index] as NodeId];
    const child = tree.nodes[path[index + 1] as NodeId] as MoveNode | undefined;
    if (!parent || !child?.move) continue;
    if (child.move.color !== options.color) continue;
    if (only ? !only.has(child.id) : child.ply < fromPly) continue;
    targets.push({
      nodeId: child.id,
      fromNodeId: parent.id,
      fen: parent.fen,
      ply: child.ply,
      sideToMove: child.move.color,
      playedUci: child.move.uci,
      playedSan: child.move.san,
    });
  }
  return targets;
}

export type GuessOutcome = 'match' | 'different';

export interface GuessResult {
  readonly outcome: GuessOutcome;
  readonly guessedSan: San;
  readonly playedSan: San;
  /** A sentence for the player, phrased as a comparison rather than a mark. */
  readonly message: string;
}

/**
 * Compare a guess with what was played.
 *
 * `different` rather than `wrong`. The game move is what one strong player
 * chose on one day against one opponent, and a different move can be better —
 * saying otherwise would teach the player to defer to a result rather than to
 * reason about a position.
 */
export function judgeGuess(guess: { uci: Uci; san: San }, target: GuessTarget): GuessResult {
  if (guess.uci === target.playedUci) {
    return {
      outcome: 'match',
      guessedSan: guess.san,
      playedSan: target.playedSan,
      message: `Yes — ${target.playedSan} was played.`,
    };
  }
  return {
    outcome: 'different',
    guessedSan: guess.san,
    playedSan: target.playedSan,
    message: `The game went ${target.playedSan}. You chose ${guess.san}.`,
  };
}

/**
 * The running tally for one pass through a game.
 *
 * Two counts and nothing else. No percentage, no streak, no grade: a
 * percentage invites a player to optimise it, and the thing worth optimising
 * here is understanding a game, which the number cannot see.
 */
export interface GuessTally {
  readonly matched: number;
  readonly attempted: number;
}

export const EMPTY_TALLY: GuessTally = { matched: 0, attempted: 0 };

export const recordGuess = (tally: GuessTally, result: GuessResult): GuessTally => ({
  matched: tally.matched + (result.outcome === 'match' ? 1 : 0),
  attempted: tally.attempted + 1,
});

/** Which colour a stored game's own player had, when the user is in it. */
export function guessColorFor(tree: GameTree, aliases: readonly string[]): Color | null {
  const normalise = (value: string | undefined) => (value ?? '').trim().toLowerCase();
  const keys = new Set(aliases.map((alias) => alias.trim().toLowerCase()).filter(Boolean));
  if (keys.has(normalise(tree.headers.White))) return 'w';
  if (keys.has(normalise(tree.headers.Black))) return 'b';
  return null;
}
