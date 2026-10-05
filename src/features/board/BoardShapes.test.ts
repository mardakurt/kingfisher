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

describe('the blue arrow is the engine best-move arrow', () => {
  // Every polygon's paint attributes, in order, inside one layer's markup.
  const paints = (markup: string) =>
    [...markup.matchAll(/<polygon points="[^"]+"([^>]*?)\/?>/g)].map((m) => m[1]!.trim());

  it('draws a person’s blue arrow with the engine’s colour, halo, edge and opacity', () => {
    const html = renderToStaticMarkup(
      createElement(BoardShapes, {
        orientation: 'w',
        shapes: [{ kind: 'arrow', from: 'e2', to: 'e4', brush: 'blue' }],
        engineArrows: [
          { kind: 'arrow', from: 'g1', to: 'f3', identity: 'engine-a', engineName: 'Stockfish' },
        ],
      }),
    );
    const engine = /<g opacity="([^"]+)"[^>]*data-engine-arrow-rank="1"[^>]*>([\s\S]*?)<line/.exec(
      html,
    );
    const authored = /<g opacity="([^"]+)" data-user-arrow="e2e4">([\s\S]*?)<\/g>/.exec(html);
    expect(engine).not.toBeNull();
    expect(authored).not.toBeNull();
    expect(authored![1]).toBe(engine![1]);
    expect(paints(authored![2]!)).toEqual(paints(engine![2]!));
    expect(paints(authored![2]!)).toHaveLength(2);
  });

  it('leaves the other brushes in their own colours', () => {
    const html = renderToStaticMarkup(
      createElement(BoardShapes, {
        orientation: 'w',
        shapes: [{ kind: 'arrow', from: 'e2', to: 'e4', brush: 'red' }],
      }),
    );
    expect(html).toContain('fill="var(--shape-red)"');
    expect(html).not.toContain('engine-a-color');
  });

  it('is what a plain right-drag draws; the modifiers pick the others', async () => {
    const { brushFor } = await import('./Chessboard');
    const keys = { shiftKey: false, altKey: false, ctrlKey: false };
    expect(brushFor(keys)).toBe('blue');
    expect(brushFor({ ...keys, altKey: true })).toBe('green');
    expect(brushFor({ ...keys, shiftKey: true })).toBe('red');
    expect(brushFor({ ...keys, shiftKey: true, altKey: true })).toBe('yellow');
  });
});
