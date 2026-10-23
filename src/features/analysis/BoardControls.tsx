'use client';

import { useRouter } from 'next/navigation';

import {
  ChevronLeft,
  ChevronRight,
  Flip,
  Keyboard,
  Play,
  Reset,
  SkipEnd,
  SkipStart,
  Stop,
} from '@/components/icons';
import { toggleAutoplay } from '@/features/analysis/autoplay';
import { useKeyLabel } from '@/features/command/use-key-label';
import { Button, IconButton } from '@/components/ui/Button';
import { positionPageAvailable } from '@/features/position/open-position-page';
import { positionPageUrl } from '@/position/knowledge';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';

/**
 * A phone's strip is 351 px and these are eight controls and a label: at the
 * 32 px touch-target minimum they fit on one row, at 36 px the last wrapped.
 */
const PHONE_STEP = 'max-sm:w-8';

/** Move navigation, kept directly under the board where the eye already is. */
export function BoardControls({
  showPositionPage = true,
  allowTyping = true,
}: {
  readonly showPositionPage?: boolean;
  /** False where the board takes no moves, so there is nothing to type. */
  readonly allowTyping?: boolean;
}) {
  const keyLabel = useKeyLabel();
  /** "Flip board (F)", with the key as it is bound now, or no key at all. */
  const withKey = (label: string, action: string) => {
    const key = keyLabel(action);
    return key ? `${label} (${key})` : label;
  };
  const moveEntryOpen = useUi((state) => state.moveEntryOpen);
  const autoplaying = useUi((state) => state.autoplaying);
  const setMoveEntryOpen = useUi((state) => state.setMoveEntryOpen);
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
    // Wraps: on a phone the five steps, flip, typing and the position page
    // are wider than the strip, and a clipped row hid the clear button.
    <div className="flex min-w-0 flex-wrap items-center gap-0.5">
      <IconButton
        label={withKey('Start of game', 'start')}
        className={PHONE_STEP}
        onClick={toStart}
        disabled={atStart}
      >
        <SkipStart />
      </IconButton>
      <IconButton
        label={withKey('Previous move', 'back')}
        className={PHONE_STEP}
        onClick={back}
        disabled={atStart}
      >
        <ChevronLeft />
      </IconButton>
      <IconButton
        label={withKey('Next move', 'forward')}
        className={PHONE_STEP}
        onClick={forward}
        disabled={atEnd}
      >
        <ChevronRight />
      </IconButton>
      <IconButton
        label={withKey('End of line', 'end')}
        className={PHONE_STEP}
        onClick={toEnd}
        disabled={atEnd}
      >
        <SkipEnd />
      </IconButton>
      <IconButton
        label={withKey(autoplaying ? 'Pause the replay' : 'Play through the line', 'autoplay')}
        active={autoplaying}
        onClick={toggleAutoplay}
        disabled={!hasMoves}
        className={PHONE_STEP}
        data-autoplay
      >
        {autoplaying ? <Stop /> : <Play />}
      </IconButton>
      <span className="mx-1 h-4 w-px bg-line-subtle max-sm:hidden" />
      <IconButton label={withKey('Flip board', 'flip')} className={PHONE_STEP} onClick={flip}>
        <Flip />
      </IconButton>
      {allowTyping ? (
        <IconButton
          label={withKey('Type a move', 'type-move')}
          active={moveEntryOpen}
          onClick={() => setMoveEntryOpen(!moveEntryOpen)}
          // A phone types with the screen's own keyboard over the board; the
          // row is worth more to it than this button. `T` and the palette
          // still open the field where there is a keyboard.
          className="max-sm:hidden"
          data-move-entry-toggle
        >
          <Keyboard />
        </IconButton>
      ) : null}
      {showPositionPage ? (
        <Button
          onClick={openPositionPage}
          aria-label="Open position page"
          data-position-page-control
        >
          {/*
            Beside a dock below 1100px the strip under the board is ~470px,
            and the full label left the status line 71px — "White to play"
            needs 74 and was clipped mid-word. The verb is the first thing a
            narrow strip can spare; the name a reader hears stays whole.
          */}
          <span className="@max-[520px]:hidden">Open position page</span>
          <span className="hidden @max-[520px]:inline">Position page</span>
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
        className={PHONE_STEP}
        data-reset-moves
      >
        <Reset />
      </IconButton>
    </div>
  );
}
