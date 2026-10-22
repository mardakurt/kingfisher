'use client';
import { create } from 'zustand';
import { companionClient } from '@/companion/session';
import type { PreparedSqliteGame } from '@/persistence/pgn-import-protocol';
import type { EnCroissantGame } from '@/database/encroissant/types';
import type {
  BrowserReaderRequest,
  BrowserReaderResponse,
} from '@/database/encroissant/browser-reader-protocol';
import {
  browserCollectionRepositories,
  createBrowserCollectionNamed,
} from '@/persistence/browser-collections';
import { importGames } from '@/persistence/import-game';

interface ImportState {
  running: boolean;
  path: string;
  destination: string | null;
  after: number;
  imported: number;
  duplicates: number;
  rejected: number;
  examined: number;
  total: number;
  failures: readonly string[];
  message: string;
  cancel(): void;
  run(path: string, name: string, total: number): Promise<void>;
  /**
   * The same import with no companion: a file chosen in the browser, read in
   * a worker with SQLite compiled to WebAssembly, into a new collection kept
   * in this browser (`browser-reader.worker.ts`).
   */
  runInBrowser(file: File, name: string, total: number): Promise<void>;
}
let controller: AbortController | null = null;

/** Route-independent ownership; a closed dialog never loses the running job. */
export const useEnCroissantImport = create<ImportState>((set, get) => ({
  running: false,
  path: '',
  destination: null,
  after: 0,
  imported: 0,
  duplicates: 0,
  rejected: 0,
  examined: 0,
  total: 0,
  failures: [],
  message: '',
  cancel: () => controller?.abort(),
  runInBrowser: async (file, name, total) => {
    if (get().running) return;
    const previous = get();
    // The same file again, after a stop: carry on from the last stored page.
    const path = `browser:${file.name}:${file.size}:${file.lastModified}`;
    const resume =
      previous.path === path &&
      previous.destination !== null &&
      previous.after > 0 &&
      previous.examined < previous.total;
    controller = new AbortController();
    const signal = controller.signal;
    let worker: Worker | null = null;
    set(
      resume
        ? { running: true, message: 'Resuming…' }
        : {
            running: true,
            path,
            destination: null,
            after: 0,
            imported: 0,
            duplicates: 0,
            rejected: 0,
            examined: 0,
            total,
            failures: [],
            message: 'Reading the database…',
          },
    );
    try {
      worker = new Worker(
        new URL('../database/encroissant/browser-reader.worker.ts', import.meta.url),
        { type: 'module' },
      );
      const reader = readerFor(worker, signal);
      const opened = await reader({ type: 'open', file });
      if (opened.type !== 'opened') throw new Error('The database could not be read.');
      if (!opened.inspection.supported) {
        throw new Error(
          opened.inspection.reason ?? 'This is not a supported En Croissant database.',
        );
      }
      let destination = resume ? previous.destination! : null;
      if (!destination) {
        set({ message: 'Creating collection…' });
        destination = (await createBrowserCollectionNamed(name, 'En Croissant import')).key;
        set({ destination });
      }
      const repositories = await browserCollectionRepositories(destination);
      set({ message: 'Importing…' });
      while (!signal.aborted) {
        const page = await reader({ type: 'page', after: get().after, limit: 200 });
        if (page.type !== 'page' || page.examined === 0) break;
        const stored = page.converted
          ? await importGames(page.pgn, repositories.games, { signal })
          : { imported: 0, duplicates: 0, cancelled: false };
        set((state) => ({
          imported: state.imported + stored.imported,
          duplicates: state.duplicates + stored.duplicates,
          rejected: state.rejected + page.rejected.length,
          examined: state.examined + page.examined,
          after: page.lastId,
          failures: [...state.failures, ...page.rejected.map((row) => row.reason)].slice(0, 20),
        }));
        if (stored.cancelled || page.nextAfter === null) break;
      }
      set({
        message: signal.aborted
          ? 'Stopped. Committed games are safe; choose the same file to resume.'
          : 'Import complete.',
      });
    } catch (error) {
      set({
        message:
          signal.aborted || (error instanceof DOMException && error.name === 'AbortError')
            ? 'Stopped. Committed games are safe; choose the same file to resume.'
            : error instanceof Error
              ? error.message
              : String(error),
      });
    } finally {
      worker?.terminate();
      controller = null;
      set({ running: false });
    }
  },
  run: async (path, name, total) => {
    if (get().running) return;
    const client = companionClient();
    if (!client) {
      set({ message: 'Pair the companion in Settings first.' });
      return;
    }
    const previous = get();
    const resume =
      previous.path === path &&
      previous.destination !== null &&
      previous.after > 0 &&
      previous.examined < previous.total;
    controller = new AbortController();
    const signal = controller.signal;
    let worker: Worker | null = null;
    set(
      resume
        ? { running: true, message: 'Resuming…' }
        : {
            running: true,
            path,
            destination: null,
            after: 0,
            imported: 0,
            duplicates: 0,
            rejected: 0,
            examined: 0,
            total,
            failures: [],
            message: 'Creating collection…',
          },
    );
    try {
      worker = new Worker(new URL('../database/encroissant/import.worker.ts', import.meta.url), {
        type: 'module',
      });
      const destination = resume ? previous.destination! : (await client.createDatabase(name)).key;
      set({ destination });
      while (!signal.aborted) {
        const page = await client.readEnCroissant(path, get().after, 50, signal);
        if (page.games.length === 0) break;
        const prepared = await prepare(worker, page.games, signal);
        if (signal.aborted) break;
        // Let an in-flight transaction settle before cancellation is reported.
        const result = prepared.games.length
          ? await client.importGames(destination, prepared.games)
          : { imported: 0, duplicates: 0 };
        set((state) => ({
          imported: state.imported + result.imported,
          duplicates: state.duplicates + result.duplicates,
          rejected: state.rejected + prepared.rejected.length,
          examined: state.examined + page.games.length,
          after: page.games[page.games.length - 1]!.id,
          failures: [...state.failures, ...prepared.rejected.map((row) => row.reason)].slice(0, 20),
          message: 'Importing…',
        }));
        if (page.nextAfter === null) break;
      }
      set({
        message: signal.aborted
          ? 'Stopped. Committed games are safe; resume when ready.'
          : 'Import complete.',
      });
    } catch (error) {
      set({
        message: signal.aborted
          ? 'Stopped. Committed games are safe; resume when ready.'
          : error instanceof Error
            ? error.message
            : String(error),
      });
    } finally {
      worker?.terminate();
      controller = null;
      set({ running: false });
    }
  },
}));

interface PreparedPage {
  games: PreparedSqliteGame[];
  rejected: { id: number; reason: string }[];
}
function prepare(
  worker: Worker,
  games: readonly EnCroissantGame[],
  signal: AbortSignal,
): Promise<PreparedPage> {
  return new Promise((resolve, reject) => {
    const clean = () => {
      worker.onmessage = null;
      worker.onerror = null;
      signal.removeEventListener('abort', abort);
    };
    const abort = () => {
      clean();
      reject(new DOMException('Cancelled', 'AbortError'));
    };
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener('abort', abort, { once: true });
    worker.onerror = (event) => {
      clean();
      reject(new Error(event.message || 'The import worker failed.'));
    };
    worker.onmessage = (event: MessageEvent<PreparedPage & { error?: string }>) => {
      clean();
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data);
    };
    worker.postMessage(games);
  });
}

/** One request to the reader worker, one answer; a stop rejects the wait. */
function readerFor(worker: Worker, signal: AbortSignal) {
  return (request: BrowserReaderRequest) =>
    new Promise<BrowserReaderResponse>((resolve, reject) => {
      const clean = () => {
        worker.onmessage = null;
        worker.onerror = null;
        signal.removeEventListener('abort', abort);
      };
      const abort = () => {
        clean();
        reject(new DOMException('Cancelled', 'AbortError'));
      };
      if (signal.aborted) {
        abort();
        return;
      }
      signal.addEventListener('abort', abort, { once: true });
      worker.onerror = (event) => {
        clean();
        reject(new Error(event.message || 'The database reader failed.'));
      };
      worker.onmessage = (event: MessageEvent<BrowserReaderResponse>) => {
        clean();
        if (event.data.type === 'error') reject(new Error(event.data.error));
        else resolve(event.data);
      };
      worker.postMessage(request);
    });
}
