/**
 * Two positions side by side: what differs, square by square and fact by fact.
 *
 * A strong player comparing two positions — the one in their repertoire and
 * the one their opponent reached, a structure before and after a pawn trade —
 * asks two questions: where are the pieces different, and which structural
 * facts hold in one and not the other? Both are countable from the diagrams,
 * so this answers both and nothing else: no evaluation, no "better", no
 * similarity score. The facts are the ones the Features panel already states
 * (`structureClaims`), so a difference here is a line the user can find there.
 */

import { squareAt } from '@/chess/board';
import { parseFen, positionKey } from '@/chess/fen';
import { structureClaims, structureFacts } from '@/chess/structure';
import type { Square } from '@/chess/types';

export interface PositionComparison {
  /** Same pieces on the same squares, same side to move, same rights. */
  readonly samePosition: boolean;
  /** Squares whose occupant differs (a piece in one, another or none in the other). */
  readonly differingSquares: readonly Square[];
  readonly sameSideToMove: boolean;
  /** Structural facts true of both. */
  readonly shared: readonly string[];
  /** True of the first position only. */
  readonly onlyFirst: readonly string[];
  /** True of the second position only. */
  readonly onlySecond: readonly string[];
}

export function comparePositions(first: string, second: string): PositionComparison | null {
  const a = parseFen(first);
  const b = parseFen(second);
  if (!a.ok || !b.ok) return null;
  const factsA = structureFacts(first);
  const factsB = structureFacts(second);
  if (!factsA || !factsB) return null;

  const differingSquares: Square[] = [];
  for (let index = 0; index < 64; index += 1) {
    const pieceA = a.value.board[index];
    const pieceB = b.value.board[index];
    if (pieceA?.color !== pieceB?.color || pieceA?.type !== pieceB?.type) {
      differingSquares.push(squareAt(index));
    }
  }

  const claimsA = structureClaims(factsA);
  const claimsB = structureClaims(factsB);
  const idsB = new Set(claimsB.map((claim) => claim.id));
  const idsA = new Set(claimsA.map((claim) => claim.id));

  return {
    samePosition: positionKey(first) === positionKey(second),
    differingSquares,
    sameSideToMove: a.value.turn === b.value.turn,
    shared: claimsA.filter((claim) => idsB.has(claim.id)).map((claim) => claim.label),
    onlyFirst: claimsA.filter((claim) => !idsB.has(claim.id)).map((claim) => claim.label),
    onlySecond: claimsB.filter((claim) => !idsA.has(claim.id)).map((claim) => claim.label),
  };
}
