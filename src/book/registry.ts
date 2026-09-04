'use client';

/**
 * The books this installation has.
 *
 * Kingfisher's own derived book always exists, because it needs nothing but
 * the reference that already ships. Everything else is a `.bin` the user
 * added, stored whole in IndexedDB with the record that describes it.
 *
 * Books are consulted in priority order and **never merged**. Two books
 * disagreeing about a position is the interesting case, and averaging their
 * weights would produce a number neither book's author would recognise. The
 * first book with an answer is the answer, and the panel names it.
 */

import type { Fen } from '@/chess/types';
import { getRepositories } from '@/persistence/repositories';
import { STORE_NAMES } from '@/persistence/schema/migrations';

import { KINGFISHER_BOOK_ID, kingfisherBook } from './kingfisher-book';
import { looksLikePolyglot, lookupPolyglot, polyglotKey } from './polyglot';
import type { BookResult, OpeningBook, OpeningBookRecord } from './types';

interface StoredBook extends OpeningBookRecord {
  readonly data?: Uint8Array;
}

/**
 * The built-in book, seeded into storage rather than special-cased in memory.
 *
 * Stored like any other so that enabling, disabling and reordering work the
 * same way for it — a built-in that could not be turned off, or that always
 * won, would be a book with an opinion the user could not overrule.
 *
 * Its priority is deliberately high: somebody who goes to the trouble of
 * adding a `.bin` wants *their* book consulted first, and the derived one as
 * the fallback for everything it does not cover.
 */
const KINGFISHER_RECORD: OpeningBookRecord = {
  id: KINGFISHER_BOOK_ID,
  name: 'Kingfisher Book',
  kind: 'kingfisher',
  enabled: true,
  priority: 100,
  addedAt: 0,
  origin: 'Derived from the installed reference sources; no separate download.',
};

/** A `.bin`, held in memory once rather than re-read from storage per probe. */
const loaded = new Map<string, DataView>();

function polyglotBook(record: OpeningBookRecord): OpeningBook {
  return {
    record,
    async probe(fen: Fen, limit = 12): Promise<BookResult | null> {
      let data = loaded.get(record.id);
      if (!data) {
        const repositories = await getRepositories();
        const stored = await repositories.raw.get<StoredBook>(STORE_NAMES.openingBooks, record.id);
        if (!stored?.data) return null;
        data = new DataView(
          stored.data.buffer.slice(
            stored.data.byteOffset,
            stored.data.byteOffset + stored.data.byteLength,
          ) as ArrayBuffer,
        );
        loaded.set(record.id, data);
      }

      const entries = lookupPolyglot(data, polyglotKey(fen));
      if (entries.length === 0) return null;
      const total = entries.reduce((sum, entry) => sum + entry.weight, 0) || 1;
      return {
        bookId: record.id,
        bookName: record.name,
        moves: entries.slice(0, limit).map((entry) => ({
          uci: entry.uci,
          weight: entry.weight,
          share: entry.weight / total,
        })),
      };
    },
  };
}

export async function listBookRecords(): Promise<readonly OpeningBookRecord[]> {
  const repositories = await getRepositories();
  const stored = await repositories.raw.getAll<StoredBook>(STORE_NAMES.openingBooks);
  if (!stored.some((book) => book.id === KINGFISHER_BOOK_ID)) {
    await repositories.raw.put<StoredBook>(STORE_NAMES.openingBooks, KINGFISHER_RECORD);
    stored.push(KINGFISHER_RECORD);
  }
  return stored
    .map(({ data: _data, ...record }) => record)
    .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
}

export async function openingBooks(): Promise<readonly OpeningBook[]> {
  return (await listBookRecords()).map((record) =>
    record.kind === 'kingfisher' ? kingfisherBook(record) : polyglotBook(record),
  );
}

/**
 * The first enabled book with an answer.
 *
 * Deliberately not "every book's answer combined". See the note at the top of
 * this file: a merged weight is a number no book's author would recognise.
 */
export async function probeBooks(fen: Fen): Promise<BookResult | null> {
  for (const book of await openingBooks()) {
    if (!book.record.enabled) continue;
    const result = await book.probe(fen);
    if (result) return result;
  }
  return null;
}

export class BookImportError extends Error {
  constructor(
    message: string,
    readonly remedy: string,
  ) {
    super(message);
    this.name = 'BookImportError';
  }
}

/**
 * Add a `.bin`, after checking it is one.
 *
 * The shape check is cheap and worth doing: a file of the wrong size, or one
 * whose keys are not ascending, is not a Polyglot book, and storing it would
 * mean every probe silently returning nothing with no explanation.
 */
export async function addPolyglotBook(name: string, bytes: Uint8Array): Promise<OpeningBookRecord> {
  const data = new DataView(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  );
  if (!looksLikePolyglot(data)) {
    throw new BookImportError(
      `“${name}” is not a Polyglot book.`,
      'A .bin book is a whole number of 16-byte entries, sorted by position key. ' +
        'Nothing was added.',
    );
  }

  const repositories = await getRepositories();
  const existing = await listBookRecords();
  const record: OpeningBookRecord = {
    id: `book-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.replace(/\.bin$/i, '').trim() || 'Opening book',
    kind: 'polyglot',
    enabled: true,
    // Before the derived book, which sits at 100: a user who adds a book means
    // it to be used.
    priority: existing.filter((book) => book.kind === 'polyglot').length + 1,
    addedAt: Date.now(),
    bytes: bytes.byteLength,
    entries: bytes.byteLength / 16,
    origin: 'A Polyglot .bin you added from this machine.',
  };
  await repositories.raw.put<StoredBook>(STORE_NAMES.openingBooks, { ...record, data: bytes });
  return record;
}

export async function updateBook(
  id: string,
  change: Partial<Pick<OpeningBookRecord, 'enabled' | 'priority' | 'name'>>,
): Promise<void> {
  const repositories = await getRepositories();
  const stored = await repositories.raw.get<StoredBook>(STORE_NAMES.openingBooks, id);
  if (!stored) return;
  await repositories.raw.put<StoredBook>(STORE_NAMES.openingBooks, { ...stored, ...change });
}

export async function removeBook(id: string): Promise<void> {
  const repositories = await getRepositories();
  await repositories.raw.delete(STORE_NAMES.openingBooks, id);
  loaded.delete(id);
}

export function forgetLoadedBooksForTests(): void {
  loaded.clear();
}
