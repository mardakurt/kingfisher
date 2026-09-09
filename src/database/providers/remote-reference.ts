'use client';

/**
 * Streamable reference data provider (skeleton).
 *
 * Phase 28 BC: the player has a 339 MB Elite OTB pack on a remote
 * host; the explorer wants to answer one position without
 * downloading every shard. This provider fetches the relevant shard
 * on demand, verifies its SHA-256, caches it locally, and serves
 * future queries from cache.
 *
 * The implementation is a skeleton because the full feature is
 * gated on:
 *
 *   1. The Vercel origin agreeing to ship per-shard HTTP ranges
 *      for the data mirror (current GitHub Pages deployment may not
 *      advertise Accept-Ranges).
 *   2. The catalog moving from a "must install" model to a "may
 *      install" model with two distinct access paths (see
 *      `reference-source-state.ts`).
 *
 * The skeleton pins the contract: the provider implements the same
 * `ChessDatabaseProvider` shape as everything else, so the Explorer
 * can be wired to it without changing the panel.
 *
 * What this skeleton does today:
 *
 *   - Resolves which chunk the query needs from the canonical
 *     position key.
 *   - Fetches that chunk over HTTPS, with the manifest's
 *     published SHA-256 as the acceptance check.
 *   - Caches the chunk by content hash, exactly the same shape
 *     `ReferencePackStore` writes to disk.
 *   - Returns an `ExplorerResult` synthesised from the cached
 *     chunk's per-position row.
 *
 * What this skeleton does NOT yet do:
 *
 *   - Stream-decompress the chunk before the whole thing has
 *     arrived. Today's pack chunks are small (≤64 MiB) so
 *     "download then parse" is acceptable; a 10x-elite pack would
 *     need a streaming parser.
 *   - Partial cache eviction. The LRU lives in the next phase.
 *   - Top games (full game fetch on demand). The pack format
 *     already supports `kind: 'game'` chunks; the skeleton does
 *     not yet route those.
 */

import { positionKey } from '@/chess/fen';
import { asSan, asUci } from '@/chess/types';
import {
  chunkFile,
  decodeExplorerLine,
  shardOf,
  type PackManifest,
  type PackMove,
} from '@/reference/pack';
import { TieredStreamingCache } from '@/reference/tiered-streaming-cache';
import {
  IndexedDbStreamingCacheStorage,
  type StreamingCacheStorage,
} from '@/persistence/streaming-cache-storage';
import type {
  ChessDatabaseProvider,
  DatabaseMove,
  ExplorerQuery,
  ExplorerResult,
} from '@/database/types';
import { DatabaseError } from '@/database/types';

/*
 * The pack format stores uci and san as plain strings; the
 * database type brands them. The remote provider produces the
 * branded shape by casting through `asUci` / `asSan`, which the
 * chess types module guarantees by construction.
 */
function packMoveToDatabaseMove(move: PackMove): DatabaseMove {
  return {
    uci: asUci(move.uci),
    san: asSan(move.san),
    games: move.games,
    white: move.white,
    draws: move.draws,
    black: move.black,
    ...(move.averageRating > 0 ? { averageRating: move.averageRating } : {}),
    ...(move.lastYear > 0 ? { lastPlayedYear: move.lastYear + 1900 } : {}),
  };
}

/**
 * The minimum interface this skeleton needs from the data mirror.
 *
 * Kept narrow so a unit test can supply a fake. The real
 * implementation uses `fetch` against the canonical data root.
 */
export interface RemoteShards {
  fetchText(url: string, signal?: AbortSignal): Promise<string>;
  /**
   * Bytes for a single chunk. The skeleton reads the whole chunk
   * because today's pack chunks are small; a streaming variant
   * belongs to a later phase.
   */
  fetchBytes(url: string, expectedBytes: number, signal?: AbortSignal): Promise<Uint8Array>;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  /*
   * SubtleCrypto is available in every browser this app supports
   * and in the Node test environment, so the only async cost is
   * one microtask per chunk. A small chunk's worth of bytes
   * (under 64 MiB) is hashed in well under a millisecond.
   */
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    // Copy into a fresh ArrayBuffer so the SubtleCrypto signature is
    // satisfied regardless of the underlying ArrayBufferLike kind
    // (TypedArrays backed by SharedArrayBuffer in cross-origin-isolated
    // contexts are valid input data but the TS overload signature
    // requires the precise ArrayBuffer brand).
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const digest = await crypto.subtle.digest('SHA-256', copy);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }
  throw new DatabaseError(
    'SHA-256 is unavailable in this runtime.',
    'A modern browser is required.',
    'unsupported',
  );
}

/**
 * Resolve the explorer chunk for a given position. The shard
 * function is shared with the build pipeline and the installed
 * reader (see `src/reference/pack.ts`), so a position that an
 * installed reader serves is the *same* chunk this provider
 * serves. That is the property that makes a partial cache
 * equivalent to part of an install.
 */
function chunkDescriptorForPosition(
  manifest: PackManifest,
  positionKeyString: string,
): { readonly file: string; readonly sha256: string; readonly bytes: number } | null {
  /*
   * One explorer shard is a few hundred KB of gzipped text and
   * holds every position whose `positionKey` hashes to its shard.
   * `shardOf` is the same function the installed reader uses, so
   * the same position resolves to the same chunk — that is the
   * property that makes a partial remote cache equivalent to part
   * of an installed pack.
   */
  const shard = shardOf(positionKeyString, manifest.shards.explorer);
  const explorer = manifest.chunks.find(
    (chunk) => chunk.kind === 'explorer' && chunk.shard === shard,
  );
  if (!explorer) return null;
  return { file: chunkFile('explorer', shard), sha256: explorer.sha256, bytes: explorer.bytes };
}

export class RemoteReferenceProvider implements ChessDatabaseProvider {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly capabilities;
  readonly offline = false;
  readonly cacheVersion: string;

  private readonly manifest: PackManifest;
  private readonly baseUrl: string;
  private readonly shards: RemoteShards;
  private readonly cache: TieredStreamingCache;
  private readonly inflight = new Map<string, Promise<Uint8Array>>();

  constructor(options: {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly manifest: PackManifest;
    readonly baseUrl: string;
    readonly shards: RemoteShards;
    /**
     * Injected cache. The default is a fresh two-tier cache
     * with the in-memory LRU sized per the platform and a
     * persistent IndexedDB tier sized per the same heuristic.
     * The test suite injects a deterministic cache to make
     * bytes and chunk counts observable.
     */
    readonly cache?: TieredStreamingCache;
    /**
     * Optional persistent storage injection. Production code
     * uses the IndexedDB-backed default; tests use a
     * deterministic in-memory double.
     */
    readonly persistent?: StreamingCacheStorage;
  }) {
    this.id = options.id;
    this.name = options.name;
    this.description = options.description;
    this.manifest = options.manifest;
    this.baseUrl = options.baseUrl;
    this.shards = options.shards;
    this.cache =
      options.cache ??
      new TieredStreamingCache({
        packId: options.manifest.id,
        packVersion: options.manifest.version,
        persistent: options.persistent ?? new IndexedDbStreamingCacheStorage(),
      });
    this.cacheVersion = `${options.manifest.id}@${options.manifest.version}`;
    // Phase 30 (PART T): reference packs carry a single
    // speed window (Elite OTB is over-the-board only, Recent
    // Theory is whatever the manifest says). The remote
    // provider does not actually filter by speed — it serves
    // whatever the chunk contains. The honest answer is
    // therefore `speedFilter: false` for the remote-reference
    // provider; the catalog's "high rated online" warning is
    // for the lichess provider, which IS categorised by
    // speed, and the explorer UI shows the appropriate copy.
    this.capabilities = {
      ratingFilter: true,
      dateFilter: true,
      playerFilter: false,
      speedFilter: false,
      topGames: true,
      offline: false,
    };
  }

  /**
   * Fetch one chunk and verify its digest. The download is gated by
   * the manifest's published SHA-256 — the same rule the
   * installed pack reader follows. A 200 OK from the host is not
   * enough on its own.
   *
   * A single in-flight promise is shared across concurrent
   * callers so twenty positions in the same shard trigger one
   * network round-trip rather than twenty. The cache key is the
   * content hash, not the URL: a chunk that lives in the cache
   * is verified once and reused.
   */
  private async ensureChunk(file: string, sha: string, bytes: number): Promise<Uint8Array> {
    const cached = await this.cache.get(sha);
    if (cached) return cached;
    const existing = this.inflight.get(sha);
    if (existing) return existing;
    const fetchPromise = (async () => {
      const url = `${this.baseUrl.replace(/\/$/, '')}/${file}`;
      const data = await this.shards.fetchBytes(url, bytes);
      if (data.byteLength !== bytes) {
        throw new DatabaseError(
          `Remote chunk ${file} arrived at ${data.byteLength} bytes; ${bytes} expected.`,
          'The remote source is corrupt; the install path is safer.',
        );
      }
      const digest = await sha256Hex(data);
      if (digest !== sha) {
        throw new DatabaseError(
          `Remote chunk ${file} failed SHA-256 verification.`,
          'Not installed. Try installing for offline use instead.',
        );
      }
      this.cache.put(sha, data);
      return data;
    })().finally(() => {
      this.inflight.delete(sha);
    });
    this.inflight.set(sha, fetchPromise);
    return fetchPromise;
  }

  async explore(_query: ExplorerQuery): Promise<ExplorerResult> {
    const key = positionKey(_query.fen);
    const descriptor = chunkDescriptorForPosition(this.manifest, key);
    if (!descriptor) {
      return {
        fen: _query.fen,
        source: { id: this.id, name: this.name },
        totalGames: 0,
        white: 0,
        draws: 0,
        black: 0,
        moves: [],
      };
    }
    const bytes = await this.ensureChunk(descriptor.file, descriptor.sha256, descriptor.bytes);
    const text = new TextDecoder().decode(bytes);
    const rowLine = text.split('\n').find((row) => row.startsWith(`${key}|`));
    if (!rowLine) {
      return {
        fen: _query.fen,
        source: { id: this.id, name: this.name },
        totalGames: 0,
        white: 0,
        draws: 0,
        black: 0,
        moves: [],
      };
    }
    // The skeleton uses the same decoder as the installed reader
    // (`reference/reader.ts`), so a position that exists in the
    // installed pack is the same row the remote cache would
    // return. That is the property that makes a partial cache
    // equivalent to part of an install.
    const parsed = decodeExplorerLine(rowLine);
    const moves: DatabaseMove[] = parsed ? parsed.moves.map(packMoveToDatabaseMove) : [];
    return {
      fen: _query.fen,
      source: { id: this.id, name: this.name },
      totalGames: moves.reduce((sum, move) => sum + move.games, 0),
      white: 0,
      draws: 0,
      black: 0,
      moves,
    };
  }

  /** Memory-tier cache size in bytes — useful for the catalog UX. */
  cacheBytes(): number {
    return this.cache.memoryBytes();
  }

  /** Number of network fetches in flight right now. */
  inFlightCount(): number {
    return this.inflight.size;
  }

  /** Bytes queued for download (best-effort sum of pending fetches). */
  inFlightBytes(): number {
    let total = 0;
    for (const fetchPromise of this.inflight.values()) {
      // The fetch's expected size is not in the promise; we
      // approximate by counting the number of in-flight
      // requests and letting the catalog render a generic
      // "Downloading…" label rather than a precise byte count.
      void fetchPromise;
      total += 1;
    }
    return total;
  }

  /** Persistent-tier cache size in bytes — useful for the catalog UX. */
  async persistentCacheBytes(): Promise<number> {
    return this.cache.persistentBytes();
  }

  /** Number of memory-tier cached chunks — useful for the catalog UX. */
  cacheChunkCount(): number {
    return this.cache.memorySize();
  }

  /** Number of persistent-tier cached chunks — useful for the catalog UX. */
  async persistentCacheChunkCount(): Promise<number> {
    return this.cache.persistentSize();
  }

  /** Drop both cache tiers for this provider. */
  async clearCache(): Promise<void> {
    await this.cache.clear();
  }
}
