import { describe, expect, it } from 'vitest';

import { mainlinePath } from '@/chess/tree/tree';

import { scanCollection } from './scan';
import type { TransferGame, TransferPage } from './types';

const game = (id: string, pgn: string): TransferGame => ({
  summary: { id, white: id, black: '?', result: '*' } as TransferGame['summary'],
  pgn,
  positions: [],
});

/** A collection stub: the boundary, paged like the real stores, no tree sent. */
function collection(games: readonly TransferGame[]) {
  let reads = 0;
  return {
    reads: () => reads,
    count: async () => games.length,
    read: async (_query: unknown, after: string | null, limit: number): Promise<TransferPage> => {
      reads += 1;
      const start = after === null ? 0 : Number(after);
      const slice = games.slice(start, start + limit);
      const next = start + limit < games.length ? String(start + limit) : null;
      return { games: slice, nextAfter: next };
    },
  };
}

describe('scanning a collection game by game', () => {
  it('reads every page, parses movetext into trees, and keeps the answers', async () => {
    const source = collection([
      game('a', '1. e4 e5 2. Nf3 *'),
      game('b', '1. d4 d5 *'),
      game('c', '1. e4 c5 *'),
    ]);
    const progress: number[] = [];
    const state = await scanCollection({
      collection: source,
      pageSize: 2,
      visit: (tree) => {
        const first = tree.nodes[mainlinePath(tree)[1]!]?.move?.san;
        return first === 'e4' ? mainlinePath(tree).length - 1 : null;
      },
      onProgress: (s) => progress.push(s.read),
    });
    expect(state.status).toBe('done');
    expect(state.read).toBe(3);
    expect(state.total).toBe(3);
    expect(state.hits.map((hit) => [hit.game.id, hit.answer])).toEqual([
      ['a', 3],
      ['c', 2],
    ]);
    expect(source.reads()).toBe(2);
    expect(progress.at(-1)).toBe(3);
  });

  it('counts a game it cannot read rather than failing the scan', async () => {
    const state = await scanCollection({
      collection: collection([game('a', 'this is not chess'), game('b', '1. e4 *')]),
      visit: () => true,
    });
    expect(state.unreadable).toBe(1);
    expect(state.hits).toHaveLength(1);
  });

  it('stops when told to, and says so, keeping what it found', async () => {
    const controller = new AbortController();
    const games = Array.from({ length: 10 }, (_, i) => game(String(i), '1. e4 *'));
    const state = await scanCollection({
      collection: collection(games),
      pageSize: 3,
      signal: controller.signal,
      visit: () => true,
      onProgress: (s) => {
        if (s.read >= 3) controller.abort();
      },
    });
    expect(state.status).toBe('stopped');
    expect(state.read).toBe(3);
    expect(state.hits).toHaveLength(3);
  });
});
