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
    const repositories = await getRepositories();
    return repositories.games.explore(query.fen, query.filters, query.limit);
  }
}
