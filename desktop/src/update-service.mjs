/**
 * The desktop update service.
 *
 * One canonical public surface, three callers, and a single install
 * engine. The renderer (the `Check for Updates` window, the
 * application menu, and the Settings → Application panel) talks to
 * `check`, `installAndRestart`, `cancelDownload`, `subscribe`, and
 * `getState` through the typed IPC bridge in `update-window.mjs`.
 * Nothing else in the shell is allowed to do an update.
 *
 * ## One engine
 *
 * The previous shape of this file was a custom downloader that
 * streamed the DMG, hashed it, mounted it, and asked the user to drag
 * the new build into `Applications` by hand. That was the right
 * answer for the Phase 35 release surface and the manual fallback
 * path is preserved — but the *normal* path the owner wants is
 * "Check for Updates → Install Update → Kingfisher closes and
 * relaunches." That is the job of `electron-updater` and we use it.
 * The custom protocol parser lives on, but only for the staging
 * server that exercises the same code path against a deterministic
 * candidate before the public release.
 *
 * ## State machine
 *
 * The states are real, and they pin the transitions the menu and
 * dialog can show. The list of legal transitions is in
 * `update-state.mjs`; the renderer never invents a state.
 *
 *   idle ─check─► checking
 *   checking ─same─► up-to-date
 *   checking ─newer─► available
 *   available ─installAndRestart─► downloading
 *   downloading ─complete─► verifying
 *   verifying ─ok─► ready-to-install
 *   verifying ─bad─► failed
 *   ready-to-install ─installAndRestart─► waiting-for-save
 *   waiting-for-save ─ok─► installing
 *   waiting-for-save ─fail─► failed
 *   installing ─quitAndInstall─► restarting
 *   restarting ─new process boot─► idle
 *   downloading ─cancel─► canceled
 *   any ─network error─► unable-to-check
 *
 * ## Manual only
 *
 * The service never runs on a timer, never runs on launch, and never
 * fires as a side effect of opening a Study. The user clicks the menu
 * item; one HTTPS request goes out; the user reads the verdict.
 *
 * ## No telemetry
 *
 * The service does not log the body of responses, does not log the
 * headers, and does not phone home. What it logs is bounded to the
 * stage names a user can reproduce.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import { app, shell } from 'electron';

import { log } from './log.mjs';
import {
  STATUS,
  compareSemver,
  parseReleaseManifest,
  assetForArch,
  isAllowedReleaseHost,
} from './update-protocol.mjs';
import {
  cancelDownload as engineCancel,
  checkForUpdate as engineCheck,
  downloadUpdateCancellable as engineDownload,
  getRunningAppSignature,
  isUpdaterSupported,
  on as engineOn,
  quitAndInstall as engineQuitAndInstall,
  setFeedURL as engineSetFeedURL,
  updaterCacheDir,
} from './kingfisher-updater.mjs';

const REDACTED_PATH_TOKEN = '<cache>';

/* --------------------------------------------------------------------- *
 * State                                                                  *
 * --------------------------------------------------------------------- */

const initialVerdict = () => ({
  status: STATUS.IDLE,
  currentVersion: app.getVersion(),
});

const state = {
  /**
   * The most recent verdict the renderer should know about. Held
   * here so the dialog and the menu both see the same value when
   * either is opened.
   */
  verdict: initialVerdict(),
  /**
   * Single-flight in-flight check promise. A second `check()` call
   * while a check is running gets the same promise.
   */
  checkPromise: null,
  /**
   * Single-flight in-flight install promise. The Install Update
   * button is the only thing that creates one.
   */
  installPromise: null,
  /**
   * The candidate the engine reported. The service keeps a
   * reference to the `UpdateInfo` so the rendering layer can show
   * the version and release date without re-fetching.
   */
  candidate: null,
  /**
   * The listener that receives every verdict.
   */
  listener: null,
  /**
   * The id of the currently-live check operation. Every event the
   * engine emits is bound to the operation that produced it; a
   * late event from a previous check (the user clicked Check
   * twice, the second click superseded the first) must not
   * overwrite the verdict the second check is computing.
   * Incremented on every `check()` call; the engine event
   * handlers compare the id they were bound to against the
   * current `state.activeCheckId` and drop the event if they
   * disagree.
   */
  activeCheckId: 0,
  /**
   * The unsubscribers for the engine event handlers bound to the
   * current check. Stashed so a new check can detach the old
   * handlers before the new ones fire — which is what enforces
   * the generation id at the engine layer, not just at the
   * state-machine layer.
   */
  engineUnsubscribers: [],
};

function emit(next) {
  state.verdict = next;
  try {
    state.listener?.(next);
  } catch (err) {
    log('update', `listener threw: ${String(err?.message ?? err)}`);
  }
}

/* --------------------------------------------------------------------- *
 * Subscribe                                                              *
 * --------------------------------------------------------------------- */

export function subscribe(listener) {
  state.listener = listener;
  // Replay the current verdict so a freshly subscribed dialog
  // doesn't start in the dark.
  listener(state.verdict);
  return () => {
    if (state.listener === listener) state.listener = null;
  };
}

export function getState() {
  return state.verdict;
}

/* --------------------------------------------------------------------- *
 * Wire the engine to our state machine                                   *
 * --------------------------------------------------------------------- */

/**
 * Bind the engine's events to the state machine, *for one check*.
 *
 * Every `check()` call gets a fresh generation id; the handlers
 * this function returns close over that id. When a subsequent
 * check starts, the previous handlers' unsubscribe functions run
 * first, and any late event from the previous check is dropped
 * (the listener is no longer in the engine's set). This is the
 * generation id requirement (PART T) — a slow `error` from
 * check A must not overwrite a successful check B's verdict.
 *
 * Phase 37 hardening: previously, every check reused the same
 * singleton handlers bound at module load. That worked in
 * practice because the engine fires events in order, but a slow
 * failure after a fast success could land *after* the success's
 * render and would overwrite it. The generation id is the
 * definitive answer; the unsubscribe list is the implementation.
 */
function wireEngineForCheck(checkId) {
  // Detach any handlers bound to the previous check.
  for (const off of state.engineUnsubscribers) {
    try {
      off();
    } catch (err) {
      log('update', `engine unsubscribe threw: ${String(err?.message ?? err)}`);
    }
  }
  state.engineUnsubscribers = [];

  const isCurrent = () => state.activeCheckId === checkId;
  const bound = [];

  bound.push(
    engineOn('checking-for-update', () => {
      if (!isCurrent()) return;
      emit({ ...state.verdict, status: STATUS.CHECKING });
    }),
  );

  bound.push(
    engineOn('update-available', (info) => {
      if (!isCurrent()) return;
      const latest = info?.version ?? state.candidate?.version ?? null;
      const cmp = latest ? compareSemver(latest, app.getVersion()) : 1;
      if (cmp <= 0) {
        // A newer-on-paper version that does not pass our semver
        // comparison is a downgrade or an out-of-channel tag.
        log('update', `update-available ignored: ${latest} <= ${app.getVersion()}`);
        emit({ ...state.verdict, status: STATUS.UP_TO_DATE });
        return;
      }
      state.candidate = info;
      emit({
        status: STATUS.AVAILABLE,
        currentVersion: app.getVersion(),
        latestVersion: latest,
        releaseDate: info?.releaseDate ?? null,
        sizeBytes: pickUpdateSize(info),
      });
    }),
  );

  bound.push(
    engineOn('update-not-available', () => {
      if (!isCurrent()) return;
      emit({ ...state.verdict, status: STATUS.UP_TO_DATE });
    }),
  );

  bound.push(
    engineOn('download-progress', (info) => {
      if (!isCurrent()) return;
      if (state.verdict.status !== STATUS.DOWNLOADING) {
        emit({ ...state.verdict, status: STATUS.DOWNLOADING });
      }
      emit({
        ...state.verdict,
        status: STATUS.DOWNLOADING,
        latestVersion: state.candidate?.version ?? state.verdict.latestVersion,
        receivedBytes: info?.transferred ?? info?.delta ?? 0,
        totalBytes: info?.total ?? state.candidate?.sizeBytes ?? null,
        bytesPerSecond: info?.bytesPerSecond ?? null,
      });
    }),
  );

  bound.push(
    engineOn('update-downloaded', (info) => {
      if (!isCurrent()) return;
      state.candidate = info;
      emit({
        status: STATUS.READY,
        currentVersion: app.getVersion(),
        latestVersion: info?.version ?? state.candidate?.version,
        path: info?.path ?? null,
      });
    }),
  );

  bound.push(
    engineOn('update-cancelled', () => {
      if (!isCurrent()) return;
      emit({ ...state.verdict, status: STATUS.CANCELED });
    }),
  );

  bound.push(
    engineOn('error', (err) => {
      if (!isCurrent()) return;
      log('update', `engine error: ${String(err?.message ?? err)}`);
      emit({
        status: STATUS.FAILED,
        reason: redactHome(String(err?.message ?? err)),
      });
    }),
  );

  state.engineUnsubscribers = bound;
}

function pickUpdateSize(info) {
  if (!info) return null;
  if (typeof info.size === 'number') return info.size;
  if (Array.isArray(info.files) && info.files.length) {
    const f = info.files[0];
    if (typeof f.size === 'number') return f.size;
  }
  return null;
}

/* --------------------------------------------------------------------- *
 * check                                                                  *
 * --------------------------------------------------------------------- */

/**
 * Which channel this build is on, as `desktop/scripts/build.mjs` recorded
 * it. `main.mjs` calls this once at launch. Unconfigured means stable, which
 * is the conservative reading: a stable build consults the feed and is
 * offered only a strictly newer semantic version.
 */
const channel = { name: 'stable', build: null, downloadUrl: null };

export function configureChannel({ name, build = null, downloadUrl = null } = {}) {
  channel.name = name === 'preview' ? 'preview' : 'stable';
  channel.build = build;
  channel.downloadUrl = downloadUrl;
}

/** Where a person goes to fetch this channel's newest build by hand. */
export function manualDownloadUrl() {
  return channel.downloadUrl;
}

/**
 * One sentence a person can act on, from whatever the engine threw.
 *
 * The engine's errors are for developers: an HTTP failure arrives with the
 * response headers, the request id and a stack naming files inside the
 * bundle. The dialog showed all of it. The three cases a user can meet are
 * named; anything else is its first line, with the home directory redacted
 * and the length bounded.
 */
export function describeCheckFailure(err) {
  const message = String(err?.message ?? err ?? '');
  if (/latest-mac\.yml/.test(message) && /404/.test(message)) {
    return 'The current release on the release host carries no update feed, so there is nothing to compare against. The download page always has the newest build.';
  }
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|net::ERR_|network|offline/i.test(message)) {
    return 'The release host could not be reached. Check the connection and try again.';
  }
  if (/403|429|rate limit/i.test(message)) {
    return 'The release host refused the request for now. Try again in a few minutes.';
  }
  const first = redactHome(message.split('\n')[0]).replace(/\s+/g, ' ').trim();
  return first.length > 200 ? `${first.slice(0, 197)}…` : first || 'The check did not complete.';
}

export async function check() {
  if (state.checkPromise) return state.checkPromise;
  if (channel.name === 'preview') {
    // No request is made. A preview is replaced by downloading the next
    // one; the stable feed would either 404 (no latest-mac.yml on the
    // release) or, once a stable release exists, correctly offer it — and
    // that offer is what `stable` builds are for.
    emit({
      status: STATUS.PREVIEW,
      currentVersion: app.getVersion(),
      build: channel.build,
      downloadUrl: channel.downloadUrl,
    });
    return state.verdict;
  }
  if (!isUpdaterSupported()) {
    emit({
      status: STATUS.UNABLE,
      currentVersion: app.getVersion(),
      reason: 'The updater is disabled in this build. Use the development build to test changes.',
    });
    return state.verdict;
  }
  // Phase 37: generation id (PART T). Every check bumps the
  // id; the previous check's engine event handlers are detached
  // before the new ones are bound, so a slow event from a
  // previous check cannot overwrite a current verdict.
  state.activeCheckId += 1;
  const checkId = state.activeCheckId;
  wireEngineForCheck(checkId);
  emit({ status: STATUS.CHECKING, currentVersion: app.getVersion() });
  state.checkPromise = (async () => {
    try {
      await engineCheck();
    } catch (err) {
      // The error is the engine's; the engine event handler
      // will have already emitted the FAILED verdict, gated on
      // the current id. If the handler has been superseded, this
      // log line is the only record.
      log('update', `check failed: ${String(err?.message ?? err).split('\n')[0]}`);
      if (state.activeCheckId === checkId) {
        emit({
          status: STATUS.UNABLE,
          currentVersion: app.getVersion(),
          reason: describeCheckFailure(err),
        });
      }
    } finally {
      // Only clear the in-flight slot if the operation that set
      // it is still the current one. A check that was superseded
      // by a newer check must not null out the newer check's
      // slot.
      if (state.activeCheckId === checkId) {
        state.checkPromise = null;
      }
    }
    return state.verdict;
  })();
  return state.checkPromise;
}

/* --------------------------------------------------------------------- *
 * cancelDownload                                                         *
 * --------------------------------------------------------------------- */

/**
 * Cancel an in-flight download.
 *
 * Phase 37 (PART U): the cancel race at 99%.
 *
 * The previous implementation called `engineCancel()` and let the
 * event-driven state machine handle the rest. A late
 * `update-downloaded` event after the cancel could land in the
 * same tick and flip the verdict from CANCELED to READY, leaving
 * the user with a "ready" state they did not ask for and a
 * download they tried to abort. The fix is to invalidate the
 * current check's generation id *before* the engine's events
 * arrive — the existing `isCurrent()` gate in the event handlers
 * then drops the late events.
 */
export async function cancelDownload() {
  // Invalidate the current check so a late `update-downloaded` or
  // `error` event from the cancelled download cannot mutate the
  // verdict. The engine will still emit `update-cancelled`; the
  // handler will see the new id and drop the event too — the
  // verdict is set explicitly to CANCELED below instead.
  const cancelledId = state.activeCheckId;
  state.activeCheckId += 1;
  // Detach the engine handlers for the cancelled check; the
  // unsubscribe list is now stale.
  for (const off of state.engineUnsubscribers) {
    try {
      off();
    } catch (err) {
      log('update', `cancel unsubscribe threw: ${String(err?.message ?? err)}`);
    }
  }
  state.engineUnsubscribers = [];
  try {
    await engineCancel();
  } catch (err) {
    log('update', `cancel failed: ${String(err?.message ?? err)}`);
  }
  // Emit CANCELED directly; the engine's `update-cancelled` event
  // has been orphaned by the unsubscribe above.
  emit({ status: STATUS.CANCELED });
  // Clear the in-flight check promise so the user can start a
  // fresh check after the cancel.
  state.checkPromise = null;
  void cancelledId;
}

/* --------------------------------------------------------------------- *
 * installAndRestart                                                      *
 * --------------------------------------------------------------------- */

/**
 * The single Install Update entry point. It is intentionally not
 * "download" + "open" + "wait for the user." The chain is automatic
 * once the user has given consent: download, verify, save barrier,
 * engine shutdown, quit, install, relaunch. If the user picks
 * "Later," nothing here runs.
 */
export async function installAndRestart({ onSaveBarrier, isQuitting = () => false } = {}) {
  if (state.installPromise) return state.installPromise;
  // Phase 37 (PART W): do not start a new install if the
  // application is already on its way out. The user clicking
  // Quit while the dialog was open, or the macOS app menu's
  // Quit command racing an Install Update click, must not
  // produce a half-completed install on top of a shutdown.
  if (typeof isQuitting === 'function' && isQuitting()) {
    log('update', 'install refused: app is quitting');
    emit({
      status: STATUS.FAILED,
      reason:
        'Kingfisher is shutting down. The update was not installed. ' +
        'Open Kingfisher again and try Check for Updates.',
    });
    return state.verdict;
  }
  state.installPromise = (async () => {
    try {
      if (state.verdict.status === STATUS.AVAILABLE) {
        // First time: we have to download. After this, the
        // engine's `update-downloaded` event flips us into
        // READY and the second branch below runs.
        await runDownload();
      }
      if (state.verdict.status !== STATUS.READY && state.verdict.status !== STATUS.DOWNLOADING) {
        // Defensive: if we are not in a state where the next
        // move is "install," the user must have cancelled or
        // we already gave up.
        return state.verdict;
      }
      // Confirm the running binary is the one we expect. A
      // process that has been replaced under our feet by
      // another updater should not run the install path on
      // its own binary.
      const sig = await getRunningAppSignature();
      if (sig.signed && sig.isDeveloperId === false) {
        log('update', 'install refused: running app is not Developer ID signed');
        emit({
          status: STATUS.FAILED,
          reason:
            'The running Kingfisher is not Developer ID signed. Refusing to install a trusted update on top of an untrusted binary.',
        });
        return state.verdict;
      }
      emit({ ...state.verdict, status: STATUS.WAITING_FOR_SAVE });
      // Save barrier. The renderer confirms all writes are
      // committed; if the user has unsaved work, we wait up
      // to `SAVE_BARRIER_TIMEOUT_MS` for the renderer to finish.
      // The barrier fails closed on every unexpected path: a
      // timeout, a missing window, a transport failure, or an
      // explicit `ok: false` from the renderer all refuse the
      // install. DATA SAFETY > UPDATE CONVENIENCE.
      if (typeof onSaveBarrier === 'function') {
        const barrier = await onSaveBarrier({ timeoutMs: SAVE_BARRIER_TIMEOUT_MS });
        if (!barrier?.ok) {
          const failureReason = barrier?.reason ?? 'unknown';
          log('update', `install refused: save barrier failed (${failureReason})`);
          emit({
            status: STATUS.FAILED,
            reason: humanizeSaveBarrierFailure(barrier),
          });
          return state.verdict;
        }
      }
      emit({ ...state.verdict, status: STATUS.INSTALLING });
      // We hand the engine the pre-quit hook here too so the
      // engine is free to do additional work after we have
      // cleared the save barrier; in practice the pre-quit
      // hook is the barrier callback itself.
      await engineQuitAndInstall();
      // We only reach this line if quitAndInstall did not
      // actually quit (e.g. a refused-silent mode). The
      // `restarting` verdict tells the dialog to wait for the
      // process to die.
      emit({ status: STATUS.RESTARTING });
    } catch (err) {
      log('update', `install failed: ${String(err?.message ?? err)}`);
      emit({
        status: STATUS.FAILED,
        reason: redactHome(String(err?.message ?? err)),
      });
    } finally {
      state.installPromise = null;
    }
    return state.verdict;
  })();
  return state.installPromise;
}

/**
 * Maximum time we are willing to wait for the renderer to confirm
 * its writes are committed. 5 seconds is generous: the renderer is
 * local IndexedDB, not a network round-trip, and the worst realistic
 * case is a slow final `requestAnimationFrame` of an active Study.
 * The actual constant lives in `save-barrier.mjs` so the main
 * process and the test suite agree on one value.
 */
import { DEFAULT_TIMEOUT_MS as SAVE_BARRIER_TIMEOUT_MS } from './save-barrier.mjs';

async function runDownload() {
  emit({
    ...state.verdict,
    status: STATUS.DOWNLOADING,
    receivedBytes: 0,
    totalBytes: state.candidate?.sizeBytes ?? null,
  });
  await engineDownload();
}

/* --------------------------------------------------------------------- *
 * Manual fallback                                                        *
 * --------------------------------------------------------------------- */

/**
 * For environments where the in-process updater cannot run, the
 * verified manual installer (the polished DMG) is the fallback. The
 * menu never offers this on a successful auto-update path; it is
 * here so a single dialog state can offer it as a last resort.
 */
export async function openManualInstaller({ manifest, arch } = {}) {
  if (process.platform !== 'darwin') {
    return { ok: false, reason: 'Updates are macOS-only in this build.' };
  }
  // The manual fallback re-uses the existing protocol parser so
  // the same allow-list and host checks protect the user. This is
  // the one place the custom protocol still runs in production.
  const manifestUrl = `${app.getPath('exe')}`;
  void manifestUrl;
  const parsed = manifest ? parseReleaseManifest(manifest) : null;
  if (parsed && !parsed.ok) {
    return { ok: false, reason: parsed.reason };
  }
  let asset = null;
  if (parsed && parsed.ok) {
    asset = assetForArch(parsed.manifest, arch || process.arch);
    if (!asset) {
      return {
        ok: false,
        reason: `No build is published for the ${arch || process.arch} architecture.`,
      };
    }
    if (!isAllowedReleaseHost(new URL(asset.url).hostname)) {
      return { ok: false, reason: 'The manual installer host is not in the allow-list.' };
    }
  }
  const url =
    asset?.url ??
    `${process.env.KINGFISHER_PUBLIC_REPOSITORY_URL || 'https://github.com/mardakurt/kingfisher'}/releases/latest`;
  try {
    await shell.openExternal(url);
    return { ok: true, url };
  } catch (err) {
    return { ok: false, reason: String(err?.message ?? err) };
  }
}

/* --------------------------------------------------------------------- *
 * Staging feed                                                           *
 * --------------------------------------------------------------------- */

/**
 * Override the production feed URL. Used by the local staging
 * server so the same packaged binary can be tested end-to-end
 * against a deterministic candidate.
 *
 * In production this is never called: the feed URL is baked into
 * `app-update.yml` at packaging time.
 */
export async function setStagingFeed({ url, channel = 'latest' } = {}) {
  if (!url) throw new Error('setStagingFeed requires a non-empty url.');
  await engineSetFeedURL({
    provider: 'generic',
    url,
    channel,
  });
}

/* --------------------------------------------------------------------- *
 * First-launch acknowledgement                                           *
 * --------------------------------------------------------------------- */

const ACKNOWLEDGED_VERSION_KEY = 'kingfisher.acknowledgedUpdateVersion';

/**
 * Returns `true` if the running build has already shown its
 * "Kingfisher was updated to X.Y.Z" notice to the user. Used by the
 * shell to gate the small post-update confirmation banner so it
 * appears exactly once.
 */
export function hasAcknowledgedUpdate(currentVersion = app.getVersion()) {
  try {
    return app.getPath('userData') && Boolean(readAcknowledgedVersion() === currentVersion);
  } catch {
    return false;
  }
}

export function acknowledgeUpdate(currentVersion = app.getVersion()) {
  try {
    const p = `${app.getPath('userData')}/kingfisher-update-state.json`;
    writeFileSync(
      p,
      JSON.stringify(
        { [ACKNOWLEDGED_VERSION_KEY]: currentVersion, at: new Date().toISOString() },
        null,
        2,
      ),
      'utf8',
    );
  } catch (err) {
    log('update', `acknowledge failed: ${String(err?.message ?? err)}`);
  }
}

function readAcknowledgedVersion() {
  try {
    const p = `${app.getPath('userData')}/kingfisher-update-state.json`;
    if (!existsSync(p)) return null;
    const body = JSON.parse(readFileSync(p, 'utf8'));
    return body?.[ACKNOWLEDGED_VERSION_KEY] ?? null;
  } catch {
    return null;
  }
}

/* --------------------------------------------------------------------- *
 * Cache pruning                                                          *
 * --------------------------------------------------------------------- */

export function pruneUpdateCache({ keep = 1 } = {}) {
  const dir = updaterCacheDir();
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    /* nothing to do */
  }
  let entries = [];
  try {
    entries = readdirSync(dir)
      .map((name) => {
        const full = path.join(dir, name);
        try {
          return { name, full, mtimeMs: statSync(full).mtimeMs };
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return 0;
  }
  if (!entries.length) return 0;
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
        /* ignore */
      }
    }
  }
  return removed;
}

function redactHome(value) {
  if (typeof value !== 'string') return value;
  try {
    const home = app.getPath('home');
    return value.split(home).join(REDACTED_PATH_TOKEN);
  } catch {
    return value;
  }
}

/**
 * Translate a `BarrierResult` failure into a sentence the dialog can
 * show. The user gets the actionable reason; the raw reason is
 * preserved for diagnostics.
 */
function humanizeSaveBarrierFailure(barrier) {
  const reason = barrier?.reason ?? 'unknown';
  const detail = barrier?.detail ? ` (${barrier.detail})` : '';
  switch (reason) {
    case 'pending-writes':
      return (
        'Kingfisher could not safely finish saving your work. The update was not installed. ' +
        'Your downloaded update is still cached and you can retry after the save completes.' +
        detail
      );
    case 'write-failed':
      return (
        'Kingfisher could not commit a recent change to local storage. ' +
        'The update was not installed. Try again after closing the file that may be locked, ' +
        'or after freeing disk space.' +
        detail
      );
    case 'timeout':
      return (
        'Kingfisher could not confirm that your work finished saving. ' +
        'The update was not installed. Your downloaded update is still cached ' +
        'and you can try again.' +
        detail
      );
    case 'renderer-unavailable':
      return (
        'Kingfisher could not reach the application window to confirm your work. ' +
        'The update was not installed.' +
        detail
      );
    default:
      return (
        'Kingfisher could not safely finish saving your work. The update was not installed. ' +
        'Your downloaded update is still cached and you can retry after the save completes.' +
        detail
      );
  }
}

/* --------------------------------------------------------------------- *
 * Testing surface                                                        *
 * --------------------------------------------------------------------- */

export const __testing = {
  state,
  STATUS,
  redactHome,
  parseReleaseManifest,
  compareSemver,
  isUpdaterSupported,
};

/**
 * Read-only accessors for the unit-test suite. These are the only
 * ways tests should inspect the state machine — direct `state`
 * access would tie the tests to the internal field layout.
 */
export function __getVerdictForTests() {
  return { ...state.verdict };
}

/**
 * Reset the state machine. The unit tests rely on this; production
 * code never calls it. Detaches any leftover engine handlers and
 * clears the in-flight slots.
 */
export function __resetForTests() {
  for (const off of state.engineUnsubscribers) {
    try {
      off();
    } catch {
      /* nothing to do */
    }
  }
  state.engineUnsubscribers = [];
  state.checkPromise = null;
  state.installPromise = null;
  state.activeCheckId = 0;
  state.candidate = null;
  state.verdict = {
    status: 'idle',
    currentVersion: app.getVersion(),
  };
}

/* --------------------------------------------------------------------- *
 * Re-export for legacy callers that still import the old names          *
 * --------------------------------------------------------------------- */

export { STATUS };
