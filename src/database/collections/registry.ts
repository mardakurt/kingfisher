/**
 * Which collections this machine actually has, right now.
 *
 * Built on demand rather than held as state, because the answer changes without
 * Kingfisher being told: a companion starts or stops, a SQLite file is created
 * or deleted, and a list cached at startup would offer the user a collection
 * that is not there. The cost of asking is one companion status call.
 */

import { companionClient } from '@/companion/session';
import { getRepositories } from '@/persistence/repositories';

import { LOCAL_COLLECTION_ID, LocalGameCollection } from './local';
import { SqliteGameCollection, sqliteCollectionId } from './sqlite';
import type { CollectionFacts, GameCollection } from './types';

/**
 * Every collection, and what it can say about itself.
 *
 * A companion that is not reachable contributes nothing rather than an error:
 * the browser's own collection is always available, and a database manager that
 * refuses to open because a helper process is not running would be exactly the
 * kind of fragility this application is trying not to have.
 */
export async function listCollections(
  referenceProviderId?: string,
): Promise<readonly CollectionFacts[]> {
  const referenceId = referenceProviderId
    ? collectionIdForProvider(referenceProviderId)
    : undefined;
  const repositories = await getRepositories();
  const facts: CollectionFacts[] = [
    {
      id: LOCAL_COLLECTION_ID,
      kind: 'indexeddb',
      name: 'My games',
      games: await repositories.games.count(),
      bytes: await estimateLocalBytes(),
      // IndexedDB has no per-store mtime, and inventing one from the newest
      // `importedAt` would report "never modified" for a collection somebody
      // has been deleting games from all morning.
      modifiedAt: null,
      location: 'This browser',
      reference: referenceId === LOCAL_COLLECTION_ID,
    },
  ];

  const client = companionClient();
  if (client) {
    try {
      const status = await client.status();
      for (const database of status.databases) {
        facts.push({
          id: sqliteCollectionId(database.key),
          kind: 'sqlite',
          name: database.name,
          games: database.games,
          bytes: database.bytes,
          modifiedAt: database.modifiedAt ?? null,
          location: database.file,
          reference: referenceId === sqliteCollectionId(database.key),
        });
      }
    } catch {
      // Reported by the companion health panel, which is where a user looks
      // for it. Failing the whole list here would hide the local collection.
    }
  }
  return facts;
}

/**
 * The explorer provider id a collection corresponds to, and back again.
 *
 * The two id spaces exist for different reasons and only mostly agree: an
 * explorer provider can be a remote service with no collection behind it, and
 * the browser's own collection was named `local-collection` as a provider
 * before it was named `local` as a collection. Rather than rename a value that
 * is already persisted in everybody's preferences, the mapping is stated here
 * once so "which collection is the reference database" has one answer.
 */
export const providerIdForCollection = (id: string): string =>
  id === LOCAL_COLLECTION_ID ? 'local-collection' : id;

export const collectionIdForProvider = (id: string): string =>
  id === 'local-collection' ? LOCAL_COLLECTION_ID : id;

/** Open one collection by id, or null when it is not present on this machine. */
export async function openCollection(id: string): Promise<GameCollection | null> {
  if (id === LOCAL_COLLECTION_ID) {
    const repositories = await getRepositories();
    return new LocalGameCollection(repositories.raw, repositories.games);
  }
  if (!id.startsWith('sqlite:')) return null;
  const key = id.slice('sqlite:'.length);
  const client = companionClient();
  if (!client) return null;
  const status = await client.status();
  const entry = status.databases.find((database) => database.key === key);
  if (!entry) return null;
  return new SqliteGameCollection(client, key, entry.name);
}

/** Open several, dropping any that are not present. Order is preserved. */
export async function openCollections(ids: readonly string[]): Promise<readonly GameCollection[]> {
  const opened = await Promise.all(ids.map((id) => openCollection(id)));
  return opened.filter((collection): collection is GameCollection => collection !== null);
}

/**
 * Roughly how much of the browser's storage the local collection accounts for.
 *
 * The browser reports one number for the whole origin — studies, repertoires,
 * training and games together — so this is deliberately reported as the origin
 * total rather than apportioned. A made-up share of a real number is worse than
 * a real number with its scope stated.
 */
async function estimateLocalBytes(): Promise<number | null> {
  try {
    const estimate = await navigator.storage?.estimate?.();
    return estimate?.usage ?? null;
  } catch {
    return null;
  }
}
