import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { BOARD_SQUARE_CLASS, BOARD_SQUARE_PERCENT } from './BoardLayers';

/*
 * A Tailwind class name is a build-time contract, not a runtime string.
 *
 * `BOARD_SQUARE_CLASS` was first written as a template literal interpolating
 * `BOARD_SQUARE_PERCENT`. Tailwind scans source *text* for complete class
 * names and cannot evaluate an interpolation, so the rule was never emitted,
 * every piece lost its `h-[12.5%] w-[12.5%]` constraint, and the board rendered
 * as a few enormous pieces spilling across the grid.
 *
 * Typecheck passed. Every unit test passed. It was caught only by comparing
 * thirteen committed visual baselines — every screen carrying a board — which
 * is a slow, expensive way to learn that a string did not compile. So the
 * property is asserted directly: the number the constant exports has to match
 * the number the class spells, and the class has to be a literal in the source
 * rather than something assembled.
 */
describe('BOARD_SQUARE_CLASS is a class Tailwind can find', () => {
  it('spells the same square the constant exports', () => {
    expect(BOARD_SQUARE_CLASS).toBe('h-[12.5%] w-[12.5%]');
    expect(BOARD_SQUARE_CLASS).toContain(String(BOARD_SQUARE_PERCENT));
  });

  it('is a literal in the source, not an interpolation', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'src/features/board/BoardLayers.tsx'),
      'utf8',
    );
    expect(
      source,
      'the class is assembled, so Tailwind will not emit it and pieces lose their size',
    ).toContain("'h-[12.5%] w-[12.5%]'");
    expect(source).not.toMatch(/BOARD_SQUARE_CLASS = `h-\[/);
  });
});
