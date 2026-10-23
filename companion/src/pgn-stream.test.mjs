/**
 * A file a person chose is read in the encoding it was written in: a
 * Windows-1252 export from ChessBase keeps its accented names, a UTF-8 file
 * with a byte-order mark keeps its first tag, and a UTF-8 file is read as it
 * always was.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { detectPgnEncoding, readGameTexts, readGames } from './pgn-stream.mjs';

const directory = mkdtempSync(path.join(tmpdir(), 'kingfisher-pgn-stream-'));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

const GAME =
  '[Event "Bundesliga"]\n[White "Müller, Jürgen"]\n[Black "Gaßner, Ève"]\n[Result "1-0"]\n\n1. e4 e5 1-0\n\n';

const write = (name, bytes) => {
  const file = path.join(directory, name);
  writeFileSync(file, bytes);
  return file;
};

describe('a chosen PGN file', () => {
  it('is read as Windows-1252 when that is what it is', async () => {
    const file = write('latin.pgn', Buffer.from(GAME, 'latin1'));
    expect(detectPgnEncoding(Buffer.from(GAME, 'latin1'))).toBe('windows-1252');
    const games = [];
    for await (const game of readGames(file)) games.push(game.tags);
    expect(games).toEqual([
      expect.objectContaining({ White: 'Müller, Jürgen', Black: 'Gaßner, Ève' }),
    ]);
    const texts = [];
    for await (const text of readGameTexts(file)) texts.push(text);
    expect(texts[0]).toContain('[White "Müller, Jürgen"]');
    expect(texts[0]).not.toContain('�');
  });

  it('keeps its first tag behind a UTF-8 byte-order mark, and reads plain UTF-8 unchanged', async () => {
    const marked = write(
      'marked.pgn',
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(GAME)]),
    );
    const plain = write('plain.pgn', Buffer.from(GAME));
    for (const file of [marked, plain]) {
      const games = [];
      for await (const game of readGames(file)) games.push(game.tags);
      expect(games[0]).toMatchObject({ Event: 'Bundesliga', White: 'Müller, Jürgen' });
    }
  });
});
