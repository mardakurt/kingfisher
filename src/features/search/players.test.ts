import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { __resetTitledRoster, loadTitledRoster } from '@/reference/titled-players';

import { searchLegends, searchPlayerRoster, __resetPlayerIndex } from './players';

describe('searchLegends', () => {
  it('finds Carlsen by full name', () => {
    const hits = searchLegends('Magnus Carlsen');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.name).toBe('Carlsen, Magnus');
  });

  it('matches by alias', () => {
    const hits = searchLegends('Bobby');
    expect(hits.some((hit) => hit.name === 'Fischer, Robert James')).toBe(true);
  });

  it('finds Tal by first name', () => {
    const hits = searchLegends('Tal');
    expect(hits.some((hit) => hit.name === 'Tal, Mikhail')).toBe(true);
  });

  it('returns an empty list for too-short queries', () => {
    expect(searchLegends('a')).toEqual([]);
  });

  it('rebuilds the index when the cache is reset', () => {
    __resetPlayerIndex();
    const hits = searchLegends('Polgar');
    expect(hits.some((hit) => hit.name.includes('Polg'))).toBe(true);
  });
});

/*
  The roster and the legends together, against the real roster file — the
  file is the claim, so the test reads it rather than a fixture. Phase 49
  found every one of these surnames answered with a titled namesake first:
  "Kasparov" was Sergey, "Tal" was Tal Shaked, "Fischer" was Daniel, and
  "Firouzja" was a WGM whose Wikidata alias spells it that way — because a
  titled row carried a prominence weight and a legend carried none.
*/
describe('searchPlayerRoster puts the person a player means first', () => {
  const rosterText = readFileSync(
    path.join(__dirname, '..', '..', '..', 'public', 'data', 'players', 'titled-players.json'),
    'utf8',
  );
  const seed = () => {
    __resetPlayerIndex();
    __resetTitledRoster();
    return loadTitledRoster(() => Promise.resolve(new Response(rosterText, { status: 200 })));
  };

  it.each([
    ['Kasparov', 'Kasparov, Garry'],
    ['Karpov', 'Karpov, Anatoly'],
    ['Fischer', 'Fischer, Robert James'],
    ['Anand', 'Anand, Viswanathan'],
    ['Tal', 'Tal, Mikhail'],
    ['Polgar', 'Polgar, Judit'],
    ['Polgár', 'Polgar, Judit'],
    ['Firouzja', 'Firouzja, Alireza'],
    ['Ding', 'Ding, Liren'],
    ['Lasker', 'Lasker, Emanuel'],
    ['Botvinnik', 'Botvinnik, Mikhail'],
    ['Nepomniachtchi', 'Nepomniachtchi, Ian'],
    ['Carlsen', 'Carlsen, Magnus'],
    ['MVL', 'Vachier-Lagrave, Maxime'],
    ['Nepo', 'Nepomniachtchi, Ian'],
  ])('%s → %s', async (query, expected) => {
    await seed();
    const hits = await searchPlayerRoster(query, 5);
    expect(hits[0]?.name).toBe(expected);
  });

  it('still finds a titled player nobody curated, with the roster as the source', async () => {
    await seed();
    const hits = await searchPlayerRoster('Keymer', 3);
    expect(hits[0]?.name).toBe('Vincent Keymer');
    expect(hits[0]?.source).toBe('titled');
  });
});
