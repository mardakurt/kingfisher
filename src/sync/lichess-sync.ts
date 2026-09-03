/**
 * Pulling a Lichess account's games.
 *
 * The endpoint is the documented `GET /api/games/user/{username}`, asked for
 * as PGN rather than ndjson: PGN goes straight into the same `importGames`
 * pipeline a pasted file uses, so a synced game gets the same fingerprint,
 * the same position index and the same duplicate handling as one imported by
 * hand. Asking for ndjson would mean rebuilding a game record from JSON —
 * a second import path to keep correct, for no gain.
 *
 * `since` is the whole of the incremental story here. Lichess takes an epoch
 * milliseconds cursor and returns only games played after it, so an
 * incremental sync is one request rather than a scan: nothing already
 * imported is fetched again.
 *
 * Authentication is optional and stays that way. A token raises the games/
 * second allowance (20 anonymous, 30 with OAuth, 60 for your own games) but
 * is never required to read public games, so this reuses the token the user
 * may already have set for the explorer and works without one.
 */

import { SyncFetchError } from './types';

const LICHESS_API = 'https://lichess.org';

export interface LichessFetchOptions {
  /** Epoch ms. Only games played after this are returned. */
  readonly since?: number;
  /** Optional; raises the rate allowance, never required for public games. */
  readonly token?: string;
  readonly max?: number;
  readonly signal?: AbortSignal;
  /** Test seam. Production uses the global `fetch`. */
  readonly fetchImpl?: typeof fetch;
}

export async function fetchLichessGamesPgn(
  username: string,
  options: LichessFetchOptions = {},
): Promise<string> {
  const name = username.trim();
  if (!name) throw new SyncFetchError('No Lichess username was given.', 'misconfigured');

  const url = new URL(`/api/games/user/${encodeURIComponent(name)}`, LICHESS_API);
  /*
    Oldest first. A sync that is interrupted half way has then imported a
    contiguous run from the cursor forward, so advancing the cursor to the
    newest game actually imported leaves no hole — with `dateDesc` an
    interrupted run would leave a gap that no later `since` could reach.
  */
  url.searchParams.set('sort', 'dateAsc');
  url.searchParams.set('tags', 'true');
  url.searchParams.set('moves', 'true');
  url.searchParams.set('opening', 'true');
  if (options.since !== undefined) url.searchParams.set('since', String(options.since));
  if (options.max !== undefined) url.searchParams.set('max', String(options.max));

  const request = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await request(url.toString(), {
      headers: {
        accept: 'application/x-chess-pgn',
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      },
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new SyncFetchError(
      'Lichess could not be reached.',
      'network-error',
      'Check the connection and try again; nothing already imported is affected.',
    );
  }

  if (response.status === 404) {
    throw new SyncFetchError(
      `Lichess has no account called "${name}".`,
      'misconfigured',
      'Check the spelling of the username.',
    );
  }
  if (response.status === 429) {
    // Lichess asks for a full minute before resuming after a 429, and says so
    // plainly rather than publishing a number to back off from.
    throw new SyncFetchError(
      'Lichess is rate limiting this client.',
      'rate-limited',
      'Wait a minute before syncing again.',
    );
  }
  if (response.status === 401 || response.status === 403) {
    throw new SyncFetchError(
      'Lichess refused the stored token.',
      'authentication-required',
      'Clear or replace the token in Settings → Database. Public games sync without one.',
    );
  }
  if (!response.ok) {
    throw new SyncFetchError(
      `Lichess answered ${response.status}.`,
      'network-error',
      'This is usually temporary.',
    );
  }

  return response.text();
}

/**
 * The newest game in a PGN, as epoch ms, for advancing the cursor.
 *
 * Read from the games actually imported rather than from "now": a clock
 * difference between this machine and Lichess would otherwise skip games
 * that were played in the gap.
 */
export function newestGameTimestamp(pgn: string): number | undefined {
  let newest: number | undefined;
  // `[UTCDate "2026.01.02"]` and `[UTCTime "17:04:11"]` are what Lichess
  // exports; the pair is the only timestamp in the PGN accurate to a second.
  const dates = pgn.matchAll(
    /\[UTCDate "(\d{4})\.(\d{2})\.(\d{2})"\]\s*\[UTCTime "(\d{2}):(\d{2}):(\d{2})"\]/g,
  );
  for (const match of dates) {
    const [, year, month, day, hour, minute, second] = match;
    const stamp = Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    );
    if (!Number.isFinite(stamp)) continue;
    if (newest === undefined || stamp > newest) newest = stamp;
  }
  return newest;
}
