/**
 * Auto-backup — the workspace's safety net.
 *
 * Phase 56 change: backup used to be manual and undiscoverable. The
 * Settings → Database → Export backup button is still there, and it is
 * still the right way to put a file under the user's control. Auto-backup
 * is the second thing, not a replacement for it: it runs on a schedule,
 * stores the result where the user does not have to think about it, and
 * exposes a single indicator — "Last backup: 3 days ago" — so the user
 * knows the safety net is doing its job.
 *
 * ## What the schedule looks like
 *
 * Two preferences drive the cycle:
 * - `autoBackupEnabled` (default on): whether the cycle runs at all.
 * - `autoBackupReminderDays` (default 7): how often, and also the
 *   threshold at which the status bar shows the reminder state.
 *
 * A backup runs on app launch if either (a) the user has never had one,
 * or (b) the previous backup is older than the schedule.
 *
 * ## Where the bytes go
 *
 * The web keeps the last `autoBackupRetention` snapshots in the new
 * `backups` IndexedDB store. The desktop uses the same store today; the
 * IPC bridge to write into the user-data directory is the next step and
 * is the only piece that will differ from the web path. Settings →
 * Database → Export any backup lets the user take the file out of the
 * app the way they always could.
 */

import { z } from 'zod';

import { BACKUP_FORMAT, BACKUP_VERSION, createWorkspaceBackup } from '@/persistence/backup';
import type { PersistenceDatabase } from '@/persistence/indexeddb/database';
import { STORE_NAMES } from '@/persistence/schema/migrations';

export const BACKUP_RECORD_SCHEMA = z.object({
  id: z.string(),
  createdAt: z.number(),
  reason: z.string().optional(),
  payload: z.string(),
});

export type BackupRecord = z.infer<typeof BACKUP_RECORD_SCHEMA>;

/**
 * Decide if a backup is due. Pure function so a test can hold it to the
 * contract: a `null` lastBackup is always due, an old one is due, a
 * recent one is not.
 */
export function isBackupDue(
  lastBackupAt: number | null,
  scheduleDays: number,
  now: number = Date.now(),
): boolean {
  if (lastBackupAt === null) return true;
  const ageMs = now - lastBackupAt;
  return ageMs > scheduleDays * 24 * 60 * 60 * 1000;
}

/**
 * Days since the last backup, or null. Used by the status-bar indicator.
 */
export function daysSinceLastBackup(
  lastBackupAt: number | null,
  now: number = Date.now(),
): number | null {
  if (lastBackupAt === null) return null;
  return Math.floor((now - lastBackupAt) / (24 * 60 * 60 * 1000));
}

/**
 * Run a backup and persist it. Returns the created record, or `null` if
 * the run failed (the caller surfaces the failure rather than silently
 * updating `lastBackupAt`).
 */
export async function runAutoBackup(
  database: PersistenceDatabase,
  preferences: Readonly<Record<string, unknown>>,
  options: {
    readonly retention: number;
    readonly reason?: string;
    readonly now?: number;
  },
): Promise<BackupRecord | null> {
  const createdAt = options.now ?? Date.now();
  try {
    const backup = await createWorkspaceBackup(database, preferences, { now: createdAt });
    const payload = JSON.stringify({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      createdAt,
      backup,
    });
    const record: BackupRecord = {
      id: `${createdAt}-${payloadHash(payload)}`,
      createdAt,
      reason: options.reason,
      payload,
    };
    await persistBackup(database, record, options.retention);
    return record;
  } catch {
    return null;
  }
}

/**
 * Persist a backup record and prune older entries to the retention
 * count. The write and the prunes run sequentially rather than in a
 * single read-write transaction: the PersistenceTransaction interface
 * exposed to user code does not include objectStore, only the
 * higher-level get / put / delete helpers, which are themselves
 * single-call transactions on the underlying IDB. A failure between
 * the write and the prune leaves the store one entry over its
 * retention ceiling; the next run prunes it. That is the right
 * trade-off — a partial prune that aborts is harmless, a partial
 * transaction that aborts a successful write would lose data.
 */
export async function persistBackup(
  database: PersistenceDatabase,
  record: BackupRecord,
  retention: number,
): Promise<void> {
  await database.put(STORE_NAMES.backups, record);
  const all = await database.getAll<BackupRecord>(STORE_NAMES.backups);
  if (all.length <= retention) return;
  const sorted = [...all].sort((a, b) => a.createdAt - b.createdAt);
  const surplus = sorted.slice(0, all.length - retention);
  for (const entry of surplus) {
    await database.delete(STORE_NAMES.backups, entry.id);
  }
}

/**
 * The most recent backup, or `null` if the user has never had one
 * (or all rows have been pruned past retention).
 */
export async function mostRecentBackup(
  database: PersistenceDatabase,
): Promise<BackupRecord | null> {
  const all = await database.getAll<BackupRecord>(STORE_NAMES.backups);
  if (all.length === 0) return null;
  return all.reduce((latest, current) => (current.createdAt > latest.createdAt ? current : latest));
}

/**
 * Compose a hook-callable entry point that the app root can run once
 * on launch. The caller decides whether to actually fire `runAutoBackup`
 * based on the result of `isBackupDue`.
 */
export async function ensureBackup(
  database: PersistenceDatabase,
  preferences: Readonly<Record<string, unknown>>,
  options: {
    readonly lastBackupAt: number | null;
    readonly enabled: boolean;
    readonly scheduleDays: number;
    readonly retention: number;
  },
): Promise<{
  readonly status: 'skipped' | 'succeeded' | 'failed';
  readonly createdAt: number | null;
}> {
  if (!options.enabled) return { status: 'skipped', createdAt: null };
  if (!isBackupDue(options.lastBackupAt, options.scheduleDays)) {
    return { status: 'skipped', createdAt: options.lastBackupAt };
  }
  const record = await runAutoBackup(database, preferences, {
    retention: options.retention,
    reason: 'scheduled',
  });
  if (!record) return { status: 'failed', createdAt: options.lastBackupAt };
  return { status: 'succeeded', createdAt: record.createdAt };
}

/**
 * 32-bit FNV-1a hash of the payload. Short, fast, and good enough as
 * a tie-breaker so two backups taken in the same millisecond cannot
 * collide on their primary keys.
 */
function payloadHash(payload: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
