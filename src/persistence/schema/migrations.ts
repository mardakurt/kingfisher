export const DATABASE_NAME = 'kingfisher';
export const DATABASE_VERSION = 7;

export const STORE_NAMES = {
  studies: 'studies',
  chapters: 'chapters',
  games: 'games',
  positions: 'positions',
  drafts: 'drafts',
  repertoires: 'repertoires',
  repertoirePositions: 'repertoirePositions',
  trainingItems: 'trainingItems',
  trainingReviews: 'trainingReviews',
  modelGameLinks: 'modelGameLinks',
  profile: 'profile',
  gameContent: 'gameContent',
  studyReferences: 'studyReferences',
  analysisQueue: 'analysisQueue',
  engineEvidence: 'engineEvidence',
} as const;

export type StoreName = (typeof STORE_NAMES)[keyof typeof STORE_NAMES];

export interface IndexSpec {
  readonly name: string;
  readonly keyPath: string | readonly string[];
  readonly unique?: boolean;
  /** Index every element of an array-valued key path separately. */
  readonly multiEntry?: boolean;
}

export interface MigrationTarget {
  hasStore(name: StoreName): boolean;
  createStore(
    name: StoreName,
    options: IDBObjectStoreParameters,
    indexes?: readonly IndexSpec[],
  ): void;
  /** Add an index to a store that already exists. */
  addIndex(store: StoreName, index: IndexSpec): void;
  /**
   * Move part of every record into another store, during the upgrade.
   *
   * Used to lift game trees out of the records the game list reads. Runs inside
   * the version-change transaction like everything else, so the two stores can
   * never be left disagreeing about which games have content.
   */
  split(
    from: StoreName,
    to: StoreName,
    divide: (record: unknown) => { keep: unknown; move: unknown } | null,
  ): void;
  /**
   * Rewrite every record of a store during the upgrade transaction.
   *
   * The only safe way to backfill a field an index depends on: it happens
   * inside the version-change transaction, so either the whole upgrade lands or
   * none of it does, and no code ever observes a half-indexed store.
   */
  rewrite(store: StoreName, update: (record: unknown) => unknown): void;
}

export interface Migration {
  readonly version: number;
  readonly description: string;
  apply(target: MigrationTarget): void;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    description: 'Create studies, chapters, games, position index, and active draft stores.',
    apply(target) {
      target.createStore(STORE_NAMES.studies, { keyPath: 'id' }, [
        { name: 'updatedAt', keyPath: 'updatedAt' },
        { name: 'title', keyPath: 'title' },
      ]);
      target.createStore(STORE_NAMES.chapters, { keyPath: 'id' }, [
        { name: 'studyId', keyPath: 'studyId' },
        { name: 'studyOrder', keyPath: ['studyId', 'order'] },
        { name: 'updatedAt', keyPath: 'updatedAt' },
      ]);
      target.createStore(STORE_NAMES.games, { keyPath: 'id' }, [
        { name: 'fingerprint', keyPath: 'fingerprint', unique: true },
        { name: 'importedAt', keyPath: 'importedAt' },
        { name: 'date', keyPath: 'date' },
        { name: 'white', keyPath: 'white' },
        { name: 'black', keyPath: 'black' },
        { name: 'eco', keyPath: 'eco' },
      ]);
      target.createStore(STORE_NAMES.positions, { keyPath: 'id' }, [
        { name: 'positionKey', keyPath: 'positionKey' },
        { name: 'gameId', keyPath: 'gameId' },
      ]);
      target.createStore(STORE_NAMES.drafts, { keyPath: 'id' });
    },
  },
  {
    version: 2,
    description:
      'Add repertoires, training, model-game links and the user profile; index games for large collections.',
    apply(target) {
      target.createStore(STORE_NAMES.repertoires, { keyPath: 'id' }, [
        { name: 'updatedAt', keyPath: 'updatedAt' },
        { name: 'color', keyPath: 'color' },
      ]);

      /*
        Repertoire knowledge is keyed by canonical position, and the compound
        index is what makes "what do I play here?" a single point lookup rather
        than a scan of the repertoire.
      */
      target.createStore(STORE_NAMES.repertoirePositions, { keyPath: 'id' }, [
        { name: 'repertoireId', keyPath: 'repertoireId' },
        { name: 'positionKey', keyPath: 'positionKey' },
        { name: 'repertoirePosition', keyPath: ['repertoireId', 'positionKey'], unique: true },
      ]);

      target.createStore(STORE_NAMES.trainingItems, { keyPath: 'id' }, [
        { name: 'dueAt', keyPath: 'schedule.dueAt' },
        { name: 'mode', keyPath: 'mode' },
        { name: 'positionKey', keyPath: 'positionKey' },
        { name: 'tags', keyPath: 'tags', multiEntry: true },
      ]);

      target.createStore(STORE_NAMES.trainingReviews, { keyPath: 'id' }, [
        { name: 'itemId', keyPath: 'itemId' },
        { name: 'reviewedAt', keyPath: 'reviewedAt' },
      ]);

      target.createStore(STORE_NAMES.modelGameLinks, { keyPath: 'id' }, [
        { name: 'gameId', keyPath: 'gameId' },
        { name: 'positionKey', keyPath: 'positionKey' },
        { name: 'studyId', keyPath: 'studyId' },
        { name: 'repertoireId', keyPath: 'repertoireId' },
        { name: 'kinds', keyPath: 'kinds', multiEntry: true },
      ]);

      target.createStore(STORE_NAMES.profile, { keyPath: 'id' });

      /*
        Phase 2 filtered the whole games store in memory. These indexes are the
        ones the Games list and player preparation actually query by; the
        `players` multi-entry index answers "this player, either colour" in one
        pass, which is the single most common preparation question.
      */
      target.addIndex(STORE_NAMES.games, { name: 'year', keyPath: 'year' });
      target.addIndex(STORE_NAMES.games, { name: 'result', keyPath: 'result' });
      target.addIndex(STORE_NAMES.games, { name: 'whiteKey', keyPath: 'whiteKey' });
      target.addIndex(STORE_NAMES.games, { name: 'blackKey', keyPath: 'blackKey' });
      target.addIndex(STORE_NAMES.games, {
        name: 'players',
        keyPath: 'playerKeys',
        multiEntry: true,
      });

      // Backfill the normalized names those indexes read, so games imported
      // under version 1 are searchable without being re-imported.
      target.rewrite(STORE_NAMES.games, (record) => withPlayerKeys(record));
    },
  },
  {
    version: 3,
    description: 'Move game trees into their own store so listing games does not read them.',
    apply(target) {
      /*
        Measured before it was written: a stored game averages 6.7 kB, of which
        the tree and its serialized PGN are 6.3 kB. Reading ten thousand game
        summaries without them is roughly eight times faster, which is the
        difference between a game list that feels instant and one that does not.
        The list, the search and the explorer only ever need the summary.
      */
      target.createStore(STORE_NAMES.gameContent, { keyPath: 'id' });
      target.split(STORE_NAMES.games, STORE_NAMES.gameContent, splitGameRecord);
    },
  },
  {
    version: 4,
    description: 'Give every chapter a write revision, so two tabs cannot silently overwrite one.',
    apply(target) {
      /*
        Backfilled rather than defaulted at read time. A chapter whose revision
        is only invented when it is loaded gives every tab the same number, and
        the first write from each would be accepted — which is precisely the
        collision this exists to catch.
      */
      target.rewrite(STORE_NAMES.chapters, (record) => withRevision(record));
    },
  },
  {
    version: 5,
    description: 'Add authoring revisions to repertoire positions and training items.',
    apply(target) {
      target.rewrite(STORE_NAMES.repertoirePositions, (record) => withRevision(record));
      target.rewrite(STORE_NAMES.trainingItems, (record) => withRevision(record));
    },
  },
  {
    version: 6,
    description: 'Add typed chapter references to existing chess evidence.',
    apply(target) {
      target.createStore(STORE_NAMES.studyReferences, { keyPath: 'id' }, [
        { name: 'chapterId', keyPath: 'chapterId' },
        { name: 'targetId', keyPath: 'targetId' },
        { name: 'chapterTarget', keyPath: ['chapterId', 'kind', 'targetId'], unique: true },
      ]);
    },
  },
  {
    version: 7,
    description: 'Persist resumable background-analysis jobs and their final engine evidence.',
    apply(target) {
      target.createStore(STORE_NAMES.analysisQueue, { keyPath: 'id' }, [
        { name: 'status', keyPath: 'status' },
        { name: 'gameId', keyPath: 'gameId' },
        { name: 'createdAt', keyPath: 'createdAt' },
      ]);
      target.createStore(STORE_NAMES.engineEvidence, { keyPath: 'id' }, [
        { name: 'jobId', keyPath: 'jobId' },
        { name: 'gameId', keyPath: 'gameId' },
        { name: 'positionKey', keyPath: 'positionKey' },
      ]);
    },
  },
];

/** Pure form of the v4 data migration, exported for upgrade tests. */
export function withRevision(record: unknown): unknown {
  if (typeof record !== 'object' || record === null) return record;
  const chapter = record as Record<string, unknown>;
  if (typeof chapter.revision === 'number' && Number.isFinite(chapter.revision)) return chapter;
  return { ...chapter, revision: 0 };
}

/** Pure form of the v3 data migration, exported for realistic upgrade tests. */
export function splitGameRecord(
  record: unknown,
): { readonly keep: unknown; readonly move: unknown } | null {
  if (typeof record !== 'object' || record === null) return null;
  const game = record as Record<string, unknown>;
  if (game.tree === undefined && game.normalizedPgn === undefined) return null;
  const { tree, normalizedPgn, ...summary } = game;
  return {
    keep: summary,
    move: { id: game.id, tree, normalizedPgn },
  };
}

/**
 * Normalized player names for indexing.
 *
 * Case and surrounding whitespace are folded because "KASPAROV, GARRY" and
 * "Kasparov, Garry" are one person. Nothing more aggressive is attempted:
 * collapsing "M. Carlsen" into "Magnus Carlsen" would eventually merge two
 * different people, and a preparation report about the wrong player is worse
 * than one that missed some games.
 */
export const playerKey = (name: string | undefined): string =>
  (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

export function withPlayerKeys(record: unknown): unknown {
  if (typeof record !== 'object' || record === null) return record;
  const game = record as Record<string, unknown>;
  const white = playerKey(game.white as string | undefined);
  const black = playerKey(game.black as string | undefined);
  return {
    ...game,
    whiteKey: white,
    blackKey: black,
    playerKeys: white === black ? [white] : [white, black],
  };
}

export function applyMigrations(
  target: MigrationTarget,
  oldVersion: number,
  newVersion: number,
): void {
  for (const migration of MIGRATIONS) {
    if (migration.version > oldVersion && migration.version <= newVersion) migration.apply(target);
  }
}

export interface ResolvedStore {
  readonly keyPath: string;
  readonly indexes: ReadonlyMap<string, IndexSpec>;
}

/**
 * The schema the migrations add up to.
 *
 * Computed by replaying every migration against a recorder rather than being
 * written out a second time. The in-memory database used by tests reads this,
 * so its index behaviour cannot drift from the real one — which matters,
 * because an index name and its key path are frequently different and a test
 * double that quietly ignored that would pass while the browser failed.
 */
export function resolveSchema(): ReadonlyMap<StoreName, ResolvedStore> {
  const stores = new Map<StoreName, { keyPath: string; indexes: Map<string, IndexSpec> }>();

  applyMigrations(
    {
      hasStore: (name) => stores.has(name),
      createStore: (name, options, indexes = []) => {
        stores.set(name, {
          keyPath: String(options.keyPath ?? 'id'),
          indexes: new Map(indexes.map((index) => [index.name, index])),
        });
      },
      addIndex: (name, index) => {
        stores.get(name)?.indexes.set(index.name, index);
      },
      split: () => undefined,
      rewrite: () => undefined,
    },
    0,
    DATABASE_VERSION,
  );

  return new Map(
    [...stores].map(([name, store]) => [name, { keyPath: store.keyPath, indexes: store.indexes }]),
  );
}

/** Read a possibly dotted key path out of a record. */
export function readKeyPath(record: unknown, keyPath: string): unknown {
  return keyPath
    .split('.')
    .reduce<unknown>(
      (value, part) =>
        typeof value === 'object' && value !== null
          ? (value as Record<string, unknown>)[part]
          : undefined,
      record,
    );
}
