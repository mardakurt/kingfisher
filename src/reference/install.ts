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

import { PACK_FORMAT, type PackManifest } from './pack';
import { digestOf } from './reader';
import type { InstalledPack, ReferencePackStore } from './store';

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

export class PackInstallError extends Error {
  constructor(
    message: string,
    readonly remedy: string,
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
    typeof manifest.id !== 'string' ||
    typeof manifest.name !== 'string' ||
    !Array.isArray(manifest.chunks) ||
    manifest.chunks.length === 0 ||
    typeof manifest.shards !== 'object'
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
  return manifest as PackManifest;
}

export async function fetchManifest(url: string, options: InstallOptions = {}) {
  const request = options.fetcher ?? fetch;
  const response = await request(url, { signal: options.signal });
  if (!response.ok) {
    throw new PackInstallError(
      `The pack description could not be downloaded (HTTP ${response.status}).`,
      'Check your connection and try again.',
    );
  }
  return parseManifest(await response.json());
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
  const resumable =
    existing?.state === 'installing' && existing.manifest.version === manifest.version;

  await store.put({
    id: manifest.id,
    manifest,
    state: 'installing',
    installedAt: existing?.installedAt ?? Date.now(),
    chunksInstalled: resumable ? existing.chunksInstalled : 0,
    bytes: resumable ? existing.bytes : 0,
  });
  report('manifest', 0, 0);

  let done = 0;
  let bytes = 0;
  try {
    for (const chunk of manifest.chunks) {
      options.signal?.throwIfAborted();

      if (resumable) {
        const present = await store.read(manifest, chunk.id);
        if (present && present.byteLength === chunk.bytes) {
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
      const body = new Uint8Array(await response.arrayBuffer());
      const digest = await digestOf(body);
      if (digest !== chunk.sha256) {
        throw new PackInstallError(
          `${chunk.file} does not match the digest in the pack description.`,
          'The download was corrupted or the file has been altered. Nothing was installed.',
        );
      }
      await store.putChunk(manifest.id, chunk.id, body);
      done += 1;
      bytes += body.byteLength;
      report('chunks', done, bytes);
      await store.put({
        id: manifest.id,
        manifest,
        state: 'installing',
        installedAt: existing?.installedAt ?? Date.now(),
        chunksInstalled: done,
        bytes,
      });
    }

    report('verifying', done, bytes);
    const installed: InstalledPack = {
      id: manifest.id,
      manifest,
      state: 'ready',
      installedAt: Date.now(),
      chunksInstalled: done,
      bytes,
    };
    await store.put(installed);
    report('done', done, bytes);
    return installed;
  } catch (error) {
    /*
      Anything that goes wrong removes the pack rather than leaving it marked
      `installing` for ever. A cancel is the exception: the user may well press
      Install again, and re-verifying the chunks already written is far cheaper
      than downloading them twice.
    */
    if (isAbort(error)) throw error;
    await store.remove(manifest.id);
    throw error;
  }
}

const isAbort = (error: unknown): boolean =>
  error instanceof DOMException ? error.name === 'AbortError' : false;

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
): Promise<readonly string[]> {
  const damaged: string[] = [];
  for (const chunk of pack.manifest.chunks) {
    const bytes = await store.read(pack.manifest, chunk.id);
    if (!bytes) {
      damaged.push(chunk.id);
      continue;
    }
    if ((await digestOf(bytes)) !== chunk.sha256) damaged.push(chunk.id);
  }
  return damaged;
}
