/**
 * Search, planning and pagination over the local game database.
 *
 * These exercise the *planned* paths — index ranges, ordering and paging —
 * rather than the shape of a single record. That distinction mattered: while
 * ranges were built from a global `IDBKeyRange`, none of this code ran under
 * test at all, because the tests run in Node where that global does not exist.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { parsePgn } from '@/chess/pgn';

import { normalizeGame } from '../import-game';
import type { AppRepositories, GameRecord } from '../types';
import { createMemoryRepositories } from './index';

let repositories: AppRepositories;

beforeEach(() => {
  repositories = createMemoryRepositories();
});

function game(headers: Record<string, string>, moves = '1. e4 *'): GameRecord {
  const pgn = `${Object.entries(headers)
    .map(([key, value]) => `[${key} "${value}"]`)
    .join('\n')}\n\n${moves}`;
  const parsed = parsePgn(pgn).games[0];
  if (!parsed) throw new Error('fixture did not parse');
  return normalizeGame(parsed.tree, 1);
}

async function store(headers: Record<string, string>, moves?: string): Promise<GameRecord> {
  const record = game(headers, moves);
  await repositories.games.persist(record, []);
  return record;
}

describe('who a player filter means', () => {
  beforeEach(async () => {
    await store({ White: 'Carlsen, Magnus', Black: 'Nepomniachtchi, Ian', Result: '1-0' });
    await store({ White: 'Carlsen, Henrik', Black: 'Nepomniachtchi, Ian', Result: '0-1' });
  });

  it('matches one whole name rather than everyone who shares a surname', async () => {
    const magnus = await repositories.games.search({ player: 'Carlsen, Magnus' });
    expect(magnus.total).toBe(1);
    expect(magnus.games[0]?.white).toBe('Carlsen, Magnus');
  });

  it('folds case and repeated whitespace, because that is the same person', async () => {
    const messy = await repositories.games.search({ player: '  carlsen,   MAGNUS ' });
    expect(messy.total).toBe(1);
  });

  it('returns nothing for a half-typed name instead of guessing a person', async () => {
    expect((await repositories.games.search({ player: 'Carlsen' })).total).toBe(0);
  });

  it('still searches names loosely through the text field', async () => {
    expect((await repositories.games.search({ text: 'Carlsen' })).total).toBe(2);
  });

  it('honours the colour a player is asked about', async () => {
    expect(
      (await repositories.games.search({ player: 'Nepomniachtchi, Ian', playerColor: 'w' })).total,
    ).toBe(0);
    expect(
      (await repositories.games.search({ player: 'Nepomniachtchi, Ian', playerColor: 'b' })).total,
    ).toBe(2);
  });
});

/**
 * The property a page must have: page 2 continues page 1 in the requested
 * order. An earlier version sorted only the rows it happened to be handed, so
 * "the most recent 100" meant "100 arbitrary games, displayed in date order".
 */
describe('paging a filtered, sorted result', () => {
  const years = [2019, 2014, 2022, 2011, 2017, 2024, 2013];

  beforeEach(async () => {
    for (const year of years) {
      await store({
        White: 'Tal, Mikhail',
        Black: `Opponent ${year}`,
        Date: `${year}.05.01`,
        Result: '1-0',
      });
    }
  });

  it('orders the whole filtered set, not the page', async () => {
    const page = await repositories.games.search({
      player: 'Tal, Mikhail',
      sortBy: 'date',
      sortDirection: 'desc',
      limit: 3,
    });
    expect(page.games.map((entry) => entry.year)).toEqual([2024, 2022, 2019]);
    expect(page.total).toBe(years.length);
  });

  it('continues on the next page without repeating or skipping a game', async () => {
    const query = {
      player: 'Tal, Mikhail',
      sortBy: 'date',
      sortDirection: 'desc',
      limit: 3,
    } as const;
    const first = await repositories.games.search({ ...query, offset: 0 });
    const second = await repositories.games.search({ ...query, offset: 3 });
    const third = await repositories.games.search({ ...query, offset: 6 });

    const seen = [...first.games, ...second.games, ...third.games].map((entry) => entry.year);
    expect(seen).toEqual([...years].sort((a, b) => b - a));
    expect(new Set(seen).size).toBe(years.length);
  });

  it('reports a total that counts every match, not the page', async () => {
    const page = await repositories.games.search({ player: 'Tal, Mikhail', limit: 2 });
    expect(page.games).toHaveLength(2);
    expect(page.total).toBe(years.length);
  });

  it('sorts by a field no index carries, across the whole match set', async () => {
    const page = await repositories.games.search({
      player: 'Tal, Mikhail',
      sortBy: 'date',
      sortDirection: 'asc',
      limit: 2,
    });
    expect(page.games.map((entry) => entry.year)).toEqual([2011, 2013]);
  });

  it('runs off the end of the result rather than inventing rows', async () => {
    const page = await repositories.games.search({ player: 'Tal, Mikhail', offset: 99, limit: 10 });
    expect(page.games).toEqual([]);
    expect(page.total).toBe(years.length);
  });
});

describe('filters combine rather than replace each other', () => {
  beforeEach(async () => {
    await store({
      White: 'Kramnik, Vladimir',
      Black: 'Leko, Peter',
      Result: '1-0',
      Date: '2004.10.02',
      WhiteElo: '2770',
      ECO: 'C42',
      Opening: 'Petrov',
    });
    await store({
      White: 'Kramnik, Vladimir',
      Black: 'Leko, Peter',
      Result: '0-1',
      Date: '2018.06.01',
      WhiteElo: '2700',
      ECO: 'D37',
      Opening: 'Queen’s Gambit',
      Round: '2',
    });
  });

  it('applies every predicate when the index only answers one of them', async () => {
    const narrowed = await repositories.games.search({
      player: 'Kramnik, Vladimir',
      result: '1-0',
      fromYear: 2000,
      toYear: 2010,
      minRating: 2750,
      eco: 'C4',
    });
    expect(narrowed.total).toBe(1);
    expect(narrowed.games[0]?.eco).toBe('C42');
  });

  it('narrows by year even when no player is named', async () => {
    expect((await repositories.games.search({ fromYear: 2010 })).total).toBe(1);
    expect((await repositories.games.search({ toYear: 2010 })).total).toBe(1);
  });

  it('narrows by result on its own', async () => {
    expect((await repositories.games.search({ result: '0-1' })).total).toBe(1);
  });

  it('matches an opening by substring and an ECO by prefix', async () => {
    expect((await repositories.games.search({ opening: 'gambit' })).total).toBe(1);
    expect((await repositories.games.search({ eco: 'D' })).total).toBe(1);
  });

  it('counts every stored game when nothing is asked of it', async () => {
    expect((await repositories.games.search()).total).toBe(2);
  });
});
