/**
 * The Check-for-Updates dialog window.
 *
 * One small, modal-ish BrowserWindow that the main process opens on
 * demand. The window is *not* a Kingfisher app surface — it loads a
 * self-contained HTML page that talks to the main process through a
 * preload that exposes only the four channels the dialog needs.
 *
 * The window is closed by:
 *   - the user pressing Escape or clicking the close button,
 *   - the main process tearing down on quit,
 *   - a `cancel` action when a download is mid-flight.
 *
 * There is at most one update window at a time. A second call to
 * `open()` focuses the existing window instead of opening a duplicate.
 */

import { BrowserWindow, app, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Width and height chosen to feel like a Kingfisher dialog, not a window. */
const DIALOG_WIDTH = 400;
const DIALOG_HEIGHT = 206;

/**
 * The channels the dialog's preload speaks. Named here as well as in
 * `dialogs/update-preload.cjs` because the two halves have to agree, and
 * `update-window.test.mjs` reads the preload and checks that every channel it
 * exposes has a handler here. Until that test existed, none of them did:
 * every packaged build from Phase 35 to Phase 45 opened a dialog whose Check
 * for Updates button answered "No handler registered for
 * 'kingfisher-update:dispatch'", whose Close button did nothing, and whose
 * initial verdict never arrived.
 */
export const CHANNELS = Object.freeze({
  initial: 'kingfisher-update:initial',
  verdict: 'kingfisher-update:verdict',
  dispatch: 'kingfisher-update:dispatch',
  close: 'kingfisher-update:close',
});

/** @type {BrowserWindow | null} */
let window = null;

let ipcRegistered = false;

/**
 * Answer the dialog. Registered once, on first open, and not per window:
 * `ipcMain.handle` refuses a second handler on the same channel, and a
 * dialog that is closed and reopened is a new window on the same channels.
 */
export function registerIpc(ipc = ipcMain) {
  if (ipcRegistered) return;
  ipcRegistered = true;
  ipc.handle(CHANNELS.initial, (event) => {
    if (!isDialog(event.sender)) return null;
    // The dialog renders a verdict; the initial one is whatever the service
    // last said, with the version filled in for a dialog opened before any check.
    return { currentVersion: app.getVersion(), ...lastVerdict };
  });
  ipc.handle(CHANNELS.dispatch, async (event, action) => {
    // Only the dialog may drive the updater; the main window has its own
    // typed surface for the two things it is allowed to ask for.
    if (!isDialog(event.sender)) return { ok: false };
    if (typeof action !== 'string' || action.length > 32) return { ok: false };
    await dispatchAction(action);
    return { ok: true };
  });
  ipc.on(CHANNELS.close, (event) => {
    if (isDialog(event.sender)) close();
  });
}

/** Is this sender the dialog this module opened? */
function isDialog(sender) {
  return Boolean(window && !window.isDestroyed() && sender === window.webContents);
}

/** @type {((action: string) => Promise<void> | void) | null} */
let dispatchHandler = null;

/** The latest verdict the dialog is displaying, kept so a re-open does not blank. */
let lastVerdict = { status: 'idle' };

export function setDispatchHandler(handler) {
  dispatchHandler = handler;
}

export function sendVerdict(verdict) {
  lastVerdict = verdict ?? { status: 'idle' };
  if (!window || window.isDestroyed()) return;
  window.webContents.send(CHANNELS.verdict, lastVerdict);
}

export function getLastVerdict() {
  return lastVerdict;
}

export function hasWindow() {
  return Boolean(window && !window.isDestroyed());
}

/**
 * Open the update dialog. `parent` is the main application window, so
 * the dialog floats above it and macOS sheets it in the right place.
 */
export async function open({ parent, onClose, onAction } = {}) {
  if (window && !window.isDestroyed()) {
    window.focus();
    return;
  }
  if (typeof onAction === 'function') dispatchHandler = onAction;
  registerIpc();
  window = new BrowserWindow({
    width: DIALOG_WIDTH,
    height: DIALOG_HEIGHT,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    title: 'Kingfisher Update',
    useContentSize: true,
    backgroundColor: '#1c1c20',
    parent: parent ?? undefined,
    modal: false,
    // Native titlebar owns the traffic lights and drag region. Content starts
    // below it, so no renderer inset can collide with the system controls.
    titleBarStyle: 'default',
    webPreferences: {
      preload: path.join(HERE, 'dialogs', 'update-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      additionalArguments: [`--kingfisher-app-version=${app.getVersion()}`],
    },
  });
  await window.loadFile(path.join(HERE, 'dialogs', 'update.html'));
  window.show();
  window.on('closed', () => {
    window = null;
    if (parent && !parent.isDestroyed()) parent.focus();
    if (typeof onClose === 'function') onClose();
  });
}

/**
 * Run an action triggered by the dialog's buttons. The action string is
 * whatever the dialog sent on `kingfisher-update:dispatch`. If no
 * handler is registered the action is a no-op.
 */
export async function dispatchAction(action) {
  if (!dispatchHandler) return;
  await dispatchHandler(action);
}

export function close() {
  if (window && !window.isDestroyed()) {
    window.close();
  }
}

/** Test seam: forget that handlers were registered, so a fresh mock can be wired. */
export function __resetForTests() {
  ipcRegistered = false;
  window = null;
  dispatchHandler = null;
  lastVerdict = { status: 'idle' };
}
