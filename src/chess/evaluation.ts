/**
 * Evaluation as a domain concept.
 *
 * A score is always stored from White's point of view. Engines report from the
 * side to move; that conversion happens once, at the UCI boundary, so nothing
 * downstream has to remember whose turn it was.
 */

import type { Uci } from './types';

export type Score =
  { readonly kind: 'cp'; readonly cp: number } | { readonly kind: 'mate'; readonly moves: number };

export const cp = (value: number): Score => ({ kind: 'cp', cp: Math.round(value) });
export const mate = (moves: number): Score => ({ kind: 'mate', moves });

/** A recorded evaluation, with the provenance needed to judge how much to trust it. */
export interface Evaluation {
  /** Always from White's point of view. */
  readonly score: Score;
  readonly depth?: number;
  readonly seldepth?: number;
  readonly nodes?: number;
  readonly timeMs?: number;
  readonly engine?: string;
  readonly bestMove?: Uci;
  /** Epoch milliseconds; lets stale evaluations be recognised as stale. */
  readonly recordedAt?: number;
}

/** Flip a side-to-move relative score into the White-relative convention. */
export function toWhitePov(score: Score, sideToMove: 'w' | 'b'): Score {
  if (sideToMove === 'w') return score;
  return score.kind === 'cp' ? cp(-score.cp) : mate(-score.moves);
}

/** Centipawns, clamped, for bars and sorting. Mate maps to the extremes. */
export function scoreToCentipawns(score: Score, clamp = 1000): number {
  if (score.kind === 'mate') return score.moves >= 0 ? clamp : -clamp;
  return Math.max(-clamp, Math.min(clamp, score.cp));
}

/**
 * Expected score for White in [0, 1].
 *
 * Uses the logistic curve Lichess fits to real game results, which is a far
 * better guide to practical significance than raw centipawns: the difference
 * between +0.2 and +0.5 matters much more than between +6.0 and +6.3.
 */
export function winningChances(score: Score): number {
  if (score.kind === 'mate') return score.moves > 0 ? 1 : 0;
  return 1 / (1 + Math.exp(-0.00368208 * score.cp));
}

/** Convert a Stockfish WDL string ('w-d-l') into a
    white-side probability. Linear in (w - l) / 6 so the
    score sits in [0, 1] without the centipawn sigmoid. */
export function wdlToProbability(wdl: '4-2-0' | '3-2-1' | '2-2-2' | '1-2-3' | '0-2-4'): number {
  const [w, , l] = wdl.split('-').map(Number) as [number, number, number];
  return Math.max(0, Math.min(1, (w - l) / 6 + 0.5));
}

/** Human-facing text: `+0.34`, `-1.20`, `M4`, `-M2`. */
export function formatScore(score: Score, options: { alwaysSign?: boolean } = {}): string {
  const alwaysSign = options.alwaysSign ?? true;
  if (score.kind === 'mate') {
    if (score.moves === 0) return '#';
    return `${score.moves > 0 ? '' : '-'}M${Math.abs(score.moves)}`;
  }
  const pawns = score.cp / 100;
  const text = Math.abs(pawns).toFixed(2);
  if (pawns > 0) return alwaysSign ? `+${text}` : text;
  if (pawns < 0) return `-${text}`;
  return alwaysSign ? '0.00' : text;
}

/** Ordering from White's perspective: greater is better for White. */
export function compareScores(a: Score, b: Score): number {
  return scoreValue(a) - scoreValue(b);
}

function scoreValue(score: Score): number {
  if (score.kind === 'cp') return score.cp;
  // Faster mates rank higher; mate-in-1 beats mate-in-8.
  const magnitude = 100_000 - Math.min(Math.abs(score.moves), 999) * 100;
  return score.moves >= 0 ? magnitude : -magnitude;
}

export const isDecisive = (score: Score): boolean =>
  score.kind === 'mate' || Math.abs(score.cp) >= 200;
