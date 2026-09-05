import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { readGames } from '../../../companion/src/en-croissant.mjs';
import { GameDatabase } from '../../../companion/src/database.mjs';
import { parsePgn } from '@/chess/pgn';
import { loadOpeningIndex } from '@/theory/openings';
import { enCroissantPgn, prepareEnCroissantGame } from './prepare';
import type { EnCroissantGame } from './types';

const fixture = fileURLToPath(new URL('./__fixtures__/en-croissant-0.15.db', import.meta.url));
describe('direct En Croissant migration', () => {
  it(
    'imports the authentic fixture through normalization and position indexing into production SQLite',
    { timeout: 60_000 },
    async () => {
      const rows = readGames(fixture, { limit: 100 }).games as EnCroissantGame[];
      const openings = await loadOpeningIndex();
      const prepared = rows.map((row) => prepareEnCroissantGame(row, openings));
      const database = new GameDatabase(':memory:');
      try {
        expect(database.insertGames(prepared)).toMatchObject({ imported: 60, duplicates: 0 });
        expect(database.insertGames(prepared)).toMatchObject({ imported: 0, duplicates: 60 });
        expect(database.count()).toBe(60);
        const integrity = database.aggregateIntegrity();
        expect(integrity.positions).toBe(5077);
        expect(integrity.aggregatedPositions).toBe(5077);
        for (let i = 0; i < rows.length; i++) {
          const headers = parsePgn(prepared[i]!.pgn).games[0]!.tree.headers;
          expect(headers.White).toBe(rows[i]!.white);
          expect(headers.Black).toBe(rows[i]!.black);
          expect(headers.Result).toBe(rows[i]!.result);
          expect(headers.Date).toBe(rows[i]!.date);
        }
        expect(prepared.some((game) => game.pgn.includes('[%clk'))).toBe(true);
      } finally {
        database.close();
      }
    },
  );

  it('refuses mismatched game lengths rather than importing a plausible prefix', () => {
    const row = readGames(fixture, { limit: 1 }).games[0] as EnCroissantGame;
    expect(() => enCroissantPgn({ ...row, plyCount: 999999 })).toThrow(/ply count/);
  });
});
