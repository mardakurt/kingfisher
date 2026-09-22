/** Position-page identities and game facts. Pure: no database, React or engine. */
import { parseFen, positionKey } from '@/chess/fen';
import { pawnSkeletonKey } from '@/chess/structure';
import { mainlinePath } from '@/chess/tree/tree';
import type { GameTree } from '@/chess/tree/types';
import type { Color, Fen } from '@/chess/types';
import { asFen } from '@/chess/types';
import { ownColor } from '@/round/identity';

export interface PositionIdentity {
  readonly key: string;
  readonly fen: Fen;
  readonly pawnSkeleton: string;
}

/** A key is validated as a position too; shape alone cannot establish legality. */
export function positionIdentity(input: string): PositionIdentity | null {
  const fields = input.trim().split(/\s+/);
  const candidate = fields.length === 4 ? `${fields.join(' ')} 0 1` : input.trim();
  if (!parseFen(candidate).ok) return null;
  const key = positionKey(candidate);
  const fen = asFen(`${key} 0 1`);
  const pawnSkeleton = pawnSkeletonKey(fen);
  return pawnSkeleton === null ? null : { key, fen, pawnSkeleton };
}

/** Counters never create a second address for the same position. */
export function positionPageUrl(input: string): string | null {
  const identity = positionIdentity(input);
  return identity ? `/position?fen=${encodeURIComponent(identity.fen)}` : null;
}

export interface PositionGameFacts {
  readonly nodeId: string;
  /** Ply already played, unlike the position index's outgoing-move ply. */
  readonly ply: number;
  readonly ownColor: Color | null;
  readonly result: string;
  readonly nextMove: string | null;
  readonly nextMoveColor: Color | null;
  /** Explicit [%emt] only. Missing commands do not become zero or inferred time. */
  readonly elapsedSeconds: number | null;
  /** Explicit [%clk] after the next move, not an estimate of the starting clock. */
  readonly remainingAfter: number | null;
}

const recordedSeconds = (value: number | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

/** Match the position before its continuation, not one move after it. */
export function positionGameFacts(
  tree: GameTree,
  key: string,
  aliases: readonly string[],
): PositionGameFacts | null {
  const path = mainlinePath(tree);
  const index = path.findIndex((id) => {
    const node = tree.nodes[id];
    return node && positionKey(node.fen) === key;
  });
  const id = path[index];
  const node = id ? tree.nodes[id] : undefined;
  if (!node) return null;
  const nextId = path[index + 1];
  const next = nextId ? tree.nodes[nextId] : undefined;
  return {
    nodeId: node.id,
    ply: node.ply,
    ownColor: ownColor(tree.headers, aliases),
    result: tree.headers.Result ?? '*',
    nextMove: next?.move?.san ?? null,
    nextMoveColor: next?.move?.color ?? null,
    elapsedSeconds: recordedSeconds(next?.meta.elapsedSeconds),
    remainingAfter: recordedSeconds(next?.meta.clockSeconds),
  };
}
