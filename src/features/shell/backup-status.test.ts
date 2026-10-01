import { describe, expect, it } from 'vitest';

import { BACKUP_TEXT_CLASS, BACKUP_TONE_CLASS, DAY, describeBackupStatus } from './backup-status';

const NOW = 1_700_000_000_000;
const daysAgo = (n: number) => NOW - n * DAY;

describe('describeBackupStatus', () => {
  const show = (
    status: Parameters<typeof describeBackupStatus>[0]['status'],
    lastBackupAt: number | null,
    reminderDays = 7,
  ) => describeBackupStatus({ status, lastBackupAt, reminderDays, now: NOW });

  it('does not claim an empty or healthy backup store while the read is pending', () => {
    for (const timestamp of [null, daysAgo(1)]) {
      const state = show('checking', timestamp);
      expect(state.label).toBe('Checking backups…');
      expect(state.label).not.toMatch(/No backup|today|ago/);
      expect(state.tone).not.toBe('positive');
    }
  });

  /*
    The two states that used to have no arm. Both left `lastBackupAt` at its
    previous value, so the indicator fell through to the ordinary branch and
    reported a working safety net. These are the regression.
  */
  it('reports a failed run as a failure, not as the last good backup', () => {
    const state = show('failed', daysAgo(3));
    expect(state.label).toBe('Backup failed');
    expect(state.tone).toBe('negative');
    expect(state.ariaLabel).toContain('failed');
    // The timestamp is still reported, because it still exists — the claim
    // about it is the failure, not the disappearance of a real backup.
    expect(state.lastBackupAt).toBe(daysAgo(3));
  });

  it('never renders a failed run in the success colour', () => {
    // The defect precisely: same timestamp, healthy status, different verdict.
    const failed = show('failed', daysAgo(3));
    const healthy = show('idle', daysAgo(3));
    expect(failed.tone).not.toBe(healthy.tone);
    expect(failed.label).not.toBe(healthy.label);
    expect(healthy.tone).not.toBe('negative');
  });

  it('distinguishes "the store could not be read" from "you have no backups"', () => {
    const unreadable = show('unavailable', daysAgo(3));
    const none = show('idle', null);
    expect(unreadable.label).toBe('Backup status unknown');
    expect(unreadable.tone).toBe('negative');
    // The important half: an unknown timestamp is not a zero timestamp.
    expect(unreadable.label).not.toBe(none.label);
    expect(unreadable.ariaLabel).not.toBe(none.ariaLabel);
    // And it must not claim a recency it never established.
    expect(unreadable.label).not.toMatch(/ago|today/);
  });

  it('says a backup is being taken while one is', () => {
    const state = show('running', daysAgo(9));
    expect(state.label).toBe('Backing up…');
    expect(state.tone).toBe('accent');
  });

  it('says there has never been one only when there has never been one', () => {
    const state = show('idle', null);
    expect(state.label).toBe('No backup yet');
    expect(state.tone).toBe('negative');
  });

  it('marks a fresh backup as the one state a user wants to see', () => {
    expect(show('idle', NOW).label).toBe('Backup today');
    expect(show('idle', NOW).tone).toBe('positive');
    expect(show('idle', NOW - 60_000).label).toBe('Backup today');
  });

  it('holds the schedule the user set, not a literal week', () => {
    // A two-day schedule: five days is late even though a week is not.
    expect(show('idle', daysAgo(5), 2).tone).toBe('caution');
    // Boundary: the schedule itself is not yet overdue.
    expect(show('idle', daysAgo(7), 7).tone).toBe('muted');
    expect(show('idle', daysAgo(8), 7).tone).toBe('caution');
  });

  /*
    A regression caught reading the diff back: collapsing the mapping put
    "backed up 3 days ago" in the same positive green as "today", so every
    launch looked like an event. Today is the one state a user is glad about;
    a healthy older backup is unremarkable and stays quiet.
  */
  it('reserves the positive accent for a backup taken today', () => {
    expect(show('idle', NOW).tone).toBe('positive');
    for (const days of [1, 2, 4, 7]) {
      expect(show('idle', daysAgo(days), 14).tone, `${days} days ago must stay quiet`).toBe(
        'muted',
      );
    }
    // And the dot is dimmed rather than gone, so the backup is still evident.
    expect(BACKUP_TEXT_CLASS.muted).toBe('text-secondary');
    expect(BACKUP_TONE_CLASS.muted).toBe('bg-positive/70');
    expect(BACKUP_TONE_CLASS.positive).toBe('bg-positive');
  });

  it('reads singular and plural correctly', () => {
    expect(show('idle', daysAgo(1)).ariaLabel).toContain('1 day ago');
    expect(show('idle', daysAgo(2)).ariaLabel).toContain('2 days ago');
    expect(show('idle', daysAgo(0)).ariaLabel).toContain('today');
  });

  it('always offers a way to act, and says which section acts', () => {
    for (const status of ['idle', 'checking', 'running', 'failed', 'unavailable'] as const) {
      const state = describeBackupStatus({
        status,
        lastBackupAt: daysAgo(1),
        reminderDays: 7,
        now: NOW,
      });
      expect(state.title.length).toBeGreaterThan(10);
    }
    expect(show('failed', daysAgo(1)).ariaLabel).toContain('database settings');
    expect(show('unavailable', daysAgo(1)).ariaLabel).toContain('database settings');
  });

  it('explains what a failure did not cost, because a failed run is scary', () => {
    expect(show('failed', daysAgo(1)).title).toContain('previous backup is untouched');
  });
});
