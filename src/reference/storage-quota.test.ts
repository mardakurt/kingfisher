import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatBytesShort, readStorageQuota, verdictForInstall } from './storage-quota';

interface StorageEstimate {
  usage: number;
  quota: number;
}

const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;

describe('readStorageQuota', () => {
  let originalNavigator: typeof navigator;

  beforeEach(() => {
    originalNavigator = globalThis.navigator;
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
  });

  it('returns unsupported when navigator.storage is missing', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
      writable: true,
    });
    const report = await readStorageQuota();
    expect(report.unsupported).toBe(true);
    expect(report.availableBytes).toBeUndefined();
  });

  it('returns the free space when estimate resolves', async () => {
    const estimate = vi.fn(async (): Promise<StorageEstimate> => ({
      usage: 1 * GB,
      quota: 5 * GB,
    }));
    Object.defineProperty(globalThis, 'navigator', {
      value: { storage: { estimate } },
      configurable: true,
      writable: true,
    });
    const report = await readStorageQuota();
    expect(estimate).toHaveBeenCalledTimes(1);
    expect(report.availableBytes).toBe(4 * GB);
    expect(report.quotaBytes).toBe(5 * GB);
    expect(report.usageBytes).toBe(1 * GB);
    expect(report.unsupported).toBe(false);
  });

  it('falls back to unsupported when the estimate rejects', async () => {
    const estimate = vi.fn(async (): Promise<StorageEstimate> => {
      throw new Error('SecurityError');
    });
    Object.defineProperty(globalThis, 'navigator', {
      value: { storage: { estimate } },
      configurable: true,
      writable: true,
    });
    const report = await readStorageQuota();
    expect(report.unsupported).toBe(true);
  });
});

describe('verdictForInstall', () => {
  it('returns unknown when the quota is unavailable', () => {
    expect(
      verdictForInstall(
        {
          availableBytes: undefined,
          safeAvailableBytes: 0,
          quotaBytes: 0,
          usageBytes: 0,
          unsupported: true,
        },
        1 * GB,
      ).kind,
    ).toBe('unknown');
  });

  it('returns fits when there is plenty of room', () => {
    expect(
      verdictForInstall(
        {
          availableBytes: 10 * GB,
          safeAvailableBytes: 10 * GB,
          quotaBytes: 12 * GB,
          usageBytes: 2 * GB,
          unsupported: false,
        },
        1 * GB,
      ).kind,
    ).toBe('fits');
  });

  it('returns tight when the install leaves less than 64 MiB', () => {
    const verdict = verdictForInstall(
      {
        availableBytes: 1 * GB + 16 * MB,
        safeAvailableBytes: 1 * GB + 16 * MB,
        quotaBytes: 5 * GB,
        usageBytes: 3 * GB - 16 * MB,
        unsupported: false,
      },
      1 * GB,
    );
    expect(verdict.kind).toBe('tight');
  });

  it('returns overflows when the install is larger than the estimate', () => {
    const verdict = verdictForInstall(
      {
        availableBytes: 3 * GB,
        safeAvailableBytes: 3 * GB,
        quotaBytes: 5 * GB,
        usageBytes: 2 * GB,
        unsupported: false,
      },
      5 * GB,
    );
    expect(verdict.kind).toBe('overflows');
    if (verdict.kind === 'overflows') {
      expect(verdict.shortByBytes).toBe(2 * GB);
    }
  });
});

describe('formatBytesShort', () => {
  it('formats bytes, kB, MB and GB honestly', () => {
    expect(formatBytesShort(0)).toBe('0 B');
    expect(formatBytesShort(800)).toBe('800 B');
    expect(formatBytesShort(1500)).toBe('1.5 kB');
    expect(formatBytesShort(1.5 * MB)).toBe('1.6 MB');
    expect(formatBytesShort(2.3 * GB)).toBe('2.5 GB');
  });
});
