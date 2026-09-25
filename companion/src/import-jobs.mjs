/**
 * Importing a large file into a companion collection (Phase 85).
 *
 * The browser's importer reads a file into the page, which is fine for a
 * club's games and impossible for Mega Database or a month of Lichess. So the
 * companion reads the file itself, from the path the person chose in the
 * Mac's own dialog: streaming, on worker threads that run the application's
 * own import path (the bundled import kit, `scripts/build-companion-kit.mjs`),
 * with this thread as the one writer. An empty collection is bulk-loaded
 * (`GameDatabase.beginBulk`); a collection with games in it is written the
 * ordinary way. Memory is bounded: a worker waits for the writer before it
 * prepares more.
 *
 * The source file is opened read-only and never written (AGENTS.md
 * "Interoperability"). What was imported, from which file, under which
 * licence the person named, is recorded in the collection itself.
 */

import { existsSync, statSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORKER = new URL('./import-file.worker.mjs', import.meta.url);

/** Where the import kit is: beside the companion in a package, generated in a checkout. */
export function kitFile() {
  return (
    process.env.KINGFISHER_COMPANION_KIT ?? path.join(HERE, '..', 'generated', 'import-kit.mjs')
  );
}

/** Build the kit in a checkout where it has not been built yet. A package ships it. */
export async function ensureKit() {
  const file = kitFile();
  if (existsSync(file)) return file;
  const builder = path.join(HERE, '..', '..', 'scripts', 'build-companion-kit.mjs');
  if (!existsSync(builder))
    throw new Error('This companion has no import kit and cannot build one.');
  const { buildCompanionKit } = await import(pathToFileURL(builder).href);
  return buildCompanionKit(file);
}

const CHESSBASE_PARTS = ['cbh', 'cbg', 'cba', 'cbp', 'cbt', 'cbc', 'cbs', 'cbe', 'cbj'];

/** What a path is, and the files it stands for; refuses anything else. */
export function describeSource(file) {
  if (typeof file !== 'string' || !path.isAbsolute(file)) {
    throw new ImportFileError('The file must be named by its full path.');
  }
  if (!existsSync(file) || !statSync(file).isFile()) {
    throw new ImportFileError('There is no file at that path.');
  }
  const lower = file.toLowerCase();
  if (lower.endsWith('.pgn') || lower.endsWith('.pgn.zst') || lower.endsWith('.pgn.gz')) {
    return { kind: 'pgn', file, bytes: statSync(file).size };
  }
  if (lower.endsWith('.cbh')) {
    const base = file.slice(0, -4);
    const files = {};
    let bytes = 0;
    for (const part of CHESSBASE_PARTS) {
      for (const candidate of [`${base}.${part}`, `${base}.${part.toUpperCase()}`]) {
        if (existsSync(candidate)) {
          files[part] = candidate;
          bytes += statSync(candidate).size;
          break;
        }
      }
    }
    if (!files.cbg)
      throw new ImportFileError('The .cbg file that holds the moves is not beside the .cbh.');
    return { kind: 'chessbase', file, files, bytes };
  }
  throw new ImportFileError(
    'Kingfisher imports a .pgn, .pgn.zst, .pgn.gz or a ChessBase .cbh file here.',
  );
}

export class ImportFileError extends Error {}

/**
 * Run one import to the end (or until `signal` aborts), reporting progress.
 * Returns what happened: counts, time, the peak memory of the whole process.
 */
export async function runImport(database, options, onProgress = () => undefined, signal) {
  const source = describeSource(options.file);
  const kit = await ensureKit();
  const shares = Math.max(1, Math.min(options.workers ?? availableParallelism() - 1, 8));
  const keepPositions = options.keepPositions !== false;
  const bulk = database.count() === 0;
  const started = performance.now();
  const state = {
    kind: source.kind,
    file: source.file,
    bytes: source.bytes,
    bulk,
    workers: shares,
    read: 0,
    imported: 0,
    duplicates: 0,
    rejected: 0,
    failures: [],
    peakRssBytes: 0,
    elapsedMs: 0,
    indexMs: 0,
    stopped: false,
  };
  if (bulk) database.beginBulk();
  const workers = [];
  try {
    await new Promise((resolve, reject) => {
      let finished = 0;
      const stop = () => {
        state.stopped = true;
        for (const worker of workers) void worker.terminate();
        resolve();
      };
      signal?.addEventListener('abort', stop, { once: true });
      for (let share = 0; share < shares; share += 1) {
        const worker = new Worker(WORKER, {
          workerData: {
            kitFile: kit,
            kind: source.kind,
            file: source.file,
            files: source.files ?? null,
            share,
            shares,
            keepPositions,
            batch: source.kind === 'pgn' ? 300 : 500,
          },
        });
        workers.push(worker);
        worker.on('error', reject);
        worker.on('message', (message) => {
          if (message.kind === 'done') {
            finished += 1;
            if (finished === shares) resolve();
            return;
          }
          if (message.payloads.length) {
            const result = database.insertGames(message.payloads);
            state.imported += result.imported;
            state.duplicates += result.duplicates;
          }
          state.read += message.read;
          state.rejected += message.rejected;
          if (state.failures.length < 50) state.failures.push(...message.failures);
          const rss = process.memoryUsage().rss;
          if (rss > state.peakRssBytes) state.peakRssBytes = rss;
          state.elapsedMs = performance.now() - started;
          onProgress({ ...state, phase: 'importing' });
          worker.postMessage('ack');
        });
      }
    });
  } finally {
    if (bulk) {
      onProgress({ ...state, phase: 'indexing' });
      const indexing = performance.now();
      database.endBulk();
      state.indexMs = performance.now() - indexing;
    }
    state.elapsedMs = performance.now() - started;
  }
  database.recordSource({
    file: path.basename(source.file),
    kind: source.kind,
    bytes: source.bytes,
    games: state.imported,
    licence: typeof options.licence === 'string' ? options.licence.slice(0, 200) : null,
    note: typeof options.note === 'string' ? options.note.slice(0, 500) : null,
    importedAt: Date.now(),
    stopped: state.stopped,
  });
  onProgress({ ...state, phase: state.stopped ? 'stopped' : 'done' });
  return state;
}

/** Imports the server runs in the background, one per collection at a time. */
export class ImportJobs {
  #jobs = new Map();
  #next = 1;

  start(key, database, options) {
    for (const job of this.#jobs.values()) {
      if (job.key === key && (job.status.phase === 'importing' || job.status.phase === 'starting'))
        throw new ImportFileError('An import into this collection is already running.');
    }
    describeSource(options.file);
    const id = String(this.#next++);
    const controller = new AbortController();
    const job = { key, controller, status: { phase: 'starting' } };
    this.#jobs.set(id, job);
    runImport(database, options, (status) => (job.status = status), controller.signal).catch(
      (error) => {
        job.status = {
          ...job.status,
          phase: 'failed',
          error: error instanceof Error ? error.message : String(error),
        };
      },
    );
    return id;
  }

  status(id) {
    return this.#jobs.get(String(id))?.status ?? null;
  }

  cancel(id) {
    this.#jobs.get(String(id))?.controller.abort();
  }
}
