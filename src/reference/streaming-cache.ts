'use client';

/**
 * Bounded LRU byte-budget cache for streamed reference chunks.
 *
 * Phase 29 (PART AS): the brief asks the stream cache to be
 * LRU-or-equivalent, sized in the hundreds of megabytes, and to
 * cache only disposable reference chunks. A user-authored Study,
 * Repertoire or imported PGN is never evicted by this cache, and
 * a chunk that fails its SHA-256 verification is never written
 * to it.
 *
 * The first cut is an in-memory LRU with a byte budget. The
 * persistent IndexedDB layer is measured separately: today's
 * shard size is small enough that an in-memory cache is the
 * simpler, safer default, and the IndexedDB write-amplification
 * question is something we want numbers for before committing.
 * The class is designed so a future persistent store can be
 * slotted in behind the same `get` / `put` shape.
 */

import type { PackManifest } from './pack';

const DEFAULT_WEB_BUDGET = 256 * 1024 * 1024;
const DEFAULT_DESKTOP_BUDGET = 512 * 1024 * 1024;

const isDesktop = (): boolean =>
  typeof navigator !== 'undefined' && /Kingfisher|Electron/i.test(navigator.userAgent);

export interface StreamingCacheOptions {
  /** Pack id, used to namespace the cache. */
  readonly packId: string;
  /** Pack version, so a v2 cache does not share budget with a v1. */
  readonly packVersion: string;
  /** Approximate byte budget for the in-memory LRU. */
  readonly budgetBytes?: number;
  /**
   * Called for every entry evicted from the in-memory LRU. The
   * default is a no-op; production code wires it to telemetry.
   */
  readonly onEvict?: (entry: { readonly sha256: string; readonly bytes: number }) => void;
}

interface LruNode {
  sha256: string;
  bytes: Uint8Array;
  prev: LruNode | null;
  next: LruNode | null;
}

class Lru {
  private readonly map = new Map<string, LruNode>();
  readonly budget: number;
  private bytes = 0;
  private head: LruNode | null = null;
  private tail: LruNode | null = null;

  constructor(budget: number) {
    this.budget = Math.max(1, budget);
  }

  has(sha256: string): boolean {
    return this.map.has(sha256);
  }

  get(sha256: string): Uint8Array | null {
    const node = this.map.get(sha256);
    if (!node) return null;
    this.touch(node);
    return node.bytes;
  }

  set(sha256: string, bytes: Uint8Array): void {
    const previous = this.map.get(sha256);
    if (previous) {
      this.bytes -= previous.bytes.byteLength;
      this.unlink(previous);
      this.map.delete(sha256);
    }
    const node: LruNode = { sha256, bytes, prev: null, next: null };
    this.map.set(sha256, node);
    this.bytes += bytes.byteLength;
    this.linkHead(node);
  }

  delete(sha256: string): boolean {
    const node = this.map.get(sha256);
    if (!node) return false;
    this.bytes -= node.bytes.byteLength;
    this.unlink(node);
    this.map.delete(sha256);
    return true;
  }

  clear(): void {
    this.map.clear();
    this.bytes = 0;
    this.head = null;
    this.tail = null;
  }

  size(): number {
    return this.map.size;
  }

  totalBytes(): number {
    return this.bytes;
  }

  /**
   * Walk the doubly linked list from the tail backwards, returning
   * entries in least-recently-used order. Used by the eviction
   * loop so the budget can be enforced without exposing the list
   * itself.
   */
  *byLeastRecentlyUsed(): IterableIterator<LruNode> {
    let current = this.tail;
    while (current) {
      yield current;
      current = current.prev;
    }
  }

  private touch(node: LruNode): void {
    if (this.head === node) return;
    this.unlink(node);
    this.linkHead(node);
  }

  private linkHead(node: LruNode): void {
    node.prev = null;
    node.next = this.head;
    if (this.head) this.head.prev = node;
    this.head = node;
    if (!this.tail) this.tail = node;
  }

  private unlink(node: LruNode): void {
    if (node.prev) node.prev.next = node.next;
    else this.head = node.next;
    if (node.next) node.next.prev = node.prev;
    else this.tail = node.prev;
    node.prev = null;
    node.next = null;
  }
}

export class StreamingCache {
  readonly packId: string;
  readonly packVersion: string;
  private readonly lru: Lru;
  private readonly onEvict: StreamingCacheOptions['onEvict'];

  constructor(options: StreamingCacheOptions) {
    const budget =
      options.budgetBytes ?? (isDesktop() ? DEFAULT_DESKTOP_BUDGET : DEFAULT_WEB_BUDGET);
    this.packId = options.packId;
    this.packVersion = options.packVersion;
    this.lru = new Lru(budget);
    this.onEvict = options.onEvict;
  }

  /** Approximate bytes currently held. */
  bytes(): number {
    return this.lru.totalBytes();
  }

  /** Number of chunks currently held. */
  size(): number {
    return this.lru.size();
  }

  /** Look up a chunk by digest. */
  get(sha256: string): Uint8Array | null {
    return this.lru.get(sha256);
  }

  /**
   * Store a verified chunk. The caller is responsible for
   * SHA-256 verification before calling `put`; this method does
   * not re-verify. Eviction runs after the put so a single chunk
   * never pushes the budget by more than its own size.
   */
  put(sha256: string, bytes: Uint8Array): void {
    this.lru.set(sha256, bytes);
    this.evictToBudget();
  }

  /** Drop everything. */
  clear(): void {
    this.lru.clear();
  }

  /** The byte budget this cache was constructed with. */
  budget(): number {
    return this.lru.budget;
  }

  private evictToBudget(): void {
    const over = this.lru.totalBytes() - this.lru.budget;
    if (over <= 0) return;
    let remaining = over;
    for (const victim of this.lru.byLeastRecentlyUsed()) {
      if (remaining <= 0) break;
      this.lru.delete(victim.sha256);
      remaining -= victim.bytes.byteLength;
      if (this.onEvict) this.onEvict({ sha256: victim.sha256, bytes: victim.bytes.byteLength });
    }
  }
}

/**
 * Build a cache sized for a manifest. The manifest's
 * `compressedBytes` is the natural upper bound; the brief's
 * measurement step is what decides whether to use that or a
 * fixed default. Until then the conservative default wins.
 */
export function streamingCacheForManifest(manifest: PackManifest): StreamingCache {
  return new StreamingCache({ packId: manifest.id, packVersion: manifest.version });
}
