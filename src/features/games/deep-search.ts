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

import { queryFromFilters } from '@/database/query/ast';
import { executeQuery, type QueryRun } from '@/database/query/execute';
import type { GameRecord, GameRepository, GameSearchQuery, GameSummary } from '@/persistence/types';
import {
  scanGame,
  scanLine,
  type DeepQuery,
  type LinePosition,
  type ScanHit,
} from '@/search/game-scan';

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
  /**
   * Games that contain it, when more do than `matches` lists: the companion
   * counts every hit and returns the first few thousand. Absent, the count
   * is `matches.length`.
   */
  readonly found?: number;
  readonly error?: string;
}

/**
 * Since Phase 86 this is the query model's executor (`src/database/query/`):
 * the header filters and the move mask become one query, the planner pushes
 * the header filters down to the store, and each selected game's moves are
 * read and decided exactly — the same reading this function always did, now
 * the one path every search surface can share.
 */
export async function runDeepSearch(input: {
  readonly games: Pick<GameRepository, 'search' | 'getMany'>;
  readonly header: Omit<GameSearchQuery, 'limit' | 'offset' | 'exactTotal'>;
  readonly deep: DeepQuery;
  readonly signal?: AbortSignal;
  readonly onProgress?: (state: DeepSearchState) => void;
}): Promise<DeepSearchState> {
  const { games, header, deep, signal, onProgress } = input;
  const toState = (run: QueryRun): DeepSearchState => ({
    status: run.status,
    read: run.read,
    selected: run.selected,
    // Every match of a move search has a moment; the scan that found it gave one.
    matches: run.matches.flatMap((match) =>
      match.hit ? [{ game: match.game, hit: match.hit }] : [],
    ),
    ...(run.error ? { error: run.error } : {}),
  });
  const run = await executeQuery({
    games,
    query: queryFromFilters(header, deep),
    limit: Number.MAX_SAFE_INTEGER,
    ...(signal ? { signal } : {}),
    onProgress: (progress) => onProgress?.(toState(progress)),
  });
  return toState(run);
}

/** One page of games with their moves, from a store that serves them in pages. */
export interface MovePage {
  readonly games: readonly {
    readonly summary: GameSummary;
    readonly pgn: string | null;
    /**
     * The main line as the store indexed it, when it is complete: read
     * instead of replaying the PGN, which costs two hundred times the scan.
     */
    readonly line?: readonly LinePosition[] | null;
  }[];
  /** Where the next page starts; null when this was the last. */
  readonly nextAfter: string | null;
}

/**
 * The same search over a store that serves games a page at a time with
 * their PGN — a SQLite database behind the companion (`/db/export-page`).
 *
 * The companion applies the header filters itself, so what arrives is the
 * selected games and nothing else; each is replayed by the PGN parser (the
 * rules code, not the file, decides what the moves are) and asked the same
 * question as a game in the browser. A game whose moves cannot be read is
 * counted as unreadable, not as read, so the denominator stays honest.
 */
export async function runPagedDeepSearch(input: {
  /** Games the header filters select, when the store can count them first. */
  readonly selected: number;
  readonly page: (after: string | null, signal?: AbortSignal) => Promise<MovePage>;
  readonly parse: (pgn: string) => GameRecord['tree'] | null;
  readonly deep: DeepQuery;
  readonly signal?: AbortSignal;
  readonly onProgress?: (state: DeepSearchState) => void;
}): Promise<DeepSearchState> {
  const { deep, signal, onProgress } = input;
  const matches: DeepMatch[] = [];
  let read = 0;
  let unreadable = 0;
  const report = (status: DeepSearchState['status'], error?: string): DeepSearchState => {
    const state: DeepSearchState = {
      status,
      read,
      selected: input.selected - unreadable,
      matches: [...matches],
      ...(error ? { error } : {}),
    };
    onProgress?.(state);
    return state;
  };

  try {
    report('running');
    let after: string | null = null;
    do {
      if (signal?.aborted) return report('stopped');
      const page: MovePage = await input.page(after, signal);
      for (const { summary, pgn, line } of page.games) {
        // A comment is only in the PGN; everything else is in the indexed line.
        if (line && !deep.comment?.trim()) {
          const hit = scanLine(line, deep);
          if (hit) matches.push({ game: summary, hit });
          read += 1;
          continue;
        }
        const tree = pgn ? input.parse(pgn) : null;
        if (!tree) {
          unreadable += 1;
          continue;
        }
        const hit = scanGame(tree, deep);
        if (hit) matches.push({ game: summary, hit });
        read += 1;
      }
      after = page.nextAfter;
      report('running');
    } while (after !== null);
    return report('done');
  } catch (error) {
    if (signal?.aborted) return report('stopped');
    return report('failed', error instanceof Error ? error.message : String(error));
  }
}
