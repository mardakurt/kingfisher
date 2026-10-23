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

/** Figurine algebraic, as books and some programs print it: `♘f3` is `Nf3`. */
const FIGURINES: Readonly<Record<string, string>> = {
  '♔': 'K',
  '♕': 'Q',
  '♖': 'R',
  '♗': 'B',
  '♘': 'N',
  '♚': 'K',
  '♛': 'Q',
  '♜': 'R',
  '♝': 'B',
  '♞': 'N',
  '♙': '',
  '♟': '',
};

/**
 * Decorations that carry no information about which move: check, mate,
 * glyphs, separators, the capture mark. Every spelling is compared without
 * them, so `Nxe5`, `Ne5` and `N:e5` are one input.
 */
function clean(text: string): string {
  return text
    .trim()
    .replace(/[♔♕♖♗♘♚♛♜♝♞♙♟]/g, (figure) => FIGURINES[figure] ?? '')
    .replace(/[!?]+$/, '')
    .replace(/[+#‡]+$/, '')
    .replace(/([1-8])\s*(?:e\.p\.?|ep)$/i, '$1')
    .replace(/[\s:=()xX×\-\u2013\u2014]/g, '')
    .replace(/0/g, 'O');
}

/**
 * The spellings that name `move`, after `clean`: SAN, UCI and long algebraic
 * (`Ng1f3`), a piece move without its disambiguation, and for pawn captures
 * the file-to-file shorthand (`ed5`).
 */
function spellings(move: ChessMove): string[] {
  const promotion = move.promotion?.toUpperCase() ?? '';
  const forms = new Set<string>([clean(move.san), move.uci]);
  if (move.piece === 'p' && move.captured !== undefined) {
    // `exd5` → `ed5`; with a promotion, `exd8=Q` → `ed8Q`.
    forms.add(`${move.from[0]}${move.to}${promotion}`);
  }
  if (move.piece !== 'p') {
    forms.add(`${move.piece.toUpperCase()}${move.from}${move.to}`);
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

export interface LineInputMatch {
  /** The moves read, in order, up to the first that no single legal move answers. */
  readonly moves: readonly ChessMove[];
  /** The token that stopped the line, when one did. */
  readonly stoppedAt: string | null;
  /** Why it stopped: no legal move, or more than one. */
  readonly stoppedBecause: 'illegal' | 'ambiguous' | null;
}

/**
 * Several moves at once — `e4 c5 Nf3`, `1.e4 c5 2.Nf3`, `1. e4 c5 2. Nf3 d6`
 * — read one after another from `start`, each against the position the
 * previous one reached. Move numbers, ellipses and result marks are skipped.
 * Reading stops at the first token that is not exactly one legal move, and
 * says which, so a person sees how far their line went.
 */
export function matchLineInput(
  start: { legalMoves(): readonly ChessMove[]; after(move: ChessMove): typeof start },
  text: string,
): LineInputMatch {
  const tokens = text
    .replace(/\d+\s*(?:\.(?:\s*\.\.)?|…)/g, ' ')
    .replace(/…/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token !== '' && !/^(?:1-0|0-1|1\/2-1\/2|½-½|\*)$/.test(token));
  const moves: ChessMove[] = [];
  let position = start;
  for (const token of tokens) {
    const match = matchMoveInput(position.legalMoves(), token);
    if (!match.move) {
      return { moves, stoppedAt: token, stoppedBecause: match.ambiguous ? 'ambiguous' : 'illegal' };
    }
    moves.push(match.move);
    position = position.after(match.move);
  }
  return { moves, stoppedAt: null, stoppedBecause: null };
}
