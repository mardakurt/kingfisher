import fs from 'node:fs';
import path from 'node:path';

import { PALETTE } from './palette';

/**
 * The mark is drawn from one master and in the Studio's colours.
 *
 * Until Phase 84 the icon was a teal bird on a navy tile — the colours of a
 * landing page that no longer matched the application — and the SVG was kept
 * in three hand-made copies. The copies are now written by
 * `scripts/render-brand-icons.py`; this holds them to the master and the
 * master to the palette.
 */
const REPO = path.resolve(__dirname, '../..');
const read = (relative: string) => fs.readFileSync(path.join(REPO, relative), 'utf8');
const MASTER = read('brand/kingfisher-mark.svg');

describe('brand assets', () => {
  it.each([
    'src/app/icon.svg',
    'public/landing/img/kingfisher-mark.svg',
    'marketing/assets/img/kingfisher-mark.svg',
  ])('%s is a copy of the master mark', (copy) => {
    expect(read(copy)).toBe(MASTER);
  });

  it('draws the mark in the Studio board colours and nothing else', () => {
    const fills = new Set([...MASTER.matchAll(/fill="(#[0-9a-f]{6})"/gi)].map((m) => m[1]!));
    expect([...fills].sort()).toEqual(
      [PALETTE.board.light, PALETTE.board.dark, PALETTE.board.frame].sort(),
    );
  });

  it('fills the rounded tile with the board to its edge, with no frame round it', () => {
    // A frame of the board's navy round the squares made the Dock icon and
    // the landing's mark read as a board inset in a dark border.
    const tile = /<g clip-path[^>]*>([\s\S]*?)<\/g>/.exec(MASTER)![1]!;
    const squares = [...tile.matchAll(/<rect ([^>]*?)\/>/g)].map((m) => {
      const attr = (name: string) =>
        Number(new RegExp(`${name}="([\\d.]+)"`).exec(m[1]!)?.[1] ?? 0);
      return [attr('x'), attr('y'), attr('width'), attr('height')];
    });
    expect(squares.sort()).toEqual(
      [
        [0, 0, 32, 32],
        [0, 32, 32, 32],
        [32, 0, 32, 32],
        [32, 32, 32, 32],
      ].sort(),
    );
  });

  it('draws the in-app mark with the master geometry', () => {
    const numbers = (text: string) =>
      [...text.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
    const component = read('src/features/shell/BrandMark.tsx');
    const pathOf = (text: string) => /\bd="([^"]+)"/.exec(text)![1]!;
    expect(numbers(pathOf(component))).toEqual(numbers(pathOf(MASTER)));
    const rects = (text: string) =>
      [...text.matchAll(/<rect ([^>]*?)\/>/g)].map((m) =>
        numbers(m[1]!.replace(/fill="[^"]*"/, '')),
      );
    expect(rects(component)).toEqual(rects(MASTER));
    expect(/<circle[^>]*cx="([\d.]+)" cy="([\d.]+)"/.exec(component)!.slice(1)).toEqual(
      /<circle[^>]*cx="([\d.]+)" cy="([\d.]+)"/.exec(MASTER)!.slice(1),
    );
  });

  it('draws the landing and the public pages from Studio tokens alone', () => {
    // A colour here is a second design system; the Studio's tokens are the one.
    for (const file of ['src/app/landing/landing.css', 'src/app/_docs/docs.css']) {
      const literal = /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.exec(
        read(file).replace(/\/\*[\s\S]*?\*\//g, ''),
      );
      expect({ file, literal: literal?.[0] ?? null }).toEqual({ file, literal: null });
    }
  });

  it('keeps the retired teal and navy tile out of every served stylesheet', () => {
    const retired = /#(39a8c9|10151e|1a2331|071827)\b/i;
    for (const file of [
      'src/app/globals.css',
      'src/app/landing/landing.css',
      'src/app/_docs/docs.css',
    ]) {
      expect({ file, retired: retired.exec(read(file))?.[0] ?? null }).toEqual({
        file,
        retired: null,
      });
    }
  });
});
