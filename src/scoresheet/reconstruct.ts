/**
 * Filling a cell nobody could read from the moves around it.
 *
 * Every legal move at the gap is tried; under each, the moves written after
 * the gap are resolved as usual. A candidate survives when all of them
 * resolve. One survivor is the answer, flagged so the person knows it was
 * inferred; several are offered with how far each got; none means the
 * buffer itself holds the error, and the first token that fails under every
 * candidate is named.
 */

import type { Position } from '@/chess/position';
import type { ChessMove } from '@/chess/types';

import { readTokens, type Reading } from './reading';

export interface GapCandidate {
  readonly move: ChessMove;
  /** How the buffered tokens resolved after this move. */
  readonly reading: Reading;
  /** Tokens of the buffer that resolved. */
  readonly reach: number;
}

export interface Reconstruction {
  /** Candidates under which every buffered token resolves, best first. */
  readonly survivors: readonly GapCandidate[];
  /** Every candidate, by how far the buffer got. */
  readonly all: readonly GapCandidate[];
  /** With no survivor: the buffer index no candidate could get past. */
  readonly blockedAt: number | null;
}

export function reconstructGap(position: Position, buffer: readonly string[]): Reconstruction {
  const all: GapCandidate[] = [];
  for (const move of position.legalMoves()) {
    const after = position.after(move);
    const reading = readTokens(after, buffer, { exact: true });
    const reach = reading.stopped ? reading.stopped.index : buffer.length;
    all.push({ move, reading, reach });
  }
  all.sort((a, b) => b.reach - a.reach || a.move.san.localeCompare(b.move.san));
  const survivors = all.filter((candidate) => candidate.reach === buffer.length);
  const blockedAt = survivors.length ? null : Math.max(0, ...all.map((c) => c.reach));
  return { survivors, all, blockedAt };
}
