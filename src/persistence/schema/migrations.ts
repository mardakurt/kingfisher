export const DATABASE_NAME = 'kingfisher';
export const DATABASE_VERSION = 1;

export const STORE_NAMES = {
  studies: 'studies',
  chapters: 'chapters',
  games: 'games',
  positions: 'positions',
  drafts: 'drafts',
} as const;

export type StoreName = (typeof STORE_NAMES)[keyof typeof STORE_NAMES];

export interface MigrationTarget {
  hasStore(name: StoreName): boolean;
  createStore(
    name: StoreName,
    options: IDBObjectStoreParameters,
    indexes?: readonly { name: string; keyPath: string | readonly string[]; unique?: boolean }[],
  ): void;
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
];

export function applyMigrations(
  target: MigrationTarget,
  oldVersion: number,
  newVersion: number,
): void {
  for (const migration of MIGRATIONS) {
    if (migration.version > oldVersion && migration.version <= newVersion) migration.apply(target);
  }
}
