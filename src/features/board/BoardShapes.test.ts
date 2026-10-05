import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { Color, Square } from '@/chess/types';
import { BoardShapes } from './BoardShapes';

const coordinates = (polygon: string) =>
  polygon.split(' ').map((pair) => pair.split(',').map(Number));

describe('one arrow shape across board sources', () => {
  for (const orientation of ['w', 'b'] as const) {
    for (const [from, to] of [
      ['e2', 'e4'],
      ['g1', 'f3'],
    ] as const) {
      it(`matches engine and authored outlines for ${from}–${to}, ${orientation} orientation`, () => {
        const html = render(orientation, from, to);
        const engine = /data-engine-arrows[\s\S]*?<polygon points="([^"]+)"/.exec(html)?.[1];
        const authored = /<polygon[^>]*points="([^"]+)"[^>]*data-user-arrow=/.exec(html)?.[1];
        expect(engine).toBeDefined();
        expect(authored).toBeDefined();
        // Compare the rendered layers directly, without deriving an expected
        // shape from the implementation's geometry constants.
        expect(coordinates(engine!)).toEqual(coordinates(authored!));
        const reference = /data-reference-arrows[\s\S]*?<polygon points="([^"]+)"/.exec(html)?.[1];
        expect(reference).toBeDefined();
        expect(coordinates(reference!)).toEqual(coordinates(authored!));
      });
    }
  }
});

function render(orientation: Color, from: Square, to: Square) {
  return renderToStaticMarkup(
    createElement(BoardShapes, {
      orientation,
      shapes: [{ kind: 'arrow', from, to, brush: 'green' }],
      engineArrows: [{ kind: 'arrow', from, to, identity: 'engine-a', engineName: 'Stockfish' }],
      referenceArrows: [{ from, to, san: 'move', share: 0.5, width: 0.11, hovered: false }],
    }),
  );
}
