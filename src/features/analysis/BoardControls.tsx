'use client';

import { ChevronLeft, ChevronRight, Flip, Reset, SkipEnd, SkipStart } from '@/components/icons';
import { IconButton } from '@/components/ui/Button';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';

/** Move navigation, kept directly under the board where the eye already is. */
export function BoardControls() {
  const toStart = useAnalysis((state) => state.toStart);
  const back = useAnalysis((state) => state.back);
  const forward = useAnalysis((state) => state.forward);
  const toEnd = useAnalysis((state) => state.toEnd);
  const flip = useAnalysis((state) => state.flip);
  const clearMoves = useAnalysis((state) => state.clearMoves);
  const notify = useUi((state) => state.notify);

  const atStart = useAnalysis((state) => state.currentId === state.tree.rootId);
  const atEnd = useAnalysis(
    (state) => (state.tree.nodes[state.currentId]?.children.length ?? 0) === 0,
  );
  const hasMoves = useAnalysis(
    (state) => (state.tree.nodes[state.tree.rootId]?.children.length ?? 0) > 0,
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
      {/*
        Reset the move tree, where it can be found. Since Phase 51 the command
        existed in three menus and the owner could not find any of them; a
        control that clears the board's moves belongs beside the controls that
        walk them. It keeps the starting position and is one undo away.
      */}
      <IconButton
        label="Reset moves — clear the move tree, keep the position (undo with ⌘Z)"
        onClick={() => {
          clearMoves();
          notify({ tone: 'info', message: 'Move tree cleared. Undo with ⌘Z.' });
        }}
        disabled={!hasMoves}
        data-reset-moves
      >
        <Reset />
      </IconButton>
    </div>
  );
}
