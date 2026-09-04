import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it } from 'vitest';

import { asFen } from '@/chess/types';
import { resetRepositorySingletonForTests } from '@/persistence/repositories';
import { DATABASE_NAME } from '@/persistence/schema/migrations';

import {
  addPolyglotBook,
  BookImportError,
  forgetLoadedBooksForTests,
  listBookRecords,
  probeBooks,
  removeBook,
  updateBook,
} from './registry';
import { KINGFISHER_BOOK_ID } from './kingfisher-book';
import { polyglotKey } from './polyglot';

/**
 * Two properties matter here and neither is about chess.
 *
 * A file the user picked is checked before it is stored, because a `.bin` that
 * is not a `.bin` would otherwise sit in the list answering nothing with no
 * explanation. And books are consulted in order and never merged — the first
 * one with an answer is the answer, and it is named.
 */

const START = asFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');

/** A one-entry Polyglot book for the starting position, playing 1.e4. */
function bookFor(fen: string, packedMove: number, weight: number): Uint8Array {
  const buffer = new ArrayBuffer(16);
  const view = new DataView(buffer);
  view.setBigUint64(0, polyglotKey(asFen(fen)), false);
  view.setUint16(8, packedMove, false);
  view.setUint16(10, weight, false);
  view.setUint32(12, 0, false);
  return new Uint8Array(buffer);
}

const E2E4 = (1 << 9) | (4 << 6) | (3 << 3) | 4;

beforeEach(async () => {
  resetRepositorySingletonForTests();
  forgetLoadedBooksForTests();
  // A fresh store per test. Resetting the singleton alone leaves the
  // fake-indexeddb database behind, so one test's books would be another's.
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(DATABASE_NAME);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
});

describe('the book list', () => {
  it('always contains the derived book, and puts an added one ahead of it', async () => {
    const first = await listBookRecords();
    expect(first.map((book) => book.id)).toEqual([KINGFISHER_BOOK_ID]);

    const added = await addPolyglotBook('My theory.bin', bookFor(START, E2E4, 100));
    const after = await listBookRecords();
    expect(after[0]?.id).toBe(added.id);
    expect(after.at(-1)?.id).toBe(KINGFISHER_BOOK_ID);
    expect(added.name).toBe('My theory');
    expect(added.entries).toBe(1);
  });
});

describe('adding a book', () => {
  it('refuses a file that is not a Polyglot book, and stores nothing', async () => {
    await expect(addPolyglotBook('notes.txt', new Uint8Array([1, 2, 3]))).rejects.toBeInstanceOf(
      BookImportError,
    );
    expect((await listBookRecords()).filter((book) => book.kind === 'polyglot')).toEqual([]);
  });

  it('refuses a file whose keys are not in order', async () => {
    const buffer = new ArrayBuffer(32);
    const view = new DataView(buffer);
    view.setBigUint64(0, 9n, false);
    view.setBigUint64(16, 1n, false);
    await expect(addPolyglotBook('backwards.bin', new Uint8Array(buffer))).rejects.toThrow(
      /not a Polyglot book/,
    );
  });
});

describe('probing', () => {
  it('answers from the first enabled book that knows the position', async () => {
    await addPolyglotBook('Mine.bin', bookFor(START, E2E4, 100));
    const result = await probeBooks(START);
    expect(result?.bookName).toBe('Mine');
    expect(result?.moves[0]?.uci).toBe('e2e4');
    expect(result?.moves[0]?.share).toBe(1);
  });

  it('skips a book that is switched off', async () => {
    const added = await addPolyglotBook('Mine.bin', bookFor(START, E2E4, 100));
    await updateBook(added.id, { enabled: false });
    // With no reference pack installed in this test, the derived book has
    // nothing either — so the honest answer is nothing at all.
    expect(await probeBooks(START)).toBeNull();
  });

  it('answers nothing for a position no book covers', async () => {
    await addPolyglotBook('Mine.bin', bookFor(START, E2E4, 100));
    const elsewhere = asFen('rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 1 1');
    expect(await probeBooks(elsewhere)).toBeNull();
  });

  it('forgets a removed book immediately', async () => {
    const added = await addPolyglotBook('Mine.bin', bookFor(START, E2E4, 100));
    expect(await probeBooks(START)).not.toBeNull();
    await removeBook(added.id);
    expect(await probeBooks(START)).toBeNull();
    expect((await listBookRecords()).map((book) => book.id)).toEqual([KINGFISHER_BOOK_ID]);
  });
});
