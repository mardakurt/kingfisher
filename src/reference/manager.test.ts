import 'fake-indexeddb/auto';

import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { chunkFile, chunkId, PACK_FORMAT, type PackManifest } from './pack';
import { BUNDLED_PACK_ID } from './catalog';
import {
  initialiseReferences,
  packReader,
  referenceSnapshot,
  resetReferenceManagerForTests,
} from './manager';
import { referencePackStore, resetReferencePackStoreForTests } from './store';

/**
 * The bundled reference is the one source whose new version arrives with the
 * application rather than over a network. Before Phase 15 it installed only if
 * it was *missing*, so a profile created a year earlier kept answering from a
 * year-old table while the data it should have been reading sat unused in the
 * build's own assets — silently, because nothing was broken and nothing said so.
 */

const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

function bundled(version: string, white: string) {
  const bodies = new Map<string, Uint8Array>([
    [
      chunkFile('explorer', 0),
      new Uint8Array(
        gzipSync(
          Buffer.from(
            'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -|' +
              'e4,e2e4,100,40,35,25,2500,126,60,25,20,15|g1\n',
          ),
        ),
      ),
    ],
    [
      chunkFile('game', 0),
      new Uint8Array(
        gzipSync(
          Buffer.from(
            [
              'g1',
              white,
              'B',
              '1-0',
              '2025',
              '2025.01.02',
              'E',
              'B90',
              'Najdorf',
              '2700',
              '2680',
              'https://x',
              'e4 c5',
            ].join('\t') + '\n',
          ),
        ),
      ),
    ],
    [
      chunkFile('players', 0),
      new Uint8Array(
        gzipSync(
          Buffer.from(
            ['a', '', 'A', '1', 'GM', '10', '2020', '2025', '2700', '2690'].join('\t') + '\n',
          ),
        ),
      ),
    ],
    [chunkFile('playergames', 0), new Uint8Array(gzipSync(Buffer.from('a|g1\n')))],
  ]);

  const manifest: PackManifest = {
    format: PACK_FORMAT,
    id: BUNDLED_PACK_ID,
    name: 'Kingfisher Starter Reference',
    description: 'Test fixture standing in for the bundled pack.',
    version,
    builtAt: '2026-09-05',
    license: { id: 'CC0-1.0', name: 'CC0', url: 'https://example.test/cc0' },
    provenance: {
      source: 'Fixture',
      url: 'https://example.test/source',
      retrieved: '2026-09-05',
      transformation: 'None; this is a fixture.',
      upstream: [{ file: 'fixture.pgn', sha256: digest(new Uint8Array([1])) }],
    },
    counts: { games: 1, openable: 1, positions: 1, players: 1 },
    maxPositionPly: 40,
    recentSince: 2025,
    shards: { explorer: 1, game: 1, players: 1, playergames: 1 },
    chunks: (['explorer', 'game', 'players', 'playergames'] as const).map((kind) => ({
      id: chunkId(kind, 0),
      kind,
      shard: 0,
      file: chunkFile(kind, 0),
      bytes: bodies.get(chunkFile(kind, 0))!.byteLength,
      sha256: digest(bodies.get(chunkFile(kind, 0))!),
      entries: 1,
    })),
    rawBytes: 512,
    compressedBytes: [...bodies.values()].reduce((sum, bytes) => sum + bytes.byteLength, 0),
  };
  return { manifest, bodies };
}

/** Serves whichever generation of the bundled pack the test is currently on. */
function serve(current: () => ReturnType<typeof bundled>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const { manifest, bodies } = current();
    if (url.endsWith('manifest.json')) return new Response(JSON.stringify(manifest));
    const body = bodies.get(url.slice(url.lastIndexOf('/') + 1));
    return body ? new Response(body as BodyInit) : new Response('missing', { status: 404 });
  });
}

let counter = 0;
beforeEach(() => {
  resetReferenceManagerForTests();
  resetReferencePackStoreForTests();
  // A distinct database per test; `fake-indexeddb/auto` shares one origin.
  globalThis.indexedDB.deleteDatabase(`kingfisher-manager-${counter++}`);
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetReferenceManagerForTests();
  resetReferencePackStoreForTests();
});

describe('bringing the bundled reference up on start-up', () => {
  it('installs it on a profile that has never had it', async () => {
    const generation = bundled('1', 'First');
    vi.stubGlobal(
      'fetch',
      serve(() => generation),
    );

    await initialiseReferences();

    const source = referenceSnapshot().sources.find((entry) => entry.id === BUNDLED_PACK_ID);
    expect(source?.state).toBe('ready');
    expect(source?.version).toBe('1');
    expect((await packReader(BUNDLED_PACK_ID)?.game('g1'))?.white).toBe('First');
  });

  it('replaces an older generation with the one this build ships', async () => {
    let generation = bundled('1', 'First');
    vi.stubGlobal(
      'fetch',
      serve(() => generation),
    );
    await initialiseReferences();
    expect(referenceSnapshot().sources.find((s) => s.id === BUNDLED_PACK_ID)?.version).toBe('1');

    // A new build of the application, carrying a rebuilt pack.
    resetReferenceManagerForTests();
    generation = bundled('2', 'Second');
    await initialiseReferences();

    const source = referenceSnapshot().sources.find((entry) => entry.id === BUNDLED_PACK_ID);
    expect(source?.state, 'the rebuilt pack should be installed without being asked').toBe('ready');
    expect(source?.version).toBe('2');
    expect((await packReader(BUNDLED_PACK_ID)?.game('g1'))?.white).toBe('Second');
  });

  it('reclaims the superseded generation rather than keeping both for ever', async () => {
    let generation = bundled('1', 'First');
    vi.stubGlobal(
      'fetch',
      serve(() => generation),
    );
    await initialiseReferences();

    resetReferenceManagerForTests();
    generation = bundled('2', 'Second');
    await initialiseReferences();

    const store = await referencePackStore();
    // Nothing is left that the active manifest does not refer to.
    const active = new Set(generation.manifest.chunks.map((chunk) => chunk.sha256));
    expect(await store.pruneChunks(BUNDLED_PACK_ID, active)).toBe(0);
  });

  it('leaves the installed pack alone when the shipped manifest cannot be read', async () => {
    const generation = bundled('1', 'First');
    vi.stubGlobal(
      'fetch',
      serve(() => generation),
    );
    await initialiseReferences();

    resetReferenceManagerForTests();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('offline');
      }),
    );
    await initialiseReferences();

    const source = referenceSnapshot().sources.find((entry) => entry.id === BUNDLED_PACK_ID);
    expect(source?.state, 'the installed pack still answers').toBe('ready');
    expect(source?.version).toBe('1');
  });
});
