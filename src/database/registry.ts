/**
 * The databases this build can query.
 *
 * The local collection is a singleton because it holds imported games for the
 * session; remote providers are stateless.
 */

import { PositionIndex } from './local-index';
import { LichessExplorerProvider } from './providers/lichess';
import { LocalCollectionProvider } from './providers/local';
import type { ChessDatabaseProvider } from './types';

export const localPositionIndex = new PositionIndex();

const localProvider = new LocalCollectionProvider(localPositionIndex);

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
