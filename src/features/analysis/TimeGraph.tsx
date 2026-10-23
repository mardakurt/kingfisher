'use client';

/**
 * Where the time went, move by move, beside where the evaluation went.
 *
 * One column per ply of the main line, on the same scale as the evaluation
 * graph above it, so a long think and the swing that followed it line up:
 * White's thinks rise from the middle, Black's fall from it. Heights are the
 * square root of the seconds, so one five-minute think does not flatten
 * every ten-second move into nothing. A move the clocks cannot time is left
 * blank, as an unevaluated ply is above.
 *
 * Drawn only for a game whose moves carry clock commands; a game without
 * them has no time to show, and the strip is absent rather than empty.
 */

import { useMemo } from 'react';

import type { GameTree, NodeId } from '@/chess/tree/types';
import { colorOfPly, moveNumberOfPly } from '@/chess/tree/types';
import { cn } from '@/lib/cn';
import { formatThink, mainlineThinkTimes } from '@/round/clock';

const HEIGHT = 32;
/** The evaluation graph's minimum scale, so the two strips' columns align. */
const MIN_PLIES = 40;

export function TimeGraph({
  tree,
  currentId,
  onSelect,
  className,
}: {
  readonly tree: GameTree;
  readonly currentId: NodeId;
  readonly onSelect: (nodeId: NodeId) => void;
  readonly className?: string;
}) {
  const columns = useMemo(
    () =>
      mainlineThinkTimes(tree).map((entry) => {
        const node = tree.nodes[entry.nodeId];
        return { ...entry, ply: node?.ply ?? 0, san: node?.move?.san ?? '' };
      }),
    [tree],
  );
  const timed = columns.filter((column) => column.seconds !== null);
  if (timed.length === 0) return null;

  const width = Math.max(columns.length, MIN_PLIES);
  const longest = timed.reduce((best, column) =>
    (column.seconds ?? 0) > (best.seconds ?? 0) ? column : best,
  );
  const scale = Math.sqrt(Math.max(1, longest.seconds ?? 1));
  const currentIndex = columns.findIndex((column) => column.nodeId === currentId);
  const moveLabel = (ply: number, san: string) =>
    `${moveNumberOfPly(ply)}${colorOfPly(ply) === 'w' ? '.' : '…'} ${san}`;

  return (
    <figure data-time-graph className={cn('min-w-0', className)}>
      <figcaption className="mb-0.5 flex items-baseline justify-between px-0.5">
        <span className="text-[10px] font-semibold text-tertiary">Time per move</span>
        <span className="text-[10px] text-tertiary tabular" data-time-graph-longest>
          longest {formatThink(longest.seconds ?? 0)} on {moveLabel(longest.ply, longest.san)}
        </span>
      </figcaption>
      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Time spent on ${timed.length} of ${columns.length} plies; the longest was ${formatThink(longest.seconds ?? 0)} on ${moveLabel(longest.ply, longest.san)}`}
          className="block h-8 w-full rounded-[var(--radius-control)] border border-line-subtle bg-eval-track"
        >
          {columns.map((column, index) => {
            if (column.seconds === null) return null;
            const magnitude = (Math.sqrt(column.seconds) / scale) * (HEIGHT / 2);
            const white = colorOfPly(column.ply) === 'w';
            return (
              <rect
                key={column.nodeId}
                x={index + 0.08}
                y={white ? HEIGHT / 2 - magnitude : HEIGHT / 2}
                width={0.84}
                height={Math.max(magnitude, 0.5)}
                className={white ? 'fill-eval-white' : 'fill-eval-black'}
              />
            );
          })}
          <line
            x1={0}
            y1={HEIGHT / 2}
            x2={width}
            y2={HEIGHT / 2}
            stroke="var(--eval-midline)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
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
          Pointer targets over the drawing, whose scaled shapes are none. The
          keyboard's way to a move is the notation and the evaluation graph's
          own row, so these stay out of the tab order and the reading order.
        */}
        <div className="absolute inset-0 flex" aria-hidden>
          {columns.map((column) => (
            <button
              key={column.nodeId}
              type="button"
              onClick={() => onSelect(column.nodeId)}
              style={{ width: `${(100 / width).toFixed(4)}%` }}
              title={`${moveLabel(column.ply, column.san)} — ${
                column.seconds === null ? 'not timed' : formatThink(column.seconds)
              }`}
              tabIndex={-1}
              className="h-full min-w-0 shrink-0 hover:bg-surface-3/40"
            />
          ))}
        </div>
      </div>
    </figure>
  );
}
