import { getRepositories } from '@/persistence/repositories';

import type { ChessDatabaseProvider, ExplorerQuery, ExplorerResult } from '../types';

export class PersistentLocalCollectionProvider implements ChessDatabaseProvider {
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
    const repositories = await getRepositories();
    if (typeof Worker === 'undefined') {
      return repositories.games.explore(query.fen, query.filters, query.limit);
    }

    let worker: Worker;
    try {
      worker = new Worker(new URL('./persistent-local.worker.ts', import.meta.url), {
        type: 'module',
      });
    } catch {
      // Some embeddings refuse module Workers outright. Answering on the main
      // thread is slower on a very large collection, but an explorer that
      // quietly shows nothing is worse than one that briefly blocks.
      return repositories.games.explore(query.fen, query.filters, query.limit);
    }

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
