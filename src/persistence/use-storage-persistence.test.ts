import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { persistenceState, persistenceStateSync, requestPersistence } from './storage-persistence';

interface MockStorage {
  persisted: () => Promise<boolean>;
  persist: () => Promise<boolean>;
}

const NAV_KEY = 'storage';

const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, NAV_KEY);

function installMockStorage(value: MockStorage | undefined) {
  Object.defineProperty(navigator, NAV_KEY, {
    value,
    configurable: true,
    writable: true,
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  if (originalDescriptor) {
    Object.defineProperty(navigator, NAV_KEY, originalDescriptor);
  } else {
    installMockStorage(undefined);
  }
});

/*
 * The React hook is a thin layer over these three pure functions,
 * so the test exercises the underlying state machine directly.
 * That keeps the assertion at the right level: a hook test would
 * exercise @testing-library/react which is not in the dependency
 * graph here, and would add little the unit tests do not already
 * pin in `storage-persistence.test.ts`.
 */
describe('storage persistence state machine (used by useStoragePersistence)', () => {
  it('the synchronous probe returns "not-persistent" when the API is present', () => {
    installMockStorage({
      persisted: async () => true,
      persist: async () => true,
    });
    expect(persistenceStateSync()).toBe('not-persistent');
  });

  it('the synchronous probe returns "unavailable" when the API is missing', () => {
    installMockStorage(undefined);
    expect(persistenceStateSync()).toBe('unavailable');
  });

  it('the async probe returns "persistent" when the browser already grants it', async () => {
    installMockStorage({
      persisted: async () => true,
      persist: async () => true,
    });
    expect(await persistenceState()).toBe('persistent');
  });

  it('the async probe returns "not-persistent" when the browser does not', async () => {
    installMockStorage({
      persisted: async () => false,
      persist: async () => false,
    });
    expect(await persistenceState()).toBe('not-persistent');
  });

  it('the async probe returns "unavailable" when the API throws', async () => {
    installMockStorage({
      persisted: async () => {
        throw new Error('denied');
      },
      persist: async () => false,
    });
    expect(await persistenceState()).toBe('unavailable');
  });

  it('requestPersistence() upgrades the state when the browser grants it', async () => {
    installMockStorage({
      persisted: async () => false,
      persist: async () => true,
    });
    expect(await requestPersistence()).toBe('persistent');
  });

  it('requestPersistence() reports "unavailable" when the API is missing', async () => {
    installMockStorage(undefined);
    expect(await requestPersistence()).toBe('unavailable');
  });

  it('requestPersistence() returns the existing state when the browser declines', async () => {
    installMockStorage({
      persisted: async () => false,
      persist: async () => false,
    });
    expect(await requestPersistence()).toBe('not-persistent');
  });
});
