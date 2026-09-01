/// <reference lib="webworker" />

import { positionKey } from '@/chess/fen';
import type { Fen } from '@/chess/types';
import { aggregateLocalExplorer } from '@/database/local-aggregate';
import type { ExplorerFilters } from '@/database/types';
import { DATABASE_NAME, DATABASE_VERSION, STORE_NAMES } from '@/persistence/schema/migrations';
import type { GameSummary, PositionRecord } from '@/persistence/types';

interface ExploreRequest {
  readonly fen: Fen;
  readonly filters: ExplorerFilters;
  readonly limit: number;
}

const BULK_JOIN_THRESHOLD = 500;

self.onmessage = (event: MessageEvent<ExploreRequest>) => {
  void explore(event.data)
    .then((result) => self.postMessage({ ok: true, result }))
    .catch((error: unknown) =>
      self.postMessage({
        ok: false,
        error: error instanceof Error ? error.message : 'Local exploration failed.',
      }),
    );
};

async function explore(request: ExploreRequest) {
  const database = await openDatabase();
  try {
    const positions = await getPositions(database, positionKey(request.fen));
    const ids = [...new Set(positions.map((position) => position.gameId))];
    const games = await getGames(database, ids);
    return aggregateLocalExplorer(request.fen, positions, games, request.filters, request.limit);
  } finally {
    database.close();
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error ?? new Error('Could not open local chess storage.'));
    // The main thread opens and migrates the database before starting this
    // worker. An upgrade here means that contract was broken; never invent a
    // partial schema from inside a query worker.
    open.onupgradeneeded = () => {
      open.transaction?.abort();
      reject(new Error('The local database must be initialized before exploration.'));
    };
  });
}

function getPositions(database: IDBDatabase, key: string): Promise<PositionRecord[]> {
  const request = database
    .transaction(STORE_NAMES.positions, 'readonly')
    .objectStore(STORE_NAMES.positions)
    .index('positionKey')
    .getAll(key);
  return requested(request) as Promise<PositionRecord[]>;
}

async function getGames(database: IDBDatabase, ids: readonly string[]): Promise<GameSummary[]> {
  const transaction = database.transaction(STORE_NAMES.games, 'readonly');
  const store = transaction.objectStore(STORE_NAMES.games);
  if (ids.length > BULK_JOIN_THRESHOLD) {
    const included = new Set(ids);
    const all = (await requested(store.getAll())) as GameSummary[];
    return all.filter((game) => included.has(game.id));
  }
  const loaded: GameSummary[] = [];
  for (const id of ids) {
    const game = (await requested(store.get(id))) as GameSummary | undefined;
    if (game) loaded.push(game);
  }
  return loaded;
}

function requested<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

export {};
