/**
 * The collections kept in this browser beside My games, as sync sources:
 * their names (`browserCollections`) and their games (`collectionGames`).
 *
 * Switched on with My games (`syncMyGames`), off by default and per device,
 * for the same reason: games are the one kind of work that can be enormous,
 * so the newest `COLLECTION_GAME_SYNC_LIMIT` games across every collection
 * travel, not all of them.
 *
 * Additive, both of them, as My games is (`games-source.ts`). A collection
 * deleted here, or a game removed from one, is not sent as a deletion:
 * mirroring deletions would let one device empty every other's collections.
 * A rename travels — it is a change to the record, not a removal.
 *
 * A collection keeps its key everywhere (`adoptBrowserCollection`), so a
 * game sent from "Club" on one device lands in "Club" on the next, and a
 * game that arrives before its collection's name opens the collection under
 * a placeholder the name then replaces.
 */

import {
  adoptBrowserCollection,
  browserCollectionRepositories,
  getBrowserCollection,
  listBrowserCollections,
  renameBrowserCollection,
  type BrowserCollectionRecord,
} from '@/persistence/browser-collections';
import type { GameRepository } from '@/persistence/types';

import { isSyncedGame, storeSyncedGame, type SyncedGame } from './games-source';
import type { LocalSource } from './local-sources';

export const COLLECTIONS_STORE = 'browserCollections';
export const COLLECTION_GAMES_STORE = 'collectionGames';
/** Games across every collection, newest first. */
export const COLLECTION_GAME_SYNC_LIMIT = 2_000;
const PLACEHOLDER = 'Synced collection';

/** Where the collections live: this browser, or a test's memory. */
export interface CollectionStore {
  list(): Promise<readonly BrowserCollectionRecord[]>;
  get(key: string): Promise<BrowserCollectionRecord | null>;
  adopt(record: BrowserCollectionRecord): Promise<BrowserCollectionRecord>;
  rename(key: string, name: string): Promise<unknown>;
  games(key: string): Promise<GameRepository>;
}

export const browserCollectionStore: CollectionStore = {
  list: listBrowserCollections,
  get: getBrowserCollection,
  adopt: adoptBrowserCollection,
  rename: renameBrowserCollection,
  games: async (key) => (await browserCollectionRepositories(key)).games,
};

const KEY = /^[\w-]{1,80}$/;

export const isSyncedCollection = (value: unknown): value is BrowserCollectionRecord =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as BrowserCollectionRecord).key === 'string' &&
  KEY.test((value as BrowserCollectionRecord).key) &&
  typeof (value as BrowserCollectionRecord).name === 'string' &&
  (value as BrowserCollectionRecord).name.trim().length > 0 &&
  (value as BrowserCollectionRecord).name.length <= 200 &&
  Number.isFinite((value as BrowserCollectionRecord).createdAt);

export interface SyncedCollectionGame extends SyncedGame {
  readonly collection: string;
}

export const isSyncedCollectionGame = (value: unknown): value is SyncedCollectionGame =>
  isSyncedGame(value) &&
  typeof (value as SyncedCollectionGame).collection === 'string' &&
  KEY.test((value as SyncedCollectionGame).collection);

/** `<collection key>/<game id>`: one game can be in two collections. */
const gameKey = (collection: string, id: string) => `${collection}/${id}`;

export function collectionsSource(store: CollectionStore = browserCollectionStore): LocalSource {
  return {
    store: COLLECTIONS_STORE,
    additive: true,
    async list() {
      return (await store.list()).map((record) => ({ key: record.key, value: { ...record } }));
    },
    async get(key) {
      const record = await store.get(key);
      return record ? { ...record } : null;
    },
    async put(key, value) {
      if (!isSyncedCollection(value) || value.key !== key) return [];
      const here = await store.get(key);
      if (!here) {
        await store.adopt(value);
      } else if (here.name !== value.name) {
        // A rename made elsewhere; if the name is taken here, this one keeps its own.
        await store.rename(key, value.name).catch(() => undefined);
      }
      return [];
    },
    async delete() {
      // Never: a collection is deleted only on the device where it was deleted.
    },
    isValid: isSyncedCollection,
  };
}

export function collectionGamesSource(
  store: CollectionStore = browserCollectionStore,
): LocalSource {
  return {
    store: COLLECTION_GAMES_STORE,
    additive: true,
    async list() {
      // The newest games across every collection, then their text.
      const newest: { collection: string; id: string; importedAt: number }[] = [];
      for (const record of await store.list()) {
        const games = await store.games(record.key);
        const found = await games.search({
          sortBy: 'importedAt',
          sortDirection: 'desc',
          limit: COLLECTION_GAME_SYNC_LIMIT,
        });
        for (const game of found.games) {
          newest.push({ collection: record.key, id: game.id, importedAt: game.importedAt });
        }
      }
      newest.sort((a, b) => b.importedAt - a.importedAt);
      const chosen = newest.slice(0, COLLECTION_GAME_SYNC_LIMIT);
      const records = [];
      for (const record of await store.list()) {
        const ids = chosen.filter((entry) => entry.collection === record.key).map((e) => e.id);
        if (ids.length === 0) continue;
        for (const game of await (await store.games(record.key)).getMany(ids)) {
          records.push({
            key: gameKey(record.key, game.id),
            value: {
              collection: record.key,
              id: game.id,
              pgn: game.normalizedPgn,
            } satisfies SyncedCollectionGame,
          });
        }
      }
      return records;
    },
    async get(key) {
      const slash = key.indexOf('/');
      if (slash <= 0) return null;
      const collection = key.slice(0, slash);
      if (!(await store.get(collection))) return null;
      const game = await (await store.games(collection)).get(key.slice(slash + 1));
      return game
        ? ({ collection, id: game.id, pgn: game.normalizedPgn } satisfies SyncedCollectionGame)
        : null;
    },
    async put(key, value) {
      if (!isSyncedCollectionGame(value) || key !== gameKey(value.collection, value.id)) {
        return [];
      }
      // The game may arrive before its collection's name does.
      if (!(await store.get(value.collection))) {
        await store.adopt({ key: value.collection, name: PLACEHOLDER, createdAt: Date.now() });
      }
      await storeSyncedGame(await store.games(value.collection), value);
      return [];
    },
    async delete() {
      // Never, as for My games.
    },
    isValid: isSyncedCollectionGame,
  };
}
