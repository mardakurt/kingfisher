'use client';

import { useRouter } from 'next/navigation';

import { ChevronLeft, ChevronRight, Flip, Reset, SkipEnd, SkipStart } from '@/components/icons';
import { Button, IconButton } from '@/components/ui/Button';
import { positionPageAvailable } from '@/features/position/open-position-page';
import { positionPageUrl } from '@/position/knowledge';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';

/** Move navigation, kept directly under the board where the eye already is. */
export function BoardControls({
  showPositionPage = true,
}: {
  readonly showPositionPage?: boolean;
}) {
  const toStart = useAnalysis((state) => state.toStart);
  const back = useAnalysis((state) => state.back);
  const forward = useAnalysis((state) => state.forward);
  const toEnd = useAnalysis((state) => state.toEnd);
  const flip = useAnalysis((state) => state.flip);
  const clearMoves = useAnalysis((state) => state.clearMoves);
  const notify = useUi((state) => state.notify);
  const router = useRouter();

  const atStart = useAnalysis((state) => state.currentId === state.tree.rootId);
  const atEnd = useAnalysis(
    (state) => (state.tree.nodes[state.currentId]?.children.length ?? 0) === 0,
  );
  const hasMoves = useAnalysis(
    (state) => (state.tree.nodes[state.tree.rootId]?.children.length ?? 0) > 0,
  );

  /*
   * The un-silo is reachable from every unconcealed board. The capability
   * check is the one the menu and palette share, so the button cannot leak
   * evidence where the workspace promised none. A concealing workspace
   * suppresses the control at render time: the button being there would
   * already tell a player a position has evidence, before they had decided
   * to look.
   */
  const openPositionPage = () => {
    if (typeof document !== 'undefined' && !positionPageAvailable()) {
      notify({
        tone: 'info',
        message: 'Reveal this exercise before opening its position evidence.',
      });
      return;
    }
    const fen = useAnalysis.getState().tree.nodes[useAnalysis.getState().currentId]?.fen;
    if (!fen) return;
    const href = positionPageUrl(fen);
    if (href) router.push(href);
  };

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
      {showPositionPage ? (
        <Button onClick={openPositionPage} data-position-page-control>
          Open position page
        </Button>
      ) : null}
      {/*
        Reset the move tree, where it can be found. Since Phase 51 the command
        existed in three menus and the owner could not find any of them; a
        control that clears the board's moves belongs beside the controls that
        walk them. The board returns to the starting position (the initial one, or
        the FEN that was set up) and the tree is one undo away. The label says
        so: "keep this position" read as the position on screen, which is exactly
        what the button does not keep.
      */}
      <IconButton
        label="Clear the move tree — back to the starting position (undo with ⌘Z)"
        onClick={() => {
          clearMoves();
          notify({
            tone: 'info',
            message: 'Move tree cleared — back to the starting position. Undo with ⌘Z.',
          });
        }}
        disabled={!hasMoves}
        data-reset-moves
      >
        <Reset />
      </IconButton>
    </div>
  );
}
