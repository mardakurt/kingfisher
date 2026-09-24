/**
 * Read every game of a collection and ask each one a question.
 *
 * The move-level questions — the search mask's material and routes, the
 * repertoire scan — cannot be answered from summaries; they read each game's
 * moves. A collection may be the browser's own or a SQLite file of half a
 * million games behind the companion, so the walk is the collection's own
 * paged `read`, never a load of the whole thing: it reports how far it has
 * got after every page, stops the moment it is told to, and a stopped scan
 * keeps what it found and says it was stopped rather than presenting a
 * partial count as the answer.
 *
 * A page from a store that keeps no tree (SQLite sends movetext) is parsed
 * here with the same parser an import uses, so the question always sees a
 * tree the rules code built.
 */

import { parseSingleGame } from '@/chess/pgn';
import type { GameTree } from '@/chess/tree/types';
import type { GameSearchQuery } from '@/persistence/types';

import type { GameCollection, TransferGame } from './types';

export interface CollectionScanHit<T> {
  readonly game: TransferGame['summary'];
  /** The movetext, kept so a game from a store the board cannot open by id still opens. */
  readonly pgn: string;
  readonly answer: T;
}

export interface CollectionScanState<T> {
  readonly status: 'running' | 'done' | 'stopped' | 'failed';
  /** Games read so far. */
  readonly read: number;
  /** Games in the collection when the scan began; null when it could not say. */
  readonly total: number | null;
  /** Games whose movetext could not be read as a game, and were skipped. */
  readonly unreadable: number;
  readonly hits: readonly CollectionScanHit<T>[];
  readonly error?: string;
}

export const SCAN_PAGE = 200;

export async function scanCollection<T>(input: {
  readonly collection: Pick<GameCollection, 'count' | 'read'>;
  readonly query?: GameSearchQuery | null;
  readonly visit: (tree: GameTree, game: TransferGame) => T | null;
  readonly signal?: AbortSignal;
  readonly onProgress?: (state: CollectionScanState<T>) => void;
  readonly pageSize?: number;
}): Promise<CollectionScanState<T>> {
  const { collection, visit, signal, onProgress } = input;
  const hits: CollectionScanHit<T>[] = [];
  let read = 0;
  let unreadable = 0;
  let total: number | null = null;
  const report = (status: CollectionScanState<T>['status'], error?: string) => {
    const state: CollectionScanState<T> = {
      status,
      read,
      total,
      unreadable,
      hits: [...hits],
      ...(error ? { error } : {}),
    };
    onProgress?.(state);
    return state;
  };

  try {
    total = await collection.count().catch(() => null);
    report('running');
    let after: string | null = null;
    do {
      if (signal?.aborted) return report('stopped');
      const page = await collection.read(input.query ?? null, after, input.pageSize ?? SCAN_PAGE);
      for (const game of page.games) {
        const tree = game.tree ?? treeOf(game.pgn);
        read += 1;
        if (!tree) {
          unreadable += 1;
          continue;
        }
        const answer = visit(tree, game);
        if (answer !== null) hits.push({ game: game.summary, pgn: game.pgn, answer });
      }
      after = page.nextAfter;
      report('running');
    } while (after !== null);
    return report('done');
  } catch (error) {
    return report('failed', error instanceof Error ? error.message : String(error));
  }
}

function treeOf(pgn: string): GameTree | null {
  const parsed = parseSingleGame(pgn);
  return parsed.ok ? parsed.value.tree : null;
}
