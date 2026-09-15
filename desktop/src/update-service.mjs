/**
 * The desktop update service.
 *
 * One canonical public surface, three callers, and a single engine. The
 * application menu, the Settings → Application panel and the command
 * palette all end up in `check()`; the launch-time quiet check ends up in
 * `checkQuietly()`; `subscribe`/`getState` are how the menu label and the
 * Settings panel follow along. Nothing else in the shell is allowed to do
 * an update.
 *
 * ## One engine
 *
 * The engine is Sparkle (`sparkle-updater.mjs`, `native/sparkle/bridge.mm`).
 * Sparkle owns every window a person sees — "a new version is available"
 * with the release notes, the download progress, "ready to install", the
 * errors — and the installation: it verifies the archive's EdDSA signature
 * and the new bundle's Apple code signature, replaces the application in
 * place, and relaunches it. This service does not draw and does not
 * install. What it adds is what Sparkle cannot know:
 *
 *   - the **verdict**, one small object the menu and the Settings panel
 *     render, kept in step with Sparkle's delegate callbacks;
 *   - the **save barrier**: when Sparkle is about to terminate the
 *     application for the install, the renderer is asked to confirm every
 *     write is on disk, and the relaunch is released only on `ok: true`
 *     (`postpone-relaunch` → `resumeRelaunch()`);
 *   - the **profile handoff**: the relaunch arrives with no arguments, so
 *     the profile is named for it (`relaunch-profile.mjs`);
 *   - the **channel**: a preview build makes no request and says so;
 *   - the **post-update notice** on the next launch.
 *
 * ## State machine
 *
 *   idle ─check─► checking
 *   checking ─same─► up-to-date
 *   checking ─newer─► available
 *   available ─Install Update (Sparkle)─► downloading ─► verifying ─► ready
 *   ready ─Install and Relaunch (Sparkle)─► installing ─► waiting-for-save
 *   waiting-for-save ─ok─► installing ─► restarting
 *   waiting-for-save ─fail─► failed
 *   any ─error─► unable-to-check | failed
 *
 * The strings are `STATUS` in `update-protocol.mjs`; the menu's labels are
 * keyed on them (`menu.mjs`), and `update-service.test.mjs` drives the
 * transitions with the bridge's own event names.
 *
 * ## Manual, plus one quiet look
 *
 * The service never runs on a timer. It checks when the person clicks the
 * menu, and once at launch through Sparkle's information-only check, which
 * makes one request, shows nothing, downloads nothing and, if a newer
 * release exists, relabels the menu item. No telemetry: nothing is logged
 * beyond stage names a person can reproduce.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { app, dialog, shell } from 'electron';

import { log } from './log.mjs';
import { isDowngrade, writeRelaunchProfile } from './relaunch-profile.mjs';
import { DEFAULT_TIMEOUT_MS as SAVE_BARRIER_TIMEOUT_MS } from './save-barrier.mjs';
import { STATUS } from './update-protocol.mjs';
import * as sparkle from './sparkle-updater.mjs';

const REDACTED_PATH_TOKEN = '<cache>';

/* --------------------------------------------------------------------- *
 * State                                                                  *
 * --------------------------------------------------------------------- */

const initialVerdict = () => ({
  status: STATUS.IDLE,
  currentVersion: app.getVersion(),
});

const state = {
  /** The most recent verdict; the dialog and the menu both read this. */
  verdict: initialVerdict(),
  /** The update Sparkle last reported, as the bridge described it. */
  candidate: null,
  /** The listener that receives every verdict. */
  listener: null,
  /** The save barrier the shell registered with `startUpdater`. */
  onSaveBarrier: null,
  /** Whether the shell is already on its way out. */
  isQuitting: () => false,
  /** The main window, for the three message boxes this service shows as sheets. */
  parentWindow: () => null,
  /** Unsubscribers for the bridge events, so tests can start over. */
  unsubscribers: [],
  /** Whether the check in flight was the quiet launch-time one. */
  quietCheck: false,
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
  // Replay the current verdict so a freshly subscribed panel does not
  // start in the dark.
  listener(state.verdict);
  return () => {
    if (state.listener === listener) state.listener = null;
  };
}

export function getState() {
  return state.verdict;
}

/* --------------------------------------------------------------------- *
 * The channel                                                            *
 * --------------------------------------------------------------------- */

/**
 * Which channel this build is on, as `desktop/scripts/build.mjs` recorded
 * it. `main.mjs` calls this once at launch. Unconfigured means stable, which
 * is the conservative reading: a stable build consults the feed and is
 * offered only a strictly newer build.
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

/* --------------------------------------------------------------------- *
 * Start                                                                  *
 * --------------------------------------------------------------------- */

/**
 * Start the engine and bind its events to the verdict. Called once from
 * `main.mjs` when the application is ready; returns what Sparkle said.
 *
 * `onSaveBarrier` is the shell's barrier (`save-barrier.mjs` through
 * `main.mjs`); `feedURL` is the staging override, from the environment,
 * and null in production.
 */
export function startUpdater({
  onSaveBarrier = null,
  isQuitting = () => false,
  parentWindow = () => null,
  feedURL = null,
} = {}) {
  state.onSaveBarrier = onSaveBarrier;
  state.isQuitting = isQuitting;
  state.parentWindow = parentWindow;
  const started = sparkle.start({ feedURL });
  if (started.started) bindEngine();
  return started;
}

export function describeEngine() {
  return sparkle.describe();
}

function describeCandidate(item) {
  if (!item) return {};
  return {
    latestVersion: item.displayVersion || item.version || null,
    latestBuild: item.version ?? null,
    releaseDate: item.date ?? null,
    sizeBytes:
      typeof item.contentLength === 'number' && item.contentLength > 0 ? item.contentLength : null,
    releaseName: item.title ?? null,
    releaseNotesUrl: item.releaseNotesURL ?? null,
  };
}

function bindEngine() {
  for (const off of state.unsubscribers) off();
  state.unsubscribers = [];
  const bind = (event, handler) => state.unsubscribers.push(sparkle.on(event, handler));

  bind('checking', ({ check }) => {
    state.quietCheck = check === 'information';
    emit({ status: STATUS.CHECKING, currentVersion: app.getVersion(), quiet: state.quietCheck });
  });

  bind('found', (item) => {
    state.candidate = item;
    log(
      'update',
      `update found: ${item.displayVersion ?? '?'} (build ${item.version ?? '?'})${state.quietCheck ? ' — quiet check, menu relabelled' : ''}`,
    );
    emit({
      status: STATUS.AVAILABLE,
      currentVersion: app.getVersion(),
      ...describeCandidate(item),
    });
  });

  bind('not-found', (payload) => {
    // Sparkle says why; the two a person can act on are named in the log.
    const reason = payload?.noUpdateReason;
    const why =
      reason === 2
        ? 'this build is newer than the feed'
        : reason === 3
          ? 'the update needs a newer macOS'
          : reason === 1
            ? 'on the latest version'
            : 'no newer update';
    log('update', `no update: ${why}`);
    state.candidate = null;
    emit({ status: STATUS.UP_TO_DATE, currentVersion: app.getVersion(), reason: why });
  });

  bind('choice', ({ choice, stage }) => {
    log('update', `person chose ${choice} (${stage})`);
    if (choice === 'skip') {
      // "Skip This Version": Sparkle will not offer it again; the menu goes
      // back to its plain label rather than announcing an update the
      // person declined.
      state.candidate = null;
      emit({ status: STATUS.IDLE, currentVersion: app.getVersion() });
    } else if (choice === 'dismiss' && stage !== 'installing') {
      // "Remind Me Later": still available, and the menu says so.
      emit({
        status: STATUS.AVAILABLE,
        currentVersion: app.getVersion(),
        ...describeCandidate(state.candidate),
      });
    }
  });

  bind('will-download', ({ item }) => {
    state.candidate = item ?? state.candidate;
    emit({
      status: STATUS.DOWNLOADING,
      currentVersion: app.getVersion(),
      ...describeCandidate(state.candidate),
    });
  });

  bind('did-download', () => {
    emit({ ...state.verdict, status: STATUS.DOWNLOADED });
  });

  bind('download-failed', ({ error }) => {
    log('update', `download failed: ${error?.description ?? 'unknown'}`);
    emit({
      status: STATUS.FAILED,
      currentVersion: app.getVersion(),
      reason: describeEngineError(error),
    });
  });

  bind('download-cancelled', () => {
    log('update', 'download cancelled');
    emit({
      status: STATUS.AVAILABLE,
      currentVersion: app.getVersion(),
      ...describeCandidate(state.candidate),
    });
  });

  bind('will-extract', () => {
    emit({ ...state.verdict, status: STATUS.VERIFYING });
  });

  bind('did-extract', () => {
    emit({ ...state.verdict, status: STATUS.READY });
  });

  bind('will-install', () => {
    emit({ ...state.verdict, status: STATUS.INSTALLING });
  });

  bind('postpone-relaunch', () => {
    void releaseRelaunch();
  });

  bind('will-relaunch', () => {
    // Belt and braces: the handoff was written before the relaunch was
    // released; write it again now, in case the release and the relaunch
    // were far enough apart for the first to age out.
    writeRelaunchProfile(sparkle.updaterCacheDir(), app.getPath('userData'));
    emit({ ...state.verdict, status: STATUS.RESTARTING });
  });

  bind('will-install-on-quit', ({ item }) => {
    log('update', `update ${item?.displayVersion ?? ''} installs when Kingfisher quits`);
    // The relaunch after an install-on-quit opens the default profile
    // unless told otherwise; tell it.
    writeRelaunchProfile(sparkle.updaterCacheDir(), app.getPath('userData'));
  });

  bind('aborted', (error) => {
    const code = error?.code;
    if (code === SPARKLE_ERROR.noUpdate) {
      // Already reported through not-found.
      return;
    }
    if (code === SPARKLE_ERROR.installationCanceled) {
      log('update', 'installation cancelled by the person');
      emit({
        status: STATUS.AVAILABLE,
        currentVersion: app.getVersion(),
        ...describeCandidate(state.candidate),
      });
      return;
    }
    log(
      'update',
      `sparkle aborted: [${error?.domain ?? '?'} ${code ?? '?'}] ${error?.description ?? ''}`,
    );
    const checkPhase = state.verdict.status === STATUS.CHECKING;
    emit({
      status: checkPhase ? STATUS.UNABLE : STATUS.FAILED,
      currentVersion: app.getVersion(),
      reason: checkPhase ? describeCheckFailure(error) : describeEngineError(error),
    });
  });

  bind('finished', ({ check, error }) => {
    log('update', `update cycle finished (${check})${error ? `: ${error.description ?? ''}` : ''}`);
    if (state.verdict.status === STATUS.CHECKING) {
      // A cycle that ended without a verdict — Sparkle found nothing to
      // say, or the person closed its window. The menu must not stay on
      // "Checking…" forever.
      emit({ status: STATUS.IDLE, currentVersion: app.getVersion() });
    }
  });
}

/**
 * Sparkle's error codes that this service treats specially (SUErrors.h).
 * The names are Sparkle's; the numbers are its ABI.
 */
export const SPARKLE_ERROR = Object.freeze({
  noPublicKey: 1,
  appcastParse: 1000,
  noUpdate: 1001,
  appcast: 1002,
  runningFromDiskImage: 1003,
  download: 2001,
  signature: 3001,
  validation: 3002,
  installationCanceled: 4007,
});

/* --------------------------------------------------------------------- *
 * check                                                                  *
 * --------------------------------------------------------------------- */

/**
 * One sentence a person can act on, from whatever Sparkle reported about a
 * check that did not complete. Sparkle already showed its own alert for a
 * user-initiated check; this is what the Settings panel and the log say.
 */
export function describeCheckFailure(error) {
  const code = error?.code;
  const message = String(error?.description ?? error?.message ?? error ?? '');
  if (code === SPARKLE_ERROR.appcast || code === SPARKLE_ERROR.appcastParse) {
    return 'The release feed could not be read. The download page always has the newest build.';
  }
  if (code === SPARKLE_ERROR.runningFromDiskImage) {
    return 'Kingfisher is running from the disk image. Drag it to Applications and open it from there to update.';
  }
  if (
    /ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|offline|not connected|could not connect|network connection was lost/i.test(
      message,
    )
  ) {
    return 'The release host could not be reached. Check the connection and try again.';
  }
  if (/403|429|rate limit/i.test(message)) {
    return 'The release host refused the request for now. Try again in a few minutes.';
  }
  const first = redactHome(message.split('\n')[0]).replace(/\s+/g, ' ').trim();
  return first.length > 200 ? `${first.slice(0, 197)}…` : first || 'The check did not complete.';
}

/** The same, for a download or install Sparkle gave up on. */
export function describeEngineError(error) {
  const code = error?.code;
  if (code === SPARKLE_ERROR.signature || code === SPARKLE_ERROR.validation) {
    return 'The downloaded update is not signed by Kingfisher and was not installed.';
  }
  if (code === SPARKLE_ERROR.download) {
    return 'The update could not be downloaded. Check the connection and try again.';
  }
  return describeCheckFailure(error);
}

/**
 * The person asked. Sparkle shows its windows; the verdict follows.
 *
 * A preview build makes no request and answers from what it is. A build
 * without Sparkle — a developer checkout — says so in a message box, the
 * way the old dialog said "the updater is disabled in this build".
 */
export async function check() {
  if (channel.name === 'preview') {
    emit({
      status: STATUS.PREVIEW,
      currentVersion: app.getVersion(),
      build: channel.build,
      downloadUrl: channel.downloadUrl,
    });
    const { response } = await showMessage({
      type: 'info',
      title: 'Kingfisher Update',
      message: `This is Kingfisher ${app.getVersion()}, preview build ${channel.build ?? '?'}.`,
      detail:
        'Preview builds are replaced by downloading the next one from the download page; they do not check a release feed.',
      buttons: channel.downloadUrl ? ['Open Download Page', 'Close'] : ['Close'],
      defaultId: 0,
      cancelId: channel.downloadUrl ? 1 : 0,
    });
    if (channel.downloadUrl && response === 0) void shell.openExternal(channel.downloadUrl);
    return state.verdict;
  }
  if (!sparkle.isUpdaterSupported()) {
    const reason = sparkle.describe().reason ?? 'The updater is not running.';
    emit({ status: STATUS.UNABLE, currentVersion: app.getVersion(), reason });
    await showMessage({
      type: 'info',
      title: 'Kingfisher Update',
      message: 'Updates are not available in this build.',
      detail: `${reason}\n\nA packaged Kingfisher checks the release feed through Sparkle.`,
      buttons: ['Close'],
    });
    return state.verdict;
  }
  if (!sparkle.canCheckForUpdates()) {
    // Sparkle is downloading the feed or an update; a check now would do
    // nothing, and the menu item is disabled for exactly this state.
    log('update', 'check requested while Sparkle is busy; nothing to do');
    return state.verdict;
  }
  // With a window already open — the update found, the progress, the
  // ready-to-install prompt — Sparkle brings it forward rather than
  // starting a second session.
  sparkle.checkForUpdates();
  return state.verdict;
}

/**
 * The quiet look at launch: one request, no window, no download. A found
 * update relabels the menu; anything else is a line in the log.
 */
export function checkQuietly() {
  if (channel.name === 'preview' || !sparkle.isUpdaterSupported()) {
    log(
      'update',
      'quiet check skipped: ' +
        (channel.name === 'preview' ? 'preview build' : 'updater not running'),
    );
    return false;
  }
  if (!sparkle.canCheckForUpdates()) {
    log('update', 'quiet check skipped: a session is in progress');
    return false;
  }
  sparkle.checkForUpdateInformation();
  return true;
}

/* --------------------------------------------------------------------- *
 * The save barrier, at the moment Sparkle wants to relaunch               *
 * --------------------------------------------------------------------- */

/**
 * Sparkle has the update installed-in-waiting and asks to terminate and
 * relaunch. Before it may, the renderer confirms every write is committed;
 * the barrier fails closed on every unexpected path (timeout, no window,
 * transport failure, an explicit `ok: false`). DATA SAFETY > UPDATE
 * CONVENIENCE: a failed barrier leaves Sparkle's install block unrun, tells
 * the person, and the update installs on the next quit instead — Sparkle
 * always installs a staged update when the application terminates.
 */
async function releaseRelaunch() {
  if (state.isQuitting()) {
    // The shell is already stopping its services; the relaunch may go.
    log('update', 'relaunch released: application already quitting');
    writeRelaunchProfile(sparkle.updaterCacheDir(), app.getPath('userData'));
    sparkle.resumeRelaunch();
    return;
  }
  emit({ ...state.verdict, status: STATUS.WAITING_FOR_SAVE });
  let barrier = { ok: true, reason: 'no-barrier' };
  if (typeof state.onSaveBarrier === 'function') {
    try {
      barrier = await state.onSaveBarrier({ timeoutMs: SAVE_BARRIER_TIMEOUT_MS });
    } catch (err) {
      barrier = { ok: false, reason: 'threw', detail: String(err?.message ?? err) };
    }
  }
  if (!barrier?.ok) {
    const reason = humanizeSaveBarrierFailure(barrier);
    log('update', `relaunch refused: save barrier failed (${barrier?.reason ?? 'unknown'})`);
    emit({ status: STATUS.FAILED, currentVersion: app.getVersion(), reason });
    await showMessage({
      type: 'warning',
      title: 'Kingfisher Update',
      message: 'The update was not installed.',
      detail: `${reason}\n\nThe update is downloaded and verified. Quit Kingfisher to install it, or run Check for Updates again.`,
      buttons: ['OK'],
    });
    return;
  }
  // The relaunch arrives with no arguments; name the profile for it.
  if (!writeRelaunchProfile(sparkle.updaterCacheDir(), app.getPath('userData'))) {
    log('update', 'relaunch profile handoff not written; the relaunch opens the default profile');
  }
  emit({ ...state.verdict, status: STATUS.INSTALLING });
  log('update', 'save barrier passed; relaunch released');
  if (!sparkle.resumeRelaunch()) {
    log('update', 'no postponed relaunch to release');
  }
}

/* --------------------------------------------------------------------- *
 * The post-update notice                                                 *
 * --------------------------------------------------------------------- */

/*
  One small file in the profile, `kingfisher-update-state.json`:

    lastLaunchedVersion   the version that last ran on this profile
    noticeFrom            the version an update replaced, until dismissed
    acknowledgedVersion   the version whose notice was dismissed

  A launch whose version is newer than the last one recorded is an update
  and sets `noticeFrom`; a fresh profile has no last version and gets no
  notice — "Kingfisher was updated to 1.1.0" on a first install was the
  first version's behaviour. The notice stays pending across launches until
  the person dismisses it.

  A launch whose version is *older* than the last one recorded is a
  downgrade, and is recorded without a notice. "Kingfisher was updated to
  1.1.4. Previously 1.1.6." is what the owner read on 2026-09-14 after a
  harness had opened their profile with a newer build for eight seconds
  (relaunch-profile.mjs); a sentence that calls going backwards an update
  is wrong whatever caused it.
*/

const ACKNOWLEDGED_VERSION_KEY = 'kingfisher.acknowledgedUpdateVersion';
const STATE_FILE = 'kingfisher-update-state.json';

function stateFile() {
  return `${app.getPath('userData')}/${STATE_FILE}`;
}

function readState() {
  try {
    const file = stateFile();
    if (!existsSync(file)) return {};
    const body = JSON.parse(readFileSync(file, 'utf8'));
    return body && typeof body === 'object' ? body : {};
  } catch {
    return {};
  }
}

function writeState(next) {
  try {
    writeFileSync(stateFile(), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  } catch (err) {
    log('update', `update state not written: ${String(err?.message ?? err)}`);
  }
}

/**
 * Record this launch. Returns the notice to show, or null: the version an
 * update replaced, if one did and it has not been dismissed.
 */
export function recordLaunch(currentVersion = app.getVersion()) {
  const state = readState();
  const previous = state.lastLaunchedVersion ?? null;
  const next = { ...state, lastLaunchedVersion: currentVersion };
  if (previous && previous !== currentVersion) {
    if (isDowngrade(previous, currentVersion)) {
      log('update', `launched ${currentVersion} on a profile last run by ${previous}: no notice`);
      delete next.noticeFrom;
    } else {
      next.noticeFrom = previous;
      delete next[ACKNOWLEDGED_VERSION_KEY];
    }
  }
  if (JSON.stringify(next) !== JSON.stringify(state)) writeState(next);
  if (next.noticeFrom && next[ACKNOWLEDGED_VERSION_KEY] !== currentVersion) {
    return { version: currentVersion, previousVersion: next.noticeFrom };
  }
  return null;
}

/** Whether the notice for this version has been dismissed. */
export function hasAcknowledgedUpdate(currentVersion = app.getVersion()) {
  const state = readState();
  return !state.noticeFrom || state[ACKNOWLEDGED_VERSION_KEY] === currentVersion;
}

/** The person dismissed the notice: never again for this version. */
export function acknowledgeUpdate(currentVersion = app.getVersion()) {
  const state = readState();
  const next = {
    ...state,
    [ACKNOWLEDGED_VERSION_KEY]: currentVersion,
    at: new Date().toISOString(),
  };
  delete next.noticeFrom;
  writeState(next);
}

/* --------------------------------------------------------------------- *
 * Helpers                                                                *
 * --------------------------------------------------------------------- */

/**
 * A message box as a sheet on the main window when there is one. Without a
 * parent, macOS runs the box app-modal on the main thread, and the shell
 * answers nothing — not the renderer's IPC, not a harness — until it is
 * dismissed; a sheet blocks only the window it hangs from.
 */
function showMessage(options) {
  let parent = null;
  try {
    parent = state.parentWindow();
  } catch {
    parent = null;
  }
  if (parent && !parent.isDestroyed?.()) return dialog.showMessageBox(parent, options);
  return dialog.showMessageBox(options);
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
 * Translate a `BarrierResult` failure into a sentence the person can act
 * on. The raw reason is preserved in the log for diagnostics.
 */
export function humanizeSaveBarrierFailure(barrier) {
  const reason = barrier?.reason ?? 'unknown';
  const detail = barrier?.detail ? ` (${barrier.detail})` : '';
  switch (reason) {
    case 'pending-writes':
      return (
        'Kingfisher could not safely finish saving your work. The update was not installed.' +
        detail
      );
    case 'write-failed':
      return (
        'Kingfisher could not commit a recent change to local storage. The update was not installed. ' +
        'Try again after closing the file that may be locked, or after freeing disk space.' +
        detail
      );
    case 'timeout':
      return (
        'Kingfisher could not confirm that your work finished saving. The update was not installed.' +
        detail
      );
    case 'renderer-unavailable':
      return (
        'Kingfisher could not reach the application window to confirm your work. The update was not installed.' +
        detail
      );
    default:
      return (
        'Kingfisher could not safely finish saving your work. The update was not installed.' +
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
  bindEngine,
  releaseRelaunch,
};

export function __getVerdictForTests() {
  return { ...state.verdict };
}

export function __resetForTests() {
  for (const off of state.unsubscribers) off();
  state.unsubscribers = [];
  state.candidate = null;
  state.onSaveBarrier = null;
  state.isQuitting = () => false;
  state.quietCheck = false;
  state.verdict = { status: 'idle', currentVersion: app.getVersion() };
  channel.name = 'stable';
  channel.build = null;
  channel.downloadUrl = null;
}

export { STATUS };
