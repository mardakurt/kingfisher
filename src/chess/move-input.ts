/**
 * A move typed by a person, matched against the legal moves of a position.
 *
 * People type moves the way they write them, not the way a parser wants
 * them: `nf3`, `Nf3+`, `exd5`, `ed5`, `e8=Q`, `e8q`, `0-0`, `oo`, `e2e4`,
 * `e2-e4`. Every one of those names exactly one legal move in the right
 * position, and the reader should accept it. What it must never do is guess:
 * an input that two legal moves answer is ambiguous and is reported as such,
 * with both, rather than played.
 *
 * The one real collision in English notation is `b`: `bc4` is a bishop to c4
 * or a b-pawn capturing on c4. Case decides when the person used it (`Bc4` is
 * the bishop, `bc4` the pawn, as SAN writes them); only when case does not
 * decide is the input ambiguous.
 *
 * Matching is against the legal moves the rules produce, so nothing here can
 * offer an illegal move. No `chess.js`: the position supplies the moves.
 */

import type { ChessMove } from './types';

export interface MoveInputMatch {
  /** The one legal move the input names, or null when none or several do. */
  readonly move: ChessMove | null;
  /**
   * Legal moves the input could still become, in the position's own move
   * order, for a list under the field. Includes `move` when there is one.
   */
  readonly candidates: readonly ChessMove[];
  /** True when the input is complete for more than one legal move. */
  readonly ambiguous: boolean;
}

const NONE: MoveInputMatch = { move: null, candidates: [], ambiguous: false };

/** Decorations that carry no information about which move: check, mate, glyphs, separators. */
function clean(text: string): string {
  return text
    .trim()
    .replace(/[!?]+$/, '')
    .replace(/[+#‡]+$/, '')
    .replace(/[\s:=()-]/g, '')
    .replace(/0/g, 'O');
}

/**
 * The spellings that name `move`, after `clean`. SAN without its capture
 * mark, UCI, a piece move without its disambiguation, and for pawn captures
 * the file-to-file shorthand (`ed5`).
 */
function spellings(move: ChessMove): string[] {
  const san = clean(move.san);
  const forms = new Set<string>([san, san.replace('x', ''), move.uci]);
  if (move.piece === 'p' && move.captured !== undefined) {
    // `exd5` → `ed5`; with a promotion, `exd8=Q` → `ed8Q`.
    forms.add(`${move.from[0]}${move.to}${move.promotion?.toUpperCase() ?? ''}`);
  }
  if (move.piece !== 'p' && move.piece !== 'k') {
    // `Ra4` for `R1a4`: what a person types who has not noticed the other
    // rook. It matches both, so it is reported as ambiguous with both.
    forms.add(`${move.piece.toUpperCase()}${move.to}`);
  }
  if (move.flags.kingsideCastle) forms.add('OO');
  if (move.flags.queensideCastle) forms.add('OOO');
  return [...forms];
}

/**
 * Match `text` against `moves` (a position's legal moves).
 *
 * Exact first, case-sensitive: `Bc4` and `bc4` mean different things and the
 * person who typed the capital meant the bishop. Then exact ignoring case,
 * which is how most people type. A unique exact match is the move; several are
 * ambiguous. Without an exact match, the candidates are the moves one of whose
 * spellings begins with the input, ignoring case.
 */
export function matchMoveInput(moves: readonly ChessMove[], text: string): MoveInputMatch {
  const input = clean(text);
  if (input === '') return NONE;
  const lower = input.toLowerCase();

  const table = moves.map((move) => ({ move, forms: spellings(move) }));

  const exact = table.filter(({ forms }) => forms.includes(input)).map(({ move }) => move);
  if (exact.length === 1) return { move: exact[0]!, candidates: exact, ambiguous: false };

  const loose =
    exact.length > 1
      ? exact
      : table
          .filter(({ forms }) => forms.some((form) => form.toLowerCase() === lower))
          .map(({ move }) => move);
  if (loose.length === 1) return { move: loose[0]!, candidates: loose, ambiguous: false };
  if (loose.length > 1) return { move: null, candidates: loose, ambiguous: true };

  const prefixed = table
    .filter(({ forms }) => forms.some((form) => form.toLowerCase().startsWith(lower)))
    .map(({ move }) => move);
  return { move: null, candidates: prefixed, ambiguous: false };
}
