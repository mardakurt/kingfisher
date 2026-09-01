import type { AppRepositories } from '../types';
import { openPersistenceDatabase, type PersistenceDatabase } from '../indexeddb/database';
import { MemoryPersistenceDatabase } from '../indexeddb/memory';
import { LocalDraftRepository } from './draft-repository';
import { LocalGameRepository } from './game-repository';
import { LocalStudyRepository } from './study-repository';

const fromDatabase = (database: PersistenceDatabase): AppRepositories => ({
  studies: new LocalStudyRepository(database),
  games: new LocalGameRepository(database),
  drafts: new LocalDraftRepository(database),
  close: () => database.close(),
});

let repositories: Promise<AppRepositories> | null = null;

export function getRepositories(): Promise<AppRepositories> {
  repositories ??= openPersistenceDatabase().then(fromDatabase);
  return repositories;
}

export function createMemoryRepositories(): AppRepositories {
  return fromDatabase(new MemoryPersistenceDatabase());
}

export function resetRepositorySingletonForTests(): void {
  repositories = null;
}
