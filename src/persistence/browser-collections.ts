/**
 * Game collections that live in this browser, beside My games.
 *
 * Until 2026-10-22 a browser held one collection. "New collection" made a
 * SQLite file through the companion, so a person on the website — the only
 * Kingfisher there is on Windows, Linux, a Chromebook or an iPad — could not
 * keep their club's games apart from their own, or a tournament apart from
 * either.
 *
 * Each collection is its own IndexedDB database with the application's own
 * schema, opened by the same code that opens the main one. That is the whole
 * design, and it is what makes the rest free: the game repository, the
 * position index, fingerprint uniqueness, search, and the collection port's
 * copy, move, merge and duplicate search all work on a collection exactly as
 * they work on My games, because it *is* the same store, under another name.
 * Nothing about My games changes, and no migration of the main database was
 * needed.
 *
 * The list of collections — id, display name, creation time — is a second,
 * very small database, `kingfisher-collections`. It is per device, like the
 * games it names: a collection's games are not synced (no imported collection
 * is), and a name arriving on a device without the games would offer an
 * empty collection that is not empty anywhere else.
 *
 * Backups carry them when they carry games (`backup.ts`).
 */

import { GAME_STORES, writeStores, type BackedUpCollection, type RestoreMode } from './backup';
import { stableId } from './ids';
import { openPersistenceDatabaseAt, type PersistenceDatabase } from './indexeddb/database';
import { fromDatabase } from './repositories';
import { DATABASE_VERSION } from './schema/migrations';
import type { AppRepositories } from './types';
import { withWriteTracking } from './write-tracker';

/** The collection id the rest of the application uses: `browser:<key>`. */
export const BROWSER_COLLECTION_PREFIX = 'browser:';

export const isBrowserCollectionId = (id: string): boolean =>
  id.startsWith(BROWSER_COLLECTION_PREFIX);

export const browserCollectionKey = (id: string): string =>
  id.slice(BROWSER_COLLECTION_PREFIX.length);

export const browserCollectionId = (key: string): string => `${BROWSER_COLLECTION_PREFIX}${key}`;

/** The IndexedDB database that holds one collection's games. */
export const browserCollectionDatabaseName = (key: string): string =>
  `kingfisher-collection-${key}`;

export const BROWSER_COLLECTION_REGISTRY = 'kingfisher-collections';
const REGISTRY_VERSION = 1;
const REGISTRY_STORE = 'collections';

export interface BrowserCollectionRecord {
  /** The key; the collection id is `browser:<key>`. */
  readonly key: string;
  readonly name: string;
  readonly createdAt: number;
}

const request = <T>(operation: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    operation.onsuccess = () => resolve(operation.result);
    operation.onerror = () => reject(operation.error ?? new Error('Local storage failed.'));
  });

let registry: Promise<IDBDatabase> | null = null;

function openRegistry(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('Local storage is unavailable in this browser context.'));
  }
  registry ??= new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open(BROWSER_COLLECTION_REGISTRY, REGISTRY_VERSION);
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(REGISTRY_STORE)) {
        open.result.createObjectStore(REGISTRY_STORE, { keyPath: 'key' });
      }
    };
    open.onsuccess = () => {
      const database = open.result;
      // A newer build upgrading the registry in another tab: step aside.
      database.onversionchange = () => {
        database.close();
        registry = null;
      };
      resolve(database);
    };
    open.onerror = () => reject(open.error ?? new Error('Could not open the collection list.'));
    open.onblocked = () =>
      reject(new Error('The collection list is being upgraded by another tab.'));
  });
  registry.catch(() => {
    registry = null;
  });
  return registry;
}

async function registryStore(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  const database = await openRegistry();
  return database.transaction(REGISTRY_STORE, mode).objectStore(REGISTRY_STORE);
}

const isRecord = (value: unknown): value is BrowserCollectionRecord =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as BrowserCollectionRecord).key === 'string' &&
  typeof (value as BrowserCollectionRecord).name === 'string' &&
  Number.isFinite((value as BrowserCollectionRecord).createdAt);

/** Every collection in this browser, by name. */
export async function listBrowserCollections(): Promise<readonly BrowserCollectionRecord[]> {
  const all = await request((await registryStore('readonly')).getAll());
  return all
    .filter(isRecord)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export async function getBrowserCollection(key: string): Promise<BrowserCollectionRecord | null> {
  const record: unknown = await request((await registryStore('readonly')).get(key));
  return isRecord(record) ? record : null;
}

const cleanName = (name: string): string => name.replace(/\s+/g, ' ').trim();

/**
 * Two collections with one name would be two rows a person cannot tell apart
 * in every list that offers them — "Copy to: Club games, Club games".
 */
async function assertNameFree(name: string, except?: string): Promise<void> {
  const taken = (await listBrowserCollections()).some(
    (entry) =>
      entry.key !== except &&
      entry.name.localeCompare(name, undefined, { sensitivity: 'base' }) === 0,
  );
  if (taken || name.localeCompare('My games', undefined, { sensitivity: 'base' }) === 0) {
    throw new Error(`There is already a collection named “${name}” in this browser.`);
  }
}

export async function createBrowserCollection(
  name: string,
  now = Date.now(),
): Promise<BrowserCollectionRecord> {
  const cleaned = cleanName(name);
  if (!cleaned) throw new Error('A collection needs a name.');
  await assertNameFree(cleaned);
  const record: BrowserCollectionRecord = {
    key: stableId('collection'),
    name: cleaned,
    createdAt: now,
  };
  // The games database first, so a listed collection always opens.
  await browserCollectionRepositories(record.key);
  await request((await registryStore('readwrite')).put(record));
  return record;
}

/**
 * A collection for an import: named as asked, or with a number after it when
 * the name is taken ("Club 2"), since an import should not fail on a name.
 */
export async function createBrowserCollectionNamed(
  name: string,
  fallback = 'Imported games',
): Promise<BrowserCollectionRecord> {
  const wanted = cleanName(name) || fallback;
  const taken = new Set(
    [...(await listBrowserCollections()).map((entry) => entry.name), 'My games'].map((entry) =>
      entry.toLocaleLowerCase(),
    ),
  );
  let candidate = wanted;
  for (let n = 2; taken.has(candidate.toLocaleLowerCase()); n += 1) candidate = `${wanted} ${n}`;
  return createBrowserCollection(candidate);
}

/**
 * A collection another device made, under the key it was made with, so its
 * games land in the same collection on every device. Its name is kept
 * unless a different collection here already has it ("Club (synced)").
 * A collection already here is returned as it is.
 */
export async function adoptBrowserCollection(
  record: BrowserCollectionRecord,
): Promise<BrowserCollectionRecord> {
  const here = await getBrowserCollection(record.key);
  if (here) return here;
  const taken = new Set(
    [...(await listBrowserCollections()).map((entry) => entry.name), 'My games'].map((entry) =>
      entry.toLocaleLowerCase(),
    ),
  );
  const wanted = cleanName(record.name) || 'Synced collection';
  let name = wanted;
  for (let n = 1; taken.has(name.toLocaleLowerCase()); n += 1) {
    name = n === 1 ? `${wanted} (synced)` : `${wanted} (synced ${n})`;
  }
  const adopted = { key: record.key, name, createdAt: record.createdAt };
  await browserCollectionRepositories(adopted.key);
  await request((await registryStore('readwrite')).put(adopted));
  return adopted;
}

export async function renameBrowserCollection(
  key: string,
  name: string,
): Promise<BrowserCollectionRecord> {
  const current = await getBrowserCollection(key);
  if (!current) throw new Error('That collection is no longer in this browser.');
  const cleaned = cleanName(name);
  if (!cleaned) throw new Error('A collection needs a name.');
  await assertNameFree(cleaned, key);
  const next = { ...current, name: cleaned };
  await request((await registryStore('readwrite')).put(next));
  return next;
}

/** Remove a collection and every game in it. */
export async function deleteBrowserCollection(key: string): Promise<void> {
  const open = opened.get(key);
  opened.delete(key);
  if (open) (await open.catch(() => null))?.close();
  // The listing goes first: a collection whose games are being deleted must
  // not be offered as a destination while that happens.
  await request((await registryStore('readwrite')).delete(key));
  await new Promise<void>((resolve, reject) => {
    const deletion = indexedDB.deleteDatabase(browserCollectionDatabaseName(key));
    deletion.onsuccess = () => resolve();
    deletion.onerror = () => reject(deletion.error ?? new Error('The games could not be removed.'));
    // Another tab still has it open. The listing is already gone, and the
    // browser finishes the deletion when that tab lets go.
    deletion.onblocked = () => resolve();
  });
}

const opened = new Map<string, Promise<AppRepositories>>();

/**
 * The repositories over one collection's database. Writes are tracked, so the
 * save barrier before an update waits for them, and are not announced to cloud
 * sync: a collection's games stay on this device.
 */
export function browserCollectionRepositories(key: string): Promise<AppRepositories> {
  let pending = opened.get(key);
  if (!pending) {
    pending = openPersistenceDatabaseAt(DATABASE_VERSION, browserCollectionDatabaseName(key)).then(
      (database: PersistenceDatabase) => fromDatabase(withWriteTracking(database)),
    );
    pending.catch(() => opened.delete(key));
    opened.set(key, pending);
  }
  return pending;
}

/** Every collection with its games, for a backup that includes games. */
export async function snapshotBrowserCollections(): Promise<readonly BackedUpCollection[]> {
  const snapshot: BackedUpCollection[] = [];
  for (const entry of await listBrowserCollections()) {
    const database = (await browserCollectionRepositories(entry.key)).raw;
    const stores = await database.transaction([...GAME_STORES], 'readonly', async (transaction) =>
      Object.fromEntries(
        await Promise.all(
          GAME_STORES.map(
            async (store) => [store, await transaction.getAll<unknown>(store)] as const,
          ),
        ),
      ),
    );
    snapshot.push({ key: entry.key, name: entry.name, createdAt: entry.createdAt, stores });
  }
  return snapshot;
}

/**
 * Put a backup's collections back.
 *
 * A collection is matched by its key, so restoring onto the browser that made
 * the backup merges into (or replaces) the same collection. One that is not
 * here is created under its name, or beside a different collection that has
 * taken the name since, as "Name (restored)". Collections the backup does not
 * mention are left alone, in either mode: a restore is never the way a
 * collection disappears.
 */
export async function restoreBrowserCollections(
  collections: readonly BackedUpCollection[],
  mode: RestoreMode,
): Promise<{ readonly collections: number; readonly games: number }> {
  let games = 0;
  for (const entry of collections) {
    let here = await getBrowserCollection(entry.key);
    if (!here) {
      const names = new Set(
        (await listBrowserCollections()).map((other) => other.name.toLocaleLowerCase()),
      );
      let name = cleanName(entry.name) || 'Restored collection';
      if (names.has(name.toLocaleLowerCase())) name = `${name} (restored)`;
      for (let n = 2; names.has(name.toLocaleLowerCase()); n += 1) {
        name = `${cleanName(entry.name)} (restored ${n})`;
      }
      here = { key: entry.key, name, createdAt: entry.createdAt };
      await browserCollectionRepositories(here.key);
      await request((await registryStore('readwrite')).put(here));
    }
    const database = (await browserCollectionRepositories(here.key)).raw;
    await writeStores(database, entry.stores, [...GAME_STORES], mode);
    games += entry.stores.games?.length ?? 0;
  }
  return { collections: collections.length, games };
}

/** For tests: forget open connections so a fresh fake IndexedDB is seen. */
export function resetBrowserCollectionsForTests(): void {
  for (const pending of opened.values()) void pending.then((repositories) => repositories.close());
  opened.clear();
  void registry?.then((database) => database.close());
  registry = null;
}
