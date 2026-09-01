/**
 * A repertoire as PGN.
 *
 * A repertoire is a map from positions to moves; PGN is a tree of move
 * sequences. Those are not the same shape, and the export is honest about the
 * difference rather than inventing a container of its own:
 *
 * - Every position the repertoire answers is walked from the starting position,
 *   depth first, and each answer becomes a move. Alternatives at the same
 *   position become PGN variations, which is exactly what a variation is.
 * - Recorded opponent replies continue the line, because a line has to alternate
 *   to be a line at all. A position with several recorded replies branches.
 * - Notes and roles are written as move comments, since PGN has nowhere else to
 *   put them. They read back as comments, not as roles: importing this file
 *   elsewhere gives you the moves and the prose, not the model.
 * - `avoid` moves are exported as a comment on the position rather than as a
 *   move, because writing them as moves would make a rejected line look played.
 *
 * What therefore does *not* round-trip: roles, expected-reply status, depths,
 * and the position identity itself. That is a property of PGN, not a decision
 * to fix later, and it is stated in ARCHITECTURE.md.
 */

import { positionKey } from '@/chess/fen';
import { playUciAt } from '@/chess/game';
import { serializePgn } from '@/chess/pgn';
import { createTree, setComment } from '@/chess/tree/tree';
import type { GameTree, NodeId } from '@/chess/tree/types';
import type { Fen } from '@/chess/types';
import type {
  RepertoireMove,
  RepertoirePositionRecord,
  RepertoireRecord,
} from '@/persistence/domain';

/** Deepest line the export follows, so a cycle cannot produce an endless file. */
const MAX_PLIES = 80;

const ROLE_COMMENT: Record<RepertoireMove['role'], string> = {
  main: 'Main',
  alternative: 'Alternative',
  candidate: 'Candidate',
  avoid: 'Avoid',
};

export interface RepertoireExportOptions {
  /** Where the walk starts. Defaults to the standard initial position. */
  readonly startFen?: Fen;
}

export function repertoireToTree(
  repertoire: RepertoireRecord,
  positions: readonly RepertoirePositionRecord[],
  options: RepertoireExportOptions = {},
): GameTree {
  const byKey = new Map(positions.map((position) => [position.positionKey, position]));
  const start =
    options.startFen ??
    // The shallowest recorded position is the natural root when a repertoire
    // was built from a non-standard setup.
    [...positions].sort((a, b) => a.depth - b.depth)[0]?.fen ??
    ('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' as Fen);

  let tree = createTree(start, {
    Event: repertoire.title,
    Site: 'Kingfisher',
    White: repertoire.color === 'w' ? repertoire.title : '?',
    Black: repertoire.color === 'b' ? repertoire.title : '?',
    Result: '*',
    RepertoireColor: repertoire.color === 'w' ? 'White' : 'Black',
    ...(repertoire.description ? { RepertoireDescription: repertoire.description } : {}),
  });

  const walk = (nodeId: NodeId, fen: Fen, depth: number, visited: ReadonlySet<string>): void => {
    if (depth >= MAX_PLIES) return;
    const key = positionKey(fen);
    // A transposition back into a line already on this path would loop forever.
    if (visited.has(key)) return;
    const position = byKey.get(key);
    if (!position) return;

    const notes = positionComment(position);
    if (notes) tree = setComment(tree, nodeId, notes);

    const playable = position.moves.filter((move) => move.role !== 'avoid');
    if (playable.length === 0) return;

    const nextVisited = new Set([...visited, key]);
    for (const move of playable) {
      const played = playUciAt(tree, nodeId, move.uci);
      // A stored move that is no longer legal here means the FEN and the move
      // disagree; skipping it is better than aborting the whole export.
      if (!played.ok) continue;
      tree = played.value.tree;
      const child = played.value.tree.nodes[played.value.nodeId];
      const comment = moveComment(move);
      if (comment) tree = setComment(tree, played.value.nodeId, comment);
      if (child) walk(played.value.nodeId, child.fen, depth + 1, nextVisited);
    }
  };

  walk(tree.rootId, start, 0, new Set());
  return tree;
}

export function exportRepertoirePgn(
  repertoire: RepertoireRecord,
  positions: readonly RepertoirePositionRecord[],
  options: RepertoireExportOptions = {},
): string {
  return serializePgn(repertoireToTree(repertoire, positions, options));
}

function moveComment(move: RepertoireMove): string {
  const parts = [move.expected ? 'Expected reply' : ROLE_COMMENT[move.role]];
  if (move.note) parts.push(move.note);
  return parts.join(' — ');
}

function positionComment(position: RepertoirePositionRecord): string {
  const parts: string[] = [];
  if (position.note) parts.push(position.note);
  const avoided = position.moves.filter((move) => move.role === 'avoid' && !move.expected);
  if (avoided.length) {
    parts.push(`Avoid: ${avoided.map((move) => move.san).join(', ')}`);
  }
  return parts.join(' — ');
}
