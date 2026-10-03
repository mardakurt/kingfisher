import { describe, expect, it } from 'vitest';

import type { PackGame } from '@/reference/pack';

import {
  referenceCoverage,
  referenceMatches,
  searchReference,
  type ReferenceLibraryReader,
} from './reference-library';

const game = (
  id: string,
  white: string,
  black: string,
  result: string,
  date: string,
  extra: Partial<PackGame> = {},
): PackGame => ({
  id,
  white,
  black,
  result,
  year: Number(date.slice(0, 4)),
  date,
  event: 'Test',
  eco: 'C42',
  opening: 'Petrov',
  whiteElo: 2800,
  blackElo: 2750,
  url: '',
  moves: 'e4 e5',
  ...extra,
});

const GAMES = [
  game('g1', 'Carlsen, Magnus', 'Nakamura, Hikaru', '1-0', '2024.01.02'),
  game('g2', 'Nakamura, Hikaru', 'Carlsen, Magnus', '1/2-1/2', '2025.03.04'),
  game('g3', 'Carlsen, Magnus', 'Caruana, Fabiano', '0-1', '2023.05.06', { event: 'Blitz' }),
  game('g4', 'Carlsen, Henrik', 'Caruana, Fabiano', '1-0', '2022.01.01'),
  // The same Magnus, as one broadcast spelled him; the pack files both under one identity.
  game('g5', 'Magnus Carlsen', 'Nakamura, Hikaru', '0-1', '2021.07.08'),
];

/** Spellings a pack merged, as the archive's FIDE identifiers said. */
const IDENTITY: Record<string, string> = { 'magnus carlsen': 'carlsen, magnus' };

/**
 * A reader that files games as a pack does: by the lower-cased spelling,
 * every spelling of one identity answering with that identity's whole list.
 */
function reader(): ReferenceLibraryReader & { asked: string[] } {
  const identityOf = (key: string) => IDENTITY[key] ?? key;
  const byIdentity = new Map<string, string[]>();
  const spellings = new Map<string, string>();
  for (const g of GAMES) {
    for (const name of [g.white, g.black]) {
      const key = name.toLowerCase();
      const id = identityOf(key);
      spellings.set(key, name);
      byIdentity.set(id, [...(byIdentity.get(id) ?? []), g.id]);
    }
  }
  const asked: string[] = [];
  return {
    asked,
    playerGames: async (key) => {
      asked.push(key);
      return spellings.has(key) ? (byIdentity.get(identityOf(key)) ?? []) : [];
    },
    games: async (ids) => GAMES.filter((g) => ids.includes(g.id)),
    allPlayers: async () =>
      [...spellings].map(([key, name]) => ({
        key,
        id: identityOf(key),
        name,
        games: byIdentity.get(identityOf(key))!.length,
      })),
  };
}

describe('a reference pack in the Library', () => {
  it('lists a player’s games, newest first, with every other filter applied', async () => {
    const found = await referenceMatches(reader(), { player: 'Carlsen, Magnus' });
    expect(found.map((g) => g.id)).toEqual(['g2', 'g1', 'g3', 'g5']);
    const vsNakamura = await referenceMatches(reader(), {
      player: 'carlsen,  MAGNUS',
      opponent: 'Nakamura, Hikaru',
      playerColor: 'w',
    });
    expect(vsNakamura.map((g) => g.id)).toEqual(['g1', 'g5']);
    const lost = await referenceMatches(reader(), { player: 'Carlsen, Magnus', result: '0-1' });
    expect(lost.map((g) => g.id)).toEqual(['g3', 'g5']);
  });

  it('finds a pack that wrote the name the other way round', async () => {
    const found = await referenceMatches(reader(), { player: 'Magnus Carlsen' });
    expect(found).toHaveLength(4);
  });

  it('keeps a game filed under another spelling of the same player', async () => {
    // "Magnus Carlsen" lost g5 as Black's opponent of Nakamura: both spellings are him.
    const met = await referenceMatches(reader(), {
      player: 'Magnus Carlsen',
      opponent: 'Nakamura, Hikaru',
    });
    expect(met.map((g) => g.id)).toEqual(['g2', 'g1', 'g5']);
  });

  it('reads the search box as part of a name: every Carlsen, not only Magnus', async () => {
    const found = await referenceMatches(reader(), { text: 'carlsen' });
    expect(found.map((g) => g.id).sort()).toEqual(['g1', 'g2', 'g3', 'g4', 'g5']);
  });

  it('lists nothing, and reads nothing, when no one is named', async () => {
    const r = reader();
    expect(await referenceMatches(r, { result: '1-0' })).toEqual([]);
    expect(r.asked).toEqual([]);
  });

  it('pages an exactly counted result', async () => {
    const page = await searchReference(reader(), {
      player: 'Carlsen, Magnus',
      limit: 2,
      offset: 2,
    });
    expect(page).toMatchObject({ total: 4, hasMore: false });
    expect(page.games.map((g) => g.id)).toEqual(['g3', 'g5']);
  });
});

describe('what a pack lists of a player', () => {
  it('says when a player has more games than the pack lists', async () => {
    const r = reader();
    const capped: ReferenceLibraryReader = {
      ...r,
      allPlayers: async () =>
        (await r.allPlayers()).map((p) => (p.key === 'carlsen, magnus' ? { ...p, games: 705 } : p)),
    };
    expect(await referenceCoverage(capped, { player: 'Magnus Carlsen' })).toEqual([
      { name: 'Carlsen, Magnus', listed: 4, played: 705 },
    ]);
    expect(await referenceCoverage(capped, { player: 'Nakamura, Hikaru' })).toEqual([]);
  });
});
