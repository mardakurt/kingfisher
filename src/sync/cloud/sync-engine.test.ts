/**
 * Two devices, one account, one real Postgres.
 *
 * Each "device" is a memory IndexedDB with the real repositories on it and
 * its own sync state; the cloud is the real migration running in PGlite
 * under RLS (`PgliteRemote`). Only the transport is replaced — the engine,
 * the validators, the SQL and the policies are the production ones.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { START_FEN } from '@/chess/fen';
import { playSanAt } from '@/chess/game';
import { expect as unwrap } from '@/chess/result';
import { createTree } from '@/chess/tree/tree';
import { createMemoryRepositories } from '@/persistence/repositories';
import { MemorySyncStateStore } from '@/persistence/sync-state';
import { STORE_NAMES } from '@/persistence/schema/migrations';
import type { AppRepositories } from '@/persistence/types';
import { lineToEntries } from '@/repertoire';

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
): Device {
  const repositories = shared?.repositories ?? createMemoryRepositories();
  const state = shared?.state ?? new MemorySyncStateStore();
  const remote = new PgliteRemote(harness, userId);
  const applied: { store: string; key: string }[] = [];
  const sources: LocalSource[] = SYNCED_STORES.map((store) =>
    databaseSource(repositories.raw, store),
  );
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
