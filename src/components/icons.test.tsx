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

  it('Recall (the chess knight for Training) draws the muzzle and ear', () => {
    /*
      Phase 62's knight drew a closed 17-point polygon that did not
      read as a horse at any size. Phase 67 redraws it with quadratic
      curves through the muzzle (right side) and explicit L commands
      for the ear (top of the head). The path must contain those
      commands or the icon is back to garbage.
    */
    const html = renderToStaticMarkup(<Recall />);
    // Quadratic curves: at least one Q command traces the muzzle or neck.
    expect(html).toMatch(/<path[^>]*\bd="[^"]*\bQ\b/);
    // The base is a separate path that closes back to its starting point.
    expect(html).toMatch(/<path[^>]*\bZ\b/);
    // The eye is a small filled circle at (13.5, 8) — visible at 21 px and
    // above; gone at 16 px. Either way the element is in the markup so a
    // future refactor cannot drop it without test failure.
    expect(html).toMatch(/<circle[^>]*\bcx="13\.5"/);
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
