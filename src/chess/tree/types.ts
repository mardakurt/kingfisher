/**
 * The game tree: the central data structure of the application.
 *
 * A chess game is not a list of moves. It is a tree whose main line happens to
 * be one path through it, and every serious feature — repertoires, studies,
 * analysis, preparation — is really an operation on that tree. It is therefore
 * modelled explicitly: nodes with identity, a parent, ordered children, and
 * everything an annotator might attach.
 *
 * Nodes are stored in a flat map keyed by id rather than nested objects, so
 * updates touch O(depth) objects instead of rebuilding a subtree, and so React
 * can compare individual nodes cheaply.
 */

import type { Evaluation } from '../evaluation';
import type { Shape } from '../annotations';
import type { ChessMove, Fen } from '../types';

export type NodeId = string;

/** How a move relates to the user's repertoire. */
export type RepertoireStatus =
  'main' | 'alternative' | 'candidate' | 'avoid' | 'needs-review' | 'memorized' | 'weak';

/**
 * Qualitative judgement of a move.
 *
 * The vocabulary is defined here so that nodes can carry it, but no classifier
 * ships in this phase: a threshold on centipawn loss is not a chess judgement,
 * and baking one in would make it permanent. See
 * `docs/adr/0005-move-classification.md`.
 */
export type MoveClassification =
  | 'best'
  | 'excellent'
  | 'good'
  | 'interesting'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'
  | 'critical'
  | 'only-move'
  | 'practical'
  | 'novelty';

/**
 * Why a position was marked critical.
 *
 * Five kinds of "come back to this", because the follow-up work differs: an
 * opening hole is repertoire work, a miscalculation is training material, and
 * time trouble is neither. Kept as a closed set so the marker stays a fact
 * rather than a free-text label nobody can filter on.
 */
export type CriticalCategory = 'opening' | 'calculation' | 'strategy' | 'endgame' | 'time-trouble';

export interface NodeMeta {
  /** Clock reading after the move, in seconds (PGN `[%clk]`). */
  readonly clockSeconds?: number;
  /** Time spent on the move, in seconds (PGN `[%emt]`). */
  readonly elapsedSeconds?: number;
  readonly classification?: MoveClassification;
  readonly repertoire?: RepertoireStatus;
  /** A position the user deliberately marked for later work. */
  readonly critical?: CriticalCategory;
  /** Epoch milliseconds when the node was created. */
  readonly createdAt?: number;
}

export interface MoveNode {
  readonly id: NodeId;
  readonly parentId: NodeId | null;
  /** Ordered; `children[0]` is the continuation of this line. */
  readonly children: readonly NodeId[];
  /** `null` only for the root node, which represents the starting position. */
  readonly move: ChessMove | null;
  /** Position *after* `move`; for the root, the starting position. */
  readonly fen: Fen;
  /** Absolute half-move index. Odd plies are White's moves. */
  readonly ply: number;
  readonly nags: readonly number[];
  /** Commentary printed after the move. */
  readonly comment?: string;
  /** Commentary printed before the move, e.g. an introduction to a variation. */
  readonly preComment?: string;
  readonly shapes: readonly Shape[];
  readonly evaluation?: Evaluation;
  readonly meta: NodeMeta;
}

export interface GameTree {
  readonly rootId: NodeId;
  readonly nodes: Readonly<Record<NodeId, MoveNode>>;
  readonly startFen: Fen;
  /** PGN tag pairs, preserved verbatim so import/export round-trips. */
  readonly headers: Readonly<Record<string, string>>;
  /** Monotonic id counter; keeps node ids deterministic and serialisable. */
  readonly nextId: number;
}

export const isRoot = (node: MoveNode): boolean => node.parentId === null;

/** White plays odd plies. */
export const colorOfPly = (ply: number): 'w' | 'b' => (ply % 2 === 1 ? 'w' : 'b');

/** Move number as it is printed: ply 1 and 2 are both move 1. */
export const moveNumberOfPly = (ply: number): number => Math.ceil(ply / 2);
