/**
 * Re-exported from the piece-set registry.
 *
 * Kept as a module so existing imports of `features/board/pieces` keep working
 * while the implementation lives in `piece-sets/`, where geometry and styling
 * are separated.
 */

export {
  PieceIcon,
  PieceSetPreview,
  PIECE_SETS,
  PREVIEW_ORDER,
  pieceLabel,
  pieceLetter,
  pieceSet,
  type PieceIconProps,
  type PieceSetDefinition,
  type PieceSetId,
} from './piece-sets';
