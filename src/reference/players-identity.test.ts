import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PackPlayer } from './pack';
import type { TitledPlayer } from './titled-players';

/**
 * One person, one row.
 *
 * The library showed "Erdogmus, Yagiz Kaan" as an IM with games beside
 * "Yağız Kaan Erdoğmuş" as a GM with none, and "Carlsen, Magnus" beside
 * "Magnus Carlsen" with the games split between them. Three separate causes,
 * each pinned here: a letter that Unicode decomposition does not fold, a
 * roster alias tried in only one word order, and two packs filing one
 * person under two spellings.
 */

const fakeReaders: { manifest: { id: string; name: string }; players: PackPlayer[] }[] = [];

vi.mock('./manager', () => ({
  readyPackReaders: () =>
    fakeReaders.map((reader) => ({
      manifest: reader.manifest,
      allPlayers: () => Promise.resolve(reader.players),
    })),
}));

const { collect, foldName, matchKey } = await import('./players');

const packPlayer = (name: string, over: Partial<PackPlayer> = {}): PackPlayer => ({
  key: name.toLowerCase(),
  id: name.toLowerCase(),
  name,
  fideId: '',
  title: '',
  games: 1,
  firstYear: 2021,
  lastYear: 2025,
  peakRating: 2500,
  lastRating: 2500,
  ...over,
});

const titled = (name: string, over: Partial<TitledPlayer> = {}): TitledPlayer => ({
  wikidata: `Q-${name}`,
  name,
  aliases: [],
  title: 'GM',
  fideId: '',
  born: 0,
  female: false,
  citizenship: '',
  peakElo: 0,
  ...over,
});

beforeEach(() => {
  fakeReaders.length = 0;
});

describe('folding letters that decomposition leaves alone', () => {
  it('treats the Turkish dotless ı, ł, ø, ð and ß as their plain letters', () => {
    expect(foldName('Yağız Kaan Erdoğmuş')).toBe('yagiz kaan erdogmus');
    expect(foldName('Łukasz')).toBe('lukasz');
    expect(foldName('Jørgen')).toBe('jorgen');
    expect(foldName('Guðmundur')).toBe('gudmundur');
    expect(foldName('Straße')).toBe('strasse');
  });

  it('gives both orders of a Turkish name the same match key', () => {
    expect(matchKey('Yağız Kaan Erdoğmuş')).toBe(matchKey('Yagiz Kaan Erdogmus'));
  });
});

describe('one person across the packs and the roster', () => {
  it('attaches a roster row to the pack row through an alias in the other order', async () => {
    fakeReaders.push({
      manifest: { id: 'starter', name: 'Starter' },
      players: [packPlayer('Erdogmus, Yagiz Kaan', { title: 'IM', games: 40 })],
    });
    const players = await collect(() =>
      Promise.resolve([
        titled('Yağız Kaan Erdoğmuş', { aliases: ['Kaan Erdoğmuş', 'Yagiz Kaan Erdogmus'] }),
      ]),
    );
    const rows = players.filter((entry) => /erdo/i.test(entry.name));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.games).toBe(40);
    // The roster's title is the current one; the pack's is the title at the time of the games.
    expect(rows[0]?.title).toBe('GM');
    expect(rows[0]?.titled?.name).toBe('Yağız Kaan Erdoğmuş');
  });

  it('merges two packs that file one person under two spellings', async () => {
    fakeReaders.push(
      {
        manifest: { id: 'a', name: 'Pack A' },
        players: [packPlayer('Carlsen, Magnus', { games: 452, title: 'GM' })],
      },
      {
        manifest: { id: 'b', name: 'Pack B' },
        players: [packPlayer('Magnus Carlsen', { games: 36 })],
      },
    );
    const players = await collect(() => Promise.resolve([]));
    const rows = players.filter((entry) => /carlsen/i.test(entry.name));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('Carlsen, Magnus');
    expect(rows[0]?.sources).toEqual(['Pack A', 'Pack B']);
    expect(rows[0]?.games).toBe(452);
  });

  it('keeps two different people with different names apart', async () => {
    fakeReaders.push({
      manifest: { id: 'a', name: 'Pack A' },
      players: [packPlayer('Carlsen, Magnus', { games: 10 }), packPlayer('Carlsen, Henrik')],
    });
    const players = await collect(() => Promise.resolve([]));
    expect(players.filter((entry) => /carlsen/i.test(entry.name))).toHaveLength(2);
  });
});
