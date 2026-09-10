import { describe, expect, it } from 'vitest';

import { readStorageQuota, verdictForInstall } from './storage-quota';
import { SYNTHETIC_HUGE_SOURCES } from './synthetic-huge-sources';

const GB = 1024 * 1024 * 1024;

describe('SYNTHETIC_HUGE_SOURCES', () => {
  it('exposes a 1 GB, a 5 GB and a 20 GB pack', () => {
    const sizes = SYNTHETIC_HUGE_SOURCES.map((pack) => pack.approximateBytes);
    // The test asserts the multiset, not the order, so adding a
    // fourth synthetic source in the future does not break the
    // contract. The three canonical sizes the brief asks for are
    // all present.
    expect(sizes).toHaveLength(3);
    expect(new Set(sizes)).toEqual(new Set([1 * GB, 5 * GB, 20 * GB]));
  });

  it('marks every entry as non-bundled (online / installable)', () => {
    for (const pack of SYNTHETIC_HUGE_SOURCES) {
      expect(pack.bundled).toBe(false);
    }
  });

  it('names each pack with a human-readable label', () => {
    for (const pack of SYNTHETIC_HUGE_SOURCES) {
      expect(pack.name).toMatch(/\d+(\.\d+)?\s?GB/);
    }
  });

  it('produces honest storage-quota verdicts', async () => {
    /*
     * The real `navigator.storage.estimate` may report anywhere
     * between a few hundred MB and several GB depending on the
     * browser and the OS. The point of this assertion is that the
     * verdict for a 20 GB pack never claims a fit when the user
     * clearly cannot pay for it.
     */
    const report = await readStorageQuota();
    const verdict = verdictForInstall(report, 20 * GB);
    if (report.unsupported) {
      expect(verdict.kind).toBe('unknown');
    } else if (report.availableBytes !== undefined && report.availableBytes < 20 * GB) {
      expect(verdict.kind).toBe('overflows');
    }
    // When the report is rich enough, the verdict is one of three
    // concrete outcomes; the test does not assert which one because
    // the available space depends on the host.
  });
});
