/**
 * Auto-backup tests.
 *
 * Pure-function coverage of the schedule and pruning decisions, so the
 * runtime code is not the only place a regression would show up. The
 * heavier end-to-end coverage (real IndexedDB, real backup records)
 * lives in the repository test suite; this file pins the public contract.
 */

import { describe, expect, it } from 'vitest';

import {
  daysSinceLastBackup,
  isBackupDue,
  BACKUP_RECORD_SCHEMA,
  type BackupRecord,
} from './auto-backup';

const NOW = Date.UTC(2026, 0, 15, 12, 0, 0); // 2026-01-15T12:00:00Z
const DAY_MS = 24 * 60 * 60 * 1000;

describe('auto-backup schedule', () => {
  it('treats a null last-backup as due', () => {
    expect(isBackupDue(null, 7, NOW)).toBe(true);
  });

  it('treats a backup younger than the schedule as not due', () => {
    const threeDaysAgo = NOW - 3 * DAY_MS;
    expect(isBackupDue(threeDaysAgo, 7, NOW)).toBe(false);
  });

  it('treats a backup older than the schedule as due', () => {
    const tenDaysAgo = NOW - 10 * DAY_MS;
    expect(isBackupDue(tenDaysAgo, 7, NOW)).toBe(true);
  });

  it('treats a backup exactly at the schedule boundary as not due', () => {
    const exactlySeven = NOW - 7 * DAY_MS;
    expect(isBackupDue(exactlySeven, 7, NOW)).toBe(false);
  });
});

describe('daysSinceLastBackup', () => {
  it('returns null when there is no backup', () => {
    expect(daysSinceLastBackup(null, NOW)).toBeNull();
  });

  it('returns zero when the backup is from now', () => {
    expect(daysSinceLastBackup(NOW, NOW)).toBe(0);
  });

  it('rounds down to a whole day', () => {
    const twelveHoursAgo = NOW - 12 * 60 * 60 * 1000;
    expect(daysSinceLastBackup(twelveHoursAgo, NOW)).toBe(0);
  });

  it('counts days since the last backup', () => {
    const fiveDaysAgo = NOW - 5 * DAY_MS;
    expect(daysSinceLastBackup(fiveDaysAgo, NOW)).toBe(5);
  });
});

describe('BackupRecord contract', () => {
  it('rejects a record without a payload', () => {
    const result = BACKUP_RECORD_SCHEMA.safeParse({
      id: '1-abc',
      createdAt: NOW,
      reason: 'scheduled',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a complete record', () => {
    const record: BackupRecord = {
      id: `${NOW}-abc12345`,
      createdAt: NOW,
      reason: 'scheduled',
      payload: '{"format":"kingfisher-workspace","version":1}',
    };
    expect(BACKUP_RECORD_SCHEMA.safeParse(record).success).toBe(true);
  });
});
