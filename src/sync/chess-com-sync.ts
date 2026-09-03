/**
 * Pulling a Chess.com account's games.
 *
 * The Published-Data API has no timestamp cursor: a player's games are
 * published as immutable monthly archives, listed by
 * `/pub/player/{username}/games/archives`. So the incremental unit here is
 * the calendar month, not a moment — everything before the last synced month
 * is settled and is never fetched again, and the last synced month is
 * re-fetched because games can still have been added to it after the last
 * sync.
 *
 * Requests are strictly serial. Chess.com documents serial requests as
 * unlimited and parallel ones as liable to be refused with 429, so the month
 * loop awaits each archive rather than gathering them.
 *
 * No key and no account: the API is public and read-only. It does ask for a
 * descriptive User-Agent with contact details, which a browser will not let
 * a page set — `User-Agent` is a forbidden header name for `fetch`. That is
 * a real limitation of syncing from the browser rather than something worked
 * around here, and it is recorded in the docs rather than hidden.
 */

import { SyncFetchError } from './types';

const CHESS_COM_API = 'https://api.chess.com/pub';

export interface ChessComFetchOptions {
  readonly signal?: AbortSignal;
  /** Test seam. Production uses the global `fetch`. */
  readonly fetchImpl?: typeof fetch;
}

/** `YYYY-MM` keys for every published monthly archive, oldest first. */
export async function fetchChessComArchiveMonths(
  username: string,
  options: ChessComFetchOptions = {},
): Promise<readonly string[]> {
  const name = username.trim();
  if (!name) throw new SyncFetchError('No Chess.com username was given.', 'misconfigured');

  const url = `${CHESS_COM_API}/player/${encodeURIComponent(name.toLowerCase())}/games/archives`;
  const response = await request(url, name, options);
  const body = (await response.json()) as { archives?: unknown };
  if (!Array.isArray(body.archives)) {
    throw new SyncFetchError(
      'Chess.com returned an archive list this build cannot read.',
      'unsupported',
    );
  }

  // Each entry is a URL ending `/games/YYYY/MM`; the pair is the only part
  // this needs, and deriving it here keeps every later request built from
  // values this code produced rather than from a URL a response supplied.
  const months: string[] = [];
  for (const entry of body.archives) {
    if (typeof entry !== 'string') continue;
    const match = /\/games\/(\d{4})\/(\d{2})$/.exec(entry);
    if (!match) continue;
    months.push(`${match[1]}-${match[2]}`);
  }
  return months.sort();
}

/** One month of games as PGN, ready for the shared import pipeline. */
export async function fetchChessComMonthPgn(
  username: string,
  month: string,
  options: ChessComFetchOptions = {},
): Promise<string> {
  const name = username.trim();
  /*
    Shape-checked rather than merely split: `"last-march".split("-")` gives
    two truthy halves and would build `/games/last/march/pgn`, which is a
    request this code should never have been able to make.
  */
  const parts = /^(\d{4})-(\d{2})$/.exec(month);
  if (!parts) {
    throw new SyncFetchError(`"${month}" is not a YYYY-MM archive month.`, 'misconfigured');
  }
  const [, year, monthPart] = parts;

  const url = `${CHESS_COM_API}/player/${encodeURIComponent(name.toLowerCase())}/games/${year}/${monthPart}/pgn`;
  const response = await request(url, name, options);
  // A month with no games answers 200 with an empty body rather than 404.
  return response.text();
}

async function request(
  url: string,
  username: string,
  options: ChessComFetchOptions,
): Promise<Response> {
  const call = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await call(url, {
      headers: { accept: 'application/json' },
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new SyncFetchError(
      'Chess.com could not be reached.',
      'network-error',
      'Check the connection and try again; nothing already imported is affected.',
    );
  }

  if (response.status === 404) {
    throw new SyncFetchError(
      `Chess.com has no account called "${username}".`,
      'misconfigured',
      'Check the spelling of the username.',
    );
  }
  if (response.status === 429) {
    throw new SyncFetchError(
      'Chess.com is rate limiting this client.',
      'rate-limited',
      'Wait a little before syncing again; requests are made one at a time.',
    );
  }
  if (!response.ok) {
    throw new SyncFetchError(
      `Chess.com answered ${response.status}.`,
      'network-error',
      'This is usually temporary.',
    );
  }
  return response;
}

/** The `YYYY-MM` the given instant falls in, in UTC — the archive's own reckoning. */
export const monthKey = (at: number): string => {
  const date = new Date(at);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};

/**
 * Months still worth fetching.
 *
 * Everything strictly before `lastSyncedMonth` is settled and is skipped;
 * `lastSyncedMonth` itself is re-fetched, because a month that was still in
 * progress at the last sync will have gained games since. Duplicate handling
 * in the import pipeline makes that re-fetch cost bandwidth and nothing else.
 */
export function monthsToFetch(
  published: readonly string[],
  lastSyncedMonth: string | undefined,
): readonly string[] {
  if (lastSyncedMonth === undefined) return [...published].sort();
  return [...published].sort().filter((month) => month >= lastSyncedMonth);
}
