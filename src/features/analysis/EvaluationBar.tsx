'use client';

import { cn } from '@/lib/cn';
import type { Score } from '@/chess/evaluation';
import type { Color } from '@/chess/types';

import { evaluationBarLayout } from './evaluation-bar-layout';

interface EvaluationBarProps {
  readonly score: Score | null;
  readonly orientation: Color;
  readonly stale?: boolean;
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
export function EvaluationBar({ score, orientation, stale, depth, engine }: EvaluationBarProps) {
  const layout = evaluationBarLayout(score, orientation);
  const bottomIsWhite = layout.bottomSide === 'w';
  const reading = score
    ? `Evaluation ${layout.label}${depth ? ` at depth ${depth}` : ''}${engine ? ` · ${engine}` : ''}${
        stale ? ' · from an earlier search' : ''
      }`
    : 'No evaluation for this position yet — start the engine to get one';

  return (
    <div
      data-evaluation-bar
      data-leading={layout.leading ?? 'none'}
      data-bottom-side={layout.bottomSide}
      data-stale={stale ? 'true' : undefined}
      className={cn(
        'relative flex h-full shrink-0 flex-col overflow-hidden rounded-[2px] border border-line-strong/70 transition-opacity',
        stale && 'opacity-60',
      )}
      style={{ width: EVALUATION_BAR_WIDTH }}
      title={reading}
      aria-label={score ? `Evaluation ${layout.label}` : 'No evaluation'}
    >
      {/* The band of the side at the top fills the whole bar; the bottom side's band is drawn over it. */}
      <div className={cn('absolute inset-0', bottomIsWhite ? 'bg-eval-black' : 'bg-eval-white')} />
      <div
        data-evaluation-bar-fill
        className={cn(
          'absolute inset-x-0 transition-[height] duration-300 ease-out',
          bottomIsWhite ? 'bg-eval-white' : 'bg-eval-black',
        )}
        style={{ height: `${layout.bottomShare * 100}%`, bottom: 0 }}
      />
      {/* Equality, so a fill just above or below the middle can be read as such. */}
      <div className="absolute inset-x-0 top-1/2 h-px bg-black/30" aria-hidden />

      <span
        data-evaluation-bar-label
        className={cn(
          'absolute inset-x-0 text-center text-[10px] font-medium leading-none tabular',
          layout.labelAt === 'bottom' ? 'bottom-1' : 'top-1',
          layout.labelOn === 'w' ? 'text-eval-black' : 'text-eval-white',
        )}
      >
        {layout.barLabel}
      </span>
    </div>
  );
}
