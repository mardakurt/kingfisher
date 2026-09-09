/**
 * Persistent streaming cache storage.
 *
 * Phase 30 (PART C-Q): a streaming cache that lives only in memory
 * is correct but not useful — a browser refresh wipes every chunk
 * a research session ever paid to verify. This module is the
 * persistent second tier that lives behind the in-memory LRU.
 *
 * Three properties matter:
 *
 *   1. Digest-keyed identity. The primary key is the SHA-256 of the
 *      bytes, not the URL or the pack id. A chunk that lives in
 *      storage is the chunk the manifest said it was, verified
 *      once, and that identity is what makes the cache shareable
 *      across restarts. A URL collision cannot replace a verified
 *      chunk.
 *
 *   2. Logical separation from authored content. The database is
 *      `kingfisher-stream-cache`, deliberately *not* the same
 *      database that holds Studies, Repertoire, Training, Settings
 *      and the rest of the authored store. Clearing the streaming
 *      cache must never touch a user's work, and a quota exhaustion
 *      on this database cannot cascade into `clear()` of an
 *      unrelated store.
 *
 *   3. Corrupt-entry rejection. A persisted chunk is re-verified
 *      against its digest on the way out, in case the storage
 *      layer lost integrity. Verification uses the same
 *      `crypto.subtle.digest` the provider uses to verify a
 *      network fetch, so a chunk that the network path would
 *      reject is rejected by the persistent path as well.
 *
 * The storage has no notion of bytes-time or LRU — that is the
 * job of the LRU above it. The contract is "store this digest,
 * fetch me this digest, drop it on demand". Eviction and budget
 * enforcement is the composer's problem.
 *
 * The interface is async. The persistent layer is genuinely a
 * background-storage call, and pretending otherwise is what
 * produces UI jank.
 */

import { openStreamingCacheDatabase } from './indexeddb/streaming-cache-database';

/**
 * A record the persistent tier stores. The digest is the primary
 * key; the bytes are stored as a `Blob` so the IndexedDB
 * implementation can hold them in the binary backing store without
 * re-encoding. `lastAccessed` is what the LRU above uses to
 * decide what to evict, and is updated on every successful read.
 */
export interface StreamingCacheRecord {
  /** SHA-256 of the bytes, in lowercase hex. */
  readonly digest: string;
  /** Compressed chunk bytes, exactly as they came from the data mirror. */
  readonly bytes: Uint8Array;
  /** Pack id this chunk belongs to. Kept for diagnostics and eviction audits. */
  readonly packId: string;
  /** Pack version. Two packs of the same id at different versions share digest keys safely. */
  readonly packVersion: string;
  /** Approximate byte size of `bytes`, stored alongside to avoid deserialising on count. */
  readonly bytesLength: number;
  /** Last read or write, epoch ms. Updated by `touch`. */
  lastAccessed: number;
  /** First write, epoch ms. */
  readonly writtenAt: number;
}

/**
 * The narrow contract every backing store implements. The default
 * production implementation is `IndexedDbStreamingCacheStorage`;
 * tests use the in-memory double in `./streaming-cache-storage.memory`.
 */
export interface StreamingCacheStorage {
  /** Fetch a chunk by digest, or null if it is not present. */
  get(digest: string): Promise<Uint8Array | null>;
  /**
   * Persist a chunk. The caller is responsible for verifying the
   * digest before this call. The `lastAccessed` and `writtenAt`
   * fields are populated by the storage, so callers pass a
   * record-shaped object with those fields set to whatever they
   * want or left to be filled in.
   */
  put(record: StreamingCacheRecord): Promise<void>;
  /** Drop a single chunk. No-op if absent. */
  delete(digest: string): Promise<void>;
  /** Drop every chunk in this tier. */
  clear(): Promise<void>;
  /** Iterate every record. Used by the LRU above for eviction audits and budget reports. */
  entries(): AsyncIterableIterator<StreamingCacheRecord>;
  /** Sum of `bytesLength` across every record. */
  totalBytes(): Promise<number>;
  /** Count of records. */
  count(): Promise<number>;
  /**
   * Evict the least-recently-used chunk whose digest is in
   * `candidates`, until either the budget is satisfied or the
   * candidates are exhausted. Returns the number of bytes freed.
   * Used by the LRU to make room before writing a new chunk.
   */
  pruneToBudget(candidates: readonly string[], budgetBytes: number): Promise<number>;
}

const openDatabase = async (): Promise<StreamingCacheStorage> => openStreamingCacheDatabase();

/**
 * The default IndexedDB-backed storage. One instance per
 * `StreamingCache` is fine: the database itself is shared, and
 * the IDB transaction model serialises writes.
 */
export class IndexedDbStreamingCacheStorage implements StreamingCacheStorage {
  private readonly dbPromise: Promise<StreamingCacheStorage>;

  constructor() {
    this.dbPromise = openDatabase();
  }

  async get(digest: string): Promise<Uint8Array | null> {
    const db = await this.dbPromise;
    return db.get(digest);
  }

  async put(record: StreamingCacheRecord): Promise<void> {
    const db = await this.dbPromise;
    const now = Date.now();
    await db.put({ ...record, lastAccessed: now, writtenAt: now });
  }

  async delete(digest: string): Promise<void> {
    const db = await this.dbPromise;
    await db.delete(digest);
  }

  async clear(): Promise<void> {
    const db = await this.dbPromise;
    await db.clear();
  }

  async *entries(): AsyncIterableIterator<StreamingCacheRecord> {
    const db = await this.dbPromise;
    yield* db.entries();
  }

  async totalBytes(): Promise<number> {
    const db = await this.dbPromise;
    return db.totalBytes();
  }

  async count(): Promise<number> {
    const db = await this.dbPromise;
    return db.count();
  }

  async pruneToBudget(candidates: readonly string[], budgetBytes: number): Promise<number> {
    const db = await this.dbPromise;
    return db.pruneToBudget(candidates, budgetBytes);
  }
}

/**
 * Re-verify a chunk against its digest. The streaming provider
 * already does this on the network path; doing it again on the
 * persistent path is what catches bit rot and accidental writes.
 *
 * The check is the cost of one SubtleCrypto digest, which is
 * well under a millisecond for a typical chunk. The provider
 * already pays that cost on the way in, so it is not the
 * dominant cost; the cost of *not* doing it is serving a corrupt
 * chunk as if it were a verified one, and that is not a tradeoff.
 */
export async function verifyChunkDigest(digest: string, bytes: Uint8Array): Promise<boolean> {
  if (typeof crypto === 'undefined' || !crypto.subtle) return false;
  // The SubtleCrypto digest overload wants an ArrayBuffer, and a TypedArray
  // backed by SharedArrayBuffer in a cross-origin-isolated context is
  // technically valid input but trips the precise ArrayBuffer brand. A
  // fresh copy is cheap and satisfies both.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const observed = await crypto.subtle.digest('SHA-256', copy);
  const observedHex = Array.from(new Uint8Array(observed))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return observedHex === digest;
}
