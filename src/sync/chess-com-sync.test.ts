import { describe, expect, it } from 'vitest';

import {
  fetchChessComArchiveMonths,
  fetchChessComMonthPgn,
  fetchChessComProfile,
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
    expect(pgn.pgn).toContain('1. e4');
    expect(pgn.unchanged).toBe(false);
  });

  it('treats an empty month as empty rather than as an error', async () => {
    const { fetchImpl } = recorder(() => new Response('', { status: 200 }));
    expect(await fetchChessComMonthPgn('someone', '2026-02', { fetchImpl })).toEqual({
      pgn: '',
      unchanged: false,
    });
  });

  /**
   * The current month is re-fetched on every sync by design, because it can
   * still gain games. For a dormant account that meant downloading a whole
   * month of PGN to discover nothing had happened, every time.
   */
  it('sends the stored entity tag, and reads a 304 as "nothing new"', async () => {
    const seen: (HeadersInit | undefined)[] = [];
    const fetchImpl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      seen.push(init?.headers);
      return new Response(null, { status: 304 });
    }) as typeof fetch;

    const result = await fetchChessComMonthPgn('someone', '2026-02', {
      fetchImpl,
      etag: 'W/"abc"',
    });
    expect(seen[0]).toMatchObject({ 'if-none-match': 'W/"abc"' });
    expect(result).toEqual({ pgn: '', unchanged: true });
  });

  it('hands back the entity tag a 200 carried, so the next fetch can be conditional', async () => {
    const { fetchImpl } = recorder(
      () => new Response('[Event "x"]\n\n1. e4 *', { status: 200, headers: { etag: 'W/"new"' } }),
    );
    const result = await fetchChessComMonthPgn('someone', '2026-02', { fetchImpl });
    expect(result.etag).toBe('W/"new"');
    expect(result.unchanged).toBe(false);
  });

  it('tells a service outage apart from an unreachable network', async () => {
    const { fetchImpl } = recorder(() => new Response('', { status: 503 }));
    await expect(fetchChessComMonthPgn('someone', '2026-02', { fetchImpl })).rejects.toMatchObject({
      state: 'error',
    });

    const unreachable = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    await expect(
      fetchChessComMonthPgn('someone', '2026-02', { fetchImpl: unreachable }),
    ).rejects.toMatchObject({ state: 'network-error' });
  });

  it('reads a public profile and its current ratings, inferring nothing', async () => {
    const fetchImpl = (async (url: RequestInfo | URL) =>
      String(url).endsWith('/stats')
        ? new Response(
            JSON.stringify({
              chess_blitz: { last: { rating: 2801 } },
              chess_rapid: { last: { rating: 2740 } },
              puzzle_rush: { best: { score: 50 } },
            }),
          )
        : new Response(
            JSON.stringify({
              username: 'someone',
              name: 'Some One',
              title: 'GM',
              url: 'https://www.chess.com/member/someone',
              country: 'https://api.chess.com/pub/country/NO',
              joined: 1_500_000_000,
            }),
          )) as typeof fetch;

    const profile = await fetchChessComProfile('Someone', { fetchImpl });
    expect(profile.username).toBe('someone');
    expect(profile.title).toBe('GM');
    expect(profile.country).toBe('NO');
    expect(profile.ratings).toEqual({ blitz: 2801, rapid: 2740 });
    // `puzzle_rush` is not a rating and must not be reported as one.
    expect(profile.ratings).not.toHaveProperty('puzzle_rush');
    expect(profile.joined).toBe(1_500_000_000_000);
  });

  it('says which username is missing when Chess.com has no such account', async () => {
    const { fetchImpl } = recorder(() => new Response('', { status: 404 }));
    await expect(fetchChessComProfile('nobodyhere', { fetchImpl })).rejects.toThrow(
      /no account called "nobodyhere"/,
    );
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
