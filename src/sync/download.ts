/**
 * ChessBase's "Download Online Games": one player's recent games from Lichess
 * or Chess.com, once, into the Library.
 *
 * Not the account sync (`account-sync.ts`), which follows the player's own
 * linked accounts with a cursor. This is for anyone's public games — an
 * opponent's, a friend's — on request, with no cursor kept and nothing
 * stored about the account. The PGN goes through the same import pipeline
 * as a pasted file, so duplicates are skipped and a Chess960 game is refused
 * with its reason, as everywhere else.
 */

import { fetchChessComArchiveMonths, fetchChessComMonthPgn, monthKey } from './chess-com-sync';
import { fetchLichessGamesPgn } from './lichess-sync';

export type OnlineSite = 'lichess' | 'chess.com';

export interface DownloadRequest {
  readonly site: OnlineSite;
  readonly username: string;
  /** Games from this many months back to now. */
  readonly months: number;
  /** At most this many games, newest kept. */
  readonly max: number;
  readonly token?: string;
  readonly signal?: AbortSignal;
  readonly now?: number;
  readonly fetchImpl?: typeof fetch;
  /** Chess.com is fetched a month at a time; called after each. */
  readonly onMonth?: (done: number, of: number) => void;
}

const DAY = 24 * 60 * 60 * 1000;

/** The first instant of the period, as epoch ms: `months` calendar months back, approximately. */
export const periodStart = (now: number, months: number): number =>
  now - Math.round(months * 30.44) * DAY;

/** The games, newest kept when there are more than `max`, as one PGN text. */
export async function downloadOnlineGames(request: DownloadRequest): Promise<string> {
  const now = request.now ?? Date.now();
  const since = periodStart(now, request.months);
  if (request.site === 'lichess') {
    return fetchLichessGamesPgn(request.username, {
      since,
      max: request.max,
      newestFirst: true,
      ...(request.token ? { token: request.token } : {}),
      ...(request.signal ? { signal: request.signal } : {}),
      ...(request.fetchImpl ? { fetchImpl: request.fetchImpl } : {}),
    });
  }
  const options = {
    ...(request.signal ? { signal: request.signal } : {}),
    ...(request.fetchImpl ? { fetchImpl: request.fetchImpl } : {}),
  };
  const first = monthKey(since);
  const months = (await fetchChessComArchiveMonths(request.username, options))
    .filter((month) => month >= first)
    .reverse();
  const games: string[] = [];
  let done = 0;
  for (const month of months) {
    if (games.length >= request.max) break;
    const { pgn } = await fetchChessComMonthPgn(request.username, month, options);
    // A month's archive is oldest first; newest first across the whole walk.
    const monthGames = splitGames(pgn).reverse();
    games.push(...monthGames.slice(0, request.max - games.length));
    done += 1;
    request.onMonth?.(done, months.length);
  }
  return games.join('\n\n');
}

/** Games in a PGN text, each with its tags, split where a new `[Event` begins a line. */
export function splitGames(pgn: string): string[] {
  return pgn
    .split(/\n\s*\n(?=\[Event )/)
    .map((game) => game.trim())
    .filter(Boolean);
}
