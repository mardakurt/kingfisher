'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { nagInfo, nagSymbol } from '@/chess/annotations';
import { formatScore } from '@/chess/evaluation';
import type { GameTree, MoveNode, NodeId } from '@/chess/tree/types';
import { moveNumberOfPly } from '@/chess/tree/types';
import { cn } from '@/lib/cn';
import { flattenMoveTree, type MoveTreeRow } from './flatten';

const VIRTUALIZE_AT = 2_000;
const ESTIMATED_ROW_HEIGHT = 34;
const OVERSCAN_PX = 500;

interface MoveTreeProps {
  readonly tree: GameTree;
  readonly currentId: NodeId;
  readonly onSelect: (nodeId: NodeId) => void;
  readonly onContextMenu?: (nodeId: NodeId, event: React.MouseEvent) => void;
  readonly onEditComment?: (nodeId: NodeId) => void;
  readonly showEvaluations?: boolean;
}

/**
 * The notation window.
 *
 * Rendering mirrors how a game is written down rather than how it is stored: a
 * flowing main line, side lines nested and indented beneath the move they
 * answer, comments in place. The recursion follows the same shape as the PGN
 * serialiser, which is what keeps the two consistent.
 */
export function MoveTree({
  tree,
  currentId,
  onSelect,
  onContextMenu,
  onEditComment,
  showEvaluations = true,
}: MoveTreeProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep the cursor in view when navigating with the keyboard.
  useEffect(() => {
    const element = containerRef.current?.querySelector<HTMLElement>('[data-current="true"]');
    element?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }, [currentId]);

  const root = tree.nodes[tree.rootId];
  const empty = !root || root.children.length === 0;
  const virtualized = Object.keys(tree.nodes).length > VIRTUALIZE_AT;

  return (
    <div
      ref={containerRef}
      className="h-full overflow-y-auto px-2.5 py-2 text-[12.5px] leading-[1.75]"
    >
      {root?.comment && (
        <p
          className="mb-1.5 whitespace-pre-wrap border-l-2 border-line pl-2 text-2xs italic leading-relaxed text-secondary"
          onDoubleClick={() => onEditComment?.(tree.rootId)}
        >
          {root.comment}
        </p>
      )}

      {empty ? (
        <p className="px-1 py-6 text-center text-2xs text-tertiary">
          No moves yet. Play on the board, paste a PGN, or take a move from the explorer.
        </p>
      ) : virtualized ? (
        <VirtualMoveTree
          tree={tree}
          currentId={currentId}
          onSelect={onSelect}
          onContextMenu={onContextMenu}
          onEditComment={onEditComment}
          showEvaluations={showEvaluations}
        />
      ) : (
        <div className="[overflow-wrap:anywhere]">
          <LineContent
            tree={tree}
            parentId={tree.rootId}
            depth={0}
            forceNumber
            currentId={currentId}
            onSelect={onSelect}
            onContextMenu={onContextMenu}
            onEditComment={onEditComment}
            showEvaluations={showEvaluations}
          />
        </div>
      )}

      {tree.headers.Result && tree.headers.Result !== '*' && !empty && (
        <span className="ml-1 text-xs font-medium text-secondary tabular">
          {tree.headers.Result}
        </span>
      )}
    </div>
  );
}

function VirtualMoveTree({
  tree,
  currentId,
  onSelect,
  onContextMenu,
  onEditComment,
  showEvaluations,
}: MoveTreeProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [sizes, setSizes] = useState<ReadonlyMap<NodeId, number>>(() => new Map());
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  const rows = useMemo(() => flattenMoveTree(tree), [tree]);
  const layout = useMemo(() => {
    const offsets = new Array<number>(rows.length);
    let total = 0;
    for (let index = 0; index < rows.length; index += 1) {
      offsets[index] = total;
      total += sizes.get(rows[index]!.id) ?? ESTIMATED_ROW_HEIGHT;
    }
    return { offsets, total };
  }, [rows, sizes]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const update = () => setViewportHeight(viewport.clientHeight || 600);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const index = rows.findIndex((row) => row.id === currentId);
    const viewport = viewportRef.current;
    if (index < 0 || !viewport) return;
    const top = layout.offsets[index] ?? 0;
    const bottom = top + (sizes.get(currentId) ?? ESTIMATED_ROW_HEIGHT);
    if (top < viewport.scrollTop) viewport.scrollTop = top;
    else if (bottom > viewport.scrollTop + viewport.clientHeight) {
      viewport.scrollTop = Math.max(0, bottom - viewport.clientHeight);
    }
  }, [currentId, layout.offsets, rows, sizes]);

  const measured = useCallback((id: NodeId, height: number) => {
    setSizes((current) => {
      const previous = current.get(id) ?? ESTIMATED_ROW_HEIGHT;
      if (Math.abs(previous - height) < 1) return current;
      const next = new Map(current);
      next.set(id, height);
      return next;
    });
  }, []);

  const first = Math.max(0, lowerBound(layout.offsets, scrollTop - OVERSCAN_PX) - 1);
  const last = Math.min(
    rows.length,
    lowerBound(layout.offsets, scrollTop + viewportHeight + OVERSCAN_PX) + 1,
  );

  return (
    <div
      ref={viewportRef}
      data-virtualized-move-tree="true"
      className="h-full overflow-y-auto"
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div className="relative" style={{ height: layout.total }}>
        {rows.slice(first, last).map((row, visibleIndex) => {
          const index = first + visibleIndex;
          return (
            <VirtualRow
              key={row.id}
              row={row}
              index={index}
              total={rows.length}
              top={layout.offsets[index] ?? 0}
              current={row.id === currentId}
              onMeasure={measured}
              onSelect={onSelect}
              onContextMenu={onContextMenu}
              onEditComment={onEditComment}
              showEvaluation={Boolean(showEvaluations) && row.depth === 0}
            />
          );
        })}
      </div>
    </div>
  );
}

function VirtualRow({
  row,
  index,
  total,
  top,
  current,
  onMeasure,
  onSelect,
  onContextMenu,
  onEditComment,
  showEvaluation,
}: {
  readonly row: MoveTreeRow;
  readonly index: number;
  readonly total: number;
  readonly top: number;
  readonly current: boolean;
  readonly onMeasure: (id: NodeId, height: number) => void;
  readonly onSelect: (nodeId: NodeId) => void;
  readonly onContextMenu?: (nodeId: NodeId, event: React.MouseEvent) => void;
  readonly onEditComment?: (nodeId: NodeId) => void;
  readonly showEvaluation: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const report = () => onMeasure(row.id, element.getBoundingClientRect().height);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(element);
    return () => observer.disconnect();
  }, [onMeasure, row.id]);

  return (
    <div
      ref={ref}
      role="listitem"
      aria-posinset={index + 1}
      aria-setsize={total}
      className={cn(
        'absolute right-0 left-0 min-h-[34px] border-b border-line-subtle/60 py-1 pr-1',
        row.depth > 0 && 'border-l border-l-line-strong',
      )}
      style={{ transform: `translateY(${top}px)`, paddingLeft: 4 + Math.min(row.depth, 12) * 10 }}
    >
      {row.startsVariation ? (
        <span className="mr-1 text-[9px] uppercase tracking-wide text-tertiary">
          Variation {row.depth}
        </span>
      ) : null}
      {row.node.preComment ? <CommentToken text={row.node.preComment} /> : null}
      <MoveToken
        node={row.node}
        depth={row.depth}
        forceNumber={row.forceNumber}
        current={current}
        onSelect={onSelect}
        onContextMenu={onContextMenu}
        showEvaluation={showEvaluation}
      />
      {row.node.comment ? (
        <CommentToken
          text={row.node.comment}
          onEdit={onEditComment ? () => onEditComment(row.id) : undefined}
        />
      ) : null}
    </div>
  );
}

function lowerBound(values: readonly number[], target: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((values[middle] ?? 0) < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

interface LineProps {
  readonly tree: GameTree;
  readonly parentId: NodeId;
  readonly depth: number;
  readonly forceNumber: boolean;
  readonly currentId: NodeId;
  readonly onSelect: (nodeId: NodeId) => void;
  readonly onContextMenu?: (nodeId: NodeId, event: React.MouseEvent) => void;
  readonly onEditComment?: (nodeId: NodeId) => void;
  readonly showEvaluations: boolean;
}

/** Walks one line, emitting its side lines where they branch off. */
function LineContent(props: LineProps): ReactNode {
  const { tree, depth, currentId, onSelect, onContextMenu, onEditComment, showEvaluations } = props;
  const output: ReactNode[] = [];

  let parent: MoveNode | undefined = tree.nodes[props.parentId];
  let forceNumber = props.forceNumber;

  while (parent && parent.children.length > 0) {
    const mainId = parent.children[0] as NodeId;
    const main = tree.nodes[mainId];
    if (!main) break;

    output.push(
      <MoveToken
        key={mainId}
        node={main}
        depth={depth}
        forceNumber={forceNumber}
        current={mainId === currentId}
        onSelect={onSelect}
        onContextMenu={onContextMenu}
        showEvaluation={showEvaluations && depth === 0}
      />,
    );

    if (main.comment) {
      output.push(
        <CommentToken
          key={`${mainId}-c`}
          text={main.comment}
          onEdit={onEditComment ? () => onEditComment(mainId) : undefined}
        />,
      );
    }

    const alternatives = parent.children.slice(1);
    for (const altId of alternatives) {
      const alt = tree.nodes[altId];
      if (!alt) continue;
      output.push(
        <Variation key={`${altId}-v`} depth={depth + 1}>
          {alt.preComment && <CommentToken text={alt.preComment} />}
          <MoveToken
            node={alt}
            depth={depth + 1}
            forceNumber
            current={altId === currentId}
            onSelect={onSelect}
            onContextMenu={onContextMenu}
            showEvaluation={false}
          />
          {alt.comment && (
            <CommentToken
              text={alt.comment}
              onEdit={onEditComment ? () => onEditComment(altId) : undefined}
            />
          )}
          <LineContent
            {...props}
            parentId={altId}
            depth={depth + 1}
            forceNumber={Boolean(alt.comment)}
          />
        </Variation>,
      );
    }

    forceNumber = alternatives.length > 0 || Boolean(main.comment);
    parent = main;
  }

  return <>{output}</>;
}

interface MoveTokenProps {
  readonly node: MoveNode;
  readonly depth: number;
  readonly forceNumber: boolean;
  readonly current: boolean;
  readonly onSelect: (nodeId: NodeId) => void;
  readonly onContextMenu?: (nodeId: NodeId, event: React.MouseEvent) => void;
  readonly showEvaluation: boolean;
}

function MoveToken({
  node,
  depth,
  forceNumber,
  current,
  onSelect,
  onContextMenu,
  showEvaluation,
}: MoveTokenProps) {
  const move = node.move;
  if (!move) return null;

  const isWhite = node.ply % 2 === 1;
  const number = moveNumberOfPly(node.ply);
  const quality = node.nags.find((code) => nagInfo(code)?.group === 'quality');
  const judgement = node.nags.find((code) => nagInfo(code)?.group === 'position');

  return (
    <Fragment>
      {(isWhite || forceNumber) && (
        <span className="mr-0.5 select-none text-tertiary tabular">
          {number}
          {isWhite ? '.' : '…'}
        </span>
      )}
      <button
        type="button"
        data-current={current}
        onClick={() => onSelect(node.id)}
        onContextMenu={(event) => {
          event.preventDefault();
          onContextMenu?.(node.id, event);
        }}
        title={node.comment}
        className={cn(
          'mr-1 rounded-[3px] px-1 py-px transition-colors',
          depth === 0 ? 'font-medium' : 'text-secondary',
          current ? 'bg-accent text-accent-contrast' : 'hover:bg-surface-3 hover:text-primary',
          quality === 3 && !current && 'text-info',
          (quality === 4 || quality === 2) && !current && 'text-negative',
        )}
      >
        {move.san}
        {quality !== undefined && <span className="ml-px font-semibold">{nagSymbol(quality)}</span>}
        {judgement !== undefined && (
          <span className="ml-0.5 opacity-80">{nagSymbol(judgement)}</span>
        )}
      </button>
      {node.shapes.length > 0 && (
        <span
          aria-hidden
          title={`${node.shapes.length} arrow(s) or highlight(s) on this move`}
          className="mr-1 select-none text-[10px] text-accent/70"
        >
          ◆
        </span>
      )}
      {showEvaluation && node.evaluation && (
        <span
          className={cn(
            'mr-1 select-none text-[10.5px] tabular',
            node.evaluation.score.kind === 'mate'
              ? 'text-negative'
              : node.evaluation.score.cp >= 0
                ? 'text-secondary'
                : 'text-tertiary',
          )}
        >
          {formatScore(node.evaluation.score)}
        </span>
      )}
    </Fragment>
  );
}

/** Comments read as prose inside the notation, and open for editing on click. */
const CommentToken = ({ text, onEdit }: { text: string; onEdit?: (() => void) | undefined }) =>
  onEdit ? (
    <button
      type="button"
      onClick={onEdit}
      title="Edit this comment"
      className="mr-1 whitespace-pre-wrap rounded-[3px] text-left text-[11.5px] italic text-secondary transition-colors hover:bg-surface-3 hover:text-primary"
    >
      {text}
    </button>
  ) : (
    <span className="mr-1 whitespace-pre-wrap text-[11.5px] italic text-secondary">{text}</span>
  );

const Variation = ({ depth, children }: { depth: number; children: ReactNode }) => (
  <div
    className={cn(
      'my-1 border-l pl-2 text-[12px]',
      depth === 1 ? 'border-line-strong' : 'border-line-subtle',
    )}
    style={{ marginLeft: depth > 1 ? (depth - 1) * 6 : 0 }}
  >
    {children}
  </div>
);
