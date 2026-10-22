/**
 * Two devices, one account, one real Postgres.
 *
 * Each "device" is a memory IndexedDB with the real repositories on it and
 * its own sync state; the cloud is the real migration running in PGlite
 * under RLS (`PgliteRemote`). Only the transport is replaced — the engine,
 * the validators, the SQL and the policies are the production ones.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { positionKey as positionKeyOf, START_FEN } from '@/chess/fen';
import { playSanAt } from '@/chess/game';
import { expect as unwrap } from '@/chess/result';
import { createTree } from '@/chess/tree/tree';
import { createMemoryRepositories } from '@/persistence/repositories';
import { MemorySyncStateStore } from '@/persistence/sync-state';
import { STORE_NAMES } from '@/persistence/schema/migrations';
import type { AppRepositories } from '@/persistence/types';
import { lineToEntries } from '@/repertoire';

import { importGames } from '@/persistence/import-game';

import { gamesSource, MY_GAMES_STORE } from './games-source';
import type { BrowserCollectionRecord } from '@/persistence/browser-collections';
import {
  collectionGamesSource,
  collectionsSource,
  COLLECTION_GAMES_STORE,
  type CollectionStore,
} from './collections-source';
import { databaseSource, type LocalSource } from './local-sources';
import { SYNCED_STORES } from './scope';
import { CloudSyncEngine } from './sync-engine';
import { PgliteRemote } from './test-support/pglite-remote';
import { startSupabaseHarness, type SupabaseHarness } from './test-support/pglite-supabase';

let harness: SupabaseHarness;
let userCounter = 0;

beforeAll(async () => {
  harness = await startSupabaseHarness();
}, 60_000);

afterAll(async () => {
  await harness?.close();
});

interface Device {
  readonly repositories: AppRepositories;
  readonly engine: CloudSyncEngine;
  readonly remote: PgliteRemote;
  readonly state: MemorySyncStateStore;
  readonly applied: { store: string; key: string }[];
}

function device(
  userId: string,
  name: string,
  shared?: { repositories: AppRepositories; state: MemorySyncStateStore },
  options: { readonly games?: boolean; readonly collections?: MemoryCollections } = {},
): Device {
  const repositories = shared?.repositories ?? createMemoryRepositories();
  const state = shared?.state ?? new MemorySyncStateStore();
  const remote = new PgliteRemote(harness, userId);
  const applied: { store: string; key: string }[] = [];
  const sources: LocalSource[] = [
    ...SYNCED_STORES.map((store) => databaseSource(repositories.raw, store)),
    ...(options.games ? [gamesSource(repositories.raw)] : []),
    ...(options.collections
      ? [collectionsSource(options.collections), collectionGamesSource(options.collections)]
      : []),
  ];
  const engine = new CloudSyncEngine({
    userId,
    deviceId: name,
    remote,
    state,
    sources,
    onApplied: (changes) => applied.push(...changes),
  });
  return { repositories, engine, remote, state, applied };
}

async function newUser(): Promise<string> {
  userCounter += 1;
  const id = `00000000-0000-4000-8000-${String(userCounter).padStart(12, '0')}`;
  await harness.createUser(id);
  return id;
}

let user: string;

beforeEach(async () => {
  user = await newUser();
});

describe('a study made on one device', () => {
  it('appears on the other after both sync', async () => {
    const mac = device(user, 'mac');
    const pc = device(user, 'pc');
    await mac.engine.decideImport('imported');
    const study = await mac.repositories.studies.create({ title: 'Najdorf, 6.Bg5' });

    expect(await mac.engine.sync()).toMatchObject({ status: 'synced', pushed: 1 });
    expect(await pc.engine.sync()).toMatchObject({ status: 'synced', pulled: 1, conflicts: 0 });

    const arrived = await pc.repositories.studies.list();
    expect(arrived.map((item) => [item.id, item.title])).toEqual([[study.id, 'Najdorf, 6.Bg5']]);
    expect(pc.applied).toContainEqual({ store: STORE_NAMES.studies, key: study.id });
  });

  it('carries an edit and a delete across', async () => {
    const mac = device(user, 'mac');
    const pc = device(user, 'pc');
    await mac.engine.decideImport('imported');
    const study = await mac.repositories.studies.create({ title: 'Draft' });
    await mac.engine.sync();
    await pc.engine.sync();

    await pc.repositories.studies.update(study.id, { title: 'Final' });
    await pc.engine.sync();
    await mac.engine.sync();
    expect((await mac.repositories.studies.list()).map((item) => item.title)).toEqual(['Final']);

    await mac.repositories.studies.delete(study.id);
    await mac.engine.sync();
    await pc.engine.sync();
    expect(await pc.repositories.studies.list()).toEqual([]);
  });

  it('uploads nothing when nothing changed', async () => {
    const mac = device(user, 'mac');
    await mac.engine.decideImport('imported');
    await mac.repositories.studies.create({ title: 'Once' });
    await mac.engine.sync();
    const second = await mac.engine.sync();
    expect(second).toMatchObject({ status: 'synced', pushed: 0, pulled: 0 });
    expect(await mac.engine.pending()).toBe(0);
  });
});

describe('the first sign-in on a device that already has work', () => {
  it('asks before uploading anything', async () => {
    const mac = device(user, 'mac');
    await mac.repositories.studies.create({ title: 'Made before the account' });
    await mac.repositories.repertoires.create({ title: 'White', color: 'w' });

    const result = await mac.engine.sync();
    expect(result).toEqual({
      status: 'awaiting-import',
      summary: { total: 2, byStore: { studies: 1, repertoires: 1 } },
    });
    expect(mac.remote.calls).toBe(0);
  });

  it('uploads it when the person says so, and only once however often it is retried', async () => {
    const mac = device(user, 'mac');
    await mac.repositories.studies.create({ title: 'Mine' });
    await mac.engine.decideImport('imported');
    await mac.engine.sync();
    // Losing the sync state (a cleared site, a crash) must not duplicate anything.
    await mac.state.clearUser(user);
    await mac.engine.decideImport('imported');
    const again = await mac.engine.sync();
    expect(again).toMatchObject({ status: 'synced', pushed: 0, conflicts: 0 });

    const rows = await harness.db.query(
      `select 1 from public.user_records where user_id = $1 and store = 'studies'`,
      [user],
    );
    expect(rows.rows).toHaveLength(1);
  });

  it('keeps it on this device only when the person declines, while still receiving the account’s work', async () => {
    const pc = device(user, 'pc');
    await pc.engine.decideImport('imported');
    const fromAccount = await pc.repositories.studies.create({ title: 'From the account' });
    await pc.engine.sync();

    const mac = device(user, 'mac');
    const local = await mac.repositories.studies.create({ title: 'Private' });
    await mac.engine.decideImport('declined');
    await mac.repositories.studies.update(local.id, { title: 'Private, edited' });
    await mac.engine.sync();

    const titles = (await mac.repositories.studies.list()).map((item) => item.title).sort();
    expect(titles).toEqual(['From the account', 'Private, edited']);
    const cloud = await harness.db.query<{ record_key: string }>(
      `select record_key from public.user_records where user_id = $1 and store = 'studies'`,
      [user],
    );
    expect(cloud.rows.map((row) => row.record_key)).toEqual([fromAccount.id]);
  });

  it('never offers another account’s synced work for upload into this one', async () => {
    const shared = { repositories: createMemoryRepositories(), state: new MemorySyncStateStore() };
    const first = device(user, 'family-mac', shared);
    await first.engine.decideImport('imported');
    await first.repositories.studies.create({ title: 'Belongs to the first account' });
    await first.engine.sync();

    const otherUser = await newUser();
    const second = device(otherUser, 'family-mac', shared);
    expect(await second.engine.importCandidates()).toEqual({ total: 0, byStore: {} });
    expect(await second.engine.sync()).toMatchObject({ status: 'synced', pushed: 0 });
    const leaked = await harness.db.query(`select 1 from public.user_records where user_id = $1`, [
      otherUser,
    ]);
    expect(leaked.rows).toHaveLength(0);
  });
});

describe('conflicts', () => {
  it('lets the server’s version win and keeps this device’s for review', async () => {
    const mac = device(user, 'mac');
    const pc = device(user, 'pc');
    await mac.engine.decideImport('imported');
    const study = await mac.repositories.studies.create({ title: 'Base' });
    await mac.engine.sync();
    await pc.engine.sync();

    await mac.repositories.studies.update(study.id, { title: 'Mac edit' });
    await pc.repositories.studies.update(study.id, { title: 'PC edit' });
    await mac.engine.sync();
    const result = await pc.engine.sync();

    expect(result).toMatchObject({ status: 'synced', conflicts: 1 });
    expect((await pc.repositories.studies.list()).map((item) => item.title)).toEqual(['Mac edit']);
    const [conflict] = await pc.engine.conflicts();
    expect((conflict!.localValue as { title: string }).title).toBe('PC edit');
    expect((conflict!.remoteValue as { title: string }).title).toBe('Mac edit');
    expect(conflict!.remoteDevice).toBe('mac');

    // Restoring makes the kept version an ordinary edit on top of the server's.
    await pc.engine.restoreConflict(conflict!.id);
    expect(await pc.engine.conflicts()).toEqual([]);
    await pc.engine.sync();
    await mac.engine.sync();
    expect((await mac.repositories.studies.list()).map((item) => item.title)).toEqual(['PC edit']);
  });

  it('keeps a repertoire position that two devices created independently', async () => {
    const mac = device(user, 'mac');
    const pc = device(user, 'pc');
    await mac.engine.decideImport('imported');
    const repertoire = await mac.repositories.repertoires.create({ title: 'White', color: 'w' });
    await mac.engine.sync();
    await pc.engine.sync();

    const tree = unwrap(playSanAt(createTree(START_FEN), createTree(START_FEN).rootId, 'e4'));
    const [entry] = lineToEntries(tree.tree, tree.nodeId, 'w');
    for (const side of [mac, pc]) {
      await side.repositories.repertoires.upsertPosition({
        repertoireId: repertoire.id,
        fen: entry!.fen,
        sideToMove: entry!.sideToMove,
        depth: entry!.depth,
        moves: [entry!.move],
      });
    }
    await mac.engine.sync();
    const result = await pc.engine.sync();

    expect(result).toMatchObject({ status: 'synced' });
    expect(result.status === 'synced' && result.conflicts).toBeGreaterThan(0);
    const positions = await pc.repositories.raw.getAll<{ id: string }>(
      STORE_NAMES.repertoirePositions,
    );
    const macPositions = await mac.repositories.raw.getAll<{ id: string }>(
      STORE_NAMES.repertoirePositions,
    );
    expect(positions.map((p) => p.id)).toEqual(macPositions.map((p) => p.id));
    expect(
      (await pc.engine.conflicts()).some((c) => c.store === STORE_NAMES.repertoirePositions),
    ).toBe(true);
  });
});

describe('failure', () => {
  it('loses nothing when the network fails mid-sync, and finishes on the next run', async () => {
    const mac = device(user, 'mac');
    const pc = device(user, 'pc');
    await mac.engine.decideImport('imported');
    await mac.repositories.studies.create({ title: 'Written offline' });
    mac.remote.failNext = new Error('Failed to fetch');
    await expect(mac.engine.sync()).rejects.toThrow('Failed to fetch');
    expect(await mac.engine.pending()).toBe(1);

    await mac.engine.sync();
    await pc.engine.sync();
    expect((await pc.repositories.studies.list()).map((item) => item.title)).toEqual([
      'Written offline',
    ]);
  });

  it('refuses to write a malformed record from the cloud into local storage', async () => {
    const pc = device(user, 'pc');
    await harness.as({ role: 'authenticated', sub: user }, (tx) =>
      tx.query(`select public.push_user_records($1::jsonb)`, [
        JSON.stringify([
          {
            store: 'studies',
            key: 'evil',
            value: { id: 'evil', title: 42 },
            hash: 'a'.repeat(64),
            base: 0,
          },
        ]),
      ]),
    );
    const result = await pc.engine.sync();
    expect(result).toMatchObject({ status: 'synced', skipped: 1, pulled: 0 });
    expect(await pc.repositories.studies.list()).toEqual([]);
  });

  it('finds a row the incremental cursor skipped, on reconcile', async () => {
    const mac = device(user, 'mac');
    const pc = device(user, 'pc');
    await mac.engine.decideImport('imported');
    await pc.engine.sync();
    const study = await mac.repositories.studies.create({ title: 'Late commit' });
    await mac.engine.sync();
    // Simulate the race: the device's cursor already past the row's sequence.
    const meta = (await pc.state.meta(user))!;
    await pc.state.putMeta({ ...meta, cursor: meta.cursor + 1_000_000 });
    await pc.engine.sync();
    expect(await pc.repositories.studies.list()).toEqual([]);
    await pc.engine.sync({ reconcile: true });
    expect((await pc.repositories.studies.list()).map((item) => item.id)).toEqual([study.id]);
  });
});

describe('signing out', () => {
  it('removes only what the account already holds', async () => {
    const mac = device(user, 'mac');
    await mac.engine.decideImport('imported');
    await mac.repositories.studies.create({ title: 'Synced' });
    await mac.engine.sync();
    await mac.repositories.studies.create({ title: 'Not yet uploaded' });

    const result = await mac.engine.removeSyncedCopies();
    expect(result).toEqual({ removed: 1, kept: 0 });
    expect((await mac.repositories.studies.list()).map((item) => item.title)).toEqual([
      'Not yet uploaded',
    ]);
    expect(await mac.state.records(user)).toEqual([]);
  });
});

describe('scope', () => {
  it('syncs every portable store except the device-only ones', async () => {
    const { PORTABLE_STORES } = await import('@/persistence/backup');
    const { DEVICE_ONLY_STORES } = await import('./scope');
    for (const store of PORTABLE_STORES) {
      expect(SYNCED_STORES.includes(store) !== store in DEVICE_ONLY_STORES).toBe(true);
    }
  });
});

describe('My games, switched on', () => {
  const PGN = `[White "Alpha, A"]
[Black "Beta, B"]
[Result "1-0"]

1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 1-0`;

  it('carries a game to the other device, indexed by position there', async () => {
    const mac = device(user, 'mac', undefined, { games: true });
    const pc = device(user, 'pc', undefined, { games: true });
    await mac.engine.decideImport('imported');
    await importGames(PGN, mac.repositories.games);
    const [sent] = (await mac.repositories.games.search({})).games;

    await mac.engine.sync();
    expect(await pc.engine.sync()).toMatchObject({ status: 'synced', conflicts: 0 });

    const arrived = await pc.repositories.games.get(sent!.id);
    expect(arrived?.white).toBe('Alpha, A');
    // Indexed as an import would index it: the explorer of My games finds it
    // at the position before 5...a6 (a position is indexed with its next move).
    const najdorf = 'rnbqkb1r/pp2pppp/3p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R b KQkq - 1 5';
    expect(await pc.repositories.games.countAtPosition(positionKeyOf(najdorf))).toBe(1);
    expect(pc.applied).toContainEqual({ store: MY_GAMES_STORE, key: sent!.id });
    // Stored exactly as sent: nothing to send back on the next run.
    expect(await pc.engine.pending()).toBe(0);
  });

  it('never deletes a game elsewhere: removing it here removes it here', async () => {
    const mac = device(user, 'mac', undefined, { games: true });
    const pc = device(user, 'pc', undefined, { games: true });
    await mac.engine.decideImport('imported');
    await importGames(PGN, mac.repositories.games);
    const [game] = (await mac.repositories.games.search({})).games;
    await mac.engine.sync();
    await pc.engine.sync();

    await mac.repositories.games.delete(game!.id);
    expect(await mac.engine.sync()).toMatchObject({ pushed: 0 });
    await pc.engine.sync();
    expect(await pc.repositories.games.get(game!.id)).not.toBeNull();
  });

  it('is nothing at all to a device that has not switched it on', async () => {
    const mac = device(user, 'mac', undefined, { games: true });
    const pc = device(user, 'pc');
    await mac.engine.decideImport('imported');
    await importGames(PGN, mac.repositories.games);
    await mac.engine.sync();
    await pc.engine.sync();
    expect(await pc.repositories.games.count()).toBe(0);

    // And a game imported on that device does not leave it.
    await importGames(PGN.replace('1-0', '0-1').replace('1-0', '0-1'), pc.repositories.games);
    expect(await pc.engine.pending()).toBe(0);
  });

  it('leaves games on the device when signing out removes synced copies, and does not count them', async () => {
    const mac = device(user, 'mac', undefined, { games: true });
    await mac.engine.decideImport('imported');
    await importGames(PGN, mac.repositories.games);
    await mac.engine.sync();
    expect(await mac.engine.removeSyncedCopies()).toEqual({ removed: 0, kept: 0 });
    expect(await mac.repositories.games.count()).toBe(1);
  });
});

/** One device's collections, in memory: the browser's are global to a test process. */
class MemoryCollections implements CollectionStore {
  readonly records = new Map<string, BrowserCollectionRecord>();
  private readonly repositories = new Map<string, AppRepositories>();
  async list() {
    return [...this.records.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
  async get(key: string) {
    return this.records.get(key) ?? null;
  }
  async adopt(record: BrowserCollectionRecord) {
    const here = this.records.get(record.key);
    if (here) return here;
    const taken = [...this.records.values()].some((entry) => entry.name === record.name);
    const adopted = { ...record, name: taken ? `${record.name} (synced)` : record.name };
    this.records.set(record.key, adopted);
    return adopted;
  }
  async rename(key: string, name: string) {
    const here = this.records.get(key);
    if (here) this.records.set(key, { ...here, name });
  }
  async games(key: string) {
    let repositories = this.repositories.get(key);
    if (!repositories) {
      repositories = createMemoryRepositories();
      this.repositories.set(key, repositories);
    }
    return repositories.games;
  }
  create(key: string, name: string) {
    this.records.set(key, { key, name, createdAt: 1 });
  }
}

describe('collections kept in the browser, switched on with My games', () => {
  const PGN = `[White "Club, A"]
[Black "Club, B"]
[Result "1-0"]

1. d4 d5 2. c4 e6 3. Nc3 Nf6 1-0`;

  it('carry the collection, its name and its games to the other device', async () => {
    const macCollections = new MemoryCollections();
    const pcCollections = new MemoryCollections();
    const mac = device(user, 'mac', undefined, { games: true, collections: macCollections });
    const pc = device(user, 'pc', undefined, { games: true, collections: pcCollections });
    await mac.engine.decideImport('imported');
    macCollections.create('collection-club', 'Club');
    await importGames(PGN, await macCollections.games('collection-club'));
    const [sent] = (await (await macCollections.games('collection-club')).search({})).games;

    await mac.engine.sync();
    expect(await pc.engine.sync()).toMatchObject({ status: 'synced', conflicts: 0 });

    expect(await pcCollections.get('collection-club')).toMatchObject({ name: 'Club' });
    const arrived = await (await pcCollections.games('collection-club')).get(sent!.id);
    expect(arrived?.white).toBe('Club, A');
    // Not into My games: a collection's game stays in its collection.
    expect(await pc.repositories.games.count()).toBe(0);
    expect(pc.applied).toContainEqual({
      store: COLLECTION_GAMES_STORE,
      key: `collection-club/${sent!.id}`,
    });
    expect(await pc.engine.pending()).toBe(0);
  });

  it('carry a rename, and never a deletion', async () => {
    const macCollections = new MemoryCollections();
    const pcCollections = new MemoryCollections();
    const mac = device(user, 'mac', undefined, { games: true, collections: macCollections });
    const pc = device(user, 'pc', undefined, { games: true, collections: pcCollections });
    await mac.engine.decideImport('imported');
    macCollections.create('collection-club', 'Club');
    await importGames(PGN, await macCollections.games('collection-club'));
    await mac.engine.sync();
    await pc.engine.sync();

    await macCollections.rename('collection-club', 'Club 2026');
    await mac.engine.sync();
    await pc.engine.sync();
    expect((await pcCollections.get('collection-club'))?.name).toBe('Club 2026');

    // Deleted on the Mac: still on the PC.
    macCollections.records.delete('collection-club');
    expect(await mac.engine.sync()).toMatchObject({ pushed: 0 });
    await pc.engine.sync();
    expect(await pcCollections.get('collection-club')).not.toBeNull();
    expect(await (await pcCollections.games('collection-club')).count()).toBe(1);
  });

  it('open a collection for a game that arrives before its name', async () => {
    const collections = new MemoryCollections();
    const source = collectionGamesSource(collections);
    // A game as another device stored it: its id and its exact PGN.
    const scratch = new MemoryCollections();
    await importGames(PGN, await scratch.games('x'));
    const [game] = await (
      await scratch.games('x')
    ).getMany((await (await scratch.games('x')).search({})).games.map((entry) => entry.id));
    await source.put(`collection-new/${game!.id}`, {
      collection: 'collection-new',
      id: game!.id,
      pgn: game!.normalizedPgn,
    });
    expect(await collections.get('collection-new')).toMatchObject({ name: 'Synced collection' });
    await collectionsSource(collections).put('collection-new', {
      key: 'collection-new',
      name: 'Arrived later',
      createdAt: 5,
    });
    expect((await collections.get('collection-new'))?.name).toBe('Arrived later');
    expect(await (await collections.games('collection-new')).count()).toBe(1);
  });

  it('are nothing to a device that has not switched it on', async () => {
    const macCollections = new MemoryCollections();
    const mac = device(user, 'mac', undefined, { games: true, collections: macCollections });
    const pc = device(user, 'pc');
    await mac.engine.decideImport('imported');
    macCollections.create('collection-club', 'Club');
    await importGames(PGN, await macCollections.games('collection-club'));
    await mac.engine.sync();
    expect(await pc.engine.sync()).toMatchObject({ status: 'synced' });
    expect(await pc.repositories.games.count()).toBe(0);
  });
});
