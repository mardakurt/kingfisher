/**
 * One sync run for one linked account.
 *
 * The whole design is in what this file does *not* do: it fetches PGN and
 * hands it to `importGames`, the same function the import dialog calls. There
 * is no second game model, no second duplicate rule and no second position
 * index — a game synced from Lichess is stored by exactly the code that
 * stores a game pasted from the clipboard, so it gets the same fingerprint
 * and collides with an existing copy rather than joining it.
 *
 * That is also what makes "sync twice, import nothing the second time" true
 * without a single line of dedup logic here: the fingerprint index has
 * enforced one row per game since schema version 1.
 */

import { importGames } from '@/persistence/import-game';
import type { LinkedAccountRecord } from '@/persistence/domain';
import type { GameRepository, ImportProgress } from '@/persistence/types';

import { fetchChessComArchiveMonths, fetchChessComMonthPgn, monthsToFetch } from './chess-com-sync';
import { fetchLichessGamesPgn, newestGameTimestamp } from './lichess-sync';

export interface SyncOptions {
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: ImportProgress) => void;
  /** Optional Lichess token, reused from the explorer's setting when present. */
  readonly lichessToken?: string;
  readonly fetchImpl?: typeof fetch;
  readonly now?: number;
}

export interface SyncResult {
  readonly imported: number;
  readonly duplicates: number;
  /** True when the provider had nothing newer than the stored cursor. */
  readonly upToDate: boolean;
  /** The cursor fields to persist. Absent keys are left as they were. */
  readonly cursor: {
    readonly lastGameTimestamp?: number;
    readonly lastSyncedMonth?: string;
  };
}

const EMPTY: SyncResult = { imported: 0, duplicates: 0, upToDate: true, cursor: {} };

export async function syncAccount(
  account: LinkedAccountRecord,
  games: GameRepository,
  options: SyncOptions = {},
): Promise<SyncResult> {
  return account.provider === 'lichess'
    ? syncLichess(account, games, options)
    : syncChessCom(account, games, options);
}

async function syncLichess(
  account: LinkedAccountRecord,
  games: GameRepository,
  options: SyncOptions,
): Promise<SyncResult> {
  const pgn = await fetchLichessGamesPgn(account.username, {
    ...(account.lastGameTimestamp !== undefined
      ? // One millisecond past the newest game already held, so the game that
        // set the cursor is not fetched again on every sync.
        { since: account.lastGameTimestamp + 1 }
      : {}),
    ...(options.lichessToken ? { token: options.lichessToken } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  });

  if (!pgn.trim()) return EMPTY;

  const summary = await importGames(pgn, games, {
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.onProgress ? { onProgress: options.onProgress } : {}),
  });

  /*
    Advanced from the games themselves, and only when something was actually
    imported. A cursor moved to "now" would silently skip anything played
    between the request and the response, and a cursor moved after a run that
    imported nothing would do the same on a failed parse.
  */
  const newest = newestGameTimestamp(pgn);
  return {
    imported: summary.imported,
    duplicates: summary.duplicates,
    upToDate: summary.games === 0,
    cursor: newest !== undefined ? { lastGameTimestamp: newest } : {},
  };
}

async function syncChessCom(
  account: LinkedAccountRecord,
  games: GameRepository,
  options: SyncOptions,
): Promise<SyncResult> {
  const fetchOptions = {
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  };

  const published = await fetchChessComArchiveMonths(account.username, fetchOptions);
  const months = monthsToFetch(published, account.lastSyncedMonth);
  if (months.length === 0) return EMPTY;

  let imported = 0;
  let duplicates = 0;
  let reached: string | undefined;
  let sawGames = false;

  // Serial, deliberately: Chess.com documents parallel requests as liable to
  // be refused, and a month at a time is fast enough for a personal archive.
  for (const month of months) {
    if (options.signal?.aborted) break;
    const pgn = await fetchChessComMonthPgn(account.username, month, fetchOptions);
    reached = month;
    if (!pgn.trim()) continue;

    sawGames = true;
    const summary = await importGames(pgn, games, {
      ...(options.signal ? { signal: options.signal } : {}),
      ...(options.onProgress ? { onProgress: options.onProgress } : {}),
    });
    imported += summary.imported;
    duplicates += summary.duplicates;
    if (summary.cancelled) break;
  }

  return {
    imported,
    duplicates,
    upToDate: !sawGames,
    // The month reached, not the month after it: this month may still gain
    // games, so the next sync must look at it again.
    cursor: reached !== undefined ? { lastSyncedMonth: reached } : {},
  };
}
