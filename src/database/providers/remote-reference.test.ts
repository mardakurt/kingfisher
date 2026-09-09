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
