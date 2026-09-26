import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { QUERY_VERSION, type GameQuery } from '@/database/query/ast';

import { MemoryPersistenceDatabase } from '../indexeddb/memory';
import { LocalInboxDecisionRepository } from './inbox-decision-repository';
import { diffRuns, LocalSavedQueryRepository } from './saved-query-repository';

const najdorf: GameQuery = {
  version: QUERY_VERSION,
  where: { type: 'and', of: [{ type: 'eco', prefix: 'B9' }] },
};

const storage = new Map<string, string>();
beforeEach(() => {
  storage.clear();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  };
});
afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe('saved queries', () => {
  it('saves only a query that parses, and keeps its last run while the question is the same', async () => {
    const repository = new LocalSavedQueryRepository(new MemoryPersistenceDatabase());
    await expect(
      repository.save({
        name: 'Broken',
        query: { version: 1, where: { type: 'or', of: [] } } as never,
        source: 'local',
      }),
    ).rejects.toThrow(/cannot be saved/);
    const saved = await repository.save({ name: 'Najdorf', query: najdorf, source: 'local' }, 10);
    await repository.recordRun(saved.id, { selected: 5, found: 2, fingerprints: ['a', 'b'] }, 20);
    const renamed = await repository.save(
      { id: saved.id, name: 'Najdorf games', query: najdorf, source: 'local' },
      30,
    );
    expect(renamed.lastRun?.found).toBe(2);
    const changed = await repository.save(
      {
        id: saved.id,
        name: 'Najdorf games',
        query: { ...najdorf, where: { type: 'eco', prefix: 'B90' } },
        source: 'local',
      },
      40,
    );
    // A different question: the old run described something else.
    expect(changed.lastRun).toBeUndefined();
    expect(changed.revision).toBe(3);
  });

  it('says what a rerun found that the last run did not, and what has gone', async () => {
    const repository = new LocalSavedQueryRepository(new MemoryPersistenceDatabase());
    const saved = await repository.save({ name: 'Najdorf', query: najdorf, source: 'local' }, 10);
    const first = await repository.recordRun(
      saved.id,
      { selected: 9, found: 3, fingerprints: ['a', 'b', 'c'] },
      20,
    );
    expect(first.diff).toEqual({
      added: ['a', 'b', 'c'],
      removed: [],
      complete: true,
      since: null,
    });
    const second = await repository.recordRun(
      saved.id,
      { selected: 10, found: 3, fingerprints: ['b', 'c', 'd'] },
      30,
    );
    expect(second.diff).toEqual({ added: ['d'], removed: ['a'], complete: true, since: 20 });
    // A run that kept only part of what it found cannot give a complete diff.
    expect(diffRuns(second.record.lastRun, { fingerprints: ['b'], complete: false }).complete).toBe(
      false,
    );
  });

  it('carries the saved filters of earlier versions into the store, once', async () => {
    storage.set(
      'kingfisher.saved-database-filters.v1',
      JSON.stringify([
        {
          id: 'f1',
          name: 'Carlsen as White',
          source: 'local-collection',
          filters: { player: 'Carlsen, M', playerColor: 'w' },
          usedAt: 5,
        },
        { id: 'f2', name: '', source: 'local-collection', filters: {}, usedAt: 6 },
        { not: 'a filter' },
      ]),
    );
    const repository = new LocalSavedQueryRepository(new MemoryPersistenceDatabase());
    const listed = await repository.list();
    expect(listed.map((entry) => entry.name)).toEqual(['Carlsen as White']);
    expect(listed[0]!.query).toEqual({
      version: QUERY_VERSION,
      where: { type: 'and', of: [{ type: 'player', name: 'Carlsen, M', color: 'w' }] },
    });
    expect(await repository.list()).toHaveLength(1);
  });
});

describe('inbox decisions', () => {
  it('needs a reason to dismiss and a future date to snooze; reopening forgets the decision', async () => {
    const repository = new LocalInboxDecisionRepository(new MemoryPersistenceDatabase());
    await expect(
      repository.decide({ id: 'i1', repertoireId: 'r1', status: 'dismissed', evidence: 'e' }, 10),
    ).rejects.toThrow(/Say why/);
    await expect(
      repository.decide(
        { id: 'i1', repertoireId: 'r1', status: 'snoozed', evidence: 'e', snoozedUntil: 5 },
        10,
      ),
    ).rejects.toThrow(/future/);
    await repository.decide(
      { id: 'i1', repertoireId: 'r1', status: 'dismissed', reason: 'Blitz only', evidence: 'e' },
      10,
    );
    await repository.decide(
      { id: 'i2', repertoireId: 'r2', status: 'accepted', evidence: 'f' },
      10,
    );
    expect((await repository.forRepertoire('r1')).map((entry) => entry.reason)).toEqual([
      'Blitz only',
    ]);
    await repository.reopen('i1');
    expect(await repository.forRepertoire('r1')).toEqual([]);
  });
});
