/**
 * Opening books, which are not the opening explorer.
 *
 * The distinction matters and the two are deliberately kept apart. An explorer
 * answers *what has been played here*, from a population of games you can name
 * and count. A book answers *what should be played here*, from somebody's
 * curated weights — and the somebody is the point: a book is an opinion, and
 * two books disagree in ways no amount of games can settle.
 *
 * So a book move is never mixed into the explorer's table. It is its own
 * panel, its own numbers, and every line names the book it came from.
 */

import type { Fen, San, Uci } from '@/chess/types';

export type BookKind = 'kingfisher' | 'polyglot';

export interface BookMove {
  readonly uci: Uci;
  /** Filled in by the panel, which has a position to convert against. */
  readonly san?: San;
  /** The book's own weight, in whatever units it uses. */
  readonly weight: number;
  /** That weight as a share of this position's total, 0–1. */
  readonly share: number;
  /** Games behind the weight, when the book is derived from games. */
  readonly games?: number;
}

export interface BookResult {
  readonly bookId: string;
  readonly bookName: string;
  readonly moves: readonly BookMove[];
}

export interface OpeningBookRecord {
  readonly id: string;
  readonly name: string;
  readonly kind: BookKind;
  readonly enabled: boolean;
  /** Lower is consulted first. Books are never merged; the order is a search. */
  readonly priority: number;
  readonly addedAt: number;
  /** Polyglot only: bytes and entry count. */
  readonly bytes?: number;
  readonly entries?: number;
  /** Where it came from, for the same reason a reference pack records it. */
  readonly origin: string;
}

export interface OpeningBook {
  readonly record: OpeningBookRecord;
  probe(fen: Fen, limit?: number): Promise<BookResult | null>;
}
