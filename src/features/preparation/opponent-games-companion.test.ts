import { afterEach, describe, expect, it, vi } from 'vitest';

// The browser's own store and the pack registry are boundaries here: empty.
vi.mock('@/persistence/repositories', () => ({
  getRepositories: async () => ({
    games: { search: async () => ({ games: [], total: 0 }), getMany: async () => [] },
  }),
}));
vi.mock('@/reference/manager', () => ({ readyPackReaders: () => [] }));

import { setCompanion } from '@/companion/session';

import { collectOpponentGames } from './opponent-games';

const PGN = (white: string, black: string, date: string, whiteElo: number, moves: string) =>
  `[Event "Rated Blitz game"]\n[Site "https://lichess.org"]\n[Date "${date}"]\n[White "${white}"]\n[Black "${black}"]\n[Result "1-0"]\n[WhiteElo "${whiteElo}"]\n[BlackElo "1500"]\n\n${moves} 1-0\n`;

const GAMES: Record<string, string> = {
  g1: PGN('Opponent', 'Someone', '2014.07.03', 2210, '1. e4 c5 2. Nf3 d6'),
  g2: PGN('Opponent', 'Another', '2014.07.02', 1900, '1. d4 d5 2. c4 e6'),
};

afterEach(() => {
  setCompanion(null);
  vi.unstubAllGlobals();
});

describe('opponent preparation over a companion database', () => {
  it('reads the player’s games from each attached database, as its own source', async () => {
    const asked: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        const reply = (value: unknown) =>
          new Response(JSON.stringify(value), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        if (url.endsWith('/status')) {
          return reply({
            engines: [],
            sessions: [],
            databases: [
              {
                key: 'lichess',
                name: 'Lichess 2014-07 (CC0)',
                games: 1_048_440,
                file: 'x',
                bytes: 1,
              },
            ],
          });
        }
        if (url.endsWith('/db/search')) {
          asked.push(body.query);
          // Filed under the normalised key, as the import kit files it.
          return reply(
            body.query.player === 'opponent'
              ? { games: [{ id: 'g1' }, { id: 'g2' }], total: 2 }
              : { games: [], total: 0 },
          );
        }
        if (url.endsWith('/db/content')) return reply({ pgn: GAMES[body.id] ?? null });
        return new Response('{}', { status: 404 });
      }),
    );
    setCompanion({ url: 'http://127.0.0.1:4390', token: 't' });

    const result = await collectOpponentGames({
      name: 'Opponent',
      side: 'w',
      minRating: 2000,
      limit: 200,
    });

    // The rating filter is applied here, to the player's own rating: g2 (1900) is out.
    expect(result.games.map((game) => game.white)).toEqual(['Opponent']);
    expect(result.games[0]!.whiteRating).toBe(2210);
    expect(result.sources).toEqual([
      { id: 'sqlite:lichess', name: 'Lichess 2014-07 (CC0)', found: 1, games: 1 },
    ]);
    // The companion was asked by key and colour, newest first.
    expect(asked[0]).toMatchObject({
      player: 'opponent',
      playerColor: 'w',
      sortBy: 'date',
      sortDirection: 'desc',
    });
  });

  it('holds nothing from a companion that does not answer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('connection refused');
      }),
    );
    setCompanion({ url: 'http://127.0.0.1:4390', token: 't' });
    const result = await collectOpponentGames({ name: 'Opponent', limit: 200 });
    expect(result.games).toEqual([]);
    expect(result.sources).toEqual([]);
  });
});
