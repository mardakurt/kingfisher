/**
 * Conversions between move representations.
 *
 * UCI is a wire format: it is what engines speak, and it is position-independent
 * text. SAN is a reading format: it is only meaningful relative to a position.
 * Everything that crosses between them goes through here.
 */

import { isSquare } from './board';
import { fail, ok, type Result } from './result';
import { asUci, type ChessMove, type MoveIntent, type PromotionPiece, type Uci } from './types';

const PROMOTION_PIECES = new Set<string>(['q', 'r', 'b', 'n']);

/** Parse `e2e4`, `e7e8q`. Does not check legality — only shape. */
export function parseUci(input: string): Result<MoveIntent> {
  const text = input.trim().toLowerCase();
  if (text.length !== 4 && text.length !== 5) {
    return fail('invalid-uci', `UCI move must be 4 or 5 characters, got "${input}".`, {
      input,
    });
  }
  const from = text.slice(0, 2);
  const to = text.slice(2, 4);
  if (!isSquare(from) || !isSquare(to)) {
    return fail('invalid-uci', `UCI move "${input}" does not name two squares.`, { input });
  }
  if (text.length === 4) return ok({ from, to });

  const promotion = text[4] as string;
  if (!PROMOTION_PIECES.has(promotion)) {
    return fail('invalid-uci', `"${promotion}" is not a promotion piece.`, { input });
  }
  return ok({ from, to, promotion: promotion as PromotionPiece });
}

export function formatUci(intent: MoveIntent): Uci {
  return asUci(`${intent.from}${intent.to}${intent.promotion ?? ''}`);
}

export const moveIntent = (move: ChessMove): MoveIntent =>
  move.promotion
    ? { from: move.from, to: move.to, promotion: move.promotion }
    : { from: move.from, to: move.to };

export const sameMove = (a: MoveIntent, b: MoveIntent): boolean =>
  a.from === b.from && a.to === b.to && (a.promotion ?? null) === (b.promotion ?? null);

/**
 * Strip decorations that carry no positional information so that SAN written by
 * different tools compares equal: `Nf3!?` / `Nf3+` / `N/f3` all reduce to `Nf3`.
 */
export function normalizeSan(san: string): string {
  return san
    .trim()
    .replace(/[!?]+$/, '')
    .replace(/[+#]+$/, '')
    .replace(/0/g, 'O')
    .replace(/[/\u2013\u2014]/g, '');
}
