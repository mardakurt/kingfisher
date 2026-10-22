import 'fake-indexeddb/auto';

import { afterEach, describe, expect, it } from 'vitest';

import { parsePgn } from '@/chess/pgn';
import { LocalGameCollection } from '@/database/collections/local';
import { openCollection, listCollections } from '@/database/collections/registry';

import {
  browserCollectionId,
  browserCollectionRepositories,
  createBrowserCollection,
  deleteBrowserCollection,
  listBrowserCollections,
  renameBrowserCollection,
  resetBrowserCollectionsForTests,
  restoreBrowserCollections,
  snapshotBrowserCollections,
} from './browser-collections';
import { createWorkspaceBackup, parseWorkspaceBackup } from './backup';
import { indexGame, normalizeGame } from './prepare-game';
import { getRepositories, resetRepositorySingletonForTests } from './repositories';

afterEach(async () => {
  for (const entry of await listBrowserCollections()) await deleteBrowserCollection(entry.key);
  resetBrowserCollectionsForTests();
});

async function addGame(key: string | null, white: string, black: string) {
  const parsed = parsePgn(
    `[White "${white}"]\n[Black "${black}"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 1-0`,
  ).games[0];
  if (!parsed) throw new Error('fixture did not parse');
  const repositories = key ? await browserCollectionRepositories(key) : await getRepositories();
  const game = normalizeGame(parsed.tree, 1);
  await repositories.games.persist(game, indexGame(game));
  return game;
}

describe('collections in this browser', () => {
  it('are created, listed by name, renamed and deleted', async () => {
    const club = await createBrowserCollection('  Club   games ');
    await createBrowserCollection('Anand');
    expect(club.name).toBe('Club games');
    expect((await listBrowserCollections()).map((entry) => entry.name)).toEqual([
      'Anand',
      'Club games',
    ]);

    await renameBrowserCollection(club.key, 'Club 2026');
    expect((await listBrowserCollections()).map((entry) => entry.name)).toContain('Club 2026');

    await deleteBrowserCollection(club.key);
    expect((await listBrowserCollections()).map((entry) => entry.name)).toEqual(['Anand']);
  });

  it('refuses a name another collection, or My games, already has', async () => {
    await createBrowserCollection('Club');
    await expect(createBrowserCollection('club')).rejects.toThrow(/already a collection/);
    await expect(createBrowserCollection('My Games')).rejects.toThrow(/already a collection/);
    await expect(createBrowserCollection('   ')).rejects.toThrow(/needs a name/);
  });

  it('keep their games apart from My games and from each other', async () => {
    resetRepositorySingletonForTests();
    const club = await createBrowserCollection('Club');
    const other = await createBrowserCollection('Other');
    await addGame(club.key, 'Club, A', 'Club, B');
    await addGame(null, 'Mine, A', 'Mine, B');

    expect(await (await browserCollectionRepositories(club.key)).games.count()).toBe(1);
    expect(await (await browserCollectionRepositories(other.key)).games.count()).toBe(0);
    const mine = await (await getRepositories()).games.search({ player: 'club' });
    expect(mine.total).toBe(0);
  });

  it('are collections like any other: listed, opened and copied through the port', async () => {
    resetRepositorySingletonForTests();
    const club = await createBrowserCollection('Club');
    await addGame(club.key, 'Copied, A', 'Copied, B');
    const facts = await listCollections();
    const entry = facts.find((fact) => fact.id === browserCollectionId(club.key));
    expect(entry).toMatchObject({ kind: 'indexeddb', name: 'Club', games: 1 });

    const source = await openCollection(browserCollectionId(club.key));
    const destination = await openCollection('local');
    expect(source).toBeInstanceOf(LocalGameCollection);
    expect(source?.ref.name).toBe('Club');
    const page = await source!.read(null, null, 10);
    const outcome = await destination!.write(page.games);
    expect(outcome.written).toBe(1);
    // Copying again is a duplicate, as it is between any two collections.
    expect((await destination!.write(page.games)).duplicates).toBe(1);
  });

  it('go into a backup with their games, and come back from one', async () => {
    const club = await createBrowserCollection('Club');
    const game = await addGame(club.key, 'Backed, A', 'Backed, B');
    const snapshot = await snapshotBrowserCollections();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]).toMatchObject({ key: club.key, name: 'Club' });

    await deleteBrowserCollection(club.key);
    expect(await listBrowserCollections()).toEqual([]);

    const restored = await restoreBrowserCollections(snapshot, 'merge');
    expect(restored).toEqual({ collections: 1, games: 1 });
    const back = await browserCollectionRepositories(club.key);
    expect((await back.games.get(game.id))?.white).toBe('Backed, A');
    expect((await listBrowserCollections()).map((entry) => entry.name)).toEqual(['Club']);
  });

  it('restore beside a different collection that took the name meanwhile', async () => {
    const club = await createBrowserCollection('Club');
    await addGame(club.key, 'Old, A', 'Old, B');
    const snapshot = await snapshotBrowserCollections();
    await deleteBrowserCollection(club.key);
    await createBrowserCollection('Club');

    await restoreBrowserCollections(snapshot, 'merge');
    expect((await listBrowserCollections()).map((entry) => entry.name)).toEqual([
      'Club',
      'Club (restored)',
    ]);
  });

  it('travel in a backup file only beside the games, and are checked like them', async () => {
    resetRepositorySingletonForTests();
    const club = await createBrowserCollection('Club');
    await addGame(club.key, 'File, A', 'File, B');
    const collections = await snapshotBrowserCollections();
    const database = (await getRepositories()).raw;

    const withGames = await createWorkspaceBackup(
      database,
      {},
      { includeGames: true, collections },
    );
    const parsed = parseWorkspaceBackup(JSON.parse(JSON.stringify(withGames)));
    expect(parsed.collections?.[0]?.stores.games).toHaveLength(1);

    // Without games a backup carries none, even when handed some.
    const without = await createWorkspaceBackup(database, {}, { collections });
    expect(without.collections).toBeUndefined();

    // A file claiming no games but carrying a collection is refused, as a
    // file smuggling My games' stores is.
    expect(() => parseWorkspaceBackup({ ...without, collections })).toThrow(/not marked/);
    // And a collection's games are validated record by record.
    const broken = structuredClone(withGames) as unknown as {
      collections: { stores: { games: unknown[] } }[];
    };
    broken.collections[0]!.stores.games[0] = { id: 'nonsense' };
    expect(() => parseWorkspaceBackup(broken)).toThrow(/Backup rejected/);
  });
});
