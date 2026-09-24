/**
 * Kingfisher's update engine: Sparkle, through the native bridge.
 *
 * This module is the single point in the desktop shell that talks to
 * Sparkle. The renderer never imports it; the update service
 * (`update-service.mjs`) is its only caller. It does three things:
 *
 *   1. finds the framework and the bridge — packaged, under the bundle;
 *      unpackaged, under `desktop/vendor` and `desktop/native` — and loads
 *      them, once;
 *   2. starts one `SPUUpdater` with Sparkle's standard user interface and
 *      the flags below, and says whether Sparkle accepted the host bundle;
 *   3. turns the bridge's `(name, json)` events into listeners the service
 *      subscribes to.
 *
 * ## The flags
 *
 * Every one is set in `bridge.mm` where the updater is created, and the
 * two that matter most are also in Info.plist (`electron-builder.yml`):
 *
 *   automaticallyChecksForUpdates = NO   SUEnableAutomaticChecks = false
 *   automaticallyDownloadsUpdates = NO   SUAllowsAutomaticUpdates = false
 *   sendsSystemProfile = NO
 *   updaterShouldPromptForPermissionToCheckForUpdates → NO
 *
 * A check happens when the person asks (the menu) or once, quietly, at
 * launch (`checkForUpdateInformation`, which shows nothing and downloads
 * nothing). Bytes leave the machine only after *Install Update* in
 * Sparkle's own window. None of these is Sparkle's default; a maintainer
 * who flips one needs a reason that survives the next security review.
 *
 * ## What Sparkle verifies
 *
 * The archive's EdDSA signature against `SUPublicEDKey` in Info.plist —
 * the key in `desktop/sparkle.json` — and, because the running bundle is
 * Developer ID signed, that the new bundle's Apple code signature matches
 * it. An update signed by anyone else fails before it is installed.
 *
 * ## Where the feed comes from
 *
 * `SUFeedURL` in Info.plist, baked by the build from
 * `src/release/public-urls.ts`. The staging harnesses override it with
 * `KINGFISHER_UPDATER_FEED_URL`, which only the launcher in
 * `scripts/desktop-lib` sets; a packaged application on a person's Mac
 * never sees the variable.
 *
 * ## Events
 *
 * The bridge emits these names, each with a JSON payload the delegate
 * assembled (`bridge.mm`):
 *
 *   checking, appcast-loaded, found, not-found, choice, will-download,
 *   did-download, download-failed, download-cancelled, will-extract,
 *   did-extract, will-install, postpone-relaunch, will-relaunch,
 *   will-install-on-quit, aborted, finished, modal-alert, session-finished
 *
 * `EVENTS` below is the list, and `sparkle-updater.test.mjs` checks that
 * the bridge source emits every one of them and nothing else.
 */

import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { app } from 'electron';

import { log } from './log.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require_ = createRequire(import.meta.url);

/** The event names the bridge emits. */
export const EVENTS = Object.freeze([
  'checking',
  'appcast-loaded',
  'found',
  'not-found',
  'choice',
  'will-download',
  'did-download',
  'download-failed',
  'download-cancelled',
  'will-extract',
  'did-extract',
  'will-install',
  'postpone-relaunch',
  'will-relaunch',
  'will-install-on-quit',
  'aborted',
  'finished',
  'modal-alert',
  'session-finished',
]);

/**
 * Where the pieces are.
 *
 * Packaged: the framework is under Contents/Frameworks, where electron-builder
 * put it from `extraFiles` and where it was signed and notarised with the
 * rest of the bundle; the bridge is unpacked from the asar (`asarUnpack`)
 * because a shared library cannot be loaded from inside an archive.
 * Unpackaged: the vendored framework and the locally built bridge.
 */
export function resolveSparkle({
  packaged = app.isPackaged,
  resourcesPath = process.resourcesPath,
  here = HERE,
} = {}) {
  if (packaged) {
    const contents = path.resolve(resourcesPath, '..');
    return {
      framework: path.join(contents, 'Frameworks', 'Sparkle.framework'),
      bridge: path.join(
        resourcesPath,
        'app.asar.unpacked',
        'native',
        'sparkle',
        'build',
        'kingfisher-sparkle.node',
      ),
    };
  }
  const desktop = path.resolve(here, '..');
  return {
    framework: path.join(desktop, 'vendor', 'Sparkle', 'Sparkle.framework'),
    bridge: path.join(desktop, 'native', 'sparkle', 'build', 'kingfisher-sparkle.node'),
  };
}

const state = {
  /** The loaded bridge, or null before `start()`. */
  bridge: null,
  /** Sparkle's version as the framework reports it. */
  sparkleVersion: null,
  /** Whether Sparkle accepted the host bundle and is running. */
  started: false,
  /** Why it is not, in a sentence. */
  unavailableReason: null,
  /** Listeners per event name. */
  listeners: new Map(EVENTS.map((name) => [name, new Set()])),
};

function dispatch(name, json) {
  let payload = {};
  try {
    payload = JSON.parse(json);
  } catch {
    payload = { raw: json };
  }
  const set = state.listeners.get(name);
  if (!set) {
    log('update', `sparkle emitted an unknown event: ${name}`);
    return;
  }
  for (const listener of set) {
    try {
      listener(payload);
    } catch (err) {
      log('update', `listener for ${name} threw: ${String(err?.message ?? err)}`);
    }
  }
}

/**
 * Load the bridge and start the updater. Idempotent; returns what happened.
 *
 * Not starting is a normal outcome, reported rather than thrown: a checkout
 * (`electron .`, inside Electron.app) is refused here before Sparkle is
 * asked, and off macOS there is no framework at all. `platform` is an input,
 * as `packaged` is, so each refusal can be asserted on any runner.
 */
export function start({
  feedURL = null,
  resolve = resolveSparkle,
  packaged = app.isPackaged,
  platform = process.platform,
} = {}) {
  if (state.bridge) return describe();
  if (platform !== 'darwin') {
    state.unavailableReason = 'Updates are delivered through Sparkle, which is macOS only.';
    return describe();
  }
  if (!packaged) {
    /*
      Never in a checkout. `electron .` runs inside Electron.app, and Sparkle
      accepts that bundle as its host — it is code signed and names no feed —
      so the updater would start, and a click would end in Sparkle's own
      "Update Error" alert; with a feed it would try to replace Electron.app.
      The packaged application is the only host Sparkle is ever given.
    */
    state.unavailableReason =
      'This is a development checkout running inside Electron.app; a packaged Kingfisher carries Sparkle, its feed and its key.';
    log('update', state.unavailableReason);
    return describe();
  }
  const where = resolve();
  const executable = path.join(where.framework, 'Sparkle');
  if (!existsSync(where.bridge) || !existsSync(executable)) {
    state.unavailableReason = `Sparkle is not in this build (${existsSync(where.bridge) ? executable : where.bridge} is missing).`;
    log('update', state.unavailableReason);
    return describe();
  }
  try {
    const bridge = require_(where.bridge);
    const loaded = bridge.load(executable);
    state.sparkleVersion = loaded.version;
    const result = bridge.start(dispatch, feedURL ? { feedURL } : {});
    state.bridge = bridge;
    if (result.ok) {
      state.started = true;
      log(
        'update',
        `Sparkle ${loaded.version} started · feed ${bridge.feedURL() ?? '(none)'}${feedURL ? ' (override)' : ''}`,
      );
    } else {
      state.unavailableReason = result.error;
      log('update', `Sparkle ${loaded.version} did not start: ${result.error}`);
    }
  } catch (err) {
    state.unavailableReason = String(err?.message ?? err);
    log('update', `Sparkle bridge failed: ${state.unavailableReason}`);
  }
  return describe();
}

export function describe() {
  return {
    started: state.started,
    sparkleVersion: state.sparkleVersion,
    reason: state.unavailableReason,
    feedURL: state.started ? state.bridge.feedURL() : null,
  };
}

/** Whether a check can be made in this build at all. */
export function isUpdaterSupported() {
  return state.started;
}

/** A user-initiated check: Sparkle shows its windows. */
export function checkForUpdates() {
  if (!state.started) throw new Error(state.unavailableReason ?? 'The updater is not running.');
  state.bridge.checkForUpdates();
}

/** A quiet check: one request, no window, no download; the delegate hears the answer. */
export function checkForUpdateInformation() {
  if (!state.started) throw new Error(state.unavailableReason ?? 'The updater is not running.');
  state.bridge.checkForUpdateInformation();
}

/** Sparkle's own answer to "may the menu item be enabled". */
export function canCheckForUpdates() {
  return state.started ? state.bridge.canCheckForUpdates() : false;
}

export function sessionInProgress() {
  return state.started ? state.bridge.sessionInProgress() : false;
}

/** Let the postponed install proceed: the save barrier passed. */
export function resumeRelaunch() {
  return state.started ? state.bridge.resumeRelaunch() : false;
}

export function hasPostponedRelaunch() {
  return state.started ? state.bridge.hasPostponedRelaunch() : false;
}

export function on(event, listener) {
  const set = state.listeners.get(event);
  if (!set) throw new Error(`Unknown Sparkle event: ${event}`);
  set.add(listener);
  return () => set.delete(listener);
}

/**
 * The directory the relaunch handoff is written to (`relaunch-profile.mjs`).
 *
 * Not Sparkle's cache — that is Sparkle's, under the bundle identifier — but
 * the same directory the previous engine used, so a 1.1.6 being replaced by
 * the first Sparkle release and a Sparkle release being replaced by the
 * next one both hand their profile over the same way.
 */
export function updaterCacheDir() {
  return path.join(app.getPath('cache'), `${app.getName()}-updater`);
}

/** Test seam. */
export function __resetForTests() {
  state.bridge = null;
  state.sparkleVersion = null;
  state.started = false;
  state.unavailableReason = null;
  for (const set of state.listeners.values()) set.clear();
}

/** Test seam: feed a bridge event as the native side would. */
export function __dispatchForTests(name, payload) {
  dispatch(name, JSON.stringify(payload ?? {}));
}
