import { describe, expect, it } from 'vitest';

import { parsePgn } from '@/chess/pgn';

import { detectPgnEncoding, lastGameBoundary, pgnPieces, readPgnText } from './pgn-chunks';

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

  it('reads a Windows-1252 file as Windows-1252, not as broken UTF-8', async () => {
    // "Müller" and "Gaßner" as a Windows export writes them: one byte each.
    const latin = Uint8Array.from(
      [...'[White "Müller, Jürgen"]\n[Black "Gaßner"]\n[Result "1-0"]\n\n1. e4 1-0\n\n'].map(
        (char) => char.charCodeAt(0),
      ),
    );
    expect(detectPgnEncoding(latin)).toBe('windows-1252');
    const text = (await collect(new Blob([latin]), 1_000)).join('');
    expect(text).toContain('Müller, Jürgen');
    expect(text).toContain('Gaßner');
    expect(text).not.toContain('\uFFFD');
    expect(await readPgnText(new Blob([latin]))).toBe(text);
  });

  it('reads UTF-8, with or without a byte-order mark, and UTF-16 by its mark', async () => {
    const text = '[White "Nepomniachtchi, Ян"]\n\n1. e4 *\n';
    const utf8 = new TextEncoder().encode(text);
    expect(detectPgnEncoding(utf8)).toBe('utf-8');
    const marked = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8]);
    expect(detectPgnEncoding(marked)).toBe('utf-8');
    expect((await collect(new Blob([marked]), 1_000)).join('')).toBe(text);
    const utf16 = new Uint8Array(2 + text.length * 2);
    utf16.set([0xff, 0xfe]);
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      utf16[2 + i * 2] = code & 0xff;
      utf16[3 + i * 2] = code >> 8;
    }
    expect(detectPgnEncoding(utf16)).toBe('utf-16le');
    expect((await collect(new Blob([utf16]), 1_000)).join('')).toBe(text);
  });

  it('passes a pasted string through as it is', async () => {
    expect(await collect('1. e4 *', 1)).toEqual(['1. e4 *']);
    expect(lastGameBoundary('no games here')).toBe(-1);
  });
});
