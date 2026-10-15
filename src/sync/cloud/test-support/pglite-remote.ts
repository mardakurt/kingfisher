/**
 * `CloudRemote` over the PGlite harness, through RLS, as one account.
 *
 * Every call runs as the `authenticated` role with that account's claims, the
 * way PostgREST would — so the sync engine's tests exercise the real
 * migration's push function, triggers and policies.
 */

import type { CloudRemote, ManifestEntry, PushOutcome, RemoteChange, RemoteRow } from '../remote';
import type { SupabaseHarness } from './pglite-supabase';

type Row = {
  store: string;
  record_key: string;
  value: unknown;
  content_hash: string;
  revision: string | number;
  seq: string | number;
  device_id: string | null;
};

const toRow = (row: Row): RemoteRow => ({
  store: row.store,
  key: row.record_key,
  value: row.value ?? null,
  hash: row.content_hash,
  revision: Number(row.revision),
  seq: Number(row.seq),
  device: row.device_id,
});

export class PgliteRemote implements CloudRemote {
  /** Set to make the next call fail as a dropped connection would. */
  failNext: Error | null = null;
  calls = 0;

  constructor(
    private readonly harness: SupabaseHarness,
    private readonly userId: string,
  ) {}

  private run<T>(work: Parameters<SupabaseHarness['as']>[1]): Promise<T> {
    this.calls += 1;
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = null;
      return Promise.reject(error);
    }
    return this.harness.as({ role: 'authenticated', sub: this.userId }, work) as Promise<T>;
  }

  push(changes: readonly RemoteChange[]): Promise<readonly PushOutcome[]> {
    return this.run(async (tx) => {
      const result = await tx.query<{ push_user_records: PushOutcome[] }>(
        'select public.push_user_records($1::jsonb)',
        [JSON.stringify(changes)],
      );
      return result.rows[0]!.push_user_records.map((outcome) =>
        'revision' in outcome
          ? { ...outcome, revision: Number(outcome.revision), seq: Number(outcome.seq) }
          : outcome,
      );
    });
  }

  pullSince(after: number, limit: number): Promise<readonly RemoteRow[]> {
    return this.run(async (tx) => {
      const result = await tx.query<Row>(
        `select store, record_key, value, content_hash, revision, seq, device_id
           from public.user_records where seq > $1 order by seq limit $2`,
        [after, limit],
      );
      return result.rows.map(toRow);
    });
  }

  manifest(): Promise<readonly ManifestEntry[]> {
    return this.run(async (tx) => {
      const result = await tx.query<{
        store: string;
        record_key: string;
        revision: string;
        seq: string;
        deleted: boolean;
      }>(
        `select store, record_key, revision, seq, deleted_at is not null as deleted
           from public.user_records order by seq`,
      );
      return result.rows.map((row) => ({
        store: row.store,
        key: row.record_key,
        revision: Number(row.revision),
        seq: Number(row.seq),
        deleted: row.deleted,
      }));
    });
  }

  fetch(keys: readonly { store: string; key: string }[]): Promise<readonly RemoteRow[]> {
    return this.run(async (tx) => {
      const rows: RemoteRow[] = [];
      for (const { store, key } of keys) {
        const result = await tx.query<Row>(
          `select store, record_key, value, content_hash, revision, seq, device_id
             from public.user_records where store = $1 and record_key = $2`,
          [store, key],
        );
        rows.push(...result.rows.map(toRow));
      }
      return rows;
    });
  }
}
