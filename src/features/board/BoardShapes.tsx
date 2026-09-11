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
import { useId, useState } from 'react';

import type { Color } from '@/chess/types';
import { formatScore } from '@/chess/evaluation';

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
  readonly arrow: EngineArrow;
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
  const byKey = new Map<string, { arrow: EngineArrow; resolved: ResolvedArrow }[]>();
  for (const arrow of arrows) {
    const from = centre(arrow.from, orientation);
    const to = centre(arrow.to, orientation);
    const key = `${arrow.from}${arrow.to}`;
    const style = ENGINE_ARROW_STYLES[arrow.identity];
    const list = byKey.get(key) ?? [];
    list.push({
      arrow,
      resolved: {
        fromX: from.cx,
        fromY: from.cy,
        toX: to.cx,
        toY: to.cy,
        identity: arrow.identity,
        style,
        arrow,
      },
    });
    byKey.set(key, list);
  }
  const resolved: ResolvedArrow[] = [];
  for (const list of byKey.values()) {
    const head = list[0];
    if (!head) continue;
    if (list.length === 1) {
      resolved.push(head.resolved);
      continue;
    }
    const dx = head.resolved.toX - head.resolved.fromX;
    const dy = head.resolved.toY - head.resolved.fromY;
    const length = Math.hypot(dx, dy);
    const { nx, ny } = perpendicularOffset(dx, dy, length, 0.18);
    list.forEach((entry, index) => {
      const side = index === 0 ? 1 : -1;
      resolved.push({
        ...entry.resolved,
        fromX: entry.resolved.fromX + nx * side,
        fromY: entry.resolved.fromY + ny * side,
        toX: entry.resolved.toX + nx * side,
        toY: entry.resolved.toY + ny * side,
      });
    });
  }
  return resolved;
}

export function BoardShapes({ shapes, engineArrows = [], draft, orientation }: BoardShapesProps) {
  const markerPrefix = useId().replaceAll(':', '');
  const all = draft ? [...shapes, draft] : shapes;
  const resolvedEngine = resolveEngineArrows(engineArrows, orientation);
  const [hoveredArrowId, setHoveredArrowId] = useState<number | null>(null);
  const hovered = hoveredArrowId !== null ? resolvedEngine[hoveredArrowId] : null;

  return (
    <>
      {resolvedEngine.length > 0 ? (
        <svg
          viewBox="0 0 8 8"
          data-engine-arrows
          data-engine-arrow-count={resolvedEngine.length}
          className="absolute inset-0 h-full w-full"
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
              <g key={`e${index}-${arrow.identity}`}>
                {/*
                 * Visible arrow. pointer-events: none so the invisible hit
                 * test below can take the hover; otherwise the hover would
                 * be flaky in the small gap at the centre of the shaft.
                 */}
                <line
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
                  pointerEvents="none"
                  aria-hidden
                />
                {/*
                 * Invisible hit region. Thick enough to catch a small
                 * pointing device, but completely transparent. Only this
                 * group dispatches pointer events for the engine arrows.
                 */}
                <line
                  x1={arrow.fromX}
                  y1={arrow.fromY}
                  x2={arrow.toX}
                  y2={arrow.toY}
                  stroke="transparent"
                  strokeWidth={0.34}
                  strokeLinecap="round"
                  onPointerEnter={() => setHoveredArrowId(index)}
                  onPointerLeave={() =>
                    setHoveredArrowId((current) => (current === index ? null : current))
                  }
                  data-engine-arrow-hit={index}
                />
              </g>
            );
          })}
        </svg>
      ) : null}
      {/*
       * Hover tooltip. Lives outside the SVG so HTML can render the
       * move/score/depth lines without inheriting stroke conventions.
       * pointer-events: none so it never steals the cursor from the hit
       * region above.
       */}
      {hovered ? <EngineArrowTooltip arrow={hovered.arrow} /> : null}
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

/**
 * Floating tooltip for a hovered engine arrow.
 *
 * The brief is explicit: show the engine, the move, the evaluation, and the
 * depth — and keep it compact. A "PV wall" is the failure mode here; if a
 * player wants more than four lines they can open the engine panel. The
 * tooltip lives on top of the board overlay layer so its text does not
 * collide with the arrows themselves, and uses `pointer-events: none` so
 * the hover region underneath still owns the cursor.
 *
 * `aria-live="polite"` is intentional: when a player sweeps the cursor
 * across two engines' arrows, a screen reader announces the change without
 * interrupting whatever the user is currently saying.
 */
function EngineArrowTooltip({ arrow }: { readonly arrow: EngineArrow }) {
  const move = arrow.san ?? `${arrow.from}${arrow.to}`;
  const scoreText = arrow.score ? formatScore(arrow.score) : null;
  const depthText = arrow.depth !== undefined ? `d/${arrow.depth}` : null;
  return (
    <div
      role="status"
      aria-live="polite"
      data-engine-arrow-tooltip
      data-engine-name={arrow.engineName}
      className="pointer-events-none absolute left-1/2 top-1 z-30 -translate-x-1/2 rounded-md bg-overlay/95 px-2 py-1 text-[10px] leading-tight text-primary shadow"
    >
      <div className="font-semibold">{arrow.engineName}</div>
      <div className="flex gap-1.5 tabular">
        <span className="font-medium">{move}</span>
        {scoreText ? <span>{scoreText}</span> : null}
        {depthText ? <span className="text-tertiary">{depthText}</span> : null}
      </div>
    </div>
  );
}
