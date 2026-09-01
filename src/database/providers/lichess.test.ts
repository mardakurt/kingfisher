import { afterEach, describe, expect, it, vi } from 'vitest';

import { START_FEN } from '@/chess/fen';

import { LichessExplorerProvider } from './lichess';

describe('LichessExplorerProvider failures', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('explains the authenticated-explorer boundary on HTTP 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    const provider = new LichessExplorerProvider('masters');
    await expect(provider.explore({ fen: START_FEN })).rejects.toMatchObject({
      message: 'Lichess now requires authentication for opening explorer requests.',
      remedy:
        'Authenticated Lichess access is not configured in this local-first milestone. Use "My games" to keep working offline.',
    });
  });
});
