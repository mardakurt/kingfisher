/**
 * One share of a large import, prepared off the main thread (Phase 85).
 *
 * Worker k of n reads the archive and takes every game whose position in it
 * is k modulo n, running the application's own import path on it — parsePgn,
 * normalizeGame, classifyTree, indexGame, the line index — and hands the
 * payloads to the main thread, which is the one writer. Preparing is most of
 * an import's cost; writing is one SQLite transaction per batch.
 */

import { parentPort, workerData } from 'node:worker_threads';

import { closeApp, loadApp } from './load-app.mjs';
import { readGameTexts } from './reference/pgn-stream.mjs';

const { files, share, shares, limit, positions: keepPositions } = workerData;
const PARSE_BATCH = 400;

const { parsePgn } = await loadApp(['/src/chess/pgn/index.ts']);
const { normalizeGame, indexGame } = await loadApp(['/src/persistence/prepare-game.ts']);
const { classifyTree } = await loadApp(['/src/theory/classify-games.ts']);
const { loadOpeningIndex } = await loadApp(['/src/theory/openings.ts']);
const { lineIndexForTree } = await loadApp(['/src/search/line-index-encode.ts']);
const openings = await loadOpeningIndex();

let credits = 4;
let wake = null;
parentPort.on('message', (message) => {
  if (message === 'ack') {
    credits += 1;
    wake?.();
  }
});
const waitForCredit = async () => {
  while (credits <= 0) await new Promise((resolve) => (wake = resolve));
  credits -= 1;
};

let pending = [];
let rejected = 0;
const flush = async () => {
  if (pending.length === 0) return;
  const text = pending.join('\n\n');
  const count = pending.length;
  pending = [];
  let parsed;
  try {
    parsed = parsePgn(text);
  } catch {
    rejected += count;
    return;
  }
  rejected += Math.max(0, count - parsed.games.length);
  const prepared = [];
  for (const game of parsed.games) {
    try {
      if (
        game.issues.some((issue) => issue.severity === 'error') ||
        (game.tree.headers.Variant && game.tree.headers.Variant !== 'Standard')
      ) {
        rejected += 1;
        continue;
      }
      const base = normalizeGame(game.tree);
      const record = { ...base, ...classifyTree(openings, base.tree) };
      const rows = indexGame(record);
      prepared.push({
        game: {
          fingerprint: record.fingerprint,
          white: record.white,
          black: record.black,
          whiteKey: record.whiteKey,
          blackKey: record.blackKey,
          result: record.result,
          date: record.date,
          year: record.year,
          event: record.event,
          site: record.site,
          round: record.round,
          whiteRating: record.whiteRating,
          blackRating: record.blackRating,
          eco: record.eco,
          opening: record.opening,
          classification: record.classification,
          classifiedWith: record.classifiedWith,
          plyCount: rows.length,
          importedAt: record.importedAt,
        },
        pgn: record.normalizedPgn,
        positions: keepPositions ? rows : [],
        line: lineIndexForTree(record.tree),
      });
    } catch {
      rejected += 1;
    }
  }
  await waitForCredit();
  parentPort.postMessage({ kind: 'batch', prepared, rejected });
  rejected = 0;
};

let index = 0;
let taken = 0;
outer: for (const file of files) {
  for await (const text of readGameTexts(file)) {
    const mine = index % shares === share;
    index += 1;
    if (!mine) continue;
    pending.push(text);
    taken += 1;
    if (pending.length >= PARSE_BATCH) await flush();
    if (taken >= limit) break outer;
  }
}
await flush();
parentPort.postMessage({ kind: 'done', read: index });
await closeApp();
