'use client';

/**
 * Glyphs for the current move, one click away (ChessBase's notation toolbar).
 *
 * Annotating was reachable only from the move's context menu and the number
 * keys, which a player who has never right-clicked a move does not find. This
 * is one bar for the whole notation, acting on the move the board shows — not
 * buttons on every move, which is what the context menu's comment warns
 * against. Every action here is one the context menu already has.
 *
 * One row, never two: at 1280 × 720 the notation has five lines, and a bar
 * that wrapped took one of them (`e2e/analysis-laptop.spec.ts`). The six move
 * glyphs stay visible; the position judgements and the edits are menus. Where
 * the notation is stacked above the tools, the bar sits in its header and
 * costs no height at all (`AnnotationBarPlacement`).
 */

import { createContext, useContext } from 'react';

import { positionNags, qualityNags, type NagInfo } from '@/chess/annotations';
import { siblings, variationHeadId } from '@/chess/tree/tree';
import { ArrowUp, Pencil, Scissors, Trash } from '@/components/icons';
import { Menu } from '@/components/ui/Menu';
import { useChessWorkspace } from '@/features/workspace/ChessWorkspaceContext';
import { cn } from '@/lib/cn';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';

/**
 * `header`: an enclosing header shows the bar, so the move list does not.
 * Provided by the stacked Notation section; absent everywhere else.
 */
export const AnnotationBarPlacement = createContext<'header' | null>(null);
export const useAnnotationBarInHeader = () => useContext(AnnotationBarPlacement) === 'header';

/** ChessBase's order: White's judgements first, then Black's. */
const POSITION_ORDER = [18, 16, 14, 10, 13, 15, 17, 19];
const POSITION_GLYPHS: readonly NagInfo[] = POSITION_ORDER.map((code) =>
  positionNags.find((nag) => nag.code === code),
).filter((nag): nag is NagInfo => nag !== undefined);
/** The six an annotator reaches for; "only move" stays in the context menu. */
const QUALITY_GLYPHS: readonly NagInfo[] = qualityNags.filter((nag) => nag.code <= 6);

const BUTTON =
  'inline-flex h-6 min-w-[22px] shrink-0 items-center justify-center rounded-[var(--radius-control)] px-1 text-[12px] font-semibold tabular text-secondary transition-colors hover:bg-surface-3 hover:text-primary disabled:pointer-events-none disabled:opacity-35 [&>svg]:size-[13px]';

export function AnnotationBar({ inHeader = false }: { readonly inHeader?: boolean }) {
  const { tree, currentId } = useChessWorkspace();
  const toggleNag = useAnalysis((state) => state.toggleNag);
  const promote = useAnalysis((state) => state.promote);
  const truncate = useAnalysis((state) => state.truncate);
  const deleteNode = useAnalysis((state) => state.deleteNode);
  const setCommentingNodeId = useUi((state) => state.setCommentingNodeId);

  const node = tree.nodes[currentId];
  // The start position is not a move: there is nothing to judge, comment on or delete.
  const isMove = node !== undefined && currentId !== tree.rootId;
  const nags = node?.nags ?? [];
  const head = isMove ? variationHeadId(tree, currentId) : null;
  // As the context menu: a side line can move up while a line is above it.
  const canPromote = head !== null && siblings(tree, head).indexOf(head) > 0;
  const judged = POSITION_GLYPHS.find((nag) => nags.includes(nag.code));

  return (
    <div
      role="toolbar"
      aria-label="Annotate the current move"
      data-annotation-bar={inHeader ? 'header' : 'row'}
      className={cn(
        'flex shrink-0 items-center gap-px',
        inHeader ? 'min-w-0' : 'border-t border-line-subtle px-1.5 py-1',
      )}
    >
      {QUALITY_GLYPHS.map((nag) => (
        <button
          key={nag.code}
          type="button"
          title={nag.label}
          aria-label={nag.label}
          aria-pressed={nags.includes(nag.code)}
          disabled={!isMove}
          onClick={() => toggleNag(currentId, nag.code)}
          data-annotation-glyph={nag.code}
          className={cn(BUTTON, nags.includes(nag.code) && 'bg-accent-muted text-accent-ink')}
        >
          {nag.symbol}
        </button>
      ))}
      <Menu
        align="end"
        sections={[
          {
            id: 'position',
            items: POSITION_GLYPHS.map((nag) => ({
              id: `nag-${nag.code}`,
              label: `${nag.symbol}  ${nag.label}${nags.includes(nag.code) ? ' ✓' : ''}`,
              run: () => toggleNag(currentId, nag.code),
            })),
          },
        ]}
        trigger={({ toggle, open, id }) => (
          <button
            type="button"
            id={id}
            onClick={toggle}
            aria-expanded={open}
            aria-haspopup="menu"
            aria-label="Judge the position"
            title="Judge the position: +− ± ⩲ = ∞ ⩱ ∓ −+"
            disabled={!isMove}
            className={cn(BUTTON, judged && 'bg-accent-muted text-accent-ink')}
          >
            {judged?.symbol ?? '±'}
          </button>
        )}
      />
      <button
        type="button"
        title={node?.comment ? 'Edit comment' : 'Add comment'}
        aria-label={node?.comment ? 'Edit comment' : 'Add comment'}
        disabled={!isMove}
        onClick={() => setCommentingNodeId(currentId)}
        className={BUTTON}
      >
        <Pencil />
      </button>
      <Menu
        align="end"
        sections={[
          {
            id: 'edit',
            items: [
              {
                id: 'promote',
                label: 'Move variation up',
                icon: <ArrowUp />,
                disabled: !canPromote,
                run: () => promote(currentId),
              },
              {
                id: 'truncate',
                label: 'Delete everything after this move',
                icon: <Scissors />,
                disabled: !isMove || (node?.children.length ?? 0) === 0,
                run: () => truncate(currentId),
              },
              {
                id: 'delete',
                label: 'Delete from this move',
                icon: <Trash />,
                danger: true,
                disabled: !isMove,
                run: () => deleteNode(currentId),
              },
            ],
          },
        ]}
        trigger={({ toggle, open, id }) => (
          <button
            type="button"
            id={id}
            onClick={toggle}
            aria-expanded={open}
            aria-haspopup="menu"
            aria-label="Edit the move list"
            title="Move variation up, delete after, delete from here"
            disabled={!isMove}
            className={BUTTON}
          >
            <Scissors />
          </button>
        )}
      />
    </div>
  );
}
