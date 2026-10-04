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

describe('the index’s openings and top games', () => {
  const row = (extra: Partial<DuplicateKey>, result = '1-0'): DuplicateKey => ({
    ...game('White, W', 'Black, B', result),
    ...extra,
  });

  it('groups families by the classification, else the tag, else the ECO code', () => {
    const builder = new CollectionIndexBuilder();
    builder.add([
      // Classified: the computed name wins over the file's tag.
      row({ classifiedName: 'Sicilian Defense', opening: 'Sicilian', eco: 'B90' }, '1-0'),
      // Only a tag, with a variation after the colon: the family is before it.
      row({ opening: 'Sicilian Defense: Najdorf Variation', eco: 'B90' }, '1/2-1/2'),
      row({ opening: 'French Defense' }, '0-1'),
      // Only a code.
      row({ eco: 'a00' }, '1-0'),
      // Nothing at all.
      row({}, '1-0'),
    ]);
    const index = builder.build();
    expect(index.openings).toEqual([
      {
        name: 'Sicilian Defense',
        byName: true,
        games: 2,
        white: 1,
        draws: 1,
        black: 0,
        whiteScore: 75,
      },
      { name: 'A00', byName: false, games: 1, white: 1, draws: 0, black: 0, whiteScore: 100 },
      {
        name: 'French Defense',
        byName: true,
        games: 1,
        white: 0,
        draws: 0,
        black: 1,
        whiteScore: 0,
      },
    ]);
    expect(index.withoutOpening).toBe(1);
  });

  it('keeps the ten games with the highest rating sum, and none missing a rating', () => {
    const builder = new CollectionIndexBuilder();
    const rated = Array.from({ length: 14 }, (_, n) =>
      row({ whiteRating: 2000 + n * 10, blackRating: 2000, id: `r${n}` }),
    );
    builder.add([...rated, row({ whiteRating: 2900, id: 'one-rating' })]);
    builder.add([row({ whiteRating: 2500, blackRating: 2500, id: 'late' })]);
    const top = builder.build().topGames.map((entry) => entry.id);
    expect(top).toEqual(['late', 'r13', 'r12', 'r11', 'r10', 'r9', 'r8', 'r7', 'r6', 'r5']);
  });
});

describe('the index of annotators, sources and teams', () => {
  it('counts each tag once per game, and the games that carry none', async () => {
    const { readTagIndex } = await import('./collection-index');
    const pages = [
      {
        games: [
          {
            id: '1',
            annotator: 'Kasparov, G',
            source: 'Mega',
            whiteTeam: 'Baku',
            blackTeam: 'Baku',
          },
          { id: '2', annotator: 'kasparov,  g', whiteTeam: 'Baku', blackTeam: 'Monaco' },
          { id: '3', annotator: '?', source: 'Club' },
        ],
        nextAfter: '3',
      },
      { games: [{ id: '4' }], nextAfter: null },
    ];
    const index = await readTagIndex({ tagKeys: async () => pages.shift()! });
    expect(index.games).toBe(4);
    expect(index.annotators).toEqual([{ name: 'Kasparov, G', games: 2 }]);
    expect(index.sources).toEqual([
      { name: 'Club', games: 1 },
      { name: 'Mega', games: 1 },
    ]);
    // Baku twice (once in the game where both teams are Baku), Monaco once.
    expect(index.teams).toEqual([
      { name: 'Baku', games: 2 },
      { name: 'Monaco', games: 1 },
    ]);
    expect([index.withoutAnnotator, index.withoutSource, index.withoutTeam]).toEqual([2, 2, 2]);
  });
});
