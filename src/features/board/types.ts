/**
 * The board's public surface.
 *
 * This is the abstraction the application codes against. The board takes a
 * position and a set of legal destinations and reports intents; it knows
 * nothing about the rules, the engine or the move tree. Swapping the renderer
 * (for a canvas version, or a third-party component) means satisfying this
 * interface and changing nothing else.
 */

import type { Shape } from '@/chess/annotations';
import type { ChessMove, Color, Fen, MoveIntent, PromotionPiece, Square } from '@/chess/types';
import type { BoardThemeId, CoordinateStyle, PieceSetId } from '@/lib/board-options';

export interface ChessboardProps {
  readonly fen: Fen;
  readonly orientation: Color;
  /** The move that produced this position, used for highlights and animation. */
  readonly lastMove?: ChessMove | null;
  readonly checkSquare?: Square | null;
  /** Legal destinations per origin square. An empty map disables move input. */
  readonly destinations?: ReadonlyMap<Square, readonly Square[]>;
  readonly onMove?: (intent: MoveIntent) => void;
  /** Asked before completing a move, to decide whether to show the picker. */
  readonly isPromotion?: (from: Square, to: Square) => boolean;
  readonly promotionColor?: Color;
  readonly shapes?: readonly Shape[];
  readonly onShapeToggle?: (shape: Shape) => void;
  readonly onShapesClear?: () => void;
  readonly theme: BoardThemeId;
  readonly pieceSet: PieceSetId;
  readonly coordinates?: CoordinateStyle;
  /** Move animation duration; 0 disables animation entirely. */
  readonly animationMs?: number;
  /** Squares the rest of the UI wants emphasised, e.g. an explorer hover. */
  readonly emphasis?: readonly Square[];
  readonly className?: string;
}

export type PromotionChoice = PromotionPiece;
