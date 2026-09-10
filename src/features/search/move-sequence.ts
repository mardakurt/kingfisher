/**
 * Move-sequence parser for the universal search box.
 *
 * A player types `1.e4 c5 2.Nf3 d6 3.d4` into `Cmd+K` because that is what
 * they saw in a stream and what they remember. The brief is explicit: parse
 * safely, do not execute malformed chess text, and return the FEN plus the
 * named opening if one matches.
 *
 * The parser is bounded and total: anything we do not understand, we
 * throw away and return as many plies as we could resolve. We never make
 * SAN guesses, never fall back to "probably the most popular move", and
 * never accept a move that does not legally follow the previous one.
 */

import { Position } from '@/chess/position';
import { START_FEN, positionKey } from '@/chess/fen';
import { normalizeSan } from '@/chess/moves';
import type { Fen } from '@/chess/types';

export interface MoveSequenceParse {
  readonly ok: boolean;
  /** The final FEN after the moves, or the start FEN when no moves were consumed. */
  readonly fen: Fen;
  /** The SAN tokens that were played, with comments and annotations stripped. */
  readonly moves: readonly string[];
  /** The first illegal move, when one was found. */
  readonly failedAt?: string;
  /** A reason the input was not a move sequence at all (e.g. it was a FEN). */
  readonly reason?: 'looks-like-fen' | 'too-long' | 'no-moves';
}

/** Hard cap on the number of plies accepted from a single search. */
export const MOVE_SEQUENCE_MAX_PLIES = 60;

export function parseMoveSequence(input: string): MoveSequenceParse {
  const text = input.trim();
  if (text.length === 0) {
    return { ok: false, fen: START_FEN, moves: [], reason: 'no-moves' };
  }
  if (looksLikeFen(text)) {
    return { ok: false, fen: START_FEN, moves: [], reason: 'looks-like-fen' };
  }
  const tokens = tokenizeMoveSequence(text);
  if (tokens.length === 0) {
    return { ok: false, fen: START_FEN, moves: [], reason: 'no-moves' };
  }
  if (tokens.length > MOVE_SEQUENCE_MAX_PLIES * 2) {
    return { ok: false, fen: START_FEN, moves: [], reason: 'too-long' };
  }

  const played: string[] = [];
  let position: Position;
  try {
    position = Position.fromTrustedFen(START_FEN);
  } catch {
    return { ok: false, fen: START_FEN, moves: [], reason: 'no-moves' };
  }

  for (const token of tokens) {
    if (played.length >= MOVE_SEQUENCE_MAX_PLIES) break;
    const advanced = position.advanceSan(token);
    if (!advanced.ok) {
      return {
        ok: false,
        fen: position.fen,
        moves: played,
        failedAt: token,
      };
    }
    position = advanced.value.next;
    played.push(token);
  }

  if (played.length === 0) {
    return { ok: false, fen: START_FEN, moves: [], reason: 'no-moves' };
  }
  return { ok: true, fen: position.fen, moves: played };
}

/**
 * Decide whether a string is plausibly a FEN, so we can hand it to the
 * FEN-aware path rather than a move parser.
 *
 * A FEN has six space-separated fields, the first of which contains at
 * least one '/'. Anything that does not match that is not a FEN, by
 * definition, regardless of what it claims to be.
 */
function looksLikeFen(input: string): boolean {
  const fields = input.split(/\s+/);
  if (fields.length < 4) return false;
  const board = fields[0] ?? '';
  if (!board.includes('/')) return false;
  return true;
}

/**
 * Split "1.e4 c5 2.Nf3 d6 3.d4 cxd5 4.Nxd5" into a flat SAN list.
 *
 * Move numbers and dots are stripped; comments `{ ... }` and `; ...` are
 * removed; NAGs like `?` `!` `?!` are dropped by `normalizeSan`. Anything
 * that does not survive a normalization pass is silently dropped — the
 * player did not intend a stray annotation as a move.
 */
function tokenizeMoveSequence(input: string): string[] {
  const cleaned = input
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/;[^\n]*/g, ' ')
    .replace(/\d+\.(\.\.)?/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
  if (cleaned === '') return [];
  return cleaned
    .split(' ')
    .map(normalizeSan)
    .filter((token) => token.length > 0 && /[a-zA-Z]/.test(token));
}

/** Position key of the final position, for a quick equal-check with a FEN. */
export function lastPositionKey(parse: MoveSequenceParse): string {
  return positionKey(parse.fen);
}
