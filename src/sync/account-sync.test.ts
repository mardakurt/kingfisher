import { describe, expect, it } from 'vitest';

import type { LinkedAccountRecord } from '@/persistence/domain';
import { createMemoryRepositories } from '@/persistence/repositories';

import { syncAccount } from './account-sync';

const lichessAccount = (overrides: Partial<LinkedAccountRecord> = {}): LinkedAccountRecord => ({
  id: 'lichess:testuser',
  provider: 'lichess',
  username: 'testuser',
  createdAt: 1000,
  importedCount: 0,
  duplicatesSkipped: 0,
  ...overrides,
});

const chessComAccount = (overrides: Partial<LinkedAccountRecord> = {}): LinkedAccountRecord => ({
  id: 'chess.com:testuser',
  provider: 'chess.com',
  username: 'testuser',
  createdAt: 1000,
  importedCount: 0,
  duplicatesSkipped: 0,
  ...overrides,
});

const game = (white: string, black: string, date: string, time: string, moves: string) =>
  `[Event "Rated blitz game"]\n[Site "https://lichess.org/abcd1234"]\n[White "${white}"]\n[Black "${black}"]\n[Result "1-0"]\n[UTCDate "${date}"]\n[UTCTime "${time}"]\n\n${moves} 1-0\n\n`;

const TWO_GAMES =
  game('testuser', 'opponent1', '2026.01.02', '10:00:00', '1. e4 e5 2. Nf3') +
  game('opponent2', 'testuser', '2026.03.04', '17:04:11', '1. d4 d5 2. c4');

function stubFetch(handler: (url: string) => Response | Promise<Response>): typeof fetch {
  return (async (url: string | URL | Request) => handler(String(url))) as unknown as typeof fetch;
}

describe('syncing a Lichess account', () => {
  it('imports the games it fetched into the ordinary local collection', async () => {
    const repositories = createMemoryRepositories();
    const result = await syncAccount(lichessAccount(), repositories.games, {
      fetchImpl: stubFetch(() => new Response(TWO_GAMES, { status: 200 })),
    });

    expect(result.imported).toBe(2);
    expect(result.duplicates).toBe(0);
    expect(await repositories.games.count()).toBe(2);

    // Stored by the same pipeline as any other import: searchable at once.
    const found = await repositories.games.search({ player: 'testuser' });
    expect(found.games).toHaveLength(2);
  });

  /**
   * The property the whole design rests on. Sync twice and the second run
   * imports nothing, because a synced game is fingerprinted by the same code
   * that fingerprints a pasted one — there is no dedup logic in the sync
   * path at all, and there does not need to be.
   */
  it('imports nothing the second time the same games are fetched', async () => {
    const repositories = createMemoryRepositories();
    const fetchImpl = stubFetch(() => new Response(TWO_GAMES, { status: 200 }));

    const first = await syncAccount(lichessAccount(), repositories.games, { fetchImpl });
    const second = await syncAccount(lichessAccount(), repositories.games, { fetchImpl });

    expect(first.imported).toBe(2);
    expect(second.imported).toBe(0);
    expect(second.duplicates).toBe(2);
    expect(await repositories.games.count()).toBe(2);
  });

  it('advances the cursor to the newest game it actually imported', async () => {
    const repositories = createMemoryRepositories();
    const result = await syncAccount(lichessAccount(), repositories.games, {
      fetchImpl: stubFetch(() => new Response(TWO_GAMES, { status: 200 })),
    });

    expect(result.cursor.lastGameTimestamp).toBe(Date.UTC(2026, 2, 4, 17, 4, 11));
  });

  it('asks only for games newer than the cursor, one millisecond past it', async () => {
    const repositories = createMemoryRepositories();
    const asked: string[] = [];
    await syncAccount(
      lichessAccount({ lastGameTimestamp: 1_700_000_000_000 }),
      repositories.games,
      {
        fetchImpl: stubFetch((url) => {
          asked.push(url);
          return new Response('', { status: 200 });
        }),
      },
    );

    expect(new URL(asked[0] ?? '').searchParams.get('since')).toBe('1700000000001');
  });

  it('reports being up to date, and moves no cursor, when there is nothing new', async () => {
    const repositories = createMemoryRepositories();
    const result = await syncAccount(
      lichessAccount({ lastGameTimestamp: 5_000 }),
      repositories.games,
      { fetchImpl: stubFetch(() => new Response('   \n', { status: 200 })) },
    );

    expect(result).toEqual({ imported: 0, duplicates: 0, upToDate: true, cursor: {} });
  });

  it('surfaces a rate limit rather than reporting an empty sync', async () => {
    const repositories = createMemoryRepositories();
    await expect(
      syncAccount(lichessAccount(), repositories.games, {
        fetchImpl: stubFetch(() => new Response('', { status: 429 })),
      }),
    ).rejects.toMatchObject({ state: 'rate-limited' });
    // Nothing was written on the way to failing.
    expect(await repositories.games.count()).toBe(0);
  });
});

describe('syncing a Chess.com account', () => {
  const archiveList = (months: readonly string[]) =>
    new Response(
      JSON.stringify({
        archives: months.map(
          (month) => `https://api.chess.com/pub/player/testuser/games/${month.replace('-', '/')}`,
        ),
      }),
      { status: 200 },
    );

  it('walks the published months and imports each one', async () => {
    const repositories = createMemoryRepositories();
    const result = await syncAccount(chessComAccount(), repositories.games, {
      fetchImpl: stubFetch((url) => {
        if (url.endsWith('/archives')) return archiveList(['2026-01', '2026-02']);
        if (url.endsWith('/2026/01/pgn'))
          return new Response(game('testuser', 'a', '2026.01.02', '10:00:00', '1. e4 e5'), {
            status: 200,
          });
        return new Response(game('b', 'testuser', '2026.02.03', '11:00:00', '1. d4 d5'), {
          status: 200,
        });
      }),
    });

    expect(result.imported).toBe(2);
    expect(result.cursor.lastSyncedMonth).toBe('2026-02');
    expect(await repositories.games.count()).toBe(2);
  });

  it('re-fetches only from the month it stopped in, and duplicates nothing', async () => {
    const repositories = createMemoryRepositories();
    const requested: string[] = [];
    const fetchImpl = stubFetch((url) => {
      requested.push(url);
      if (url.endsWith('/archives')) return archiveList(['2025-12', '2026-01', '2026-02']);
      if (url.endsWith('/2026/02/pgn'))
        return new Response(game('testuser', 'c', '2026.02.03', '11:00:00', '1. c4 e5'), {
          status: 200,
        });
      return new Response('', { status: 200 });
    });

    const first = await syncAccount(
      chessComAccount({ lastSyncedMonth: '2026-02' }),
      repositories.games,
      { fetchImpl },
    );
    expect(first.imported).toBe(1);

    // The settled months were never asked for.
    expect(requested.some((url) => url.includes('/2025/12/'))).toBe(false);
    expect(requested.some((url) => url.includes('/2026/01/'))).toBe(false);

    const second = await syncAccount(
      chessComAccount({ lastSyncedMonth: first.cursor.lastSyncedMonth as string }),
      repositories.games,
      { fetchImpl },
    );
    expect(second.imported).toBe(0);
    expect(second.duplicates).toBe(1);
    expect(await repositories.games.count()).toBe(1);
  });

  it('reports being up to date when every published month is empty', async () => {
    const repositories = createMemoryRepositories();
    const result = await syncAccount(chessComAccount(), repositories.games, {
      fetchImpl: stubFetch((url) =>
        url.endsWith('/archives') ? archiveList(['2026-01']) : new Response('', { status: 200 }),
      ),
    });

    expect(result.upToDate).toBe(true);
    expect(result.imported).toBe(0);
  });

  it('reports being up to date when the account has no archives at all', async () => {
    const repositories = createMemoryRepositories();
    const result = await syncAccount(chessComAccount(), repositories.games, {
      fetchImpl: stubFetch(() => archiveList([])),
    });

    expect(result).toEqual({ imported: 0, duplicates: 0, upToDate: true, cursor: {} });
  });

  it('surfaces a missing account rather than reporting an empty library', async () => {
    const repositories = createMemoryRepositories();
    await expect(
      syncAccount(chessComAccount({ username: 'nobody' }), repositories.games, {
        fetchImpl: stubFetch(() => new Response('', { status: 404 })),
      }),
    ).rejects.toMatchObject({ state: 'misconfigured' });
  });
});
