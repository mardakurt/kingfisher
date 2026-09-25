/**
 * One slice of a move search over a companion database (Phase 85).
 *
 * Opens the file read-only, reads the compact line index of every game in its
 * id range that the header filters select, and asks each the question with
 * the application's own matchers (generated into `./shared/`). A slice is
 * independent of every other, so a search runs as many slices at once as the
 * machine has cores.
 */

import { DatabaseSync } from 'node:sqlite';
import { parentPort, workerData } from 'node:worker_threads';

import { decodeLineIndex, scanLineIndex } from './shared/line-index.mjs';
import { parseMaterialQuery } from './shared/material-query.mjs';
import { parseRoute } from './shared/route.mjs';

const { file, from, to, where, params, deep } = workerData;

const query = { themesVersion: deep.themesVersion };
if (deep.material) {
  const parsed = parseMaterialQuery(deep.material.text);
  if (!parsed.ok) throw new Error(parsed.error);
  query.material = {
    query: parsed.query,
    ...(deep.material.colour ? { colour: deep.material.colour } : {}),
  };
}
if (deep.theme) query.theme = deep.theme;
if (deep.route) {
  const parsed = parseRoute(deep.route.text);
  if (!parsed.ok) throw new Error(parsed.error);
  query.route = {
    route: parsed.route,
    ...(deep.route.colour ? { colour: deep.route.colour } : {}),
  };
}

const db = new DatabaseSync(file, { readOnly: true });
const filter = where.length ? `AND ${where.join(' AND ')}` : '';
const rows = db
  .prepare(
    `SELECT l.game_id AS id, l.data AS data FROM games JOIN game_lines l ON l.game_id = games.id
      WHERE games.id > ? AND games.id <= ? ${filter}`,
  )
  .iterate(from, to, ...params);

const hits = [];
let scanned = 0;
const unanswerable = [];
for (const row of rows) {
  scanned += 1;
  const line = decodeLineIndex(row.data);
  if (!line) {
    unanswerable.push(row.id);
    continue;
  }
  const answer = scanLineIndex(line, query);
  if (answer.kind === 'hit') hits.push([row.id, answer.ply]);
  else if (answer.kind === 'unanswerable') unanswerable.push(row.id);
}
db.close();
parentPort.postMessage({ hits, scanned, unanswerable });
