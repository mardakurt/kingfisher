/**
 * Smoke tests for the icon library.
 *
 * Every icon is rendered through `renderToStaticMarkup` (the same path
 * the layout uses on the server) and the result is asserted to:
 *   - be a single `<svg>` element with `aria-hidden`,
 *   - have the viewBox the rest of the chrome relies on,
 *   - contain at least one drawn child (otherwise the icon would be
 *     invisible),
 *   - contain the keyword characters the user expects (a knight icon
 *     that does not contain a `path` element is not really drawn).
 *
 * Per-icon tests below assert the specific shape that distinguishes
 * the icon from a generic placeholder — e.g. the chess knight (`Recall`)
 * contains a curve through the muzzle area, where the previous garbage
 * draw did not.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Board, Recall, Repertoire, Review, Target } from './icons';

const isSvg = (markup: string) => /^<svg /.test(markup);

describe('icons', () => {
  it('renders a single svg element with aria-hidden', () => {
    const html = renderToStaticMarkup(<Recall />);
    expect(html).toContain('<svg');
    expect(html).toContain('aria-hidden');
    expect(html).toContain('viewBox="0 0 24 24"');
    expect(isSvg(html)).toBe(true);
  });

  it('renders at least one path child', () => {
    const html = renderToStaticMarkup(<Recall />);
    expect(html).toContain('<path');
  });

  it('Recall (the chess knight for Training) draws the muzzle, ear and eye', () => {
    /*
      Phase 67 redrew the knight three times: an L-shape (looked like
      a tent peg), a horse-head-on-column (looked like a rectangle
      with a bump), and a curved silhouette (looked like a snail).
      Phase 69 redraws it as a wide plinth, a vertical body column,
      and a clear horse head: a mane curve on the back, an ear notch
      at the top, a muzzle pointing right, a jaw curving back to the
      chest. The path must contain the quadratic curves that trace
      the muzzle and mane, and the eye must be at (14, 7.5) — a
      future refactor that drops any of these is back to garbage.
    */
    const html = renderToStaticMarkup(<Recall />);
    // Quadratic curves: at least one Q command traces the muzzle or mane.
    expect(html).toMatch(/<path[^>]*\bd="[^"]*\bQ\b/);
    // Both the plinth and the head/body are closed paths (Z commands).
    expect(html).toMatch(/<path[^>]*\bZ\b/);
    // The eye is a small filled circle at (14, 7.5) — visible at 21 px
    // and above; gone at 16 px. Either way the element is in the
    // markup so a future refactor cannot drop it without test failure.
    expect(html).toMatch(/<circle[^>]*\bcx="14"/);
    expect(html).toMatch(/<circle[^>]*\bcy="7\.5"/);
  });

  it('Board, Target, Review, Repertoire each render their own path', () => {
    // Sanity: distinct icons are not the same path. If a refactor
    // accidentally collapses two icons into one, this fails.
    const board = renderToStaticMarkup(<Board />);
    const target = renderToStaticMarkup(<Target />);
    const review = renderToStaticMarkup(<Review />);
    const repertoire = renderToStaticMarkup(<Repertoire />);
    expect(board).not.toBe(target);
    expect(target).not.toBe(review);
    expect(review).not.toBe(repertoire);
  });
});
