import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  persistenceState,
  persistenceStateSync,
  requestPersistence,
} from './storage-persistence';

/**
 * The persistence helper is tested against the navigator.storage
 * shim. The browser API is not available in node, so the tests
 * confirm the helper degrades gracefully when the API is missing
 * and the synchronous form does not throw.
 */
describe('storage persistence helper', () => {
  let original: PropertyDescriptor | undefined;

  beforeEach(() => {
    original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  });

  afterEach(() => {
    if (original) {
      Object.defineProperty(globalThis, 'navigator', original);
    } else {
      // The property is configurable but wasn't there originally — restore
      // by deleting it. Tests that never installed navigator see the
      // same baseline they started with.
      delete (globalThis as { navigator?: unknown }).navigator;
    }
    vi.restoreAllMocks();
  });

  it('returns "unavailable" when the API does not exist', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: undefined,
      configurable: true,
    });
    expect(await persistenceState()).toBe('unavailable');
    expect(persistenceStateSync()).toBe('unavailable');
    expect(await requestPersistence()).toBe('unavailable');
  });

  it('returns "persistent" when the API says so', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        storage: {
          persisted: () => Promise.resolve(true),
          persist: () => Promise.resolve(true),
        },
      },
      configurable: true,
    });
    expect(await persistenceState()).toBe('persistent');
    expect(await requestPersistence()).toBe('persistent');
  });

  it('returns "not-persistent" when the API says so', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        storage: {
          persisted: () => Promise.resolve(false),
          persist: () => Promise.resolve(false),
        },
      },
      configurable: true,
    });
    expect(await persistenceState()).toBe('not-persistent');
    expect(await requestPersistence()).toBe('not-persistent');
  });

  it('returns "unavailable" when the API throws', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        storage: {
          persisted: () => Promise.reject(new Error('blocked')),
          persist: () => Promise.reject(new Error('blocked')),
        },
      },
      configurable: true,
    });
    expect(await persistenceState()).toBe('unavailable');
    expect(await requestPersistence()).toBe('unavailable');
  });

  it('persistenceStateSync does not throw even when the API is partial', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        storage: { persisted: undefined, persist: undefined },
      },
      configurable: true,
    });
    expect(persistenceStateSync()).toBe('unavailable');
  });

  it('re-checks persistence after a successful request', async () => {
    let persisted = false;
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        storage: {
          persisted: () => Promise.resolve(persisted),
          persist: () => {
            persisted = true;
            return Promise.resolve(true);
          },
        },
      },
      configurable: true,
    });
    expect(await requestPersistence()).toBe('persistent');
    expect(await persistenceState()).toBe('persistent');
  });
});