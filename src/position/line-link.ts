/**
 * A line as an address: the position it starts from and the moves to the one
 * on the board, so a person can send a position — with how it was reached —
 * as a link, and the link opens it in anyone's Kingfisher.
 *
 * `?fen=` has been read by every route since Phase 51; `?moves=` adds the
 * line, in UCI, comma-separated: position-independent text that needs no
 * escaping and survives every chat client. The start position is left out of
 * the address when it is the standard one. Only chess goes into it — no
 * comment, no name, no evaluation — because a link is pasted into places a
 * study was never meant to be.
 */

import { START_FEN, positionKey } from '@/chess/fen';
import { playUciAt } from '@/chess/game';
import { createTree, nodePath } from '@/chess/tree/tree';
import type { GameTree, NodeId } from '@/chess/tree/types';
import type { Fen } from '@/chess/types';

/** The address of the line from `tree`'s start to `nodeId`, on `base` (the Studio). */
export function lineLink(base: string, tree: GameTree, nodeId: NodeId): string {
  const root = tree.nodes[tree.rootId];
  const moves = nodePath(tree, nodeId)
    .map((id) => tree.nodes[id]?.move?.uci)
    .filter((uci): uci is NonNullable<typeof uci> => Boolean(uci));
  const params = new URLSearchParams();
  if (root && positionKey(root.fen) !== positionKey(START_FEN)) params.set('fen', root.fen);
  if (moves.length > 0) params.set('moves', moves.join(','));
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

export interface LinkedLine {
  readonly tree: GameTree;
  /** The last move the link reached, where the board should open. */
  readonly currentId: NodeId;
  /** Moves of the link played, of `requested`. */
  readonly played: number;
  readonly requested: number;
}

/**
 * The tree a link describes: its moves played from its position, as far as
 * they are legal. A link whose line breaks part-way opens at the last legal
 * move and says how far it got; it is not refused, because the position it
 * did reach is real and probably what was meant.
 */
export function lineFromLink(fen: Fen, moves: string): LinkedLine {
  let tree = createTree(fen, { Event: 'Analysis', Result: '*' });
  let cursor = tree.rootId;
  const requested = moves
    .split(/[\s,]+/)
    .map((move) => move.trim())
    .filter(Boolean);
  let played = 0;
  for (const uci of requested) {
    const next = playUciAt(tree, cursor, uci);
    if (!next.ok) break;
    tree = next.value.tree;
    cursor = next.value.nodeId;
    played += 1;
  }
  return { tree, currentId: cursor, played, requested: requested.length };
}
