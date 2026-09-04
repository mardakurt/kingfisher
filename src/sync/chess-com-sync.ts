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
  /**
   * The entity tag this client last saw for this exact resource.
   *
   * Sent as `If-None-Match`. The archive endpoints serve an `ETag`, so a month
   * that has not changed since the last sync answers 304 with no body at all —
   * which matters because the *current* month is re-fetched on every sync by
   * design, and for a dormant account that was a full month of PGN downloaded
   * to discover that nothing had happened.
   */
  readonly etag?: string;
}

/** A conditional fetch's outcome: new bytes, or a 304 saying there are none. */
export interface ConditionalPgn {
  readonly pgn: string;
  /** Absent when the server sent none; store it to make the next fetch conditional. */
  readonly etag?: string;
  /** True when the server answered 304 and `pgn` is therefore empty. */
  readonly unchanged: boolean;
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
): Promise<ConditionalPgn> {
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
  if (response.status === 304) return { pgn: '', unchanged: true };
  const etag = response.headers.get('etag');
  // A month with no games answers 200 with an empty body rather than 404.
  return { pgn: await response.text(), unchanged: false, ...(etag ? { etag } : {}) };
}

export interface ChessComProfile {
  readonly username: string;
  readonly name?: string;
  readonly title?: string;
  readonly url: string;
  readonly country?: string;
  readonly joined?: number;
  readonly lastOnline?: number;
  /** Current ratings by time control, where the account has one. */
  readonly ratings: Readonly<Record<string, number>>;
}

/**
 * The public profile and current ratings.
 *
 * Two requests rather than one because the API separates them, and serial
 * rather than parallel for the same reason the month loop is: Chess.com
 * documents serial requests as unlimited and parallel ones as liable to be
 * refused.
 *
 * Nothing here is inferred. A field the API did not send is absent, not
 * guessed — in particular, no attempt is made to connect this username to a
 * FIDE identity or to a player in a reference source. That remains the user's
 * explicit statement, as in Phase 12.
 */
export async function fetchChessComProfile(
  username: string,
  options: ChessComFetchOptions = {},
): Promise<ChessComProfile> {
  const name = username.trim();
  if (!name) throw new SyncFetchError('No Chess.com username was given.', 'misconfigured');
  const slug = encodeURIComponent(name.toLowerCase());

  const profile = (await (
    await request(`${CHESS_COM_API}/player/${slug}`, name, options)
  ).json()) as Record<string, unknown>;

  const ratings: Record<string, number> = {};
  try {
    const stats = (await (
      await request(`${CHESS_COM_API}/player/${slug}/stats`, name, options)
    ).json()) as Record<string, unknown>;
    for (const [key, value] of Object.entries(stats)) {
      if (!key.startsWith('chess_')) continue;
      const last = (value as { last?: { rating?: unknown } } | null)?.last;
      if (typeof last?.rating === 'number') ratings[key.replace('chess_', '')] = last.rating;
    }
  } catch (error) {
    // A profile without ratings is still a profile. Only a failure to read the
    // profile itself is worth failing the whole call for.
    if (error instanceof SyncFetchError && error.state === 'misconfigured') throw error;
  }

  return {
    username: typeof profile.username === 'string' ? profile.username : name,
    ...(typeof profile.name === 'string' ? { name: profile.name } : {}),
    ...(typeof profile.title === 'string' ? { title: profile.title } : {}),
    url: typeof profile.url === 'string' ? profile.url : `https://www.chess.com/member/${slug}`,
    ...(typeof profile.country === 'string'
      ? { country: profile.country.split('/').pop() ?? '' }
      : {}),
    ...(typeof profile.joined === 'number' ? { joined: profile.joined * 1000 } : {}),
    ...(typeof profile.last_online === 'number' ? { lastOnline: profile.last_online * 1000 } : {}),
    ratings,
  };
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
      headers: {
        accept: 'application/json',
        ...(options.etag ? { 'if-none-match': options.etag } : {}),
      },
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

  // Not modified is a success, and the caller distinguishes it from a body.
  if (response.status === 304) return response;
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
  /*
    A server error and an unreachable network are different facts and lead to
    different advice, so they are not both "network-error": Chess.com being
    down is nothing the user can act on beyond waiting, while a connection
    problem is something they may be able to fix.
  */
  if (response.status >= 500) {
    throw new SyncFetchError(
      `Chess.com is not answering right now (HTTP ${response.status}).`,
      'error',
      'The service is having trouble; nothing already imported is affected. Try later.',
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
