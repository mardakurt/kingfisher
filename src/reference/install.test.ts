import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

import { openPersistenceDatabaseAt } from '@/persistence/indexeddb/database';
import { DATABASE_VERSION } from '@/persistence/schema/migrations';

import { fetchManifest, installPack, parseManifest, verifyPack, PackInstallError } from './install';
import { PACK_FORMAT, chunkFile, chunkId, type PackManifest } from './pack';
import { PackReader } from './reader';
import { ReferencePackStore } from './store';

/**
 * Installation is the part of the reference system that has to be right when
 * things go wrong: a truncated download, a corrupted file, a cancelled click.
 * The property under test throughout is that none of those can leave a source
 * that is listed, enabled and answering from half its data.
 */

const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

function fixture() {
  const chunks = new Map<string, Uint8Array>();
  const add = (
    kind: 'explorer' | 'game' | 'players' | 'playergames',
    shard: number,
    body: string,
  ) => chunks.set(chunkFile(kind, shard), new Uint8Array(gzipSync(Buffer.from(body, 'utf8'))));

  add(
    'explorer',
    0,
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -|e4,e2e4,100,40,35,25,2500,126,60,25,20,15|g1\n',
  );
  add(
    'game',
    0,
    [
      'g1',
      'A',
      'B',
      '1-0',
      '2025',
      '2025.01.02',
      'E',
      'B90',
      'Najdorf',
      '2700',
      '2680',
      'http://x',
      'e4 c5',
    ].join('\t') + '\n',
  );
  add(
    'players',
    0,
    ['a', '', 'A', '1', 'GM', '10', '2020', '2025', '2700', '2690'].join('\t') + '\n',
  );
  add('playergames', 0, 'a|g1\n');

  const manifest: PackManifest = {
    format: PACK_FORMAT,
    id: 'fixture-pack',
    name: 'Fixture Reference',
    description: 'A pack made for tests.',
    version: '1',
    builtAt: '2026-09-01',
    license: { id: 'CC0-1.0', name: 'CC0', url: 'https://example.invalid/cc0' },
    provenance: {
      source: 'Fixture',
      url: 'https://example.invalid/',
      retrieved: '2026-09-01',
      transformation: 'None.',
      upstream: [],
    },
    counts: { games: 100, openable: 1, positions: 1, players: 1 },
    recentSince: 2025,
    shards: { explorer: 1, game: 1, players: 1, playergames: 1 },
    chunks: (['explorer', 'game', 'players', 'playergames'] as const).map((kind) => {
      const file = chunkFile(kind, 0);
      const bytes = chunks.get(file) as Uint8Array;
      return {
        id: chunkId(kind, 0),
        kind,
        shard: 0,
        file,
        bytes: bytes.byteLength,
        sha256: digest(bytes),
        entries: 1,
      };
    }),
    rawBytes: 400,
    compressedBytes: [...chunks.values()].reduce((sum, bytes) => sum + bytes.byteLength, 0),
  };
  return { manifest, chunks };
}

const responder =
  (
    manifest: PackManifest,
    chunks: Map<string, Uint8Array>,
    damage?: (file: string) => Uint8Array | null | undefined,
  ) =>
  async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    if (url.endsWith('manifest.json')) return new Response(JSON.stringify(manifest));
    const file = url.slice(url.lastIndexOf('/') + 1);
    const replaced = damage?.(file);
    if (replaced === null) return new Response('nope', { status: 404 });
    const body = replaced ?? chunks.get(file);
    if (!body) return new Response('missing', { status: 404 });
    return new Response(body as BodyInit);
  };

let counter = 0;
async function freshStore() {
  const database = await openPersistenceDatabaseAt(
    DATABASE_VERSION,
    `kingfisher-reference-test-${++counter}`,
  );
  return new ReferencePackStore(database);
}

describe('parsing a pack manifest', () => {
  it('refuses a manifest in a format this build cannot read', () => {
    expect(() => parseManifest({ format: 'kingfisher-pack/99', id: 'x' })).toThrow(
      PackInstallError,
    );
  });

  it('refuses a chunk with no usable digest, rather than installing unverifiable data', () => {
    const { manifest } = fixture();
    const tampered = {
      ...manifest,
      chunks: [{ ...manifest.chunks[0], sha256: 'not-a-digest' }],
    };
    expect(() => parseManifest(tampered)).toThrow(/digest/);
  });

  it('accepts a well-formed one', () => {
    const { manifest } = fixture();
    expect(parseManifest(JSON.parse(JSON.stringify(manifest))).id).toBe('fixture-pack');
  });
});

describe('installing a pack', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('stores every chunk and marks the pack ready', async () => {
    const store = await freshStore();
    const { manifest, chunks } = fixture();
    const progress: string[] = [];

    const installed = await installPack(manifest, '/packs/manifest.json', store, {
      fetcher: responder(manifest, chunks) as typeof fetch,
      onProgress: (event) => progress.push(`${event.phase}:${event.chunksDone}`),
    });

    expect(installed.state).toBe('ready');
    expect(installed.chunksInstalled).toBe(4);
    expect(progress.at(-1)).toBe('done:4');
    expect(await verifyPack(installed, store)).toEqual([]);
  });

  it('leaves nothing installed when a chunk fails its digest', async () => {
    const store = await freshStore();
    const { manifest, chunks } = fixture();

    await expect(
      installPack(manifest, '/packs/manifest.json', store, {
        fetcher: responder(manifest, chunks, (file) =>
          file.startsWith('players')
            ? new Uint8Array(gzipSync(Buffer.from('tampered\n')))
            : undefined,
        ) as typeof fetch,
      }),
    ).rejects.toThrow(/does not match the digest/);

    expect(await store.get('fixture-pack')).toBeUndefined();
    expect(await store.list()).toEqual([]);
  });

  it('leaves nothing installed when a chunk cannot be downloaded', async () => {
    const store = await freshStore();
    const { manifest, chunks } = fixture();

    await expect(
      installPack(manifest, '/packs/manifest.json', store, {
        fetcher: responder(manifest, chunks, (file) =>
          file.startsWith('playergames') ? null : undefined,
        ) as typeof fetch,
      }),
    ).rejects.toThrow(/HTTP 404/);

    expect(await store.get('fixture-pack')).toBeUndefined();
  });

  it('keeps what it has when cancelled, and finishes on the next attempt', async () => {
    const store = await freshStore();
    const { manifest, chunks } = fixture();
    const controller = new AbortController();
    let served = 0;

    await expect(
      installPack(manifest, '/packs/manifest.json', store, {
        signal: controller.signal,
        fetcher: (async (input: RequestInfo | URL) => {
          served += 1;
          if (served > 2) controller.abort();
          controller.signal.throwIfAborted();
          return responder(manifest, chunks)(input);
        }) as typeof fetch,
      }),
    ).rejects.toThrow();

    const halfway = await store.get('fixture-pack');
    expect(halfway?.state).toBe('installing');
    expect(halfway?.chunksInstalled).toBeGreaterThan(0);
    expect(halfway?.chunksInstalled).toBeLessThan(4);

    const finished = await installPack(manifest, '/packs/manifest.json', store, {
      fetcher: responder(manifest, chunks) as typeof fetch,
    });
    expect(finished.state).toBe('ready');
    expect(await verifyPack(finished, store)).toEqual([]);
  });

  it('reports which chunks a damaged installation lost', async () => {
    const store = await freshStore();
    const { manifest, chunks } = fixture();
    const installed = await installPack(manifest, '/packs/manifest.json', store, {
      fetcher: responder(manifest, chunks) as typeof fetch,
    });
    await store.putChunk('fixture-pack', chunkId('game', 0), new Uint8Array([1, 2, 3]));
    expect(await verifyPack(installed, store)).toEqual([chunkId('game', 0)]);
  });

  it('removes a pack and the chunks it owned', async () => {
    const store = await freshStore();
    const { manifest, chunks } = fixture();
    await installPack(manifest, '/packs/manifest.json', store, {
      fetcher: responder(manifest, chunks) as typeof fetch,
    });
    await store.remove('fixture-pack');
    expect(await store.list()).toEqual([]);
    expect(await store.read(manifest, chunkId('explorer', 0))).toBeNull();
    expect(await store.orphans()).toEqual([]);
  });
});

describe('reading an installed pack', () => {
  it('answers a position, a game, a player and a player game list', async () => {
    const store = await freshStore();
    const { manifest, chunks } = fixture();
    await installPack(manifest, '/packs/manifest.json', store, {
      fetcher: responder(manifest, chunks) as typeof fetch,
    });

    const reader = new PackReader(manifest, store);
    const position = await reader.position('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -');
    expect(position?.moves[0]?.san).toBe('e4');
    expect(position?.moves[0]?.recentGames).toBe(60);

    expect((await reader.game('g1'))?.black).toBe('B');
    expect((await reader.player('a'))?.title).toBe('GM');
    expect(await reader.playerGames('a')).toEqual(['g1']);
    expect((await reader.allPlayers()).length).toBe(1);
    expect(await reader.position('not a position')).toBeNull();
  });
});

describe('fetching a manifest', () => {
  it('says what went wrong when the server does not serve one', async () => {
    await expect(
      fetchManifest('/packs/manifest.json', {
        fetcher: (async () => new Response('nope', { status: 503 })) as typeof fetch,
      }),
    ).rejects.toThrow(/HTTP 503/);
  });
});
