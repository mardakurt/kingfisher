/**
 * The user's own games, queried like any other database.
 *
 * Backed by `PositionIndex`, retained as the pure in-memory implementation for
 * aggregation and regression tests. The application registry uses the
 * persistent repository-backed provider in `persistent-local.ts`.
 * Same interface as the remote providers, so the explorer panel can switch
 * between "what do masters play" and "what did I play" without knowing the
 * difference.
 */

import { parseFen } from '@/chess/fen';
import type { Fen } from '@/chess/types';

import type { PositionIndex } from '../local-index';
import type { ChessDatabaseProvider, ExplorerQuery, ExplorerResult } from '../types';

export class LocalCollectionProvider implements ChessDatabaseProvider {
  readonly id = 'local-collection';
  readonly name = 'My games';
  readonly description = 'Games you have imported in this session, indexed by position.';
  readonly capabilities = {
    ratingFilter: true,
    dateFilter: true,
    playerFilter: true,
    speedFilter: true,
    topGames: true,
    offline: true,
  };

  constructor(private readonly index: PositionIndex) {}

  get gameCount(): number {
    return this.index.gameCount;
  }

  async explore(query: ExplorerQuery): Promise<ExplorerResult> {
    const sideToMove = sideToMoveOf(query.fen);
    return this.index.lookup(
      query.fen,
      sideToMove,
      { id: this.id, name: this.name },
      query.filters,
      query.limit ?? 20,
    );
  }
}

function sideToMoveOf(fen: Fen): 'w' | 'b' {
  const parsed = parseFen(fen);
  return parsed.ok ? parsed.value.turn : 'w';
}
