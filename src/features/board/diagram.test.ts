import { describe, expect, it } from 'vitest';

import { START_FEN } from '@/chess/fen';
import type { Shape } from '@/chess/annotations';

import { diagramSvg, sideToMoveCaption } from './diagram';

const artwork = Object.fromEntries(
  ['w', 'b'].flatMap((c) =>
    ['K', 'Q', 'R', 'B', 'N', 'P'].map((t) => [`${c}${t}`, `<svg id="${c}${t}"/>`]),
  ),
);
const colours = {
  light: '#eeeeee',
  dark: '#888888',
  coordinateOnLight: '#000',
  coordinateOnDark: '#fff',
};
const decoded = (svg: string): string[] =>
  [...svg.matchAll(/base64,([^"]+)"/g)].map((match) => atob(match[1]!));

describe('a diagram', () => {
  it('draws 64 squares and one image per piece, from the artwork given', () => {
    const svg = diagramSvg({ fen: START_FEN, orientation: 'w', colours, artwork })!;
    expect(
      svg.match(
        /<rect x="\d+(\.\d+)?" y="\d+(\.\d+)?" width="60" height="60" fill="#(eeeeee|888888)"/g,
      ),
    ).toHaveLength(64);
    const pieces = decoded(svg);
    expect(pieces).toHaveLength(32);
    expect(pieces.filter((p) => p.includes('wP'))).toHaveLength(8);
    expect(pieces.filter((p) => p.includes('bK'))).toHaveLength(1);
  });

  it('puts a1 at the bottom left for White and the top right for Black', () => {
    const lone = '8/8/8/8/8/8/8/K6k w - - 0 1';
    const white = diagramSvg({
      fen: lone,
      orientation: 'w',
      colours,
      artwork,
      coordinates: false,
    })!;
    const black = diagramSvg({
      fen: lone,
      orientation: 'b',
      colours,
      artwork,
      coordinates: false,
    })!;
    const firstImage = (svg: string) =>
      /<image x="([\d.]+)" y="([\d.]+)"/.exec(svg)!.slice(1).map(Number);
    const [wx, wy] = firstImage(white);
    const [bx, by] = firstImage(black);
    expect(wx).toBeLessThan(60);
    expect(wy).toBeGreaterThan(7 * 60 - 1);
    expect(bx).toBeGreaterThan(7 * 60 - 1);
    expect(by).toBeLessThan(60);
  });

  it('carries the author’s arrows and coloured squares, and a caption', () => {
    const shapes: Shape[] = [
      { kind: 'arrow', from: 'e2' as never, to: 'e4' as never, brush: 'green' },
      { kind: 'square', square: 'd5' as never, brush: 'red' },
    ];
    const svg = diagramSvg({
      fen: START_FEN,
      orientation: 'w',
      colours,
      artwork,
      shapes,
      caption: sideToMoveCaption(START_FEN),
    })!;
    // The board's own arrow outline (arrow-shape.ts): one filled polygon, no
    // marker head and no round cap to poke past the point.
    expect(svg).toMatch(/<polygon points="[^"]+" fill="[^"]+" fill-opacity="0\.85"\/>/);
    expect(svg).not.toContain('marker');
    expect(svg).not.toContain('stroke-linecap="round"');
    expect(svg).toContain('fill="#882020" fill-opacity="0.45"');
    expect(svg).toContain('>White to move</text>');
  });

  it('refuses a FEN that does not parse', () => {
    expect(diagramSvg({ fen: 'not a fen', orientation: 'w', colours, artwork })).toBeNull();
  });
});
