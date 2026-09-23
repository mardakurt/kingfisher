import { formatScore, winningChances, type Score } from '@/chess/evaluation';
import type { Color, GameOutcome } from '@/chess/types';

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
  /**
   * The label as the bar draws it: the same figure to two decimals below ten
   * pawns, one decimal from ten, so that it fits the bar's width at the size
   * a person can read. The full figure stays in `label`.
   */
  readonly barLabel: string;
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

/**
 * The figure the bar itself prints.
 *
 * The bar is 24 px wide, and at the label's 10 px that is four characters of
 * the platform face: `+9.4` measures 23 px, `-81.2` 26 px and was clipped
 * to `-81.`, which reads as a different number. So one decimal below ten
 * pawns, where the decimal is information, and whole pawns from ten, where
 * no decimal changes the reading. The full figure is always the title and the
 * accessible name (`label`); this is only what the strip has room for, and
 * `barLabelSize` steps the type down for the few figures that are still
 * longer (`-M12`, `+200`).
 */
export function compactScore(score: Score | null): string {
  if (!score) return '—';
  if (score.kind === 'mate') return formatScore(score);
  const pawns = score.cp / 100;
  // `toFixed(1)` rounds 9.96 up to "10.0": the whole-pawn rule starts where
  // the one-decimal figure would.
  if (Math.abs(pawns) < 9.95) return formatScore(score);
  return `${pawns > 0 ? '+' : '-'}${Math.round(Math.abs(pawns))}`;
}

/** The label's type size, in px, for a figure of this many characters. */
export function barLabelSize(label: string): number {
  if (label.length <= 3) return 10;
  if (label.length === 4) return /^[+-]\d\.\d$/.test(label) ? 10 : 9;
  return 8;
}

/**
 * White's share once the game is over. Checkmate is the whole bar — not the
 * 0.98 a mate-in-N gets, because there is no longer a move to find — and
 * every draw is the middle.
 */
export function outcomeWhiteShare(outcome: GameOutcome): number {
  if (outcome.kind === 'checkmate') return outcome.winner === 'w' ? 1 : 0;
  return 0.5;
}

/** The text a finished game shows on the bar: the result, not a number. */
export function outcomeLabel(outcome: GameOutcome): string {
  if (outcome.kind === 'checkmate') return outcome.winner === 'w' ? '1-0' : '0-1';
  return '½-½';
}

export function describeOutcome(outcome: GameOutcome): string {
  switch (outcome.kind) {
    case 'checkmate':
      return `Checkmate — ${outcome.winner === 'w' ? 'White' : 'Black'} wins`;
    case 'stalemate':
      return 'Stalemate — draw';
    case 'insufficient-material':
      return 'Draw — insufficient material';
    case 'fifty-move':
      return 'Draw — fifty-move rule';
    case 'threefold-repetition':
      return 'Draw — threefold repetition';
  }
}

/**
 * The bar for a position, or for a finished game.
 *
 * An `outcome` outranks any score. An engine asked about a checkmated
 * position has nothing to search and reports nothing, and before Phase 72
 * the bar answered that silence with an even split and "no evaluation" —
 * the one position whose assessment is certain was the one the bar refused
 * to give. A checkmate fills the winner's band completely; a draw by rule
 * is the middle, labelled as a result rather than as 0.0, because the
 * engine did not say "equal" — the rules said "over".
 */
export function evaluationBarLayout(
  score: Score | null,
  orientation: Color,
  outcome: GameOutcome | null = null,
): EvaluationBarLayout {
  const bottomSide = orientation;
  if (outcome) {
    const white = outcomeWhiteShare(outcome);
    const leading: Color | null = outcome.kind === 'checkmate' ? outcome.winner : null;
    const labelOn: Color = leading ?? 'w';
    const label = outcomeLabel(outcome);
    return {
      bottomShare: bottomSide === 'w' ? white : 1 - white,
      bottomSide,
      label,
      barLabel: label,
      leading,
      labelAt: labelOn === bottomSide ? 'bottom' : 'top',
      labelOn,
    };
  }
  const white = whiteShare(score);
  const bottomShare = bottomSide === 'w' ? white : 1 - white;
  const leading = leadingSide(score);
  // The label lives in the leading band; at equality it stays with White so
  // it does not jump between bands as a score crosses zero. Mate-in-0
  // (a position that is already checkmate) is a position, not an advantage;
  // the label sits at the top so the "#" the bar draws does not overlap the
  // small line the equality marker makes.
  const labelOn: Color = leading ?? 'w';
  const labelAt: 'top' | 'bottom' = labelOn === bottomSide ? 'bottom' : 'top';
  return {
    bottomShare,
    bottomSide,
    label: score ? formatScore(score) : '—',
    barLabel: compactScore(score),
    leading,
    labelAt,
    labelOn,
  };
}
