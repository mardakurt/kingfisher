import { describe, expect, it } from 'vitest';

import {
  fetchChessComArchiveMonths,
  fetchChessComMonthPgn,
  monthKey,
  monthsToFetch,
} from './chess-com-sync';

function recorder(responder: (url: string) => Response) {
  const calls: string[] = [];
  const fetchImpl = (async (url: string | URL | Request) => {
    calls.push(String(url));
    return responder(String(url));
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

const archives = (months: readonly string[]) =>
  new Response(
    JSON.stringify({
      archives: months.map(
        (month) => `https://api.chess.com/pub/player/someone/games/${month.replace('-', '/')}`,
      ),
    }),
    { status: 200 },
  );

describe('fetchChessComArchiveMonths', () => {
  it('derives YYYY-MM keys from the published archive urls, oldest first', async () => {
    const { fetchImpl } = recorder(() => archives(['2026-03', '2025-12', '2026-01']));
    expect(await fetchChessComArchiveMonths('someone', { fetchImpl })).toEqual([
      '2025-12',
      '2026-01',
      '2026-03',
    ]);
  });

  it('lower-cases the username in the path, as the API expects', async () => {
    const { calls, fetchImpl } = recorder(() => archives([]));
    await fetchChessComArchiveMonths('MixedCase', { fetchImpl });
    expect(calls[0]).toBe('https://api.chess.com/pub/player/mixedcase/games/archives');
  });

  it('ignores an entry that is not a month archive rather than failing the whole list', async () => {
    const { fetchImpl } = recorder(
      () =>
        new Response(
          JSON.stringify({
            archives: ['https://api.chess.com/pub/player/x/games/2026/02', 7, 'x'],
          }),
          { status: 200 },
        ),
    );
    expect(await fetchChessComArchiveMonths('x', { fetchImpl })).toEqual(['2026-02']);
  });

  it('says so plainly when the response is not an archive list at all', async () => {
    const { fetchImpl } = recorder(
      () => new Response(JSON.stringify({ nope: true }), { status: 200 }),
    );
    await expect(fetchChessComArchiveMonths('x', { fetchImpl })).rejects.toMatchObject({
      state: 'unsupported',
    });
  });

  it('names the account when there is no such user', async () => {
    const { fetchImpl } = recorder(() => new Response('', { status: 404 }));
    await expect(fetchChessComArchiveMonths('nobody', { fetchImpl })).rejects.toMatchObject({
      state: 'misconfigured',
      message: expect.stringContaining('nobody'),
    });
  });

  it('reports a rate limit as a rate limit', async () => {
    const { fetchImpl } = recorder(() => new Response('', { status: 429 }));
    await expect(fetchChessComArchiveMonths('x', { fetchImpl })).rejects.toMatchObject({
      state: 'rate-limited',
    });
  });
});

describe('fetchChessComMonthPgn', () => {
  it('asks for the month PGN endpoint', async () => {
    const { calls, fetchImpl } = recorder(
      () => new Response('[Event "?"]\n\n1. e4 *', { status: 200 }),
    );
    const pgn = await fetchChessComMonthPgn('Someone', '2026-02', { fetchImpl });
    expect(calls[0]).toBe('https://api.chess.com/pub/player/someone/games/2026/02/pgn');
    expect(pgn).toContain('1. e4');
  });

  it('treats an empty month as empty rather than as an error', async () => {
    const { fetchImpl } = recorder(() => new Response('', { status: 200 }));
    expect(await fetchChessComMonthPgn('someone', '2026-02', { fetchImpl })).toBe('');
  });

  it('refuses a month that is not YYYY-MM before making a request', async () => {
    const { calls, fetchImpl } = recorder(() => new Response('', { status: 200 }));
    await expect(
      fetchChessComMonthPgn('someone', 'last-march', { fetchImpl }),
    ).rejects.toMatchObject({ state: 'misconfigured' });
    expect(calls).toHaveLength(0);
  });
});

describe('monthsToFetch', () => {
  const published = ['2025-11', '2025-12', '2026-01', '2026-02'];

  it('takes everything when nothing has been synced yet', () => {
    expect(monthsToFetch(published, undefined)).toEqual(published);
  });

  /*
    The settled months are the whole point of the cursor: a ten-year archive
    is fetched once, and every later sync asks for one or two months.
  */
  it('skips months that are settled, and re-fetches the month it stopped in', () => {
    expect(monthsToFetch(published, '2026-01')).toEqual(['2026-01', '2026-02']);
  });

  it('re-fetches only the last month when nothing newer has been published', () => {
    expect(monthsToFetch(published, '2026-02')).toEqual(['2026-02']);
  });

  it('sorts regardless of the order the archive list arrived in', () => {
    expect(monthsToFetch(['2026-02', '2025-11'], undefined)).toEqual(['2025-11', '2026-02']);
  });
});

describe('monthKey', () => {
  it('reckons in UTC, as the archives do', () => {
    expect(monthKey(Date.UTC(2026, 1, 15, 12))).toBe('2026-02');
    expect(monthKey(Date.UTC(2026, 11, 31, 23, 59))).toBe('2026-12');
  });
});
