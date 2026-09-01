/**
 * Arrows and square highlights.
 *
 * Drawn in board coordinates (0–8 on both axes) so the overlay scales with the
 * board and needs no pixel measurements.
 */

import type { Shape } from '@/chess/annotations';
import { useId } from 'react';

import { squareOffset } from './layout';
import type { Color } from '@/chess/types';

/**
 * Brushes resolve through CSS custom properties, so switching the palette is a
 * change of four variables on the root rather than a re-render of every shape.
 * The brush *names* stay green/red/blue/yellow whatever the palette paints
 * them, because those names are what PGN `[%cal]` and `[%csl]` round-trip.
 */
const BRUSH_COLOR = {
  green: 'var(--shape-green)',
  red: 'var(--shape-red)',
  blue: 'var(--shape-blue)',
  yellow: 'var(--shape-yellow)',
} as const;

interface BoardShapesProps {
  readonly shapes: readonly Shape[];
  readonly draft?: Shape | null;
  readonly orientation: Color;
}

const centre = (square: Parameters<typeof squareOffset>[0], orientation: Color) => {
  const { x, y } = squareOffset(square, orientation);
  return { cx: x / 100 + 0.5, cy: y / 100 + 0.5 };
};

export function BoardShapes({ shapes, draft, orientation }: BoardShapesProps) {
  const markerPrefix = useId().replaceAll(':', '');
  const all = draft ? [...shapes, draft] : shapes;
  if (all.length === 0) return null;

  return (
    <svg
      viewBox="0 0 8 8"
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden
    >
      <defs>
        {(['green', 'red', 'blue', 'yellow'] as const).map((brush) => (
          <marker
            key={brush}
            id={`${markerPrefix}-arrowhead-${brush}`}
            viewBox="0 0 10 10"
            refX="6.2"
            refY="5"
            markerWidth="3.2"
            markerHeight="3.2"
            orient="auto-start-reverse"
          >
            <path d="M0 1.4 L8.4 5 L0 8.6 Z" fill={BRUSH_COLOR[brush]} />
          </marker>
        ))}
      </defs>

      {all.map((shape, index) => {
        if (shape.kind === 'square') {
          const { cx, cy } = centre(shape.square, orientation);
          return (
            <rect
              key={`s${index}-${shape.square}`}
              x={cx - 0.46}
              y={cy - 0.46}
              width={0.92}
              height={0.92}
              rx={0.06}
              fill="none"
              stroke={BRUSH_COLOR[shape.brush]}
              strokeWidth={0.1}
              opacity={0.85}
            />
          );
        }

        const from = centre(shape.from, orientation);
        const to = centre(shape.to, orientation);
        const dx = to.cx - from.cx;
        const dy = to.cy - from.cy;
        const length = Math.hypot(dx, dy);
        if (length < 0.01) return null;

        // Pull the tail off the origin piece and stop short of the target centre.
        const unitX = dx / length;
        const unitY = dy / length;
        const startX = from.cx + unitX * 0.32;
        const startY = from.cy + unitY * 0.32;
        const endX = to.cx - unitX * 0.28;
        const endY = to.cy - unitY * 0.28;

        return (
          <line
            key={`a${index}-${shape.from}${shape.to}`}
            x1={startX}
            y1={startY}
            x2={endX}
            y2={endY}
            stroke={BRUSH_COLOR[shape.brush]}
            strokeWidth={0.13}
            strokeLinecap="round"
            opacity={0.88}
            markerEnd={`url(#${markerPrefix}-arrowhead-${shape.brush})`}
          />
        );
      })}
    </svg>
  );
}
