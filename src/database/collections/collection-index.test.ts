import { describe, expect, it } from 'vitest';

import { CollectionIndexBuilder, readCollectionIndex } from './collection-index';
import type { DuplicateKey } from './types';

let id = 0;
const game = (
  white: string,
  black: string,
  result: string,
  event?: string,
  date?: string,
): DuplicateKey => ({
  id: String((id += 1)),
  fingerprint: String(id),
  white,
  black,
  result,
  ...(event !== undefined ? { event } : {}),
  ...(date !== undefined ? { date } : {}),
});

describe('CollectionIndexBuilder', () => {
  it('counts players with their own results, from either colour', () => {
    const builder = new CollectionIndexBuilder();
    builder.add([
      game('Carlsen, Magnus', 'Caruana, Fabiano', '1-0', 'Norway Chess', '2025.05.27'),
      game('Caruana, Fabiano', 'carlsen,  magnus', '1/2-1/2', 'Norway Chess', '2025.05.28'),
      game('Carlsen, Magnus', 'Nakamura, Hikaru', '0-1', 'Norway Chess', '2025.05.29'),
      game('Carlsen, Magnus', '?', '*', 'Casual game', '2024.01.01'),
    ]);
    const index = builder.build();
    expect(index.games).toBe(4);
    expect(index.players[0]).toEqual({
      name: 'Carlsen, Magnus',
      games: 4,
      wins: 1,
      draws: 1,
      losses: 1,
      // An unfinished game is counted as played and scores for nobody.
      score: 50,
      firstYear: 2024,
      lastYear: 2025,
    });
    expect(index.players.map((player) => player.name)).not.toContain('?');
    expect(index.withoutEvent).toBe(1);
  });

  it('keeps one tournament per edition, newest first, with its players counted', () => {
    const builder = new CollectionIndexBuilder();
    builder.add([
      game('A', 'B', '1-0', 'Tata Steel', '2024.01.20'),
      game('C', 'A', '0-1', 'Tata Steel', '2024.01.21'),
      game('A', 'D', '1-0', 'Tata Steel', '2025.01.19'),
      game('A', 'B', '1-0', 'Club', undefined),
    ]);
    const index = builder.build();
    expect(index.tournaments.map((t) => [t.name, t.year, t.games, t.players])).toEqual([
      ['Tata Steel', 2025, 1, 2],
      ['Tata Steel', 2024, 2, 3],
      ['Club', null, 1, 2],
    ]);
    expect(index.undated).toBe(1);
    expect([index.firstYear, index.lastYear]).toEqual([2024, 2025]);
  });
});

describe('readCollectionIndex', () => {
  it('walks every page and reports what it has read', async () => {
    const pages = [
      { games: [game('A', 'B', '1-0', 'E', '2020.01.01')], nextAfter: 'x' },
      { games: [game('B', 'A', '1-0', 'E', '2020.01.02')], nextAfter: 'y' },
      { games: [], nextAfter: 'z' },
    ];
    const seen: number[] = [];
    const index = await readCollectionIndex(
      { duplicateKeys: async () => pages.shift()! },
      { onPage: (read) => seen.push(read) },
    );
    expect(index.games).toBe(2);
    expect(index.players.map((p) => [p.name, p.wins, p.losses])).toEqual([
      ['A', 1, 1],
      ['B', 1, 1],
    ]);
    expect(seen).toEqual([1, 2, 2]);
  });
});
