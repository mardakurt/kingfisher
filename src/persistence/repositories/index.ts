import { importGames } from '../import-game';
import type { AppRepositories } from '../types';
import { openPersistenceDatabase, type PersistenceDatabase } from '../indexeddb/database';
import { MemoryPersistenceDatabase } from '../indexeddb/memory';
import { LocalDraftRepository } from './draft-repository';
import { LocalGameRepository } from './game-repository';
import { LocalModelGameRepository, LocalProfileRepository } from './library-repository';
import { LocalRepertoireRepository } from './repertoire-repository';
import { LocalStudyRepository } from './study-repository';
import { LocalTrainingRepository } from './training-repository';

const fromDatabase = (database: PersistenceDatabase): AppRepositories => ({
  studies: new LocalStudyRepository(database),
  games: new LocalGameRepository(database),
  drafts: new LocalDraftRepository(database),
  repertoires: new LocalRepertoireRepository(database),
  training: new LocalTrainingRepository(database),
  modelGames: new LocalModelGameRepository(database),
  profile: new LocalProfileRepository(database),
  raw: database,
  close: () => database.close(),
});

let repositories: Promise<AppRepositories> | null = null;

export function getRepositories(): Promise<AppRepositories> {
  repositories ??= openPersistenceDatabase().then((database) => {
    const resolved = fromDatabase(database);
    /*
      A development-only handle for benchmarking and for inspecting the store
      from the console. `process.env.NODE_ENV` is inlined at build time, so this
      branch is removed entirely from a production bundle.
    */
    if (process.env.NODE_ENV !== 'production' && typeof globalThis !== 'undefined') {
      (
        globalThis as { __kingfisher?: AppRepositories & { importGames: typeof importGames } }
      ).__kingfisher = { ...resolved, importGames };
    }
    return resolved;
  });
  return repositories;
}

export function createMemoryRepositories(): AppRepositories {
  return fromDatabase(new MemoryPersistenceDatabase());
}

export function resetRepositorySingletonForTests(): void {
  repositories = null;
}
