'use client';
import { create } from 'zustand';
import { companionClient } from '@/companion/session';
import type { PreparedSqliteGame } from '@/persistence/pgn-import-protocol';
import type { EnCroissantGame } from '@/database/encroissant/types';

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
