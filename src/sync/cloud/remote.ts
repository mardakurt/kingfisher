/**
 * What the sync engine needs from the cloud, and nothing more.
 *
 * Four calls: push a batch with compare-and-swap, pull what changed after a
 * sequence number, list every row's revision without its value, and fetch
 * chosen rows whole. The production implementation is Supabase
 * (`supabase-remote.ts`); the engine's tests run against the same SQL in
 * PGlite (`test-support/pglite-remote.ts`), so the protocol is exercised
 * end to end without a network.
 */

export interface RemoteChange {
  readonly store: string;
  readonly key: string;
  /** `null` deletes. */
  readonly value: unknown;
  readonly hash: string;
  /** The server revision this change was made on top of; 0 for a new record. */
  readonly base: number;
  readonly device: string;
}

export type PushOutcome =
  | {
      readonly store: string;
      readonly key: string;
      readonly status: 'applied' | 'unchanged';
      readonly revision: number;
      readonly seq: number;
    }
  | { readonly store: string; readonly key: string; readonly status: 'absent' }
  | {
      readonly store: string;
      readonly key: string;
      readonly status: 'conflict';
      readonly revision: number;
      readonly seq: number;
      readonly hash: string;
      readonly value: unknown;
      readonly deleted: boolean;
      readonly device: string | null;
    };

export interface RemoteRow {
  readonly store: string;
  readonly key: string;
  /** `null` for a tombstone. */
  readonly value: unknown;
  readonly hash: string;
  readonly revision: number;
  readonly seq: number;
  readonly device: string | null;
}

export interface ManifestEntry {
  readonly store: string;
  readonly key: string;
  readonly revision: number;
  readonly seq: number;
  readonly deleted: boolean;
}

export interface CloudRemote {
  push(changes: readonly RemoteChange[]): Promise<readonly PushOutcome[]>;
  /** Rows with `seq > after`, in sequence order, at most `limit`. */
  pullSince(after: number, limit: number): Promise<readonly RemoteRow[]>;
  manifest(): Promise<readonly ManifestEntry[]>;
  fetch(
    keys: readonly { readonly store: string; readonly key: string }[],
  ): Promise<readonly RemoteRow[]>;
}

/** The server refuses more than this in one push; see `push_user_records`. */
export const PUSH_BATCH_LIMIT = 200;
export const PULL_PAGE = 500;
