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
 * Sources that exist only because of what is on this machine: SQLite
 * collections behind a paired companion, and installed reference packs.
 *
 * Registered dynamically rather than declared, because what is installed is a
 * property of the machine. A source that cannot answer is not offered at all —
 * an explorer that lists a database and then fails is worse than a shorter list.
 *
 * Grouped by owner, because the two have independent lifecycles: a companion
 * going offline must not un-register the reference packs stored in this
 * browser, and installing a pack must not disturb the companion's list.
 */
export type DynamicProviderGroup = 'companion' | 'reference';

const dynamic = new Map<DynamicProviderGroup, readonly ChessDatabaseProvider[]>();
let current: readonly ChessDatabaseProvider[] = builtIn;
const listeners = new Set<() => void>();

export const setDynamicDatabaseProviders = (
  group: DynamicProviderGroup,
  providers: readonly ChessDatabaseProvider[],
): void => {
  dynamic.set(group, providers);
  // Reference packs first: they are the sources that answer without a network
  // or a companion, and a list is read top-down.
  current = [...(dynamic.get('reference') ?? []), ...builtIn, ...(dynamic.get('companion') ?? [])];
  for (const listener of listeners) listener();
};

export const databaseProviders = (): readonly ChessDatabaseProvider[] => current;

export const subscribeDatabaseProviders = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const databaseProviderById = (id: string): ChessDatabaseProvider | undefined =>
  databaseProviders().find((provider) => provider.id === id);

/**
 * What the explorer opens on before anybody chooses.
 *
 * The bundled reference, not Lichess. Lichess requires an authenticated
 * request for the opening explorer, so defaulting to it meant that the first
 * thing a new installation showed was an authentication prompt where the
 * evidence should have been.
 */
export const defaultDatabaseProviderId = 'kingfisher-starter';

export { localProvider };
