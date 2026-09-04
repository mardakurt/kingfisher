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

import { BUNDLED_PACK_ID, CATALOG_PACKS, catalogPack, type CatalogPack } from './catalog';
import { fetchManifest, installPack, type InstallProgress } from './install';
import type { PackManifest } from './pack';
import { PackReader } from './reader';
import { ReferencePackProvider } from './provider';
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
  const providers = installed
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
  setDynamicDatabaseProviders('reference', providers);

  snapshot = {
    loaded: true,
    sources: CATALOG_PACKS.map((catalog) => describe(catalog, installed, snapshot.progress)),
    progress: snapshot.progress,
    errors: snapshot.errors,
  };
  emit();
}

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

  const state: SourceState = installing
    ? 'installing'
    : ready
      ? updateAvailable
        ? 'update-available'
        : 'ready'
      : 'available';

  return {
    id: catalog.id,
    name: pack?.manifest.name ?? catalog.name,
    description: catalog.description,
    kind: catalog.bundled ? 'bundled' : ready ? 'installed' : 'catalog',
    state,
    license: pack?.manifest.license ?? catalog.license,
    ...(pack ? { provenance: pack.manifest.provenance } : {}),
    ...(pack ? { version: pack.manifest.version } : {}),
    installed: ready,
    enabled: ready,
    updateAvailable,
    ...(pack
      ? {
          gameCount: pack.manifest.counts.games,
          openableCount: pack.manifest.counts.openable,
          playerCount: pack.manifest.counts.players,
          positionCount: pack.manifest.counts.positions,
          size: pack.bytes,
        }
      : { size: catalog.approximateBytes }),
    offline: true,
    capabilities: catalog.capabilities,
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
    if (!readers.has(pack.id)) readers.set(pack.id, new PackReader(pack.manifest, store));
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
  snapshot = {
    ...snapshot,
    sources: CATALOG_PACKS.map((catalog) => describe(catalog, installed, next)),
  };
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
  const catalog = catalogPack(id);
  if (!catalog || controllers.has(id)) return false;
  const store = await referencePackStore();
  const controller = new AbortController();
  controllers.set(id, controller);
  setError(id, null);

  try {
    let manifest: PackManifest;
    try {
      manifest = await fetchManifest(catalog.manifestUrl, { signal: controller.signal });
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
      setError(id, error instanceof Error ? error.message : String(error));
    }
    return false;
  } finally {
    controllers.delete(id);
    setProgress(id, null);
    await refresh(store);
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

/**
 * Ask each installable pack's published manifest what version it is now.
 *
 * Deliberately not automatic: it needs a network, it is only meaningful for
 * packs that are installed, and a background request nobody asked for is how a
 * local-first application stops being one.
 */
export async function checkForPackUpdates(): Promise<void> {
  const versions: Record<string, string> = {};
  for (const catalog of CATALOG_PACKS) {
    if (catalog.bundled) continue;
    if (!installed.some((pack) => pack.id === catalog.id && pack.state === 'ready')) continue;
    try {
      const manifest = await fetchManifest(catalog.manifestUrl);
      versions[catalog.id] = manifest.version;
    } catch {
      // An update check that cannot reach the network is not a failure state:
      // the installed pack is unaffected, and the row simply does not claim.
    }
  }
  remoteVersions = versions;
  publish();
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
export function initialiseReferences(): Promise<void> {
  started ??= (async () => {
    const store = await referencePackStore();
    await refresh(store);
    const bundled = installed.find((pack) => pack.id === BUNDLED_PACK_ID);
    if (bundled?.state !== 'ready') await startInstall(BUNDLED_PACK_ID);
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

export function resetReferenceManagerForTests(): void {
  snapshot = EMPTY;
  readers.clear();
  controllers.clear();
  installed = [];
  remoteVersions = {};
  started = null;
}
