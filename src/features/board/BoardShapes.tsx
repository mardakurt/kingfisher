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
import { useMemo, useRef } from 'react';

import { arrowGeometry, USER_ARROW, userArrowPoints } from './arrow-shape';

import type { Color } from '@/chess/types';

import { ENGINE_ARROW_STYLES, type EngineArrow, type EngineArrowIdentity } from './engine-arrows';
import type { ReferenceArrow } from './reference-arrows';
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
  /** The Explorer's moves: a muted layer under the engine's. */
  readonly referenceArrows?: readonly ReferenceArrow[];
  readonly draft?: Shape | null;
  readonly orientation: Color;
  /**
   * A piece is selected or being dragged. The engine layer fades so the
   * person's own move is what the board is about, and no arrow is hovered.
   */
  readonly movingPiece?: boolean;
}

const centre = (square: Parameters<typeof squareOffset>[0], orientation: Color) => {
  const { x, y } = squareOffset(square, orientation);
  return { cx: x / 100 + 0.5, cy: y / 100 + 0.5 };
};

/** Engine identity styling; geometry comes from arrow-shape.ts. */
const ENGINE_ARROW = {
  opacity: 0.82,
  /** The dashed core drawn down a shared (agreed) arrow, and its dashes. */
  coreWidth: 0.045,
  coreDash: '0.2 0.14',
  /** Engine B's dashed shaft. */
  dash: '0.26 0.16',
} as const;

interface ResolvedArrow {
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
  /** The identity that paints the shaft and head. */
  readonly identity: EngineArrowIdentity;
  readonly style: (typeof ENGINE_ARROW_STYLES)[EngineArrowIdentity];
  /** 1 for a best move; the MultiPV rank for a variation arrow. */
  readonly rank: number;
  /**
   * Every engine this arrow stands for. One entry normally; two when both
   * engines chose the move, in which case one arrow is drawn with both
   * identities on it rather than two arrows side by side.
   */
  readonly arrows: readonly EngineArrow[];
}

/**
 * Lay out engine arrows for rendering.
 *
 * Two engines recommending the same move become one shared arrow: Engine A's
 * shaft and head, with Engine B's dashed core down the middle and its colour
 * round the head. Agreement then looks intentional — one move, two opinions —
 * instead of two arrows fighting for the same squares. Engines that disagree
 * each get their own arrow.
 */
function resolveEngineArrows(
  arrows: readonly EngineArrow[],
  orientation: Color,
): readonly ResolvedArrow[] {
  const byKey = new Map<string, EngineArrow[]>();
  for (const arrow of arrows) {
    const key = `${arrow.from}${arrow.to}`;
    byKey.set(key, [...(byKey.get(key) ?? []), arrow]);
  }
  const resolved: ResolvedArrow[] = [];
  for (const list of byKey.values()) {
    const head = list.find((arrow) => arrow.identity === 'engine-a') ?? list[0];
    if (!head) continue;
    const from = centre(head.from, orientation);
    const to = centre(head.to, orientation);
    resolved.push({
      fromX: from.cx,
      fromY: from.cy,
      toX: to.cx,
      toY: to.cy,
      identity: head.identity,
      style: ENGINE_ARROW_STYLES[head.identity],
      arrows: list,
      // A best-move arrow (no rank) outranks everything; variation arrows
      // carry their MultiPV rank and are drawn fainter for it.
      rank: Math.min(...list.map((arrow) => arrow.rank ?? 1)),
    });
  }
  // Best move last, so it paints over the variations it shares squares with.
  return resolved.sort((a, b) => b.rank - a.rank);
}

/**
 * How faint a variation arrow is. The best move keeps the full opacity;
 * the second line is clearly a second opinion, the fifth is a hint.
 */
const variationOpacity = (rank: number): number =>
  rank <= 1 ? ENGINE_ARROW.opacity : Math.max(0.22, ENGINE_ARROW.opacity * 0.62 ** (rank - 1));

export function BoardShapes({
  shapes,
  engineArrows = [],
  referenceArrows = [],
  draft,
  orientation,
  movingPiece = false,
}: BoardShapesProps) {
  const all = draft ? [...shapes, draft] : shapes;
  const resolvedEngine = useMemo(
    () => resolveEngineArrows(engineArrows, orientation),
    [engineArrows, orientation],
  );
  const engineSvg = useRef<SVGSVGElement | null>(null);

  return (
    <>
      {referenceArrows.length > 0 ? (
        <svg
          viewBox="0 0 8 8"
          data-reference-arrows
          data-reference-arrow-count={referenceArrows.length}
          opacity={movingPiece ? 0.3 : 1}
          className="pointer-events-none absolute inset-0 h-full w-full transition-opacity duration-150"
          aria-hidden
        >
          {referenceArrows.map((arrow) => {
            const from = centre(arrow.from, orientation);
            const to = centre(arrow.to, orientation);
            const geometry = arrowGeometry(from.cx, from.cy, to.cx, to.cy, 1, arrow.width);
            if (!geometry) return null;
            return (
              <g
                key={`${arrow.from}${arrow.to}`}
                data-reference-arrow={arrow.san}
                data-reference-arrow-hovered={arrow.hovered ? 'true' : undefined}
                opacity={arrow.hovered ? 0.95 : 0.6}
              >
                {/* Never the accent: blue is the engine's colour on this board. */}
                <polygon
                  points={geometry.outline}
                  fill="var(--reference-arrow)"
                  stroke={arrow.hovered ? 'rgb(255 255 255 / 0.9)' : 'rgb(255 255 255 / 0.35)'}
                  strokeWidth={arrow.hovered ? 0.05 : 0.03}
                  strokeLinejoin="round"
                />
              </g>
            );
          })}
        </svg>
      ) : null}
      {resolvedEngine.length > 0 ? (
        <svg
          viewBox="0 0 8 8"
          data-engine-arrows
          data-engine-arrow-count={resolvedEngine.length}
          data-engine-arrows-dimmed={movingPiece}
          opacity={movingPiece ? 0.3 : 1}
          ref={engineSvg}
          // Inert, whole layer: see the hover effect above for why.
          className="pointer-events-none absolute inset-0 h-full w-full transition-opacity duration-150"
          aria-hidden
        >
          {resolvedEngine.map((arrow, index) => {
            const geometry = arrowGeometry(arrow.fromX, arrow.fromY, arrow.toX, arrow.toY);
            if (!geometry) return null;
            const shared = arrow.arrows.length > 1;
            const b = ENGINE_ARROW_STYLES['engine-b'];
            const dashed = !shared && arrow.identity === 'engine-b';
            return (
              <g
                key={`e${index}-${arrow.identity}`}
                opacity={variationOpacity(arrow.rank)}
                data-engine-arrow-shared={shared ? 'true' : undefined}
                data-engine-arrow-rank={arrow.rank}
                pointerEvents="none"
                aria-hidden
              >
                {/*
                 * A faint light halo keeps the arrow legible on the dark
                 * squares of every theme without a heavy outline.
                 */}
                <polygon
                  points={geometry.outline}
                  fill="none"
                  stroke="rgb(255 255 255 / 0.35)"
                  strokeWidth={0.05}
                  strokeLinejoin="round"
                />
                {dashed ? (
                  <>
                    {/* Engine B alone: a dashed shaft and an outlined head. */}
                    <line
                      x1={geometry.startX}
                      y1={geometry.startY}
                      x2={geometry.baseX}
                      y2={geometry.baseY}
                      stroke={arrow.style.color}
                      strokeWidth={USER_ARROW.shaft}
                      strokeLinecap="round"
                      strokeDasharray={ENGINE_ARROW.dash}
                    />
                    <polygon
                      points={geometry.head}
                      fill={arrow.style.color}
                      fillOpacity={0.35}
                      stroke={arrow.style.color}
                      strokeWidth={0.045}
                      strokeLinejoin="round"
                    />
                  </>
                ) : (
                  <polygon
                    points={geometry.outline}
                    fill={arrow.style.color}
                    stroke={arrow.style.color}
                    strokeWidth={0.02}
                    strokeLinejoin="round"
                  />
                )}
                {shared ? (
                  <>
                    {/* Both engines: Engine B's dashed core and head outline
                        on Engine A's arrow — one move, two opinions. */}
                    <line
                      x1={geometry.startX}
                      y1={geometry.startY}
                      x2={geometry.baseX}
                      y2={geometry.baseY}
                      stroke={b.color}
                      strokeWidth={ENGINE_ARROW.coreWidth}
                      strokeLinecap="round"
                      strokeDasharray={ENGINE_ARROW.coreDash}
                    />
                    <polygon
                      points={geometry.head}
                      fill="none"
                      stroke={b.color}
                      strokeWidth={0.045}
                      strokeLinejoin="round"
                    />
                  </>
                ) : null}
                {/*
                 * The arrows as data — squares and engine — for anything that
                 * wants to check what is on the board against the position.
                 * One line per engine, so agreement is still two facts.
                 */}
                {arrow.arrows.map((engineArrow) => (
                  <line
                    key={engineArrow.identity}
                    x1={arrow.fromX}
                    y1={arrow.fromY}
                    x2={arrow.toX}
                    y2={arrow.toY}
                    stroke="transparent"
                    strokeWidth={0.34}
                    strokeLinecap="round"
                    pointerEvents="none"
                    data-engine-arrow-hit={index}
                    data-engine-arrow-identity={engineArrow.identity}
                    data-engine-arrow-from={engineArrow.from}
                    data-engine-arrow-to={engineArrow.to}
                    data-engine-arrow-engine={engineArrow.engineName}
                  />
                ))}
              </g>
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
            const points = userArrowPoints(from.cx, from.cy, to.cx, to.cy);
            if (!points) return null;
            return (
              <polygon
                key={`a${index}-${shape.from}${shape.to}`}
                points={points}
                fill={BRUSH_COLOR[shape.brush]}
                strokeLinejoin="round"
                opacity={0.88}
                data-user-arrow={`${shape.from}${shape.to}`}
              />
            );
          })}
        </svg>
      )}
    </>
  );
}
