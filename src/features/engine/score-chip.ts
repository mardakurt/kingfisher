/**
 * The score chip beside an engine line: White's colour when White is better,
 * Black's when Black is, neutral within 0.40 — one rule for the local engine's
 * lines and the Lichess cloud's, so the two read alike and differ only in
 * their label.
 *
 * A chip in White's colour on a white panel is a number with no chip around
 * it; the evaluation edge is what makes it one, in either theme.
 */
const WHITE_CHIP = 'bg-eval-white text-eval-black ring-1 ring-inset ring-eval-edge';
const BLACK_CHIP = 'bg-eval-black text-eval-white ring-1 ring-inset ring-eval-edge';

export const scoreTone = (line: {
  readonly score: { readonly kind: string; readonly cp?: number; readonly moves?: number };
}): string => {
  if (line.score.kind === 'mate') {
    return (line.score.moves ?? 0) > 0 ? WHITE_CHIP : BLACK_CHIP;
  }
  const cp = line.score.cp ?? 0;
  if (cp > 40) return WHITE_CHIP;
  if (cp < -40) return BLACK_CHIP;
  return 'bg-surface-3 text-secondary';
};
