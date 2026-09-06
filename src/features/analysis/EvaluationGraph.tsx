'use client';

/**
 * The shape of the game, from evaluations that actually exist.
 *
 * Every bar stands for one stored engine snapshot. Plies with no snapshot are
 * left blank rather than interpolated: a smooth curve drawn through two known
 * points implies the engine said something about the moves between them, and it
 * did not. Sparse analysis should look sparse.
 *
 * Height is winning chances, not centipawns. The difference between +0.2 and
 * +0.5 matters far more than the difference between +6.0 and +6.3, and a raw
 * centipawn axis makes every decided game look identical.
 */

import { useMemo } from 'react';

import { formatScore, winningChances } from '@/chess/evaluation';
import { mainlinePath } from '@/chess/tree/tree';
import type { GameTree, NodeId } from '@/chess/tree/types';
import { moveNumberOfPly } from '@/chess/tree/types';
import { cn } from '@/lib/cn';

interface EvaluationGraphProps {
  readonly tree: GameTree;
  readonly currentId: NodeId;
  readonly onSelect: (nodeId: NodeId) => void;
  readonly className?: string;
}

interface Column {
  readonly nodeId: NodeId;
  readonly ply: number;
  /** −1 (Black winning) to +1 (White winning), or null when unevaluated. */
  readonly advantage: number | null;
  readonly label: string | null;
}

const HEIGHT = 40;

export function EvaluationGraph({ tree, currentId, onSelect, className }: EvaluationGraphProps) {
  const columns = useMemo<Column[]>(() => {
    const path = mainlinePath(tree).slice(1);
    return path.map((nodeId) => {
      const node = tree.nodes[nodeId];
      const score = node?.evaluation?.score;
      return {
        nodeId,
        ply: node?.ply ?? 0,
        advantage: score ? winningChances(score) * 2 - 1 : null,
        label: score ? formatScore(score) : null,
      };
    });
  }, [tree]);

  const evaluated = columns.filter((column) => column.advantage !== null).length;
  if (columns.length === 0 || evaluated === 0) return null;

  const width = Math.max(columns.length, 1);
  const currentIndex = columns.findIndex((column) => column.nodeId === currentId);

  return (
    <figure data-evaluation-graph className={cn('min-w-0', className)}>
      <svg
        viewBox={`0 0 ${width} ${HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Evaluation over ${columns.length} moves, ${evaluated} of them analysed`}
        className="block h-9 w-full rounded-[3px] bg-surface-inset"
      >
        {columns.map((column, index) => {
          if (column.advantage === null) return null;
          // Positive advantage is White's, drawn upward from the mid-line.
          const magnitude = (Math.abs(column.advantage) * HEIGHT) / 2;
          const y = column.advantage >= 0 ? HEIGHT / 2 - magnitude : HEIGHT / 2;
          return (
            <rect
              key={column.nodeId}
              x={index}
              y={y}
              width={1}
              height={Math.max(magnitude, 0.6)}
              className={column.advantage >= 0 ? 'fill-eval-white' : 'fill-eval-black'}
              opacity={0.85}
            />
          );
        })}

        <line
          x1={0}
          y1={HEIGHT / 2}
          x2={width}
          y2={HEIGHT / 2}
          stroke="var(--line-strong)"
          strokeWidth={0.5}
          vectorEffect="non-scaling-stroke"
        />

        {/*
          A non-scaling line rather than a filled column: with four moves on
          screen a column is a third of the graph, which reads as a block of
          colour instead of a cursor.
        */}
        {currentIndex >= 0 && (
          <line
            x1={currentIndex + 0.5}
            y1={0}
            x2={currentIndex + 0.5}
            y2={HEIGHT}
            stroke="var(--accent)"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      {/*
        The clickable layer is separate from the drawing: an SVG scaled with
        `preserveAspectRatio="none"` has unusable hit targets, and a row of real
        buttons is keyboard-navigable and screen-reader-legible for free.
      */}
      <div className="mt-px flex h-3 w-full" role="group" aria-label="Jump to a move">
        {columns.map((column) => (
          <button
            key={column.nodeId}
            type="button"
            onClick={() => onSelect(column.nodeId)}
            title={
              column.label
                ? `${moveNumberOfPly(column.ply)}${column.ply % 2 === 1 ? '.' : '…'} ${column.label}`
                : `Move ${moveNumberOfPly(column.ply)}`
            }
            aria-label={`Go to move ${moveNumberOfPly(column.ply)}`}
            className={cn(
              'h-full min-w-0 flex-1 rounded-[1px] transition-colors',
              column.nodeId === currentId ? 'bg-accent/60' : 'hover:bg-surface-3',
            )}
          />
        ))}
      </div>
    </figure>
  );
}
