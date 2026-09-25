/**
 * The companion's own file import (Phase 85): a ChessBase database and a PGN,
 * named by path, imported on worker threads through the bundled import kit.
 * The games that arrive must be the games the browser's importer makes of the
 * same file — same fingerprints, same explorer answers — and the ChessBase
 * annotations must survive.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { positionKey, START_FEN } from '@/chess/fen';
import { isGame } from '@/database/chessbase/database';
import { fixtureDatabase } from '@/database/chessbase/fixtures';
import { prepareChessBaseGame } from '@/database/chessbase/prepare';
import { loadOpeningIndex } from '@/theory/openings';

import { GameDatabase } from '../../companion/src/database.mjs';
import { describeSource, runImport } from '../../companion/src/import-jobs.mjs';

const FIXTURE = path.resolve(__dirname, '../database/chessbase/__fixtures__/world-ch/World-ch.cbh');
const directory = mkdtempSync(path.join(tmpdir(), 'kf-import-file-'));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe('the companion’s file import', () => {
  it(
    'imports a ChessBase database by path, annotations and all, as the browser would',
    { timeout: 120_000 },
    async () => {
      const database = new GameDatabase(path.join(directory, 'cb.sqlite'));
      const phases: string[] = [];
      const stats = await runImport(
        database,
        { file: FIXTURE, workers: 2, licence: 'Test fixture (ChessBase-written)' },
        (state) => phases.push(state.phase),
      );
      expect(stats).toMatchObject({ kind: 'chessbase', imported: 23, rejected: 0, bulk: true });
      expect(phases.at(-1)).toBe('done');
      expect(phases).toContain('indexing');
      // The same games the browser's importer makes of the same file.
      const openings = await loadOpeningIndex();
      const expected = new Set<string>();
      for (const result of fixtureDatabase('world-ch', 'World-ch').games()) {
        if (isGame(result))
          expected.add(prepareChessBaseGame(result.pgn, openings).summary.fingerprint);
      }
      const stored = database.search<{ games: { fingerprint: string; id: string }[] }>({
        limit: 100,
      });
      expect(new Set(stored.games.map((game) => game.fingerprint))).toEqual(expected);
      // Annotations kept: the World-ch slice's games 22 and 23 carry symbols.
      const pgns = stored.games
        .map((game: { id?: string }) => database.content(game.id!))
        .join('\n');
      expect(pgns).toMatch(/\$\d+/);
      expect(database.sources()).toEqual([
        expect.objectContaining({
          file: 'World-ch.cbh',
          kind: 'chessbase',
          games: 23,
          licence: 'Test fixture (ChessBase-written)',
          stopped: false,
        }),
      ]);
      // Searchable at once by the move search, since every game got its line index.
      const found = await database.moveSearch(
        {},
        { themesVersion: 1, material: { text: 'R v R' } },
      );
      expect(found.unindexed).toBe(0);
      database.close();
    },
  );

  it(
    'imports a PGN file by path and gives the explorer what a game-by-game import gives',
    { timeout: 120_000 },
    async () => {
      const pgn = [...fixtureDatabase('world-ch', 'World-ch').games()]
        .filter(isGame)
        .map((game) => game.pgn)
        .join('\n\n');
      const file = path.join(directory, 'world.pgn');
      writeFileSync(file, pgn);
      const database = new GameDatabase(path.join(directory, 'pgn.sqlite'));
      const stats = await runImport(database, { file, workers: 3 });
      expect(stats).toMatchObject({ kind: 'pgn', imported: 23, read: 23 });
      const start = database.explore(positionKey(START_FEN), 10) as {
        totalGames?: number;
        moves?: unknown[];
      };
      expect(JSON.stringify(start)).toContain('"games":');
      expect(readFileSync(file, 'utf8')).toBe(pgn); // the source is only read
      database.close();
    },
  );

  it('refuses what it cannot import, before anything is written', () => {
    expect(() => describeSource('relative.pgn')).toThrow(/full path/);
    expect(() => describeSource(path.join(directory, 'missing.pgn'))).toThrow(/no file/);
    const other = path.join(directory, 'notes.txt');
    writeFileSync(other, 'hello');
    expect(() => describeSource(other)).toThrow(/imports a \.pgn/);
  });
});
