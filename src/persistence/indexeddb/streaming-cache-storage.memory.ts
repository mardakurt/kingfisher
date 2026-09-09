/**
 * In-memory double for the persistent streaming cache.
 *
 * The production path is IndexedDB; tests and any node-only
 * environment use this. The contract is identical to the IDB
 * implementation, so swapping one for the other is what the
 * tier above has to handle correctly.
 *
 * Records are kept as `StreamingCacheRecord` in a Map keyed
 * by digest, so iteration order is insertion order, and
 * `pruneToBudget` is honest when given insertion order as
 * its LRU proxy. A real eviction policy belongs to the
 * LRU above; this double only mirrors the IDB shape.
 */

import type { StreamingCacheRecord, StreamingCacheStorage } from '../streaming-cache-storage';

export class InMemoryStreamingCacheStorage implements StreamingCacheStorage {
  private readonly records = new Map<string, StreamingCacheRecord>();

  async get(digest: string): Promise<Uint8Array | null> {
    const record = this.records.get(digest);
    if (!record) return null;
    // Touch on read, exactly as the IDB path will when wired
    // through the LRU above. The LRU owns the eviction
    // contract, but a touch on read is what makes
    // `lastAccessed` honest.
    record.lastAccessed = Date.now();
    return record.bytes;
  }

  async put(record: StreamingCacheRecord): Promise<void> {
    const now = Date.now();
    this.records.set(record.digest, { ...record, lastAccessed: now, writtenAt: now });
  }

  async delete(digest: string): Promise<void> {
    this.records.delete(digest);
  }

  async clear(): Promise<void> {
    this.records.clear();
  }

  async *entries(): AsyncIterableIterator<StreamingCacheRecord> {
    for (const record of this.records.values()) yield record;
  }

  async totalBytes(): Promise<number> {
    let total = 0;
    for (const record of this.records.values()) total += record.bytesLength;
    return total;
  }

  async count(): Promise<number> {
    return this.records.size;
  }

  async pruneToBudget(candidates: readonly string[], budgetBytes: number): Promise<number> {
    const total = await this.totalBytes();
    const over = total - budgetBytes;
    if (over <= 0) return 0;
    let freed = 0;
    for (const digest of candidates) {
      if (freed >= over) break;
      const record = this.records.get(digest);
      if (!record) continue;
      this.records.delete(digest);
      freed += record.bytesLength;
    }
    return freed;
  }
}
