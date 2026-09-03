import { describe, expect, it } from 'vitest';

import { MemoryPersistenceDatabase } from '../indexeddb/memory';
import { LocalLinkedAccountRepository, linkedAccountId } from './linked-account-repository';

describe('linked account id', () => {
  it('is stable across case and surrounding whitespace, so re-linking resumes rather than duplicates', () => {
    expect(linkedAccountId('lichess', 'DrNykterstein')).toBe(
      linkedAccountId('lichess', ' drnykterstein '),
    );
  });

  it('separates providers, so the same username on two sites is two accounts', () => {
    expect(linkedAccountId('lichess', 'hikaru')).not.toBe(linkedAccountId('chess.com', 'hikaru'));
  });
});

describe('LocalLinkedAccountRepository', () => {
  it('links an account once, and re-linking it returns the same record', async () => {
    const repository = new LocalLinkedAccountRepository(new MemoryPersistenceDatabase());
    const first = await repository.link({ provider: 'lichess', username: 'testuser' }, 1000);
    const second = await repository.link({ provider: 'lichess', username: 'testuser' }, 2000);

    expect(second).toEqual(first);
    expect(await repository.list()).toHaveLength(1);
  });

  it('lists accounts oldest first', async () => {
    const repository = new LocalLinkedAccountRepository(new MemoryPersistenceDatabase());
    await repository.link({ provider: 'lichess', username: 'second' }, 2000);
    await repository.link({ provider: 'lichess', username: 'first' }, 1000);

    expect((await repository.list()).map((entry) => entry.username)).toEqual(['first', 'second']);
  });

  it('updates a record through a change function, transactionally', async () => {
    const repository = new LocalLinkedAccountRepository(new MemoryPersistenceDatabase());
    const account = await repository.link({ provider: 'chess.com', username: 'someone' }, 1000);

    const updated = await repository.update(account.id, (current) => ({
      ...current,
      lastSyncCompletedAt: 5000,
      lastSyncStatus: 'success',
      importedCount: current.importedCount + 12,
    }));

    expect(updated.importedCount).toBe(12);
    expect((await repository.get(account.id))?.lastSyncStatus).toBe('success');
  });

  it('refuses to update an account that no longer exists', async () => {
    const repository = new LocalLinkedAccountRepository(new MemoryPersistenceDatabase());
    await expect(repository.update('lichess:nobody', (current) => current)).rejects.toThrow(
      'no longer exists',
    );
  });

  it('unlinks an account', async () => {
    const repository = new LocalLinkedAccountRepository(new MemoryPersistenceDatabase());
    const account = await repository.link({ provider: 'lichess', username: 'gone' });
    await repository.unlink(account.id);
    expect(await repository.get(account.id)).toBeNull();
  });
});
