/**
 * Versioned whole-workspace backup.
 *
 * The portable backup deliberately excludes the imported game collection by
 * default. Games are source material that can be re-imported and usually dwarf
 * the user's authored work; callers can opt in when they need a complete local
 * clone. Restore validates the complete document before opening a write
 * transaction, then commits every included store atomically.
 */

import {
  isChapterRecord,
  isDraftRecord,
  isGameSummary,
  isGameTree,
  isModelGameLinkRecord,
  isRepertoirePositionRecord,
  isRepertoireRecord,
  isStudyRecord,
  isTrainingItemRecord,
  isTrainingReviewRecord,
  isUserProfileRecord,
  isStudyReferenceRecord,
  isAnalysisQueueJobRecord,
  isStoredEngineEvidenceRecord,
  isDecisionRecord,
  isReviewItemRecord,
  isTrainingSetRecord,
  isLinkedAccountRecord,
} from './validation';
import { DATABASE_NAME, STORE_NAMES, type StoreName } from './schema/migrations';
import type { PersistenceDatabase, PersistenceTransaction } from './indexeddb/database';

export const BACKUP_FORMAT = 'kingfisher-workspace';
export const BACKUP_VERSION = 1;

const PORTABLE_STORES = [
  STORE_NAMES.studies,
  STORE_NAMES.chapters,
  STORE_NAMES.drafts,
  STORE_NAMES.repertoires,
  STORE_NAMES.repertoirePositions,
  STORE_NAMES.trainingItems,
  STORE_NAMES.trainingReviews,
  STORE_NAMES.modelGameLinks,
  STORE_NAMES.profile,
  STORE_NAMES.studyReferences,
  STORE_NAMES.analysisQueue,
  STORE_NAMES.engineEvidence,
  STORE_NAMES.decisions,
  STORE_NAMES.reviewItems,
  STORE_NAMES.trainingSets,
  STORE_NAMES.linkedAccounts,
] as const;

const GAME_STORES = [STORE_NAMES.games, STORE_NAMES.gameContent, STORE_NAMES.positions] as const;

export interface WorkspaceBackup {
  readonly format: typeof BACKUP_FORMAT;
  readonly version: typeof BACKUP_VERSION;
  readonly createdAt: number;
  readonly database: typeof DATABASE_NAME;
  readonly includesGames: boolean;
  readonly preferences: Readonly<Record<string, unknown>>;
  readonly stores: Readonly<Partial<Record<StoreName, readonly unknown[]>>>;
}

export type RestoreMode = 'merge' | 'replace';

export interface RestoreResult {
  readonly mode: RestoreMode;
  readonly records: number;
  readonly stores: number;
  readonly includesGames: boolean;
  readonly preferences: Readonly<Record<string, unknown>>;
}

export async function createWorkspaceBackup(
  database: PersistenceDatabase,
  preferences: Readonly<Record<string, unknown>>,
  options: { readonly includeGames?: boolean; readonly now?: number } = {},
): Promise<WorkspaceBackup> {
  const included = options.includeGames
    ? [...PORTABLE_STORES, ...GAME_STORES]
    : [...PORTABLE_STORES];
  const stores = await database.transaction(included, 'readonly', async (transaction) => {
    const entries = await Promise.all(
      included.map(async (store) => [store, await transaction.getAll<unknown>(store)] as const),
    );
    return Object.fromEntries(entries) as Partial<Record<StoreName, readonly unknown[]>>;
  });

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: options.now ?? Date.now(),
    database: DATABASE_NAME,
    includesGames: options.includeGames ?? false,
    preferences: structuredClone(preferences),
    stores,
  };
}

export function parseWorkspaceBackup(value: unknown): WorkspaceBackup {
  if (!isObject(value)) throw invalid('The backup root must be an object.');
  if (value.format !== BACKUP_FORMAT) throw invalid('This is not a Kingfisher workspace backup.');
  if (value.version !== BACKUP_VERSION) {
    throw invalid(`Backup version ${String(value.version)} is not supported by this build.`);
  }
  if (!Number.isFinite(value.createdAt)) throw invalid('The backup date is missing or invalid.');
  if (value.database !== DATABASE_NAME) throw invalid('The backup belongs to another database.');
  if (typeof value.includesGames !== 'boolean') {
    throw invalid('The backup does not say whether it includes games.');
  }
  if (!isObject(value.preferences)) throw invalid('The preferences section is invalid.');
  if (!isObject(value.stores)) throw invalid('The stores section is invalid.');
  const rawStores = value.stores;

  const expected = value.includesGames
    ? [...PORTABLE_STORES, ...GAME_STORES]
    : [...PORTABLE_STORES];
  for (const store of expected) {
    const records = rawStores[store];
    // v1 backups created before typed study references have no such store.
    if (store === STORE_NAMES.studyReferences && records === undefined) continue;
    if (
      (store === STORE_NAMES.analysisQueue || store === STORE_NAMES.engineEvidence) &&
      records === undefined
    )
      continue;
    // Phase 8 stores, likewise absent from every earlier backup.
    if (
      (store === STORE_NAMES.decisions ||
        store === STORE_NAMES.reviewItems ||
        store === STORE_NAMES.trainingSets) &&
      records === undefined
    )
      continue;
    // Phase 11: linked accounts. Absent from every backup made before them.
    if (store === STORE_NAMES.linkedAccounts && records === undefined) continue;
    if (!Array.isArray(records)) throw invalid(`The ${store} store is missing or invalid.`);
    records.forEach((record, index) => validateRecord(store, record, index));
  }

  // A backup that says games are excluded may not smuggle partial game data
  // into restore. Partial summary/content/index triples are not recoverable.
  if (!value.includesGames && GAME_STORES.some((store) => store in rawStores)) {
    throw invalid('The backup contains game data but is not marked as including games.');
  }

  return structuredClone(value) as unknown as WorkspaceBackup;
}

export async function restoreWorkspaceBackup(
  database: PersistenceDatabase,
  value: unknown,
  mode: RestoreMode,
): Promise<RestoreResult> {
  const backup = parseWorkspaceBackup(value);
  const stores = backup.includesGames ? [...PORTABLE_STORES, ...GAME_STORES] : [...PORTABLE_STORES];
  let records = 0;

  await database.transaction(stores, 'readwrite', async (transaction) => {
    if (mode === 'replace') {
      for (const store of stores) await transaction.clear(store);
    } else {
      await clearMergeCollisions(transaction, backup, stores);
    }
    for (const store of stores) {
      for (const record of backup.stores[store] ?? []) {
        await transaction.put(store, record);
        records += 1;
      }
    }
  });

  return {
    mode,
    records,
    stores: stores.length,
    includesGames: backup.includesGames,
    preferences: backup.preferences,
  };
}

/**
 * Two stores carry unique indexes, and a merge is exactly the situation that
 * can violate them: the same repertoire position or the same game written on
 * another device has a different primary key but the same unique key. Writing
 * both would abort the whole restore with a constraint error, which the user
 * would read as "my backup is corrupt".
 *
 * The record already in the database loses, because the backup is what the
 * user just asked to apply.
 */
const UNIQUE_KEY: Partial<Record<StoreName, (record: Record<string, unknown>) => string | null>> = {
  [STORE_NAMES.repertoirePositions]: (record) =>
    typeof record.repertoireId === 'string' && typeof record.positionKey === 'string'
      ? `${record.repertoireId}\u001f${record.positionKey}`
      : null,
  [STORE_NAMES.games]: (record) =>
    typeof record.fingerprint === 'string' ? record.fingerprint : null,
  [STORE_NAMES.reviewItems]: (record) =>
    typeof record.identityKey === 'string' ? record.identityKey : null,
  [STORE_NAMES.trainingSets]: (record) => (typeof record.name === 'string' ? record.name : null),
  [STORE_NAMES.studyReferences]: (record) =>
    typeof record.chapterId === 'string' &&
    typeof record.kind === 'string' &&
    typeof record.targetId === 'string'
      ? `${record.chapterId}\u001f${record.kind}\u001f${record.targetId}`
      : null,
};

async function clearMergeCollisions(
  transaction: PersistenceTransaction,
  backup: WorkspaceBackup,
  stores: readonly StoreName[],
): Promise<void> {
  for (const store of stores) {
    const uniqueKey = UNIQUE_KEY[store];
    const incoming = backup.stores[store];
    if (!uniqueKey || !incoming?.length) continue;

    const existing = await transaction.getAll<Record<string, unknown>>(store);
    const byUniqueKey = new Map<string, IDBValidKey>();
    for (const record of existing) {
      const key = uniqueKey(record);
      if (key !== null && typeof record.id === 'string') byUniqueKey.set(key, record.id);
    }

    for (const record of incoming as readonly Record<string, unknown>[]) {
      const key = uniqueKey(record);
      if (key === null) continue;
      const clashing = byUniqueKey.get(key);
      if (clashing === undefined || clashing === record.id) continue;
      await transaction.delete(store, clashing);
      // A game is three records; removing only its summary would leave orphaned
      // moves and position entries behind.
      if (store === STORE_NAMES.games) {
        await transaction.delete(STORE_NAMES.gameContent, clashing);
        const positions = await transaction.getAllFromIndex<{ id: string }>(
          STORE_NAMES.positions,
          'gameId',
          clashing,
        );
        for (const position of positions)
          await transaction.delete(STORE_NAMES.positions, position.id);
      }
    }
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const invalid = (detail: string): Error => new Error(`Backup rejected: ${detail}`);

function validateRecord(store: StoreName, value: unknown, index: number): void {
  const valid = (() => {
    if (store === STORE_NAMES.studies) return isStudyRecord(value);
    if (store === STORE_NAMES.chapters) return isChapterRecord(value);
    if (store === STORE_NAMES.drafts) return isDraftRecord(value);
    if (store === STORE_NAMES.repertoires) return isRepertoireRecord(value);
    if (store === STORE_NAMES.repertoirePositions) return isRepertoirePositionRecord(value);
    if (store === STORE_NAMES.trainingItems) return isTrainingItemRecord(value);
    if (store === STORE_NAMES.trainingReviews) return isTrainingReviewRecord(value);
    if (store === STORE_NAMES.modelGameLinks) return isModelGameLinkRecord(value);
    if (store === STORE_NAMES.profile) return isUserProfileRecord(value);
    if (store === STORE_NAMES.studyReferences) return isStudyReferenceRecord(value);
    if (store === STORE_NAMES.analysisQueue) return isAnalysisQueueJobRecord(value);
    if (store === STORE_NAMES.engineEvidence) return isStoredEngineEvidenceRecord(value);
    if (store === STORE_NAMES.decisions) return isDecisionRecord(value);
    if (store === STORE_NAMES.reviewItems) return isReviewItemRecord(value);
    if (store === STORE_NAMES.trainingSets) return isTrainingSetRecord(value);
    if (store === STORE_NAMES.linkedAccounts) return isLinkedAccountRecord(value);
    if (store === STORE_NAMES.games) return isGameSummary(value);
    if (store === STORE_NAMES.gameContent) {
      return (
        isObject(value) &&
        typeof value.id === 'string' &&
        typeof value.normalizedPgn === 'string' &&
        isGameTree(value.tree)
      );
    }
    if (store === STORE_NAMES.positions) {
      return (
        isObject(value) &&
        typeof value.id === 'string' &&
        typeof value.positionKey === 'string' &&
        typeof value.gameId === 'string' &&
        Number.isFinite(value.ply) &&
        typeof value.moveUci === 'string' &&
        typeof value.moveSan === 'string' &&
        (value.mover === 'w' || value.mover === 'b')
      );
    }
    return false;
  })();

  if (!valid) throw invalid(`${store}[${index}] is malformed.`);
}
