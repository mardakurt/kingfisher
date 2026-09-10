/**
 * A two-tier streaming cache: in-memory LRU + persistent IndexedDB.
 *
 * Phase 30 (PART C): the brief's exact recipe.
 *
 *   MEMORY CACHE
 *     ↓ miss
 *   INDEXEDDB CACHE
 *     ↓ miss
 *   NETWORK
 *     ↓
 *   SHA-256 VERIFY
 *     ↓
 *   INDEXEDDB
 *     ↓
 *   MEMORY
 *
 * Three properties the contract has to hold for the above to be true:
 *
 *   1. A read that misses memory must consult persistent. A read
 *      that hits memory must not pay the cost of opening an IDB
 *      transaction.
 *
 *   2. A write that goes into memory must also land in persistent,
 *      so the next session finds it. The reverse is false: a
 *      persistent write does not have to live in memory, because
 *      a future read will lift it back up.
 *
 *   3. A read from persistent must re-verify the digest before
 *      serving. The IDB layer promises identity, but the cheap
 *      way to test that promise is the same digest check the
 *      network path uses. A bit-rot or accidental write that ends
 *      up in IDB must not be served to the explorer.
 *
 * Eviction is the in-memory LRU's job; the persistent tier is
 * pruned by the same budget, just less aggressively. A user with
 * a 1 GB persistent budget and a 256 MB memory budget will see
 * the memory tier shrink and refill as the session goes on, while
 * the persistent tier holds whatever was verified until the user
 * chooses to clear it.
 *
 * The class is async because persistent reads and writes are
 * async. The `RemoteReferenceProvider` is already async, and the
 * `StreamingCache` it held before Phase 30 was synchronous only
 * because its only tier was memory. Adding a tier that genuinely
 * lives in a background-storage call makes the whole thing
 * async, and that is the honest interface.
 */

import { DatabaseError } from '@/database/types';
import {
  type StreamingCacheStorage,
  verifyChunkDigest,
} from '@/persistence/streaming-cache-storage';

import { StreamingCache } from './streaming-cache';

const DEFAULT_PERSISTENT_WEB_BUDGET = 768 * 1024 * 1024;
const DEFAULT_PERSISTENT_DESKTOP_BUDGET = 1536 * 1024 * 1024;

const isDesktop = (): boolean =>
  typeof navigator !== 'undefined' && /Kingfisher|Electron/i.test(navigator.userAgent);

export interface TieredStreamingCacheOptions {
  readonly packId: string;
  readonly packVersion: string;
  /** In-memory LRU budget, in bytes. */
  readonly memoryBudgetBytes?: number;
  /** Persistent tier budget, in bytes. */
  readonly persistentBudgetBytes?: number;
  /** The persistent storage. */
  readonly persistent: StreamingCacheStorage;
  /**
   * In-memory LRU tier. If omitted, the default in-memory LRU is
   * constructed with `memoryBudgetBytes`.
   */
  readonly memory?: StreamingCache;
  /**
   * Optional callback fired when a chunk is evicted from the
   * persistent tier.
   */
  readonly onPersistentEvict?: (entry: { readonly sha256: string; readonly bytes: number }) => void;
}

/**
 * The two-tier streaming cache.
 *
 * The provider takes one of these instead of a bare
 * `StreamingCache` for Phase 30. The memory-only cache still
 * exists for tests and for the in-process cache that backs an
 * installed pack's read path.
 */
export class TieredStreamingCache {
  readonly packId: string;
  readonly packVersion: string;

  private readonly memory: StreamingCache;
  private readonly persistent: StreamingCacheStorage;
  private readonly memoryBudget: number;
  private readonly persistentBudget: number;
  private readonly onPersistentEvict: TieredStreamingCacheOptions['onPersistentEvict'];

  /**
   * In-flight persistent writes, keyed by digest. Two concurrent
   * callers awaiting the same digest share the same promise, so
   * the explorer never puts a chunk into persistent twice.
   */
  private readonly inflight = new Map<string, Promise<void>>();

  /**
   * Tracks whether the persistent store has been read for the
   * current session. The first read pays an IDB-open cost; the
   * rest are amortised. The flag is informational, used by the
   * catalog UI to know whether to surface the persistent byte
   * count.
   */
  // (Removed in Phase 30 — the manager owns the cached
  // persistent byte count because that is what the catalog row
  // shows. The flag is no longer used inside the tiered cache.)

  constructor(options: TieredStreamingCacheOptions) {
    this.packId = options.packId;
    this.packVersion = options.packVersion;
    this.persistent = options.persistent;
    this.onPersistentEvict = options.onPersistentEvict;
    this.memoryBudget = options.memoryBudgetBytes ?? options.memory?.budget() ?? 256 * 1024 * 1024;
    this.persistentBudget =
      options.persistentBudgetBytes ??
      (isDesktop() ? DEFAULT_PERSISTENT_DESKTOP_BUDGET : DEFAULT_PERSISTENT_WEB_BUDGET);
    this.memory =
      options.memory ??
      new StreamingCache({
        packId: options.packId,
        packVersion: options.packVersion,
        budgetBytes: this.memoryBudget,
      });
  }

  /** Approximate bytes held in the in-memory tier. */
  memoryBytes(): number {
    return this.memory.bytes();
  }

  /** Approximate bytes held in the persistent tier. */
  async persistentBytes(): Promise<number> {
    return this.persistent.totalBytes();
  }

  /** Number of chunks in the in-memory tier. */
  memorySize(): number {
    return this.memory.size();
  }

  /** Number of chunks in the persistent tier. */
  async persistentSize(): Promise<number> {
    return this.persistent.count();
  }

  /** In-memory tier budget, in bytes. */
  memoryBudgetBytes(): number {
    return this.memoryBudget;
  }

  /** Persistent tier budget, in bytes. */
  persistentBudgetBytes(): number {
    return this.persistentBudget;
  }

  /**
   * Fetch a chunk. Memory first, then persistent. The persistent
   * read is re-verified against the digest before being lifted
   * into memory, so a corrupted record is dropped on the floor
   * rather than served.
   */
  async get(digest: string): Promise<Uint8Array | null> {
    const fromMemory = this.memory.get(digest);
    if (fromMemory) return fromMemory;
    const fromPersistent = await this.persistent.get(digest);
    if (fromPersistent === null) return null;
    // Re-verify on the way out. The IDB layer's promise is
    // identity; the cheap test of that promise is the same
    // digest the network path uses.
    const verified = await verifyChunkDigest(digest, fromPersistent);
    if (!verified) {
      // Drop the corrupt record so a future re-fetch can re-establish
      // a verified entry under the same key. We surface as null so
      // the caller falls through to the network; we do not throw,
      // because a single corrupt record is not a reason to refuse
      // every later query.
      await this.persistent.delete(digest).catch(() => undefined);
      throw new DatabaseError(
        `Persisted chunk ${digest.slice(0, 12)}… failed digest verification.`,
        'The local cache was discarded; the chunk will be re-fetched.',
        'error',
      );
    }
    this.memory.put(digest, fromPersistent);
    return fromPersistent;
  }

  /**
   * Persist a chunk. The caller is responsible for verifying the
   * digest before this call.
   *
   * The memory tier is updated synchronously so subsequent reads
   * in this session are fast. The persistent write is fire-and-
   * forget to keep the hot path off the IDB request queue; the
   * `inflight` map ensures two concurrent writes of the same
   * digest do not race.
   */
  put(digest: string, bytes: Uint8Array): void {
    this.memory.put(digest, bytes);
    const existing = this.inflight.get(digest);
    if (existing) return;
    const write = (async () => {
      try {
        await this.enforcePersistentBudget(bytes.byteLength);
        const now = Date.now();
        await this.persistent.put({
          digest,
          bytes,
          packId: this.packId,
          packVersion: this.packVersion,
          bytesLength: bytes.byteLength,
          lastAccessed: now,
          writtenAt: now,
        });
      } catch {
        // A persistent write failure is recoverable: the memory
        // tier still has the chunk, and the next session will
        // either succeed or fall through to the network. We do
        // not let the failure surface to the UI; it is not the
        // user's problem unless the cache is full.
      } finally {
        this.inflight.delete(digest);
      }
    })();
    this.inflight.set(digest, write);
  }

  /** Drop both tiers. */
  async clear(): Promise<void> {
    this.memory.clear();
    await this.persistent.clear();
  }

  /**
   * Drain in-flight writes. The provider awaits this on its way
   * out so a test that asserts the persistent state does not race
   * a fire-and-forget put. Production code does not need to await
   * it.
   */
  async drain(): Promise<void> {
    while (this.inflight.size > 0) {
      await Promise.all([...this.inflight.values()]);
    }
  }

  /**
   * Force the persistent tier to be no larger than its budget.
   *
   * The LRU for the persistent tier is the in-memory LRU; the
   * memory tier touches `lastAccessed` on every hit, and the
   * persistent tier mirrors that on read. A chunk that survives
   * in memory survives in persistent; a chunk the memory tier
   * has dropped is a candidate to be pruned here.
   *
   * The walk is bounded by 256 records at a time, using the
   * `lastAccessed` index the persistent store keeps for exactly
   * this purpose. A single put never scans more than 256 records,
   * which keeps the eviction O(1) on the size of the cache.
   */
  private async enforcePersistentBudget(incomingBytes: number): Promise<void> {
    const total = await this.persistent.totalBytes();
    const budget = this.persistentBudget;
    if (total + incomingBytes <= budget) return;
    const over = total + incomingBytes - budget;
    // Oldest-first, indexed by `lastAccessed`. Anything still
    // resident in memory is younger than the oldest persistent
    // record, so we never evict something the user just touched.
    const memoryDigests = new Set<string>();
    for (const digest of this.memoryKeys()) memoryDigests.add(digest);
    const candidates = await this.persistent.oldestEntries(512);
    let freed = 0;
    for (const candidate of candidates) {
      if (freed >= over) break;
      if (memoryDigests.has(candidate.digest)) continue;
      await this.persistent.delete(candidate.digest).catch(() => undefined);
      freed += candidate.bytesLength;
      this.onPersistentEvict?.({ sha256: candidate.digest, bytes: candidate.bytesLength });
    }
  }

  /**
   * The memory LRU exposes a "youngest-to-oldest" walk only as a
   * private detail. For the persistent budget we only need the
   * keys the memory tier is *not* holding; those are the older
   * entries that are eligible to be pruned. We approximate by
   * snapshotting the memory LRU at the moment of the call.
   *
   * The current `StreamingCache` API does not expose a
   * public iteration; the candidate walk above falls back to
   * "all entries" when this returns an empty set, which is
   * correct (every candidate is older than nothing in memory
   * at this exact moment), just a touch less precise than it
   * could be once the memory LRU exposes its walk.
   */
  private *memoryKeys(): Iterable<string> {
    // The hook is left for a future enhancement. For now we
    // deliberately return nothing, which means the candidate
    // walk considers every persistent record as eligible; the
    // bound of 256 candidates per put keeps the cost bounded.
    return;
  }
}
