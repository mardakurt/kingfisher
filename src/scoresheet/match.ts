/**
 * What a scoresheet says, resolved against what the rules allow.
 *
 * A token is whatever was written in one cell — `Nf3`, `nf3`, `Sf3` in
 * German, `Cf3` in French or Spanish, `0-0`, `oo`, `ed`, `exd`, `e8Q`, `e8/Q`,
 * a capture without its `x`, a check without its `+`, a stray `:`. Every legal
 * move of the position is rendered in the same reduced spelling, and the
 * token is compared with those: an exact match, then a match one character
 * off. Anything further away is not a reading, it is a guess, and the caller
 * is told there was none.
 *
 * Pure: a position and a string in, ranked candidates out.
 */

import type { Position } from '@/chess/position';
import type { ChessMove } from '@/chess/types';

export interface Candidate {
  readonly move: ChessMove;
  /** 0 = written exactly (in some spelling), 1 = one character off. */
  readonly distance: number;
}

export interface MatchResult {
  readonly token: string;
  readonly normalized: string;
  readonly candidates: readonly Candidate[];
  /** True when the best reading is unambiguous: one candidate at the best distance. */
  readonly certain: boolean;
}

/** Piece letters in the notations a club player writes, mapped to English. */
const PIECE_LETTERS: Readonly<Record<string, string>> = {
  K: 'K',
  Q: 'Q',
  R: 'R',
  B: 'B',
  N: 'N',
  // German: König, Dame, Turm, Läufer, Springer.
  D: 'Q',
  T: 'R',
  L: 'B',
  S: 'N',
  // French and Spanish: Roi/Rey, Dame/Dama, Tour/Torre, Fou/Alfil, Cavalier/Caballo.
  F: 'B',
  A: 'B',
  C: 'N',
  // Lower case where the letter cannot be a file: a lower-case b, c, d, a, f is a pawn's file.
  k: 'K',
  q: 'Q',
  r: 'R',
  n: 'N',
  s: 'N',
  l: 'B',
  t: 'R',
  // Figurines, when a phone keyboard offers them.
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
};

/**
 * The reduced spelling: piece letter in English upper case, squares in lower
 * case, no capture, check, mate or annotation marks, castling as `O-O`,
 * promotion as `=Q`. The same function reduces a token and a legal move's
 * SAN, so they can be compared directly.
 */
export function normalizeToken(raw: string): string {
  let text = raw.trim();
  if (text === '') return '';
  // Castling in every spelling: 0-0, O-O, o-o, OO, 00, 0-0-0 …
  const castle = text
    .replace(/[\s.:!?+#]/g, '')
    .toUpperCase()
    .replace(/0/g, 'O');
  if (/^O-?O-?O$/.test(castle)) return 'O-O-O';
  if (/^O-?O$/.test(castle)) return 'O-O';
  // Strip what does not identify the move. A `?` in the middle of a token is an
  // illegible character and stays as a wildcard; at the end it is an annotation.
  text = text.replace(/[!?]+$/, '').replace(/[+#!:x×·\s]/g, '');
  // Promotion: e8Q, e8=Q, e8/Q, e8(Q); the piece letter may be lower case.
  text = text.replace(/[=/(]?([QRBNqrbnDTLSFAC])\)?$/, (match, letter: string) => {
    // Only a trailing piece letter after a square is a promotion.
    const before = text.slice(0, text.length - match.length);
    if (!/[1-8]$/.test(before)) return match;
    return `=${PIECE_LETTERS[letter.toUpperCase()] ?? letter.toUpperCase()}`;
  });
  // Leading piece letter, in any notation. A lower-case "b" is a file, not a bishop.
  const first = text[0] ?? '';
  const piece = PIECE_LETTERS[first];
  if (piece) text = piece + text.slice(1);
  // Squares in lower case, keeping the piece letter and promotion.
  return text.replace(
    /([A-H])([1-8])/g,
    (_m, file: string, rank: string) => file.toLowerCase() + rank,
  );
}

/** Every reduced spelling a legal move may appear under on a sheet. */
export function spellings(move: ChessMove): readonly string[] {
  const forms = new Set<string>();
  const base = normalizeToken(move.san);
  forms.add(base);
  if (move.piece === 'p') {
    // `ed`, `ed5`, `exd5`, `e4d5`, `d5` for a capture; `e4`, `e2e4` for a push.
    const promotion = move.promotion ? `=${move.promotion.toUpperCase()}` : '';
    if (move.flags.capture) {
      forms.add(`${move.from[0]}${move.to[0]}${promotion}`);
      forms.add(`${move.from[0]}${move.to}${promotion}`);
      forms.add(`${move.to}${promotion}`);
    }
    forms.add(`${move.from}${move.to}${promotion}`);
  } else if (!move.flags.kingsideCastle && !move.flags.queensideCastle) {
    const letter = move.piece.toUpperCase();
    // Disambiguated forms the writer may have added or left out.
    forms.add(`${letter}${move.to}`);
    forms.add(`${letter}${move.from[0]}${move.to}`);
    forms.add(`${letter}${move.from[1]}${move.to}`);
    forms.add(`${letter}${move.from}${move.to}`);
  }
  return [...forms];
}

/** Levenshtein distance capped at 2, with `?` matching any one character; anything past 1 is not offered. */
function distance(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 1) return 2;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const previous = new Array<number>(cols).fill(0).map((_v, j) => j);
  for (let i = 1; i < rows; i += 1) {
    const current = [i];
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] || a[i - 1] === '?' ? 0 : 1;
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost);
    }
    previous.splice(0, cols, ...current);
  }
  return Math.min(2, previous[cols - 1]!);
}

export function matchToken(position: Position, raw: string): MatchResult {
  const normalized = normalizeToken(raw);
  const candidates: Candidate[] = [];
  if (normalized === '') return { token: raw, normalized, candidates, certain: false };
  for (const move of position.legalMoves()) {
    let best = 2;
    for (const form of spellings(move)) best = Math.min(best, distance(normalized, form));
    if (best <= 1) candidates.push({ move, distance: best });
  }
  candidates.sort((a, b) => a.distance - b.distance || a.move.san.localeCompare(b.move.san));
  const first = candidates[0];
  const certain =
    first !== undefined && !candidates.some((c, i) => i > 0 && c.distance === first.distance);
  return { token: raw, normalized, candidates, certain };
}
