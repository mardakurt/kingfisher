'use client';

/**
 * Glyphs for the current move, one click away (ChessBase's notation toolbar).
 *
 * Annotating was reachable only from the move's context menu and the number
 * keys, which a player who has never right-clicked a move does not find. This
 * is one bar for the whole notation, acting on the move the board shows — not
 * buttons on every move, which is what the context menu's comment warns
 * against. Every action here is one the context menu already has.
 */

import { positionNags, qualityNags, type NagInfo } from '@/chess/annotations';
import { siblings, variationHeadId } from '@/chess/tree/tree';
import { ArrowUp, Pencil, Scissors, Trash } from '@/components/icons';
import { useChessWorkspace } from '@/features/workspace/ChessWorkspaceContext';
import { cn } from '@/lib/cn';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';

/** ChessBase's order: White's judgements first, then Black's. */
const POSITION_ORDER = [18, 16, 14, 10, 13, 15, 17, 19];
const POSITION_GLYPHS: readonly NagInfo[] = POSITION_ORDER.map((code) =>
  positionNags.find((nag) => nag.code === code)!,
).filter(Boolean);
/** The six an annotator reaches for; "only move" stays in the menu. */
const QUALITY_GLYPHS: readonly NagInfo[] = qualityNags.filter((nag) => nag.code <= 6);

function Glyph({
  nag,
  active,
  disabled,
  onClick,
}: {
  readonly nag: NagInfo;
  readonly active: boolean;
  readonly disabled: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={nag.label}
      aria-label={nag.label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      data-annotation-glyph={nag.code}
      className={cn(
        'inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-[var(--radius-control)] px-1 text-[12px] font-semibold tabular transition-colors',
        'text-secondary hover:bg-surface-3 hover:text-primary disabled:pointer-events-none disabled:opacity-35',
        active && 'bg-accent-muted text-accent-ink',
      )}
    >
      {nag.symbol}
    </button>
  );
}

function Action({
  label,
  disabled,
  danger,
  onClick,
  children,
}: {
  readonly label: string;
  readonly disabled?: boolean;
  readonly danger?: boolean;
  readonly onClick: () => void;
  readonly children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex size-6 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-secondary transition-colors hover:bg-surface-3 hover:text-primary disabled:pointer-events-none disabled:opacity-35 [&>svg]:size-[14px]',
        danger && 'hover:text-negative',
      )}
    >
      {children}
    </button>
  );
}

const Divider = () => <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-line-subtle" />;

export function AnnotationBar() {
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

  return (
    <div
      role="toolbar"
      aria-label="Annotate the current move"
      data-annotation-bar
      className="flex shrink-0 flex-wrap items-center gap-0.5 border-t border-line-subtle px-1.5 py-1"
    >
      {QUALITY_GLYPHS.map((nag) => (
        <Glyph
          key={nag.code}
          nag={nag}
          active={nags.includes(nag.code)}
          disabled={!isMove}
          onClick={() => toggleNag(currentId, nag.code)}
        />
      ))}
      <Divider />
      {POSITION_GLYPHS.map((nag) => (
        <Glyph
          key={nag.code}
          nag={nag}
          active={nags.includes(nag.code)}
          disabled={!isMove}
          onClick={() => toggleNag(currentId, nag.code)}
        />
      ))}
      <Divider />
      <Action
        label={node?.comment ? 'Edit comment' : 'Add comment'}
        disabled={!isMove}
        onClick={() => setCommentingNodeId(currentId)}
      >
        <Pencil />
      </Action>
      <Action label="Move variation up" disabled={!canPromote} onClick={() => promote(currentId)}>
        <ArrowUp />
      </Action>
      <Action
        label="Delete everything after this move"
        disabled={!isMove || (node?.children.length ?? 0) === 0}
        onClick={() => truncate(currentId)}
      >
        <Scissors />
      </Action>
      <Action
        label="Delete from this move"
        danger
        disabled={!isMove}
        onClick={() => deleteNode(currentId)}
      >
        <Trash />
      </Action>
    </div>
  );
}
