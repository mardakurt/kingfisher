/**
 * FEN parsing, validation and formatting.
 *
 * The parser is deliberately strict and returns a decomposed structure rather
 * than a string, so the rest of the application never slices FEN fields by
 * index. Invalid input produces a `ChessError` with a human-readable reason.
 */

import { makeSquare, squareIndex, isSquare } from './board';
import { fail, ok, type Result } from './result';
import {
  asFen,
  NO_CASTLING,
  type CastlingRights,
  type Color,
  type Fen,
  type Piece,
  type PieceType,
  type Square,
} from './types';

export const START_FEN = asFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
export const EMPTY_FEN = asFen('8/8/8/8/8/8/8/8 w - - 0 1');

/** A FEN taken apart into the things a chess program actually reasons about. */
export interface FenParts {
  /** Indexed by `squareIndex`: a1 = 0 … h8 = 63. */
  readonly board: readonly (Piece | null)[];
  readonly turn: Color;
  readonly castling: CastlingRights;
  readonly epSquare: Square | null;
  readonly halfmoveClock: number;
  readonly fullmoveNumber: number;
}

const PIECE_LETTERS: Record<string, Piece> = {
  P: { color: 'w', type: 'p' },
  N: { color: 'w', type: 'n' },
  B: { color: 'w', type: 'b' },
  R: { color: 'w', type: 'r' },
  Q: { color: 'w', type: 'q' },
  K: { color: 'w', type: 'k' },
  p: { color: 'b', type: 'p' },
  n: { color: 'b', type: 'n' },
  b: { color: 'b', type: 'b' },
  r: { color: 'b', type: 'r' },
  q: { color: 'b', type: 'q' },
  k: { color: 'b', type: 'k' },
};

const LETTER_FOR_PIECE: Record<Color, Record<PieceType, string>> = {
  w: { p: 'P', n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K' },
  b: { p: 'p', n: 'n', b: 'b', r: 'r', q: 'q', k: 'k' },
};

export function parseFen(input: string): Result<FenParts> {
  const raw = input.trim();
  if (raw.length === 0) return fail('invalid-fen', 'FEN is empty.');

  const fields = raw.split(/\s+/);
  if (fields.length < 4) {
    return fail('invalid-fen', `FEN needs at least 4 fields, found ${fields.length}.`, {
      input: raw,
    });
  }
  if (fields.length > 6) {
    return fail('invalid-fen', `FEN has ${fields.length} fields, expected at most 6.`, {
      input: raw,
    });
  }

  const [placement, turnField, castlingField, epField, halfmoveField = '0', fullmoveField = '1'] =
    fields as [string, string, string, string, string?, string?];

  const board = parsePlacement(placement);
  if (!board.ok) return board;

  if (turnField !== 'w' && turnField !== 'b') {
    return fail('invalid-fen', `Side to move must be "w" or "b", found "${turnField}".`, {
      input: raw,
    });
  }
  const turn: Color = turnField;

  const castling = parseCastling(castlingField);
  if (!castling.ok) return castling;

  const ep = parseEnPassant(epField, turn);
  if (!ep.ok) return ep;

  const halfmoveClock = parseCounter(halfmoveField, 'halfmove clock', 0);
  if (!halfmoveClock.ok) return halfmoveClock;

  const fullmoveNumber = parseCounter(fullmoveField, 'fullmove number', 1);
  if (!fullmoveNumber.ok) return fullmoveNumber;

  const structural = validateStructure(board.value);
  if (!structural.ok) return structural;

  const rights = validateCastling(board.value, castling.value);
  if (!rights.ok) return rights;

  return ok({
    board: board.value,
    turn,
    castling: castling.value,
    epSquare: ep.value,
    halfmoveClock: halfmoveClock.value,
    fullmoveNumber: fullmoveNumber.value,
  });
}

function parsePlacement(placement: string): Result<(Piece | null)[]> {
  const ranks = placement.split('/');
  if (ranks.length !== 8) {
    return fail('invalid-fen', `Board must have 8 ranks, found ${ranks.length}.`, {
      input: placement,
    });
  }

  const board: (Piece | null)[] = new Array<Piece | null>(64).fill(null);

  for (let i = 0; i < 8; i += 1) {
    // FEN lists rank 8 first; our indices count rank 1 first.
    const rankIndex = 7 - i;
    const row = ranks[i] as string;
    let file = 0;

    for (const char of row) {
      if (char >= '1' && char <= '8') {
        file += Number(char);
        continue;
      }
      const piece = PIECE_LETTERS[char];
      if (!piece) {
        return fail('invalid-fen', `Unknown piece character "${char}" in rank ${rankIndex + 1}.`, {
          input: placement,
        });
      }
      if (file > 7) break;
      board[rankIndex * 8 + file] = piece;
      file += 1;
    }

    if (file !== 8) {
      return fail('invalid-fen', `Rank ${rankIndex + 1} describes ${file} squares, expected 8.`, {
        input: placement,
      });
    }
  }

  return ok(board);
}

function parseCastling(field: string): Result<CastlingRights> {
  if (field === '-') return ok(NO_CASTLING);
  if (!/^[KQkq]{1,4}$/.test(field) || new Set(field).size !== field.length) {
    return fail('invalid-fen', `Castling field must be "-" or a subset of "KQkq", got "${field}".`);
  }
  return ok({
    whiteKing: field.includes('K'),
    whiteQueen: field.includes('Q'),
    blackKing: field.includes('k'),
    blackQueen: field.includes('q'),
  });
}

function parseEnPassant(field: string, turn: Color): Result<Square | null> {
  if (field === '-') return ok(null);
  if (!isSquare(field)) {
    return fail('invalid-fen', `En passant field must be "-" or a square, got "${field}".`);
  }
  // The target square sits behind the pawn that just moved two squares.
  const expectedRank = turn === 'w' ? '6' : '3';
  if (field[1] !== expectedRank) {
    return fail(
      'invalid-fen',
      `En passant square "${field}" is impossible with ${turn === 'w' ? 'White' : 'Black'} to move.`,
    );
  }
  return ok(field);
}

function parseCounter(field: string, label: string, minimum: number): Result<number> {
  if (!/^\d+$/.test(field)) {
    return fail('invalid-fen', `The ${label} must be a non-negative integer, got "${field}".`);
  }
  const value = Number(field);
  if (value < minimum) {
    return fail('invalid-fen', `The ${label} must be at least ${minimum}, got ${value}.`);
  }
  return ok(value);
}

function validateStructure(board: readonly (Piece | null)[]): Result<true> {
  let whiteKings = 0;
  let blackKings = 0;

  for (let index = 0; index < 64; index += 1) {
    const piece = board[index];
    if (!piece) continue;
    if (piece.type === 'k') {
      if (piece.color === 'w') whiteKings += 1;
      else blackKings += 1;
    }
    if (piece.type === 'p') {
      const rank = index >> 3;
      if (rank === 0 || rank === 7) {
        return fail('invalid-fen', 'A pawn cannot stand on the first or the eighth rank.');
      }
    }
  }

  if (whiteKings !== 1) {
    return fail('invalid-fen', `Position has ${whiteKings} white kings, expected exactly 1.`);
  }
  if (blackKings !== 1) {
    return fail('invalid-fen', `Position has ${blackKings} black kings, expected exactly 1.`);
  }
  return ok(true);
}

/**
 * A castling right is a claim about where two pieces are standing.
 *
 * Kingfisher plays standard chess, so "K" means precisely: the white king has
 * never moved and is on e1, and the h1 rook has never moved and is on h1. A
 * FEN asserting the right without the pieces is describing a position that
 * cannot occur, and it is not a harmless inconsistency — chess.js answers such
 * a position by generating a "castling" move that slides the king two squares
 * and leaves both rooks where they are. That is an illegal move offered as a
 * legal one, which is the worst thing this application can do.
 *
 * The position setup dialog and any imported FEN can both produce one, so the
 * check belongs here, in Kingfisher's own parser, rather than in whatever the
 * rules engine happens to tolerate this year.
 */
function validateCastling(
  board: readonly (Piece | null)[],
  castling: CastlingRights,
): Result<true> {
  const at = (index: number, color: Color, type: PieceType) => {
    const piece = board[index];
    return piece?.color === color && piece.type === type;
  };
  // a1 = 0 … h1 = 7, a8 = 56 … h8 = 63.
  const checks: readonly [boolean, boolean, string][] = [
    [
      castling.whiteKing,
      at(4, 'w', 'k') && at(7, 'w', 'r'),
      'K (white kingside) needs a white king on e1 and a white rook on h1',
    ],
    [
      castling.whiteQueen,
      at(4, 'w', 'k') && at(0, 'w', 'r'),
      'Q (white queenside) needs a white king on e1 and a white rook on a1',
    ],
    [
      castling.blackKing,
      at(60, 'b', 'k') && at(63, 'b', 'r'),
      'k (black kingside) needs a black king on e8 and a black rook on h8',
    ],
    [
      castling.blackQueen,
      at(60, 'b', 'k') && at(56, 'b', 'r'),
      'q (black queenside) needs a black king on e8 and a black rook on a8',
    ],
  ];
  for (const [claimed, satisfied, message] of checks) {
    if (claimed && !satisfied) return fail('invalid-fen', `Castling right ${message}.`);
  }
  return ok(true);
}

export function formatFen(parts: FenParts): Fen {
  const rows: string[] = [];

  for (let rank = 7; rank >= 0; rank -= 1) {
    let row = '';
    let empty = 0;
    for (let file = 0; file < 8; file += 1) {
      const piece = parts.board[rank * 8 + file] ?? null;
      if (!piece) {
        empty += 1;
        continue;
      }
      if (empty > 0) {
        row += String(empty);
        empty = 0;
      }
      row += LETTER_FOR_PIECE[piece.color][piece.type];
    }
    if (empty > 0) row += String(empty);
    rows.push(row);
  }

  const castling = formatCastling(parts.castling);
  return asFen(
    `${rows.join('/')} ${parts.turn} ${castling} ${parts.epSquare ?? '-'} ${parts.halfmoveClock} ${parts.fullmoveNumber}`,
  );
}

export function formatCastling(rights: CastlingRights): string {
  const text =
    (rights.whiteKing ? 'K' : '') +
    (rights.whiteQueen ? 'Q' : '') +
    (rights.blackKing ? 'k' : '') +
    (rights.blackQueen ? 'q' : '');
  return text === '' ? '-' : text;
}

/**
 * Identity of a position for lookup purposes: placement, side to move,
 * castling rights and en passant square, without the move counters.
 * Two positions with the same key are the same position for a database,
 * an opening book or a transposition table.
 */
export function positionKey(fen: Fen | string): string {
  const fields = String(fen).trim().split(/\s+/);
  return fields.slice(0, 4).join(' ');
}

export function pieceAt(parts: FenParts, square: Square): Piece | null {
  return parts.board[squareIndex(square)] ?? null;
}

/** Locate a king; returns null for positions that are missing one. */
export function kingSquare(parts: FenParts, color: Color): Square | null {
  for (let index = 0; index < 64; index += 1) {
    const piece = parts.board[index];
    if (piece && piece.type === 'k' && piece.color === color) {
      return makeSquare(index % 8, index >> 3);
    }
  }
  return null;
}
