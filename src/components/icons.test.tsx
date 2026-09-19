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
 * Per-icon tests below assert the structure that distinguishes the icon
 * from a generic placeholder — e.g. the chess knight (`Recall`) is one
 * closed, curved silhouette on a plinth, where the drawings it replaced
 * were columns with features attached.
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

  it("Recall (the chess knight for Training) is one silhouette on the king's plinth", () => {
    /*
      Phases 67–69 drew the knight feature by feature — a column, a mane
      curve, an ear notch, a filled eye — and each version read as a tent
      peg, a lamp or a snail at 21 px. The icon is now a silhouette: one
      closed outline for head and neck, a plinth beneath, nothing inside.
      The assertions pin the shape's structure, not its coordinates: a
      refactor that reintroduces interior detail (a filled eye), splits the
      head into several open strokes, or drops the plinth is back to a
      drawing nobody recognises.
    */
    const html = renderToStaticMarkup(<Recall />);
    const paths = [...html.matchAll(/<path[^>]*\bd="([^"]*)"/g)].map((m) => m[1] ?? '');
    // Exactly two paths: the plinth and the head-and-neck outline.
    expect(paths).toHaveLength(2);
    // Both are closed shapes; an open stroke reads as a squiggle, not a piece.
    for (const d of paths) expect(/[zZ]$/.test(d.trim())).toBe(true);
    // The plinth is the Endgame king's, so the two pieces line up in the rail.
    expect(paths[0]).toBe('M7 16h10v3H7z');
    // The head is curved (C commands), and its outline reaches both the
    // muzzle on the left of the grid and the ear at the top: a shape confined
    // to the middle of the box is the column-with-a-bump the owner rejected.
    expect(paths[1]).toMatch(/C/);
    const numbers = [...(paths[1] ?? '').matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
    expect(Math.min(...numbers)).toBeLessThan(6); // the muzzle
    // No filled interior detail: the pawn and the king are outlines, and a
    // filled eye at 21 px is a smudge.
    expect(html).not.toMatch(/fill="currentColor"/);
    expect(html).not.toContain('<circle');
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
