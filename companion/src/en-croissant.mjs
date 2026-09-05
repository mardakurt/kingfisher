/**
 * Reading an En Croissant database, without writing to it.
 *
 * En Croissant keeps a whole database in one SQLite file. Somebody moving to
 * Kingfisher already has that file, and asking them to export several million
 * games to PGN first — and then reimport them — is a migration nobody
 * completes. This reads it directly.
 *
 * Two rules shape everything here.
 *
 * **Read-only, always.** The file belongs to another program that may be
 * running right now. It is opened `readOnly`, never migrated, never repaired,
 * never written. Kingfisher imports *from* it into a database of its own.
 *
 * **Never guess.** The schema is read and checked against the version En
 * Croissant records in its own `Info` table. A file that is not recognisably an
 * En Croissant database, or is a version whose meaning has not been confirmed,
 * is refused by name rather than parsed hopefully — column meanings guessed
 * wrong produce games that are plausible and false.
 *
 * Move decoding does not happen here. The `Moves` blob is handed to the
 * application, which decodes it with the same rules code it uses for
 * everything else; see `src/database/encroissant/decode.ts`.
 */

import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Database format versions whose column meanings have been confirmed against a
 * file that En Croissant actually wrote.
 *
 * Adding a version to this list is a claim that somebody checked it, not that
 * it looked similar. See `src/database/encroissant/decode.test.ts`.
 */
export const SUPPORTED_VERSIONS = ['1.0.0'];

/** Tables an En Croissant database always has. */
const REQUIRED_TABLES = ['Info', 'Games', 'Players', 'Events', 'Sites'];

export class EnCroissantError extends Error {
  constructor(message, remedy) {
    super(message);
    this.name = 'EnCroissantError';
    if (remedy) this.remedy = remedy;
  }
}

function openRead(file) {
  const target = path.resolve(String(file ?? ''));
  if (!existsSync(target)) throw new EnCroissantError('That file does not exist.');
  const stats = statSync(target);
  if (!stats.isFile()) throw new EnCroissantError('That path is not a file.');
  let database;
  try {
    database = new DatabaseSync(target, { readOnly: true });
    /*
      Opening succeeds for anything; SQLite only reads the header when a
      statement runs. Without this probe a text file reaches the table check
      below and fails there as a schema problem, which tells the user their
      En Croissant database is the wrong version rather than that they picked
      their shopping list.
    */
    database.prepare('SELECT 1 FROM sqlite_master LIMIT 1').all();
  } catch (error) {
    database?.close();
    throw new EnCroissantError(
      'That file could not be opened as a database.',
      error instanceof Error ? error.message : undefined,
    );
  }
  return { database, target, size: stats.size };
}

const REQUIRED_COLUMNS = {
  Info: ['Name', 'Value'],
  Games: [
    'ID',
    'Date',
    'UTCTime',
    'Round',
    'WhiteElo',
    'BlackElo',
    'Result',
    'TimeControl',
    'ECO',
    'PlyCount',
    'FEN',
    'Moves',
    'WhiteID',
    'BlackID',
    'EventID',
    'SiteID',
  ],
  Players: ['ID', 'Name'],
  Events: ['ID', 'Name'],
  Sites: ['ID', 'Name'],
};
function schemaProblem(database) {
  for (const [table, required] of Object.entries(REQUIRED_COLUMNS)) {
    const columns = new Set(
      database
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map((row) => row.name),
    );
    if (required.some((name) => !columns.has(name)))
      return `Unsupported En Croissant database schema: ${table} columns differ.`;
  }
  return null;
}

const infoRows = (database) => {
  const rows = database.prepare('SELECT Name, Value FROM Info').all();
  const info = {};
  for (const row of rows) info[String(row.Name)] = row.Value === null ? null : String(row.Value);
  return info;
};

/**
 * What this file is, and whether Kingfisher can read it.
 *
 * Answers for any SQLite file rather than throwing on the ordinary case of
 * "the user picked the wrong file": `format` says what was found, and the
 * caller decides what to say about it.
 */
export function inspect(file) {
  const { database, target, size } = openRead(file);
  try {
    const tables = new Set(
      database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((row) => String(row.name)),
    );
    const missing = REQUIRED_TABLES.filter((name) => !tables.has(name));
    if (missing.length > 0) {
      return {
        file: target,
        format: 'unrecognised',
        supported: false,
        reason: `Not an En Croissant database: no ${missing.join(', ')} table.`,
        sizeBytes: size,
      };
    }

    const problem = schemaProblem(database);
    if (problem)
      return {
        file: target,
        format: 'en-croissant',
        supported: false,
        reason: problem,
        sizeBytes: size,
      };
    const info = infoRows(database);
    const version = info.Version ?? null;
    const games = database.prepare('SELECT COUNT(*) AS n FROM Games').get().n;
    const players = database.prepare('SELECT COUNT(*) AS n FROM Players').get().n;
    const events = database.prepare('SELECT COUNT(*) AS n FROM Events').get().n;
    const sites = database.prepare('SELECT COUNT(*) AS n FROM Sites').get().n;
    const dates = database
      .prepare(
        "SELECT MIN(Date) AS first, MAX(Date) AS last FROM Games WHERE Date IS NOT NULL AND Date <> ''",
      )
      .get();

    const supported = version !== null && SUPPORTED_VERSIONS.includes(version);
    return {
      file: target,
      format: 'en-croissant',
      supported,
      ...(supported
        ? {}
        : {
            reason:
              version === null
                ? 'This database does not record a format version.'
                : `Unsupported En Croissant database version ${version}.`,
          }),
      version,
      title: info.Title ?? null,
      description: info.Description ?? null,
      games: Number(games),
      players: Number(players),
      events: Number(events),
      sites: Number(sites),
      firstDate: dates?.first ?? null,
      lastDate: dates?.last ?? null,
      sizeBytes: size,
    };
  } finally {
    database.close();
  }
}

/**
 * One page of games, newest id last, with the move blob left undecoded.
 *
 * Paged by `id > after` rather than by OFFSET, so the cost of reaching page a
 * thousand is the same as reaching page one and a database of several million
 * games is never materialised. `Moves` comes back base64 because it is binary
 * and the transport is JSON.
 */
export function readGames(file, { after = 0, limit = 200 } = {}) {
  const { database } = openRead(file);
  try {
    const problem = schemaProblem(database);
    if (problem) throw new EnCroissantError(problem);
    if (!SUPPORTED_VERSIONS.includes(infoRows(database).Version))
      throw new EnCroissantError('Unsupported En Croissant database version.');
    const size = Math.max(1, Math.min(1000, Number(limit) || 200));
    const rows = database
      .prepare(
        `SELECT g.ID AS id, g.Date AS date, g.UTCTime AS time, g.Round AS round,
                g.WhiteElo AS whiteElo, g.BlackElo AS blackElo, g.Result AS result,
                g.TimeControl AS timeControl, g.ECO AS eco, g.PlyCount AS plyCount,
                g.FEN AS fen, g.Moves AS moves,
                w.Name AS white, b.Name AS black, e.Name AS event, s.Name AS site
           FROM Games g
           LEFT JOIN Players w ON w.ID = g.WhiteID
           LEFT JOIN Players b ON b.ID = g.BlackID
           LEFT JOIN Events  e ON e.ID = g.EventID
           LEFT JOIN Sites   s ON s.ID = g.SiteID
          WHERE g.ID > ?
          ORDER BY g.ID
          LIMIT ?`,
      )
      .all(Number(after) || 0, size);

    const games = rows.map((row) => ({
      id: Number(row.id),
      white: row.white === null ? null : String(row.white),
      black: row.black === null ? null : String(row.black),
      event: row.event === null ? null : String(row.event),
      site: row.site === null ? null : String(row.site),
      date: row.date === null ? null : String(row.date),
      time: row.time === null ? null : String(row.time),
      round: row.round === null ? null : String(row.round),
      whiteElo: row.whiteElo === null ? null : Number(row.whiteElo),
      blackElo: row.blackElo === null ? null : Number(row.blackElo),
      /*
        Declared INTEGER in the schema and written as text by the program, so
        both are accepted. Reading "1-0" as a number would silently turn every
        decisive game into a draw.
      */
      result: row.result === null ? null : String(row.result),
      timeControl: row.timeControl === null ? null : String(row.timeControl),
      eco: row.eco === null ? null : String(row.eco),
      plyCount: row.plyCount === null ? null : Number(row.plyCount),
      fen: row.fen === null ? null : String(row.fen),
      moves: row.moves ? Buffer.from(row.moves).toString('base64') : '',
    }));

    return {
      games,
      nextAfter: games.length === size ? games[games.length - 1].id : null,
    };
  } finally {
    database.close();
  }
}
