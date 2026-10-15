/**
 * `CloudRemote` over Supabase: PostgREST for reads, one RPC for writes.
 *
 * No query here filters by owner. Row Level Security does that on the server
 * for every statement, and a client-side filter would only look like a
 * security control while being none.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { CloudRemote, ManifestEntry, PushOutcome, RemoteChange, RemoteRow } from './remote';

const ROW_COLUMNS = 'store,record_key,value,content_hash,revision,seq,device_id';
const MANIFEST_PAGE = 1000;
const FETCH_CHUNK = 100;

type Row = {
  store: string;
  record_key: string;
  value: unknown;
  content_hash: string;
  revision: number | string;
  seq: number | string;
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

export class CloudRequestError extends Error {
  constructor(
    message: string,
    /** True when retrying later can succeed: the network, a timeout, a 5xx. */
    readonly transient: boolean,
  ) {
    super(message);
    this.name = 'CloudRequestError';
  }
}

function fail(
  error: { message: string; code?: string; status?: number } | null,
  what: string,
): never {
  const message = error?.message ?? 'unknown error';
  const code = error?.code ?? '';
  const permanent = code === '42501' || code === '22023' || code.startsWith('PGRST3');
  throw new CloudRequestError(`${what}: ${message}`, !permanent);
}

export class SupabaseRemote implements CloudRemote {
  constructor(private readonly client: SupabaseClient) {}

  async push(changes: readonly RemoteChange[]): Promise<readonly PushOutcome[]> {
    const { data, error } = await this.client.rpc('push_user_records', { changes });
    if (error) fail(error, 'Could not save to your account');
    return (data as PushOutcome[]).map((outcome) =>
      'revision' in outcome
        ? { ...outcome, revision: Number(outcome.revision), seq: Number(outcome.seq) }
        : outcome,
    );
  }

  async pullSince(after: number, limit: number): Promise<readonly RemoteRow[]> {
    const { data, error } = await this.client
      .from('user_records')
      .select(ROW_COLUMNS)
      .gt('seq', after)
      .order('seq', { ascending: true })
      .limit(limit);
    if (error) fail(error, 'Could not read from your account');
    return (data as Row[]).map(toRow);
  }

  async manifest(): Promise<readonly ManifestEntry[]> {
    const entries: ManifestEntry[] = [];
    for (let from = 0; ; from += MANIFEST_PAGE) {
      const { data, error } = await this.client
        .from('user_records')
        .select('store,record_key,revision,seq,deleted_at')
        .order('seq', { ascending: true })
        .range(from, from + MANIFEST_PAGE - 1);
      if (error) fail(error, 'Could not list your account’s records');
      const page = data as (Pick<Row, 'store' | 'record_key' | 'revision' | 'seq'> & {
        deleted_at: string | null;
      })[];
      for (const row of page) {
        entries.push({
          store: row.store,
          key: row.record_key,
          revision: Number(row.revision),
          seq: Number(row.seq),
          deleted: row.deleted_at !== null,
        });
      }
      if (page.length < MANIFEST_PAGE) return entries;
    }
  }

  async fetch(keys: readonly { store: string; key: string }[]): Promise<readonly RemoteRow[]> {
    const byStore = new Map<string, string[]>();
    for (const { store, key } of keys) byStore.set(store, [...(byStore.get(store) ?? []), key]);
    const rows: RemoteRow[] = [];
    for (const [store, storeKeys] of byStore) {
      for (let index = 0; index < storeKeys.length; index += FETCH_CHUNK) {
        const { data, error } = await this.client
          .from('user_records')
          .select(ROW_COLUMNS)
          .eq('store', store)
          .in('record_key', storeKeys.slice(index, index + FETCH_CHUNK));
        if (error) fail(error, 'Could not read from your account');
        rows.push(...(data as Row[]).map(toRow));
      }
    }
    return rows;
  }
}
