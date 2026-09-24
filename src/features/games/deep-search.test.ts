import { beforeEach, describe, expect, it } from 'vitest';

import { parsePgn } from '@/chess/pgn';
import { normalizeGame } from '@/persistence/import-game';
import { createMemoryRepositories } from '@/persistence/repositories';
import type { AppRepositories, GameSummary } from '@/persistence/types';
import { parseMaterialQuery } from '@/search/material-query';

import {
  runDeepSearch,
  runPagedDeepSearch,
  type DeepSearchState,
  type MovePage,
} from './deep-search';

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

describe('runPagedDeepSearch', () => {
  const summary = (id: string) => ({ id }) as unknown as GameSummary;
  const PAGES: Record<string, MovePage> = {
    start: {
      games: [
        { summary: summary('g1'), pgn: `${RV_B}\n\n1. Rxd8+ Kf7 *` },
        { summary: summary('g2'), pgn: '1. e4 e5 *' },
      ],
      nextAfter: '2',
    },
    '2': {
      games: [
        { summary: summary('g3'), pgn: null },
        { summary: summary('g4'), pgn: `${RV_B}\n\n1. Rxd8+ Kf7 *` },
      ],
      nextAfter: '4',
    },
    '4': { games: [], nextAfter: null },
  };
  const parse = (pgn: string) => parsePgn(pgn).games[0]?.tree ?? null;

  it('reads every page, asks each game the question, and keeps the denominator honest', async () => {
    const seen: (string | null)[] = [];
    const states: DeepSearchState[] = [];
    const result = await runPagedDeepSearch({
      selected: 4,
      page: async (after) => {
        seen.push(after);
        return PAGES[after ?? 'start']!;
      },
      parse,
      deep: rookAgainstBishop(),
      onProgress: (state) => states.push(state),
    });
    expect(seen).toEqual([null, '2', '4']);
    expect(result.status).toBe('done');
    // A game with no readable moves is neither read nor selected.
    expect(result).toMatchObject({ read: 3, selected: 3 });
    expect(result.matches.map((match) => match.game.id)).toEqual(['g1', 'g4']);
    expect(states.at(-1)).toEqual(result);
  });

  it('stops between pages and says it was stopped', async () => {
    const controller = new AbortController();
    const result = await runPagedDeepSearch({
      selected: 4,
      page: async (after) => {
        controller.abort();
        return PAGES[after ?? 'start']!;
      },
      parse,
      deep: rookAgainstBishop(),
      signal: controller.signal,
    });
    expect(result).toMatchObject({ status: 'stopped', read: 2 });
  });

  it('reports a failed page as a failure, with what it found so far', async () => {
    const result = await runPagedDeepSearch({
      selected: 4,
      page: async (after) => {
        if (after) throw new Error('The companion stopped answering.');
        return PAGES.start!;
      },
      parse,
      deep: rookAgainstBishop(),
    });
    expect(result).toMatchObject({
      status: 'failed',
      error: 'The companion stopped answering.',
      read: 2,
    });
    expect(result.matches).toHaveLength(1);
  });
});
