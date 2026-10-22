/**
 * Reading an En Croissant database in the browser, with the companion's rules.
 *
 * `companion/src/en-croissant.mjs` reads the file with Node's SQLite, from a
 * path, which a browser does not have; this reads the same file, chosen in a
 * file dialog, with SQLite compiled to WebAssembly (sql.js). The checks and
 * the query are the companion's, statement for statement, so a file one
 * refuses the other refuses too, and a game one reads the other reads the
 * same way. `sqlite-read.test.ts` runs them against the database En Croissant
 * wrote that `decode.test.ts` is built on.
 *
 * Never written: the bytes are a copy in memory, and a copy is all sql.js has.
 */

import type { EnCroissantGame, EnCroissantPage } from './types';

/** The one thing this needs from a SQLite library: rows for a statement. */
export type SqlRows = (
  sql: string,
  params?: readonly (number | string)[],
) => readonly Record<string, unknown>[];

/** Format versions confirmed against a file En Croissant wrote (as the companion's list). */
export const SUPPORTED_VERSIONS = ['1.0.0'];

const REQUIRED_TABLES = ['Info', 'Games', 'Players', 'Events', 'Sites'];

const REQUIRED_COLUMNS: Readonly<Record<string, readonly string[]>> = {
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

export interface BrowserEnCroissantInspection {
  readonly supported: boolean;
  readonly reason?: string;
  readonly version?: string | null;
  readonly title?: string | null;
  readonly games?: number;
  readonly firstDate?: string | null;
  readonly lastDate?: string | null;
}

function schemaProblem(rows: SqlRows): string | null {
  for (const [table, required] of Object.entries(REQUIRED_COLUMNS)) {
    const columns = new Set(rows(`PRAGMA table_info(${table})`).map((row) => String(row.name)));
    if (required.some((name) => !columns.has(name)))
      return `Unsupported En Croissant database schema: ${table} columns differ.`;
  }
  return null;
}

function info(rows: SqlRows): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const row of rows('SELECT Name, Value FROM Info')) {
    out[String(row.Name)] = row.Value === null ? null : String(row.Value);
  }
  return out;
}

export function inspectEnCroissant(rows: SqlRows): BrowserEnCroissantInspection {
  const tables = new Set(
    rows("SELECT name FROM sqlite_master WHERE type = 'table'").map((row) => String(row.name)),
  );
  const missing = REQUIRED_TABLES.filter((name) => !tables.has(name));
  if (missing.length > 0) {
    return {
      supported: false,
      reason: `Not an En Croissant database: no ${missing.join(', ')} table.`,
    };
  }
  const problem = schemaProblem(rows);
  if (problem) return { supported: false, reason: problem };
  const facts = info(rows);
  const version = facts.Version ?? null;
  const games = Number(rows('SELECT COUNT(*) AS n FROM Games')[0]?.n ?? 0);
  const dates = rows(
    "SELECT MIN(Date) AS first, MAX(Date) AS last FROM Games WHERE Date IS NOT NULL AND Date <> ''",
  )[0];
  const supported = version !== null && SUPPORTED_VERSIONS.includes(version);
  return {
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
    title: facts.Title ?? null,
    games,
    firstDate: dates?.first == null ? null : String(dates.first),
    lastDate: dates?.last == null ? null : String(dates.last),
  };
}

const text = (value: unknown): string | null => (value == null ? null : String(value));
const number = (value: unknown): number | null => (value == null ? null : Number(value));

function base64(bytes: unknown): string {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) return '';
  let binary = '';
  for (let at = 0; at < bytes.length; at += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  }
  return btoa(binary);
}

/** One page of games, by id, as the companion's `readGames` returns it. */
export function readEnCroissantPage(rows: SqlRows, after: number, limit: number): EnCroissantPage {
  const problem = schemaProblem(rows);
  if (problem) throw new Error(problem);
  if (!SUPPORTED_VERSIONS.includes(info(rows).Version ?? '')) {
    throw new Error('Unsupported En Croissant database version.');
  }
  const size = Math.max(1, Math.min(1000, Number(limit) || 200));
  const found = rows(
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
    [Number(after) || 0, size],
  );
  const games: EnCroissantGame[] = found.map((row) => ({
    id: Number(row.id),
    white: text(row.white),
    black: text(row.black),
    event: text(row.event),
    site: text(row.site),
    date: text(row.date),
    time: text(row.time),
    round: text(row.round),
    whiteElo: number(row.whiteElo),
    blackElo: number(row.blackElo),
    // Declared INTEGER and written as text; read as text, as the companion does.
    result: text(row.result),
    timeControl: text(row.timeControl),
    eco: text(row.eco),
    plyCount: number(row.plyCount),
    fen: text(row.fen),
    moves: base64(row.moves),
  }));
  return { games, nextAfter: games.length === size ? games[games.length - 1]!.id : null };
}
