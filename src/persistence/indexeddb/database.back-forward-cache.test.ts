import 'fake-indexeddb/auto';

import { afterEach, describe, expect, it } from 'vitest';

import { DATABASE_VERSION, STORE_NAMES } from '../schema/migrations';
import { openPersistenceDatabaseAt, SUSPENDED_MESSAGE } from './database';

/**
 * A page Safari keeps in its back-forward cache is frozen with any IndexedDB
 * transaction still open, and that transaction's lock is held for as long as
 * the page stays cached: the next page of the same origin waited for ever on
 * the `drafts` store, lost the edit made before leaving, said "saved", and
 * stayed at "saving…" (real Safari 27, `scripts/safari-acceptance.mjs`).
 *
 * The browser part cannot run here; what can is the contract: entering the
 * cache aborts what is open and refuses new work, and being shown again
 * resumes it. The window is a bare event target carrying those two events.
 */
const page = new EventTarget();
const transition = (type: 'pagehide' | 'pageshow', persisted: boolean) =>
  page.dispatchEvent(Object.assign(new Event(type), { persisted }));

(globalThis as { window?: unknown }).window = page;
afterEach(() => transition('pageshow', true));

describe('a page entering the back-forward cache', () => {
  it('aborts the transaction it has open, so no lock outlives it', async () => {
    const database = await openPersistenceDatabaseAt(
      DATABASE_VERSION,
      `kf-bfcache-${Date.now()}-a`,
    );
    const writing = database.transaction([STORE_NAMES.drafts], 'readwrite', async (tx) => {
      await tx.put(STORE_NAMES.drafts, { id: 'active', note: 'mid-write' });
    });
    transition('pagehide', true);
    await expect(writing).rejects.toBeTruthy();
    transition('pageshow', true);
    expect(await database.get(STORE_NAMES.drafts, 'active')).toBeUndefined();
    database.close();
  });

  it('opens nothing new until it is shown again, then works as before', async () => {
    const database = await openPersistenceDatabaseAt(
      DATABASE_VERSION,
      `kf-bfcache-${Date.now()}-b`,
    );
    transition('pagehide', true);
    await expect(database.get(STORE_NAMES.drafts, 'active')).rejects.toThrow(SUSPENDED_MESSAGE);
    await expect(database.put(STORE_NAMES.drafts, { id: 'active' })).rejects.toThrow(
      SUSPENDED_MESSAGE,
    );
    transition('pageshow', true);
    await database.put(STORE_NAMES.drafts, { id: 'active', note: 'after' });
    expect(await database.get(STORE_NAMES.drafts, 'active')).toMatchObject({ note: 'after' });
    database.close();
  });

  it('leaves an ordinary unload alone: a page that is not cached may finish its write', async () => {
    const database = await openPersistenceDatabaseAt(
      DATABASE_VERSION,
      `kf-bfcache-${Date.now()}-c`,
    );
    const writing = database.put(STORE_NAMES.drafts, { id: 'active', note: 'kept' });
    transition('pagehide', false);
    await writing;
    expect(await database.get(STORE_NAMES.drafts, 'active')).toMatchObject({ note: 'kept' });
    database.close();
  });
});
