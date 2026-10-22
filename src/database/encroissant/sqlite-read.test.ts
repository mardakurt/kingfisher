import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import initSqlJs from 'sql.js';
import { describe, expect, it } from 'vitest';

// The companion's own reader: the browser's must agree with it row for row.
import { inspect, readGames } from '../../../companion/src/en-croissant.mjs';

import { enCroissantPgn } from './prepare';
import { inspectEnCroissant, readEnCroissantPage, type SqlRows } from './sqlite-read';

const FIXTURE = fileURLToPath(new URL('./__fixtures__/en-croissant-0.15.db', import.meta.url));
const require = createRequire(import.meta.url);

async function open(bytes: Uint8Array): Promise<SqlRows> {
  const SQL = await initSqlJs({ locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm') });
  const database = new SQL.Database(bytes);
  return (sql, params = []) => {
    const statement = database.prepare(sql);
    statement.bind([...params]);
    const rows: Record<string, unknown>[] = [];
    while (statement.step()) rows.push(statement.getAsObject());
    statement.free();
    return rows;
  };
}

describe('En Croissant read in the browser', () => {
  it('inspects the file as the companion does', async () => {
    const rows = await open(readFileSync(FIXTURE));
    const here = inspectEnCroissant(rows);
    const there = inspect(FIXTURE);
    expect(here).toMatchObject({
      supported: there.supported,
      version: there.version,
      games: there.games,
      firstDate: there.firstDate,
      lastDate: there.lastDate,
    });
    expect(here.supported).toBe(true);
  });

  it('reads every page exactly as the companion does, and each game converts', async () => {
    const rows = await open(readFileSync(FIXTURE));
    let after = 0;
    let read = 0;
    for (;;) {
      const here = readEnCroissantPage(rows, after, 7);
      const there = readGames(FIXTURE, { after, limit: 7 });
      expect(here).toEqual(there);
      for (const game of here.games) expect(() => enCroissantPgn(game)).not.toThrow();
      read += here.games.length;
      if (here.nextAfter === null) break;
      after = here.nextAfter;
    }
    expect(read).toBe(inspect(FIXTURE).games);
    // Every page reopens the file on the companion's side, and converts every game here.
  }, 60_000);

  it('refuses a SQLite file that is not an En Croissant database', async () => {
    const SQL = await initSqlJs({ locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm') });
    const other = new SQL.Database();
    other.run('CREATE TABLE notes (id INTEGER, text TEXT)');
    const rows = await open(other.export());
    expect(inspectEnCroissant(rows)).toMatchObject({ supported: false });
    expect(inspectEnCroissant(rows).reason).toMatch(/Not an En Croissant database/);
  });
});
