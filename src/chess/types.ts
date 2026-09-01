/**
 * Core chess vocabulary.
 *
 * Notation formats are *not* interchangeable. FEN, SAN and UCI are all
 * `string` at runtime, so they are branded here to make accidental mixing a
 * compile error. Values cross the brand boundary only through the explicit
 * constructors in this file (unchecked, for trusted internal data) or through
 * the validating parsers in `fen.ts` / `moves.ts`.
 */

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

/** Forsyth–Edwards Notation describing a complete position. */
export type Fen = Brand<string, 'Fen'>;
/** Standard Algebraic Notation for a single move, e.g. `Nf3`, `exd5`, `O-O`. */
export type San = Brand<string, 'San'>;
/** Long algebraic / UCI move notation, e.g. `g1f3`, `e7e8q`. */
export type Uci = Brand<string, 'Uci'>;

/** Trust boundary: assert that a string is already a valid FEN. */
export const asFen = (value: string): Fen => value as Fen;
/** Trust boundary: assert that a string is already valid SAN. */
export const asSan = (value: string): San => value as San;
/** Trust boundary: assert that a string is already valid UCI. */
export const asUci = (value: string): Uci => value as Uci;

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
export const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const;

export type FileLetter = (typeof FILES)[number];
export type RankNumber = (typeof RANKS)[number];
export type Square = `${FileLetter}${RankNumber}`;

export type Color = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type PromotionPiece = 'q' | 'r' | 'b' | 'n';

export interface Piece {
  readonly color: Color;
  readonly type: PieceType;
}

export const WHITE = 'w' satisfies Color;
export const BLACK = 'b' satisfies Color;

export const opposite = (color: Color): Color => (color === 'w' ? 'b' : 'w');

/** Castling availability, decomposed rather than kept as a raw FEN fragment. */
export interface CastlingRights {
  readonly whiteKing: boolean;
  readonly whiteQueen: boolean;
  readonly blackKing: boolean;
  readonly blackQueen: boolean;
}

export const NO_CASTLING: CastlingRights = {
  whiteKing: false,
  whiteQueen: false,
  blackKing: false,
  blackQueen: false,
};

/**
 * Semantic description of what a move did. Derived once, at the boundary where
 * a move is created, so downstream code never re-parses SAN to ask questions
 * like "was this a capture?".
 */
export interface MoveFlags {
  readonly capture: boolean;
  readonly enPassant: boolean;
  readonly promotion: boolean;
  readonly kingsideCastle: boolean;
  readonly queensideCastle: boolean;
  readonly doublePawnPush: boolean;
}

export const NO_FLAGS: MoveFlags = {
  capture: false,
  enPassant: false,
  promotion: false,
  kingsideCastle: false,
  queensideCastle: false,
  doublePawnPush: false,
};

/**
 * A fully resolved, legal move. Every representation the application needs is
 * computed here exactly once, against a known position.
 */
export interface ChessMove {
  readonly from: Square;
  readonly to: Square;
  readonly promotion?: PromotionPiece;
  readonly piece: PieceType;
  readonly color: Color;
  readonly captured?: PieceType;
  readonly san: San;
  readonly uci: Uci;
  readonly flags: MoveFlags;
  /** Position before the move was played. */
  readonly before: Fen;
  /** Position after the move was played. */
  readonly after: Fen;
}

/** How a move is addressed before it has been validated against a position. */
export interface MoveIntent {
  readonly from: Square;
  readonly to: Square;
  readonly promotion?: PromotionPiece;
}

export type GameTermination = '1-0' | '0-1' | '1/2-1/2' | '*';

/** Why a game is over, when it is. */
export type GameOutcome =
  | { readonly kind: 'checkmate'; readonly winner: Color }
  | { readonly kind: 'stalemate' }
  | { readonly kind: 'insufficient-material' }
  | { readonly kind: 'fifty-move' }
  | { readonly kind: 'threefold-repetition' };
