'use client';

import { cn } from '@/lib/cn';
import type { Score } from '@/chess/evaluation';
import type { Color } from '@/chess/types';

import { evaluationBarLayout } from './evaluation-bar-layout';

interface EvaluationBarProps {
  readonly score: Score | null;
  readonly orientation: Color;
  readonly stale?: boolean;
}

/**
 * The evaluation bar.
 *
 * Height is driven by expected score rather than by centipawns: a bar that
 * moves linearly with centipawns spends most of its travel on differences that
 * do not change the practical assessment. The geometry — which band is at the
 * bottom, how tall it is, where the label sits — is `evaluationBarLayout`,
 * which is unit-tested for both orientations, both signs and mate.
 */
export function EvaluationBar({ score, orientation, stale }: EvaluationBarProps) {
  const layout = evaluationBarLayout(score, orientation);
  const bottomIsWhite = layout.bottomSide === 'w';

  return (
    <div
      data-evaluation-bar
      data-leading={layout.leading ?? 'none'}
      data-bottom-side={layout.bottomSide}
      className={cn(
        'relative flex h-full w-[18px] shrink-0 flex-col overflow-hidden rounded-[3px] border border-line-strong transition-opacity',
        stale && 'opacity-45',
      )}
      title={score ? `Evaluation ${layout.label}` : 'No evaluation yet'}
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
      <div className="absolute inset-x-0 top-1/2 h-px bg-black/25" />

      <span
        className={cn(
          'absolute inset-x-0 text-center text-[9px] font-medium leading-none tabular',
          layout.labelAt === 'bottom' ? 'bottom-1' : 'top-1',
          layout.labelOn === 'w' ? 'text-eval-black' : 'text-eval-white',
        )}
        style={{ mixBlendMode: 'normal' }}
      >
        {layout.label}
      </span>
    </div>
  );
}
