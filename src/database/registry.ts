/**
 * The databases this build can query.
 *
 * Providers are stateless. The local implementation opens the versioned
 * persistence repository lazily when queried, so importing and exploring use
 * the same durable source of truth without exposing IndexedDB to the panel.
 */

import { LichessExplorerProvider } from './providers/lichess';
import { PersistentLocalCollectionProvider } from './providers/persistent-local';
import type { ChessDatabaseProvider } from './types';

const localProvider = new PersistentLocalCollectionProvider();

const builtIn: readonly ChessDatabaseProvider[] = [
  new LichessExplorerProvider('masters'),
  new LichessExplorerProvider('lichess'),
  new LichessExplorerProvider('player'),
  localProvider,
];

/**
 * SQLite collections, which only exist while a companion is paired.
 *
 * Registered dynamically rather than declared, because what is installed is a
 * property of the machine. A source that cannot answer is not offered at all —
 * an explorer that lists a database and then fails is worse than a shorter list.
 */
let dynamic: readonly ChessDatabaseProvider[] = [];
let current: readonly ChessDatabaseProvider[] = builtIn;
const listeners = new Set<() => void>();

export const setDynamicDatabaseProviders = (providers: readonly ChessDatabaseProvider[]): void => {
  dynamic = providers;
  current = [...builtIn, ...dynamic];
  for (const listener of listeners) listener();
};

export const databaseProviders = (): readonly ChessDatabaseProvider[] => current;

export const subscribeDatabaseProviders = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const databaseProviderById = (id: string): ChessDatabaseProvider | undefined =>
  databaseProviders().find((provider) => provider.id === id);

export const defaultDatabaseProviderId = 'lichess-masters';

export { localProvider };
