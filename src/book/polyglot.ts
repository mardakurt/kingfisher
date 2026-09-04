/**
 * Reading a Polyglot `.bin` opening book.
 *
 * Polyglot is the interchange format for opening books: every engine and GUI
 * that supports books at all supports this one, and books that took people
 * years to build are distributed in it. Supporting it is the difference
 * between "Kingfisher has a book" and "Kingfisher can use your book".
 *
 * The format is small and completely specified. A file is a sorted array of
 * 16-byte entries — an 8-byte Zobrist key, a 2-byte packed move, a 2-byte
 * weight, and 4 bytes of "learn" data nobody writes — so a lookup is a binary
 * search, and a 100 MB book costs two or three reads rather than a parse.
 *
 * Two parts of it are easy to get subtly wrong, and both are handled here
 * rather than left to the caller:
 *
 *   - **The en-passant square is hashed only when a capture is actually
 *     available.** A FEN records the square after any double pawn push;
 *     Polyglot hashes it only if an enemy pawn is standing next to the pushed
 *     one. Getting this wrong makes about one position in forty miss.
 *   - **Castling is encoded as king-takes-own-rook.** White's O-O is stored as
 *     `e1h1`, which is not a legal move to play. It is translated back here.
 */

import { parseFen } from '@/chess/fen';
import type { Fen, Piece, Uci } from '@/chess/types';

import { POLYGLOT_RANDOM } from './polyglot-constants.generated';

const MASK = (1n << 64n) - 1n;

/** Polyglot's piece order: black pawn 0, white pawn 1, black knight 2, … */
const KIND: Record<Piece['type'], number> = { p: 0, n: 1, b: 2, r: 3, q: 4, k: 5 };

const at = (index: number): bigint => POLYGLOT_RANDOM[index] ?? 0n;

/**
 * The Polyglot Zobrist key of a position.
 *
 * Takes a FEN rather than a board object so that any caller with a position
 * can ask, and so the awkward en-passant rule lives in one place.
 */
export function polyglotKey(fen: Fen | string): bigint {
  const parsed = parseFen(fen);
  if (!parsed.ok) return 0n;
  const { board, turn, castling, epSquare } = parsed.value;

  let key = 0n;
  for (let index = 0; index < 64; index += 1) {
    const piece = board[index];
    if (!piece) continue;
    // `index` is a1 = 0 … h8 = 63, which is Polyglot's own 8 * rank + file.
    const kind = 2 * KIND[piece.type] + (piece.color === 'w' ? 1 : 0);
    key ^= at(64 * kind + index);
  }

  if (castling.whiteKing) key ^= at(768);
  if (castling.whiteQueen) key ^= at(769);
  if (castling.blackKing) key ^= at(770);
  if (castling.blackQueen) key ^= at(771);

  /*
    The rule that catches everyone. A FEN names the en-passant square after
    *any* double push; Polyglot hashes it only when a pawn of the side to move
    is actually standing beside the pawn that pushed, and could therefore make
    the capture. Hashing it unconditionally silently loses every book entry for
    a position reached by a double push that nobody could answer.
  */
  if (epSquare) {
    const file = epSquare.charCodeAt(0) - 97;
    const rank = Number(epSquare[1]) - 1;
    const capturingRank = turn === 'w' ? rank - 1 : rank + 1;
    const capturer: Piece = { color: turn, type: 'p' };
    const beside = [file - 1, file + 1].some((neighbour) => {
      if (neighbour < 0 || neighbour > 7) return false;
      const piece = board[capturingRank * 8 + neighbour];
      return piece?.color === capturer.color && piece.type === 'p';
    });
    if (beside) key ^= at(772 + file);
  }

  if (turn === 'w') key ^= at(780);
  return key & MASK;
}

export interface BookEntry {
  readonly key: bigint;
  readonly uci: Uci;
  readonly weight: number;
  readonly learn: number;
}

const FILES = 'abcdefgh';
const PROMOTIONS = ['', 'n', 'b', 'r', 'q'] as const;

/**
 * Unpack Polyglot's 16-bit move.
 *
 * Bits 0–2 are the destination file, 3–5 the destination rank, 6–8 the origin
 * file, 9–11 the origin rank, 12–14 the promotion piece.
 */
export function decodeMove(move: number, key: bigint): Uci {
  const toFile = move & 0b111;
  const toRank = (move >> 3) & 0b111;
  const fromFile = (move >> 6) & 0b111;
  const fromRank = (move >> 9) & 0b111;
  const promotion = PROMOTIONS[(move >> 12) & 0b111] ?? '';

  const from = `${FILES[fromFile]}${fromRank + 1}`;
  let to = `${FILES[toFile]}${toRank + 1}`;

  /*
    Castling is stored as the king capturing its own rook, which is not a move
    anybody can play. There is no ambiguity to resolve — a king on e1 never
    "moves to" h1 for any other reason — so the four cases are translated
    directly.
  */
  if (from === 'e1' && to === 'h1') to = 'g1';
  else if (from === 'e1' && to === 'a1') to = 'c1';
  else if (from === 'e8' && to === 'h8') to = 'g8';
  else if (from === 'e8' && to === 'a8') to = 'c8';
  void key;

  return `${from}${to}${promotion}` as Uci;
}

const ENTRY_BYTES = 16;

/**
 * Every entry for one position.
 *
 * A binary search rather than a scan, because a book is sorted by key and can
 * be a hundred megabytes: a linear pass would make each move of an analysis
 * session read the whole file.
 */
export function lookupPolyglot(data: DataView, key: bigint): readonly BookEntry[] {
  const count = Math.floor(data.byteLength / ENTRY_BYTES);
  if (count === 0) return [];

  let low = 0;
  let high = count - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const candidate = data.getBigUint64(middle * ENTRY_BYTES, false);
    if (candidate === key) {
      found = middle;
      high = middle - 1; // Keep going: entries for one key are contiguous.
    } else if (candidate < key) {
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  if (found < 0) return [];

  const entries: BookEntry[] = [];
  for (let index = found; index < count; index += 1) {
    const offset = index * ENTRY_BYTES;
    if (data.getBigUint64(offset, false) !== key) break;
    entries.push({
      key,
      uci: decodeMove(data.getUint16(offset + 8, false), key),
      weight: data.getUint16(offset + 10, false),
      learn: data.getUint32(offset + 12, false),
    });
  }
  return entries.sort((a, b) => b.weight - a.weight);
}

/** A `.bin` is a whole number of 16-byte entries, sorted by key. Nothing else is. */
export function looksLikePolyglot(data: DataView): boolean {
  if (data.byteLength === 0 || data.byteLength % ENTRY_BYTES !== 0) return false;
  const count = data.byteLength / ENTRY_BYTES;
  const sample = Math.min(count, 64);
  let previous = 0n;
  for (let index = 0; index < sample; index += 1) {
    const key = data.getBigUint64(index * ENTRY_BYTES, false);
    if (key < previous) return false;
    previous = key;
  }
  return true;
}
