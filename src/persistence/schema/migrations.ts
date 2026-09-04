export const DATABASE_NAME = 'kingfisher';
export const DATABASE_VERSION = 15;

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
  decisions: 'decisions',
  reviewItems: 'reviewItems',
  trainingSets: 'trainingSets',
  preparationSessions: 'preparationSessions',
  openingFiles: 'openingFiles',
  endgamePositions: 'endgamePositions',
  pinnedLines: 'pinnedLines',
  linkedAccounts: 'linkedAccounts',
  sourceSets: 'sourceSets',
  playerIdentities: 'playerIdentities',
  referencePacks: 'referencePacks',
  referenceChunks: 'referenceChunks',
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
  {
    version: 8,
    description: 'Record what the player thought, the review queue, and training sets.',
    apply(target) {
      /*
        `positionKey` is indexed on both new position-bearing stores because
        the question the review workspace asks most is "what did I think here
        before?", and it must not become a scan as the journal grows.
      */
      target.createStore(STORE_NAMES.decisions, { keyPath: 'id' }, [
        { name: 'positionKey', keyPath: 'positionKey' },
        { name: 'gameId', keyPath: 'gameId' },
        { name: 'createdAt', keyPath: 'createdAt' },
        { name: 'themes', keyPath: 'themes', multiEntry: true },
      ]);
      target.createStore(STORE_NAMES.reviewItems, { keyPath: 'id' }, [
        { name: 'positionKey', keyPath: 'positionKey' },
        { name: 'status', keyPath: 'status' },
        { name: 'gameId', keyPath: 'gameId' },
        { name: 'createdAt', keyPath: 'createdAt' },
        { name: 'themes', keyPath: 'themes', multiEntry: true },
        /*
          One queue entry per position per source document, so re-running the
          suggester cannot stack duplicates. A derived string rather than a
          compound key path on purpose: IndexedDB omits a record from a
          compound index when any component is absent, and a review item
          created by hand has no game and no node.
        */
        { name: 'identityKey', keyPath: 'identityKey', unique: true },
      ]);
      target.createStore(STORE_NAMES.trainingSets, { keyPath: 'id' }, [
        { name: 'name', keyPath: 'name', unique: true },
        { name: 'createdAt', keyPath: 'createdAt' },
      ]);
      // Existing profiles predate user-defined themes; give them the field
      // rather than letting every read invent an empty array.
      target.rewrite(STORE_NAMES.profile, (record) => {
        if (typeof record !== 'object' || record === null) return record;
        const profile = record as Record<string, unknown>;
        return Array.isArray(profile.customThemes) ? profile : { ...profile, customThemes: [] };
      });
    },
  },
  {
    version: 9,
    description: 'Index deterministic pawn skeletons and structural position facts.',
    apply(target) {
      /*
        Existing position rows remain valid and are reindexed when their PGN is
        imported again. IndexedDB omits records whose keyPath is absent, so the
        new indexes never manufacture a match for an older unindexed row.
      */
      target.addIndex(STORE_NAMES.positions, { name: 'pawnSkeleton', keyPath: 'pawnSkeleton' });
      target.addIndex(STORE_NAMES.positions, {
        name: 'structureSignature',
        keyPath: 'structureSignature',
      });
      target.addIndex(STORE_NAMES.positions, {
        name: 'structureClaims',
        keyPath: 'structureClaims',
        multiEntry: true,
      });
    },
  },
  {
    version: 10,
    description: 'Add preparation sessions, opening files, endgame positions and pinned lines.',
    apply(target) {
      target.createStore(STORE_NAMES.preparationSessions, { keyPath: 'id' }, [
        { name: 'updatedAt', keyPath: 'updatedAt' },
        { name: 'opponentKey', keyPath: 'opponentKey' },
        { name: 'gameDate', keyPath: 'gameDate' },
      ]);
      target.createStore(STORE_NAMES.openingFiles, { keyPath: 'id' }, [
        { name: 'name', keyPath: 'name', unique: true },
        { name: 'color', keyPath: 'color' },
        { name: 'updatedAt', keyPath: 'updatedAt' },
        { name: 'positionKey', keyPath: 'positionKey' },
      ]);
      target.createStore(STORE_NAMES.endgamePositions, { keyPath: 'id' }, [
        { name: 'positionKey', keyPath: 'positionKey' },
        { name: 'category', keyPath: 'category' },
        { name: 'pieceCount', keyPath: 'pieceCount' },
        { name: 'updatedAt', keyPath: 'updatedAt' },
      ]);
      /*
        Pinned lines are keyed by position rather than by chapter: the same
        position reached through a different move order is the same position,
        and evidence gathered about it should not have to be gathered twice.
      */
      target.createStore(STORE_NAMES.pinnedLines, { keyPath: 'id' }, [
        { name: 'positionKey', keyPath: 'positionKey' },
        { name: 'chapterId', keyPath: 'chapterId' },
        { name: 'createdAt', keyPath: 'createdAt' },
      ]);
    },
  },
  {
    version: 11,
    description: 'Add linked online accounts, for syncing games from Lichess and Chess.com.',
    apply(target) {
      target.createStore(STORE_NAMES.linkedAccounts, { keyPath: 'id' }, [
        { name: 'provider', keyPath: 'provider' },
      ]);
    },
  },
  {
    version: 12,
    description: "Index Kingfisher's own opening classification, separately from the PGN tag.",
    apply(target) {
      /*
        Two indexes, because the two questions are different. `classifiedEco`
        answers "show me the Najdorfs" from what Kingfisher computed rather
        than from what the file claimed. `classifiedWith` is what makes the
        backfill bounded: games carrying a stale digest, or none at all, can be
        walked directly instead of scanning the whole collection.

        No data migration runs here. Classifying every stored game inside a
        version-change transaction would block the application open on a job
        that takes minutes on a large collection; the backfill does it
        afterwards, resumably, and reports progress while it works.
      */
      target.addIndex(STORE_NAMES.games, {
        name: 'classifiedEco',
        keyPath: 'classification.eco',
      });
      target.addIndex(STORE_NAMES.games, {
        name: 'classifiedWith',
        keyPath: 'classifiedWith',
      });
    },
  },
  {
    version: 13,
    description: 'Add named source sets, which reference collections without copying games.',
    apply(target) {
      target.createStore(STORE_NAMES.sourceSets, { keyPath: 'id' }, [
        { name: 'name', keyPath: 'name', unique: true },
        { name: 'updatedAt', keyPath: 'updatedAt' },
      ]);
    },
  },
  {
    version: 14,
    description: 'Add player identities: explicit aliases and linked online accounts.',
    apply(target) {
      /*
        Keyed by the canonical player key, so a profile page exists for every
        name in the database without anything having to be created first. A
        record only appears when the user states something Kingfisher could not
        have worked out — an alias, a FIDE id, an online account.

        `aliases` is multi-entry so "which identity owns this name" is an index
        lookup rather than a scan. It is never written automatically: deciding
        that two similar names are one person is the user's judgement, and
        guessing it wrong merges two players' careers.
      */
      target.createStore(STORE_NAMES.playerIdentities, { keyPath: 'id' }, [
        { name: 'aliases', keyPath: 'aliasKeys', multiEntry: true },
        { name: 'updatedAt', keyPath: 'updatedAt' },
      ]);
    },
  },
  {
    version: 15,
    description: 'Add installed reference packs, and the compressed chunks they are made of.',
    apply(target) {
      /*
        Two stores rather than one, because a pack's manifest and its data have
        opposite access patterns. The manifest is small, read on every start,
        and is what the catalog lists; the chunks are hundreds of records of a
        few hundred kilobytes each, read one at a time and never enumerated.
        Keeping them apart means opening the catalog does not touch a megabyte.

        Chunks are stored exactly as they were downloaded — gzip, unmodified —
        so the digest in the manifest still describes the bytes on disk. That
        is what makes an integrity check possible at any time rather than only
        during installation.
      */
      target.createStore(STORE_NAMES.referencePacks, { keyPath: 'id' }, [
        { name: 'installedAt', keyPath: 'installedAt' },
      ]);
      target.createStore(STORE_NAMES.referenceChunks, { keyPath: ['packId', 'chunkId'] }, [
        { name: 'packId', keyPath: 'packId' },
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
