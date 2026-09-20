import 'fake-indexeddb/auto';

import { describe, expect, it } from 'vitest';

import { DATABASE_VERSION, STORE_NAMES } from '../schema/migrations';
import { openPersistenceDatabaseAt, UPGRADED_ELSEWHERE_MESSAGE } from './database';

/**
 * Two tabs, one of them on a build with a newer schema.
 *
 * The older tab closes its connection so the upgrade can run — otherwise the
 * newer tab blocks on it for ever — and from then on every call from the
 * older tab fails. The failure must say what happened and what to do; the
 * browser's own "connection is closing" does neither.
 */
describe('a tab whose database was upgraded by another tab', () => {
  it('fails every later call with the remedy, not the browser message', async () => {
    const name = `kingfisher-upgrade-elsewhere-${Date.now()}`;
    const older = await openPersistenceDatabaseAt(DATABASE_VERSION, name);
    await older.put(STORE_NAMES.studies, { id: 's1', title: 'Kept', updatedAt: 1 });

    // A newer build in another tab asks for a higher version. The older
    // connection receives versionchange and closes itself.
    const newer = await openPersistenceDatabaseAt(DATABASE_VERSION + 1, name);

    await expect(older.get(STORE_NAMES.studies, 's1')).rejects.toThrow(UPGRADED_ELSEWHERE_MESSAGE);
    await expect(
      older.transaction([STORE_NAMES.studies], 'readwrite', async (tx) =>
        tx.put(STORE_NAMES.studies, { id: 's2', title: 'Lost', updatedAt: 2 }),
      ),
    ).rejects.toThrow(UPGRADED_ELSEWHERE_MESSAGE);

    // The newer tab, meanwhile, sees the work the older one saved.
    expect(await newer.get<{ title: string }>(STORE_NAMES.studies, 's1')).toMatchObject({
      title: 'Kept',
    });
    newer.close();
  });
});
