/**
 * What the status bar's backup indicator claims, as data.
 *
 * Extracted from `StatusBar.tsx` for the same reason `layout-model.ts` holds no
 * React: a label is a claim about the user's data, and "which claim" is a
 * question worth answering in a test rather than by reading a ternary chain
 * inside a `footer`.
 *
 * The defect this exists to hold the line against: the store has always been
 * able to say `failed`, and the indicator had no arm for it. `lastBackupAt`
 * keeps its previous value after a failure, so the missing arm fell through to
 * the ordinary branch and drew a **green** dot beside "Backup 3d ago" — a
 * safety net that had failed, reported as one that had not. A state that
 * cannot be rendered is a state that is always reported as the good one.
 *
 * Five claims, and they are genuinely five different things:
 *
 * | state         | what it asserts                                    |
 * | ------------- | -------------------------------------------------- |
 * | `running`     | a backup is being taken right now                  |
 * | `unavailable` | the store could not be **read** — not that there is |
 * |               | nothing; the answer is unknown, and unknown is not  |
 * |               | zero                                              |
 * | `failed`      | a backup was due and did not complete              |
 * | never         | there is no backup, and one is due                 |
 * | overdue       | the newest backup is older than the schedule        |
 * | recent        | the newest backup is inside the schedule           |
 */

import { daysSinceLastBackup } from './auto-backup';

export type AutoBackupStatus = 'idle' | 'checking' | 'running' | 'failed' | 'unavailable';

export type BackupTone = 'accent' | 'positive' | 'caution' | 'negative' | 'muted';

export interface BackupIndicator {
  /** Text in the bar. Never a number that was not read from the store. */
  readonly label: string;
  /** The dot beside it. */
  readonly tone: BackupTone;
  /** Full sentence, for assistive technology. */
  readonly ariaLabel: string;
  /** The same sentence as a hint, expanded with what to do about it. */
  readonly title: string;
  /** The stored timestamp this was derived from, for tests and callers. */
  readonly lastBackupAt: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function describeBackupStatus(input: {
  readonly status: AutoBackupStatus;
  readonly lastBackupAt: number | null;
  readonly reminderDays: number;
  readonly now?: number;
}): BackupIndicator {
  const { status, lastBackupAt, reminderDays } = input;
  const now = input.now ?? Date.now();
  const days = daysSinceLastBackup(lastBackupAt, now);
  const open = ' — open the database settings';

  if (status === 'running') {
    return {
      label: 'Backing up…',
      tone: 'accent',
      ariaLabel: 'Backing up' + open,
      title: 'Taking a backup now.',
      lastBackupAt,
    };
  }

  if (status === 'unavailable') {
    return {
      label: 'Backup status unknown',
      tone: 'negative',
      ariaLabel: 'Backup status unavailable' + open,
      title:
        'The backup store could not be read, so Kingfisher cannot say whether you have one. Open Settings → Database to back up now.',
      lastBackupAt,
    };
  }

  if (status === 'failed') {
    return {
      label: 'Backup failed',
      tone: 'negative',
      ariaLabel: 'Last backup failed' + open,
      title:
        'The last automatic backup did not complete. Your previous backup is untouched — open Settings → Database to try again.',
      lastBackupAt,
    };
  }

  if (days === null) {
    return {
      label: 'No backup yet',
      tone: 'negative',
      ariaLabel: 'No backup yet' + open,
      title: 'No backup yet. Click to back up now from Settings → Database.',
      lastBackupAt,
    };
  }

  const daysAgo = days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'} ago`;
  const overdue = days > reminderDays;

  /*
    Three readings of the same healthy answer, and the difference is one of
    attention. **Today** is the state a user is actively glad about, so it gets
    the accent. A backup from earlier in the week is fine and unremarkable, and
    drawing it in the same green makes every launch look like an event; it stays
    quiet, with the dot dimmed rather than absent. Overdue is the only other
    one that is trying to say something.
  */
  return {
    label: `Backup ${days === 0 ? 'today' : `${days}d ago`}`,
    tone: days === 0 ? 'positive' : overdue ? 'caution' : 'muted',
    ariaLabel: `Last backup ${daysAgo}` + open,
    title: overdue
      ? `Backup is ${days} days old. Click to back up now from Settings → Database.`
      : `Backed up ${daysAgo}. Click to manage backups.`,
    lastBackupAt,
  };
}

/** Token classes for one tone, so the bar and the tests agree on the mapping. */
export const BACKUP_TONE_CLASS: Readonly<Record<BackupTone, string>> = {
  accent: 'bg-accent',
  positive: 'bg-positive',
  caution: 'bg-caution',
  negative: 'bg-negative',
  muted: 'bg-positive/70',
};

export const BACKUP_TEXT_CLASS: Readonly<Record<BackupTone, string>> = {
  accent: 'text-accent-ink',
  positive: 'text-positive',
  caution: 'text-caution',
  negative: 'text-negative',
  muted: 'text-secondary',
};

/** Exported for the test that asserts the schedule is in days, not hours. */
export const DAY = DAY_MS;
