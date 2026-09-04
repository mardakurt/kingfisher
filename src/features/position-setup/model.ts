import { formatFen, parseFen, START_FEN, type FenParts } from '@/chess/fen';
import { squareIndex } from '@/chess/board';
import { Position } from '@/chess/position';
import type { Fen, Piece, Square } from '@/chess/types';

export interface PositionSetupState {
  readonly board: readonly (Piece | null)[];
  readonly turn: 'w' | 'b';
  readonly whiteKing: boolean;
  readonly whiteQueen: boolean;
  readonly blackKing: boolean;
  readonly blackQueen: boolean;
  readonly epSquare: Square | null;
  readonly halfmoveClock: number;
  readonly fullmoveNumber: number;
}

export type SetupValidation =
  { readonly ok: true; readonly fen: Fen } | { readonly ok: false; readonly message: string };

export type ParsedSetup =
  | { readonly ok: true; readonly fen: Fen; readonly state: PositionSetupState }
  | { readonly ok: false; readonly message: string; readonly state?: PositionSetupState };

export function setupFromFen(input: string): ParsedSetup {
  const parsed = parseFen(input);
  if (!parsed.ok) return { ok: false, message: parsed.error.message };
  const parts = parsed.value;
  const state: PositionSetupState = {
    board: [...parts.board],
    turn: parts.turn,
    whiteKing: parts.castling.whiteKing,
    whiteQueen: parts.castling.whiteQueen,
    blackKing: parts.castling.blackKing,
    blackQueen: parts.castling.blackQueen,
    epSquare: parts.epSquare,
    halfmoveClock: parts.halfmoveClock,
    fullmoveNumber: parts.fullmoveNumber,
  };
  const validation = validateSetup(state);
  return validation.ok ? { ...validation, state } : { ...validation, state };
}

export const startingSetup = (): PositionSetupState => {
  const result = setupFromFen(START_FEN);
  if (!result.ok) throw new Error(result.message);
  return result.state;
};

export const clearSetup = (): PositionSetupState => ({
  ...startingSetup(),
  board: new Array<Piece | null>(64).fill(null),
  whiteKing: false,
  whiteQueen: false,
  blackKing: false,
  blackQueen: false,
  epSquare: null,
});

export function withPiece(
  state: PositionSetupState,
  square: Square,
  piece: Piece | null,
): PositionSetupState {
  const board = [...state.board];
  board[squareIndex(square)] = piece;
  return { ...state, board };
}

export function setupFen(state: PositionSetupState): Fen {
  const parts: FenParts = {
    board: state.board,
    turn: state.turn,
    castling: {
      whiteKing: state.whiteKing,
      whiteQueen: state.whiteQueen,
      blackKing: state.blackKing,
      blackQueen: state.blackQueen,
    },
    epSquare: state.epSquare,
    halfmoveClock: state.halfmoveClock,
    fullmoveNumber: state.fullmoveNumber,
  };
  return formatFen(parts);
}

export function validateSetup(state: PositionSetupState): SetupValidation {
  const required: readonly [boolean, Square, string][] = [
    [state.whiteKing, 'h1', 'White kingside castling needs a white rook on h1.'],
    [state.whiteQueen, 'a1', 'White queenside castling needs a white rook on a1.'],
    [state.blackKing, 'h8', 'Black kingside castling needs a black rook on h8.'],
    [state.blackQueen, 'a8', 'Black queenside castling needs a black rook on a8.'],
  ];
  if ((state.whiteKing || state.whiteQueen) && !isPiece(state, 'e1', 'w', 'k')) {
    return { ok: false, message: 'White castling rights need the white king on e1.' };
  }
  if ((state.blackKing || state.blackQueen) && !isPiece(state, 'e8', 'b', 'k')) {
    return { ok: false, message: 'Black castling rights need the black king on e8.' };
  }
  for (const [enabled, square, message] of required) {
    if (enabled) {
      const color = square[1] === '1' ? 'w' : 'b';
      if (!isPiece(state, square, color, 'r')) return { ok: false, message };
    }
  }

  const result = Position.fromFen(setupFen(state));
  return result.ok
    ? { ok: true, fen: result.value.fen }
    : { ok: false, message: result.error.message };
}

const isPiece = (
  state: PositionSetupState,
  square: Square,
  color: Piece['color'],
  type: Piece['type'],
): boolean => {
  const piece = state.board[squareIndex(square)];
  return piece?.color === color && piece.type === type;
};
