'use client';

/**
 * A book made out of what strong players actually played.
 *
 * Most opening books are somebody's hand-tuned weights, and a user who has
 * never installed one has no book at all. Kingfisher already ships a reference
 * source built from a million elite games, and "how often was this move
 * chosen, by players rated this highly" is a perfectly good weight — arguably
 * a more defensible one than an anonymous `.bin`, because you can ask what
 * population produced it and get an answer.
 *
 * So this is derived, not authored. It carries no opinion Kingfisher does not
 * already publish, and it says exactly which reference source it came from.
 */

import { positionKey } from '@/chess/fen';
import type { Fen, Uci } from '@/chess/types';

import { readyPackReaders } from '@/reference/manager';

import type { BookResult, OpeningBook, OpeningBookRecord } from './types';

export const KINGFISHER_BOOK_ID = 'kingfisher-book';

/**
 * Below this share of a position's games, a move is noise rather than theory.
 *
 * A book's job is to say what to play, so an entry played in one game out of
 * four thousand does not belong in it — that is a fact for the explorer, which
 * is where it stays.
 */
const MINIMUM_SHARE = 0.02;

export function kingfisherBook(record: OpeningBookRecord): OpeningBook {
  return {
    record,
    async probe(fen: Fen, limit = 12): Promise<BookResult | null> {
      const key = positionKey(fen);
      for (const reader of readyPackReaders()) {
        const entry = await reader.position(key);
        if (!entry || entry.moves.length === 0) continue;
        const total = entry.moves.reduce((sum, move) => sum + move.games, 0);
        if (total === 0) continue;

        const moves = entry.moves
          .filter((move) => move.games / total >= MINIMUM_SHARE)
          .slice(0, limit)
          .map((move) => ({
            uci: move.uci as Uci,
            weight: move.games,
            share: move.games / total,
            games: move.games,
          }));
        if (moves.length === 0) continue;

        return {
          bookId: record.id,
          bookName: `${record.name} (${reader.manifest.name})`,
          moves,
        };
      }
      return null;
    },
  };
}
