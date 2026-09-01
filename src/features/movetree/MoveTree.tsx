'use client';

import { Fragment, useEffect, useRef, type ReactNode } from 'react';

import { nagInfo, nagSymbol } from '@/chess/annotations';
import { formatScore } from '@/chess/evaluation';
import type { GameTree, MoveNode, NodeId } from '@/chess/tree/types';
import { moveNumberOfPly } from '@/chess/tree/types';
import { cn } from '@/lib/cn';

interface MoveTreeProps {
  readonly tree: GameTree;
  readonly currentId: NodeId;
  readonly onSelect: (nodeId: NodeId) => void;
  readonly onContextMenu?: (nodeId: NodeId, event: React.MouseEvent) => void;
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

  return (
    <div
      ref={containerRef}
      className="h-full overflow-y-auto px-2.5 py-2 text-[12.5px] leading-[1.75]"
    >
      {root?.comment && (
        <p className="mb-1.5 border-l-2 border-line pl-2 text-2xs italic leading-relaxed text-secondary">
          {root.comment}
        </p>
      )}

      {empty ? (
        <p className="px-1 py-6 text-center text-2xs text-tertiary">
          No moves yet. Play on the board, paste a PGN, or take a move from the explorer.
        </p>
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

interface LineProps {
  readonly tree: GameTree;
  readonly parentId: NodeId;
  readonly depth: number;
  readonly forceNumber: boolean;
  readonly currentId: NodeId;
  readonly onSelect: (nodeId: NodeId) => void;
  readonly onContextMenu?: (nodeId: NodeId, event: React.MouseEvent) => void;
  readonly showEvaluations: boolean;
}

/** Walks one line, emitting its side lines where they branch off. */
function LineContent(props: LineProps): ReactNode {
  const { tree, depth, currentId, onSelect, onContextMenu, showEvaluations } = props;
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
      output.push(<CommentToken key={`${mainId}-c`} text={main.comment} depth={depth} />);
    }

    const alternatives = parent.children.slice(1);
    for (const altId of alternatives) {
      const alt = tree.nodes[altId];
      if (!alt) continue;
      output.push(
        <Variation key={`${altId}-v`} depth={depth + 1}>
          {alt.preComment && <CommentToken text={alt.preComment} depth={depth + 1} inline />}
          <MoveToken
            node={alt}
            depth={depth + 1}
            forceNumber
            current={altId === currentId}
            onSelect={onSelect}
            onContextMenu={onContextMenu}
            showEvaluation={false}
          />
          {alt.comment && <CommentToken text={alt.comment} depth={depth + 1} inline />}
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

const CommentToken = ({ text }: { text: string; depth?: number; inline?: boolean }) => (
  <span className="mr-1 text-[11.5px] italic text-secondary">{text}</span>
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
