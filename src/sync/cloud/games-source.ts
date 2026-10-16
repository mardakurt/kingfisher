/**
 * "My games" as a sync source: a person's own game collection, carried
 * between their devices when they switch it on.
 *
 * Off by default and per device (`syncMyGames`), because games are the one
 * kind of work that can be enormous: an account holds one shared database,
 * and a hundred thousand imported games on one profile would fill it for
 * everybody. So the newest `GAME_SYNC_LIMIT` games travel, and the switch
 * says so.
 *
 * Additive, not mirrored. A game's id is derived from its content
 * (`game-<fingerprint>`, `normalizeGame`), so the same game is the same row
 * on every device and can never be uploaded twice; but a game that stops
 * being listed — deleted here, or pushed past the limit by newer imports, or
 * the switch turned off — is not sent as a deletion. Mirroring deletions
 * would let a full collection on one device, or a switch turned off on
 * another, delete games from the rest. Deleting a game removes it from the
 * device it was deleted on, and the switch says that too.
 */

import { parsePgn } from '@/chess/pgn';
import { indexGame, normalizeGame } from '@/persistence/prepare-game';
import type { PersistenceDatabase } from '@/persistence/indexeddb/database';
import { fromDatabase } from '@/persistence/repositories';

import type { LocalSource } from './local-sources';

export const MY_GAMES_STORE = 'myGames';
export const GAME_SYNC_LIMIT = 2_000;

/** What travels: the game's id and its PGN. Nothing device-specific. */
export interface SyncedGame {
  readonly id: string;
  readonly pgn: string;
}

export const isSyncedGame = (value: unknown): value is SyncedGame =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as SyncedGame).id === 'string' &&
  (value as SyncedGame).id.startsWith('game-') &&
  typeof (value as SyncedGame).pgn === 'string' &&
  (value as SyncedGame).pgn.length > 0 &&
  // A game, not a database: one PGN game is a few kilobytes.
  (value as SyncedGame).pgn.length < 200_000;

export function gamesSource(database: PersistenceDatabase): LocalSource {
  const games = fromDatabase(database).games;
  return {
    store: MY_GAMES_STORE,
    additive: true,
    async list() {
      const newest = await games.search({
        sortBy: 'importedAt',
        sortDirection: 'desc',
        limit: GAME_SYNC_LIMIT,
      });
      const full = await games.getMany(newest.games.map((game) => game.id));
      return full.map((game) => ({
        key: game.id,
        value: { id: game.id, pgn: game.normalizedPgn } satisfies SyncedGame,
      }));
    },
    async get(key) {
      const game = await games.get(key);
      return game ? ({ id: game.id, pgn: game.normalizedPgn } satisfies SyncedGame) : null;
    },
    async put(key, value) {
      if (!isSyncedGame(value) || value.id !== key) return [];
      const tree = parsePgn(value.pgn).games[0]?.tree;
      if (!tree) return [];
      /*
        The sender's identity and text, kept exactly. Re-deriving them here
        would not reproduce them — a stored PGN gains the Seven Tag Roster's
        "?" placeholders, so it fingerprints differently from the PGN first
        imported — and a game stored under a new id would travel back as a
        new game, and its text back as a change, on every sync.
      */
      const game = {
        ...normalizeGame(tree),
        id: key,
        fingerprint: key.slice('game-'.length),
        normalizedPgn: value.pgn,
      };
      await games.persist(game, indexGame(game));
      return [];
    },
    async delete() {
      // Never: a game is removed only on the device where it was deleted.
    },
    isValid: isSyncedGame,
  };
}
