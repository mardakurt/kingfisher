'use client';
/**
 * The ChessBase import job.
 *
 * Owned here rather than by the dialog so closing the dialog does not lose a
 * running import. The worker holds the database's bytes and prepares games a
 * page at a time; each page is written to the destination collection before
 * the next is asked for, so a cancelled import leaves whole pages committed
 * and nothing half-written, and importing the same file again skips what is
 * already there.
 */
import { create } from 'zustand';

import type { ImportWorkerMessage, ImportWorkerRequest } from '@/database/chessbase/import.worker';
import type { ChessBaseInspection } from '@/database/chessbase/types';
import { openCollection } from '@/database/collections/registry';
import { companionClient } from '@/companion/session';

export interface ChessBaseSource {
  /** Base name of the database, e.g. `twic1600`. */
  readonly name: string;
  /** Either the whole archive, or the database's files by extension. */
  readonly archive?: ArrayBuffer;
  readonly files?: Record<string, ArrayBuffer>;
}

export type ImportDestination = { readonly kind: 'local' } | { readonly kind: 'companion' };

interface ImportState {
  running: boolean;
  name: string;
  destination: string | null;
  imported: number;
  duplicates: number;
  rejected: number;
  examined: number;
  total: number;
  failures: readonly string[];
  /** Distinct issues with counts, e.g. "annotation type 0x22 has no place in a PGN ×48". */
  issues: readonly string[];
  message: string;
  cancel(): void;
  /**
   * `load` reads the files afresh: their buffers are handed to the worker
   * outright (transferred, not copied), so a source read for inspection
   * cannot be read again.
   */
  run(
    load: () => Promise<ChessBaseSource>,
    collectionName: string,
    destination: ImportDestination,
    total: number,
  ): Promise<void>;
}

const PAGE = 100;
let controller: AbortController | null = null;

export function createImportWorker(): Worker {
  return new Worker(new URL('../database/chessbase/import.worker.ts', import.meta.url), {
    type: 'module',
  });
}

/** One request, one reply; the worker answers in order. */
export function ask(
  worker: Worker,
  request: ImportWorkerRequest,
  signal: AbortSignal,
  transfer: Transferable[] = [],
): Promise<ImportWorkerMessage> {
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
    worker.onmessage = (event: MessageEvent<ImportWorkerMessage>) => {
      clean();
      if (event.data.type === 'error') reject(new Error(event.data.error));
      else resolve(event.data);
    };
    worker.postMessage(request, transfer);
  });
}

export function openRequest(source: ChessBaseSource): {
  request: ImportWorkerRequest;
  transfer: Transferable[];
} {
  if (source.archive)
    return {
      request: { type: 'open-archive', archive: source.archive },
      transfer: [source.archive],
    };
  const files = source.files ?? {};
  return {
    request: { type: 'open', name: source.name, files },
    transfer: Object.values(files),
  };
}

export async function inspectSource(
  source: ChessBaseSource,
  signal: AbortSignal,
): Promise<{ worker: Worker; inspection: ChessBaseInspection }> {
  const worker = createImportWorker();
  const { request, transfer } = openRequest(source);
  const reply = await ask(worker, request, signal, transfer);
  if (reply.type !== 'opened') {
    worker.terminate();
    throw new Error('The database could not be opened.');
  }
  return { worker, inspection: reply.inspection };
}

function summariseIssues(counts: Map<string, number>): string[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([issue, n]) => `${issue} ×${n}`);
}

export const useChessBaseImport = create<ImportState>((set, get) => ({
  running: false,
  name: '',
  destination: null,
  imported: 0,
  duplicates: 0,
  rejected: 0,
  examined: 0,
  total: 0,
  failures: [],
  issues: [],
  message: '',
  cancel: () => controller?.abort(),
  run: async (load, collectionName, destination, total) => {
    if (get().running) return;
    controller = new AbortController();
    const signal = controller.signal;
    let worker: Worker | null = null;
    const issueCounts = new Map<string, number>();
    set({
      running: true,
      name: collectionName,
      destination: null,
      imported: 0,
      duplicates: 0,
      rejected: 0,
      examined: 0,
      total,
      failures: [],
      issues: [],
      message: 'Opening the database…',
    });
    try {
      const source = await load();
      set({ name: source.name });
      const opened = await inspectSource(source, signal);
      worker = opened.worker;
      const count = opened.inspection.games + opened.inspection.texts + opened.inspection.deleted;
      let destinationId = 'local';
      if (destination.kind === 'companion') {
        const client = companionClient();
        if (!client) throw new Error('Pair the companion in Settings first.');
        set({ message: 'Creating collection…' });
        destinationId = `sqlite:${(await client.createDatabase(collectionName)).key}`;
      }
      const collection = await openCollection(destinationId);
      if (!collection) throw new Error('The destination collection is not available.');
      set({ destination: destinationId, message: 'Importing…' });
      for (let from = 1; from <= count && !signal.aborted; from += PAGE) {
        const reply = await ask(worker, { type: 'page', from, to: from + PAGE - 1 }, signal);
        if (reply.type !== 'page') throw new Error('The import worker lost its place.');
        for (const issue of reply.issues) {
          // Counts vary per game ("3 annotation(s)…"); fold them into one line each.
          const key = issue.replace(/^\d+ /, '');
          issueCounts.set(key, (issueCounts.get(key) ?? 0) + 1);
        }
        const outcome = reply.games.length
          ? await collection.write(reply.games)
          : { written: 0, duplicates: 0 };
        set((state) => ({
          imported: state.imported + outcome.written,
          duplicates: state.duplicates + outcome.duplicates,
          rejected: state.rejected + reply.failures.length,
          examined: state.examined + (reply.last - from + 1),
          failures: [
            ...state.failures,
            ...reply.failures.map((failure) => `Game ${failure.id}: ${failure.reason}`),
          ].slice(0, 20),
          issues: summariseIssues(issueCounts),
        }));
      }
      set({
        message: signal.aborted
          ? 'Stopped. Imported games are safe; importing again skips them.'
          : 'Import complete.',
      });
    } catch (error) {
      set({
        message:
          signal.aborted || (error instanceof DOMException && error.name === 'AbortError')
            ? 'Stopped. Imported games are safe; importing again skips them.'
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
