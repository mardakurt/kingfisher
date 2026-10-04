/**
 * The outline of an arrow a person draws, wherever it is drawn: on the live
 * board (in squares) and in an exported diagram (in pixels). One shape, one
 * definition, so the board and its printout cannot disagree.
 *
 * Drawn as a single polygon — a straight shaft and a sharp point. It used to
 * be a round-capped line with a marker head: the round cap poked out past the
 * point as a blob, and the head was barely wider than the shaft.
 */

/** In squares. An annotation is read across the board, so a little bolder than an engine arrow. */
export const USER_ARROW = {
  shaft: 0.15,
  headLength: 0.36,
  headHalfWidth: 0.27,
  /** The tail starts this far from the origin square's centre… */
  startInset: 0.32,
  /** …and the point stops this far before the destination's, off the piece. */
  endInset: 0.24,
} as const;

/**
 * Polygon points (`"x,y x,y …"`) for an arrow between two square centres, with
 * `unit` the size of one square in the caller's coordinates. Null when the two
 * centres coincide.
 */
export function userArrowPoints(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  unit = 1,
): string | null {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const length = Math.hypot(dx, dy);
  if (length < 0.01 * unit) return null;
  const ux = dx / length;
  const uy = dy / length;
  const nx = -uy;
  const ny = ux;
  const { shaft, headLength, headHalfWidth, startInset, endInset } = USER_ARROW;
  const startX = fromX + ux * startInset * unit;
  const startY = fromY + uy * startInset * unit;
  const tipX = toX - ux * endInset * unit;
  const tipY = toY - uy * endInset * unit;
  // A knight's move is the shortest arrow; keep some shaft even there.
  const shaftLength = Math.max(0.12 * unit, length - (startInset + endInset + headLength) * unit);
  const baseX = startX + ux * shaftLength;
  const baseY = startY + uy * shaftLength;
  const w = (shaft / 2) * unit;
  const h = headHalfWidth * unit;
  const point = (x: number, y: number) => `${round(x)},${round(y)}`;
  return [
    point(startX + nx * w, startY + ny * w),
    point(baseX + nx * w, baseY + ny * w),
    point(baseX + nx * h, baseY + ny * h),
    point(tipX, tipY),
    point(baseX - nx * h, baseY - ny * h),
    point(baseX - nx * w, baseY - ny * w),
    point(startX - nx * w, startY - ny * w),
  ].join(' ');
}

const round = (value: number) => Number(value.toFixed(3));
