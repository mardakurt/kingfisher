/**
 * A journal collision on a database that enforces unique indexes.
 *
 * The in-memory database used by the rest of the backup tests does not.
 * Two devices journaling the same game store two ids and one fingerprint;
 * putting the second row throws ConstraintError and, without the collision
 * being cleared first, rolls the entire restore back — including a study
 * the backup was bringing with it.
 */
import 'fake-indexeddb/auto';

import { describe, expect, it } from 'vitest';

import { createWorkspaceBackup, restoreWorkspaceBackup, type WorkspaceBackup } from './backup';
import { openPersistenceDatabaseAt, type PersistenceDatabase } from './indexeddb/database';
import { createMemoryRepositories } from './repositories';
import { DATABASE_VERSION, STORE_NAMES } from './schema/migrations';

const NOW = Date.UTC(2026, 8, 1, 12);

function journal(id: string, fingerprint: string, learningPoint: string) {
  return {
    id,
    fingerprint,
    title: 'Round 3',
    learningPoint,
    createdAt: NOW,
    updatedAt: NOW,
    revision: 0,
  };
}

async function openFresh(): Promise<PersistenceDatabase> {
  return openPersistenceDatabaseAt(
    DATABASE_VERSION,
    `kingfisher-journal-merge-${crypto.randomUUID()}`,
  );
}

async function backupWithJournal(
  entries: readonly ReturnType<typeof journal>[],
): Promise<WorkspaceBackup> {
  const source = createMemoryRepositories();
  await source.studies.create({ title: 'From the other machine' });
  const backup = await createWorkspaceBackup(source.raw, {}, { now: NOW });
  return {
    ...backup,
    stores: { ...backup.stores, [STORE_NAMES.journal]: entries },
  };
}

describe('merging a journal fingerprint that already exists', () => {
  it('lands the backup study and keeps the backup journal entry', async () => {
    const database = await openFresh();
    try {
      await database.put(STORE_NAMES.studies, {
        id: 'local-study',
        title: 'Kept locally',
        createdAt: NOW,
        updatedAt: NOW,
      });
      await database.put(
        STORE_NAMES.journal,
        journal('local-journal', 'same-game', 'Written here'),
      );

      await restoreWorkspaceBackup(
        database,
        await backupWithJournal([journal('other-journal', 'same-game', 'Written there')]),
        'merge',
      );

      const studies = await database.getAll<{ title: string }>(STORE_NAMES.studies);
      expect(studies.map((entry) => entry.title).sort()).toEqual([
        'From the other machine',
        'Kept locally',
      ]);
      const journals = await database.getAll<{
        id: string;
        fingerprint: string;
        learningPoint: string;
      }>(STORE_NAMES.journal);
      expect(journals).toEqual([
        expect.objectContaining({
          id: 'other-journal',
          fingerprint: 'same-game',
          learningPoint: 'Written there',
        }),
      ]);
    } finally {
      database.close();
    }
  });

  it('rolls the whole merge back when the backup itself collides on a fingerprint', async () => {
    const database = await openFresh();
    try {
      await database.put(STORE_NAMES.studies, {
        id: 'local-study',
        title: 'Kept locally',
        createdAt: NOW,
        updatedAt: NOW,
      });
      await database.put(
        STORE_NAMES.journal,
        journal('local-journal', 'same-game', 'Written here'),
      );

      await expect(
        restoreWorkspaceBackup(
          database,
          await backupWithJournal([
            journal('other-a', 'same-game', 'One'),
            journal('other-b', 'same-game', 'Two'),
          ]),
          'merge',
        ),
      ).rejects.toThrow();

      const studies = await database.getAll<{ title: string }>(STORE_NAMES.studies);
      expect(studies.map((entry) => entry.title)).toEqual(['Kept locally']);
      const journals = await database.getAll<{ id: string; learningPoint: string }>(
        STORE_NAMES.journal,
      );
      expect(journals).toEqual([
        expect.objectContaining({ id: 'local-journal', learningPoint: 'Written here' }),
      ]);
    } finally {
      database.close();
    }
  });
});
