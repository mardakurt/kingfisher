'use client';

import { cn } from '@/lib/cn';
import type { Score } from '@/chess/evaluation';
import type { Color, GameOutcome } from '@/chess/types';

import { barLabelSize, describeOutcome, evaluationBarLayout } from './evaluation-bar-layout';

interface EvaluationBarProps {
  readonly score: Score | null;
  readonly orientation: Color;
  /** The game is over here: the bar shows the result, whatever the score says. */
  readonly outcome?: GameOutcome | null;
  readonly stale?: boolean;
  /**
   * The score belongs to the position before this one, shown while the
   * engine catches up. Drawn like a stale reading; the title says which.
   */
  readonly catchingUp?: boolean;
  /** Search depth behind the score, for the title. */
  readonly depth?: number;
  /** The engine that produced it, for the title. */
  readonly engine?: string;
}

/**
 * The bar's width in pixels. `CanonicalBoardSurface` takes the same number out
 * of the board's width budget, so the constant lives here and is imported
 * there rather than repeated.
 *
 * Twenty-four, not thirty-two: a thick bar dominates the iPad rail and pushes
 * the board into a width the user cannot read easily. Lichess uses a similar
 * width — the bar is a *label* on the side, not a control that needs to be
 * fat enough to click. The five-character compact label still fits.
 */
export const EVALUATION_BAR_WIDTH = 24;

/**
 * The evaluation bar.
 *
 * Height is driven by expected score rather than by centipawns: a bar that
 * moves linearly with centipawns spends most of its travel on differences that
 * do not change the practical assessment. The geometry — which band is at the
 * bottom, how tall it is, where the label sits — is `evaluationBarLayout`,
 * which is unit-tested for both orientations, both signs and mate.
 *
 * The number is part of the bar, not decoration on it. Before Phase 52 the
 * label was nine pixels tall inside an eighteen-pixel column, and the owner
 * read "+0.38" as "+0." — a bar whose number cannot be read is a bar whose
 * fill is the only evidence, and a fill 3% above the middle looks like an
 * opinion the bar is not entitled to. The bar is now wide enough for the
 * figure the engine panel shows, and the full reading — score, depth,
 * engine — is the title.
 */
export function EvaluationBar({
  score,
  orientation,
  outcome = null,
  stale,
  catchingUp,
  depth,
  engine,
}: EvaluationBarProps) {
  const layout = evaluationBarLayout(score, orientation, outcome);
  const bottomIsWhite = layout.bottomSide === 'w';
  const dimmed = !outcome && (stale || catchingUp);
  const reading = outcome
    ? describeOutcome(outcome)
    : score
      ? `Evaluation ${layout.label}${depth ? ` at depth ${depth}` : ''}${engine ? ` · ${engine}` : ''}${
          catchingUp
            ? ' · previous position, while the engine catches up'
            : stale
              ? ' · from an earlier search'
              : ''
        }`
      : 'No evaluation for this position yet — start the engine to get one';

  return (
    <div
      data-evaluation-bar
      data-leading={layout.leading ?? 'none'}
      data-bottom-side={layout.bottomSide}
      data-stale={dimmed ? 'true' : undefined}
      data-catching-up={catchingUp && !outcome ? 'true' : undefined}
      data-outcome={outcome?.kind}
      className={cn(
        'relative flex shrink-0 flex-col overflow-hidden rounded-[2px] bg-eval-black transition-opacity',
        dimmed && 'opacity-60',
      )}
      style={{
        width: EVALUATION_BAR_WIDTH,
        /*
         * Framed like the board beside it. The ring is the board's frame
         * colour (`boardFrameVariables`, set by the surface), drawn outside
         * the bar so the label keeps all of its width, and the block margin
         * puts the ring's outer edge where the board frame's outer edge is:
         * bar and board are one object, not a strip that happens to stand
         * next to a board. On a frameless theme — or anywhere without a
         * board — the ring is the evaluation edge, one pixel, which is what
         * keeps White's band visible on the white page of the light theme.
         */
        boxShadow:
          '0 0 0 var(--eval-ring, 1px) var(--board-frame-color, var(--eval-edge)), var(--shadow-board)',
        marginBlock: 'calc(var(--eval-ring, 1px) - var(--board-frame-width, 0px))',
      }}
      title={reading}
      aria-label={outcome ? reading : score ? `Evaluation ${layout.label}` : 'No evaluation'}
    >
      {/* The band of the side at the top fills the whole bar; the bottom side's band is drawn over it. */}
      <div className={cn('absolute inset-0', bottomIsWhite ? 'bg-eval-black' : 'bg-eval-white')} />
      <div
        data-evaluation-bar-fill
        className={cn(
          /*
           * The fill animates with `cubic-bezier(0.22, 0.61, 0.36, 1)` over
           * 900ms — long enough that the eye can read the *trajectory* of an
           * evaluation collapsing from +3 to −5 as a single story rather than a
           * snap between two stills. Lichess uses a comparable curve; a 300ms
           * transition (the value Phase 55 landed on) reads as flicker at the
           * rate an engine emits best lines, and a player watching a live
           * search ends up flinching at every depth-1 refresh.
           *
           * `prefers-reduced-motion` is honoured by the global stylesheet, so
           * a player who has asked their OS for less motion gets the snap
           * back, regardless of this duration.
           */
          'absolute inset-x-0 transition-[height] duration-900 ease-[cubic-bezier(0.22,0.61,0.36,1)]',
          bottomIsWhite ? 'bg-eval-white' : 'bg-eval-black',
        )}
        style={{ height: `${layout.bottomShare * 100}%`, bottom: 0 }}
      />
      {/* Equality, so a fill just above or below the middle can be read as such. */}
      <div className="absolute inset-x-0 top-1/2 h-px bg-eval-midline" aria-hidden />

      <span
        data-evaluation-bar-label
        className={cn(
          'absolute inset-x-0 text-center font-semibold leading-none tracking-tight tabular',
          layout.labelAt === 'bottom' ? 'bottom-1' : 'top-1',
          layout.labelOn === 'w' ? 'text-eval-black' : 'text-eval-white',
        )}
        style={{ fontSize: barLabelSize(layout.barLabel) }}
      >
        {layout.barLabel}
      </span>
    </div>
  );
}
