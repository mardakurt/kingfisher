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

import { existsSync, statSync, createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { importFilter } from './import-filter.mjs';
import { checkImportStorage } from './collection-location.mjs';
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

/**
 * The kit, loaded, and able to serve a posting-layout collection (Phase 86).
 *
 * `ensureKit` builds a kit only when there is none, so a checkout can hold one
 * generated before `moveSan` existed; a posting-layout collection would then
 * fail on its first explorer query. A kit without it is rebuilt where the
 * builder exists (a checkout) and refused where it does not (a package ships
 * the kit its own build produced).
 */
export async function loadKit() {
  const file = await ensureKit();
  let kit = await import(pathToFileURL(file).href);
  if (typeof kit.moveSan === 'function' && typeof kit.sanMap === 'function') return kit;
  const builder = path.join(HERE, '..', '..', 'scripts', 'build-companion-kit.mjs');
  if (!existsSync(builder)) {
    throw new Error("This companion's import kit is out of date: it cannot read compact indexes.");
  }
  const { buildCompanionKit } = await import(pathToFileURL(builder).href);
  await buildCompanionKit(file);
  kit = await import(`${pathToFileURL(file).href}?built=${Date.now()}`);
  if (typeof kit.sanMap !== 'function') throw new Error('The rebuilt import kit lacks sanMap.');
  return kit;
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
  const maxBytes = options.maxBytes ?? 10 * 1024 ** 3;
  checkImportStorage(database.file, maxBytes);
  importFilter({}, options.filters);
  let verifiedDigest = null;
  if (options.sha256) {
    if (source.kind !== 'pgn' || !/^[a-f0-9]{64}$/i.test(options.sha256))
      throw new ImportFileError(
        'A SHA-256 must be 64 hexadecimal characters for the selected PGN archive.',
      );
    onProgress({ phase: 'verifying', file: source.file, bytes: source.bytes });
    const hash = createHash('sha256');
    for await (const bytes of createReadStream(source.file)) {
      if (signal?.aborted) throw new ImportFileError('Verification cancelled; no games imported.');
      hash.update(bytes);
    }
    verifiedDigest = hash.digest('hex');
    if (verifiedDigest !== options.sha256.toLowerCase())
      throw new ImportFileError('Archive checksum mismatch; no games imported.');
  }
  database.setStorageLimit(maxBytes);
  const kit = await ensureKit();
  const shares = Math.max(1, Math.min(options.workers ?? availableParallelism() - 1, 8));
  const keepPositions = options.keepPositions !== false;
  const bulk = database.count() === 0;
  const started = performance.now();
  const state = {
    kind: source.kind,
    file: source.file,
    bytes: source.bytes,
    sha256: verifiedDigest,
    bulk,
    workers: shares,
    read: 0,
    imported: 0,
    coverage: { annotated: 0, evaluated: 0, dated: 0, rated: 0 },
    duplicates: 0,
    rejected: 0,
    filtered: 0,
    failures: [],
    peakRssBytes: 0,
    elapsedMs: 0,
    indexMs: 0,
    stopped: false,
  };
  const updateId = bulk
    ? null
    : database.beginUpdate({
        file: path.basename(source.file),
        sha256: verifiedDigest,
        licence: options.licence ?? null,
        filters: source.kind === 'pgn' ? (options.filters ?? {}) : null,
      });
  if (bulk) database.beginBulk();
  const workers = [];
  let failed = false;
  let accepting = true;
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
            filters: options.filters,
            batch: source.kind === 'pgn' ? 300 : 500,
          },
        });
        workers.push(worker);
        worker.on('error', reject);
        worker.on('message', (message) => {
          if (!accepting) return;
          try {
            checkImportStorage(database.file, maxBytes);
            if (message.kind === 'done') {
              state.filtered += message.filtered ?? 0;
              finished += 1;
              if (finished === shares) resolve();
              return;
            }
            if (message.payloads.length) {
              const result = database.insertGames(message.payloads, updateId);
              state.imported += result.imported;
              state.duplicates += result.duplicates;
            }
            for (const key of Object.keys(state.coverage))
              state.coverage[key] += message.coverage?.[key] ?? 0;
            state.read += message.read;
            state.rejected += message.rejected;
            if (state.failures.length < 50) state.failures.push(...message.failures);
            const rss = process.memoryUsage().rss;
            if (rss > state.peakRssBytes) state.peakRssBytes = rss;
            state.elapsedMs = performance.now() - started;
            onProgress({ ...state, phase: 'importing' });
            worker.postMessage('ack');
          } catch (error) {
            reject(error);
          }
        });
      }
    });
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    accepting = false;
    /*
      A worker that has sent 'done' still listens for acknowledgements, and a
      listening port keeps its thread alive: every import left one idle
      thread per share, each holding the kit and the opening index, until the
      companion quit (import-jobs.test.mjs). Ended here, whatever ended the
      import.
    */
    await Promise.all(workers.map((worker) => worker.terminate()));
    if (bulk) {
      onProgress({ ...state, phase: 'indexing' });
      const indexing = performance.now();
      database.endBulk();
      state.indexMs = performance.now() - indexing;
    }
    state.elapsedMs = performance.now() - started;
    if (updateId)
      database.finishUpdate(
        updateId,
        {
          ...state,
          sha256: verifiedDigest,
          licence: options.licence ?? null,
          filters: options.filters ?? {},
        },
        failed ? 'failed' : state.stopped ? 'stopped' : 'done',
      );
  }
  database.recordSource({
    file: path.basename(source.file),
    kind: source.kind,
    bytes: source.bytes,
    games: state.imported,
    licence: typeof options.licence === 'string' ? options.licence.slice(0, 200) : null,
    note: [
      verifiedDigest
        ? `Verified archive SHA-256 ${verifiedDigest}`
        : 'No publisher checksum supplied',
      `Archive accepted-game coverage (includes duplicates): ${JSON.stringify(state.coverage)}; filters ${JSON.stringify(options.filters ?? {})}; ${state.filtered} excluded on headers`,
      typeof options.note === 'string' ? options.note.slice(0, 200) : null,
    ]
      .filter(Boolean)
      .join('. '),
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

  #prune() {
    const finished = [...this.#jobs].filter(([, job]) =>
      ['done', 'stopped', 'failed'].includes(job.status.phase),
    );
    for (const [id] of finished.slice(0, Math.max(0, finished.length - 20))) this.#jobs.delete(id);
  }

  list() {
    this.#prune();
    return [...this.#jobs].reverse().map(([id, job]) => ({ id, key: job.key, status: job.status }));
  }

  start(key, database, options) {
    this.#prune();
    if (
      [...this.#jobs.values()].some(
        (job) => !['done', 'stopped', 'failed'].includes(job.status.phase),
      )
    )
      throw new ImportFileError(
        'Finish or stop the current large-file import before starting another.',
      );
    describeSource(options.file);
    const id = String(this.#next++);
    const controller = new AbortController();
    const job = { key, controller, status: { phase: 'starting', file: options.file } };
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

  active(key) {
    return [...this.#jobs.values()].some(
      (job) => job.key === key && !['done', 'stopped', 'failed'].includes(job.status.phase),
    );
  }

  status(id) {
    return this.#jobs.get(String(id))?.status ?? null;
  }

  cancel(id) {
    this.#jobs.get(String(id))?.controller.abort();
  }
}
