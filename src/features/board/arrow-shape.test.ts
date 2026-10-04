import { describe, expect, it } from 'vitest';

import { USER_ARROW, userArrowPoints } from './arrow-shape';

const points = (text: string) =>
  text.split(' ').map((pair) => pair.split(',').map(Number) as [number, number]);

describe('the arrow a person draws', () => {
  it('ends in one sharp point short of the destination centre', () => {
    // e2 → e4 on a board in squares: centres (4.5, 6.5) → (4.5, 4.5).
    const outline = points(userArrowPoints(4.5, 6.5, 4.5, 4.5)!);
    expect(outline).toHaveLength(7);
    const tip = outline[3]!;
    expect(tip[0]).toBeCloseTo(4.5);
    expect(tip[1]).toBeCloseTo(4.5 + USER_ARROW.endInset);
    // Nothing reaches past the point: no cap, no blob.
    expect(Math.min(...outline.map(([, y]) => y))).toBeCloseTo(tip[1]);
  });

  it('has a head clearly wider than its shaft', () => {
    const outline = points(userArrowPoints(4.5, 6.5, 4.5, 4.5)!);
    const shaft = Math.abs(outline[0]![0] - outline[6]![0]);
    const head = Math.abs(outline[2]![0] - outline[4]![0]);
    expect(shaft).toBeCloseTo(USER_ARROW.shaft);
    expect(head / shaft).toBeGreaterThan(3);
  });

  it('scales with the unit, so an exported diagram has the board’s proportions', () => {
    const board = points(userArrowPoints(4.5, 6.5, 5.5, 4.5)!);
    const pixels = points(userArrowPoints(450, 650, 550, 450, 100)!);
    board.forEach(([x, y], i) => {
      expect(pixels[i]![0]).toBeCloseTo(x * 100, 0);
      expect(pixels[i]![1]).toBeCloseTo(y * 100, 0);
    });
  });

  it('draws nothing between a square and itself', () => {
    expect(userArrowPoints(4.5, 4.5, 4.5, 4.5)).toBeNull();
  });
});
