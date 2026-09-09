'use client';

/**
 * The one place that knows which reference data exists right now.
 *
 * It owns three things that have to agree with each other: the packs stored in
 * this browser, the `ChessDatabaseProvider`s the explorer queries, and the
 * catalog rows the settings UI lists. Keeping them in one module rather than
 * three hooks is what stops the classic failure — a source that has been
 * removed still being offered, or a freshly installed one not appearing until
 * a reload.
 *
 * It lives outside React because providers do. React reads it through
 * `useSyncExternalStore`.
 */

import { setDynamicDatabaseProviders } from '@/database/registry';
import { DatabaseError } from '@/database/types';
import { RemoteReferenceProvider } from '@/database/providers/remote-reference';

import { BUNDLED_PACK_ID, CATALOG_PACKS, catalogPack, type CatalogPack } from './catalog';
import {
  fetchManifest,
  installPack,
  PackInstallError,
  verifyPack,
  type InstallProgress,
} from './install';
import { withPackLock } from './lock';
import type { PackManifest } from './pack';
import { PackReader } from './reader';
import { ReferencePackProvider } from './provider';
import { TieredStreamingCache } from './tiered-streaming-cache';
import {
  IndexedDbStreamingCacheStorage,
  type StreamingCacheStorage,
} from '@/persistence/streaming-cache-storage';
import { InMemoryStreamingCacheStorage } from '@/persistence/indexeddb/streaming-cache-storage.memory';
import { referencePackStore, type InstalledPack, type ReferencePackStore } from './store';
import type { ReferenceSource, SourceState } from './types';

export interface ReferenceSnapshot {
  /** False until the store has been read once; the UI shows nothing rather than "none". */
  readonly loaded: boolean;
  readonly sources: readonly ReferenceSource[];
  readonly progress: Readonly<Record<string, InstallProgress>>;
  readonly errors: Readonly<Record<string, string>>;
}

const EMPTY: ReferenceSnapshot = { loaded: false, sources: [], progress: {}, errors: {} };

let snapshot: ReferenceSnapshot = EMPTY;
const listeners = new Set<() => void>();
const readers = new Map<string, PackReader>();
const controllers = new Map<string, AbortController>();
let installed: readonly InstalledPack[] = [];
let remoteVersions: Readonly<Record<string, string>> = {};

/**
 * Packs the user has chosen to use online (Phase 29, PART AN-AU).
 *
 * Each entry is a (manifest, baseUrl) pair. The corresponding
 * `RemoteReferenceProvider` is created on demand, registered in
 * the dynamic 'reference' group, and torn down on disable.
 *
 * The choice is kept in module state for the same reason
 * `installed` is: it is the truth the explorer queries, and the
 * catalog UI reflects it. Persistence (so the choice survives a
 * reload) is a follow-up once the wired path is stable.
 */
const streamingProviders = new Map<
  string,
  {
    readonly provider: RemoteReferenceProvider;
    readonly cache: TieredStreamingCache;
    readonly baseUrl: string;
    /**
     * Cached persistent byte/chunk counts. The persistent tier
     * is read async; the catalog row wants sync numbers, so we
     * remember the last successful read and refresh it in the
     * background when the streaming source is enabled.
     */
    persistentBytesCached?: number;
    persistentChunksCached?: number;
  }
>();

const emit = () => {
  for (const listener of listeners) listener();
};

export const subscribeReferences = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const referenceSnapshot = (): ReferenceSnapshot => snapshot;

/** Providers for every ready pack, newest-installed last, for the registry. */
function publish(): void {
  const installedProviders = installed
    .filter((pack) => pack.state === 'ready')
    .map((pack) => {
      const reader = readers.get(pack.id);
      const catalog = catalogPack(pack.id);
      if (!reader) return null;
      return new ReferencePackProvider(
        reader,
        pack.id,
        pack.manifest.name,
        catalog?.description ?? pack.manifest.description,
      );
    })
    .filter((provider): provider is ReferencePackProvider => provider !== null);
  const streamingList = Array.from(streamingProviders.values()).map((entry) => entry.provider);
  // Installed first (they answer without a network), then streaming,
  // then the built-in providers. Order matters because the explorer
  // picks the first source in its list.
  setDynamicDatabaseProviders('reference', [...installedProviders, ...streamingList]);

  snapshot = {
    loaded: true,
    sources: describeAll(installed, snapshot.progress),
    progress: snapshot.progress,
    errors: snapshot.errors,
  };
  emit();
}

/**
 * Render a catalog's `window` summary as a short, honest freshness
 * line, e.g. "2020–2026" or "Last 24 months". Returns undefined
 * for packs that do not declare a window, so the catalog UI can
 * decide whether to show "this source's data window is unclear"
 * or simply nothing.
 */
function windowSummaryForCatalog(catalog: CatalogPack): string | undefined {
  const w = catalog.window;
  if (!w) return undefined;
  if (w.firstYear && w.firstYear < w.lastYear) return `${w.firstYear}–${w.lastYear}`;
  if (w.firstYear === w.lastYear) return `${w.lastYear}`;
  return undefined;
}

/**
 * The catalog rows, which is the known packs *plus* anything installed that
 * this build has never heard of.
 *
 * The second half matters: a pack installed from a URL is as real as one from
 * the catalog, and so is one from a catalog entry a later build dropped. A
 * source that is holding a hundred megabytes of a user's disk and answering
 * their queries must appear in the list that says what is installed.
 */
function describeAll(
  packs: readonly InstalledPack[],
  progress: Readonly<Record<string, InstallProgress>>,
): readonly ReferenceSource[] {
  const known = new Set(CATALOG_PACKS.map((pack) => pack.id));
  const rows = CATALOG_PACKS.map((catalog) => describe(catalog, packs, progress));
  for (const pack of packs) {
    if (known.has(pack.id)) continue;
    rows.push(describe(fromManifest(pack), packs, progress));
  }
  return rows;
}

/** A catalog entry recovered from a pack nobody declared, so it can be listed. */
const fromManifest = (pack: InstalledPack): CatalogPack => ({
  id: pack.id,
  name: pack.manifest.name,
  description: pack.manifest.description,
  manifestUrl: pack.manifestUrl ?? '',
  bundled: false,
  capabilities: [
    'explorer',
    'games',
    'player-search',
    'player-profiles',
    'position-report',
    'model-games',
    'preparation',
  ],
  approximateBytes: pack.manifest.compressedBytes,
  ...(pack.manifest.maxPositionPly !== undefined
    ? { maxPositionPly: pack.manifest.maxPositionPly }
    : {}),
  license: pack.manifest.license,
  origin: pack.manifest.provenance.source,
});

function describe(
  catalog: CatalogPack,
  packs: readonly InstalledPack[],
  progress: Readonly<Record<string, InstallProgress>>,
): ReferenceSource {
  const pack = packs.find((entry) => entry.id === catalog.id);
  const installing = progress[catalog.id] !== undefined && progress[catalog.id]?.phase !== 'done';
  const ready = pack?.state === 'ready';
  const remote = remoteVersions[catalog.id];
  const updateAvailable = ready && remote !== undefined && remote !== pack.manifest.version;
  const streaming = streamingProviders.get(catalog.id);

  /*
   * Installed beats streaming: an installed pack answers from
   * disk with no network, which is what the user picked when
   * they installed it. Streaming is the fallback for packs the
   * user wants to query without paying the install cost.
   */
  const kind: ReferenceSource['kind'] = ready
    ? catalog.bundled
      ? 'bundled'
      : 'installed'
    : streaming
      ? 'streaming'
      : catalog.bundled
        ? 'bundled'
        : 'catalog';

  const state: SourceState = installing
    ? 'installing'
    : ready
      ? updateAvailable
        ? 'update-available'
        : 'ready'
      : streaming
        ? 'needs-connection'
        : 'available';

  return {
    id: catalog.id,
    name: pack?.manifest.name ?? catalog.name,
    description: catalog.description,
    kind,
    state,
    license: pack?.manifest.license ?? catalog.license,
    ...(pack ? { provenance: pack.manifest.provenance } : {}),
    ...(pack ? { version: pack.manifest.version } : {}),
    ...(streaming ? { version: streaming.provider.cacheVersion.split('@')[1] } : {}),
    installed: ready || streaming !== undefined,
    enabled: ready || streaming !== undefined,
    updateAvailable,
    ...(pack
      ? {
          gameCount: pack.manifest.counts.games,
          openableCount: pack.manifest.counts.openable,
          playerCount: pack.manifest.counts.players,
          positionCount: pack.manifest.counts.positions,
          ...(pack.manifest.maxPositionPly !== undefined
            ? { maxPositionPly: pack.manifest.maxPositionPly }
            : {}),
          size: pack.bytes,
        }
      : {
          size: catalog.approximateBytes,
          ...(catalog.maxPositionPly !== undefined
            ? { maxPositionPly: catalog.maxPositionPly }
            : {}),
        }),
    offline: ready,
    capabilities: catalog.capabilities,
    installableSize: catalog.approximateBytes,
    freshness: windowSummaryForCatalog(catalog),
    ...(streaming
      ? {
          cacheBytes: streaming.cache.memoryBytes(),
          cacheChunks: streaming.cache.memorySize(),
          // Persistent cache fields are read async; the
          // snapshot is built from the cached value if a
          // previous read populated it, or zero on first
          // read. The catalog refreshes the persistent
          // numbers when a streaming source is enabled, so
          // the second paint is honest.
          persistentCacheBytes: streaming.persistentBytesCached ?? 0,
          persistentCacheChunks: streaming.persistentChunksCached ?? 0,
          inFlightCount: streaming.provider.inFlightCount(),
        }
      : {}),
    ...(catalog.bundled && !ready && !installing
      ? { note: 'Preparing the bundled reference…' }
      : {}),
  };
}

async function refresh(store: ReferencePackStore): Promise<void> {
  installed = await store.list();
  for (const pack of installed) {
    if (pack.state !== 'ready') {
      readers.delete(pack.id);
      continue;
    }
    const previous = readers.get(pack.id);
    if (!previous || JSON.stringify(previous.manifest) !== JSON.stringify(pack.manifest)) {
      readers.set(pack.id, new PackReader(pack.manifest, store));
    }
  }
  for (const id of [...readers.keys()]) {
    if (!installed.some((pack) => pack.id === id && pack.state === 'ready')) readers.delete(id);
  }
  publish();
}

const setProgress = (id: string, progress: InstallProgress | null) => {
  const next = { ...snapshot.progress };
  if (progress) next[id] = progress;
  else delete next[id];
  snapshot = { ...snapshot, progress: next };
  snapshot = { ...snapshot, sources: describeAll(installed, next) };
  emit();
};

const setError = (id: string, message: string | null) => {
  const next = { ...snapshot.errors };
  if (message) next[id] = message;
  else delete next[id];
  snapshot = { ...snapshot, errors: next };
  emit();
};

/**
 * Install a pack, or resume one that was interrupted.
 *
 * Returns rather than throws on failure: this is called from a click handler
 * and from application start-up, and both want the failure recorded against
 * the row rather than raised into the console.
 */
export async function startInstall(id: string): Promise<boolean> {
  const saved = installed.find((pack) => pack.id === id);
  const catalog =
    customPacks.get(id) ?? catalogPack(id) ?? (saved ? fromManifest(saved) : undefined);
  if (!catalog || controllers.has(id)) return false;
  const controller = new AbortController();
  controllers.set(id, controller);
  const store = await referencePackStore();
  setError(id, null);

  try {
    let manifest: PackManifest;
    try {
      manifest = await fetchManifest(catalog.manifestUrl, { signal: controller.signal });
      if (manifest.id !== id)
        throw new Error('The downloaded pack identity does not match this catalog entry.');
    } catch (error) {
      if (controller.signal.aborted) return false;
      throw error;
    }
    await installPack(manifest, catalog.manifestUrl, store, {
      signal: controller.signal,
      onProgress: (progress) => setProgress(id, progress),
    });
    return true;
  } catch (error) {
    if (!controller.signal.aborted) {
      /*
        The remedy, not only the message.

        `PackInstallError` carries both and the panel only ever showed the
        first, so a failure said what had happened and never what to do about
        it — "The pack description could not be downloaded (HTTP 404)." on its
        own is a status code shown to a chess player. Every other failure
        surface in the application already joins the two this way.
      */
      const remedy = error instanceof PackInstallError && error.remedy ? ` ${error.remedy}` : '';
      setError(id, error instanceof Error ? `${error.message}${remedy}` : String(error));
    }
    return false;
  } finally {
    controllers.delete(id);
    setProgress(id, null);
    /*
      The one place that could break this function's own promise.

      The contract at the top is "returns rather than throws", because both
      callers are click handlers that `void` the result. A `finally` that throws
      replaces the return value with a rejection, so the cleanup written to keep
      that promise was the only thing able to break it.

      Not hypothetical: deleting a profile's IndexedDB databases while a pack was
      installing closed the connection under `refresh`, and the click handler
      turned a recoverable cleanup failure into an unhandled rejection with no
      row to explain it. A refresh that cannot read the store is worth recording
      against the source and is not worth raising.
    */
    try {
      await refresh(store);
    } catch (error) {
      setError(id, error instanceof Error ? error.message : String(error));
    }
  }
}

export function cancelInstall(id: string): void {
  controllers.get(id)?.abort();
}

export async function removePack(id: string): Promise<void> {
  cancelInstall(id);
  const store = await referencePackStore();
  await store.remove(id);
  await refresh(store);
}

/** Verification never repairs data silently. A damaged source stops answering. */
export async function verifyInstalledPack(id: string): Promise<readonly string[]> {
  const store = await referencePackStore();
  return withPackLock(id, async () => {
    const pack = await store.get(id);
    if (!pack || pack.state !== 'ready') throw new Error('This pack is not installed.');
    const damaged = await verifyPack(pack, store);
    if (damaged.length) {
      const error = `${damaged.length} damaged or missing chunks. Reinstall this pack to repair it.`;
      await store.put({ ...pack, state: 'failed', error });
      setError(id, error);
    } else setError(id, null);
    await refresh(store);
    return damaged;
  });
}

/**
 * Ask each installable pack's published manifest what version it is now.
 *
 * Deliberately not automatic: it needs a network, it is only meaningful for
 * packs that are installed, and a background request nobody asked for is how a
 * local-first application stops being one.
 */
export async function checkForPackUpdates(): Promise<void> {
  const versions: Record<string, string> = {};
  for (const pack of installed.filter((entry) => entry.state === 'ready')) {
    const catalog = customPacks.get(pack.id) ?? catalogPack(pack.id) ?? fromManifest(pack);
    if (!catalog.manifestUrl) continue;
    try {
      const manifest = await fetchManifest(catalog.manifestUrl);
      if (manifest.id !== catalog.id)
        throw new Error('Update manifest identifies a different pack.');
      versions[catalog.id] = manifest.version;
      setError(catalog.id, null);
    } catch (error) {
      /*
        Being offline is not a fault in the pack, and a row that turns red
        every time a laptop leaves the network teaches the user to ignore the
        colour. A manifest that *was* reached and is wrong is different: that
        is something about the source the user should see.
      */
      if (error instanceof PackInstallError && error.kind === 'unreachable') continue;
      setError(
        catalog.id,
        `Update check failed; installed data is unchanged. ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  remoteVersions = versions;
  publish();
}

/**
 * Packs installed from a URL the user supplied.
 *
 * Kept so that an update, a retry after a failure, or a resume can find the
 * manifest again. The installed record also persists the URL for later sessions.
 */
const customPacks = new Map<string, CatalogPack>();

/**
 * Compute the streaming base URL for a catalog pack.
 *
 * The `manifestUrl` is the address of `manifest.json`; the base
 * URL for the chunk files is the directory above. Trailing
 * slashes are normalised to a single one so the provider can do
 * `base + file` without `path.join` confusion.
 */
function baseUrlForManifestUrl(manifestUrl: string): string {
  const lastSlash = manifestUrl.lastIndexOf('/');
  if (lastSlash < 0) return manifestUrl;
  return manifestUrl.slice(0, lastSlash + 1);
}

/**
 * Turn a pack on for online use.
 *
 * Creates a `RemoteReferenceProvider` for it, wires it into the
 * dynamic 'reference' provider group so the explorer can answer
 * from it, and records cache stats on the catalog row. Idempotent:
 * a second call for the same id is a no-op so the catalog button
 * can be wired to a plain `onClick`.
 */
export async function enableStreamingForPack(
  id: string,
): Promise<{ ok: boolean; message: string }> {
  const saved = installed.find((pack) => pack.id === id);
  const catalog =
    customPacks.get(id) ?? catalogPack(id) ?? (saved ? fromManifest(saved) : undefined);
  if (!catalog) return { ok: false, message: `${id} is not a known reference pack.` };
  if (saved?.state === 'ready') {
    return { ok: false, message: `${catalog.name} is installed. Use it without online.` };
  }
  if (streamingProviders.has(id)) return { ok: true, message: `${catalog.name} is online.` };
  setError(id, null);
  try {
    const manifest = await fetchManifest(catalog.manifestUrl);
    if (manifest.id !== id)
      throw new Error('The online pack identity does not match this catalog entry.');
    const cache = new TieredStreamingCache({
      packId: manifest.id,
      packVersion: manifest.version,
      persistent: defaultStreamingCacheStorage(),
    });
    const provider = new RemoteReferenceProvider({
      id: manifest.id,
      name: manifest.name,
      description: catalog.description,
      manifest,
      baseUrl: baseUrlForManifestUrl(catalog.manifestUrl),
      shards: defaultRemoteShards(),
      cache,
    });
    const entry = { provider, cache, baseUrl: catalog.manifestUrl };
    streamingProviders.set(id, entry);
    publish();
    // Read the persistent cache once, in the background, so the
    // catalog row reports the surviving bytes. The read is best-
    // effort; a failure here would surface on the next read.
    void refreshPersistentCacheInfo(id);
    return { ok: true, message: `${manifest.name} ready. Chunks are cached on demand.` };
  } catch (error) {
    setError(
      id,
      `Could not use ${catalog.name} online. ${error instanceof Error ? error.message : String(error)}`,
    );
    return {
      ok: false,
      message: error instanceof Error ? error.message : `Could not use ${catalog.name} online.`,
    };
  }
}

/**
 * Stop using a pack online.
 *
 * The cache is dropped; future queries for the same pack will
 * have to re-fetch and re-verify. The catalog row returns to
 * 'Available' and the explorer stops being able to query it.
 */
export function stopStreamingPack(id: string): void {
  const entry = streamingProviders.get(id);
  if (!entry) return;
  entry.cache.clear();
  streamingProviders.delete(id);
  publish();
}

/**
 * Drop the streaming cache for a pack without disabling it.
 *
 * Distinct from "stop using online": the user keeps the source
 * enabled, but the in-memory LRU is cleared so subsequent
 * queries re-verify from the origin.
 */
export function clearStreamingCache(id: string): void {
  const entry = streamingProviders.get(id);
  if (!entry) return;
  // Fire and forget: the underlying clear is awaited by the
  // provider, but the public clear is sync to keep the
  // button click handler simple. A failure here would
  // surface on the next read.
  void entry.cache.clear().then(() => {
    if (streamingProviders.get(id) === entry) {
      entry.persistentBytesCached = 0;
      entry.persistentChunksCached = 0;
      publish();
    }
  });
  publish();
}

/**
 * Read the persistent cache's current bytes and chunk count, and
 * republish the catalog snapshot so the row reflects what the
 * user actually has on disk. Best-effort: a failure here is
 * silent, because a missing number is better than an exception
 * in the catalog UI.
 */
export async function refreshPersistentCacheInfo(id: string): Promise<void> {
  const entry = streamingProviders.get(id);
  if (!entry) return;
  try {
    const [bytes, chunks] = await Promise.all([
      entry.cache.persistentBytes(),
      entry.cache.persistentSize(),
    ]);
    if (streamingProviders.get(id) !== entry) return;
    entry.persistentBytesCached = bytes;
    entry.persistentChunksCached = chunks;
    publish();
  } catch {
    // The persistent tier is a "best effort" surface; a failure
    // to read it does not block the streaming source from
    // answering. The next publish will catch it up.
  }
}

/**
 * Build the default persistent storage for the streaming cache.
 *
 * The IndexedDB implementation is the production path; tests
 * inject their own. The factory exists so the manager does not
 * import the browser-only implementation at the top of a file
 * that may be evaluated in a node test runner.
 *
 * The IndexedDB branch is detected by the global, not by an
 * `import` statement, so a node test that does not load
 * `fake-indexeddb/auto` simply falls through to the memory
 * double and the streaming cache still works in tests.
 */
function defaultStreamingCacheStorage(): StreamingCacheStorage {
  if (typeof indexedDB !== 'undefined' && typeof IDBObjectStore !== 'undefined') {
    return new IndexedDbStreamingCacheStorage();
  }
  // The in-memory double is dynamically required because it
  // shares the contract but not the path; a synchronous
  // `new` keeps the call site simple.
  return new InMemoryStreamingCacheStorage();
}

/**
 * The hosts Kingfisher is willing to fetch streamed chunks from.
 * Anything else is rejected, regardless of HTTP status or
 * redirect chain, because a verified chunk under a known digest
 * coming from a foreign origin is the wrong shape of trust.
 */
const TRUSTED_DATA_ORIGINS: readonly RegExp[] = [
  /^https:\/\/mardakurt\.github\.io\//,
  /^https:\/\/kingfisher-chess\.vercel\.app\//,
  /^https:\/\/studio\.kingfisher-chess\.vercel\.app\//,
];

/**
 * Verify the final URL of a streaming fetch still comes from a
 * trusted data origin. A 301/302/307/308 redirect to a foreign
 * domain must not be followed to a chunk fetch — the chunk's
 * digest is checked, but we should not be giving unknown origins
 * the bytes in the first place.
 */
function assertTrustedOrigin(landing: string, finalUrl: string): void {
  if (TRUSTED_DATA_ORIGINS.some((re) => re.test(finalUrl))) return;
  throw new DatabaseError(
    `Streaming source redirected to an untrusted origin (${landing} → ${finalUrl}).`,
    'The pack manifest points somewhere we do not fetch from. Install the pack for offline use instead.',
    'misconfigured',
  );
}

function defaultRemoteShards(): {
  fetchText: (url: string, signal?: AbortSignal) => Promise<string>;
  fetchBytes: (url: string, expectedBytes: number, signal?: AbortSignal) => Promise<Uint8Array>;
} {
  return {
    async fetchText(url, signal) {
      const response = await fetch(url, { signal, redirect: 'follow' });
      if (!response.ok)
        throw new DatabaseError(
          `Could not load ${url} (HTTP ${response.status}).`,
          'Check the network connection, or install the pack for offline use.',
          'network-error',
          response.status,
        );
      assertTrustedOrigin(url, response.url);
      return response.text();
    },
    async fetchBytes(url, expectedBytes, signal) {
      const response = await fetch(url, { signal, redirect: 'follow' });
      if (!response.ok)
        throw new DatabaseError(
          `Could not load ${url} (HTTP ${response.status}).`,
          'Check the network connection, or install the pack for offline use.',
          'network-error',
          response.status,
        );
      assertTrustedOrigin(url, response.url);
      /*
       * Trust the Content-Length header as a soft bound, not a
       * hard one. The decisive check is the SHA-256 verification
       * that follows; a chunk that lies about its length is
       * caught at the manifest level.
       */
      const contentLength = Number(response.headers.get('content-length') ?? 0);
      if (contentLength > 0 && contentLength > expectedBytes * 4) {
        throw new DatabaseError(
          `Remote chunk ${url} advertises ${contentLength} bytes; manifest says ${expectedBytes}.`,
          'The remote source is corrupt; the install path is safer.',
        );
      }
      const buffer = await response.arrayBuffer();
      // Decompression-bomb guard. A chunk that decompresses to
      // a multiple of its compressed size is the textbook
      // "tiny input, huge output" attack. The cap is generous
      // (32×) because real-world compression ratios are bounded
      // for our data, and the SHA-256 check is the second
      // line of defence.
      if (buffer.byteLength > expectedBytes * 32) {
        throw new DatabaseError(
          `Remote chunk ${url} decompressed to ${buffer.byteLength} bytes; manifest says ${expectedBytes}.`,
          'The remote source is corrupt; the install path is safer.',
        );
      }
      return new Uint8Array(buffer);
    },
  };
}

/**
 * Install a pack from any URL that serves a Kingfisher manifest.
 *
 * The advanced path, and the honest one. Kingfisher's own published packs live
 * on a release of this repository; anyone hosting a pack of their own, or
 * building one with `scripts/build-reference-pack.mjs` and serving the
 * directory, installs it here. The verification is identical either way —
 * every chunk is checked against the digest in the manifest, and a pack that
 * fails leaves nothing behind.
 */
export async function installFromUrl(url: string): Promise<{ ok: boolean; message: string }> {
  try {
    const manifest = await fetchManifest(url);
    customPacks.set(manifest.id, {
      id: manifest.id,
      name: manifest.name,
      description: manifest.description,
      manifestUrl: url,
      bundled: false,
      capabilities: [
        'explorer',
        'games',
        'player-search',
        'player-profiles',
        'position-report',
        'model-games',
        'preparation',
      ],
      approximateBytes: manifest.compressedBytes,
      license: manifest.license,
      origin: manifest.provenance.source,
    });
    const installed = await startInstall(manifest.id);
    return installed
      ? { ok: true, message: `${manifest.name} installed.` }
      : { ok: false, message: snapshot.errors[manifest.id] ?? 'The pack was not installed.' };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'That URL did not serve a pack manifest.',
    };
  }
}

let started: Promise<void> | null = null;

/**
 * Bring reference data up on application start.
 *
 * The bundled pack installs itself here if it is missing, which is what makes
 * a fresh profile have an opening explorer without anybody choosing to give it
 * one. It is fetched from this build's own static assets, so it needs no
 * network beyond the one that served the page, and once written it needs none
 * at all.
 */
/**
 * Give back the storage a previous version of a pack is still holding.
 *
 * An update writes a whole new generation of content-addressed chunks and
 * leaves the old one in place, because a reader in another tab may still be
 * reading it. Nothing reclaims it there, and a 150 MB source updated monthly
 * would take another 150 MB of the user's quota every month, for ever.
 *
 * Start-up is where it is safe: every reader this session will build is built
 * from the manifest that is installed *now*, so no live reader can be pointing
 * at an earlier generation. Failures are ignored — the bytes stay reclaimable
 * and nothing about the pack is wrong.
 */
async function reclaimSupersededChunks(store: ReferencePackStore): Promise<void> {
  for (const pack of installed) {
    if (pack.state !== 'ready') continue;
    try {
      await withPackLock(pack.id, () =>
        store.pruneChunks(pack.id, new Set(pack.manifest.chunks.map((chunk) => chunk.sha256))),
      );
    } catch {
      // Reclaiming storage is never worth failing a start-up over.
    }
  }
}

export function initialiseReferences(): Promise<void> {
  started ??= (async () => {
    const store = await referencePackStore();
    await refresh(store);
    const bundled = installed.find((pack) => pack.id === BUNDLED_PACK_ID);
    if (bundled?.state !== 'ready') {
      await startInstall(BUNDLED_PACK_ID);
      await reclaimSupersededChunks(store);
      return;
    }
    /*
      The bundled pack is the one source whose new version arrives with the
      application rather than over the network, so leaving it to the update
      button is leaving it undone: a profile created a year ago would keep
      answering from a year-old, shallower table while the data it should be
      reading sat unused in this build's own assets. Reinstalling costs a
      handful of local reads, so it happens on start-up rather than being
      offered. Everything else — the catalog packs — is still the user's call.
    */
    const catalog = catalogPack(BUNDLED_PACK_ID);
    if (!catalog) return;
    try {
      const shipped = await fetchManifest(catalog.manifestUrl);
      if (shipped.version !== bundled.manifest.version) await startInstall(BUNDLED_PACK_ID);
    } catch {
      // A build whose own asset cannot be read has bigger problems than a
      // stale reference, and the installed pack still answers.
    }
    await reclaimSupersededChunks(store);
  })();
  return started;
}

export function packReader(id: string): PackReader | undefined {
  return readers.get(id);
}

export function readyPackReaders(): readonly PackReader[] {
  return installed
    .filter((pack) => pack.state === 'ready')
    .map((pack) => readers.get(pack.id))
    .filter((reader): reader is PackReader => reader !== undefined);
}

/**
 * What is installed right now, in the shape a workspace backup records.
 *
 * Only `ready` packs. A pack halfway through installing is not something a
 * restore should offer to reinstall as though it had been working, and a
 * failed one is not something the user chose to have.
 *
 * The bundled pack is included deliberately: it reinstalls itself on a fresh
 * profile, but a backup that silently omitted it would be describing a
 * workspace that never existed.
 */
export function installedReferenceSources(): readonly {
  readonly id: string;
  readonly name: string;
  readonly version?: string;
  readonly bytes: number;
  readonly manifestUrl?: string;
}[] {
  return installed
    .filter((pack) => pack.state === 'ready')
    .map((pack) => ({
      id: pack.id,
      name: pack.manifest.name,
      bytes: pack.bytes,
      ...(pack.manifest.version ? { version: pack.manifest.version } : {}),
      ...(pack.manifestUrl ? { manifestUrl: pack.manifestUrl } : {}),
    }));
}

export function resetReferenceManagerForTests(): void {
  snapshot = EMPTY;
  customPacks.clear();
  readers.clear();
  controllers.clear();
  installed = [];
  remoteVersions = {};
  started = null;
  for (const entry of streamingProviders.values()) entry.cache.clear();
  streamingProviders.clear();
}
