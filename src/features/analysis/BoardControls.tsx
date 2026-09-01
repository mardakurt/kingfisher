'use client';

import { ChevronLeft, ChevronRight, Flip, SkipEnd, SkipStart } from '@/components/icons';
import { IconButton } from '@/components/ui/Button';
import { useAnalysis } from '@/stores/analysis-store';

/** Move navigation, kept directly under the board where the eye already is. */
export function BoardControls() {
  const toStart = useAnalysis((state) => state.toStart);
  const back = useAnalysis((state) => state.back);
  const forward = useAnalysis((state) => state.forward);
  const toEnd = useAnalysis((state) => state.toEnd);
  const flip = useAnalysis((state) => state.flip);

  const atStart = useAnalysis((state) => state.currentId === state.tree.rootId);
  const atEnd = useAnalysis(
    (state) => (state.tree.nodes[state.currentId]?.children.length ?? 0) === 0,
  );

  return (
    <div className="flex items-center gap-0.5">
      <IconButton label="Start of game (Home)" onClick={toStart} disabled={atStart}>
        <SkipStart />
      </IconButton>
      <IconButton label="Previous move (←)" onClick={back} disabled={atStart}>
        <ChevronLeft />
      </IconButton>
      <IconButton label="Next move (→)" onClick={forward} disabled={atEnd}>
        <ChevronRight />
      </IconButton>
      <IconButton label="End of line (End)" onClick={toEnd} disabled={atEnd}>
        <SkipEnd />
      </IconButton>
      <span className="mx-1 h-4 w-px bg-line-subtle" />
      <IconButton label="Flip board (F)" onClick={flip}>
        <Flip />
      </IconButton>
    </div>
  );
}
