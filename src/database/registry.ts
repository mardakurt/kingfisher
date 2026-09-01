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

const providers: readonly ChessDatabaseProvider[] = [
  new LichessExplorerProvider('masters'),
  new LichessExplorerProvider('lichess'),
  localProvider,
];

export const databaseProviders = (): readonly ChessDatabaseProvider[] => providers;

export const databaseProviderById = (id: string): ChessDatabaseProvider | undefined =>
  providers.find((provider) => provider.id === id);

export const defaultDatabaseProviderId = 'lichess-masters';

export { localProvider };
