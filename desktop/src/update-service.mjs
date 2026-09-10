/**
 * The desktop update service.
 *
 * The one place in the application that talks to the Kingfisher release
 * server, the one place that downloads a candidate DMG, and the one place
 * that verifies the download. The macOS application menu's *Check for
 * Updates…* item, the *Help → Check for Updates* command in the command
 * palette, and the Settings → Application panel all reach this service
 * through typed IPC; the renderer never sees `fetch`, never sees the
 * filesystem, and never makes a security decision.
 *
 * ## Single-flight
 *
 * Multiple clicks on *Check for Updates…* while a previous check is in
 * flight are collapsed onto the same in-flight promise. Multiple clicks on
 * *Download Update* while a download is running are likewise collapsed.
 * A user who double-clicks because the first click "did nothing" is the
 * canonical case this rule exists for.
 *
 * ## Manual only
 *
 * The service never runs on a timer, never runs on launch, and never
 * fires as a side effect of opening a Study. The user clicks the menu
 * item; one HTTPS request goes out; the user reads the verdict.
 *
 * ## Cancellation
 *
 * A `cancel()` interrupts the current download. The partial file on disk
 * is unlinked, the in-memory AbortController fires, and the service
 * returns to a state that can be checked again from a clean slate.
 *
 * ## No telemetry
 *
 * The service does not log the body of responses, does not log the
 * headers, and does not phone home. What it logs is bounded to the
 * stage names a user can reproduce: "check started", "version result",
 * "download started", "verification result".
 */

import {
  createWriteStream,
  existsSync,
  mkdirSync,
  renameSync,
  unlinkSync,
  statSync,
  readdirSync,
} from 'node:fs';
import { open as fsOpen } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { app, shell } from 'electron';

import { log } from './log.mjs';
import {
  ALLOWED_RELEASE_HOSTS,
  MAX_DOWNLOAD_REDIRECTS,
  MAX_UPDATE_BYTES,
  STATUS,
  assetForArch,
  compareSemver,
  isAllowedReleaseHost,
  parseReleaseManifest,
  parseSemver,
} from './update-protocol.mjs';

const REDACTED_PATH_TOKEN = '<cache>';

/**
 * Where the desktop shell keeps update artifacts while it works on them.
 *
 * Lives under `app.getPath('cache')` so macOS knows it is a cache and can
 * purge it on disk pressure. The `updates/` subdirectory keeps the
 * user's own `Application Support/Kingfisher` clean — no .partial files
 * next to their studies, no SHA sums in their preferences.
 */
function updateCacheDir() {
  const root = app.getPath('cache');
  const target = path.join(root, 'Kingfisher', 'updates');
  mkdirSync(target, { recursive: true });
  return target;
}

function appBundleName() {
  return app.getName();
}

function appBundleId() {
  return app.getName(); // bundle id is set from name in electron-builder.yml
}

function currentVersion() {
  return app.getVersion();
}

function currentArch() {
  // process.arch is the build arch (arm64 for the Apple Silicon build).
  // x64 is intentionally not offered unless the build that is running is
  // an x64 build, which it currently never is.
  return process.arch === 'arm64' ? 'arm64' : 'x64';
}

/**
 * Build the candidate manifest URL.
 *
 * Phase 35's release source is the GitHub Releases API for the canonical
 * repository. The path is `/releases/latest`; the API responds with a
 * redirect to the tag-specific URL only for HTTP HEAD. We always GET the
 * `/releases/latest/download/kingfisher-release-manifest.json` path, which
 * GitHub serves directly when the latest release is a normal `vX.Y.Z` tag
 * and answers 404 when the latest release is a draft, prerelease, or
 * non-application tag — exactly the rule the brief requires.
 */
function manifestUrl(repository) {
  return `${repository}/releases/latest/download/kingfisher-release-manifest.json`;
}

function releaseTagPage(repository) {
  return `${repository}/releases/latest`;
}

/**
 * The service's mutable state. Kept in a single object so `cancel()` can
 * flip the right bits and the next operation can read them without races.
 */
const state = {
  /** @type {Promise<UpdateVerdict> | null} */
  check: null,
  /** @type {Promise<UpdateVerdict> | null} */
  download: null,
  /** @type {AbortController | null} */
  downloadAbort: null,
  /** @type {string | null} */
  currentTag: null,
  /** @type {ParsedManifest | null} */
  lastManifest: null,
  /** @type {UpdateAsset | null} */
  selectedAsset: null,
  /** @type {string | null} */
  downloadedPath: null,
  /** @type {((state: UpdateVerdict) => void) | null} */
  listener: null,
};

/**
 * Subscribe a listener to verdict updates.
 *
 * Returns an unsubscribe function. The update dialog calls this once and
 * unregisters when it closes; the menu rebuilder calls this and rebuilds
 * the menu whenever the verdict changes. There is exactly one listener at
 * a time in production.
 */
export function subscribe(listener) {
  state.listener = listener;
  return () => {
    if (state.listener === listener) state.listener = null;
  };
}

function emit(verdict) {
  try {
    state.listener?.(verdict);
  } catch (err) {
    log('update', `listener threw: ${String(err?.message ?? err)}`);
  }
}

/**
 * Run a manual update check.
 *
 * Idempotent under rapid clicks: callers that ask while a check is in
 * flight get the same promise back. After it returns, the verdict is
 * cached in `state.lastManifest` and the next `download` call may use
 * it without re-fetching.
 */
export function checkForUpdates({ repository }) {
  if (state.check) return state.check;
  state.check = runCheck({ repository }).finally(() => {
    state.check = null;
  });
  return state.check;
}

async function runCheck({ repository }) {
  const arch = currentArch();
  log('update', `check started · version=${currentVersion()} arch=${arch}`);
  emit({ status: 'checking' });
  const url = manifestUrl(repository);
  let response;
  try {
    response = await fetchStrict(url, {
      accept: 'application/json',
    });
  } catch (err) {
    const reason = describeCheckError(err);
    log('update', `check failed: ${reason}`);
    return unableToCheck(reason);
  }
  if (!response.ok) {
    const reason = `Release metadata returned ${response.status} ${response.statusText}.`;
    log('update', `check failed: ${reason}`);
    return unableToCheck(reason);
  }
  let body;
  try {
    body = await response.json();
  } catch {
    return unableToCheck('Release metadata was not valid JSON.');
  }
  const parsed = parseReleaseManifest(body);
  if (!parsed.ok) {
    log('update', `check failed: ${parsed.reason}`);
    return unableToCheck(parsed.reason);
  }
  const asset = assetForArch(parsed.manifest, arch);
  if (!asset) {
    const reason = `No build is published for the ${arch} architecture.`;
    log('update', `check failed: ${reason}`);
    return unableToCheck(reason);
  }
  state.lastManifest = parsed.manifest;
  state.selectedAsset = asset;
  state.currentTag = parsed.manifest.tag;
  const cmp = compareSemver(parsed.manifest.version, currentVersion());
  if (cmp <= 0) {
    log('update', `check ok · up-to-date (latest=${parsed.manifest.version})`);
    return { status: STATUS.UP_TO_DATE };
  }
  log('update', `check ok · newer-available (latest=${parsed.manifest.version})`);
  return {
    status: STATUS.NEWER_AVAILABLE,
    currentVersion: currentVersion(),
    latestVersion: parsed.manifest.version,
    download: asset,
    releasePageUrl: parsed.manifest.htmlUrl,
  };
}

function unableToCheck(reason) {
  return { status: STATUS.UNABLE, reason: redactHome(reason) };
}

/**
 * Download and verify the selected asset.
 *
 * Single-flight: concurrent callers receive the same in-flight promise.
 * The whole operation is interruptible via `cancelUpdate()`.
 */
export function downloadUpdate() {
  if (state.download) return state.download;
  if (!state.selectedAsset || !state.lastManifest) {
    return Promise.resolve({
      status: STATUS.UNABLE,
      reason: 'No update has been selected. Run Check for Updates first.',
    });
  }
  state.downloadAbort = new AbortController();
  state.download = runDownload(state.lastManifest, state.selectedAsset, state.downloadAbort.signal)
    .catch((err) => {
      const reason = err instanceof Error ? err.message : String(err);
      return { status: STATUS.FAILED, reason: redactHome(reason) };
    })
    .finally(() => {
      state.download = null;
      state.downloadAbort = null;
    });
  return state.download;
}

async function runDownload(manifest, asset, signal) {
  emit({
    status: STATUS.DOWNLOADING,
    latestVersion: manifest.version,
    receivedBytes: 0,
    totalBytes: asset.bytes,
  });
  log('update', `download started · ${asset.filename} · ${asset.bytes} B`);
  const cache = updateCacheDir();
  const finalPath = path.join(cache, asset.filename);
  const partialPath = `${finalPath}.partial`;
  // Ensure no stale partial lingers from a prior failed run.
  try {
    unlinkSync(partialPath);
  } catch {
    // Missing is the expected case.
  }
  const tmp = await fsOpen(partialPath, 'w', 0o600);
  const hasher = createHash('sha256');
  let received = 0;
  let response;
  try {
    response = await fetchStrict(
      asset.url,
      { accept: 'application/octet-stream' },
      {
        signal,
        maxRedirects: MAX_DOWNLOAD_REDIRECTS,
      },
    );
  } catch (err) {
    try {
      await tmp.close();
    } catch {
      // ignore
    }
    safeUnlink(partialPath);
    throw err;
  }
  if (!response.ok || !response.body) {
    try {
      await tmp.close();
    } catch {
      // ignore
    }
    safeUnlink(partialPath);
    throw new Error(`Asset host returned ${response.status} ${response.statusText}.`);
  }
  // Refuse content-lengths that disagree with the manifest by more than a
  // kilobyte, or that exceed the manifest's declared size.
  const declaredTotal = Number(response.headers.get('content-length') || asset.bytes);
  if (declaredTotal > asset.bytes + 1024 || declaredTotal > MAX_UPDATE_BYTES) {
    try {
      await tmp.close();
    } catch {
      // ignore
    }
    safeUnlink(partialPath);
    throw new Error(
      `Asset host advertised ${declaredTotal} bytes; the manifest says ${asset.bytes}.`,
    );
  }
  // Stream the body to disk and the hasher in parallel. The body reader is
  // pulled in chunks so a 150 MB file is never held in memory whole.
  const reader = response.body.getReader();
  let lastEmit = 0;
  const writer = createWriteStream(partialPath, { fd: tmp });
  try {
    // Detach: we'll await `pipeline` instead. The reader pushes chunks to
    // disk and the hasher via a buffer the pipeline owns.
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (signal.aborted) {
        await reader.cancel();
        break;
      }
      if (!value || value.length === 0) continue;
      hasher.update(value);
      received += value.length;
      if (!writer.write(Buffer.from(value))) {
        await new Promise((resolve) => writer.once('drain', resolve));
      }
      const now = Date.now();
      // Throttle: emit progress at most every 250 ms, but always emit the
      // first chunk and the last.
      if (now - lastEmit > 250 || received >= asset.bytes) {
        emit({
          status: STATUS.DOWNLOADING,
          latestVersion: manifest.version,
          receivedBytes: received,
          totalBytes: asset.bytes,
        });
        lastEmit = now;
      }
    }
    await new Promise((resolve, reject) => {
      writer.end((err) => (err ? reject(err) : resolve()));
    });
  } catch (err) {
    safeUnlink(partialPath);
    throw err;
  }
  if (signal.aborted) {
    safeUnlink(partialPath);
    return { status: STATUS.CANCELED };
  }
  emit({ status: STATUS.VERIFYING, latestVersion: manifest.version });
  // The hash is computed over the bytes we wrote; verify against the
  // manifest's digest before we ever consider opening the file.
  const actual = hasher.digest('hex');
  if (actual.toLowerCase() !== asset.sha256.toLowerCase()) {
    safeUnlink(partialPath);
    log('update', `verification failed · expected=${asset.sha256} actual=${actual}`);
    return {
      status: STATUS.FAILED,
      reason: 'The downloaded update could not be verified.',
    };
  }
  // Atomic rename: only the verified file ends up at the public name.
  try {
    renameSync(partialPath, finalPath);
  } catch (err) {
    safeUnlink(partialPath);
    throw new Error(
      `Could not move the verified update into place: ${String(err?.message ?? err)}`,
    );
  }
  // Confirm size on disk matches the manifest.
  const finalStat = statSync(finalPath);
  if (finalStat.size !== asset.bytes) {
    safeUnlink(finalPath);
    throw new Error(
      `The verified file is ${finalStat.size} B, but the manifest says ${asset.bytes} B.`,
    );
  }
  state.downloadedPath = finalPath;
  log('update', `download completed · ${finalPath} · ${finalStat.size} B · sha256=${asset.sha256}`);
  emit({ status: STATUS.READY, latestVersion: manifest.version, path: finalPath });
  return {
    status: STATUS.READY,
    latestVersion: manifest.version,
    path: finalPath,
  };
}

function safeUnlink(p) {
  try {
    unlinkSync(p);
  } catch {
    // Already gone is the expected case.
  }
}

/**
 * Cancel an in-flight download. Has no effect if no download is running.
 */
export function cancelUpdate() {
  if (state.downloadAbort) state.downloadAbort.abort();
}

/**
 * Open the verified DMG. The user drags the app from the mounted volume
 * to `/Applications` themselves; this function only mounts the disk image
 * they have just downloaded and verified.
 *
 * On non-macOS the verdict is a polite refusal — the updater is macOS-only
 * because the DMG format is macOS-only.
 */
export async function openInstaller() {
  if (process.platform !== 'darwin') {
    return { ok: false, reason: 'Updates are macOS-only in this build.' };
  }
  const file = state.downloadedPath;
  if (!file || !existsSync(file)) {
    return { ok: false, reason: 'No verified update is available. Download an update first.' };
  }
  try {
    // shell.openPath returns a string error message on failure, '' on success.
    const err = await shell.openPath(file);
    if (err) {
      log('update', `open failed: ${err}`);
      return { ok: false, reason: err };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: String(err?.message ?? err) };
  }
}

/**
 * Bounded cache cleanup. Keeps the most recent verified artifact and any
 * partials the next run would otherwise have to remove anyway, and unlinks
 * everything else in the cache directory.
 */
export function pruneUpdateCache({ keep = 1 } = {}) {
  const dir = updateCacheDir();
  let entries = [];
  try {
    entries = readdirSync(dir)
      .map((name) => {
        const full = path.join(dir, name);
        try {
          return { name, full, mtimeMs: statSync(full).mtimeMs, size: statSync(full).size };
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return 0;
  }
  const verified = entries
    .filter((e) => !e.name.endsWith('.partial'))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  const toKeep = new Set(verified.slice(0, keep).map((e) => e.full));
  let removed = 0;
  for (const entry of entries) {
    if (!toKeep.has(entry.full)) {
      try {
        unlinkSync(entry.full);
        removed += 1;
      } catch {
        // ignore
      }
    }
  }
  return removed;
}

/**
 * `fetch` with the redirect allow-list and the size cap. The Electron main
 * process has `fetch` since 25; we layer our guard on top.
 */
async function fetchStrict(url, headers, { signal, maxRedirects = 3 } = {}) {
  let current = url;
  for (let i = 0; i <= maxRedirects; i++) {
    const ok = isHttpsUrlWithAllowedHost(current);
    if (!ok) {
      throw new Error(`Refused to fetch ${current}: not in the release-host allow-list.`);
    }
    const response = await fetch(current, {
      method: 'GET',
      redirect: 'manual',
      headers,
      ...(signal ? { signal } : {}),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        throw new Error(`Got a redirect with no Location from ${current}.`);
      }
      const next = new URL(location, current).toString();
      current = next;
      continue;
    }
    return response;
  }
  throw new Error(`Too many redirects (limit ${maxRedirects}) reaching ${url}.`);
}

function isHttpsUrlWithAllowedHost(value) {
  if (typeof value !== 'string' || !value.startsWith('https://')) return false;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  if (parsed.username || parsed.password) return false;
  if (parsed.port && parsed.port !== '443') return false;
  return isAllowedReleaseHost(parsed.hostname);
}

function describeCheckError(err) {
  if (err instanceof Error) {
    // The Electron fetch wrapper names its own errors. We summarise.
    return redactHome(err.message);
  }
  return 'Unknown network error.';
}

function redactHome(value) {
  if (typeof value !== 'string') return value;
  const home = app.getPath('home');
  return value.split(home).join(REDACTED_PATH_TOKEN);
}

export const __testing = {
  state,
  compareSemver,
  parseSemver,
  assetForArch,
  parseReleaseManifest,
  ALLOWED_RELEASE_HOSTS,
  currentVersion,
  currentArch,
  appBundleName,
  appBundleId,
  manifestUrl,
  releaseTagPage,
  updateCacheDir,
  redactHome,
  MAX_UPDATE_BYTES,
};
