import { describe, expect, it } from 'vitest';

import { START_FEN, positionKey } from '@/chess/fen';
import { asSan, asUci } from '@/chess/types';
import { StaleTrainingSetWriteError } from '@/persistence/domain';
import { createMemoryRepositories } from '@/persistence/repositories';
import { matchesQuery } from './training-set-repository';
import type { TrainingItemRecord } from '@/persistence/domain';
import { newSchedule } from '@/training/schedule';

const KEY = positionKey(START_FEN);

const makeItem = async (
  repositories: ReturnType<typeof createMemoryRepositories>,
  prompt: string,
  tags: readonly string[] = [],
) =>
  repositories.training.create({
    mode: 'best-move',
    positionKey: KEY,
    fen: START_FEN,
    sideToMove: 'w',
    prompt,
    solutionUci: [asUci('e2e4')],
    solutionSan: [asSan('e4')],
    candidatesUci: [],
    plans: [],
    tags: [...tags],
  });

describe('static training sets', () => {
  it('replaces a review session without retaining old prompts or changing their schedules', async () => {
    const repositories = createMemoryRepositories();
    const one = await makeItem(repositories, 'Earlier session');
    const two = await makeItem(repositories, 'Selected now');
    const set = await repositories.trainingSets.create({
      name: 'Review',
      kind: 'static',
      itemIds: [one.id, two.id],
    });
    const replaced = await repositories.trainingSets.replaceItems(set.id, set.revision, [
      two.id,
      two.id,
    ]);
    expect(replaced.itemIds).toEqual([two.id]);
    expect(await repositories.trainingSets.resolve(set.id)).toEqual([two]);
    expect(await repositories.training.get(one.id)).toEqual(one);
    expect(await repositories.training.get(two.id)).toEqual(two);
    await expect(
      repositories.trainingSets.replaceItems(set.id, set.revision, [one.id]),
    ).rejects.toBeInstanceOf(StaleTrainingSetWriteError);
  });
  it('holds membership rather than copies, and resolves to the real items', async () => {
    const repositories = createMemoryRepositories();
    const one = await makeItem(repositories, 'Najdorf recall 1');
    const two = await makeItem(repositories, 'Najdorf recall 2');
    const set = await repositories.trainingSets.create({ name: 'Najdorf recall', kind: 'static' });
    const filled = await repositories.trainingSets.addItems(set.id, set.revision, [
      one.id,
      two.id,
      one.id,
    ]);

    expect(filled.itemIds).toEqual([one.id, two.id]);
    const resolved = await repositories.trainingSets.resolve(set.id);
    expect(resolved.map((item) => item.prompt)).toEqual(['Najdorf recall 1', 'Najdorf recall 2']);
    // The items themselves are untouched: one schedule, one history.
    expect(await repositories.training.list()).toHaveLength(2);
  });

  it('drops a deleted item from the resolved list without breaking the set', async () => {
    const repositories = createMemoryRepositories();
    const one = await makeItem(repositories, 'Kept');
    const two = await makeItem(repositories, 'Deleted later');
    const set = await repositories.trainingSets.create({
      name: 'Trade decisions',
      kind: 'static',
      itemIds: [one.id, two.id],
    });
    await repositories.training.delete(two.id);

    const resolved = await repositories.trainingSets.resolve(set.id);
    expect(resolved.map((item) => item.prompt)).toEqual(['Kept']);
  });

  it('refuses a second set with the same name', async () => {
    const repositories = createMemoryRepositories();
    await repositories.trainingSets.create({ name: 'Rook endings', kind: 'static' });
    await expect(
      repositories.trainingSets.create({ name: '  Rook endings  ', kind: 'static' }),
    ).rejects.toThrow(/already exists/);
  });

  it('refuses a stale write', async () => {
    const repositories = createMemoryRepositories();
    const set = await repositories.trainingSets.create({ name: 'Calculation', kind: 'static' });
    await repositories.trainingSets.rename(set.id, set.revision, 'Calculation errors');
    await expect(
      repositories.trainingSets.rename(set.id, set.revision, 'Something else'),
    ).rejects.toBeInstanceOf(StaleTrainingSetWriteError);
  });

  it('keeps the items when the set is deleted', async () => {
    const repositories = createMemoryRepositories();
    const item = await makeItem(repositories, 'Survives');
    const set = await repositories.trainingSets.create({
      name: 'Temporary',
      kind: 'static',
      itemIds: [item.id],
    });
    await repositories.trainingSets.delete(set.id);
    expect(await repositories.training.list()).toHaveLength(1);
  });
});

describe('dynamic training sets', () => {
  it('decides membership from the query when it is opened', async () => {
    const repositories = createMemoryRepositories();
    await makeItem(repositories, 'A trade question', ['trade-decision']);
    await makeItem(repositories, 'A calculation question', ['calculation']);
    const set = await repositories.trainingSets.create({
      name: 'Trade decisions',
      kind: 'dynamic',
      query: { themes: ['trade-decision'] },
    });

    expect((await repositories.trainingSets.resolve(set.id)).map((item) => item.prompt)).toEqual([
      'A trade question',
    ]);

    // A new item that matches joins without anyone editing the set.
    await makeItem(repositories, 'Another trade question', ['trade-decision']);
    expect(await repositories.trainingSets.resolve(set.id)).toHaveLength(2);
  });

  it('will not take hand-picked members', async () => {
    const repositories = createMemoryRepositories();
    const item = await makeItem(repositories, 'Anything');
    const set = await repositories.trainingSets.create({ name: 'Dynamic', kind: 'dynamic' });
    await expect(
      repositories.trainingSets.addItems(set.id, set.revision, [item.id]),
    ).rejects.toThrow(/decides its own membership/);
  });

  it('reports every set an item belongs to, static and dynamic alike', async () => {
    const repositories = createMemoryRepositories();
    const item = await makeItem(repositories, 'Shared', ['calculation']);
    await repositories.trainingSets.create({
      name: 'Chosen',
      kind: 'static',
      itemIds: [item.id],
    });
    await repositories.trainingSets.create({
      name: 'Calculated',
      kind: 'dynamic',
      query: { themes: ['calculation'] },
    });

    const sets = await repositories.trainingSets.setsForItem(item.id);
    expect(sets.map((set) => set.name).sort()).toEqual(['Calculated', 'Chosen']);
  });
});

describe('dynamic set membership', () => {
  const item = (over: Partial<TrainingItemRecord> = {}): TrainingItemRecord => ({
    id: 'item',
    mode: 'best-move',
    positionKey: KEY,
    fen: START_FEN,
    sideToMove: 'w',
    prompt: 'Prompt',
    solutionUci: [asUci('e2e4')],
    solutionSan: [asSan('e4')],
    candidatesUci: [],
    plans: [],
    tags: ['calculation'],
    schedule: newSchedule(0),
    createdAt: 1_000_000,
    updatedAt: 1_000_000,
    revision: 0,
    ...over,
  });

  it('matches everything when nothing is specified', () => {
    expect(matchesQuery(item(), {})).toBe(true);
  });

  it('treats themes as any-of and explicit tags as all-of', () => {
    expect(matchesQuery(item(), { themes: ['calculation', 'king-safety'] })).toBe(true);
    expect(matchesQuery(item(), { themes: ['king-safety'] })).toBe(false);
    expect(matchesQuery(item({ tags: ['a', 'b'] }), { tags: ['a', 'b'] })).toBe(true);
    expect(matchesQuery(item({ tags: ['a'] }), { tags: ['a', 'b'] })).toBe(false);
  });

  it('narrows by mode, age and source', () => {
    expect(matchesQuery(item(), { modes: ['best-move'] })).toBe(true);
    expect(matchesQuery(item(), { modes: ['repertoire-recall'] })).toBe(false);

    const now = 1_000_000 + 10 * 86_400_000;
    expect(matchesQuery(item(), { withinDays: 30 }, now)).toBe(true);
    expect(matchesQuery(item(), { withinDays: 5 }, now)).toBe(false);

    expect(matchesQuery(item(), { fromMyGames: true })).toBe(false);
    expect(
      matchesQuery(item({ source: { kind: 'game', id: 'g1', label: 'A – B' } }), {
        fromMyGames: true,
      }),
    ).toBe(true);
  });
});
