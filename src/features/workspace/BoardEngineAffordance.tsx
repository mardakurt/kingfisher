'use client';

/**
 * Engine running state, on the board itself.
 *
 * Phase 56 change: the engine's Start / Stop control used to live only in
 * the right rail's Engine tab. New users open the workspace, see the
 * board, and reasonably assume the engine is analysing — until they
 * notice the eval bar is blank. The Engine tab is one click away on
 * desktop, two on mobile, and the icon does not advertise that it is the
 * engine.
 *
 * This component puts the engine's state where the user is looking —
 * the bottom-right corner of the board — as a small pill. It has two
 * shapes:
 *
 *   - Engine off: a single "Analyse" button. Clicking it starts the
 *     engine on the current position. The button label tells the user
 *     exactly what will happen.
 *   - Engine running: a quiet "Engine · depth N" indicator with a
 *     stop button. Clicking the indicator stops the engine.
 *
 * The component is invisible when the workspace does not show evaluation
 * (review-before-reveal, training, blindfold) — there is nothing for
 * the user to start.
 */

import { useCallback } from 'react';

import { Play, Stop } from '@/components/icons';
import { useAnalysisPosition } from '@/features/analysis/useAnalysisPosition';
import { cn } from '@/lib/cn';
import { useEngine } from '@/stores/engine-store';
import { usePreferences } from '@/stores/preferences-store';

interface BoardEngineAffordanceProps {
  /**
   * Whether the workspace is one where the engine can usefully run.
   * Concealment workspaces (review, training) pass `false` and the
   * affordance disappears.
   */
  readonly showEvaluation: boolean;
}

export function BoardEngineAffordance({ showEvaluation }: BoardEngineAffordanceProps) {
  const { node } = useAnalysisPosition();
  /*
   * Only the engine-shape values the start button reads; reading the
   * whole preferences store would re-render this on every theme change.
   * `usePreferences` is a thin selector wrapper, so the cost is one
   * subscription per field, each firing only when its value changes.
   */
  const engineLimit = usePreferences((state) => state.engineLimit);
  const engineMultiPv = usePreferences((state) => state.engineMultiPv);
  const engineThreads = usePreferences((state) => state.engineThreads);
  const engineHashMb = usePreferences((state) => state.engineHashMb);
  const status = useEngine((state) => state.primary.status);
  const running = useEngine((state) => state.primary.running);
  const depth = useEngine((state) => state.primary.analysis?.depth ?? null);
  const analyse = useEngine((state) => state.analyse);
  const stopEngine = useEngine((state) => state.stop);

  const start = useCallback(() => {
    void analyse('primary', node.fen, engineLimit, {
      multiPv: engineMultiPv,
      threads: engineThreads,
      hashMb: engineHashMb,
    });
  }, [analyse, node.fen, engineHashMb, engineLimit, engineMultiPv, engineThreads]);

  if (!showEvaluation) return null;

  /*
    The running shape is small and informational: "Engine · depth 18". The
    stop button is at the trailing edge; pressing it stops the search.
    The pill is rounded and translucent so it sits on the board without
    covering the squares underneath.
  */
  if (running || status === 'loading') {
    return (
      <div
        data-board-engine-affordance="running"
        className={cn(
          'pointer-events-auto absolute bottom-3 right-3 z-20',
          'flex items-center gap-1.5 rounded-full bg-surface-1/85 px-2 py-1',
          'text-[10.5px] font-medium tabular text-secondary',
          'shadow-[0_1px_3px_rgba(0,0,0,0.25)] backdrop-blur-sm',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            status === 'loading' ? 'bg-warning animate-pulse' : 'bg-positive animate-pulse',
          )}
        />
        <span>
          {status === 'loading' ? 'Engine · starting…' : `Engine · depth ${depth ?? '?'}`}
        </span>
        <button
          type="button"
          onClick={() => stopEngine()}
          aria-label="Stop engine analysis"
          className={cn(
            'ml-1 flex h-4 w-4 items-center justify-center rounded-full',
            'text-tertiary transition-colors hover:bg-surface-3 hover:text-primary',
          )}
        >
          <Stop className="h-3 w-3" />
        </button>
      </div>
    );
  }

  /*
    The off shape is a single button labelled "Analyse". It does not
    carry the engine's name or settings — that information belongs in
    the right rail, where the user can change the engine. The button
    only signals that analysis is one click away, and starts it.
  */
  return (
    <button
      type="button"
      data-board-engine-affordance="off"
      onClick={() => void start()}
      className={cn(
        'pointer-events-auto absolute bottom-3 right-3 z-20',
        'flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5',
        'text-[11px] font-medium text-accent-fg shadow-[0_2px_6px_rgba(0,0,0,0.25)]',
        'transition-transform hover:scale-[1.02] active:scale-[0.98]',
      )}
    >
      <Play className="h-3 w-3" />
      <span>Analyse</span>
    </button>
  );
}
