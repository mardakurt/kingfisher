import { mainlinePath } from '@/chess/tree/tree';
import type { GameTree, NodeId } from '@/chess/tree/types';

export function stableId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Exact-import identity. The complete normalized tree is represented by its
 * stable PGN elsewhere; this compact input makes the common duplicate check
 * cheap while retaining headers and the complete main line.
 */
export function gameFingerprint(tree: GameTree, normalizedPgn: string): string {
  const moves = mainlinePath(tree)
    .slice(1)
    .map((id) => tree.nodes[id as NodeId]?.move?.uci ?? '')
    .join(' ');
  const identity = [
    tree.headers.White ?? '',
    tree.headers.Black ?? '',
    tree.headers.Date ?? '',
    tree.headers.Event ?? '',
    tree.headers.Round ?? '',
    tree.headers.Result ?? '*',
    moves,
    normalizedPgn,
  ].join('\u001f');
  return fnv1a64(identity);
}

/** Deterministic, dependency-free 64-bit FNV-1a rendered as sixteen hex digits. */
export function fnv1a64(value: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * prime);
  }
  return hash.toString(16).padStart(16, '0');
}
