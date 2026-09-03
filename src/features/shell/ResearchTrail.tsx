'use client';

/**
 * "← Back to the Najdorf repertoire."
 *
 * The whole point is the label. `history.back()` already exists and already
 * works; what it cannot do is tell you where it goes, and a research trail
 * five hops deep is exactly where that matters. Naming the destination is the
 * difference between a control people use and one they do not trust.
 *
 * It restores the position too, which the browser's history does not: coming
 * back to a repertoire on a different move is coming back somewhere else.
 */

import { useRouter } from 'next/navigation';

import { ChevronLeft } from '@/components/icons';
import { createTree } from '@/chess/tree/tree';
import { asFen } from '@/chess/types';
import { useAnalysis } from '@/stores/analysis-store';
import { useResearchHistory } from '@/stores/research-history-store';

export function ResearchTrail() {
  const router = useRouter();
  const stops = useResearchHistory((state) => state.stops);
  const openDocument = useAnalysis((state) => state.openDocument);
  const stop = stops.at(-1);
  if (!stop) return null;

  return (
    <div className="flex h-7 shrink-0 items-center gap-2 border-b border-line-subtle bg-surface-2 px-2 sm:px-3">
      <button
        type="button"
        className="flex items-center gap-1 text-[11px] text-secondary transition-colors hover:text-accent focus-visible:text-accent"
        onClick={() => {
          const popped = useResearchHistory.getState().pop();
          if (!popped) return;
          if (popped.fen) {
            openDocument({
              tree: createTree(asFen(popped.fen), { Event: popped.label, Result: '*' }),
              document: { kind: 'untitled', title: popped.label },
            });
          }
          router.push(popped.href);
        }}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to {stop.label}
      </button>
      {stops.length > 1 ? (
        <span className="text-[10px] text-tertiary">{stops.length} stops</span>
      ) : null}
    </div>
  );
}
