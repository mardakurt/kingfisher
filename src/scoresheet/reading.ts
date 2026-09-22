/**
 * A sheet's tokens, resolved into moves — and where that stopped.
 *
 * Whether the tokens were typed or came back from a model reading a photo,
 * they are handled the same way: one at a time, against the position the
 * accepted moves have reached. A token the matcher reads as exactly one move
 * is a move. One it reads as several is a move with a `check` flag and the
 * alternatives kept. One it cannot read at all ends the reading, and the
 * caller is told which token and why, so the person can look at the sheet
 * there instead of at a game that quietly went wrong.
 */

import { Position } from '@/chess/position';
import type { Fen, San, Uci } from '@/chess/types';

import { matchToken } from './match';

export type PlyStatus = 'read' | 'check' | 'reconstructed';

export interface Ply {
  readonly san: San;
  readonly uci: Uci;
  readonly before: Fen;
  readonly after: Fen;
  readonly status: PlyStatus;
  /** The token as written, when it did not name the move exactly. */
  readonly readAs?: string;
  /** Other legal readings of the same token. */
  readonly alternatives?: readonly San[];
  /** Why the flag is there, in the words the list shows. */
  readonly note?: string;
}

export interface Reading {
  readonly plies: readonly Ply[];
  /** Set when a token could not be read; nothing after it was tried. */
  readonly stopped?: { readonly index: number; readonly token: string; readonly reason: string };
}

const GAP = /^[?_\-–—]+$/;

export const isGapToken = (token: string): boolean => GAP.test(token.trim());

/**
 * Resolve `tokens` from `start`. Indexes in `uncertain` are flagged even
 * when the rules find one reading, because the writer (or the model) said
 * so, and a flag that costs one glance is cheaper than a wrong move kept.
 */
export interface ReadOptions {
  /** Indexes the writer or the reader marked as doubtful. */
  readonly uncertain?: ReadonlySet<number>;
  /**
   * Accept only tokens that name a move exactly. Reconstruction reads the
   * buffer this way: a token that fits a candidate only one character off is
   * not evidence for that candidate.
   */
  readonly exact?: boolean;
}

export function readTokens(
  start: Position,
  tokens: readonly string[],
  options: ReadOptions = {},
): Reading {
  const uncertain = options.uncertain ?? new Set<number>();
  const plies: Ply[] = [];
  let position = start;
  for (const [index, token] of tokens.entries()) {
    if (isGapToken(token)) {
      return { plies, stopped: { index, token, reason: 'the cell could not be read' } };
    }
    const match = matchToken(position, token);
    const best = match.candidates[0];
    if (!best || (options.exact && best.distance > 0)) {
      return {
        plies,
        stopped: { index, token, reason: `no legal move here reads as "${token}"` },
      };
    }
    const advanced = position.advance({
      from: best.move.from,
      to: best.move.to,
      ...(best.move.promotion ? { promotion: best.move.promotion } : {}),
    });
    if (!advanced.ok) {
      return { plies, stopped: { index, token, reason: advanced.error.message } };
    }
    const alternatives = match.candidates
      .slice(1)
      .filter((candidate) => candidate.distance === best.distance)
      .map((candidate) => candidate.move.san);
    // A `?` inside a cell is a character the writer could not read. The rules
    // may still leave one legal move, and that move is taken — but the person
    // is told, because "only one move fits" is not the same as "this is what
    // the sheet says".
    const wildcard = match.normalized.includes('?');
    const flagged = !match.certain || best.distance > 0 || wildcard || uncertain.has(index);
    const exact = best.distance === 0 && match.certain && !wildcard;
    plies.push({
      san: advanced.value.move.san,
      uci: advanced.value.move.uci,
      before: position.fen,
      after: advanced.value.next.fen,
      status: flagged ? 'check' : 'read',
      ...(exact && !uncertain.has(index) ? {} : { readAs: token }),
      ...(alternatives.length ? { alternatives } : {}),
      ...(flagged
        ? {
            note: uncertain.has(index)
              ? `marked uncertain when read, taken as ${advanced.value.move.san}`
              : wildcard && !alternatives.length
                ? `"${token}" has an unreadable character; ${advanced.value.move.san} is the only move that fits`
                : alternatives.length
                  ? `"${token}" could also be ${alternatives.join(', ')}`
                  : `"${token}" read as ${advanced.value.move.san}`,
          }
        : {}),
    });
    position = advanced.value.next;
  }
  return { plies };
}

/** The position after `plies`, or `start` when there are none. */
export function positionAfter(start: Position, plies: readonly Ply[]): Position {
  const last = plies[plies.length - 1];
  if (!last) return start;
  const built = Position.fromFen(last.after);
  return built.ok ? built.value : start;
}
