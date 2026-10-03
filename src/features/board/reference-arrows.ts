/**
 * The Explorer's moves as arrows (`stores/reference-arrows-store.ts`).
 *
 * A third identity beside the engine's and the person's own: muted, solid,
 * and as wide as the move is common, so the board says "this is what is
 * played" without looking like a recommendation. The hovered row is drawn
 * whatever the setting, as a preview of the move under the pointer.
 */

import { positionKey } from '@/chess/fen';
import { Position } from '@/chess/position';
import type { Square } from '@/chess/types';

import { uciToArrow } from './engine-arrows';

/** A move under this share of the games is not drawn unless hovered. */
export const REFERENCE_MIN_SHARE = 0.05;
/** At most this many, most played first. */
export const REFERENCE_MAX_ARROWS = 4;

export interface ReferenceArrow {
  readonly from: Square;
  readonly to: Square;
  readonly san: string;
  readonly share: number;
  /** Shaft width in squares: 0.06 for a rare move up to 0.28 for one played every time. */
  readonly width: number;
  readonly hovered: boolean;
}

export function computeReferenceArrows(input: {
  readonly fen: string | null;
  readonly boardFen: string;
  readonly moves: readonly { readonly uci: string; readonly san: string; readonly share: number }[];
  readonly hovered: string | null;
  readonly show: boolean;
}): readonly ReferenceArrow[] {
  if (!input.fen || positionKey(input.fen) !== positionKey(input.boardFen)) return [];
  const position = Position.fromFen(input.boardFen);
  if (!position.ok) return [];
  const chosen = input.show
    ? [...input.moves]
        .filter((move) => move.share >= REFERENCE_MIN_SHARE)
        .sort((a, b) => b.share - a.share)
        .slice(0, REFERENCE_MAX_ARROWS)
    : [];
  const hovered = input.moves.find((move) => move.uci === input.hovered);
  if (hovered && !chosen.some((move) => move.uci === hovered.uci)) chosen.push(hovered);
  const arrows: ReferenceArrow[] = [];
  for (const move of chosen) {
    const squares = uciToArrow(move.uci as Parameters<typeof uciToArrow>[0]);
    if (!squares || !position.value.playUci(move.uci).ok) continue;
    arrows.push({
      ...squares,
      san: move.san,
      share: move.share,
      width: 0.06 + 0.22 * Math.min(1, Math.max(0, move.share)),
      hovered: move.uci === input.hovered,
    });
  }
  return arrows;
}
