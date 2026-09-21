import { describe, expect, it } from 'vitest';

import { StaleJournalWriteError } from '../domain';
import { createMemoryRepositories } from './index';

const input = {
  fingerprint: 'fp-1',
  gameId: 'g1',
  title: 'Ana – Rival',
  event: 'Club Open',
  round: '3',
  color: 'w' as const,
  result: '1-0',
  learningPoint: 'Check the clock at move 20.',
};

describe('the round journal', () => {
  it('writes one entry per game and finds it by the game', async () => {
    const { journal } = createMemoryRepositories();
    const created = await journal.write(input, null, 10);
    expect(created.revision).toBe(0);
    expect(created.event).toBe('Club Open');
    expect((await journal.forGame('fp-1'))?.id).toBe(created.id);
    expect(await journal.forGame('fp-2')).toBeNull();

    const updated = await journal.write(
      { ...input, learningPoint: 'Different words.' },
      created.revision,
      20,
    );
    expect(updated.id).toBe(created.id);
    expect(updated.revision).toBe(1);
    expect(updated.createdAt).toBe(10);
    expect(updated.updatedAt).toBe(20);
    expect(await journal.list()).toHaveLength(1);
  });

  it('refuses a stale write and a write that expects no entry when one exists', async () => {
    const { journal } = createMemoryRepositories();
    const created = await journal.write(input, null);
    await journal.write({ ...input, learningPoint: 'Second.' }, created.revision);
    await expect(journal.write({ ...input, learningPoint: 'Third.' }, 0)).rejects.toBeInstanceOf(
      StaleJournalWriteError,
    );
    await expect(
      journal.write({ ...input, learningPoint: 'Fourth.' }, null),
    ).rejects.toBeInstanceOf(StaleJournalWriteError);
    expect((await journal.forGame('fp-1'))?.learningPoint).toBe('Second.');
  });

  it('refuses an empty learning point and drops empty optional headers', async () => {
    const { journal } = createMemoryRepositories();
    await expect(journal.write({ ...input, learningPoint: '   ' }, null)).rejects.toThrow(
      /learning point/,
    );
    const written = await journal.write({ ...input, event: '', opponent: undefined }, null);
    expect('event' in written).toBe(false);
    expect('opponent' in written).toBe(false);
  });

  it('lists newest first', async () => {
    const { journal } = createMemoryRepositories();
    await journal.write({ ...input, fingerprint: 'a' }, null, 1);
    await journal.write({ ...input, fingerprint: 'b' }, null, 2);
    expect((await journal.list()).map((entry) => entry.fingerprint)).toEqual(['b', 'a']);
  });
});
