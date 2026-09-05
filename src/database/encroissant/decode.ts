/**
 * Reading En Croissant's binary movetext.
 *
 * A game's moves are a byte string. Bytes 0–251 are move indices into the
 * position's legal-move list (see `shakmaty-order.ts`); the top four are
 * markers:
 *
 *   255  a variation opens, from the position *before* the last mainline move
 *   254  the variation closes
 *   253  a comment: two little-endian length bytes, then that many UTF-8 bytes
 *   252  a NAG, encoded the same way
 *
 * Transcribed from `src-tauri/src/db/encoding.rs` in En Croissant 0.15
 * (database format version 1.0.0) and checked against a database that program
 * actually wrote — see `decode.test.ts`.
 *
 * Nothing here decides whether a move is legal. Every move comes from
 * `Position.legalMoves()`, so a byte that indexes past the end of the list is
 * reported as a failure rather than guessed at: a wrong move imported quietly
 * would be a fabricated game, which is the one outcome an importer may never
 * produce.
 */

import { Position } from '@/chess/position';
import type { Fen, San } from '@/chess/types';

import { shakmatyOrder } from './shakmaty-order';

export const VARIATION_START = 255;
export const VARIATION_END = 254;
export const COMMENT = 253;
export const NAG = 252;
/** Byte values at or above this are markers, not move indices. */
export const FIRST_MARKER = 252;

export interface DecodedMove {
  readonly san: San;
  readonly uci: string;
  /** Position the move was played in. */
  readonly before: Fen;
  readonly after: Fen;
  /** Comments attached after this move, in the order they appeared. */
  readonly comments: readonly string[];
  /** NAGs attached after this move. */
  readonly nags: readonly string[];
  /** Variations branching from the position *before* this move. */
  readonly variations: readonly (readonly DecodedMove[])[];
}

export interface DecodeFailure {
  readonly ok: false;
  readonly reason: string;
  /** How many mainline moves were decoded before the failure. */
  readonly decoded: number;
}

export interface DecodeSuccess {
  readonly ok: true;
  readonly moves: readonly DecodedMove[];
}

export type DecodeResult = DecodeSuccess | DecodeFailure;

const textDecoder = new TextDecoder();

/**
 * Decode one game's move blob, starting from `startFen`.
 *
 * Variations are returned nested rather than flattened, because a variation is
 * an alternative to the move it precedes and flattening would lose which move
 * it was an alternative *to*.
 */
export function decodeMoves(bytes: Uint8Array, startFen?: Fen): DecodeResult {
  let position: Position;
  try {
    position = startFen ? Position.fromTrustedFen(startFen) : Position.initial();
  } catch {
    return { ok: false, reason: 'The starting position could not be read.', decoded: 0 };
  }

  let cursor = 0;
  let decoded = 0;

  /**
   * Decode moves until the variation depth closes or the bytes run out.
   *
   * `at` is the position this line starts from. A line owns its own cursor
   * movement, so a nested variation simply recurses and returns with the
   * cursor sitting after its closing marker.
   */
  const line = (at: Position): DecodedMove[] | DecodeFailure => {
    const moves: DecodedMove[] = [];
    let here = at;
    /** The position the most recent move was played from, for variations. */
    let previous: Position | null = null;

    while (cursor < bytes.length) {
      const byte = bytes[cursor] as number;

      if (byte === VARIATION_END) {
        cursor += 1;
        return moves;
      }

      if (byte === VARIATION_START) {
        cursor += 1;
        if (previous === null) {
          // A variation with no move to branch from. Read and discard it
          // rather than abandoning the game.
          const orphan = line(here);
          if (!Array.isArray(orphan)) return orphan;
          continue;
        }
        const branch = line(previous);
        if (!Array.isArray(branch)) return branch;
        const last = moves[moves.length - 1] as DecodedMove;
        moves[moves.length - 1] = {
          ...last,
          variations: [...last.variations, branch],
        };
        continue;
      }

      if (byte === COMMENT || byte === NAG) {
        cursor += 1;
        if (cursor + 2 > bytes.length) {
          return { ok: false, reason: 'A comment ran past the end of the game.', decoded };
        }
        const length = (bytes[cursor] as number) | ((bytes[cursor + 1] as number) << 8);
        cursor += 2;
        const end = Math.min(cursor + length, bytes.length);
        const text = textDecoder.decode(bytes.subarray(cursor, end));
        cursor = end;
        const last = moves[moves.length - 1];
        if (last) {
          moves[moves.length - 1] =
            byte === COMMENT
              ? { ...last, comments: [...last.comments, text] }
              : { ...last, nags: [...last.nags, text] };
        }
        continue;
      }

      // An ordinary move index.
      cursor += 1;
      const legal = shakmatyOrder(here.legalMoves(), here.isCheck());
      const move = legal[byte];
      if (!move) {
        return {
          ok: false,
          reason: `Move index ${byte} is past the ${legal.length} legal moves in this position.`,
          decoded,
        };
      }
      previous = here;
      const next = Position.fromTrustedFen(move.after);
      moves.push({
        san: move.san,
        uci: move.uci,
        before: move.before,
        after: move.after,
        comments: [],
        nags: [],
        variations: [],
      });
      decoded += 1;
      here = next;
    }
    return moves;
  };

  const result = line(position);
  if (!Array.isArray(result)) return result;
  return { ok: true, moves: result };
}

/** The mainline as SAN, which is what most callers actually want. */
export function decodeMainlineSan(bytes: Uint8Array, startFen?: Fen): readonly San[] | null {
  const decoded = decodeMoves(bytes, startFen);
  return decoded.ok ? decoded.moves.map((move) => move.san) : null;
}
