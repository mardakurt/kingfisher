import { afterEach, describe, expect, it, vi } from 'vitest';

import { START_FEN } from '@/chess/fen';

import { LichessExplorerProvider } from './lichess';
import { setLichessToken } from './lichess-auth';

describe('LichessExplorerProvider authentication', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setLichessToken('');
  });

  it('tells an unauthenticated user how to get access, and what still works', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    const provider = new LichessExplorerProvider('masters');
    await expect(provider.explore({ fen: START_FEN })).rejects.toMatchObject({
      message: 'Lichess requires an API token for opening explorer requests.',
      remedy: expect.stringContaining('Settings → Database'),
    });
  });

  /** A rejected token is a different problem from a missing one. */
  it('distinguishes a rejected token from a missing one', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    setLichessToken('lip_broken');

    const provider = new LichessExplorerProvider('masters');
    await expect(provider.explore({ fen: START_FEN })).rejects.toMatchObject({
      message: 'Lichess rejected the configured API token.',
      remedy: expect.stringContaining('fresh token'),
    });
  });

  it('does not send an anonymous request and sends the token when configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new LichessExplorerProvider('masters');

    await expect(provider.explore({ fen: START_FEN })).rejects.toThrow(/requires an API token/);
    expect(fetchMock).not.toHaveBeenCalled();

    setLichessToken('lip_example');
    await expect(provider.explore({ fen: START_FEN })).rejects.toThrow(/rate limiting/);
    const authenticated = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((authenticated.headers as Record<string, string>).Authorization).toBe(
      'Bearer lip_example',
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('https://explorer.lichess.org/masters');
  });

  it('never invents evidence when the service is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    setLichessToken('lip_example');
    const provider = new LichessExplorerProvider('masters');
    await expect(provider.explore({ fen: START_FEN })).rejects.toThrow(/503/);
  });

  it('rejects invalid JSON and schema instead of treating it as empty evidence', async () => {
    setLichessToken('lip_example');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('<html>down</html>', { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ moves: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new LichessExplorerProvider('masters');

    await expect(provider.explore({ fen: START_FEN })).rejects.toThrow(/could not read/);
    await expect(provider.explore({ fen: START_FEN })).rejects.toThrow(/unexpected explorer/);
  });

  it('parses the final player NDJSON update and maps recent games', async () => {
    setLichessToken('lip_example');
    const initial = JSON.stringify({ white: 1, draws: 0, black: 0, moves: [] });
    const complete = JSON.stringify({
      white: 2,
      draws: 1,
      black: 0,
      moves: [
        {
          uci: 'e2e4',
          san: 'e4',
          white: 2,
          draws: 1,
          black: 0,
          averageOpponentRating: 2100,
          opening: { eco: 'B00', name: "King's Pawn" },
        },
      ],
      recentGames: [
        {
          id: 'abcd1234',
          winner: 'white',
          white: { name: 'Player' },
          black: { name: 'Opponent' },
          year: 2026,
        },
      ],
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(`${initial}\n\n${complete}\n`, { status: 200 })),
    );

    const provider = new LichessExplorerProvider('player');
    const result = await provider.explore({
      fen: START_FEN,
      filters: { player: 'Player', playerColor: 'w' },
    });
    expect(result.totalGames).toBe(3);
    expect(result.moves[0]).toMatchObject({
      san: 'e4',
      averageRating: 2100,
      opening: { eco: 'B00' },
    });
    expect(result.topGames?.[0]?.id).toBe('abcd1234');
  });
});
