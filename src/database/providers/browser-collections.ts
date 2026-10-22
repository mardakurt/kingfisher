/**
 * The explorer over the collections kept in this browser beside My games.
 *
 * Each is the same store as My games in a database of its own, so each is the
 * My games provider pointed at that database and given the collection's name.
 * Its id is the collection's id (`browser:<key>`), which is what Databases
 * writes as the explorer's source when a collection is made the reference.
 */

import {
  browserCollectionDatabaseName,
  browserCollectionId,
  browserCollectionRepositories,
  type BrowserCollectionRecord,
} from '@/persistence/browser-collections';

import { PersistentLocalCollectionProvider, defaultPersistentLocalDeps } from './persistent-local';
import type { ChessDatabaseProvider } from '../types';

export function browserCollectionProviders(
  records: readonly BrowserCollectionRecord[],
): readonly ChessDatabaseProvider[] {
  return records.map(
    (record) =>
      new PersistentLocalCollectionProvider(
        {
          ...defaultPersistentLocalDeps,
          repositories: () => browserCollectionRepositories(record.key),
        },
        {
          id: browserCollectionId(record.key),
          name: record.name,
          description: 'A collection kept in this browser, indexed by position.',
          databaseName: browserCollectionDatabaseName(record.key),
        },
      ),
  );
}
