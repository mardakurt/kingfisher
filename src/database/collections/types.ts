/**
 * A collection of games, whichever store it lives in.
 *
 * Kingfisher had two ways to hold games — an IndexedDB collection in the
 * browser and any number of SQLite files behind the companion — and no way to
 * move a game from one to the other. Import, delete, clear: that was the whole
 * vocabulary. A player with a reference archive, a tournament folder and their
 * own games could not copy fifty games from the first into the third without
 * exporting a PGN and importing it again.
 *
 * This is the interface that makes copy, move, merge and cross-collection
 * duplicate search one implementation instead of four. Four rules shape it:
 *
 * **Everything is paged.** No operation reads a collection into memory. A copy
 * of half a million games is a sequence of bounded pages, which is what lets it
 * report progress, be cancelled, and leave a defined state behind when it is.
 *
 * **The unit of transfer is a stored game, not a PGN.** A game already carries
 * its normalized movetext, its position index and its classification; sending
 * those rather than re-deriving them at the far end is both faster and safer,
 * because a re-derived fingerprint that differs by one byte is a duplicate the
 * destination cannot recognise.
 *
 * **Fingerprints are asked about, never assumed.** `have` is the primitive
 * behind the merge preview, the verification a move does before it deletes
 * anything, and duplicate search. All three need the same question answered
 * cheaply, from an index, without reading a game.
 *
 * **Writes report duplicates rather than failing on them.** Both stores make
 * fingerprint uniqueness a constraint, so copying a game that is already in the
 * destination is a normal outcome with a count, not an error.
 */

import type { GameTree } from '@/chess/tree/types';
import type { GameSearchQuery, GameSummary, PositionRecord } from '@/persistence/types';

export type CollectionKind = 'indexeddb' | 'sqlite';

export interface GameCollectionRef {
  /** `local` for the browser's collection, `sqlite:<key>` for a companion file. */
  readonly id: string;
  readonly kind: CollectionKind;
  readonly name: string;
}

/** What a collection can say about itself without being queried. */
export interface CollectionFacts extends GameCollectionRef {
  readonly games: number | null;
  readonly bytes: number | null;
  readonly modifiedAt: number | null;
  /** File name for SQLite, or how the browser stores it. */
  readonly location: string;
  /** True when this collection is the explorer's default source. */
  readonly reference: boolean;
}

/**
 * One game, complete enough to store in a different collection.
 *
 * `tree` is optional because only IndexedDB stores one; a SQLite source sends
 * movetext and the destination parses it if it needs a tree. Positions always
 * travel, so structural identities computed at import are never recomputed —
 * and never silently recomputed *differently* by a later build.
 */
export interface TransferGame {
  readonly summary: Omit<GameSummary, 'id'> & { readonly id?: string };
  readonly pgn: string;
  readonly positions: readonly Omit<PositionRecord, 'id' | 'gameId'>[];
  readonly tree?: GameTree;
}

export interface TransferPage {
  readonly games: readonly TransferGame[];
  /** Cursor for the next page, or null when the walk reached the end. */
  readonly nextAfter: string | null;
}

/** Enough of a game to decide whether two collections hold the same one. */
export interface DuplicateKey {
  readonly id: string;
  readonly fingerprint: string;
  readonly white: string;
  readonly black: string;
  readonly date?: string;
  readonly event?: string;
  readonly round?: string;
  readonly result: string;
}

export interface DuplicateKeyPage {
  readonly games: readonly DuplicateKey[];
  readonly nextAfter: string | null;
}

export interface WriteOutcome {
  readonly written: number;
  readonly duplicates: number;
  /** Fingerprints the destination now holds, whether written now or already there. */
  readonly present: readonly string[];
}

export interface GameCollection {
  readonly ref: GameCollectionRef;
  count(): Promise<number>;
  /**
   * A page of games, optionally narrowed by the same query the game list uses.
   *
   * `after` is a store-defined cursor, opaque to callers: a primary key for
   * both current implementations, and never an offset, so a copy of a large
   * collection stays linear.
   */
  read(query: GameSearchQuery | null, after: string | null, limit: number): Promise<TransferPage>;
  /** Which of `fingerprints` this collection already holds. */
  have(fingerprints: readonly string[]): Promise<ReadonlySet<string>>;
  write(games: readonly TransferGame[]): Promise<WriteOutcome>;
  /** Remove by fingerprint, which is the one identity both stores share. */
  removeByFingerprint(fingerprints: readonly string[]): Promise<number>;
  /** Identity keys for every game, paged, for duplicate search. */
  duplicateKeys(after: string | null, limit: number): Promise<DuplicateKeyPage>;
}

/**
 * The coarse identity two annotated copies of one game share.
 *
 * Deliberately not the fingerprint. A fingerprint covers the normalized
 * movetext, so adding a single comment to a game produces a different one —
 * which is correct for "are these bytes the same game" and useless for "have I
 * got this game twice with different notes on it". This key answers the second
 * question from metadata alone, which both stores can produce without reading a
 * game.
 *
 * It is a *candidate* key, and is treated as one everywhere: two games sharing
 * it are shown to the user as possible duplicates with differing annotations,
 * and are never removed automatically. Same players, same date, same event,
 * same round and same result is overwhelmingly one game — but "overwhelmingly"
 * is not the standard for deleting somebody's analysis.
 */
export const metadataKey = (game: DuplicateKey): string =>
  [
    game.white.trim().toLowerCase(),
    game.black.trim().toLowerCase(),
    game.date ?? '',
    (game.event ?? '').trim().toLowerCase(),
    game.round ?? '',
    game.result,
    // A unit separator, not an empty join: concatenating fields lets
    // "Ivanchuk"+"Karjakin" collide with "Ivanchu"+"kKarjakin", and a
    // duplicate group built on a collision like that would offer to delete a
    // game that is a duplicate of nothing.
  ].join('\u001f');
