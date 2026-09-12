import { formatScore, winningChances, type Score } from '@/chess/evaluation';
import type { Color } from '@/chess/types';

/**
 * Everything the evaluation bar draws, decided in one place.
 *
 * The bar is a column with the player at the bottom of the board at the
 * bottom of the bar, the way every published board does it. Two things
 * follow, and both went wrong before Phase 49:
 *
 * - The fill at the bottom is coloured for the side at the bottom. With the
 *   board flipped the bottom is Black's, so the fill there is dark and its
 *   height is Black's share; the old bar kept a white fill at the bottom and
 *   gave it Black's height, so a position White was winning read as a bar
 *   Black dominated the moment the board was turned.
 * - The label sits in the leading side's colour band, wherever that band is.
 *
 * The score itself is never touched: it is White-relative (chess/evaluation)
 * and orientation only decides where White's share is drawn.
 */
export interface EvaluationBarLayout {
  /** Share of the bar's height, from the bottom, filled for the bottom side. */
  readonly bottomShare: number;
  /** Which side is at the bottom of the bar (and of the board). */
  readonly bottomSide: Color;
  /** The score as text, `—` without one. */
  readonly label: string;
  /** The side that is better, or null at 0.00 / without a score. */
  readonly leading: Color | null;
  /** Where the label is drawn: in the leading side's band, else at White's. */
  readonly labelAt: 'top' | 'bottom';
  /** The band the label sits on, which decides its text colour. */
  readonly labelOn: Color;
}

/** White's share of the bar, clamped so both bands stay visible. */
export function whiteShare(score: Score | null): number {
  if (!score) return 0.5;
  return Math.min(0.98, Math.max(0.02, winningChances(score)));
}

export function leadingSide(score: Score | null): Color | null {
  if (!score) return null;
  if (score.kind === 'mate') return score.moves > 0 ? 'w' : score.moves < 0 ? 'b' : null;
  if (score.cp > 0) return 'w';
  if (score.cp < 0) return 'b';
  return null;
}

export function evaluationBarLayout(score: Score | null, orientation: Color): EvaluationBarLayout {
  const white = whiteShare(score);
  const bottomSide = orientation;
  const bottomShare = bottomSide === 'w' ? white : 1 - white;
  const leading = leadingSide(score);
  // The label lives in the leading band; at equality it stays with White so
  // it does not jump between bands as a score crosses zero.
  const labelOn: Color = leading ?? 'w';
  const labelAt: 'top' | 'bottom' = labelOn === bottomSide ? 'bottom' : 'top';
  return {
    bottomShare,
    bottomSide,
    label: score ? formatScore(score) : '—',
    leading,
    labelAt,
    labelOn,
  };
}
