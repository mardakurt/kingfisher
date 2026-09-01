import { getRepositories } from '@/persistence/repositories';
import type { AppRepositories } from '@/persistence/types';

import type { ChessDatabaseProvider, ExplorerQuery, ExplorerResult } from '../types';

/**
 * How the provider reaches its two dependencies.
 *
 * Injected rather than imported at the call site so the cancellation and
 * fallback behaviour — the parts where a mistake shows up as an explorer that
 * answers about the wrong position — can be tested without a browser.
 */
export interface PersistentLocalDeps {
  readonly repositories: () => Promise<AppRepositories>;
  /** Returns null when this environment has no module Worker. */
  readonly createWorker: () => Worker | null;
}

const defaultDeps: PersistentLocalDeps = {
  repositories: getRepositories,
  createWorker: () => {
    if (typeof Worker === 'undefined') return null;
    try {
      return new Worker(new URL('./persistent-local.worker.ts', import.meta.url), {
        type: 'module',
      });
    } catch {
      // Some embeddings refuse module Workers outright.
      return null;
    }
  },
};

export class PersistentLocalCollectionProvider implements ChessDatabaseProvider {
  constructor(private readonly deps: PersistentLocalDeps = defaultDeps) {}

  readonly id = 'local-collection';
  readonly name = 'My games';
  readonly description = 'Games stored on this device and indexed by position.';
  readonly capabilities = {
    ratingFilter: true,
    dateFilter: true,
    playerFilter: true,
    topGames: true,
    offline: true,
  };

  async explore(query: ExplorerQuery, signal?: AbortSignal): Promise<ExplorerResult> {
    if (signal?.aborted) throw new DOMException('The lookup was cancelled.', 'AbortError');
    // Opening here guarantees migrations have completed before the worker
    // opens the same database without its own schema-writing authority.
    const repositories = await this.deps.repositories();
    const worker = this.deps.createWorker();
    // Answering on the main thread is slower on a very large collection, but an
    // explorer that quietly shows nothing is worse than one that briefly blocks.
    if (!worker) return repositories.games.explore(query.fen, query.filters, query.limit);

    return new Promise<ExplorerResult>((resolve, reject) => {
      let settled = false;
      const cancel = () => {
        worker.terminate();
        if (settled) return;
        settled = true;
        reject(new DOMException('The lookup was cancelled.', 'AbortError'));
      };
      signal?.addEventListener('abort', cancel, { once: true });
      // A worker that fails to load at all (a blocked module URL, a bundling
      // mistake) is not a data answer; fall back rather than report an empty
      // database, which would read as "no games reach this position".
      worker.onerror = (event) => {
        signal?.removeEventListener('abort', cancel);
        worker.terminate();
        if (settled) return;
        settled = true;
        repositories.games
          .explore(query.fen, query.filters, query.limit)
          .then(resolve)
          .catch(() => reject(new Error(event.message || 'The local explorer failed.')));
      };
      worker.onmessage = (
        event: MessageEvent<
          | { readonly ok: true; readonly result: ExplorerResult }
          | { readonly ok: false; readonly error: string }
        >,
      ) => {
        signal?.removeEventListener('abort', cancel);
        worker.terminate();
        if (settled) return;
        settled = true;
        if (event.data.ok) resolve(event.data.result);
        else reject(new Error(event.data.error));
      };
      worker.postMessage({
        fen: query.fen,
        filters: query.filters ?? {},
        limit: query.limit ?? 20,
      });
    });
  }
}
