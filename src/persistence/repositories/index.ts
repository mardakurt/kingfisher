import { importGames } from '../import-game';
import type { AppRepositories } from '../types';
import { openPersistenceDatabase, type PersistenceDatabase } from '../indexeddb/database';
import { MemoryPersistenceDatabase } from '../indexeddb/memory';
import { withWriteTracking } from '../write-tracker';
import { LocalDraftRepository } from './draft-repository';
import { LocalGameRepository } from './game-repository';
import { LocalModelGameRepository, LocalProfileRepository } from './library-repository';
import { LocalRepertoireRepository } from './repertoire-repository';
import { LocalStudyRepository } from './study-repository';
import { LocalTrainingRepository } from './training-repository';
import { LocalStudyReferenceRepository } from './reference-repository';
import { LocalAnalysisQueueRepository } from './analysis-queue-repository';
import { LocalReviewRepository } from './review-repository';
import { LocalTrainingSetRepository } from './training-set-repository';
import { LocalPreparationRepository } from './preparation-repository';
import { LocalOpeningFileRepository } from './opening-file-repository';
import { LocalEndgameRepository } from './endgame-repository';
import { LocalPinnedLineRepository } from './pinned-line-repository';
import { LocalLinkedAccountRepository } from './linked-account-repository';
import { LocalSourceSetRepository } from './source-set-repository';
import { LocalPlayerIdentityRepository } from './player-identity-repository';

const fromDatabase = (database: PersistenceDatabase): AppRepositories => ({
  studies: new LocalStudyRepository(database),
  games: new LocalGameRepository(database),
  drafts: new LocalDraftRepository(database),
  repertoires: new LocalRepertoireRepository(database),
  training: new LocalTrainingRepository(database),
  modelGames: new LocalModelGameRepository(database),
  profile: new LocalProfileRepository(database),
  references: new LocalStudyReferenceRepository(database),
  analysisQueue: new LocalAnalysisQueueRepository(database),
  review: new LocalReviewRepository(database),
  trainingSets: new LocalTrainingSetRepository(database),
  preparation: new LocalPreparationRepository(database),
  openingFiles: new LocalOpeningFileRepository(database),
  endgames: new LocalEndgameRepository(database),
  pinnedLines: new LocalPinnedLineRepository(database),
  linkedAccounts: new LocalLinkedAccountRepository(database),
  sourceSets: new LocalSourceSetRepository(database),
  playerIdentities: new LocalPlayerIdentityRepository(database),
  raw: database,
  close: () => database.close(),
});

let repositories: Promise<AppRepositories> | null = null;

export function getRepositories(): Promise<AppRepositories> {
  repositories ??= openPersistenceDatabase().then((database) => {
    /*
      Wrap the database in a write tracker *before* any repository
      is constructed, so every readwrite transaction through
      `repositories.raw` (and every per-table write through the
      repositories built on top) registers with the tracker. The
      save barrier before an update uses the tracker to know
      whether the user has any unsaved work in flight.
    */
    const tracked = withWriteTracking(database);
    const resolved = fromDatabase(tracked);
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
