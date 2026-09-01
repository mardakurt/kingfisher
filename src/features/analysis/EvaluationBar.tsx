'use client';

import { formatScore, winningChances, type Score } from '@/chess/evaluation';
import { cn } from '@/lib/cn';
import type { Color } from '@/chess/types';

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
 * do not change the practical assessment.
 */
export function EvaluationBar({ score, orientation, stale }: EvaluationBarProps) {
  const chances = score ? winningChances(score) : 0.5;
  const whiteShare = Math.min(0.98, Math.max(0.02, chances));
  const share = orientation === 'w' ? whiteShare : 1 - whiteShare;

  const label = score ? formatScore(score) : '—';
  const whiteLeading = score ? (score.kind === 'mate' ? score.moves > 0 : score.cp >= 0) : true;

  return (
    <div
      className={cn(
        'relative flex h-full w-[18px] shrink-0 flex-col overflow-hidden rounded-[3px] border border-line-strong transition-opacity',
        stale && 'opacity-45',
      )}
      title={score ? `Evaluation ${label}` : 'No evaluation yet'}
      aria-label={score ? `Evaluation ${label}` : 'No evaluation'}
    >
      <div className="absolute inset-0 bg-eval-black" />
      <div
        className="absolute inset-x-0 bg-eval-white transition-[height] duration-300 ease-out"
        style={{ height: `${share * 100}%`, bottom: 0 }}
      />
      <div className="absolute inset-x-0 top-1/2 h-px bg-black/25" />

      <span
        className={cn(
          'absolute inset-x-0 text-center text-[9px] font-medium leading-none tabular',
          whiteLeading ? 'bottom-1 text-eval-black' : 'top-1 text-eval-white',
        )}
        style={{ mixBlendMode: 'normal' }}
      >
        {label}
      </span>
    </div>
  );
}
