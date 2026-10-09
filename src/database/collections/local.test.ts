import 'fake-indexeddb/auto';

import { afterEach, describe, expect, it } from 'vitest';

import { parsePgn } from '@/chess/pgn';
import { openPersistenceDatabaseAt } from '@/persistence/indexeddb/database';
import type { PersistenceDatabase } from '@/persistence/indexeddb/database';
import { indexGame, normalizeGame } from '@/persistence/prepare-game';
import { LocalGameRepository } from '@/persistence/repositories/game-repository';
import { DATABASE_VERSION } from '@/persistence/schema/migrations';
import type { GameSearchQuery } from '@/persistence/types';

import { federatedSearch } from './federated';
import { LocalGameCollection } from './local';

let sequence = 0;
let browser: PersistenceDatabase | undefined;

afterEach(() => {
  browser?.close();
  browser = undefined;
});

function pgn(headers: Readonly<Record<string, string>>): string {
  const tags = Object.entries(headers)
    .map(([name, value]) => `[${name} "${value}"]`)
    .join('\n');
  return `${tags}\n\n1. e4 e5 1-0`;
}

async function collection(rows: readonly { id: string; headers: Record<string, string> }[]) {
  browser = await openPersistenceDatabaseAt(DATABASE_VERSION, `local-read-${++sequence}`);
  const repository = new LocalGameRepository(browser);
  for (const row of rows) {
    const parsed = parsePgn(pgn(row.headers)).games[0];
    if (!parsed) throw new Error(`fixture ${row.id} did not parse`);
    const game = { ...normalizeGame(parsed.tree, 1), id: row.id };
    await repository.persist(game, indexGame(game));
  }
  return new LocalGameCollection(browser, repository);
}

const rounds = async (
  source: LocalGameCollection,
  query: GameSearchQuery,
  limit: number,
): Promise<string[]> => {
  const page = await source.read(query, null, limit);
  return page.games.map((game) => game.summary.round ?? '');
};

describe('My games search', () => {
  it('returns a match that sits past more non-matching games than the page', async () => {
    const others = Array.from({ length: 8 }, (_, index) => ({
      id: `a${String(index).padStart(3, '0')}`,
      headers: {
        White: `Other, ${index}`,
        Black: 'Someone',
        Result: '1-0',
        Round: `other-${index}`,
      },
    }));
    const source = await collection([
      ...others,
      {
        id: 'b000',
        headers: {
          White: 'Target, Player',
          Black: 'Someone',
          Result: '1-0',
          Round: 'one',
        },
      },
      {
        id: 'b001',
        headers: {
          White: 'Target, Player',
          Black: 'Someone Else',
          Result: '1-0',
          Round: 'two',
        },
      },
    ]);
    const query = { player: 'target, player' };

    const page = await source.read(query, null, 5);
    expect(page.games.map((game) => game.summary.round)).toEqual(['one', 'two']);
    expect(page.nextAfter).toBeNull();

    const first = await source.read(query, null, 1);
    expect(first.games.map((game) => game.summary.round)).toEqual(['one']);
    expect(first.nextAfter).toBe('b000');
    const second = await source.read(query, first.nextAfter, 1);
    expect(second.games.map((game) => game.summary.round)).toEqual(['two']);
    expect(second.nextAfter).toBeNull();

    const federated = await federatedSearch([source], query, { perSource: 1 });
    expect(federated.hits.map((hit) => hit.game.round)).toEqual(['one']);
    expect(federated.truncated).toBe(true);
    expect(federated.failures).toEqual([]);
  });

  it('applies the game-list mask, including time control from the stored TimeControl tag', async () => {
    // A copy sends only player, year and minimum rating. Those still select,
    // and a game is not required to carry event, site, dates, a rating ceiling
    // or a time control for that query to match it.
    const keeper = {
      White: 'Keeper, A',
      Black: 'Opponent, B',
      Result: '1-0',
      Date: '2024.06.15',
      Event: 'Tata Steel',
      Site: 'Wijk aan Zee',
      WhiteElo: '2400',
      BlackElo: '2300',
      TimeControl: '5400+0',
    };
    const source = await collection([
      { id: 'k-match', headers: { ...keeper, Round: 'match' } },
      { id: 'k-event', headers: { ...keeper, Round: 'event', Event: 'Candidates' } },
      { id: 'k-site', headers: { ...keeper, Round: 'site', Site: 'London' } },
      { id: 'k-date', headers: { ...keeper, Round: 'date', Date: '2024.12.20' } },
      {
        id: 'k-max',
        headers: { ...keeper, Round: 'max', WhiteElo: '2700', BlackElo: '2600' },
      },
      {
        id: 'k-scope',
        headers: { ...keeper, Round: 'scope', WhiteElo: '2400', BlackElo: '1800' },
      },
      { id: 'k-rapid', headers: { ...keeper, Round: 'rapid', TimeControl: '600+0' } },
      { id: 'k-old', headers: { ...keeper, Round: 'old', Date: '2018.01.01' } },
      {
        id: 'k-low',
        headers: { ...keeper, Round: 'low', WhiteElo: '1500', BlackElo: '1400' },
      },
      {
        id: 'k-other',
        headers: { ...keeper, Round: 'other', White: 'Other, Player' },
      },
    ]);

    const copied = await rounds(
      source,
      { player: 'keeper, a', fromYear: 2020, minRating: 2200 },
      20,
    );
    expect([...copied].sort()).toEqual(['date', 'event', 'match', 'max', 'rapid', 'scope', 'site']);

    const masked = await rounds(
      source,
      {
        player: 'keeper, a',
        fromYear: 2020,
        minRating: 2200,
        maxRating: 2500,
        ratingScope: 'both',
        event: 'Tata',
        site: 'wijk',
        fromDate: '2024-01-01',
        toDate: '2024-06-30',
        timeClass: 'classical',
      },
      20,
    );
    expect(masked).toEqual(['match']);
  });
});
