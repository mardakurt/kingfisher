import { describe, expect, it } from 'vitest';

import { parsePgn } from '@/chess/pgn';

import { lastGameBoundary, pgnPieces } from './pgn-chunks';

const game = (n: number, tags = true) =>
  `${tags ? `[Event "Game ${n}"]\n` : ''}[White "White ${n}"]\n[Black "Black ${n}"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 {a comment with [brackets]} Nc6 1-0\n\n`;

async function collect(source: string | Blob, size: number): Promise<string[]> {
  const pieces: string[] = [];
  for await (const piece of pgnPieces(source, size)) pieces.push(piece);
  return pieces;
}

describe('a PGN file read in pieces', () => {
  it('cuts only between games, and loses none of them', async () => {
    const text = Array.from({ length: 200 }, (_, n) => game(n)).join('');
    const pieces = await collect(new Blob([text]), 1_000);
    expect(pieces.length).toBeGreaterThan(10);
    expect(pieces.join('')).toBe(text);
    let total = 0;
    for (const piece of pieces) {
      const parsed = parsePgn(piece);
      // A piece that began or ended inside a game would refuse or misread it.
      expect(parsed.refused).toEqual([]);
      for (const entry of parsed.games) expect(entry.tree.nodes).toBeDefined();
      total += parsed.games.length;
    }
    expect(total).toBe(200);
  });

  it('finds the boundary in a file that never writes an Event tag', async () => {
    const text = Array.from({ length: 50 }, (_, n) => game(n, false)).join('');
    const pieces = await collect(new Blob([text]), 500);
    expect(pieces.length).toBeGreaterThan(5);
    expect(pieces.map((piece) => parsePgn(piece).games.length).reduce((a, b) => a + b)).toBe(50);
  });

  it('keeps a game longer than a piece whole', async () => {
    const long = `[Event "Long"]\n[Result "*"]\n\n${'1. Nf3 Nf6 2. Ng1 Ng8 '.repeat(300)}*\n\n`;
    const pieces = await collect(new Blob([game(1), long, game(2)]), 100);
    expect(pieces.join('')).toBe(game(1) + long + game(2));
    expect(pieces.some((piece) => piece.includes(long))).toBe(true);
  });

  it('decodes characters split across reads', async () => {
    const text = `[Event "Café"]\n[White "Nepomniachtchi, Ян"]\n[Black "B"]\n[Result "1-0"]\n\n1. e4 1-0\n\n`;
    const bytes = new TextEncoder().encode(text.repeat(40));
    // A stream of single bytes cuts every multi-byte character in two.
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
        controller.close();
      },
    });
    const blob = { stream: () => stream } as unknown as Blob;
    expect((await collect(blob, 64)).join('')).toBe(text.repeat(40));
  });

  it('passes a pasted string through as it is', async () => {
    expect(await collect('1. e4 *', 1)).toEqual(['1. e4 *']);
    expect(lastGameBoundary('no games here')).toBe(-1);
  });
});
