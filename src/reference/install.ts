/**
 * Installing a reference pack.
 *
 * The contract is the one that matters for data a user will later cite: a pack
 * is either wholly installed and verified, or it is not installed at all.
 * There is no state in which the catalog lists a source that holds half a
 * million games and silently answers from three hundred thousand.
 *
 * That is enforced by writing the manifest as `installing` first and only
 * flipping it to `ready` once every chunk's SHA-256 has matched the digest the
 * manifest states. A cancel, a network failure, a corrupt archive and a closed
 * tab all leave the same recoverable shape — a pack marked `installing`, which
 * nothing reads from and which the next attempt resumes rather than restarts.
 */

import { PACK_FORMAT, chunkId, chunkFile, type PackManifest, type PackChunkKind } from './pack';
import { digestOf, gunzip } from './reader';
import type { InstalledPack, ReferencePackStore } from './store';
import { withPackLock } from './lock';

const KINDS: readonly PackChunkKind[] = ['explorer', 'game', 'players', 'playergames'];
const integer = (value: unknown, min = 0): value is number =>
  Number.isSafeInteger(value) && (value as number) >= min;
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const label = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 16_384;
export const MAX_CHUNK_BYTES = 64 * 1024 * 1024;

export type InstallPhase = 'manifest' | 'chunks' | 'verifying' | 'done';

export interface InstallProgress {
  readonly packId: string;
  readonly phase: InstallPhase;
  readonly chunksDone: number;
  readonly chunksTotal: number;
  readonly bytesDone: number;
  readonly bytesTotal: number;
}

export interface InstallOptions {
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: InstallProgress) => void;
  /** Replaces `fetch` in tests. */
  readonly fetcher?: typeof fetch;
}

/**
 * `unreachable` means nothing was learned; `invalid` means something was, and
 * it was wrong. The difference decides whether a failure is worth telling the
 * user about: a laptop on a train that cannot check for updates has no problem
 * to report, and a manifest that downloaded and then failed to parse does.
 */
export type PackFailure = 'unreachable' | 'invalid';

export class PackInstallError extends Error {
  constructor(
    message: string,
    readonly remedy: string,
    readonly kind: PackFailure = 'invalid',
  ) {
    super(message);
    this.name = 'PackInstallError';
  }
}

/** A manifest is only a manifest if it says so and lists chunks we can read. */
export function parseManifest(value: unknown): PackManifest {
  if (typeof value !== 'object' || value === null) {
    throw new PackInstallError('That download is not a Kingfisher pack.', 'Check the source.');
  }
  const manifest = value as Partial<PackManifest>;
  if (manifest.format !== PACK_FORMAT) {
    throw new PackInstallError(
      `This pack is in format "${String(manifest.format)}", which this version of Kingfisher cannot read.`,
      'Update Kingfisher, or install a pack built for this version.',
    );
  }
  if (
    !label(manifest.id) ||
    !/^[a-z0-9][a-z0-9_-]{0,127}$/.test(manifest.id) ||
    !label(manifest.name) ||
    !label(manifest.version) ||
    !label(manifest.description) ||
    !label(manifest.builtAt) ||
    !Array.isArray(manifest.chunks) ||
    manifest.chunks.length === 0 ||
    !object(manifest.shards)
  ) {
    throw new PackInstallError('That pack manifest is incomplete.', 'Check the source.');
  }
  for (const chunk of manifest.chunks) {
    if (typeof chunk?.file !== 'string' || !/^[0-9a-f]{64}$/.test(chunk?.sha256 ?? '')) {
      throw new PackInstallError(
        'That pack manifest names a chunk without a usable digest.',
        'Kingfisher will not install data it cannot verify.',
      );
    }
  }
  const fail = () => {
    throw new PackInstallError(
      'That pack manifest has invalid metadata or shard coverage.',
      'Use a complete pack with bounded sizes, unique shards and source attribution.',
    );
  };
  if (
    !object(manifest.license) ||
    !label(manifest.license.id) ||
    !label(manifest.license.name) ||
    !label(manifest.license.url) ||
    !object(manifest.provenance) ||
    !label(manifest.provenance.source) ||
    !label(manifest.provenance.url) ||
    !label(manifest.provenance.retrieved) ||
    !label(manifest.provenance.transformation) ||
    !Array.isArray(manifest.provenance.upstream) ||
    manifest.provenance.upstream.some(
      (entry) =>
        !object(entry) ||
        !label(entry.file) ||
        typeof entry.sha256 !== 'string' ||
        !/^[0-9a-f]{64}$/.test(entry.sha256),
    ) ||
    !object(manifest.counts) ||
    !['games', 'openable', 'positions', 'players'].every((key) =>
      integer((manifest.counts as unknown as Record<string, unknown>)[key]),
    ) ||
    manifest.counts.openable > manifest.counts.games ||
    !integer(manifest.rawBytes) ||
    !integer(manifest.compressedBytes, 1) ||
    !integer(manifest.recentSince) ||
    manifest.recentSince > 9999
  )
    fail();
  for (const url of [manifest.license?.url, manifest.provenance?.url]) {
    try {
      if (!['https:', 'http:'].includes(new URL(url as string).protocol)) fail();
    } catch {
      fail();
    }
  }
  const seen = new Set<string>();
  for (const kind of KINDS) {
    if (!integer(manifest.shards[kind], 1) || manifest.shards[kind] > 4096) fail();
  }
  for (const chunk of manifest.chunks) {
    if (
      !KINDS.includes(chunk.kind) ||
      !integer(chunk.shard) ||
      chunk.shard >= manifest.shards[chunk.kind as PackChunkKind] ||
      chunk.id !== chunkId(chunk.kind, chunk.shard) ||
      chunk.file !== chunkFile(chunk.kind, chunk.shard) ||
      seen.has(chunk.id) ||
      !integer(chunk.bytes, 1) ||
      chunk.bytes > MAX_CHUNK_BYTES ||
      !integer(chunk.entries)
    )
      fail();
    seen.add(chunk.id);
  }
  if (
    seen.size !== KINDS.reduce((sum, kind) => sum + manifest.shards![kind], 0) ||
    manifest.compressedBytes !== manifest.chunks.reduce((sum, chunk) => sum + chunk.bytes, 0)
  )
    fail();
  if (
    manifest.maxPositionPly !== undefined &&
    (!Number.isInteger(manifest.maxPositionPly) || manifest.maxPositionPly < 0)
  ) {
    throw new PackInstallError(
      'That pack manifest has an invalid Explorer depth.',
      'Kingfisher measures Explorer depth in non-negative plies.',
    );
  }
  return manifest as PackManifest;
}

export async function fetchManifest(url: string, options: InstallOptions = {}) {
  const request = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await request(url, { signal: options.signal });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new PackInstallError(
      'The pack description could not be reached.',
      'Check your connection and try again.',
      'unreachable',
    );
  }
  if (!response.ok) {
    /*
      A 404 is not a connection problem, and telling somebody to check theirs is
      worse than saying nothing: it sends them to their router over a fault that
      is entirely ours, and "try again" is advice that cannot work. The server
      answered — it said this source is not published at the address this build
      was given, which is a sentence about Kingfisher's publishing rather than
      about the user's machine.

      The failure *kind* stays `unreachable` deliberately. It is what decides
      whether a background update check stays quiet, and a pack whose address
      has gone away should not start reporting an error on every launch; the
      person who needs to know is the one who just pressed Install, and they get
      the message below.
    */
    const notPublished = response.status === 404 || response.status === 410;
    throw new PackInstallError(
      notPublished
        ? 'This reference source is not published at the address this version of Kingfisher looks for.'
        : `The pack description could not be downloaded (HTTP ${response.status}).`,
      notPublished
        ? 'Nothing is wrong with your connection or your copy of Kingfisher. Check for a newer release; Diagnostics records the address that was tried.'
        : 'Check your connection and try again.',
      'unreachable',
    );
  }
  const bytes = await readBounded(response, 8 * 1024 * 1024, options.signal, false);
  return parseManifest(JSON.parse(new TextDecoder().decode(bytes)));
}

/**
 * Download, verify and store every chunk of a pack.
 *
 * Chunks already present from an interrupted attempt are re-verified rather
 * than re-downloaded, which is what makes resuming cheap and makes a partially
 * written chunk impossible to inherit.
 */
export async function installPack(
  manifest: PackManifest,
  manifestUrl: string,
  store: ReferencePackStore,
  options: InstallOptions = {},
): Promise<InstalledPack> {
  parseManifest(manifest);
  try {
    return await withPackLock(manifest.id, () =>
      installUnlocked(manifest, manifestUrl, store, options),
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      throw new PackInstallError(
        'There is not enough browser storage for this pack.',
        'Remove an unused pack or free disk space, then retry. The previous version is unchanged.',
      );
    }
    throw error;
  }
}

async function installUnlocked(
  manifest: PackManifest,
  manifestUrl: string,
  store: ReferencePackStore,
  options: InstallOptions,
): Promise<InstalledPack> {
  options.signal?.throwIfAborted();
  const request = options.fetcher ?? fetch;
  const total = manifest.chunks.reduce((sum, chunk) => sum + chunk.bytes, 0);
  const report = (phase: InstallPhase, done: number, bytes: number) =>
    options.onProgress?.({
      packId: manifest.id,
      phase,
      chunksDone: done,
      chunksTotal: manifest.chunks.length,
      bytesDone: bytes,
      bytesTotal: total,
    });

  const existing = await store.get(manifest.id);
  const stage = async (done: number, bytes: number) => {
    // Updating never replaces the active manifest until every chunk is verified.
    if (existing?.state === 'ready') return;
    await store.put({
      id: manifest.id,
      manifest,
      manifestUrl,
      state: 'installing',
      installedAt: existing?.installedAt ?? Date.now(),
      chunksInstalled: done,
      bytes,
    });
  };
  await stage(0, 0);
  report('manifest', 0, 0);

  let done = 0;
  let bytes = 0;
  for (const chunk of manifest.chunks) {
    options.signal?.throwIfAborted();

    {
      const present = await store.read(manifest, chunk.id);
      if (
        present &&
        present.byteLength === chunk.bytes &&
        (await digestOf(present)) === chunk.sha256
      ) {
        // Also migrates legacy chunks without mutating the active generation.
        await store.putChunk(manifest.id, chunk.sha256, present);
        done += 1;
        bytes += chunk.bytes;
        report('chunks', done, bytes);
        continue;
      }
    }

    const url = new URL(chunk.file, absolute(manifestUrl)).toString();
    const response = await request(url, { signal: options.signal });
    if (!response.ok) {
      throw new PackInstallError(
        `${chunk.file} could not be downloaded (HTTP ${response.status}).`,
        'The pack was not installed. Try again, or check your connection.',
      );
    }
    const body = await readBounded(response, chunk.bytes, options.signal);
    const digest = await digestOf(body);
    if (digest !== chunk.sha256) {
      throw new PackInstallError(
        `${chunk.file} does not match the digest in the pack description.`,
        'The download was corrupted or the file has been altered. Nothing was installed.',
      );
    }
    options.signal?.throwIfAborted();
    await store.putChunk(manifest.id, chunk.sha256, body);
    done += 1;
    bytes += body.byteLength;
    report('chunks', done, bytes);
    await stage(done, bytes);
  }

  report('verifying', done, bytes);
  const installed: InstalledPack = {
    id: manifest.id,
    manifest,
    manifestUrl,
    state: 'ready',
    installedAt: Date.now(),
    chunksInstalled: done,
    bytes,
  };
  const damaged = await verifyPack(installed, store, options.signal);
  if (damaged.length)
    throw new PackInstallError(
      'Stored chunks failed verification.',
      'Retry the installation. The previous version is unchanged.',
    );
  options.signal?.throwIfAborted();
  await store.put(installed);
  /*
    The superseded generation is deliberately *not* reclaimed here. Chunks are
    content-addressed so both generations coexist, and a reader another tab is
    part-way through a query with is still reading the old one. Reclaiming
    happens at start-up instead, where no reader can be holding it — see
    `reclaimSupersededChunks`.
  */
  report('done', done, bytes);
  return installed;
}

/** Stop an oversized response while streaming, before buffering it all. */
async function readBounded(
  response: Response,
  expected: number,
  signal?: AbortSignal,
  exact = true,
): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) throw new PackInstallError('The chunk download was empty.', 'Retry the download.');
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      signal?.throwIfAborted();
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > expected)
        throw new PackInstallError(
          'The chunk exceeds its declared size.',
          'Check the pack source.',
        );
      parts.push(next.value);
    }
    if (exact && size !== expected)
      throw new PackInstallError('The chunk download is truncated.', 'Retry the download.');
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return bytes;
}

/** Chunk URLs are resolved against the manifest, which may be a site-relative path. */
function absolute(url: string): string {
  if (/^[a-z]+:/i.test(url)) return url;
  const origin = typeof location === 'undefined' ? 'http://localhost' : location.origin;
  return new URL(url, origin).toString();
}

/**
 * Re-check an installed pack against its own manifest.
 *
 * Possible only because chunks are stored exactly as downloaded. Reports the
 * chunks that no longer match rather than repairing anything: silently
 * re-downloading data a user has been citing is not a repair, it is a change
 * of evidence nobody was told about.
 */
export async function verifyPack(
  pack: InstalledPack,
  store: ReferencePackStore,
  signal?: AbortSignal,
): Promise<readonly string[]> {
  const damaged: string[] = [];
  for (const chunk of pack.manifest.chunks) {
    signal?.throwIfAborted();
    const bytes = await store.read(pack.manifest, chunk.id);
    if (!bytes) {
      damaged.push(chunk.id);
      continue;
    }
    if (bytes.byteLength !== chunk.bytes || (await digestOf(bytes)) !== chunk.sha256) {
      damaged.push(chunk.id);
      continue;
    }
    try {
      const rows = (await gunzip(bytes)).split('\n').filter((line) => line.length > 0);
      const separator = chunk.kind === 'game' || chunk.kind === 'players' ? '\t' : '|';
      const keys = rows.map((line) => line.slice(0, line.indexOf(separator)));
      if (
        rows.length !== chunk.entries ||
        keys.some((key) => !key) ||
        new Set(keys).size !== keys.length ||
        rows.some((line) => line.indexOf(separator) < 1)
      )
        damaged.push(chunk.id);
    } catch {
      damaged.push(chunk.id);
    }
  }
  return damaged;
}
