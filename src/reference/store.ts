/**
 * Where installed reference packs live.
 *
 * A pack is a manifest plus its chunks, and this stores both in IndexedDB —
 * including the pack that ships with the application. That last part is a
 * decision worth stating: the bundled starter reference *could* have been read
 * straight from `/reference/...` as static files, which would have been less
 * code. It is installed instead, for two reasons.
 *
 * The first is offline. A static asset is fetched over the network like any
 * other, so an explorer reading one is an explorer that stops working on a
 * train — which is precisely the situation the bundled source exists for.
 *
 * The second is that it leaves one code path. If the source that every fresh
 * profile uses took a private route, that route would be the one no test of
 * installation, verification, failure or removal ever exercised.
 */

import type { PersistenceDatabase } from '@/persistence/indexeddb/database';
import { getRepositories } from '@/persistence/repositories';
import { STORE_NAMES } from '@/persistence/schema/migrations';

import type { PackManifest } from './pack';
import type { ChunkSource } from './reader';
import { withPackLock } from './lock';

export type InstallState = 'installing' | 'ready' | 'failed';

export interface InstalledPack {
  readonly id: string;
  readonly manifest: PackManifest;
  readonly state: InstallState;
  readonly installedAt: number;
  /** Chunks written so far, so an interrupted install can report where it got to. */
  readonly chunksInstalled: number;
  readonly bytes: number;
  readonly error?: string;
  /** Where an explicitly installed custom pack can be resumed or updated. */
  readonly manifestUrl?: string;
}

interface ChunkRecord {
  readonly packId: string;
  readonly chunkId: string;
  readonly bytes: Uint8Array;
}

export class ReferencePackStore implements ChunkSource {
  constructor(private readonly database: PersistenceDatabase) {}

  async list(): Promise<readonly InstalledPack[]> {
    const records = await this.database.getAll<InstalledPack>(STORE_NAMES.referencePacks);
    return records.sort((a, b) => a.installedAt - b.installedAt);
  }

  get(id: string): Promise<InstalledPack | undefined> {
    return this.database.get<InstalledPack>(STORE_NAMES.referencePacks, id);
  }

  async put(pack: InstalledPack): Promise<void> {
    await this.database.put(STORE_NAMES.referencePacks, pack);
  }

  async putChunk(packId: string, chunkId: string, bytes: Uint8Array): Promise<void> {
    await this.database.put<ChunkRecord>(STORE_NAMES.referenceChunks, { packId, chunkId, bytes });
  }

  async read(manifest: PackManifest, chunk: string): Promise<Uint8Array | null> {
    const descriptor = manifest.chunks.find((entry) => entry.id === chunk);
    if (!descriptor) return null;
    // Immutable, content-addressed chunks let old and new manifests coexist.
    // The fallback reads pre-Phase-15 installations without a schema rewrite.
    const content = await this.database.get<ChunkRecord>(STORE_NAMES.referenceChunks, [
      manifest.id,
      descriptor.sha256,
    ]);
    if (content) return content.bytes;
    const record = await this.database.get<ChunkRecord>(STORE_NAMES.referenceChunks, [
      manifest.id,
      chunk,
    ]);
    return record?.bytes ?? null;
  }

  /**
   * Remove a pack and everything it owns.
   *
   * The manifest goes first and in its own transaction, so a removal that is
   * interrupted half way leaves orphaned chunks rather than a pack the catalog
   * still lists and the reader can no longer answer from. Orphans are
   * reclaimable; a pack that lies about what it holds is not.
   */
  async remove(id: string): Promise<void> {
    return withPackLock(id, () => this.removeUnlocked(id));
  }

  private async removeUnlocked(id: string): Promise<void> {
    await this.database.delete(STORE_NAMES.referencePacks, id);
    // Keys, not records: the records are the pack, and reading it in order to
    // delete it would mean holding a few hundred megabytes to free them.
    const keys = await this.database.getAllKeysFromIndex(STORE_NAMES.referenceChunks, 'packId', id);
    await this.database.transaction([STORE_NAMES.referenceChunks], 'readwrite', async (tx) => {
      for (const key of keys) await tx.delete(STORE_NAMES.referenceChunks, key);
    });
  }

  /**
   * Drop the chunks a pack no longer refers to.
   *
   * Chunks are content-addressed, which is what lets an update download and
   * verify a whole new generation while the old one stays readable — but it
   * also means the old generation is still there afterwards, and a pack
   * updated monthly would otherwise grow by its own size every month.
   *
   * Called only after the new manifest is the active one, so an interruption
   * here leaves reclaimable bytes rather than a pack missing a shard.
   */
  async pruneChunks(id: string, keep: ReadonlySet<string>): Promise<number> {
    /*
      Keys only, and this is the whole reason `getAllKeysFromIndex` exists.
      Reclaiming runs at every start-up, and reading the records would mean
      deserialising the entire installed pack — twelve megabytes for the
      bundled one, three hundred and forty for Elite — on every page load, to
      compare a list of strings.
    */
    const keys = await this.database.getAllKeysFromIndex(STORE_NAMES.referenceChunks, 'packId', id);
    const stale = keys.filter((key) => !keep.has(String((key as IDBValidKey[])[1] ?? '')));
    if (stale.length === 0) return 0;
    await this.database.transaction([STORE_NAMES.referenceChunks], 'readwrite', async (tx) => {
      for (const key of stale) await tx.delete(STORE_NAMES.referenceChunks, key);
    });
    return stale.length;
  }

  /** Chunks belonging to no listed pack, left by an interrupted removal. */
  async orphans(): Promise<readonly string[]> {
    const packs = new Set((await this.list()).map((pack) => pack.id));
    // The compound primary key is [packId, chunkId], so the pack ids are
    // readable from the keys alone — without loading every chunk of every
    // installed pack to find out which packs exist.
    const keys = await this.database.getAllKeysFromIndex(STORE_NAMES.referenceChunks, 'packId');
    const owners = new Set(keys.map((key) => String((key as IDBValidKey[])[0] ?? '')));
    return [...owners].filter((id) => !packs.has(id));
  }
}

let shared: Promise<ReferencePackStore> | null = null;

export function referencePackStore(): Promise<ReferencePackStore> {
  shared ??= getRepositories().then((repositories) => new ReferencePackStore(repositories.raw));
  return shared;
}

export function resetReferencePackStoreForTests(): void {
  shared = null;
}
