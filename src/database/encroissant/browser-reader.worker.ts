/// <reference lib="webworker" />

/**
 * An En Croissant database chosen in the browser, read in a worker.
 *
 * sql.js holds the whole file in memory, so a file is refused above
 * `EN_CROISSANT_BROWSER_LIMIT` rather than taken until the tab runs out of it.
 * Each page comes back as PGN, converted by the same `enCroissantPgn` the
 * companion path uses, and is stored by the same import that reads any PGN.
 */

import initSqlJs from 'sql.js';

import { enCroissantPgn } from './prepare';
import { inspectEnCroissant, readEnCroissantPage, type SqlRows } from './sqlite-read';
import {
  EN_CROISSANT_BROWSER_LIMIT,
  type BrowserReaderRequest,
  type BrowserReaderResponse,
} from './browser-reader-protocol';

const WASM_URL = new URL('sql.js/dist/sql-wasm.wasm', import.meta.url).href;

let rows: SqlRows | null = null;

const post = (message: BrowserReaderResponse) => self.postMessage(message);

self.onmessage = (event: MessageEvent<BrowserReaderRequest>) => {
  void handle(event.data).catch((error: unknown) =>
    post({ type: 'error', error: error instanceof Error ? error.message : String(error) }),
  );
};

async function handle(request: BrowserReaderRequest): Promise<void> {
  if (request.type === 'open') {
    if (request.file.size > EN_CROISSANT_BROWSER_LIMIT) {
      throw new Error(
        `This file is ${(request.file.size / 1e9).toFixed(1)} GB; a browser reads En Croissant files up to ${EN_CROISSANT_BROWSER_LIMIT / 1e9} GB, because the whole file is held in memory. Export it to PGN from En Croissant and use Import PGN, which takes any size.`,
      );
    }
    const SQL = await initSqlJs({ locateFile: () => WASM_URL });
    const bytes = new Uint8Array(await request.file.arrayBuffer());
    let database;
    try {
      database = new SQL.Database(bytes);
      database.exec('SELECT 1 FROM sqlite_master LIMIT 1');
    } catch {
      throw new Error('That file could not be opened as a database.');
    }
    const opened = database;
    rows = (sql, params = []) => {
      const statement = opened.prepare(sql);
      try {
        statement.bind([...params]);
        const found: Record<string, unknown>[] = [];
        while (statement.step()) found.push(statement.getAsObject());
        return found;
      } finally {
        statement.free();
      }
    };
    post({ type: 'opened', inspection: inspectEnCroissant(rows) });
    return;
  }
  if (!rows) throw new Error('Choose the database again; the reader was restarted.');
  const page = readEnCroissantPage(rows, request.after, request.limit);
  const pgn: string[] = [];
  const rejected: { id: number; reason: string }[] = [];
  for (const game of page.games) {
    try {
      pgn.push(enCroissantPgn(game));
    } catch (error) {
      rejected.push({
        id: game.id,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  post({
    type: 'page',
    pgn: pgn.join('\n\n'),
    converted: pgn.length,
    examined: page.games.length,
    rejected,
    lastId: page.games.at(-1)?.id ?? request.after,
    nextAfter: page.nextAfter,
  });
}

export {};
