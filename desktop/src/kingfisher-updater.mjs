/**
 * Kingfisher's auto-update engine.
 *
 * This module is the single point in the desktop shell that talks to
 * `electron-updater`. The renderer never imports it; the public update
 * service (`update-service.mjs`) is its only caller. Keeping a thin
 * bridge here makes the security-relevant configuration auditable in
 * one place: every flag that affects what the updater is allowed to do
 * is set on the line right below this comment, and the rest of the
 * file is plumbing.
 *
 * The design here is not "use the default settings." Each `false` is
 * deliberate. `autoDownload: false` because the user has to click
 * `Install Update` before any bytes leave this machine.
 * `autoInstallOnAppQuit: false` because the user clicked `Install
 * Update` for *this* quit, not for some later quit they may not even
 * associate with the update. `allowPrerelease: false` because the
 * public channel is `stable` and the only consumer.
 * `allowDowngrade: false` because a corrupted manifest or a hostile
 * mirror must never produce a downgrade. None of these are the
 * electron-updater defaults; a maintainer who flips one needs a
 * reason that survives the next security review.
 *
 * The production feed is whatever electron-builder baked into
 * `app-update.yml` at packaging time. Tests, and the local staging
 * server, route through `setFeedURL(...)` so the same code path is
 * exercised in CI.
 */

import path from 'node:path';

import { app, dialog } from 'electron';

import { log } from './log.mjs';

/**
 * `@electron/update` is a CommonJS package. We load it lazily so the
 * main process can still import this file in `npm run dev` and in the
 * test runner without paying the cost and without dragging it into
 * a path that tries to use `app.getVersion()` against an unpackaged
 * build. The promise is memoised; subsequent calls return the same
 * `AppUpdater` instance.
 */
let autoUpdaterPromise = null;

function loadAutoUpdater() {
  if (!autoUpdaterPromise) {
    autoUpdaterPromise = import('electron-updater').then(({ autoUpdater }) => {
      // The four flags that matter. See the module docstring for the
      // threat model that drives each one.
      autoUpdater.autoDownload = false;
      autoUpdater.autoInstallOnAppQuit = false;
      autoUpdater.autoRunAppAfterInstall = true;
      autoUpdater.allowPrerelease = false;
      autoUpdater.allowDowngrade = false;
      autoUpdater.disableDifferentialDownload = false;

      // No logger set; the defaults log everything to the parent
      // process stderr. We want our own redacted log.
      autoUpdater.logger = null;
      return autoUpdater;
    });
  }
  return autoUpdaterPromise;
}

/**
 * A bag of listeners the rest of the application registered against
 * the autoUpdater. We expose one stable callback hook per event so
 * `update-service.mjs` does not need to touch electron-updater at
 * all.
 */
const listeners = {
  checking: new Set(),
  available: new Set(),
  notAvailable: new Set(),
  progress: new Set(),
  downloaded: new Set(),
  cancelled: new Set(),
  error: new Set(),
};

function emit(channel, payload) {
  for (const fn of listeners[channel]) {
    try {
      fn(payload);
    } catch (err) {
      log('update', `listener ${channel} threw: ${String(err?.message ?? err)}`);
    }
  }
}

let wired = false;
async function wire(autoUpdater) {
  if (wired) return;
  wired = true;
  autoUpdater.on('checking-for-update', () => emit('checking'));
  autoUpdater.on('update-available', (info) => emit('available', info));
  autoUpdater.on('update-not-available', (info) => emit('notAvailable', info));
  autoUpdater.on('download-progress', (info) => emit('progress', info));
  autoUpdater.on('update-downloaded', (info) => emit('downloaded', info));
  autoUpdater.on('update-cancelled', (info) => emit('cancelled', info));
  autoUpdater.on('error', (err) => emit('error', err));
}

/**
 * The cancellation token associated with the download currently in
 * flight, or `null`. We track it because electron-updater cancels via
 * a token argument to `downloadUpdate`, not via a public method.
 */
let activeToken = null;

/**
 * Override the feed URL. Used by the local staging server so the same
 * packaged binary can be tested end-to-end against a deterministic
 * candidate. In production this is never called: the URL is baked
 * into `app-update.yml` at packaging time and we trust that source.
 */
export async function setFeedURL(options) {
  const autoUpdater = await loadAutoUpdater();
  await wire(autoUpdater);
  autoUpdater.setFeedURL(options);
  log('update', `feed override set: ${describeFeed(options)}`);
}

function describeFeed(options) {
  if (typeof options === 'string') return options;
  if (options && typeof options === 'object') {
    if (options.url) return options.url;
    if (options.provider) return `provider=${options.provider}`;
  }
  return '<unspecified>';
}

/**
 * Ask the upstream feed whether a newer version is available.
 *
 * `null` is a normal outcome: it means the running binary is not in a
 * packaging layout that supports update checks (for example
 * `electron .` from a developer checkout). The caller should surface
 * that as a polite "updater is disabled in this build," not as an
 * error.
 */
export async function checkForUpdate() {
  const autoUpdater = await loadAutoUpdater();
  await wire(autoUpdater);
  if (!app.isPackaged) {
    log('update', 'check skipped: app is not packaged');
    return null;
  }
  return autoUpdater.checkForUpdates();
}

/**
 * Begin downloading the candidate that `checkForUpdate` reported.
 *
 * Returns the list of paths the updater wrote to. The caller does not
 * need to do anything with them — `quitAndInstall` consumes them
 * internally — but returning the array keeps the call site honest
 * about what the updater actually produced.
 */
export async function downloadUpdate() {
  const autoUpdater = await loadAutoUpdater();
  await wire(autoUpdater);
  if (!app.isPackaged) {
    throw new Error('The updater is disabled in this build.');
  }
  return autoUpdater.downloadUpdate();
}

/**
 * Variant of `downloadUpdate` that accepts a cancellation token. Kept
 * separate so the call site in `update-service.mjs` is explicit about
 * the user pressing Cancel.
 */
export async function downloadUpdateCancellable() {
  const autoUpdater = await loadAutoUpdater();
  await wire(autoUpdater);
  if (!app.isPackaged) {
    throw new Error('The updater is disabled in this build.');
  }
  const { CancellationToken } = await import('electron-updater');
  const token = new CancellationToken();
  activeToken = token;
  try {
    return await autoUpdater.downloadUpdate(token);
  } finally {
    if (activeToken === token) activeToken = null;
  }
}

/**
 * Cancel an in-flight download. No-op if nothing is downloading.
 */
export async function cancelDownload() {
  // electron-updater does not expose `cancelDownload` on the public
  // surface; the way to cancel is the `cancellationToken` passed to
  // `downloadUpdate`. We track that here.
  if (activeToken) {
    activeToken.cancel();
    activeToken = null;
  }
}

/**
 * Quit the application and let the platform updater install the
 * downloaded candidate. After this call, this process is expected to
 * exit; the installer launches the new version.
 *
 * `onQuitReady` is a small hook the caller uses to perform last-write
 * work — the save barrier — between "user has consented" and "process
 * is going away."
 */
export async function quitAndInstall(onQuitReady) {
  const autoUpdater = await loadAutoUpdater();
  await wire(autoUpdater);
  if (!app.isPackaged) {
    throw new Error('The updater is disabled in this build.');
  }
  if (typeof onQuitReady === 'function') {
    // electron-updater does not provide a generic pre-quit hook on
    // macOS. `quitAndInstall` closes windows and calls `app.quit()`.
    // We do our flushing *before* calling it, so the only contract we
    // need is "do not call quitAndInstall until onQuitReady resolved."
    await onQuitReady();
  }
  autoUpdater.quitAndInstall();
}

/**
 * Verify that the running binary carries a Developer ID Application
 * signature. Used by the release preflight to refuse to ship a build
 * that was signed with the wrong identity.
 */
export async function getRunningAppSignature() {
  if (process.platform !== 'darwin') {
    return { signed: false, reason: 'not-darwin' };
  }
  try {
    const { spawn } = await import('node:child_process');
    return await new Promise((resolve) => {
      const proc = spawn('codesign', ['-dvvv', app.getPath('exe')], { stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      let err = '';
      proc.stdout.on('data', (chunk) => {
        out += chunk.toString('utf8');
      });
      proc.stderr.on('data', (chunk) => {
        err += chunk.toString('utf8');
      });
      proc.on('error', (error) => resolve({ signed: false, reason: error.message }));
      proc.on('close', (code) => {
        if (code !== 0) {
          resolve({ signed: false, reason: err.trim() || `codesign exit ${code}` });
          return;
        }
        const authority = (out.match(/Authority=(.+)/g) || [])
          .map((line) => line.replace(/^Authority=/, '').trim())
          .filter(Boolean);
        const teamIdMatch = out.match(/TeamIdentifier=([A-Z0-9]+)/);
        const isDeveloperId = authority.some((a) => a.startsWith('Developer ID Application:'));
        resolve({
          signed: true,
          isDeveloperId,
          authorities: authority,
          teamId: teamIdMatch ? teamIdMatch[1] : null,
          raw: out,
        });
      });
    });
  } catch (err) {
    return { signed: false, reason: String(err?.message ?? err) };
  }
}

/**
 * Listener registration. The bridge returns an `off` function so the
 * caller does not have to remember which argument was which.
 */
export function on(event, listener) {
  const channel = ({
    'checking-for-update': 'checking',
    'update-available': 'available',
    'update-not-available': 'notAvailable',
    'download-progress': 'progress',
    'update-downloaded': 'downloaded',
    'update-cancelled': 'cancelled',
    error: 'error',
  })[event];
  if (!channel) throw new Error(`Unknown updater event: ${event}`);
  listeners[channel].add(listener);
  return () => listeners[channel].delete(listener);
}

/**
 * Where electron-updater caches the in-flight download, exposed for
 * `pruneUpdateCache`. Lives under `app.getPath('cache')` so the OS
 * can purge it under disk pressure.
 */
export function updaterCacheDir() {
  const root = app.getPath('cache');
  return path.join(root, 'Kingfisher', 'updater');
}

/**
 * Confirm the updater cannot run in this build. Used by the dev-mode
 * test to assert "Check for Updates" produces a polite refusal in
 * `npm run dev` rather than replacing the developer build with a
 * GitHub release.
 */
export function isUpdaterSupported() {
  return app.isPackaged;
}

/**
 * A small fallback. If for any reason the in-process `quitAndInstall`
 * fails, we surface the failure as a system dialog. The user is not
 * left wondering why the application closed and nothing happened.
 */
export function reportInstallerFailure(reason) {
  dialog.showErrorBox(
    'Kingfisher could not complete the update',
    `The update was downloaded and verified, but the installer could not be started.\n\n${reason}\n\n` +
      'Restart Kingfisher and run Check for Updates again to retry.',
  );
}
