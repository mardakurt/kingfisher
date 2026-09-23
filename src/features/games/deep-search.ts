/**
 * The move-level search: the header filters choose the games, then each
 * chosen game's moves are read and asked the question.
 *
 * Reading moves costs what the summaries were designed to avoid (ADR 0014:
 * 379 bytes a summary, 6.7 kB a game), so the loop reads in batches, reports
 * how far it has got after each one, and stops the moment it is told to. A
 * stopped search keeps what it found and says it was stopped; it never
 * presents a partial count as the answer.
 */

import type { GameRepository, GameSearchQuery, GameSummary } from '@/persistence/types';
import { scanGame, type DeepQuery, type ScanHit } from '@/search/game-scan';

export interface DeepMatch {
  readonly game: GameSummary;
  readonly hit: ScanHit;
}

export interface DeepSearchState {
  readonly status: 'running' | 'done' | 'stopped' | 'failed';
  /** Games whose moves have been read. */
  readonly read: number;
  /** Games the header filters selected — the denominator. */
  readonly selected: number;
  readonly matches: readonly DeepMatch[];
  readonly error?: string;
}

const SUMMARY_PAGE = 1_000;
const CONTENT_BATCH = 100;

export async function runDeepSearch(input: {
  readonly games: Pick<GameRepository, 'search' | 'getMany'>;
  readonly header: Omit<GameSearchQuery, 'limit' | 'offset' | 'exactTotal'>;
  readonly deep: DeepQuery;
  readonly signal?: AbortSignal;
  readonly onProgress?: (state: DeepSearchState) => void;
}): Promise<DeepSearchState> {
  const { games, header, deep, signal, onProgress } = input;
  const matches: DeepMatch[] = [];
  let read = 0;
  let selected = 0;
  const report = (status: DeepSearchState['status'], error?: string): DeepSearchState => {
    const state: DeepSearchState = {
      status,
      read,
      selected,
      matches: [...matches],
      ...(error ? { error } : {}),
    };
    onProgress?.(state);
    return state;
  };

  try {
    // Every selected id first, so the denominator is known before reading starts.
    const ids: string[] = [];
    for (let offset = 0; ; offset += SUMMARY_PAGE) {
      if (signal?.aborted) return report('stopped');
      const page = await games.search({ ...header, limit: SUMMARY_PAGE, offset });
      ids.push(...page.games.map((game) => game.id));
      if (!page.hasMore) break;
    }
    selected = ids.length;
    report('running');

    for (let start = 0; start < ids.length; start += CONTENT_BATCH) {
      if (signal?.aborted) return report('stopped');
      const batch = await games.getMany(ids.slice(start, start + CONTENT_BATCH));
      for (const record of batch) {
        const hit = scanGame(record.tree, deep);
        if (hit) {
          const { tree: _tree, normalizedPgn: _pgn, ...summary } = record;
          matches.push({ game: summary, hit });
        }
      }
      read += batch.length;
      // A game deleted between the two reads is not "read"; it is gone, and the
      // denominator follows it rather than claiming a game nobody looked at.
      selected -= Math.min(CONTENT_BATCH, ids.length - start) - batch.length;
      report('running');
    }
    return report('done');
  } catch (error) {
    return report('failed', error instanceof Error ? error.message : String(error));
  }
}
