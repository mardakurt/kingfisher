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

  it('sends the token when one is configured, and no header when it is not', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new LichessExplorerProvider('masters');

    await expect(provider.explore({ fen: START_FEN })).rejects.toThrow(/rate limiting/);
    const anonymous = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((anonymous.headers as Record<string, string>).Authorization).toBeUndefined();

    setLichessToken('lip_example');
    await expect(provider.explore({ fen: START_FEN })).rejects.toThrow(/rate limiting/);
    const authenticated = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect((authenticated.headers as Record<string, string>).Authorization).toBe(
      'Bearer lip_example',
    );
  });

  it('never invents evidence when the service is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    const provider = new LichessExplorerProvider('masters');
    await expect(provider.explore({ fen: START_FEN })).rejects.toThrow(/503/);
  });
});
