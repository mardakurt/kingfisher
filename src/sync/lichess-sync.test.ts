import { describe, expect, it } from 'vitest';

import { fetchLichessGamesPgn, newestGameTimestamp } from './lichess-sync';
import { SyncFetchError } from './types';

const ok = (body: string) => new Response(body, { status: 200 });

/** Records what was asked for, so the request itself can be asserted on. */
function recorder(response: Response = ok('')) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return response;
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

describe('fetchLichessGamesPgn', () => {
  it('asks for PGN, oldest first, with tags and moves', async () => {
    const { calls, fetchImpl } = recorder();
    await fetchLichessGamesPgn('testuser', { fetchImpl });

    const url = new URL(calls[0]?.url ?? '');
    expect(url.origin + url.pathname).toBe('https://lichess.org/api/games/user/testuser');
    expect(url.searchParams.get('sort')).toBe('dateAsc');
    expect(url.searchParams.get('tags')).toBe('true');
    expect(url.searchParams.get('moves')).toBe('true');
    expect((calls[0]?.init?.headers as Record<string, string> | undefined)?.accept).toBe(
      'application/x-chess-pgn',
    );
  });

  it('passes the incremental cursor as `since`', async () => {
    const { calls, fetchImpl } = recorder();
    await fetchLichessGamesPgn('testuser', { since: 1_700_000_000_000, fetchImpl });
    expect(new URL(calls[0]?.url ?? '').searchParams.get('since')).toBe('1700000000000');
  });

  it('sends no Authorization header when there is no token', async () => {
    const { calls, fetchImpl } = recorder();
    await fetchLichessGamesPgn('testuser', { fetchImpl });
    expect((calls[0]?.init?.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it('sends the token when one is configured, because it raises the allowance', async () => {
    const { calls, fetchImpl } = recorder();
    await fetchLichessGamesPgn('testuser', { token: 'secret-token', fetchImpl });
    expect((calls[0]?.init?.headers as Record<string, string>).authorization).toBe(
      'Bearer secret-token',
    );
  });

  it('names the account when there is no such user', async () => {
    const { fetchImpl } = recorder(new Response('', { status: 404 }));
    await expect(fetchLichessGamesPgn('nobody', { fetchImpl })).rejects.toMatchObject({
      state: 'misconfigured',
      message: expect.stringContaining('nobody'),
    });
  });

  it('reports a rate limit as a rate limit, not as a failure', async () => {
    const { fetchImpl } = recorder(new Response('', { status: 429 }));
    const error = await fetchLichessGamesPgn('testuser', { fetchImpl }).catch(
      (value: unknown) => value,
    );
    expect(error).toBeInstanceOf(SyncFetchError);
    expect((error as SyncFetchError).state).toBe('rate-limited');
    expect((error as SyncFetchError).remedy).toContain('minute');
  });

  it('reports a refused token as an authentication problem, not a missing account', async () => {
    const { fetchImpl } = recorder(new Response('', { status: 401 }));
    await expect(fetchLichessGamesPgn('testuser', { fetchImpl })).rejects.toMatchObject({
      state: 'authentication-required',
    });
  });

  it('reports an unreachable service as a network error', async () => {
    const fetchImpl = (() => Promise.reject(new TypeError('failed'))) as unknown as typeof fetch;
    await expect(fetchLichessGamesPgn('testuser', { fetchImpl })).rejects.toMatchObject({
      state: 'network-error',
    });
  });

  it('refuses an empty username before making a request', async () => {
    const { calls, fetchImpl } = recorder();
    await expect(fetchLichessGamesPgn('   ', { fetchImpl })).rejects.toMatchObject({
      state: 'misconfigured',
    });
    expect(calls).toHaveLength(0);
  });
});

describe('newestGameTimestamp', () => {
  const game = (date: string, time: string) =>
    `[Event "Rated blitz"]\n[UTCDate "${date}"]\n[UTCTime "${time}"]\n\n1. e4 e5 *\n\n`;

  it('reads the newest UTCDate/UTCTime pair in the file', () => {
    const pgn = game('2026.01.02', '10:00:00') + game('2026.03.04', '17:04:11');
    expect(newestGameTimestamp(pgn)).toBe(Date.UTC(2026, 2, 4, 17, 4, 11));
  });

  it('is unaffected by the order games appear in', () => {
    const ascending = game('2026.01.02', '10:00:00') + game('2026.03.04', '17:04:11');
    const descending = game('2026.03.04', '17:04:11') + game('2026.01.02', '10:00:00');
    expect(newestGameTimestamp(ascending)).toBe(newestGameTimestamp(descending));
  });

  it('reports nothing rather than guessing when the tags are absent', () => {
    expect(newestGameTimestamp('[Event "?"]\n\n1. e4 *')).toBeUndefined();
    expect(newestGameTimestamp('')).toBeUndefined();
  });
});
