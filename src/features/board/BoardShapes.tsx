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
import { useEffect, useId, useMemo, useRef, useState } from 'react';

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

/**
 * Engine-arrow geometry, in squares. One shaft width for every board size:
 * the overlay is drawn in board units, so a 0.11-square shaft is 2.6 px on a
 * 190 px study thumbnail and 11 px on an 800 px analysis board, and the
 * proportion to the pieces is the same on both.
 */
const ENGINE_ARROW = {
  /** Shaft width. */
  shaft: 0.11,
  /** Head length along the move, and half its width across it. */
  headLength: 0.3,
  headHalfWidth: 0.18,
  /** The tail starts this far from the origin square's centre … */
  startInset: 0.3,
  /** … and the tip stops this far before the destination's, off the piece. */
  endInset: 0.2,
  opacity: 0.82,
  hoverOpacity: 1,
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
    });
  }
  return resolved;
}

/** The shaft and head of an arrow as one outline, in board units. */
function arrowGeometry(arrow: ResolvedArrow) {
  const dx = arrow.toX - arrow.fromX;
  const dy = arrow.toY - arrow.fromY;
  const length = Math.hypot(dx, dy);
  if (length < 0.01) return null;
  const ux = dx / length;
  const uy = dy / length;
  // Perpendicular unit, for the width.
  const nx = -uy;
  const ny = ux;
  const { shaft, headLength, headHalfWidth, startInset, endInset } = ENGINE_ARROW;
  const startX = arrow.fromX + ux * startInset;
  const startY = arrow.fromY + uy * startInset;
  const tipX = arrow.toX - ux * endInset;
  const tipY = arrow.toY - uy * endInset;
  // A knight's move is the shortest arrow; keep some shaft even there.
  const shaftEnd = Math.max(0.12, length - startInset - endInset - headLength);
  const baseX = startX + ux * shaftEnd;
  const baseY = startY + uy * shaftEnd;
  const w = shaft / 2;
  const point = (x: number, y: number) => `${x.toFixed(3)},${y.toFixed(3)}`;
  return {
    startX,
    startY,
    baseX,
    baseY,
    tipX,
    tipY,
    outline: [
      point(startX + nx * w, startY + ny * w),
      point(baseX + nx * w, baseY + ny * w),
      point(baseX + nx * headHalfWidth, baseY + ny * headHalfWidth),
      point(tipX, tipY),
      point(baseX - nx * headHalfWidth, baseY - ny * headHalfWidth),
      point(baseX - nx * w, baseY - ny * w),
      point(startX - nx * w, startY - ny * w),
    ].join(' '),
    head: [
      point(baseX + nx * headHalfWidth, baseY + ny * headHalfWidth),
      point(tipX, tipY),
      point(baseX - nx * headHalfWidth, baseY - ny * headHalfWidth),
    ].join(' '),
  };
}

/** How close, in squares, the pointer must be to an arrow's shaft to hover it. */
const HOVER_DISTANCE = 0.17;

/** Distance from a point to a segment, all in board units. */
function distanceToSegment(px: number, py: number, arrow: ResolvedArrow): number {
  const dx = arrow.toX - arrow.fromX;
  const dy = arrow.toY - arrow.fromY;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((px - arrow.fromX) * dx + (py - arrow.fromY) * dy) / lengthSquared),
        );
  return Math.hypot(px - (arrow.fromX + t * dx), py - (arrow.fromY + t * dy));
}

export function BoardShapes({
  shapes,
  engineArrows = [],
  draft,
  orientation,
  movingPiece = false,
}: BoardShapesProps) {
  const markerPrefix = useId().replaceAll(':', '');
  const all = draft ? [...shapes, draft] : shapes;
  const resolvedEngine = useMemo(
    () => resolveEngineArrows(engineArrows, orientation),
    [engineArrows, orientation],
  );
  const [hoveredArrowId, setHoveredArrowId] = useState<number | null>(null);
  const hovered =
    !movingPiece && hoveredArrowId !== null ? (resolvedEngine[hoveredArrowId] ?? null) : null;
  const engineSvg = useRef<SVGSVGElement | null>(null);

  /*
    Hover is computed from where the pointer is, not from what it is over.

    Nothing in the engine-arrow layer may receive pointer events: the sheet
    is a rectangle over every square, and a hit stroke along an arrow's shaft
    sits exactly on the square a person clicks to play the engine's own
    suggestion. Phase 43 made the hit strokes hoverable and the board stopped
    taking clicks under them. So the layer is inert, and the board container
    reports pointer movement; the nearest shaft within a sixth of a square
    is the hovered arrow.
  */
  useEffect(() => {
    const container = engineSvg.current?.parentElement;
    if (!container || resolvedEngine.length === 0) return undefined;
    const onMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const px = ((event.clientX - rect.left) / rect.width) * 8;
      const py = ((event.clientY - rect.top) / rect.height) * 8;
      let best: number | null = null;
      let bestDistance = HOVER_DISTANCE;
      resolvedEngine.forEach((arrow, index) => {
        const distance = distanceToSegment(px, py, arrow);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = index;
        }
      });
      setHoveredArrowId((current) => (current === best ? current : best));
    };
    const onLeave = () => setHoveredArrowId(null);
    container.addEventListener('pointermove', onMove);
    container.addEventListener('pointerleave', onLeave);
    return () => {
      container.removeEventListener('pointermove', onMove);
      container.removeEventListener('pointerleave', onLeave);
    };
  }, [resolvedEngine]);

  return (
    <>
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
            const geometry = arrowGeometry(arrow);
            if (!geometry) return null;
            const isHovered = hovered === arrow;
            const shared = arrow.arrows.length > 1;
            const b = ENGINE_ARROW_STYLES['engine-b'];
            const dashed = !shared && arrow.identity === 'engine-b';
            return (
              <g
                key={`e${index}-${arrow.identity}`}
                opacity={isHovered ? ENGINE_ARROW.hoverOpacity : ENGINE_ARROW.opacity}
                data-engine-arrow-shared={shared ? 'true' : undefined}
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
                      strokeWidth={ENGINE_ARROW.shaft}
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
      {/*
       * Hover tooltip, anchored at the arrow's head. Lives outside the SVG so
       * HTML can render the move/score/depth lines without inheriting stroke
       * conventions; pointer-events: none so it never takes the cursor.
       */}
      {hovered ? <EngineArrowTooltip arrow={hovered} /> : null}
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
 * Floating tooltip for a hovered engine arrow, beside the arrow's head.
 *
 * One line per engine: name, move, evaluation, depth — and nothing more. A
 * "PV wall" is the failure mode here; a player who wants the line has the
 * engine panel. It sits on the side of the head that has room, so it never
 * leaves the board, and never over the destination square itself.
 *
 * `aria-live="polite"` is intentional: when a player sweeps the cursor
 * across two engines' arrows, a screen reader announces the change without
 * interrupting whatever the user is currently saying.
 */
function EngineArrowTooltip({ arrow }: { readonly arrow: ResolvedArrow }) {
  // Board fractions of the head; the tooltip hangs off the head's far side.
  const x = arrow.toX / 8;
  const y = arrow.toY / 8;
  const right = x > 0.62;
  const below = y < 0.25;
  const style = {
    left: `${(right ? x - 0.07 : x + 0.07) * 100}%`,
    top: `${(below ? y + 0.07 : y - 0.07) * 100}%`,
    transform: `translate(${right ? '-100%' : '0'}, ${below ? '0' : '-100%'})`,
  };
  return (
    <div
      role="status"
      aria-live="polite"
      data-engine-arrow-tooltip
      data-engine-name={arrow.arrows.map((a) => a.engineName).join(' · ')}
      style={style}
      className="pointer-events-none absolute z-30 whitespace-nowrap rounded-md bg-overlay/95 px-2 py-1 text-[10.5px] leading-snug text-primary shadow"
    >
      {arrow.arrows.map((engineArrow) => {
        const move = engineArrow.san ?? `${engineArrow.from}${engineArrow.to}`;
        const scoreText = engineArrow.score ? formatScore(engineArrow.score) : null;
        const depthText = engineArrow.depth !== undefined ? `d${engineArrow.depth}` : null;
        return (
          <div key={engineArrow.identity} className="flex items-center gap-1.5 tabular">
            <span
              className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: ENGINE_ARROW_STYLES[engineArrow.identity].color }}
              aria-hidden
            />
            <span className="font-semibold">{engineArrow.engineName}</span>
            <span className="font-medium">{move}</span>
            {scoreText ? <span>{scoreText}</span> : null}
            {depthText ? <span className="text-tertiary">{depthText}</span> : null}
          </div>
        );
      })}
    </div>
  );
}
