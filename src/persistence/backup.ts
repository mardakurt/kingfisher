/**
 * Versioned whole-workspace backup.
 *
 * The portable backup deliberately excludes the imported game collection by
 * default. Games are source material that can be re-imported and usually dwarf
 * the user's authored work; callers can opt in when they need a complete local
 * clone. Restore validates the complete document before opening a write
 * transaction, then commits every included store atomically.
 *
 * Reference packs are the one thing recorded but never carried. A pack is
 * hundreds of megabytes of chunks that can be fetched again, so putting them
 * in a JSON file the user emails to themselves is absurd — but a backup that
 * does not even remember *which* ones were installed leaves a restored profile
 * silently missing the sources every statistic in the workspace was read from.
 * So the backup stores a short list of what was there, and restore hands it
 * back so the user can be offered a reinstall. The pack records themselves are
 * never written: a row saying "ready" with no chunks behind it would be a
 * source that lies about having data.
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
  isPreparationSessionRecord,
  isOpeningFileRecord,
  isEndgamePositionRecord,
  isPinnedLineRecord,
  isSourceSetRecord,
  isPlayerIdentityRecord,
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
  STORE_NAMES.preparationSessions,
  STORE_NAMES.openingFiles,
  STORE_NAMES.endgamePositions,
  STORE_NAMES.pinnedLines,
  STORE_NAMES.sourceSets,
  STORE_NAMES.playerIdentities,
] as const;

const LATER_AUTHORED_STORES = new Set<StoreName>([
  STORE_NAMES.preparationSessions,
  STORE_NAMES.openingFiles,
  STORE_NAMES.endgamePositions,
  STORE_NAMES.pinnedLines,
  STORE_NAMES.sourceSets,
  STORE_NAMES.playerIdentities,
]);

const GAME_STORES = [STORE_NAMES.games, STORE_NAMES.gameContent, STORE_NAMES.positions] as const;

export interface WorkspaceBackup {
  readonly format: typeof BACKUP_FORMAT;
  readonly version: typeof BACKUP_VERSION;
  readonly createdAt: number;
  readonly database: typeof DATABASE_NAME;
  readonly includesGames: boolean;
  readonly preferences: Readonly<Record<string, unknown>>;
  readonly stores: Readonly<Partial<Record<StoreName, readonly unknown[]>>>;
  /**
   * Which reference packs were installed. Never their contents.
   *
   * Whether each source was *enabled* is already in `preferences`, under
   * `sourceSettings` and `sourcePriority`, and is restored with them.
   */
  readonly referenceSources: readonly BackedUpReferenceSource[];
}

/**
 * A reference pack that was installed when the backup was taken.
 *
 * Metadata only, and deliberately small enough to be obviously not the data:
 * enough to name the source to a human and to find it in the catalog again.
 */
export interface BackedUpReferenceSource {
  readonly id: string;
  readonly name: string;
  readonly version?: string;
  /** How big it was, so "Reinstall" can say what it is about to download. */
  readonly bytes: number;
  /** Where a pack installed from outside the catalog came from. */
  readonly manifestUrl?: string;
}

export type RestoreMode = 'merge' | 'replace';

export interface RestoreResult {
  readonly mode: RestoreMode;
  readonly records: number;
  readonly stores: number;
  readonly includesGames: boolean;
  readonly preferences: Readonly<Record<string, unknown>>;
  /**
   * What the backup says was installed, for the caller to offer to reinstall.
   *
   * Nothing was written for these. Reinstallation stays an explicit decision
   * because it is a large download, and a restore is not the moment to start
   * one without asking.
   */
  readonly referenceSources: readonly BackedUpReferenceSource[];
}

export async function createWorkspaceBackup(
  database: PersistenceDatabase,
  preferences: Readonly<Record<string, unknown>>,
  options: {
    readonly includeGames?: boolean;
    readonly now?: number;
    readonly referenceSources?: readonly BackedUpReferenceSource[];
  } = {},
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
    referenceSources: (options.referenceSources ?? []).map((source) => ({ ...source })),
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
  /*
    Absent in every backup written before Phase 16. Treated as "none recorded"
    rather than as a broken file: an older backup is not wrong, it simply
    cannot answer the question, and refusing to restore it over that would be
    the worst possible trade.
  */
  const referenceSources = parseReferenceSources(value.referenceSources);

  const expected = value.includesGames
    ? [...PORTABLE_STORES, ...GAME_STORES]
    : [...PORTABLE_STORES];
  for (const store of expected) {
    const records = rawStores[store];
    if (LATER_AUTHORED_STORES.has(store) && records === undefined) continue;
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

  return {
    ...(structuredClone(value) as unknown as WorkspaceBackup),
    referenceSources,
  };
}

function parseReferenceSources(value: unknown): readonly BackedUpReferenceSource[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw invalid('The reference sources section is invalid.');
  return value.map((entry, index) => {
    if (!isObject(entry)) throw invalid(`Reference source ${index} is not an object.`);
    if (typeof entry.id !== 'string' || entry.id.length === 0) {
      throw invalid(`Reference source ${index} has no id.`);
    }
    if (typeof entry.name !== 'string' || entry.name.length === 0) {
      throw invalid(`Reference source ${index} has no name.`);
    }
    if (typeof entry.bytes !== 'number' || !Number.isFinite(entry.bytes) || entry.bytes < 0) {
      throw invalid(`Reference source ${index} has an invalid size.`);
    }
    return {
      id: entry.id,
      name: entry.name,
      bytes: entry.bytes,
      ...(typeof entry.version === 'string' ? { version: entry.version } : {}),
      ...(typeof entry.manifestUrl === 'string' ? { manifestUrl: entry.manifestUrl } : {}),
    };
  });
}

export async function restoreWorkspaceBackup(
  database: PersistenceDatabase,
  value: unknown,
  mode: RestoreMode,
): Promise<RestoreResult> {
  const backup = parseWorkspaceBackup(value);
  const stores = (
    backup.includesGames ? [...PORTABLE_STORES, ...GAME_STORES] : [...PORTABLE_STORES]
  ).filter((store) => backup.stores[store] !== undefined);
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
    referenceSources: backup.referenceSources,
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
  [STORE_NAMES.openingFiles]: (record) => (typeof record.name === 'string' ? record.name : null),
  [STORE_NAMES.sourceSets]: (record) => (typeof record.name === 'string' ? record.name : null),
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
    if (store === STORE_NAMES.preparationSessions) return isPreparationSessionRecord(value);
    if (store === STORE_NAMES.openingFiles) return isOpeningFileRecord(value);
    if (store === STORE_NAMES.endgamePositions) return isEndgamePositionRecord(value);
    if (store === STORE_NAMES.pinnedLines) return isPinnedLineRecord(value);
    if (store === STORE_NAMES.sourceSets) return isSourceSetRecord(value);
    if (store === STORE_NAMES.playerIdentities) return isPlayerIdentityRecord(value);
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
