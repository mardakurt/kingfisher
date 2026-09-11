/**
 * Arrows and square highlights.
 *
 * Two rendering layers, stacked intentionally:
 *
 *   1. engine arrows (this file's first SVG) — drawn under the user's
 *      annotations so the engine's opinion is visible without overwriting
 *      marks the user has chosen;
 *   2. user shapes and the active draft — drawn over the engine arrows, so
 *      manual annotations remain visually authoritative (PART AE).
 *
 * Drawn in board coordinates (0–8 on both axes) so the overlay scales with
 * the board and needs no pixel measurements.
 */

import type { Shape } from '@/chess/annotations';
import { useId } from 'react';

import type { Color } from '@/chess/types';

import { ENGINE_ARROW_STYLES, type EngineArrow, type EngineArrowIdentity } from './engine-arrows';
import { squareOffset } from './layout';

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
  readonly engineArrows?: readonly EngineArrow[];
  readonly draft?: Shape | null;
  readonly orientation: Color;
}

const centre = (square: Parameters<typeof squareOffset>[0], orientation: Color) => {
  const { x, y } = squareOffset(square, orientation);
  return { cx: x / 100 + 0.5, cy: y / 100 + 0.5 };
};

/**
 * Perpendicular offset, in board-coordinate units, used to nudge an agreeing
 * engine arrow off its twin so the renderer can tell "two engines" from
 * "one slightly thick arrow".
 */
const perpendicularOffset = (dx: number, dy: number, length: number, distance: number) => {
  if (length < 0.01) return { nx: 0, ny: 0 };
  return { nx: (-dy / length) * distance, ny: (dx / length) * distance };
};

interface ResolvedArrow {
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
  readonly identity: EngineArrowIdentity;
  readonly style: (typeof ENGINE_ARROW_STYLES)[EngineArrowIdentity];
}

/**
 * Lay out engine arrows for rendering.
 *
 * Two engines recommending the same move get parallel offsets so both are
 * visible (PART X); otherwise each sits on the centre of the segment it
 * represents. The offsets are perpendicular to the move direction, so the
 * arrows never collide with the head of the other engine's recommendation on
 * a different move.
 */
function resolveEngineArrows(
  arrows: readonly EngineArrow[],
  orientation: Color,
): readonly ResolvedArrow[] {
  const byKey = new Map<string, ResolvedArrow[]>();
  for (const arrow of arrows) {
    const from = centre(arrow.from, orientation);
    const to = centre(arrow.to, orientation);
    const key = `${arrow.from}${arrow.to}`;
    const style = ENGINE_ARROW_STYLES[arrow.identity];
    const list = byKey.get(key) ?? [];
    list.push({
      fromX: from.cx,
      fromY: from.cy,
      toX: to.cx,
      toY: to.cy,
      identity: arrow.identity,
      style,
    });
    byKey.set(key, list);
  }
  const resolved: ResolvedArrow[] = [];
  for (const list of byKey.values()) {
    const head = list[0];
    if (!head) continue;
    if (list.length === 1) {
      resolved.push(head);
      continue;
    }
    const dx = head.toX - head.fromX;
    const dy = head.toY - head.fromY;
    const length = Math.hypot(dx, dy);
    const { nx, ny } = perpendicularOffset(dx, dy, length, 0.18);
    list.forEach((arrow, index) => {
      const side = index === 0 ? 1 : -1;
      resolved.push({
        ...arrow,
        fromX: arrow.fromX + nx * side,
        fromY: arrow.fromY + ny * side,
        toX: arrow.toX + nx * side,
        toY: arrow.toY + ny * side,
      });
    });
  }
  return resolved;
}

export function BoardShapes({ shapes, engineArrows = [], draft, orientation }: BoardShapesProps) {
  const markerPrefix = useId().replaceAll(':', '');
  const all = draft ? [...shapes, draft] : shapes;
  const resolvedEngine = resolveEngineArrows(engineArrows, orientation);

  return (
    <>
      {resolvedEngine.length > 0 ? (
        <svg
          viewBox="0 0 8 8"
          data-engine-arrows
          data-engine-arrow-count={resolvedEngine.length}
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden
        >
          <defs>
            {(Object.keys(ENGINE_ARROW_STYLES) as EngineArrowIdentity[]).map((identity) => (
              <marker
                key={identity}
                id={`${markerPrefix}-engine-${identity}`}
                viewBox="0 0 10 10"
                refX="6.2"
                refY="5"
                markerWidth="3.2"
                markerHeight="3.2"
                orient="auto-start-reverse"
              >
                <path d="M0 1.4 L8.4 5 L0 8.6 Z" fill={ENGINE_ARROW_STYLES[identity].color} />
              </marker>
            ))}
          </defs>
          {resolvedEngine.map((arrow, index) => {
            const dx = arrow.toX - arrow.fromX;
            const dy = arrow.toY - arrow.fromY;
            const length = Math.hypot(dx, dy);
            if (length < 0.01) return null;
            const unitX = dx / length;
            const unitY = dy / length;
            const startX = arrow.fromX + unitX * 0.32;
            const startY = arrow.fromY + unitY * 0.32;
            const endX = arrow.toX - unitX * 0.28;
            const endY = arrow.toY - unitY * 0.28;
            return (
              <line
                key={`e${index}-${arrow.identity}`}
                x1={startX}
                y1={startY}
                x2={endX}
                y2={endY}
                stroke={arrow.style.color}
                strokeWidth={0.13}
                strokeLinecap="round"
                opacity={0.92}
                strokeDasharray={arrow.style.dashArray ?? undefined}
                markerEnd={`url(#${markerPrefix}-engine-${arrow.identity})`}
              />
            );
          })}
        </svg>
      ) : null}
      {all.length === 0 ? null : (
        <svg
          viewBox="0 0 8 8"
          data-board-shapes
          data-shape-count={shapes.length}
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
      )}
    </>
  );
}
