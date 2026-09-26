import { parentPort, workerData } from 'node:worker_threads';
import { DatabaseSync } from 'node:sqlite';
import { GameDatabase } from './database.mjs';
import { buildClaimIndex, claimIndexReady } from './position-schema.mjs';
import { POSTINGS_LAYOUT, readLayout } from './postings.mjs';

const { file, operation } = workerData;
const cancelled = new Int32Array(workerData.cancel);
let database;
const progress = (value) => {
  if (Atomics.load(cancelled, 0)) throw new Error('Cancelled at a safe maintenance boundary.');
  parentPort.postMessage({ kind: 'progress', progress: value });
};
try {
  let result;
  if (operation === 'compact') {
    database = new GameDatabase(file);
    result = database.compactPositions({
      onProgress: (value) =>
        progress({
          phase: value.phase,
          progress:
            value.phase === 'encoding' && value.total
              ? Math.min(100, Math.round((value.completed / value.total) * 100))
              : null,
        }),
    });
    if (!result.migrated && result.reason !== 'already-compact')
      throw new Error(`Migration refused: ${result.reason}.`);
    result = { ...result, schema: database.schemaStatus() };
  } else if (operation === 'postings') {
    /*
      Phase 86: convert a row-layout collection to the posting layout. Chunked
      and resumable (`migrateToPostings`): cancelling stops at a committed
      chunk, and the next run carries on from its cursor. Nothing is deleted
      until every game has its postings and their count equals the rows'.
    */
    database = new GameDatabase(file);
    const converted = database.convertToPostings({
      onProgress: ({ phase, converted: done, total }) =>
        progress({
          phase:
            phase === 'reclaiming'
              ? 'Giving the freed disk back'
              : 'Converting to the compact position index',
          progress:
            phase === 'reclaiming'
              ? null
              : total
                ? Math.min(100, Math.round((done / total) * 100))
                : null,
        }),
    });
    result = { ...converted, schema: database.schemaStatus() };
  } else if (operation === 'claim-index') {
    /*
      Building the claim index for a collection that predates it.

      It runs here, in the worker, for the same reason compaction does: it
      writes millions of rows and a companion answering explorer queries on the
      request thread while it does that is a companion that stops answering.
      The build is chunked and records a cursor, so cancelling it at a chunk
      boundary leaves a partial index that the *next* run resumes — and, until
      one of them finishes, the search falls back to scanning rather than
      trusting a half-built index.
    */
    database = new GameDatabase(file);
    const handle = database.handleForTest();
    const build = buildClaimIndex(handle, {
      onProgress: ({ indexed, total }) =>
        progress({
          phase: 'Indexing claims',
          progress: total ? Math.min(100, Math.round((indexed / total) * 100)) : null,
        }),
    });
    result = { ...build, ready: claimIndexReady(handle) };
  } else {
    // Read-only even when cancelled: opening must not run schema repair.
    database = new DatabaseSync(file, { readOnly: true });
    database.exec('BEGIN');
    // A posting-layout collection's aggregates are its hot positions'
    // (postings.mjs); the check is the same equation over those tables.
    const postingLayout = readLayout(database) === POSTINGS_LAYOUT;
    const queries = postingLayout
      ? {
          positions:
            'SELECT COUNT(*) AS n FROM postings WHERE pos IN (SELECT DISTINCT pos FROM posting_aggregates)',
          aggregatedPositions: 'SELECT COALESCE(SUM(games), 0) AS n FROM posting_aggregates',
          aggregateRows: 'SELECT COUNT(*) AS n FROM posting_aggregates',
          filteredCacheKeys: 'SELECT COUNT(*) AS n FROM posting_filter_keys',
          filteredAggregateRows: 'SELECT COUNT(*) AS n FROM posting_filter_cells',
          postings: 'SELECT COUNT(*) AS n FROM postings',
        }
      : {
          positions: 'SELECT COUNT(*) AS n FROM positions',
          aggregatedPositions: 'SELECT COALESCE(SUM(games), 0) AS n FROM position_aggregates',
          aggregateRows: 'SELECT COUNT(*) AS n FROM position_aggregates',
          filteredCacheKeys: 'SELECT COUNT(*) AS n FROM position_filter_cache_keys',
          filteredAggregateRows: 'SELECT COUNT(*) AS n FROM position_filter_cache',
        };
    result = {};
    for (const [name, sql] of Object.entries(queries)) {
      progress({ phase: `Checking ${name}`, progress: null });
      result[name] = database.prepare(sql).get().n;
    }
    progress({ phase: 'Checking SQLite page integrity', progress: null });
    result.sqlite = database
      .prepare('PRAGMA integrity_check')
      .all()
      .map((row) => row.integrity_check);
    result.consistent =
      result.positions === result.aggregatedPositions &&
      result.sqlite.length === 1 &&
      result.sqlite[0] === 'ok';
    database.exec('COMMIT');
  }
  parentPort.postMessage({ kind: 'result', result });
} catch (error) {
  parentPort.postMessage({ kind: 'error', error: error.message });
} finally {
  database?.close();
}
