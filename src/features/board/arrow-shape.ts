/**
 * The outline of every board arrow: authored annotations, engine suggestions,
 * reference moves and exported diagrams. One geometry keeps the shaft, head
 * and endpoints consistent across every surface.
 *
 * Drawn as a single polygon — a straight shaft and a sharp point. It used to
 * be a round-capped line with a marker head: the round cap poked out past the
 * point as a blob, and the head was barely wider than the shaft.
 */

/** The engine best-move arrow proportions, in squares, shared by every source. */
export const USER_ARROW = {
  shaft: 0.11,
  headLength: 0.3,
  headHalfWidth: 0.18,
  /** The tail starts this far from the origin square's centre… */
  startInset: 0.3,
  /** …and the point stops this far before the destination's, off the piece. */
  endInset: 0.2,
} as const;

/**
 * Polygon points (`"x,y x,y …"`) for an arrow between two square centres, with
 * `unit` the size of one square in the caller's coordinates. Null when the two
 * centres coincide.
 */
export function arrowGeometry(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  unit = 1,
  shaftWidth: number = USER_ARROW.shaft,
) {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const length = Math.hypot(dx, dy);
  if (length < 0.01 * unit) return null;
  const ux = dx / length;
  const uy = dy / length;
  const nx = -uy;
  const ny = ux;
  const { headLength, startInset, endInset } = USER_ARROW;
  // Reference moves retain their population-weighted shaft width.
  const headHalfWidth = Math.max(USER_ARROW.headHalfWidth, shaftWidth * 0.9);
  const startX = fromX + ux * startInset * unit;
  const startY = fromY + uy * startInset * unit;
  const tipX = toX - ux * endInset * unit;
  const tipY = toY - uy * endInset * unit;
  // A knight's move is the shortest arrow; keep some shaft even there.
  const shaftLength = Math.max(0.12 * unit, length - (startInset + endInset + headLength) * unit);
  const baseX = startX + ux * shaftLength;
  const baseY = startY + uy * shaftLength;
  const w = (shaftWidth / 2) * unit;
  const h = headHalfWidth * unit;
  const point = (x: number, y: number) => `${round(x)},${round(y)}`;
  const outline = [
    point(startX + nx * w, startY + ny * w),
    point(baseX + nx * w, baseY + ny * w),
    point(baseX + nx * h, baseY + ny * h),
    point(tipX, tipY),
    point(baseX - nx * h, baseY - ny * h),
    point(baseX - nx * w, baseY - ny * w),
    point(startX - nx * w, startY - ny * w),
  ].join(' ');
  return {
    startX,
    startY,
    baseX,
    baseY,
    tipX,
    tipY,
    outline,
    head: [
      point(baseX + nx * h, baseY + ny * h),
      point(tipX, tipY),
      point(baseX - nx * h, baseY - ny * h),
    ].join(' '),
  };
}

/** The same outline for authored arrows and exported diagrams. */
export function userArrowPoints(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  unit = 1,
): string | null {
  return arrowGeometry(fromX, fromY, toX, toY, unit)?.outline ?? null;
}

const round = (value: number) => Number(value.toFixed(3));
