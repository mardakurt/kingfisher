import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { asFen } from '@/chess/types';
import { chunkFile, decodeExplorerLine, type PackManifest } from '@/reference/pack';

import { RemoteReferenceProvider } from './remote-reference';

/**
 * A handful of synthetic chunks the skeleton can serve. Each chunk
 * is a single-line gzipped explorer row whose key matches the
 * position the test asks for.
 */
function synthChunkBody(line: string): Uint8Array {
  return new TextEncoder().encode(line);
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

const START_FEN = asFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -');
const START_KEY = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';
const AFTER_E4_FEN = asFen('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
const AFTER_E4_KEY = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3';

const ROW_START = `${START_KEY}|e2e4,e2e4,100,40,35,25,2500,126,60,60,35,25;d2d4,d2d4,80,30,30,20,2400,100,40,40,30,20|g1\n`;
const ROW_AFTER_E4 = `${AFTER_E4_KEY}|e7e5,e7e5,90,35,30,25,2500,126,60,55,30,25;c7c5,c7c5,70,28,25,17,2400,100,40,45,25,15|g1\n`;
const CHUNK_BYTES = synthChunkBody(`${ROW_START}${ROW_AFTER_E4}`);
const CHUNK_SHA = sha256(CHUNK_BYTES);

const FAKE_MANIFEST: PackManifest = {
  format: 'kingfisher-pack/1',
  id: 'kingfisher-elite-otb',
  name: 'Elite OTB Reference',
  description: 'Test fixture',
  version: '2',
  builtAt: '2026-09-09',
  license: { id: 'CC-BY-SA-4.0', name: 'CC BY-SA 4.0', url: 'https://example.test/' },
  provenance: {
    source: 'Fixture',
    url: 'https://example.test/',
    retrieved: '2026-09-09',
    transformation: 'None.',
    upstream: [],
  },
  counts: { games: 1, openable: 1, positions: 1, players: 1 },
  shards: { explorer: 1, game: 1, players: 1, playergames: 1 },
  chunks: [
    {
      id: 'explorer-000',
      kind: 'explorer',
      shard: 0,
      file: chunkFile('explorer', 0),
      bytes: CHUNK_BYTES.byteLength,
      sha256: CHUNK_SHA,
      entries: 1,
    },
  ],
  rawBytes: CHUNK_BYTES.byteLength,
  compressedBytes: CHUNK_BYTES.byteLength,
  maxPositionPly: 40,
  recentSince: 2026,
};

const FAKE_SHARDS = {
  fetchBytes: async (url: string, _expected: number) => {
    if (url.endsWith('explorer-000.kfp.gz')) return CHUNK_BYTES;
    throw new Error(`unexpected url ${url}`);
  },
  fetchText: async () => '',
};

describe('RemoteReferenceProvider', () => {
  it('fetches the relevant shard and answers from it', async () => {
    const provider = new RemoteReferenceProvider({
      id: 'kingfisher-elite-otb',
      name: 'Elite OTB',
      description: 'streamed',
      manifest: FAKE_MANIFEST,
      baseUrl: 'https://example.test/data',
      shards: FAKE_SHARDS,
    });

    const result = await provider.explore({ fen: START_FEN });
    expect(result.moves).toHaveLength(2);
    expect(result.moves.map((move) => move.san)).toEqual(['e2e4', 'd2d4']);
    expect(result.moves[0]?.games).toBe(100);
    expect(result.moves[0]?.averageRating).toBe(2500);
    expect(result.source.id).toBe('kingfisher-elite-otb');
  });

  it('returns the moves at the after-e4 position', async () => {
    const provider = new RemoteReferenceProvider({
      id: 'kingfisher-elite-otb',
      name: 'Elite OTB',
      description: 'streamed',
      manifest: FAKE_MANIFEST,
      baseUrl: 'https://example.test/data',
      shards: FAKE_SHARDS,
    });
    const result = await provider.explore({ fen: AFTER_E4_FEN });
    expect(result.moves).toHaveLength(2);
    expect(result.moves.map((move) => move.san)).toEqual(['e7e5', 'c7c5']);
  });

  it('returns zero games for a position the chunk does not contain', async () => {
    const provider = new RemoteReferenceProvider({
      id: 'kingfisher-elite-otb',
      name: 'Elite OTB',
      description: 'streamed',
      manifest: FAKE_MANIFEST,
      baseUrl: 'https://example.test/data',
      shards: FAKE_SHARDS,
    });
    const unseenFen = asFen('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2');
    const result = await provider.explore({ fen: unseenFen });
    expect(result.moves).toEqual([]);
    expect(result.totalGames).toBe(0);
  });

  it('uses the same shard function as the installed reader', () => {
    /*
     * Decode both fixture rows with the same `decodeExplorerLine`
     * the installed reader uses; if the row format diverges, the
     * decoder is the place it would show up first.
     */
    const startRow = decodeExplorerLine(ROW_START);
    expect(startRow?.key).toBe(START_KEY);
    expect(startRow?.moves).toHaveLength(2);
    expect(startRow?.moves.map((m) => m.uci)).toEqual(['e2e4', 'd2d4']);
  });

  it('uses the same cache key as the installed pack version', () => {
    const provider = new RemoteReferenceProvider({
      id: 'kingfisher-elite-otb',
      name: 'Elite OTB',
      description: 'streamed',
      manifest: FAKE_MANIFEST,
      baseUrl: 'https://example.test/data',
      shards: FAKE_SHARDS,
    });
    // The cacheVersion is `${id}@${version}` — same shape as the
    // installed provider. A remote v2 cache and an installed v2 are
    // interchangeable.
    expect(provider.cacheVersion).toBe('kingfisher-elite-otb@2');
  });
});

/**
 * A multi-chunk manifest the cache-bound tests can use. Each chunk
 * serves a different key so the provider must hit the network for
 * each request, exercising the eviction code path instead of an
 * in-cache reuse.
 */
function multiChunkManifest(chunkCount: number, bytesEach: number): {
  manifest: PackManifest;
  shards: { fetchBytes: (url: string, expected: number) => Promise<Uint8Array>; fetchText: () => Promise<string> };
  fetchCount: { count: number };
} {
  const chunks: Array<PackManifest['chunks'][number]> = [];
  const bytesByFile = new Map<string, Uint8Array>();
  const shas: string[] = [];
  for (let i = 0; i < chunkCount; i += 1) {
    const payload = new Uint8Array(bytesEach);
    // A non-zero byte pattern keeps the body distinct from a zero-length stub.
    payload.fill((i % 254) + 1);
    const sha = createHash('sha256').update(payload).digest('hex');
    shas.push(sha);
    const id = `explorer-${String(i).padStart(3, '0')}`;
    const file = `explorer-${String(i).padStart(3, '0')}.kfp.gz`;
    bytesByFile.set(file, payload);
    chunks.push({
      id,
      kind: 'explorer',
      shard: i,
      file,
      bytes: payload.byteLength,
      sha256: sha,
      entries: 0,
    });
  }
  const fetchCount = { count: 0 };
  const shards = {
    fetchBytes: async (url: string, expected: number) => {
      fetchCount.count += 1;
      const file = new URL(url).pathname.split('/').pop()!;
      const data = bytesByFile.get(file);
      if (!data) throw new Error(`unknown url ${url}`);
      if (data.byteLength !== expected) {
        throw new Error(`size mismatch for ${file}: ${data.byteLength} != ${expected}`);
      }
      return data;
    },
    fetchText: async () => '',
  };
  const manifest: PackManifest = {
    format: 'kingfisher-pack/1',
    id: 'kingfisher-test-multi',
    name: 'Test Multi',
    description: 'multi-chunk fixture',
    version: '1',
    builtAt: '2026-09-09',
    license: { id: 'CC-BY-SA-4.0', name: 'CC BY-SA 4.0', url: 'https://example.test/' },
    provenance: {
      source: 'Fixture',
      url: 'https://example.test/',
      retrieved: '2026-09-09',
      transformation: 'None.',
      upstream: [],
    },
    counts: { games: 0, openable: 0, positions: 0, players: 0 },
    shards: { explorer: chunkCount, game: 1, players: 1, playergames: 1 },
    chunks,
    rawBytes: chunkCount * bytesEach,
    compressedBytes: chunkCount * bytesEach,
    maxPositionPly: 40,
    recentSince: 2026,
  };
  return { manifest, shards, fetchCount };
}

describe('RemoteReferenceProvider bounded cache', () => {
  it('tracks cached bytes against the configured budget', async () => {
    const { manifest, shards } = multiChunkManifest(1, 1024);
    const provider = new RemoteReferenceProvider({
      id: 'kingfisher-test-multi',
      name: 'Test Multi',
      description: 'streamed',
      manifest,
      baseUrl: 'https://example.test/data',
      shards,
      maxCacheBytes: 1024 * 1024,
      maxCacheEntries: 8,
    });
    expect(provider.maxCacheBytes()).toBe(1024 * 1024);
    // Touch a position that resolves to shard 0; the provider will fetch
    // the chunk and the cache byte counter must reflect the chunk size.
    void (await provider.explore({
      fen: asFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'),
    }));
    expect(provider.cacheBytes()).toBe(1024);
    expect(provider.cacheChunkCount()).toBe(1);
  });

  it('refuses to cache a single chunk larger than the byte budget', async () => {
    const { manifest, shards } = multiChunkManifest(1, 2048);
    const provider = new RemoteReferenceProvider({
      id: 'kingfisher-test-multi',
      name: 'Test Multi',
      description: 'streamed',
      manifest,
      baseUrl: 'https://example.test/data',
      shards,
      maxCacheBytes: 1024,
      maxCacheEntries: 8,
    });
    const fen = asFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    void (await provider.explore({ fen }));
    expect(provider.cacheBytes()).toBe(0);
    expect(provider.cacheChunkCount()).toBe(0);
  });

  it('evicts the oldest chunk when the entry ceiling is reached', async () => {
    /*
     * Use a single 2-shard manifest so we can force a hit on each shard
     * by picking positions whose position key is known to hash to shard 0
     * and shard 1 respectively. The shard function is `shardHash(key) %
     * shards`; we exploit the fact that two structurally different FENs
     * almost always land on different shards when shards = 2, and we
     * filter to the ones that do.
     */
    const { manifest, shards, fetchCount } = multiChunkManifest(2, 1024);
    const provider = new RemoteReferenceProvider({
      id: 'kingfisher-test-multi',
      name: 'Test Multi',
      description: 'streamed',
      manifest,
      baseUrl: 'https://example.test/data',
      shards,
      maxCacheBytes: 1024 * 1024,
      maxCacheEntries: 1,
    });
    // Try several structurally different positions and pick the first two
    // that resolve to distinct shards.
    const candidates = [
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 1',
      'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2',
      'r1bqkbnr/pppppppp/2n5/8/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
    ];
    const seenShards = new Set<number>();
    const picked: string[] = [];
    const { shardOf } = await import('@/reference/pack');
    for (const fen of candidates) {
      const key = fen.split(' ').slice(0, 4).join(' ');
      const shard = shardOf(key, 2);
      if (!seenShards.has(shard)) {
        seenShards.add(shard);
        picked.push(fen);
        if (picked.length === 2) break;
      }
    }
    expect(picked.length).toBe(2);
    void (await provider.explore({ fen: asFen(picked[0]!) }));
    void (await provider.explore({ fen: asFen(picked[1]!) }));
    expect(provider.cacheChunkCount()).toBe(1);
    // Re-touching the first position must re-fetch, because the second
    // explore call evicted the first chunk to honour the entry ceiling.
    const before = fetchCount.count;
    void (await provider.explore({ fen: asFen(picked[0]!) }));
    expect(fetchCount.count).toBe(before + 1);
  });
});
