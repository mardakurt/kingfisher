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
    const loose = await repositories.games.search({ text: 'Carlsen' });
    expect(loose.games).toHaveLength(2);
    // A text filter no index can answer is not counted unless asked; see below.
    expect(loose.total).toBeNull();
    expect((await repositories.games.search({ text: 'Carlsen', exactTotal: true })).total).toBe(2);
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
    expect((await repositories.games.search({ opening: 'gambit' })).games).toHaveLength(1);
    expect((await repositories.games.search({ eco: 'D' })).games).toHaveLength(1);
  });

  it('counts every stored game when nothing is asked of it', async () => {
    expect((await repositories.games.search()).total).toBe(2);
  });
});

/**
 * ADR 0014. A filter no index can answer has to visit every record to be
 * counted, and almost nobody wants the number — they want to know whether to
 * enable the Next button. The repository refuses to pay for a total nobody
 * asked for, and refuses to guess one.
 */
describe('what a page costs to count', () => {
  beforeEach(async () => {
    for (let index = 0; index < 12; index += 1) {
      await store({
        White: `Player ${index}`,
        Black: 'Opponent',
        Result: '1-0',
        Event: 'Countable Open',
        Date: `20${10 + index}.01.01`,
      });
    }
  });

  it('counts exactly when an index answers the whole query', async () => {
    const page = await repositories.games.search({ limit: 5 });
    expect(page.total).toBe(12);
    expect(page.hasMore).toBe(true);
  });

  it('returns no total for a filter the index cannot answer', async () => {
    const page = await repositories.games.search({ text: 'Countable', limit: 5 });
    expect(page.games).toHaveLength(5);
    expect(page.total).toBeNull();
    expect(page.hasMore).toBe(true);
  });

  it('still answers "is there another page" exactly without a total', async () => {
    const page = await repositories.games.search({ text: 'Countable', limit: 5, offset: 10 });
    expect(page.games).toHaveLength(2);
    expect(page.total).toBeNull();
    expect(page.hasMore).toBe(false);
  });

  it('pays for the count when the caller asks for one', async () => {
    const page = await repositories.games.search({ text: 'Countable', limit: 5, exactTotal: true });
    expect(page.total).toBe(12);
    expect(page.hasMore).toBe(true);
  });

  it('never reports an approximate number as a total', async () => {
    const page = await repositories.games.search({ text: 'Countable', limit: 5 });
    // Null rather than a guess: the one thing a database screen must not do is
    // show a confident wrong count.
    expect(page.total === null || page.total === 12).toBe(true);
  });

  it('does not claim more pages at the end of an exactly counted result', async () => {
    const page = await repositories.games.search({ limit: 12 });
    expect(page.hasMore).toBe(false);
  });
});

describe('the search mask header filters (Phase 81)', () => {
  beforeEach(async () => {
    await store({
      White: 'Anand, V',
      Black: 'Topalov, V',
      Result: '1-0',
      Event: 'World Championship 2010',
      Site: 'Sofia BUL',
      Date: '2010.05.11',
      WhiteElo: '2787',
      BlackElo: '2805',
      TimeControl: '40/7200:20/3600:900+30',
    });
    await store({
      White: 'Player, A',
      Black: 'Player, B',
      Result: '0-1',
      Event: 'Rated Blitz game',
      Site: 'https://lichess.org/abc',
      Date: '2024.03.02',
      WhiteElo: '2310',
      BlackElo: '1850',
      TimeControl: '180+2',
    });
    await store({
      White: 'Old, Master',
      Black: 'Young, Talent',
      Result: '1/2-1/2',
      Event: 'Club Championship',
      Date: '2010.??.??',
      TimeControl: '-',
    });
    await store({ White: 'No, Date', Black: 'No, Rating', Result: '*', Event: 'Club Blitz' });
  });

  const names = async (query: Parameters<typeof repositories.games.search>[0]) =>
    (await repositories.games.search({ ...query, exactTotal: true })).games
      .map((g) => g.white)
      .sort();

  it('finds an event or site by a remembered phrase, in any case', async () => {
    expect(await names({ event: 'championship' })).toEqual(['Anand, V', 'Old, Master']);
    expect(await names({ event: 'BLITZ' })).toEqual(['No, Date', 'Player, A']);
    expect(await names({ site: 'lichess' })).toEqual(['Player, A']);
  });

  it('compares full dates as dates, a year-only date by its year, and skips a dateless game', async () => {
    expect(await names({ fromDate: '2010-05-01', toDate: '2010-05-31' })).toEqual([
      'Anand, V',
      // "2010.??.??" knows only its year, which is inside the range.
      'Old, Master',
    ]);
    expect(await names({ fromDate: '2010-06-01', toDate: '2010-12-31' })).toEqual(['Old, Master']);
    expect(await names({ fromDate: '2011-01-01' })).toEqual(['Player, A']);
    // The dateless game matches no range at all.
    expect(await names({ toDate: '2099-12-31' })).not.toContain('No, Date');
  });

  it('reads a rating band for either player or for both', async () => {
    expect(await names({ minRating: 2300, maxRating: 2400 })).toEqual(['Player, A']);
    expect(await names({ minRating: 2300, maxRating: 2400, ratingScope: 'both' })).toEqual([]);
    expect(await names({ minRating: 1800, ratingScope: 'both' })).toEqual([
      'Anand, V',
      'Player, A',
    ]);
    expect(await names({ maxRating: 1900 })).toEqual(['Player, A']);
  });

  it('keeps what minRating alone has always meant', async () => {
    expect(await names({ minRating: 2800 })).toEqual(['Anand, V']);
  });

  it('filters by the time class the printed rule assigns', async () => {
    expect(await names({ timeClass: 'blitz' })).toEqual(['Player, A']);
    expect(await names({ timeClass: 'classical' })).toEqual(['Anand, V']);
    expect(await names({ timeClass: 'none' })).toEqual(['Old, Master']);
    expect(await names({ timeClass: 'unknown' })).toEqual(['No, Date']);
  });

  it('still applies every new predicate when an index answers another', async () => {
    // The player index narrows; event, band and class must still be tested.
    expect(await names({ player: 'Player, A', event: 'championship' })).toEqual([]);
    expect(await names({ result: '1-0', timeClass: 'blitz' })).toEqual([]);
    expect(await names({ fromDate: '2024-01-01', minRating: 2800 })).toEqual([]);
  });
});
