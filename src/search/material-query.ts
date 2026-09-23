/**
 * Material, typed the way books and ChessBase write it: `R v B`, `Q v RR`,
 * `RB v R`, `RPP v R`.
 *
 * Kings are implied and may be written (`KR v KB`) or not. Pawns are ignored
 * unless the query names a pawn on either side, and then they are counted
 * exactly on both — "rook and two pawns against a rook" means that, not
 * "rook and at least two pawns". A side with nothing but its king is written
 * `K`. The query is symmetric unless the caller fixes a colour for the first
 * side, because "rook against bishop" is one question whichever colour holds
 * the rook.
 *
 * Pure, and deliberately cheap: a search reads this for every position of
 * every game it scans, so it counts letters in the FEN's placement field
 * rather than running the full, validating FEN parser.
 */

import type { Color } from '@/chess/types';

type Counted = 'q' | 'r' | 'b' | 'n' | 'p';

export interface MaterialSide {
  readonly q: number;
  readonly r: number;
  readonly b: number;
  readonly n: number;
  readonly p: number;
}

export interface MaterialQuery {
  readonly first: MaterialSide;
  readonly second: MaterialSide;
  /** Whether pawns take part in the comparison. */
  readonly pawns: boolean;
  /** The text as normalised, for display: `RPP v R`. */
  readonly label: string;
}

export type MaterialParse =
  | { readonly ok: true; readonly query: MaterialQuery }
  | { readonly ok: false; readonly error: string };

const SEPARATOR = /\s*(?:\bversus\b|\bvs\.?|\bv\b|\bagainst\b)\s*/i;

export function parseMaterialQuery(text: string): MaterialParse {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: 'Type the material, e.g. "R v B".' };
  const parts = trimmed.split(SEPARATOR);
  if (parts.length !== 2) {
    return { ok: false, error: 'Write two sides with "v" between them, e.g. "R v B".' };
  }
  const sides: MaterialSide[] = [];
  let pawns = false;
  for (const raw of parts) {
    const letters = raw.replace(/\s+/g, '').toUpperCase();
    if (!letters) return { ok: false, error: 'Each side needs at least a K, e.g. "R v K".' };
    const side = { q: 0, r: 0, b: 0, n: 0, p: 0 };
    for (const letter of letters) {
      if (letter === 'K') continue;
      const type = letter.toLowerCase() as Counted;
      if (!(type in side)) {
        return {
          ok: false,
          error: `"${letter}" is not a piece. Use K, Q, R, B, N and P.`,
        };
      }
      side[type] += 1;
      if (type === 'p') pawns = true;
    }
    sides.push(side);
  }
  const [first, second] = sides as [MaterialSide, MaterialSide];
  return {
    ok: true,
    query: { first, second, pawns, label: `${sideLabel(first)} v ${sideLabel(second)}` },
  };
}

/** Counts per colour from the placement field of a FEN. */
export function materialOf(fen: string): Record<Color, MaterialSide> {
  const white = { q: 0, r: 0, b: 0, n: 0, p: 0 };
  const black = { q: 0, r: 0, b: 0, n: 0, p: 0 };
  const end = fen.indexOf(' ');
  const placement = end < 0 ? fen : fen.slice(0, end);
  for (let index = 0; index < placement.length; index += 1) {
    const char = placement.charCodeAt(index);
    // Uppercase A–Z is White, lowercase a–z is Black; digits and '/' are neither.
    if (char >= 65 && char <= 90) bump(white, char + 32);
    else if (char >= 97 && char <= 122) bump(black, char);
  }
  return { w: white, b: black };
}

/**
 * Whether a position has exactly the queried material.
 *
 * `colour` fixes which side holds the query's first group; without it,
 * either assignment counts.
 */
export function materialMatches(fen: string, query: MaterialQuery, colour?: Color): boolean {
  const material = materialOf(fen);
  const as = (holder: Color) =>
    sameSide(material[holder], query.first, query.pawns) &&
    sameSide(material[holder === 'w' ? 'b' : 'w'], query.second, query.pawns);
  if (colour) return as(colour);
  return as('w') || as('b');
}

function bump(side: { q: number; r: number; b: number; n: number; p: number }, code: number) {
  switch (code) {
    case 113:
      side.q += 1;
      break;
    case 114:
      side.r += 1;
      break;
    case 98:
      side.b += 1;
      break;
    case 110:
      side.n += 1;
      break;
    case 112:
      side.p += 1;
      break;
    default:
      break;
  }
}

const sameSide = (have: MaterialSide, want: MaterialSide, pawns: boolean): boolean =>
  have.q === want.q &&
  have.r === want.r &&
  have.b === want.b &&
  have.n === want.n &&
  (!pawns || have.p === want.p);

function sideLabel(side: MaterialSide): string {
  const text =
    'Q'.repeat(side.q) +
    'R'.repeat(side.r) +
    'B'.repeat(side.b) +
    'N'.repeat(side.n) +
    'P'.repeat(side.p);
  return text || 'K';
}
