import { beforeEach, describe, expect, it } from 'vitest';

import { parsePgn } from '@/chess/pgn';
import { normalizeGame } from '@/persistence/import-game';
import { createMemoryRepositories } from '@/persistence/repositories';
import type { AppRepositories } from '@/persistence/types';
import { parseMaterialQuery } from '@/search/material-query';

import { runDeepSearch, type DeepSearchState } from './deep-search';

let repositories: AppRepositories;

const RV_B = '[SetUp "1"]\n[FEN "3r2k1/8/8/8/2b5/8/8/3R2K1 w - - 0 1"]';

async function store(headers: string, moves: string) {
  const parsed = parsePgn(`${headers}\n\n${moves}`).games[0];
  if (!parsed) throw new Error('fixture did not parse');
  await repositories.games.persist(normalizeGame(parsed.tree, 1), []);
}

const rookAgainstBishop = () => {
  const parsed = parseMaterialQuery('R v B');
  if (!parsed.ok) throw new Error(parsed.error);
  return { material: { query: parsed.query } };
};

beforeEach(async () => {
  repositories = createMemoryRepositories();
  await store(
    `[White "A"]\n[Black "B"]\n[Result "1-0"]\n[Event "Open"]\n${RV_B}`,
    '1. Rxd8+ Kf7 1-0',
  );
  await store(
    `[White "C"]\n[Black "D"]\n[Result "1-0"]\n[Event "Club"]\n${RV_B}`,
    '1. Rxd8+ Kf7 1-0',
  );
  await store('[White "E"]\n[Black "F"]\n[Result "1/2-1/2"]\n[Event "Open"]', '1. e4 e5 1/2-1/2');
});

describe('runDeepSearch', () => {
  it('reads the games the header chose and names the denominator', async () => {
    const state = await runDeepSearch({
      games: repositories.games,
      header: { event: 'open' },
      deep: rookAgainstBishop(),
    });
    expect(state).toMatchObject({ status: 'done', selected: 2, read: 2 });
    expect(state.matches.map((match) => match.game.white)).toEqual(['A']);
    expect(state.matches[0]!.hit.ply).toBe(1);
    // A match carries a summary, never the moves it was found in.
    expect('tree' in state.matches[0]!.game).toBe(false);
  });

  it('reports progress, and stops when told, keeping what it found', async () => {
    const controller = new AbortController();
    const seen: DeepSearchState[] = [];
    controller.abort();
    const state = await runDeepSearch({
      games: repositories.games,
      header: {},
      deep: rookAgainstBishop(),
      signal: controller.signal,
      onProgress: (progress) => seen.push(progress),
    });
    expect(state.status).toBe('stopped');
    expect(state.read).toBe(0);
    expect(seen.at(-1)?.status).toBe('stopped');
  });

  it('says it failed instead of returning an empty answer', async () => {
    const state = await runDeepSearch({
      games: {
        search: () => Promise.reject(new Error('storage refused')),
        getMany: () => Promise.resolve([]),
      },
      header: {},
      deep: rookAgainstBishop(),
    });
    expect(state).toMatchObject({ status: 'failed', error: 'storage refused', matches: [] });
  });
});
